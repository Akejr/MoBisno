/**
 * Função serverless — iniciação de pagamentos MoMenu (Multicaixa Express e
 * Referência Bancária). A chave de API de cada loja é lida no servidor (service
 * role) e NUNCA chega ao frontend. Usa sempre `instantWithdraw: true`.
 *
 * Pedido (POST JSON):
 *  {
 *    kind?: "store" | "plan",        // por omissão "store"
 *    storeId?: string,               // obrigatório quando kind="store"
 *    ownerId?: string, plan?: string,// obrigatório quando kind="plan"
 *    method: "mcx" | "reference",
 *    products: [{ productName, productPrice, productQuantity, id?, iva? }],
 *    amount?: number,                // opcional; tem de coincidir com os produtos
 *    phoneNumber?: string,           // obrigatório para MCX
 *    customer?: { name?, nif?, phone? },
 *    qa?: boolean, simulateResult?: string   // só ambiente de testes
 *  }
 */

import {
  admin, momenu, readBody, send,
  productsTotal, computeFee, computeNet, isValidProduct, cleanProducts,
  mapMomenuStatus, MIN_PAYMENT_KZ, PLATFORM_API_KEY, missingEnvMessage,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Método não permitido." });

  const db = admin();
  if (!db) return send(res, 500, { success: false, error: missingEnvMessage(), code: "SERVER_NOT_CONFIGURED" });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { success: false, error: "Corpo inválido." }); }

  const kind = body.kind === "plan" ? "plan" : "store";
  const method = body.method === "mcx" ? "mcx" : body.method === "reference" ? "reference" : null;
  if (!method) return send(res, 400, { success: false, error: "Método inválido.", code: "INVALID_METHOD" });

  const products = cleanProducts(body.products);
  if (!products.length) return send(res, 400, { success: false, error: "Produtos em falta.", code: "MISSING_PRODUCTS" });
  if (!products.every(isValidProduct)) return send(res, 400, { success: false, error: "Produto inválido.", code: "INVALID_PRODUCT" });

  const amount = productsTotal(products);
  if (body.amount !== undefined && Math.abs(Number(body.amount) - amount) > 0.001) {
    return send(res, 400, { success: false, error: "O valor não coincide com os produtos.", code: "AMOUNT_MISMATCH" });
  }
  if (amount < MIN_PAYMENT_KZ) return send(res, 400, { success: false, error: `Mínimo de ${MIN_PAYMENT_KZ} KZ.`, code: "BELOW_MINIMUM" });
  if (method === "mcx" && !(body.phoneNumber && String(body.phoneNumber).trim())) {
    return send(res, 400, { success: false, error: "Número de telefone obrigatório para Multicaixa Express.", code: "MISSING_PHONE" });
  }

  // Resolver a chave de API. Há uma única chave (da plataforma) no servidor;
  // as lojas só precisam de ter os pagamentos online ativados.
  let apiKey = PLATFORM_API_KEY;
  if (!apiKey) return send(res, 500, { success: false, error: "Pagamentos não configurados no servidor.", code: "PLATFORM_NOT_CONFIGURED" });
  let storeId = null;
  if (kind !== "plan") {
    storeId = String(body.storeId || "");
    if (!storeId) return send(res, 400, { success: false, error: "Loja não identificada.", code: "MISSING_STORE" });
    const { data: cfg } = await db.from("store_payments").select("online_enabled").eq("store_id", storeId).maybeSingle();
    if (!cfg || !cfg.online_enabled) {
      return send(res, 400, { success: false, error: "Pagamentos online não ativados nesta loja.", code: "PAYMENTS_NOT_ENABLED" });
    }
  }

  // Construir o payload da API.
  const qa = body.qa === true;
  const payload = { products, instantWithdraw: true };
  payload.paymentInfo = method === "mcx"
    ? { amount, phoneNumber: String(body.phoneNumber).replace(/\D/g, "") }
    : { amount };
  if (body.customer && typeof body.customer === "object") payload.customer = body.customer;
  if (qa && method === "mcx" && body.simulateResult) payload.simulateResult = String(body.simulateResult);

  const path = method === "mcx" ? "/api/payment/mcx" : "/api/payment/reference";
  let resp;
  try {
    resp = await momenu(path, apiKey, payload, qa);
  } catch {
    return send(res, 502, { success: false, error: "Falha a contactar o serviço de pagamentos.", code: "GATEWAY_ERROR" });
  }

  if (!resp.ok || !resp.data || resp.data.success === false) {
    const d = resp.data || {};
    return send(res, resp.status >= 400 ? resp.status : 502, {
      success: false,
      error: d.error || "Pagamento recusado.",
      code: d.code || "PAYMENT_FAILED",
    });
  }

  const d = resp.data;
  const fee = computeFee(amount);
  const net = computeNet(amount);
  const status = method === "mcx" ? "paid" : "open"; // MCX é imediato; referência fica pendente.
  const nowIso = new Date().toISOString();

  // Persistir a transação.
  let orderId = null;
  try {
    if (kind === "plan") {
      const ins = await db.from("plan_payments").insert({
        owner_id: String(body.ownerId || ""),
        plan: String(body.plan || ""),
        amount, method, status,
        merchant_transaction_id: d.transactionId || null,
        operation_id: d.operationId || null,
        reference_entity: d.entity || null,
        reference_number: d.referenceNumber || null,
        reference_due_date: d.dueDate || null,
        invoice_url: d.invoiceUrl || null,
        paid_at: status === "paid" ? nowIso : null,
      }).select("id").maybeSingle();
      orderId = ins.data?.id || null;
      // MCX pago → ativar o plano imediatamente.
      if (status === "paid" && body.ownerId && body.plan) {
        await db.from("profiles").update({ plan: String(body.plan) }).eq("id", String(body.ownerId));
      }
    } else {
      const ins = await db.from("orders").insert({
        store_id: storeId,
        method, status, amount, fee, net,
        merchant_transaction_id: d.transactionId || null,
        operation_id: d.operationId || null,
        products,
        customer: body.customer || null,
        reference_entity: d.entity || null,
        reference_number: d.referenceNumber || null,
        reference_due_date: d.dueDate || null,
        invoice_url: d.invoiceUrl || null,
        paid_at: status === "paid" ? nowIso : null,
      }).select("id").maybeSingle();
      orderId = ins.data?.id || null;
    }
  } catch (e) {
    // O pagamento foi iniciado; não falhar a resposta por causa do registo.
    console.error("payment persist", e);
  }

  return send(res, 200, {
    success: true,
    orderId,
    kind, method, status,
    transactionId: d.transactionId || null,
    operationId: d.operationId || null,
    invoiceUrl: d.invoiceUrl || null,
    entity: d.entity || null,
    referenceNumber: d.referenceNumber || null,
    dueDate: d.dueDate || null,
    amount, fee, net,
  });
}
