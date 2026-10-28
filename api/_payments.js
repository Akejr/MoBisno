/**
 * Cadeia de pagamento independente do fornecedor: preço, stock, desconto,
 * registo e confirmação.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * ## As regras que este ficheiro garante
 *
 * 1. **O montante é calculado aqui**, a partir da base de dados: preço de cada
 *    Produto (e da Combinação escolhida), taxa de entrega da área, código de
 *    desconto. Do navegador só vêm os ids, as Combinação e as quantidades. Antes,
 *    o servidor somava os preços que o navegador lhe mandava — um comprador
 *    podia pagar 100 Kz por qualquer carrinho.
 * 2. **Só lojas aprovadas recebem pagamentos digitais** (`stores.digital_payments`,
 *    ligado pela verificação de empresa) e só com a subscrição do Dono ativa.
 * 3. **A encomenda é gravada antes de se cobrar.** Uma cobrança sem registo era o
 *    pior desfecho possível da versão anterior.
 * 4. **A confirmação é idempotente**: a transição para «paga» é uma escrita
 *    condicional (`status <> 'paid'`), por isso o stock é abatido e o desconto
 *    contado uma única vez, venha a confirmação do webhook, da verificação manual
 *    ou das duas. Num pagamento de plano, a guarda é `activated_at`: cada
 *    pagamento soma 30 dias uma vez — antes, cada «Já paguei — verificar» somava
 *    mais 30.
 */
import {
  asVariantKey, linePriceOf, deliveryFeeOf, discountAmountOf, productsTotal, round2,
  checkStock, decrementStock, storeActive, activateStorePlan, bumpDiscountUse, PLAN_PRICE_KZ,
  feeForMethodOf,
} from "./_shared.js";
import { fulfilPaidOrder } from "./_fulfil.js";

/** Limite de linhas de uma encomenda (guarda contra corpos absurdos). */
export const MAX_ORDER_LINES = 100;

/** Quantidade máxima por linha. */
export const MAX_LINE_QUANTITY = 999;

/** Erro de domínio com código estável e frase para o cliente. */
function fail(code, error, status = 400) {
  return { ok: false, code, error, status };
}

/**
 * Linhas pedidas pelo navegador, reduzidas ao que lhe cabe dizer: o Produto, a
 * Combinação e a quantidade. Preço e nome são lidos da base de dados.
 *
 * Linhas repetidas (mesmo Produto e mesma Combinação) são somadas.
 */
export function requestedLines(raw) {
  const out = new Map();
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_ORDER_LINES) : []) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const quantity = Number(item.quantity ?? item.productQuantity);
    if (!id || !Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) continue;
    const variantKey = asVariantKey(item.variantKey);
    const key = `${id}|${variantKey ?? ""}`;
    const prev = out.get(key);
    if (prev) prev.quantity = Math.min(MAX_LINE_QUANTITY, prev.quantity + quantity);
    else out.set(key, variantKey === undefined ? { id, quantity } : { id, variantKey, quantity });
  }
  return [...out.values()];
}

/** Texto aparado e cortado, ou `undefined`. */
function text(value, max) {
  if (typeof value !== "string") return undefined;
  const t = value.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : undefined;
}

