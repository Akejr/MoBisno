/**
 * Utilitários partilhados pelas funções serverless de pagamentos (MoMenu).
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * Segredos (apenas no servidor, via variáveis de ambiente):
 *  - SUPABASE_URL                 (ou VITE_SUPABASE_URL)
 *  - SUPABASE_SERVICE_ROLE_KEY    (service role; ignora o RLS para ler chaves e
 *                                  gravar encomendas)
 *  - MOMENU_PLATFORM_API_KEY      (chave MoMenu da plataforma, para os planos)
 *  - MOMENU_BASE_URL              (opcional; por omissão https://api.momenu.online)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const MOMENU_BASE = process.env.MOMENU_BASE_URL || "https://api.momenu.online";
export const PLATFORM_API_KEY = process.env.MOMENU_PLATFORM_API_KEY || "";

export const FEE_RATE = 0.02;
export const MIN_PAYMENT_KZ = 100;
const VALID_IVA = [0, 2, 5, 7, 14];

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
    platformApiKey: !!PLATFORM_API_KEY,
  };
}

/** Mensagem acionável quando faltam variáveis de ambiente no servidor. */
export function missingEnvMessage() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_ROLE) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return `Pagamentos não configurados no servidor. Defina ${missing.join(", ")} no Vercel (Settings → Environment Variables) e faça redeploy.`;
}

export function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

export function productsTotal(products) {
  return round2((products || []).reduce((s, p) => s + Number(p.productPrice) * Number(p.productQuantity), 0));
}

export function computeFee(amount) {
  return round2(amount * FEE_RATE);
}

export function computeNet(amount) {
  return round2(amount - computeFee(amount));
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
  if (p.iva !== undefined && p.iva !== null && !VALID_IVA.includes(Number(p.iva))) return false;
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
    if (p.iva !== undefined && p.iva !== null) item.iva = Number(p.iva);
    const variantKey = asVariantKey(p.variantKey);
    if (variantKey !== undefined) item.variantKey = variantKey;
    return item;
  });
}

/**
 * Copia as linhas **sem** `variantKey`, para o corpo enviado à API MoMenu.
 *
 * A chave da Combinação é interna à Plataforma: identifica o que foi vendido
 * para efeitos de stock, não entra na fatura e não pertence ao contrato da
 * MoMenu. Fica gravada em `orders.products`, que é de onde o webhook a lê para
 * abater o stock quando uma Referência Bancária é confirmada mais tarde.
 */
export function momenuProducts(products) {
  return (products || []).map((p) => {
    const { variantKey: _ignorada, ...rest } = p;
    return rest;
  });
}

export function mapMomenuStatus(operationStatus) {
  switch (String(operationStatus)) {
    case "1": return "paid";
    case "3": return "cancelled";
    case "4": return "failed";
    case "5": return "failed";
    default: return "open";
  }
}

