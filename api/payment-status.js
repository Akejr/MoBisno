/**
 * Função serverless — verificação de estado de uma Referência Bancária
 * (fallback do webhook). Atualiza a encomenda/pagamento de plano e devolve o
 * estado + a URL da fatura quando paga.
 *
 * GET /api/payment-status?operationId=...&merchantTransactionId=...&storeId=...
 *   (para planos use ownerId em vez de storeId)
 */

import { admin, momenu, send, mapStatusString, PLATFORM_API_KEY } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Método não permitido." });

  const db = admin();
  if (!db) return send(res, 500, { success: false, error: "Pagamentos não configurados no servidor." });

  const q = req.query || {};
  const operationId = String(q.operationId || "");
  const mtx = String(q.merchantTransactionId || "");
  const storeId = q.storeId ? String(q.storeId) : "";
  const ownerId = q.ownerId ? String(q.ownerId) : "";
  if (!operationId) return send(res, 400, { success: false, error: "operationId em falta.", code: "MISSING_OPERATION" });

  // Há uma única chave (da plataforma) no servidor, usada para loja e plano.
  const apiKey = PLATFORM_API_KEY;
  if (!apiKey) return send(res, 500, { success: false, error: "Pagamentos não configurados no servidor.", code: "PLATFORM_NOT_CONFIGURED" });
  if (!storeId && !ownerId) return send(res, 400, { success: false, error: "Loja não identificada.", code: "MISSING_STORE" });

  const path = `/api/payment/reference/status/${encodeURIComponent(operationId)}${mtx ? `?merchantTransactionId=${encodeURIComponent(mtx)}` : ""}`;
  let resp;
  try {
    resp = await momenu(path, apiKey, undefined, false);
  } catch {
    return send(res, 502, { success: false, error: "Falha a contactar o serviço de pagamentos.", code: "GATEWAY_ERROR" });
  }

  const payment = resp.data?.payment || {};
  const status = mapStatusString(payment.status);
  const invoiceUrl = resp.data?.invoiceUrl || null;
  const nowIso = new Date().toISOString();

  // Atualizar o registo correspondente quando há novidade.
  try {
    if (status === "paid" || status === "cancelled" || status === "failed") {
      const patch = { status };
      if (status === "paid") { patch.paid_at = nowIso; if (invoiceUrl) patch.invoice_url = invoiceUrl; }
      if (ownerId) {
        await db.from("plan_payments").update(patch).eq("operation_id", operationId);
        if (status === "paid") {
          const { data: pp } = await db.from("plan_payments").select("owner_id, plan").eq("operation_id", operationId).maybeSingle();
          if (pp?.owner_id && pp?.plan) await db.from("profiles").update({ plan: pp.plan }).eq("id", pp.owner_id);
        }
      } else {
        await db.from("orders").update(patch).eq("operation_id", operationId);
      }
    }
  } catch (e) {
    console.error("payment-status persist", e);
  }

  return send(res, 200, { success: true, status, message: payment.message || null, invoiceUrl });
}