/** Dados do cliente final, limpos e com tamanho limitado. */
export function cleanCustomer(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const out = {
    name: text(c.name, 120),
    phone: text(c.phone, 20),
    nif: text(c.nif, 20),
    email: text(c.email, 160),
    address: text(c.address, 300),
    area: text(c.area, 60),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** Código de desconto válido para a loja (mesmas condições de `public.validate_discount`). */
async function findDiscount(db, storeId, code) {
  const norm = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!norm) return null;
  const { data } = await db
    .from("discount_codes")
    .select("id, type, value, active, uses, max_uses, expires_at")
    .eq("store_id", storeId)
    .eq("code", norm)
    .maybeSingle();
  if (!data || data.active !== true) return null;
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return null;
  if (data.max_uses != null && Number(data.uses ?? 0) >= Number(data.max_uses)) return null;
  return data;
}

/**
 * Calcula a encomenda inteira no servidor.
 *
 * @returns `{ ok: true, store, payee, lines, subtotal, deliveryFee, discount, discountId, total }`
 *          ou `{ ok: false, code, error, status }`.
 */
export async function priceStoreOrder(db, { storeId, lines, area, discountCode }) {
  if (!storeId) return fail("MISSING_STORE", "Loja não identificada.");
  if (!lines.length) return fail("MISSING_PRODUCTS", "O carrinho está vazio.");

  const { data: store } = await db
    .from("stores")
    .select("id, name, identifier, owner_id, state, digital_payments, customization, plan_expires_at")
    .eq("id", storeId)
    .maybeSingle();
  if (!store || store.state !== "Publicada") return fail("STORE_NOT_FOUND", "Loja não encontrada.", 404);
  if (store.digital_payments !== true) {
    return fail("PAYMENTS_NOT_ENABLED", "Esta loja ainda não recebe pagamentos digitais. Pode encomendar por WhatsApp.");
  }
  // A subscrição é da loja (migração 0025): sem ela, a loja não está online.
  const { data: prof } = await db.from("profiles").select("is_admin").eq("id", store.owner_id).maybeSingle();
  if (!storeActive(store, prof)) return fail("PLAN_NOT_COVERED", "Esta loja não está a aceitar pagamentos de momento.");

  const { data: payee } = await db
    .from("store_payments")
    .select("bank_name, beneficiary_name, iban, verification_status")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!payee || payee.verification_status !== "approved") {
    return fail("PAYMENTS_NOT_ENABLED", "Esta loja ainda não recebe pagamentos digitais. Pode encomendar por WhatsApp.");
  }

  const custom = store.customization && typeof store.customization === "object" ? store.customization : {};
  const ids = [...new Set(lines.map((l) => l.id))];
  const { data: rows } = await db
    .from("products")
    .select("id, store_id, name, price, available, physical, stock")
    .in("id", ids);
  const byId = new Map((rows || []).map((r) => [String(r.id), r]));

  const priced = [];
  let physical = false;
  for (const line of lines) {
    const p = byId.get(line.id);
    if (!p || String(p.store_id) !== String(storeId) || p.available !== true) {
      return fail("PRODUCT_UNAVAILABLE", "Um dos produtos do carrinho já não está disponível.", 409);
    }
    const lp = linePriceOf(custom, line.id, line.variantKey, Number(p.price));
    if (!lp.ok) return fail("INVALID_VARIANT", `Escolha a versão de "${p.name}" outra vez.`, 409);
    if (!(lp.price > 0)) return fail("INVALID_PRODUCT", `"${p.name}" não tem preço.`, 409);
    if (p.physical !== false) physical = true;
    const item = {
      id: line.id,
      productName: lp.label ? `${p.name} (${lp.label})` : String(p.name),
      productPrice: round2(lp.price),
      productQuantity: line.quantity,
    };
    if (lp.variantKey) item.variantKey = lp.variantKey;
    priced.push(item);
  }

  const subtotal = productsTotal(priced);
  let deliveryFee = 0;
  if (physical) {
    const d = deliveryFeeOf(custom.delivery, area, subtotal);
    if (!d.ok) return fail("INVALID_AREA", "Escolha a área de entrega.");
    deliveryFee = round2(d.fee);
  }

  let discount = 0;
  let discountId = null;
  if (discountCode) {
    const dc = await findDiscount(db, storeId, discountCode);
    if (!dc) return fail("INVALID_DISCOUNT", "O código de desconto não é válido.");
    discount = discountAmountOf(dc, subtotal + deliveryFee);
    discountId = dc.id;
  }

  const total = round2(subtotal + deliveryFee - discount);
  if (!(total > 0)) return fail("INVALID_TOTAL", "O total da encomenda tem de ser maior do que zero.");

  const out = await checkStock(db, priced, storeId);
  if (out) return fail("OUT_OF_STOCK", `Sem stock suficiente para "${out}".`, 409);

  return { ok: true, store, payee, lines: priced, subtotal, deliveryFee, discount, discountId, total };
}

