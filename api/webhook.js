/**
 * Função serverless — webhook de confirmação de pagamentos MoMenu.
 *
 * Cada comerciante configura este URL na sua conta MoMenu
 * (Definições → Desenvolvedores → Webhook):  https://<dominio>/api/webhook
 *
 * Eventos sequenciais quando o pagamento é confirmado (operationStatus "1"):
 *   1) payment.confirmed   2) invoice.created (inclui invoiceUrl)
 * Eventos não pagos (3/4/5) vêm sem o campo `event`.
 *
 * Mapeamento por `merchantTransactionId` (guardado na criação da encomenda).
 * Entrega fire-and-forget: respondemos sempre 200.
 */

import { admin, readBody, send, mapMomenuStatus } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { received: false });

  const db = admin();
  if (!db) return send(res, 200, { received: true }); // não retransmite; evita reentregas

  let body;
  try { body = await readBody(req); } catch { return send(res, 200, { received: true }); }

  const mtx = String(body.merchantTransactionId || "");
  if (!mtx) return send(res, 200, { received: true });

  const status = mapMomenuStatus(body.operationStatus);
  const invoiceUrl = body.invoiceUrl || null;
  const nowIso = new Date().toISOString();

  const patch = { status };
  if (status === "paid") { patch.paid_at = nowIso; }
  if (invoiceUrl) patch.invoice_url = invoiceUrl;

  try {
    // Encomenda de loja.
    const upd = await db.from("orders").update(patch).eq("merchant_transaction_id", mtx).select("id").maybeSingle();

    // Pagamento de plano (caso não fosse uma encomenda de loja).
    if (!upd.data) {
      await db.from("plan_payments").update(patch).eq("merchant_transaction_id", mtx);
      if (status === "paid") {
        const { data: pp } = await db.from("plan_payments").select("owner_id, plan").eq("merchant_transaction_id", mtx).maybeSingle();
        if (pp?.owner_id && pp?.plan) await db.from("profiles").update({ plan: pp.plan }).eq("id", pp.owner_id);
      }
    }
  } catch (e) {
    console.error("webhook persist", e);
  }

  return send(res, 200, { received: true });
}
