/**
 * POST /api/payment-webhook — notificação do fornecedor de pagamentos.
 *
 * O pedido chega **em bruto** ao adaptador (`provider.parseWebhook(req)`): o
 * corpo não é lido antes, para a assinatura poder ser verificada sobre os bytes
 * originais. Um pedido sem autenticidade válida recebe 401 e não toca em nada —
 * a versão MoMenu aceitava qualquer `POST`, e bastava conhecer o
 * `transactionId` (que o próprio comprador recebia) para marcar uma encomenda
 * como paga.
 *
 * A confirmação é idempotente (`api/_payments.js`): notificações repetidas não
 * abatem stock nem somam dias outra vez.
 */
import { admin, send } from "./_shared.js";
import { getPaymentProvider, PAYMENTS_UNAVAILABLE } from "./_provider.js";
import { findByProviderRef, applyProviderStatus } from "./_payments.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { received: false });

  const provider = getPaymentProvider();
  if (!provider) return send(res, 503, PAYMENTS_UNAVAILABLE);

  const db = admin();
  if (!db) return send(res, 500, { received: false });

  let event = null;
  try {
    event = await provider.parseWebhook(req);
  } catch {
    event = null;
  }
  if (!event || !event.providerRef) return send(res, 401, { received: false });

  try {
    const target = await findByProviderRef(db, event.providerRef);
    // 200 mesmo sem reconhecer a referência: assim o fornecedor pára de repetir
    // um aviso que nunca vai ser tratado.
    if (!target) return send(res, 200, { received: true });

    /*
     * A terceira prova: o montante.
     *
     * `trust: "api"` quer dizer que o estado foi relido da API do fornecedor —
     * é a fonte de verdade e não precisa de mais nada. `trust: "callback"` quer
     * dizer que veio do **corpo** do aviso, porque a janela de consulta já
     * fechou (o caso de uma Referência paga horas depois). Nesse caso o corpo
     * só é aceite se o valor anunciado bater com o da venda: sem isto, quem
     * descobrisse o endereço do callback e o segredo podia marcar qualquer
     * encomenda como paga.
     */
    if (event.trust !== "api") {
      const tabela = target.kind === "plan" ? "plan_payments" : "orders";
      const { data: row } = await db.from(tabela).select("amount").eq("id", target.id).maybeSingle();
      const esperado = Number(row?.amount);
      const anunciado = Number(event.amount);
      if (!Number.isFinite(esperado) || !Number.isFinite(anunciado) || Math.abs(esperado - anunciado) > 0.5) {
        console.error("[webhook] montante não confere", target.kind, target.id, esperado, anunciado);
        // 200: repetir não vai melhorar. Fica para revisão manual — nunca se
        // entrega às cegas.
        return send(res, 200, { received: true });
      }
    }

    await applyProviderStatus(db, target, event);
    return send(res, 200, { received: true });
  } catch (e) {
    console.error("payment-webhook", e);
    // 500 para o fornecedor voltar a tentar: a confirmação é idempotente.
    return send(res, 500, { received: false });
  }
}