/**
 * Grava a encomenda (estado «aberta») antes de qualquer cobrança.
 *
 * Devolve `{ ok: true, id }` ou `{ ok: false, cause }` — e não `null`. Uma
 * coluna que não exista na base de dados tem de dizer qual é.
 */
export async function createStoreOrder(db, priced, { method, customer }) {
  const { data, error } = await db.from("orders").insert({
    store_id: priced.store.id,
    method,
    status: "open",
    amount: priced.total,
    fee: 0,
    net: priced.total,
    subtotal: priced.subtotal,
    delivery_fee: priced.deliveryFee,
    discount_amount: priced.discount,
    discount_code_id: priced.discountId,
    products: priced.lines,
    customer,
  }).select("id").single();
  if (error || !data) {
    console.error("createStoreOrder", dbCause(error));
    return { ok: false, cause: dbCause(error) };
  }
  return { ok: true, id: data.id };
}

/**
 * Grava o que o fornecedor devolveu ao iniciar o pagamento.
 *
 * `provider_ref` é o que liga o aviso do fornecedor a esta linha
 * (`findByProviderRef`): se esta escrita falhar, um pagamento feito horas
 * depois nunca é confirmado. Por isso a falha vai para os registos — a cobrança
 * já foi criada e não se desfaz aqui, mas ninguém tem de a descobrir pelo
 * cliente a reclamar.
 */
export async function saveProviderResult(db, table, id, result) {
  const patch = { provider_ref: result.providerRef || null };
  if (result.referenceInfo) {
    patch.reference_entity = result.referenceInfo.entity || null;
    patch.reference_number = result.referenceInfo.number || null;
    patch.reference_due_date = result.referenceInfo.dueDate || null;
  }
  if (result.invoiceUrl) patch.invoice_url = result.invoiceUrl;
  const { error } = await db.from(table).update(patch).eq("id", id);
  if (error) console.error("saveProviderResult", table, id, dbCause(error));
}

/**
 * Marca uma encomenda como paga — **uma só vez** — e cumpre-a: abate o stock,
 * conta o uso do desconto, emite a factura da empresa do Dono e avisa por email.
 * Devolve `true` só a quem fez a transição.
 *
 * ## A comissão é calculada aqui
 *
 * `fee` e `net` saem de `feeForMethodOf` (espelho de `src/services/fees.ts`) e
 * **não** de nada que o fornecedor diga: a comissão é da MôBisno, 5% do que o
 * cliente pagou, e o Dono levanta o resto. Calculá-la neste único sítio é o que
 * garante que o saldo disponível no painel é o mesmo número que a base de dados
 * tem gravado.
 */
export async function confirmStoreOrder(db, orderId, { invoiceUrl, service, statusCode } = {}) {
  const { data: atual } = await db.from("orders").select("amount, method").eq("id", orderId).maybeSingle();
  if (!atual) return false;
  const total = Number(atual.amount) || 0;
  // O método real é o que o cliente escolheu na página do fornecedor; o que
  // gravámos ao criar a cobrança era só a intenção.
  const metodo = service === "gpo" ? "mcx" : service === "reference" ? "reference" : atual.method;
  const comissao = feeForMethodOf(metodo, total);
  const patch = {
    status: "paid",
    paid_at: new Date().toISOString(),
    method: metodo,
    fee: comissao,
    net: round2(total - comissao),
  };
  if (invoiceUrl) patch.invoice_url = invoiceUrl;
  if (service) patch.provider_service = service;
  if (statusCode) patch.provider_status_code = statusCode;
  const { data } = await db
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .neq("status", "paid")
    .select("id, store_id, products, discount_code_id")
    .maybeSingle();
  if (!data) return false;
  await decrementStock(db, data.products, data.store_id);
  if (data.discount_code_id) await bumpDiscountUse(db, data.discount_code_id);
  // Factura e emails. Nunca lança, e nunca desfaz a venda (ver `api/_fulfil.js`).
  await fulfilPaidOrder(db, orderId);
  return true;
}

/**
 * Grava um desfecho que não é pagamento (falhou, cancelado), sem nunca desfazer
 * um «pago». O código do fornecedor fica gravado: é o que permite explicar a
 * recusa ao comprador em vez de dizer «não foi possível».
 */
