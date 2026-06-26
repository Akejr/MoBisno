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

export function isValidProduct(p) {
  if (!p || typeof p.productName !== "string" || p.productName.trim() === "") return false;
  if (!Number.isFinite(Number(p.productPrice)) || Number(p.productPrice) <= 0) return false;
  if (!Number.isInteger(Number(p.productQuantity)) || Number(p.productQuantity) <= 0) return false;
  if (p.iva !== undefined && p.iva !== null && !VALID_IVA.includes(Number(p.iva))) return false;
  return true;
}

/** Sanitiza a lista de produtos para o formato aceite pela API. */
export function cleanProducts(products) {
  return (products || []).map((p) => {
    const item = {
      productName: String(p.productName),
      productPrice: Number(p.productPrice),
      productQuantity: Number(p.productQuantity),
    };
    if (p.id != null) item.id = String(p.id);
    if (p.iva !== undefined && p.iva !== null) item.iva = Number(p.iva);
    return item;
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

/** Duração de um período de subscrição (30 dias), em ms. */
const PLAN_PERIOD_MS = 30 * 24 * 3600 * 1000;
const VALID_PLANS = ["basico", "profissional", "empresarial"];

/**
 * Ativa/renova/agenda um plano após pagamento confirmado. Espelha
 * `src/services/billing.ts:planActivationPatch`:
 *  - renova o mesmo plano (estende o período);
 *  - agenda um plano diferente quando ainda há tempo (carry-over);
 *  - ativa já quando não há período em curso.
 */
export async function activatePlan(db, ownerId, newPlan) {
  if (!ownerId || !VALID_PLANS.includes(String(newPlan))) return;
  const now = Date.now();
  const { data: prof } = await db
    .from("profiles")
    .select("plan, plan_expires_at, next_plan")
    .eq("id", ownerId)
    .maybeSingle();
  const cur = prof?.plan || "basico";
  const expMs = prof?.plan_expires_at ? Date.parse(prof.plan_expires_at) : NaN;
  const activeTimed = cur !== "basico" && Number.isFinite(expMs) && expMs > now;

  let patch;
  if (activeTimed) {
    if (newPlan === cur) {
      patch = { plan_expires_at: new Date(expMs + PLAN_PERIOD_MS).toISOString(), next_plan: null };
    } else {
      patch = { next_plan: newPlan };
    }
  } else {
    patch = { plan: newPlan, plan_expires_at: new Date(now + PLAN_PERIOD_MS).toISOString(), next_plan: null };
  }
  await db.from("profiles").update(patch).eq("id", ownerId);
}

/** Credita mensagens SMS no saldo de uma loja (idempotência gerida por quem chama). */
export async function creditSms(db, storeId, quantity) {
  const qty = Number(quantity);
  if (!storeId || !Number.isFinite(qty) || qty <= 0) return;
  const { data } = await db.from("stores").select("sms_credits").eq("id", storeId).maybeSingle();
  const cur = Number(data?.sms_credits ?? 0);
  await db.from("stores").update({ sms_credits: cur + qty }).eq("id", storeId);
}

/** Incrementa os usos de um código de desconto. */
export async function bumpDiscountUse(db, discountCodeId) {
  if (!discountCodeId) return;
  const { data } = await db.from("discount_codes").select("uses").eq("id", discountCodeId).maybeSingle();
  if (!data) return;
  await db.from("discount_codes").update({ uses: Number(data.uses ?? 0) + 1 }).eq("id", discountCodeId);
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
