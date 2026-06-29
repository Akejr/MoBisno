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
  mapMomenuStatus, MIN_PAYMENT_KZ, PLATFORM_API_KEY, missingEnvMessage, activatePlan, creditSms, bumpDiscountUse,
  effectivePlanId, planAllowsOnline, checkStock, decrementStock,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Método não permitido." });

  const db = admin();
  if (!db) return send(res, 500, { success: false, error: missingEnvMessage(), code: "SERVER_NOT_CONFIGURED" });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { success: false, error: "Corpo inválido." }); }

  const kind = body.kind === "plan" ? "plan" : body.kind === "sms" ? "sms" : "store";
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
  if (kind === "store") {
    storeId = String(body.storeId || "");
    if (!storeId) return send(res, 400, { success: false, error: "Loja não identificada.", code: "MISSING_STORE" });
    const { data: cfg } = await db.from("store_payments").select("online_enabled").eq("store_id", storeId).maybeSingle();
    if (!cfg || !cfg.online_enabled) {
      return send(res, 400, { success: false, error: "Pagamentos online não ativados nesta loja.", code: "PAYMENTS_NOT_ENABLED" });
    }
    // Os pagamentos online são uma funcionalidade paga: exigem plano ativo que a
    // cubra. Se o plano da loja expirou (ou não cobre), recusa.
    const { data: st } = await db.from("stores").select("owner_id").eq("id", storeId).maybeSingle();
    if (st?.owner_id) {
      const { data: prof } = await db.from("profiles").select("plan, plan_expires_at, next_plan, trial_ends_at").eq("id", st.owner_id).maybeSingle();
      if (!planAllowsOnline(effectivePlanId(prof))) {
        return send(res, 400, { success: false, error: "Os pagamentos online não estão disponíveis no plano atual da loja.", code: "PLAN_NOT_COVERED" });
      }
    }
    // Stock: recusa se algum item não tiver stock suficiente.
    const outName = await checkStock(db, products);
    if (outName) {
      return send(res, 400, { success: false, error: `Sem stock suficiente para "${outName}".`, code: "OUT_OF_STOCK" });
    }
  } else if (kind === "sms") {
    storeId = String(body.storeId || "");
    if (!storeId) return send(res, 400, { success: false, error: "Loja não identificada.", code: "MISSING_STORE" });
  }

  // Aplicar código de desconto (só em encomendas de loja). Escala os preços dos
  // produtos para o total com desconto (mantém soma == montante para a MoMenu).
  let chargeProducts = products;
  let chargeAmount = amount;
  let discountId = null;
  if (kind === "store" && body.discountCodeId) {
    const { data: dc } = await db
      .from("discount_codes")
      .select("id, store_id, type, value, active")
      .eq("id", String(body.discountCodeId))
      .maybeSingle();
    if (dc && dc.active === true && dc.store_id === storeId) {
      const raw = dc.type === "percent" ? (amount * Number(dc.value)) / 100 : Number(dc.value);
      const discount = Math.max(0, Math.min(amount, Math.round(raw)));
      const target = amount - discount;
      if (discount > 0 && target >= MIN_PAYMENT_KZ) {
        const factor = target / amount;
        let running = 0;
        chargeProducts = products.map((p) => {
          const price = Math.max(1, Math.round(Number(p.productPrice) * factor));
          running += price * Number(p.productQuantity);
          return { ...p, productPrice: price };
        });
        // Ajuste de arredondamento na primeira linha para fechar o total exato.
        const diffQty = chargeProducts[0] ? Number(chargeProducts[0].productQuantity) : 1;
        const adjust = Math.round((target - running) / diffQty);
        if (chargeProducts[0] && adjust !== 0) {
          chargeProducts[0].productPrice = Math.max(1, chargeProducts[0].productPrice + adjust);
        }
        chargeAmount = productsTotal(chargeProducts);
        discountId = dc.id;
      }
    }
  }

  // Construir o payload da API.
  const qa = body.qa === true;
  const payload = { products: chargeProducts, instantWithdraw: true };
  payload.paymentInfo = method === "mcx"
    ? { amount: chargeAmount, phoneNumber: String(body.phoneNumber).replace(/\D/g, "") }
    : { amount: chargeAmount };
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
  const fee = computeFee(chargeAmount);
  const net = computeNet(chargeAmount);
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
      // MCX pago → ativar o plano imediatamente (com expiração/carry-over).
      if (status === "paid" && body.ownerId && body.plan) {
        await activatePlan(db, String(body.ownerId), String(body.plan));
      }
    } else if (kind === "sms") {
      const quantity = Math.max(0, parseInt(body.smsQuantity, 10) || 0);
      const ins = await db.from("sms_purchases").insert({
        store_id: storeId,
        owner_id: String(body.ownerId || ""),
        quantity, amount, method, status,
        merchant_transaction_id: d.transactionId || null,
        operation_id: d.operationId || null,
        credited: false,
        paid_at: status === "paid" ? nowIso : null,
      }).select("id").maybeSingle();
      orderId = ins.data?.id || null;
      // MCX pago → creditar de imediato.
      if (status === "paid" && quantity > 0) {
        await creditSms(db, storeId, quantity);
        if (orderId) await db.from("sms_purchases").update({ credited: true }).eq("id", orderId);
      }
    } else {
      const ins = await db.from("orders").insert({
        store_id: storeId,
        method, status, amount: chargeAmount, fee, net,
        merchant_transaction_id: d.transactionId || null,
        operation_id: d.operationId || null,
        products: chargeProducts,
        customer: body.customer || null,
        reference_entity: d.entity || null,
        reference_number: d.referenceNumber || null,
        reference_due_date: d.dueDate || null,
        invoice_url: d.invoiceUrl || null,
        paid_at: status === "paid" ? nowIso : null,
      }).select("id").maybeSingle();
      orderId = ins.data?.id || null;
      // Conta o uso do código de desconto aplicado (se válido).
      if (discountId) await bumpDiscountUse(db, discountId);
      // Abate o stock quando o pagamento é imediato (MCX). Na referência, o
      // abate ocorre no webhook quando o pagamento é confirmado.
      if (status === "paid") await decrementStock(db, products);
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
    amount: chargeAmount, fee, net,
  });
}