export async function markNotPaid(db, table, id, status, { statusCode, service } = {}) {
  if (status !== "failed" && status !== "cancelled") return;
  const patch = { status };
  if (statusCode) patch.provider_status_code = statusCode;
  if (service) patch.provider_service = service;
  await db.from(table).update(patch).eq("id", id).neq("status", "paid");
}

/**
 * Dono autenticado do pedido, pelo token da sessão (`Authorization: Bearer …`).
 *
 * O pagamento da subscrição já não aceita `ownerId` no corpo: qualquer pessoa
 * podia escrever o id de outra conta.
 */
export async function ownerFromRequest(db, req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Grava o pagamento da subscrição de uma loja (preço do servidor). Cada loja
 * tem a sua subscrição (migração 0025).
 *
 * Devolve `{ ok: true, id, amount }` ou `{ ok: false, cause }`.
 *
 * ## O que saiu daqui, e porquê
 *
 * `period: "mensal"` era escrito em cada pagamento. Vinha de quando havia ciclo
 * mensal e anual; com um só plano de 30 dias, não distingue nada. Pior: a coluna
 * não existia na base de dados de produção, o insert falhava, e o endpoint
 * respondia 500 «não foi possível registar o pagamento» — **nenhum pagamento de
 * subscrição funcionou até isto ser encontrado**. Um campo que não é lido por
 * ninguém não vale o risco de ser escrito.
 */
export async function createPlanPayment(db, ownerId, method, storeId) {
  const { data, error } = await db.from("plan_payments").insert({
    owner_id: ownerId,
    store_id: storeId,
    plan: "pro",
    amount: PLAN_PRICE_KZ,
    method,
    status: "open",
  }).select("id, amount").single();
  if (error || !data) {
    console.error("createPlanPayment", dbCause(error));
    return { ok: false, cause: dbCause(error) };
  }
  return { ok: true, id: data.id, amount: Number(data.amount) };
}

/**
 * Confirma um pagamento de subscrição e soma 30 dias — **uma só vez** por
 * pagamento, pela escrita condicional em `activated_at`.
 */
export async function confirmPlanPayment(db, paymentId, { invoiceUrl } = {}) {
  const agora = new Date().toISOString();
  const patch = { status: "paid", paid_at: agora, activated_at: agora };
  if (invoiceUrl) patch.invoice_url = invoiceUrl;
  const { data } = await db
    .from("plan_payments")
    .update(patch)
    .eq("id", paymentId)
    .is("activated_at", null)
    .select("owner_id, store_id")
    .maybeSingle();
  if (!data?.owner_id) return false;
  // Um pagamento criado antes da migração 0025 não tem loja: fica para a loja
  // mais antiga do dono, que era a primeira que a subscrição da conta cobria.
  let storeId = data.store_id;
  if (!storeId) {
    const { data: loja } = await db.from("stores").select("id").eq("owner_id", data.owner_id)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    storeId = loja?.id ?? null;
  }
  return activateStorePlan(db, storeId);
}

/** Encomenda ou pagamento de plano com esta referência do fornecedor. */
export async function findByProviderRef(db, providerRef) {
  if (!providerRef) return null;
  const { data: order } = await db.from("orders").select("id, status").eq("provider_ref", providerRef).maybeSingle();
  if (order) return { kind: "store", id: order.id, status: order.status };
  const { data: plan } = await db.from("plan_payments").select("id, status").eq("provider_ref", providerRef).maybeSingle();
  if (plan) return { kind: "plan", id: plan.id, status: plan.status };
  return null;
}

/** Aplica um estado vindo do fornecedor (webhook ou verificação). */
export async function applyProviderStatus(db, target, { status, invoiceUrl, service, statusCode }) {
  if (status === "paid") {
    if (target.kind === "plan") await confirmPlanPayment(db, target.id, { invoiceUrl });
    else await confirmStoreOrder(db, target.id, { invoiceUrl, service, statusCode });
    return;
  }
  await markNotPaid(db, target.kind === "plan" ? "plan_payments" : "orders", target.id, status, { statusCode, service });
}
