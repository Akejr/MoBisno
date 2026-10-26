/**
 * Utilitários partilhados pelas funções serverless.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * Segredos (apenas no servidor, via variáveis de ambiente):
 *  - SUPABASE_URL                 (ou VITE_SUPABASE_URL)
 *  - SUPABASE_SERVICE_ROLE_KEY    (service role; ignora o RLS para gravar
 *                                  encomendas e ativar subscrições)
 *
 * A integração com a MoMenu saiu. O fornecedor de pagamentos novo liga-se num só
 * sítio, `api/_provider.js`; o resto da cadeia (preço calculado no servidor,
 * stock, descontos, ativação idempotente) vive em `api/_payments.js` e aqui.
 *
 * `api/` é JavaScript sem passo de compilação e **não pode importar de `src/`**.
 * As regras de domínio que o servidor precisa estão espelhadas à mão, e cada
 * espelho tem um teste de paridade (`SEO.md` §5.2): preço do plano e conta ativa
 * (`tests/planParity.test.ts`), stock e preço por Combinação
 * (`tests/serverStock.test.ts`), entregas e descontos (`tests/serverOrder.test.ts`).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Cliente Supabase com service role (ou null se não configurado). */
export function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Estado da configuração no servidor (booleanos, sem expor segredos). */
export function configStatus() {
  return {
    supabaseUrl: !!SUPABASE_URL,
    serviceRole: !!SERVICE_ROLE,
  };
}

/** Mensagem acionável quando faltam variáveis de ambiente no servidor. */
export function missingEnvMessage() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_ROLE) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return `Servidor por configurar. Defina ${missing.join(", ")} no Vercel (Settings → Environment Variables) e faça redeploy.`;
}

export function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

export function productsTotal(products) {
  return round2((products || []).reduce((s, p) => s + Number(p.productPrice) * Number(p.productQuantity), 0));
}

/**
 * Uma linha de encomenda é válida?
 *
 * `variantKey` **nunca invalida uma linha**: é um campo opcional que só existe
 * desde as Variação de Produto (R4). Ausente, vazio ou de tipo errado, a linha
 * vale exatamente o que valia antes — há carrinhos gravados em `localStorage`
 * nos telemóveis dos Clientes e encomendas já gravadas em `orders` sem este
 * campo, e nenhuma delas pode passar a ser recusada. Quem lê a chave
 * (`cleanProducts`, `checkStock`, `decrementStock`) usa `asVariantKey`, que
 * trata tudo o que não seja texto com conteúdo como ausente.
 */
export function isValidProduct(p) {
  if (!p || typeof p.productName !== "string" || p.productName.trim() === "") return false;
  if (!Number.isFinite(Number(p.productPrice)) || Number(p.productPrice) <= 0) return false;
  if (!Number.isInteger(Number(p.productQuantity)) || Number(p.productQuantity) <= 0) return false;
  return true;
}

/**
 * Sanitiza a lista de produtos para o formato aceite pela API.
 *
 * `variantKey` é **preservada** quando é texto com conteúdo, porque é ela que
 * identifica a Combinação vendida — sem ela o servidor não sabe validar nem
 * abater o stock por Combinação (e é assim que ela chega à coluna
 * `orders.products`, para o abate diferido do webhook). Uma chave ausente,
 * vazia ou de tipo errado é simplesmente omitida: a linha fica idêntica à de
 * hoje.
 */
export function cleanProducts(products) {
  return (products || []).map((p) => {
    const item = {
      productName: String(p.productName),
      productPrice: Number(p.productPrice),
      productQuantity: Number(p.productQuantity),
    };
    if (p.id != null) item.id = String(p.id);
    const variantKey = asVariantKey(p.variantKey);
    if (variantKey !== undefined) item.variantKey = variantKey;
    return item;
  });
}

/**
 * Copia as linhas **sem** `variantKey`, para o corpo enviado ao fornecedor de
 * pagamentos.
 *
 * A chave da Combinação é interna à Plataforma: identifica o que foi vendido
 * para efeitos de stock e não pertence ao contrato de nenhum fornecedor. Fica
 * gravada em `orders.products`, que é de onde a confirmação a lê para abater o
 * stock quando uma Referência Bancária é paga mais tarde.
 */