export function mapStatusString(status) {
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

/** Duração de cada ciclo de pagamento, em ms. Espelha `PERIOD_DAYS` de `src/services/plans.ts`. */
const PERIOD_MS = { mensal: 30 * 24 * 3600 * 1000, anual: 365 * 24 * 3600 * 1000 };

/**
 * Preço de **uma** Loja por ciclo, em Kwanzas. Espelho manual de `PRICE_KZ` de
 * `src/services/plans.ts` — `api/` é JavaScript sem passo de compilação e não pode
 * importar de `src/` (`SEO.md` §5.2).
 *
 * Está aqui, e não no cliente, porque é o servidor que calcula o montante de um
 * pagamento de plano: com o preço por Loja, deixar o navegador dizer o valor era
 * deixá-lo escolher quanto paga e por quantas Lojas.
 *
 * `tests/planParity.test.ts` compara este objeto com o do domínio: mudar o preço
 * num sítio e esquecer o outro falha o portão.
 */
export const PLAN_PRICE_KZ = { mensal: 11000, anual: 120000 };

/** Ciclo a partir de um valor de origem desconhecida. Recorre ao mais barato. */
function asPeriod(value) {
  return value === "anual" ? "anual" : "mensal";
}

/**
 * Ativa/renova a subscrição após pagamento confirmado. Espelha
 * `src/services/billing.ts:planActivationPatch`: renovar acrescenta o ciclo AO
 * FIM do período atual, para quem paga adiantado não perder os dias que tinha;
 * sem período em curso, conta a partir de agora.
 *
 * Deixou de haver escalões, logo não há plano a trocar nem `next_plan` a
 * agendar — só uma data a empurrar para a frente.
 */
export async function activatePlan(db, ownerId, period, stores) {
  if (!ownerId) return;
  const now = Date.now();
  /*
   * `plan_stores` pode ainda não existir (migração 0020 não corrida), e um
   * `select` com coluna inexistente **falha o pedido inteiro**. Aqui isso custava
   * um pagamento: sem `plan_expires_at` a subscrição era activada a partir de
   * agora em vez do fim do período atual, e o `update` com a coluna nova falhava
   * em silêncio — dinheiro cobrado, plano não activado.
   */
  let prof = null;
  let temColunaLojas = true;
  {
    const comLojas = await db.from("profiles").select("plan_expires_at, plan_stores").eq("id", ownerId).maybeSingle();
    if (comLojas.error) {
      temColunaLojas = false;
      const semLojas = await db.from("profiles").select("plan_expires_at").eq("id", ownerId).maybeSingle();
      prof = semLojas.data;
    } else {
      prof = comLojas.data;
    }
  }
  const expMs = prof?.plan_expires_at ? Date.parse(prof.plan_expires_at) : NaN;
  const base = Number.isFinite(expMs) && expMs > now ? expMs : now;
  const fim = new Date(base + PERIOD_MS[asPeriod(period)]).toISOString();
  /*
   * Lojas pagas neste ciclo. Espelha `billableStores` de
   * `src/services/plans.ts`: nunca menos de uma, sempre inteiro.
   *
   * Quando o pagamento não diz quantas (uma referência antiga, gravada antes desta
   * mudança), fica o que a conta já tinha — e ausência vale uma, que é o que todas
   * as contas anteriores pagaram.
   */
  const pedidas = Number(stores);
  const lojas = Number.isFinite(pedidas) && pedidas >= 1
    ? Math.floor(pedidas)
    : Math.max(1, Math.floor(Number(prof?.plan_stores ?? 1)) || 1);
  // Sem a coluna, activa-se o essencial: a data. O número de lojas fica para
  // quando a migração correr — nunca ao contrário, que seria deixar a subscrição
  // sem activar por causa de uma coluna que ainda não existe.
  const patch = temColunaLojas
    ? { plan: "pro", plan_expires_at: fim, plan_stores: lojas }
    : { plan: "pro", plan_expires_at: fim };
  const escrita = await db.from("profiles").update(patch).eq("id", ownerId);
  if (escrita.error && temColunaLojas) {
    await db.from("profiles").update({ plan: "pro", plan_expires_at: fim }).eq("id", ownerId);
  }
}

/**
 * Lojas que um pagamento de plano cobre, ou `undefined`.
 *
 * Lido **à parte** da transação de propósito: `plan_payments.stores` nasceu na
 * migração 0020 e um `select` com coluna inexistente falha o pedido inteiro. Se
 * fosse pedido junto com `owner_id` e `period`, uma referência paga antes de a
 * migração correr não activava subscrição nenhuma — o pior resultado possível,
 * porque o dinheiro já entrou.
 *
 * `undefined` faz `activatePlan` cair no que a conta já tinha.
 *
 * @param ref Identificador da transação (`merchant_transaction_id` ou `operation_id`).
 */
export async function planPaymentStores(db, ref) {
  if (!ref) return undefined;
  const { data, error } = await db
    .from("plan_payments")
    .select("stores")
    .or(`merchant_transaction_id.eq.${ref},operation_id.eq.${ref}`)
    .maybeSingle();
  if (error) return undefined;
  const n = Number(data?.stores);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
}

/**
 * Lojas publicadas de um Dono, para o preço do plano.
 *
 * Exclui as **lojas-modelo** (identificador que começa por `modelo-`), pela mesma
 * razão que o painel pessoal as esconde: são demonstrações da Plataforma, criadas
 * pelo Administrador, e nenhum Dono as paga.
 *
 * Devolve `0` quando a consulta falha, e quem chama trata `0` como «uma» ao
 * cobrar — uma falha de leitura não pode inflacionar a fatura de ninguém.
 */
export async function countPublishedStores(db, ownerId) {
  if (!ownerId) return 0;
  const { data, error } = await db
    .from("stores")
    .select("identifier, state")
    .eq("owner_id", ownerId)
    .eq("state", "Publicada");
  if (error || !Array.isArray(data)) return 0;
  return data.filter((s) => !String(s?.identifier ?? "").startsWith("modelo-")).length;
}

/** Credita mensagens SMS no saldo de uma loja (idempotência gerida por quem chama). */
export async function creditSms(db, storeId, quantity) {
  const qty = Number(quantity);
  if (!storeId || !Number.isFinite(qty) || qty <= 0) return;
  const { data } = await db.from("stores").select("sms_credits").eq("id", storeId).maybeSingle();
  const cur = Number(data?.sms_credits ?? 0);
  await db.from("stores").update({ sms_credits: cur + qty }).eq("id", storeId);
}

/**
 * Cumpre uma compra de logótipo: acrescenta o `logo_url` a
 * `stores.customization.logos` e marca a compra como cumprida (idempotente).
 */
export async function fulfillLogo(db, purchaseId) {
  if (!purchaseId) return;
  const { data: lp } = await db
    .from("logo_purchases")
    .select("id, store_id, logo_url, fulfilled")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!lp || lp.fulfilled || !lp.store_id || !lp.logo_url) return;
  const { data: st } = await db.from("stores").select("customization").eq("id", lp.store_id).maybeSingle();
  const custom = (st && st.customization && typeof st.customization === "object") ? st.customization : {};
  const logos = Array.isArray(custom.logos) ? custom.logos.slice() : [];
  if (!logos.includes(lp.logo_url)) logos.push(lp.logo_url);
  custom.logos = logos;
  await db.from("stores").update({ customization: custom }).eq("id", lp.store_id);
  await db.from("logo_purchases").update({ fulfilled: true }).eq("id", lp.id);
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
 * **Só é espelhado o mínimo que o stock precisa:** a normalização dos eixos, a
 * validação posicional das Combinação, a chave da Combinação e a leitura do
 * `stock`. O preço efetivo, o modo de preço, o produto cartesiano e as etiquetas
 * legíveis não entram em nenhuma decisão de stock e por isso não aparecem aqui.
 * Ao alterar qualquer uma destas regras, **alterar nos dois sítios**;
 * `tests/serverStock.test.ts` compara os dois módulos e falha se divergirem
 * (`SEO.md` §5.2).
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
  return { axes, combinations: Array.isArray(entry.combinations) ? entry.combinations : [] };
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

/** Chamada à API MoMenu. `body` ausente → GET. */
export async function momenu(path, apiKey, body, qa) {
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey };
  if (qa) headers["x-env-qa"] = "true";
  const r = await fetch(`${MOMENU_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { data = {}; }
  return { ok: r.ok, status: r.status, data };
}
