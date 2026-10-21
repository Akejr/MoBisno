/**
 * Cliente da **Wiza** (WizaPay) — o único ficheiro que fala com a API de
 * pagamentos. Multicaixa Express e Referência Bancária.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * ## O modelo da Wiza, em quatro passos
 *
 * 1. `POST /v1/credentials/token` — OAuth2 *client credentials*, token de 1 hora.
 * 2. `POST /v1/hosts/payments` — cria a cobrança. Responde **303 sem corpo**: o
 *    que interessa está no cabeçalho `Location`, com o `id` e o `nonce`.
 * 3. O cliente paga no **checkout alojado** da Wiza (é lá que ele escolhe entre
 *    Express e Referência — não no nosso checkout).
 * 4. `GET /v1/hosts/payments/{id}` — **a única fonte de verdade** sobre se o
 *    pagamento aconteceu.
 *
 * ## As três armadilhas que este ficheiro resolve
 *
 * - **O 303 não pode ser seguido.** Quase todos os clientes HTTP seguem um 303
 *   sozinhos; quem o fizer perde o `Location` e fica sem o `id` — sem id não há
 *   forma de confirmar o pagamento. Daí o `redirect: "manual"`.
 * - **A janela de ~5 minutos.** `GET /hosts/payments/{id}` só responde durante
 *   cerca de cinco minutos a contar da criação; depois devolve 404, pago ou não.
 *   O Express resolve-se dentro da janela; uma Referência paga horas depois cai
 *   sempre fora dela, e aí a única pista é o callback — que tem de ser
 *   autenticado por outra via (`api/payment-webhook.js`).
 * - **A API aceita e recusa tarde.** O `POST` devolve 303 mesmo com moeda errada
 *   ou valor absurdo; a recusa acontece depois, no processador. Um valor abaixo
 *   de 100 Kz é aceite, o cliente paga e o dinheiro não é creditado — por isso o
 *   mínimo é validado **aqui**, antes de criar a cobrança.
 *
 * Nada deste ficheiro chega ao navegador: o `client_secret` é de servidor.
 */

/** Base da API. A mesma em sandbox e em produção — quem decide são as credenciais. */
const BASE = (process.env.WIPAY_BASE_URL || "https://api.wipay.ao").replace(/\/+$/, "");

/** Montante mínimo de uma cobrança, em Kz. Abaixo disto o valor não é creditado. */
export const MIN_PAYMENT_KZ = 100;

/** Tempo de vida útil da janela de consulta do estado, em ms (~5 min, com margem). */
export const STATUS_WINDOW_MS = 5 * 60 * 1000;

/** Segundos antes da expiração a partir dos quais o token é renovado. */
const TOKEN_MARGIN_S = 60;

/** Timeout de cada chamada, em ms. */
const TIMEOUT_MS = 15_000;

/** As credenciais estão configuradas? */
export function wizaConfigured() {
  return !!(process.env.WIPAY_CLIENT_ID && process.env.WIPAY_CLIENT_SECRET);
}

/** `fetch` com timeout — uma chamada pendurada não pode bloquear a função. */
async function call(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* --------------------------------- Token --------------------------------- */

/** Token em cache por instância: qualquer token válido serve. */
let cache = { token: "", expiresAt: 0 };

/**
 * Token de acesso, reutilizado enquanto for válido.
 *
 * Pedir um token por cobrança funciona, mas é uma ida à rede em cada venda.
 */
export async function wizaToken() {
  if (cache.token && Date.now() < cache.expiresAt) return cache.token;
  const r = await call(`${BASE}/v1/credentials/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.WIPAY_CLIENT_ID,
      client_secret: process.env.WIPAY_CLIENT_SECRET,
      scope: "payment",
    }),
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    // O detalhe fica no registo: pode trazer o identificador do comerciante.
    console.error("[wiza] token", r.status, detalhe.slice(0, 300));
    throw new Error(`WIZA_TOKEN_${r.status}`);
  }
  const j = await r.json();
  const token = String(j?.access_token || "");
  if (!token) throw new Error("WIZA_TOKEN_EMPTY");
  const vida = Number(j?.expires_in);
  const segundos = Number.isFinite(vida) && vida > TOKEN_MARGIN_S ? vida - TOKEN_MARGIN_S : 300;
  cache = { token, expiresAt: Date.now() + segundos * 1000 };
  return token;
}

/** Esquece o token em cache (usado quando a Wiza responde 401). */
export function forgetWizaToken() {
  cache = { token: "", expiresAt: 0 };
}

/* ------------------------------- Formatos -------------------------------- */

/**
 * Montante no formato que a Wiza quer: **string com duas casas decimais**.
 * `50000` → `"50000.00"`.
 */
export function wizaAmount(kz) {
  const n = Number(kz);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/**
 * Telemóvel no formato que a Wiza quer: **9 algarismos, sem o 244**.
 * Aceita `923456789`, `+244 923 456 789` ou `244923456789`.
 */
export function wizaPhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  const nove = d.startsWith("244") ? d.slice(3) : d;
  return /^9\d{8}$/.test(nove) ? nove : null;
}

/** O `service` da Wiza → o nosso método. `gpo` = Express, `reference` = Referência. */
export function methodFromService(service) {
  if (service === "gpo") return "mcx";
  if (service === "reference") return "reference";
  return null;
}

/* ----------------------------- Criar cobrança ----------------------------- */

/**
 * Cria a cobrança e devolve o endereço do checkout alojado.
 *
 * @returns `{ ok: true, id, nonce, hostedUrl }` ou `{ ok: false, code, error }`.
 */
export async function wizaCreateCharge({ amountKz, referenceId, phone, callbackUrl, successUrl, failureUrl }) {
  const amount = wizaAmount(amountKz);
  if (!amount) return { ok: false, code: "INVALID_TOTAL", error: "O total da encomenda não é válido." };
  if (Number(amountKz) < MIN_PAYMENT_KZ) {
    // Validado deste lado de propósito: a Wiza aceitaria, o cliente pagaria e o
    // valor não seria creditado.
    return { ok: false, code: "AMOUNT_TOO_LOW", error: `O valor mínimo de um pagamento é ${MIN_PAYMENT_KZ} Kz.` };
  }
  const customer = wizaPhone(phone);
  if (!customer) return { ok: false, code: "MISSING_PHONE", error: "Indique um número de telemóvel angolano válido." };

  const body = {
    amount,
    currency: "aoa",
    reference_id: String(referenceId),
    customer,
    callback_url: callbackUrl,
    success_url: successUrl,
    failure_url: failureUrl,
  };

  let r;
  try {
    const token = await wizaToken();
    r = await call(`${BASE}/v1/hosts/payments`, {
      method: "POST",
      redirect: "manual", // o 303 NÃO pode ser seguido: perdia-se o `Location`
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      forgetWizaToken();
      const novo = await wizaToken();
      r = await call(`${BASE}/v1/hosts/payments`, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${novo}` },
        body: JSON.stringify(body),
      });
    }
  } catch (e) {
    console.error("[wiza] criar cobrança", e);
    return { ok: false, code: "GATEWAY_ERROR", error: "Não foi possível contactar o serviço de pagamentos." };
  }

  const location = r.headers.get("location");
  // 303 é o sucesso. Alguns ambientes devolvem 302 com o mesmo cabeçalho.
  if (!location || (r.status !== 303 && r.status !== 302)) {
    const detalhe = await r.text().catch(() => "");
    console.error("[wiza] criar cobrança", r.status, detalhe.slice(0, 300));
    return { ok: false, code: "GATEWAY_ERROR", error: "O serviço de pagamentos recusou o pedido." };
  }

  let url;
  try {
    url = new URL(location);
  } catch {
    console.error("[wiza] Location inválido", location.slice(0, 200));
    return { ok: false, code: "GATEWAY_ERROR", error: "O serviço de pagamentos devolveu um endereço inválido." };
  }
  const id = url.searchParams.get("id");
  const nonce = url.searchParams.get("nonce");
  if (!id) return { ok: false, code: "GATEWAY_ERROR", error: "O serviço de pagamentos não devolveu a referência." };
  return { ok: true, id, nonce: nonce || "", hostedUrl: url.toString() };
}