export function providerProducts(products) {
  return (products || []).map((p) => {
    const { variantKey: _ignorada, ...rest } = p;
    return rest;
  });
}

/** Estado interno a partir de um estado de origem desconhecida. */
export function asOrderStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "paid": return "paid";
    case "cancelled":
    case "canceled":
    case "expired": return "cancelled";
    case "failed":
    case "rejected": return "failed";
    default: return "open";
  }
}

/** Lê o corpo JSON de um pedido (Vercel já o faz, mas tolera string). */
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  // Fallback: ler o stream manualmente.
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

export function send(res, code, obj) {
  res.status(code).json(obj);
}

/** Duração de um período pago, em ms. Espelha `PLAN_PERIOD_DAYS` de `src/services/plans.ts`. */
export const PLAN_PERIOD_MS = 30 * 24 * 3600 * 1000;

/**
 * Preço da subscrição, em Kwanzas, por período. Espelho manual de
 * `PLAN_PRICE_KZ` de `src/services/plans.ts` — `api/` é JavaScript sem passo de
 * compilação e não pode importar de `src/` (`SEO.md` §5.2).
 *
 * Está aqui porque é o servidor que calcula o montante de um pagamento de
 * plano: aceitar o valor que o navegador enviasse era deixar qualquer pessoa
 * subscrever por 1 Kz. `tests/planParity.test.ts` compara este valor com o do
 * domínio.
 */
export const PLAN_PRICE_KZ = 10000;

/**
 * Ativa/renova a subscrição de UMA loja após um pagamento confirmado. Cada loja
 * tem a sua (`stores.plan_expires_at`, migração 0025): pagar uma não mexe nas
 * outras. Espelha `planActivationPatch` de `src/services/billing.ts`: renovar
 * acrescenta o período AO FIM do atual, para quem paga adiantado não perder os
 * dias que tinha; sem período em curso, conta a partir de agora.
 *
 * **Não é idempotente sozinha** — cada chamada soma um período. Quem a chama
 * (`confirmPlanPayment` em `api/_payments.js`) só o faz depois de marcar o
 * pagamento como ativado numa escrita condicional; foi a falta dessa guarda que
 * deixava um único pagamento estender a subscrição sem limite.
 */
export async function activateStorePlan(db, storeId) {
  if (!storeId) return false;
  const now = Date.now();
  const { data: loja } = await db.from("stores").select("plan_expires_at").eq("id", storeId).maybeSingle();
  const expMs = loja?.plan_expires_at ? Date.parse(loja.plan_expires_at) : NaN;
  const base = Number.isFinite(expMs) && expMs > now ? expMs : now;
  const fim = new Date(base + PLAN_PERIOD_MS).toISOString();
  const { error } = await db.from("stores").update({ plan_expires_at: fim }).eq("id", storeId);
  return !error;
}
/** Incrementa os usos de um código de desconto. */
export async function bumpDiscountUse(db, discountCodeId) {
  if (!discountCodeId) return;
  const { data } = await db.from("discount_codes").select("uses").eq("id", discountCodeId).maybeSingle();
  if (!data) return;
  await db.from("discount_codes").update({ uses: Number(data.uses ?? 0) + 1 }).eq("id", discountCodeId);
}

/* -------------------- Variação: espelho do domínio (D9) -------------------- */

/**
 * Espelho de `src/services/variations.ts` — que é a FONTE DE VERDADE.
 *
 * Existe porque o stock por Combinação vive em
 * `stores.customization.productVariations[<productId>].combinations[].stock`
 * (decisão D1) e o servidor tem de o validar e abater: sem isto um Cliente
 * esgota o tamanho M enquanto o `products.stock` do Produto inteiro ainda tem
 * unidades. `api/` é JavaScript sem passo de compilação e **não pode importar de
 * `src/`** (mundos de módulos distintos; `api/_seo.js` é o precedente), por isso
 * a lógica é duplicada.
 *
 * **Só é espelhado o que o servidor decide:** a normalização dos eixos, a
 * validação posicional das Combinação, a chave da Combinação, a leitura do
 * `stock`, e — desde que o preço das encomendas passou a ser calculado no
 * servidor — o preço efetivo, o modo de preço e a etiqueta legível. O produto
 * cartesiano não entra em nenhuma decisão do servidor e por isso não aparece
 * aqui. Ao alterar qualquer uma destas regras, **alterar nos dois sítios**;
 * `tests/serverStock.test.ts` e `tests/serverOrder.test.ts` comparam os dois
 * módulos e falham se divergirem (`SEO.md` §5.2).
 *
 * As três leituras de `stock` que têm de coincidir com o domínio (R4.11, R4.12):
 * **ausente** = não controlado, passa sempre; **`0`** = esgotado, recusa;
 * **positivo** = disponível. Uma Combinação **não gravada** conta como
 * disponível — um campo em falta nunca bloqueia uma venda.
 */

