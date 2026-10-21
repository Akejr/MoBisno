/**
 * Cliente do **Vero** — a Factura-Recibo certificada pela AGT.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * ## Quem emite a factura
 *
 * **A empresa do Dono, não a MôBisno.** Quem vende é a loja; a Plataforma só
 * cobra a comissão. Por isso as credenciais Vero usadas aqui são as da empresa
 * verificada de cada loja (`store_payments.vero_org_id` e `vero_api_key`), e não
 * uma chave da Plataforma: no Vero, o emissor do documento é a organização a que
 * a chave pertence.
 *
 * Uma loja sem credenciais Vero continua a vender e a receber — a encomenda fica
 * com `invoice_status = 'skipped'`. **A falha da factura nunca cancela a venda.**
 *
 * ## As quatro regras inquebráveis (do guia de integração)
 *
 * 1. **Valores em cêntimos**, não em Kwanzas: 1.000 Kz → `100000`. A conversão
 *    acontece num único sítio deste ficheiro. Um erro de 100× num documento
 *    fiscal só se corrige com nota de crédito.
 * 2. **Nunca enviar `taxRate`.** Em regime simplificado o servidor resolve a taxa
 *    sozinho; enviá-la dá `422 tax_rate_incompatible_with_regime`.
 * 3. **`taxExemptionCode: "M04"`** quando a taxa fica a 0 e o cliente não é
 *    Consumidor Final. Sem ele: `tax_exemption_code_required`.
 * 4. **`idempotencyKey` sempre** — o id da encomenda. Uma retentativa de rede
 *    devolve o mesmo documento em vez de emitir um segundo documento fiscal da
 *    mesma venda.
 *
 * E uma quinta, que vem da prática: **o PDF é sempre a rota pública**
 * (`/v1/public/invoices/{id}/pdf`). O `pdfUrl` que a resposta devolve é relativo
 * e exige autenticação — colado num link, abre o HTML do nosso próprio site.
 */

/** Base da API do Vero. */
const BASE = (process.env.VERO_BASE_URL || "https://api.vero.ao").replace(/\/+$/, "");

/** Código de isenção em regime simplificado (Exclusão). */
export const TAX_EXEMPTION_CODE = "M04";

/** Timeout de cada chamada, em ms. */
const TIMEOUT_MS = 20_000;

