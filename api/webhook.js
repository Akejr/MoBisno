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

import { admin, readBody, send, mapMomenuStatus, activatePlan, creditSms, decrementStock } from "./_shared.js";

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
    const { data: order } = await db.from("orders").select("id, status, products").eq("merchant_transaction_id", mtx).maybeSingle();
    if (order) {
      await db.from("orders").update(patch).eq("id", order.id);
      // Abate o stock uma única vez, na transição para "pago".
      if (status === "paid" && order.status !== "paid") await decrementStock(db, order.products);
    } else {
      // Pagamento de plano.
      await db.from("plan_payments").update(patch).eq("merchant_transaction_id", mtx);
      if (status === "paid") {
        const { data: pp } = await db.from("plan_payments").select("owner_id, plan").eq("merchant_transaction_id", mtx).maybeSingle();
        if (pp?.owner_id && pp?.plan) await activatePlan(db, pp.owner_id, pp.plan);
      }
    }

    // Compra de SMS (creditar uma única vez).
    const { data: sp } = await db.from("sms_purchases").select("id, store_id, quantity, credited").eq("merchant_transaction_id", mtx).maybeSingle();
    if (sp) {
      await db.from("sms_purchases").update(patch).eq("id", sp.id);
      if (status === "paid" && !sp.credited) {
        await creditSms(db, sp.store_id, sp.quantity);
        await db.from("sms_purchases").update({ credited: true }).eq("id", sp.id);
      }
    }
  } catch (e) {
    console.error("webhook persist", e);
  }

  return send(res, 200, { received: true });
}