/* ------------------------------ Ler o estado ------------------------------ */

/**
 * Estado de uma cobrança — a decisão sobre se o pagamento aconteceu.
 *
 * @returns `{ status: "open"|"paid"|"failed", statusCode, service, amount }`,
 *          ou `{ notFound: true }` quando a janela de ~5 minutos fechou.
 */
export async function wizaStatus(id) {
  let r;
  try {
    r = await call(`${BASE}/v1/hosts/payments/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    console.error("[wiza] estado", e);
    return { error: true };
  }
  // Fora da janela. Não é erro, e **não** quer dizer que não foi pago.
  if (r.status === 404) return { notFound: true };
  if (!r.ok) {
    console.error("[wiza] estado", r.status);
    return { error: true };
  }
  const j = await r.json().catch(() => null);
  if (!j) return { error: true };
  const ultima = Array.isArray(j.transactions) && j.transactions.length ? j.transactions[j.transactions.length - 1] : {};
  return {
    status: j.status === "accepted" ? "paid" : j.status === "rejected" ? "failed" : "open",
    statusCode: ultima.status_code ? String(ultima.status_code) : null,
    service: ultima.service ? String(ultima.service) : null,
    amount: j.amount != null ? Number(j.amount) : null,
    referenceId: j.reference_id ? String(j.reference_id) : null,
  };
}

/**
 * Entidade e referência para pagar no ATM, quando o cliente escolhe Referência.
 *
 * Aparece uns segundos depois de ele escolher o método; antes disso a Wiza
 * devolve 404, **o que é normal e não é erro**.
 */
export async function wizaReference(id) {
  let r;
  try {
    r = await call(`${BASE}/v1/hosts/transactions/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j) return null;
  const numero = j.reference ?? j.reference_number ?? null;
  if (!numero) return null;
  return {
    entity: String(j.entity ?? j.entity_number ?? ""),
    number: String(numero),
    dueDate: j.due_date ?? j.expires_at ?? null,
    service: j.service ? String(j.service) : null,
  };
}

/* ---------------------------- Códigos de estado ---------------------------- */

/**
 * Frase para o comprador, a partir do `status_code` da última transação.
 *
 * Guardar o código na encomenda é o que permite explicar uma recusa em vez de
 * dizer «não foi possível».
 */
export const WIZA_STATUS_MESSAGES = {
  2000: null, // sucesso
  3000: "Não foi possível usar essa conta.",
  3001: "Saldo insuficiente.",
  3002: "O pagamento foi recusado no telemóvel.",
  3003: "O tempo para autorizar esgotou. Tente novamente.",
  3004: "Não foi possível confirmar. Tente novamente.",
  3005: "PIN incorrecto.",
  3006: "Valor demasiado baixo.",
  4000: "Serviço indisponível. Tente mais tarde.",
  4003: "Serviço indisponível. Tente mais tarde.",
  4004: "A transacção expirou. Tente novamente.",
  9000: "Ocorreu um erro. Tente novamente.",
};

/** A frase do código, ou uma genérica. */
export function wizaStatusMessage(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return "Ocorreu um erro. Tente novamente.";
  const m = WIZA_STATUS_MESSAGES[n];
  return m === undefined ? "Ocorreu um erro. Tente novamente." : m;
}