/** Separador dos valores dentro de uma chave de Combinação. Espelha `VALUE_SEPARATOR`. */
const VARIANT_VALUE_SEPARATOR = "\u001F";

/** Objeto onde faça sentido ler campos, ou `null`. Espelha `asRecord`. */
function asVariationRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}

/**
 * Etiqueta aparada, ou `undefined` quando não é texto com conteúdo. Espelha
 * `asLabel`: o `trim` é aplicado ao valor devolvido, porque `"M"` e `"M "` não
 * podem ser duas versões distintas do mesmo Produto.
 */
function asVariationLabel(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Stock em unidades inteiras não negativas, ou `undefined` para «não
 * controlado». Espelha `asStock`: negativo passa a `0` (esgotado, a leitura
 * segura), fracionário desce para o inteiro abaixo, e tudo o que não seja número
 * finito conta como ausente.
 */
function asVariationStock(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

/** Eixos utilizáveis de uma lista de forma desconhecida. Espelha `normalizeAxes`. */
function normalizeVariationAxes(value) {
  const axes = [];
  if (!Array.isArray(value)) return axes;
  for (const entry of value) {
    const record = asVariationRecord(entry);
    if (!record) continue;
    const name = asVariationLabel(record.name);
    if (name === undefined) continue;
    const values = [];
    for (const rawValue of (Array.isArray(record.values) ? record.values : [])) {
      const label = asVariationLabel(rawValue);
      if (label === undefined) continue;
      if (values.includes(label)) continue;
      values.push(label);
    }
    if (values.length === 0) continue;
    axes.push({ name, values });
  }
  return axes;
}

/**
 * Chave estável de uma Combinação: os valores por ordem de eixo unidos por
 * U+001F. Espelha `variantKeyOf`. Valores que não sejam texto contam como cadeia
 * vazia, para a função não lançar.
 */
export function variantKeyOfValues(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => (typeof value === "string" ? value : ""))
    .join(VARIANT_VALUE_SEPARATOR);
}

/**
 * `variantKey` utilizável de uma linha de encomenda, ou `undefined`.
 *
 * Mesma regra de `lineKeyOf` em `web/lib/cart.ts`: só texto com conteúdo conta.
 * Um item legado (sem o campo) e um item com a chave manipulada à mão dão os
 * dois `undefined`, e uma linha com `undefined` corre o caminho de hoje — só o
 * `products.stock` do Produto é validado e abatido.
 */
export function asVariantKey(value) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Entrada de Variação utilizável de um Produto, ou `null`. Espelha os casos de
 * `null` de `normalizeVariations` — e é esse `null` que mantém o comportamento
 * atual inalterado (R4.16): `custom` não é objeto, `productVariations` não é
 * objeto, a entrada do Produto não é objeto, `enabled !== true` (comparação
 * estrita, sem coerção), `axes` não é array, ou não sobra nenhum eixo com
 * valores.
 *
 * `combinations` sai **crua** (tal como está gravada), porque `decrementStock`
 * precisa de escrever no próprio objeto; a validação posicional é feita em
 * `findStoredCombination`.
 */
function variationEntryOf(custom, productId) {
  const map = asVariationRecord(asVariationRecord(custom)?.productVariations);
  if (!map) return null;
  if (typeof productId !== "string" || productId === "") return null;
  const entry = asVariationRecord(map[productId]);
  if (!entry) return null;
  if (entry.enabled !== true) return null;
  if (!Array.isArray(entry.axes)) return null;
  const axes = normalizeVariationAxes(entry.axes);
  if (axes.length === 0) return null;
  return {
    axes,
    priceMode: asPriceMode(entry.priceMode),
    combinations: Array.isArray(entry.combinations) ? entry.combinations : [],
  };
}

/**
 * Combinação gravada que corresponde a `variantKey`, ou `null`. Espelha
 * `normalizeCombinations` + `findCombination` numa só passagem.
 *
 * Impõe a invariante posicional do domínio: uma Combinação só conta quando é um
 * objeto, tem `values` com **um valor por eixo** e cada `values[i]` é um dos
 * valores de `axes[i]` — um valor que o Dono removeu do eixo deixa de existir
 * (R4.19). Chaves duplicadas na lista gravada ficam pela **primeira ocorrência**,
 * como no domínio, para a escolha ser determinista.
 *
 * `null` **não é erro**: é «o Dono não gravou esta versão do Produto», que conta
 * como disponível (R4.12).
 *
 * @returns `{ record, stock }` — `record` é o objeto gravado (para escrever) e
 *          `stock` o valor normalizado, ou `undefined` para não controlado.
 */
function findStoredCombination(custom, productId, variantKey) {
  const key = asVariantKey(variantKey);
  if (key === undefined) return null;
  const entry = variationEntryOf(custom, productId);
  if (!entry) return null;
  const seen = new Set();
  for (const raw of entry.combinations) {
    const record = asVariationRecord(raw);
    if (!record) continue;
    const rawValues = Array.isArray(record.values) ? record.values : [];
    if (rawValues.length !== entry.axes.length) continue;
    const values = [];
    for (let i = 0; i < entry.axes.length; i += 1) {
      const label = asVariationLabel(rawValues[i]);
      if (label === undefined || !entry.axes[i].values.includes(label)) break;
      values.push(label);
    }
    if (values.length !== entry.axes.length) continue;
    const candidate = variantKeyOfValues(values);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (candidate !== key) continue;
    return { record, stock: asVariationStock(record.stock) };
  }
  return null;
}

/**
 * Stock da Combinação `variantKey` do Produto `productId`, ou `undefined` para
 * «não controlado».
 *
 * `undefined` cobre, deliberadamente, os quatro casos que **passam sempre**: o
 * Produto não tem Variação ativas, a linha não traz `variantKey`, a Combinação
 * não está gravada (R4.12) e a Combinação está gravada sem `stock` (R4.11). É o
 * equivalente de `combinationAvailable` do domínio, com o número à vista para
 * quem precisa de comparar quantidades.
 */
export function combinationStockOf(custom, productId, variantKey) {
  const found = findStoredCombination(custom, productId, variantKey);
  return found ? found.stock : undefined;
}

/* --------------------------------- Stock ---------------------------------- */

/**
 * Lê a Personalização de uma Loja, ou `null`. Uma falha de leitura devolve
 * `null` e o stock por Combinação deixa de ser validado — nunca faz a compra
 * falhar por causa de um campo que pode não existir.
 */
async function readCustomization(db, storeId) {
  if (!storeId) return null;
  try {
    const { data } = await db.from("stores").select("customization").eq("id", String(storeId)).maybeSingle();
    return asVariationRecord(data?.customization);
  } catch {
    return null;
  }
}

/** Chave de agregação de uma linha: Produto + Combinação. Espelha `cartLineKey`. */
function aggregateKey(id, variantKey) {
  return `${id}|${variantKey ?? ""}`;
}

/**
 * Verifica se há stock suficiente para os itens com `id`. Devolve o nome do
 * primeiro produto sem stock, ou `null` se tudo ok. Itens com stock NULL (não
 * controlado) são ignorados.
 *
 * ## As quantidades são somadas antes de comparar
 *
 * A comparação é feita sobre a quantidade **agregada** — por `id` de Produto
 * contra `products.stock`, e por `(id, variantKey)` contra o `stock` da
 * Combinação. Comparar linha a linha deixava passar duas linhas de 3 unidades do
 * mesmo Produto com stock 3, e desde as Variação de Produto isso deixou de ser
 * um caso raro: duas Combinação do mesmo Produto **são** duas linhas (R4.13).
 *
 * @param storeId Loja da encomenda. Sem ele o stock por Combinação não é
 *        validado e o comportamento é o de antes das Variação.
 */
export async function checkStock(db, products, storeId) {
  const items = (products || []).filter((p) => p && p.id);
  if (!items.length) return null;

  // Uma passagem para somar: por Produto e por (Produto, Combinação).
  const byProduct = new Map();
  const byVariant = new Map();
  for (const it of items) {
    const id = String(it.id);
    const qty = Number(it.productQuantity) || 0;
    byProduct.set(id, (byProduct.get(id) || 0) + qty);
    const variantKey = asVariantKey(it.variantKey);
    if (variantKey === undefined) continue;
    const key = aggregateKey(id, variantKey);
    const acc = byVariant.get(key);
    if (acc) acc.quantity += qty;
    else byVariant.set(key, { id, variantKey, quantity: qty, name: it.productName });
  }

  const { data } = await db.from("products").select("id, name, stock").in("id", [...byProduct.keys()]);
  const byId = new Map((data || []).map((r) => [String(r.id), r]));
  for (const [id, quantity] of byProduct) {
    const row = byId.get(id);
    if (row && row.stock != null && quantity > Number(row.stock)) {
      return row.name || "produto";
    }
  }

  // Stock por Combinação: só chega aqui quando alguma linha traz `variantKey`,
  // por isso uma Loja sem Variação não ganha nem uma leitura à base de dados.
  if (!byVariant.size) return null;
  const custom = await readCustomization(db, storeId);
  if (!custom) return null;
  for (const { id, variantKey, quantity, name } of byVariant.values()) {
    const stock = combinationStockOf(custom, id, variantKey);
    if (stock !== undefined && quantity > stock) {
      return byId.get(id)?.name || name || "produto";
    }
  }
  return null;
}

/**
 * Abate o stock vendido: o `products.stock` do Produto e, quando a linha traz
 * `variantKey`, o `stock` da Combinação.
 *
 * O abate do Produto é o de sempre — leitura fresca por linha, o que já soma
 * corretamente duas linhas do mesmo Produto (lê 10, escreve 7; lê 7, escreve 4).
 * O abate por Combinação é uma leitura-modificação-escrita da coluna JSON
 * `customization`, por isso os abates de todas as linhas são **juntados e
 * gravados numa única escrita** por encomenda: uma escrita por linha perderia os
 * abates anteriores em cada releitura.
 *
 * @param storeId Loja da encomenda. Sem ele só o stock do Produto é abatido.
 */
export async function decrementStock(db, products, storeId) {
  const items = (products || []).filter((p) => p && p.id);
  if (!items.length) return;

  for (const it of items) {
    const { data: row } = await db.from("products").select("stock").eq("id", String(it.id)).maybeSingle();
    if (row && row.stock != null) {
      const next = Math.max(0, Number(row.stock) - Number(it.productQuantity || 0));
      await db.from("products").update({ stock: next }).eq("id", String(it.id));
    }
  }

  // Agregar os abates de Combinação por (Produto, Combinação).
  const byVariant = new Map();
  for (const it of items) {
    const variantKey = asVariantKey(it.variantKey);
    if (variantKey === undefined) continue;
    const id = String(it.id);
    const key = aggregateKey(id, variantKey);
    const acc = byVariant.get(key);
    if (acc) acc.quantity += Number(it.productQuantity) || 0;
    else byVariant.set(key, { id, variantKey, quantity: Number(it.productQuantity) || 0 });
  }
  if (!byVariant.size) return;

  const custom = await readCustomization(db, storeId);
  if (!custom) return;
  let changed = false;
  for (const { id, variantKey, quantity } of byVariant.values()) {
    const found = findStoredCombination(custom, id, variantKey);
    if (!found || found.stock === undefined) continue; // não controlado: nada a abater
    found.record.stock = Math.max(0, found.stock - quantity);
    changed = true;
  }
  if (!changed) return;
  await db.from("stores").update({ customization: custom }).eq("id", String(storeId));
}

/**
 * A conta tem subscrição ativa? Espelha `resolveBilling` de
 * `src/services/billing.ts` — e agora consegue mesmo espelhá-lo, porque é uma
 * data e uma comparação.
 *
 * A versão anterior (`effectivePlanId`) tinha de reproduzir quatro ramos e
 * falhava num: um plano gravado sem data de expiração era permanente para o
 * painel e «básico» para o servidor. O resultado era uma loja com pagamentos
 * ligados a recusar cobrar aos clientes, com `PLAN_NOT_COVERED`.
 *
 * `profile` tem de trazer `is_admin` e `plan_expires_at`.
 */
export function accountActive(profile, now = Date.now()) {
  if (!profile) return false;
  if (profile.is_admin === true) return true;
  const expMs = profile.plan_expires_at ? Date.parse(profile.plan_expires_at) : NaN;
  return Number.isFinite(expMs) && expMs > now;
}

/**
 * A loja está online? Dono administrador, ou a subscrição DA LOJA em vigor
 * (migração 0025). É a regra da política `stores_public_read`, e o que
 * `resolveBilling({ planExpiresAt: store.planExpiresAt, isAdmin })` diz no
 * painel.
 *
 * `store` tem de trazer `plan_expires_at`; `owner`, o `is_admin` do dono.
 */
export function storeActive(store, owner, now = Date.now()) {
  if (!store) return false;
  return accountActive({ is_admin: owner?.is_admin === true, plan_expires_at: store.plan_expires_at ?? null }, now);
}

/* --------------------- Preço calculado no servidor ------------------------- */

/**
 * Modo de preço das Combinação. Espelha `asPriceMode` de
 * `src/services/variations.ts`: só `"acresce"` é `"acresce"`.
 */
function asPriceMode(value) {
  return value === "acresce" ? "acresce" : "substitui";
}

/**
 * Preço efetivo de uma Combinação. Espelha `effectivePrice` de
 * `src/services/variations.ts`: sem preço → preço base; `"substitui"` → o da
 * Combinação; `"acresce"` → base + Combinação; sempre finito e ≥ 0.
 */
export function effectivePriceOf(basePrice, combination, mode) {
  const base = typeof basePrice === "number" && Number.isFinite(basePrice) ? basePrice : 0;
  const raw = asVariationRecord(combination)?.price;
  const price = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  let value;
  if (price === undefined) value = base;
  else if (asPriceMode(mode) === "acresce") value = base + price;
  else value = price;
  if (Number.isNaN(value)) return 0;
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  return value < 0 ? 0 : value;
}

/** Etiqueta legível de uma Combinação («Cor: Azul · Tamanho: M»). Espelha `variantLabelOf`. */
export function variantLabelOfValues(axes, values) {
  const list = Array.isArray(values) ? values : [];
  const parts = [];
  (Array.isArray(axes) ? axes : []).forEach((axis, i) => {
    const name = asVariationLabel(asVariationRecord(axis)?.name);
    const value = asVariationLabel(list[i]);
    if (name === undefined || value === undefined) return;
    parts.push(`${name}: ${value}`);
  });
  return parts.join(" · ");
}

/**
 * Preço e etiqueta de UMA linha da encomenda, a partir da base de dados e da
 * Personalização da Loja — nunca do que o navegador disse.
 *
 * - Produto **sem** Variação ativas: preço do Produto. Uma `variantKey` que
 *   venha na linha é ignorada (carrinho guardado antes de o Dono desligar as
 *   Variação).
 * - Produto **com** Variação: a `variantKey` é obrigatória e tem de ter um valor
 *   válido por eixo; o preço é o efetivo da Combinação (uma Combinação válida
 *   mas não gravada vale o preço base, como no domínio).
 *
 * @returns `{ ok: true, price, label, variantKey }` ou `{ ok: false }`.
 */
export function linePriceOf(custom, productId, variantKey, basePrice) {
  const entry = variationEntryOf(custom, productId);
  if (!entry) return { ok: true, price: effectivePriceOf(basePrice, null, "substitui"), label: "", variantKey: undefined };
  const key = asVariantKey(variantKey);
  if (key === undefined) return { ok: false };
  const values = key.split(VARIANT_VALUE_SEPARATOR);
  if (values.length !== entry.axes.length) return { ok: false };
  for (let i = 0; i < values.length; i += 1) {
    if (!entry.axes[i].values.includes(values[i])) return { ok: false };
  }
  const found = findStoredCombination(custom, productId, key);
  return {
    ok: true,
    price: effectivePriceOf(basePrice, found ? found.record : null, entry.priceMode),
    label: variantLabelOfValues(entry.axes, values),
    variantKey: key,
  };
}

/* ------------------------------- Entregas ---------------------------------- */

/**
 * Áreas de entrega de Luanda. Espelho de `LUANDA_AREAS` de `web/lib/areas.ts`
 * (a mesma lista, pela mesma ordem). `tests/serverOrder.test.ts` compara as duas.
 */
export const LUANDA_AREAS = [
  "Benfica", "Cacuaco", "Calemba 2", "Camama", "Cassequel", "Cidade", "Escongolenses",
  "Golf 2", "Kilamba", "Morro Bento", "Nova Vida", "Palanca", "Prenda", "Rocha Pinto",
  "Samba", "Sequel", "Talatona", "Viana", "Zango",
];

/** Áreas servidas e respetiva taxa. Espelha `deliveredAreas` de `web/lib/areas.ts`. */
export function deliveredAreasOf(delivery) {
  const d = asVariationRecord(delivery);
  if (!d) return [];
  const mode = d.mode ?? (d.flatFee != null ? "single" : "perArea");
  if (mode === "single") {
    const fee = Math.max(0, Number(d.flatFee) || 0);
    return LUANDA_AREAS.map((a) => ({ name: a, fee }));
  }
  const fees = asVariationRecord(d.fees) ?? {};
  return LUANDA_AREAS.filter((a) => typeof fees[a] === "number").map((a) => ({ name: a, fee: Number(fees[a]) }));
}

/**
 * Taxa de entrega de uma encomenda com produtos físicos. Mesma regra do
 * checkout (`web/views/checkout.ts`): a área tem de ser uma das servidas pela
 * Loja (quando ela serve alguma), e a entrega é grátis a partir de `freeAbove`.
 *
 * @returns `{ ok: true, fee }` ou `{ ok: false }` quando a área falta ou não é servida.
 */
export function deliveryFeeOf(delivery, area, subtotal) {
  const areas = deliveredAreasOf(delivery);
  if (!areas.length) return { ok: true, fee: 0 };
  const found = areas.find((a) => a.name === area);
  if (!found) return { ok: false };
  const freeAbove = Math.max(0, Number(asVariationRecord(delivery)?.freeAbove) || 0);
  return { ok: true, fee: freeAbove > 0 && subtotal >= freeAbove ? 0 : found.fee };
}

/* ------------------------------- Descontos --------------------------------- */

/**
 * Valor do desconto, nunca superior ao total. Espelha `discountAmount` de
 * `web/supabase/discounts.ts`.
 */
export function discountAmountOf(code, total) {
  const value = Number(asVariationRecord(code)?.value) || 0;
  const raw = code?.type === "percent" ? (total * value) / 100 : value;
  return Math.max(0, Math.min(total, Math.round(raw)));
}

/* ----------------------- Comissão da Plataforma (5%) ----------------------- */

/**
 * Espelho de `PLATFORM_FEE_RATE` em `src/services/fees.ts`.
 *
 * `api/` é JavaScript sem passo de compilação e não pode importar de `src/`
 * (`SEO.md` §5.2). Alterar aqui **e** lá; `tests/fees.test.ts` compara os dois e
 * falha se divergirem.
 */
export const PLATFORM_FEE_RATE = 0.05;

/** Comissão da Plataforma sobre o total de uma venda digital, em Kz. */
export function platformFeeOf(total) {
  const n = Number(total);
  const t = Number.isFinite(n) && n > 0 ? n : 0;
  return Math.min(t, round2(t * PLATFORM_FEE_RATE));
}

/**
 * Comissão conforme o meio: o WhatsApp não passa pela Plataforma e por isso não
 * tem comissão. Espelha `feeForMethod` em `src/services/fees.ts`.
 */
export function feeForMethodOf(method, total) {
  return method === "whatsapp" ? 0 : platformFeeOf(total);
}