/** `fetch` com timeout. */
async function call(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Credenciais utilizáveis? */
export function veroUsable(creds) {
  return !!(creds && typeof creds.apiKey === "string" && creds.apiKey && typeof creds.orgId === "string" && creds.orgId);
}

/** A chave é de teste (não chega à AGT real)? */
export function veroIsTestKey(apiKey) {
  return String(apiKey || "").startsWith("vero_test_sk_");
}

/**
 * Kwanzas → cêntimos, inteiros. **O único sítio onde esta conversão acontece.**
 */
export function toCents(kz) {
  const n = Number(kz);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** URL público e partilhável do PDF — o que vai para o cliente e para o painel. */
export function veroPdfUrl(invoiceId) {
  return `${BASE}/v1/public/invoices/${encodeURIComponent(String(invoiceId))}/pdf`;
}

function headers(creds) {
  return { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" };
}

/** Código de erro do Vero, para registo e para o campo `invoice_error`. */
async function erroDe(r) {
  const corpo = await r.text().catch(() => "");
  try {
    const j = JSON.parse(corpo);
    return String(j?.error?.code || j?.code || j?.message || `HTTP_${r.status}`).slice(0, 120);
  } catch {
    return `HTTP_${r.status}`;
  }
}

/* ------------------------------- O cliente ------------------------------- */

/**
 * Garante o cliente no Vero e devolve o `id`.
 *
 * Usa `customers/ensure` (upsert) e não `POST /customers`: este último, em
 * conflito, devolve `409 external_id_already_in_use` **sem** o cliente
 * existente, e o filtro `?externalId=` é ignorado — ficava-se sem forma de obter
 * o cliente que já lá estava.
 *
 * Sem NIF, o comprador é **Consumidor Final** e o Vero atribui o NIF genérico.
 */
export async function veroEnsureCustomer(creds, { nif, name }) {
  const consumidorFinal = !nif;
  const body = consumidorFinal
    ? { externalId: "consumidor-final", name: "Consumidor Final", isConsumidorFinal: true }
    : { externalId: `nif-${nif}`, name: name || `NIF ${nif}`, taxId: String(nif) };
  const r = await call(`${BASE}/v1/organisations/${encodeURIComponent(creds.orgId)}/customers/ensure`, {
    method: "POST",
    headers: headers(creds),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const code = await erroDe(r);
    console.error("[vero] cliente", r.status, code);
    return { ok: false, code };
  }
  const j = await r.json().catch(() => null);
  const id = j?.data?.id;
  if (!id) return { ok: false, code: "CUSTOMER_EMPTY" };
  // O formato do id muda entre produção (UUID) e teste (`sandbox_cus_…`): usa-se
  // tal como vem, sem validar.
  return { ok: true, id: String(id), consumidorFinal };
}

/* ------------------------------- A factura ------------------------------- */

/**
 * Emite a Factura-Recibo de uma venda já paga.
 *
 * @param lines Linhas `{ description, quantity, unitPriceKz }` em **Kwanzas** —
 *        a conversão para cêntimos é feita aqui.
 * @returns `{ ok: true, id, number, status, pdfUrl }` ou `{ ok: false, code }`.
 */
export async function veroCreateInvoice(creds, { customerId, consumidorFinal, idempotencyKey, lines }) {
  const items = (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      description: String(l?.description || "Artigo").slice(0, 200),
      quantity: Math.max(1, Math.round(Number(l?.quantity) || 1)),
      unitPrice: toCents(l?.unitPriceKz),
    }))
    .filter((l) => l.unitPrice > 0);
  if (!items.length) return { ok: false, code: "NO_ITEMS" };

  const body = {
    customerId,
    documentType: "FR",
    idempotencyKey: String(idempotencyKey),
    items,
  };
  // Regra 3: obrigatório quando a taxa fica a 0 e não é Consumidor Final.
  if (!consumidorFinal) body.taxExemptionCode = TAX_EXEMPTION_CODE;
  // Regra 2: `taxRate` nunca vai no corpo.

  const r = await call(`${BASE}/v1/organisations/${encodeURIComponent(creds.orgId)}/invoices`, {
    method: "POST",
    headers: headers(creds),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const code = await erroDe(r);
    console.error("[vero] factura", r.status, code);
    return { ok: false, code };
  }
  const j = await r.json().catch(() => null);
  const inv = j?.data;
  if (!inv?.id) return { ok: false, code: "INVOICE_EMPTY" };
  return {
    ok: true,
    id: String(inv.id),
    number: inv.number ? String(inv.number) : null,
    status: inv.agtStatus ? String(inv.agtStatus) : null,
    pdfUrl: veroPdfUrl(inv.id),
  };
}

/**
 * Estado da validação na AGT. Não há webhook para isto: consulta-se.
 *
 * `pending` → ainda a validar. `validated` → documento fiscal válido.
 * `rejected` → recusado (`agtErrors`). `null` → chave de teste, não chega à AGT.
 */
export async function veroInvoiceStatus(creds, invoiceId) {
  const r = await call(
    `${BASE}/v1/organisations/${encodeURIComponent(creds.orgId)}/invoices/${encodeURIComponent(invoiceId)}`,
    { headers: headers(creds) },
  );
  if (!r.ok) return { ok: false, code: await erroDe(r) };
  const j = await r.json().catch(() => null);
  const inv = j?.data;
  if (!inv) return { ok: false, code: "INVOICE_EMPTY" };
  const erros = Array.isArray(inv.agtErrors) ? inv.agtErrors : [];
  return {
    ok: true,
    status: inv.agtStatus ? String(inv.agtStatus) : null,
    number: inv.number ? String(inv.number) : null,
    error: erros.length ? String(erros[0]?.descriptionError || erros[0]?.idError || "").slice(0, 200) : null,
  };
}
