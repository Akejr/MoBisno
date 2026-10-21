/**
 * GET /api/payment-status?kind=store|plan&id=<uuid> — estado de um pagamento.
 *
 * É a **fonte de verdade** da venda, e o que o «Já paguei — verificar» e a
 * página de retorno consultam. Lê o registo pelo id interno (nunca por dados do
 * navegador), pergunta ao fornecedor enquanto o pagamento está aberto, e
 * confirma de forma idempotente: chamar isto cem vezes depois de pago não abate
 * stock, não soma dias e não manda o email ao Dono outra vez.
 *
 * ## A janela de ~5 minutos
 *
 * O fornecedor só responde ao estado durante cerca de cinco minutos a contar da
 * criação da cobrança; depois devolve «não encontrado», **pago ou não**. Isso
 * não é uma falha nem um «não pagou»: o Multicaixa Express resolve-se dentro da
 * janela, e uma Referência paga horas depois é confirmada pelo callback
 * autenticado (`api/payment-webhook.js`). Por isso, fora da janela, o pagamento
 * fica como está e a resposta diz-lo (`window: "closed"`), para a página poder
 * explicar em vez de mostrar um erro.
 *
 * Enquanto o pagamento está aberto, a resposta traz também a **entidade e a
 * referência** do ATM, assim que o fornecedor as emite (só aparecem segundos
 * depois de o cliente escolher Referência).
 *
 * Sem fornecedor ligado responde `503 PAYMENTS_UNAVAILABLE`.
 */
import { admin, send, asOrderStatus } from "./_shared.js";
import { getPaymentProvider, PAYMENTS_UNAVAILABLE } from "./_provider.js";
import { applyProviderStatus } from "./_payments.js";
import { fulfilPaidOrder } from "./_fulfil.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Colunas lidas de cada tabela (as de referência só existem nas encomendas). */
const COLUNAS = {
  orders: "id, status, method, provider_ref, invoice_url, invoice_status, reference_entity, reference_number, reference_due_date",
  plan_payments: "id, status, method, provider_ref, invoice_url",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Método não permitido." });

  const provider = getPaymentProvider();
  if (!provider) return send(res, 503, PAYMENTS_UNAVAILABLE);

  const db = admin();
  if (!db) return send(res, 500, { success: false, error: "Servidor por configurar.", code: "SERVER_NOT_CONFIGURED" });

  const q = req.query || {};
  const kind = q.kind === "plan" ? "plan" : "store";
  const id = String(q.id || "");
  if (!UUID.test(id)) return send(res, 400, { success: false, error: "Pagamento não identificado.", code: "MISSING_ID" });

  const table = kind === "plan" ? "plan_payments" : "orders";
  try {
    const { data: row } = await db.from(table).select(COLUNAS[table]).eq("id", id).maybeSingle();
    if (!row) return send(res, 404, { success: false, error: "Pagamento não encontrado.", code: "NOT_FOUND" });

    /** A referência do ATM que já está gravada, se houver. */
    const refGravada = row.reference_number
      ? { entity: row.reference_entity, number: row.reference_number, dueDate: row.reference_due_date }
      : null;

    if (row.status !== "open" || !row.provider_ref) {
      // Já resolvido. Numa encomenda paga, é também a oportunidade de voltar a
      // tentar a factura que tenha falhado (e de reler o estado na AGT).
      if (kind === "store" && row.status === "paid" && row.invoice_status !== "validated") {
        await fulfilPaidOrder(db, id);
        const { data: fresco } = await db.from("orders").select("invoice_url, invoice_status, invoice_number").eq("id", id).maybeSingle();
        return send(res, 200, {
          success: true, status: row.status, method: row.method,
          invoiceUrl: fresco?.invoice_url ?? row.invoice_url ?? null,
          invoiceStatus: fresco?.invoice_status ?? null,
          invoiceNumber: fresco?.invoice_number ?? null,
          reference: refGravada,
        });
      }
      return send(res, 200, {
        success: true, status: row.status, method: row.method,
        invoiceUrl: row.invoice_url ?? null, invoiceStatus: row.invoice_status ?? null, reference: refGravada,
      });
    }

    const r = await provider.getStatus(row.provider_ref);

    // Fora da janela: o pagamento fica como está. Pode ter sido pago — é o
    // callback autenticado que o dirá.
    if (r?.notFound) {
      return send(res, 200, {
        success: true, status: "open", window: "closed", method: row.method,
        reference: refGravada, invoiceUrl: row.invoice_url ?? null,
        message: "Ainda não recebemos a confirmação do banco. Se já pagou a referência, a loja confirma a encomenda assim que o pagamento for processado.",
      });
    }
    if (r?.error) {
      return send(res, 200, {
        success: true, status: "open", window: "open", method: row.method, reference: refGravada,
        message: "Não foi possível verificar agora. Tente de novo dentro de momentos.",
      });
    }

    const status = asOrderStatus(r?.status);
    if (status !== "open") {
      await applyProviderStatus(db, { kind, id }, { status, service: r?.service, statusCode: r?.statusCode });
      const { data: fresco } = await db.from(table).select(COLUNAS[table]).eq("id", id).maybeSingle();
      return send(res, 200, {
        success: true, status, method: fresco?.method ?? r?.method ?? row.method,
        statusCode: r?.statusCode ?? null, message: r?.message ?? null,
        invoiceUrl: fresco?.invoice_url ?? null, invoiceStatus: fresco?.invoice_status ?? null,
        reference: fresco?.reference_number
          ? { entity: fresco.reference_entity, number: fresco.reference_number, dueDate: fresco.reference_due_date }
          : refGravada,
      });
    }

    // Ainda aberto. Se o cliente escolheu Referência, a entidade e o número
    // aparecem uns segundos depois — e ficam gravados para o «Já paguei».
    let reference = refGravada;
    if (kind === "store" && !reference && typeof provider.getReference === "function") {
      const nova = await provider.getReference(row.provider_ref);
      if (nova?.number) {
        reference = { entity: nova.entity, number: nova.number, dueDate: nova.dueDate };
        await db.from("orders").update({
          reference_entity: nova.entity || null,
          reference_number: nova.number,
          reference_due_date: nova.dueDate || null,
          ...(nova.method ? { method: nova.method, provider_service: r?.service ?? null } : {}),
        }).eq("id", id).neq("status", "paid");
      }
    }
    return send(res, 200, {
      success: true, status: "open", window: "open",
      method: r?.method ?? row.method, reference, invoiceUrl: row.invoice_url ?? null,
    });
  } catch (e) {
    console.error("payment-status", e);
    return send(res, 502, { success: false, error: "Não foi possível verificar o pagamento.", code: "GATEWAY_ERROR" });
  }
}
