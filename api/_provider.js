/**
 * Adaptador do fornecedor de pagamentos. Hoje: **Wiza** (WizaPay).
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * É a única porta entre o resto do servidor e a API de pagamentos: tudo o que
 * está em `api/_payments.js` (preço calculado no servidor, stock, descontos,
 * encomenda gravada antes de cobrar, confirmação idempotente) não sabe que
 * fornecedor existe. Trocar de fornecedor é reescrever este ficheiro e
 * `api/_wizapay.js`.
 *
 * ## O que a Wiza muda em relação ao modelo antigo
 *
 * - **O cliente paga numa página da Wiza** (checkout alojado). `createPayment`
 *   devolve `hostedUrl` e o estado `open`: nenhum pagamento está pago no
 *   momento em que é criado, nem o Multicaixa Express.
 * - **É o cliente que escolhe o método**, na página deles. O método que
 *   gravámos é uma *intenção*; o verdadeiro vem no campo `service` do estado
 *   (`gpo` = Express, `reference` = Referência) e corrige o registo.
 * - **O corpo do callback não prova nada.** A assinatura documentada não é
 *   reproduzível, por isso o callback é tratado como um aviso para ir verificar.
 *   Ver `parseWebhook`.
 *
 * ## Credenciais (variáveis de ambiente, só no servidor)
 *
 * `WIPAY_CLIENT_ID`, `WIPAY_CLIENT_SECRET`, `WIPAY_WEBHOOK_SECRET` e, opcional,
 * `WIPAY_BASE_URL`. Sem as duas primeiras, `getPaymentProvider()` devolve `null`
 * e os endpoints respondem `503 PAYMENTS_UNAVAILABLE` sem tocar na base de
 * dados.
 */
import { timingSafeEqual } from "node:crypto";
import {
  wizaConfigured, wizaCreateCharge, wizaStatus, wizaReference, wizaStatusMessage,
  methodFromService, MIN_PAYMENT_KZ,
} from "./_wizapay.js";

export { MIN_PAYMENT_KZ };

/**
 * Comparação de segredos em tempo constante.
 *
 * Um `===` desiste no primeiro carácter diferente e revela o segredo carácter a
 * carácter por temporização. Os comprimentos são comparados à parte porque
 * `timingSafeEqual` lança com tamanhos diferentes.
 */
function secretEquals(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  if (x.length === 0 || x.length !== y.length) return false;
  try {
    return timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

/** Lê o corpo do pedido como JSON, sem lançar. */
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    if (typeof req.body === "string") return JSON.parse(req.body || "{}");
    let raw = "";
    for await (const c of req) raw += c;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** O adaptador da Wiza. */
const wiza = {
  name: "wiza",

  /**
   * Cria a cobrança. Devolve o endereço do checkout alojado onde o cliente paga.
   *
   * `payee` é ignorado de propósito: na Wiza o dinheiro entra na conta da
   * Plataforma, e é a Plataforma que paga ao Dono nos levantamentos (descontada
   * a comissão de `src/services/fees.ts`). A conta bancária verificada da loja
   * serve para esse pagamento, não para a cobrança.
   */
  async createPayment({ amount, reference, phone, callbackUrl, successUrl, failureUrl }) {
    const r = await wizaCreateCharge({
      amountKz: amount,
      referenceId: reference,
      phone,
      callbackUrl,
      successUrl,
      failureUrl,
    });
    if (!r.ok) return r;
    return {
      ok: true,
      providerRef: r.id,
      status: "open",
      hostedUrl: r.hostedUrl,
      referenceInfo: null,
      invoiceUrl: null,
    };
  },

  /**
   * Estado do pagamento — a única fonte de verdade.
   *
   * `notFound` quer dizer «a janela de ~5 minutos fechou», e **não** «não foi
   * pago»: quem chama tem de manter o pagamento aberto nesse caso.
   */
  async getStatus(providerRef) {
    const r = await wizaStatus(providerRef);
    if (r.notFound) return { status: "open", notFound: true };
    if (r.error) return { status: "open", error: true };
    return {
      status: r.status,
      statusCode: r.statusCode,
      service: r.service,
      method: methodFromService(r.service),
      amount: r.amount,
      message: r.status === "failed" ? wizaStatusMessage(r.statusCode) : null,
    };
  },

  /** Entidade e referência do ATM, quando o cliente escolhe Referência. */
  async getReference(providerRef) {
    const r = await wizaReference(providerRef);
    if (!r) return null;
    return { entity: r.entity, number: r.number, dueDate: r.dueDate, method: methodFromService(r.service) };
  },

  /**
   * Autentica a notificação da Wiza e diz o que ela anuncia.
   *
   * **O corpo não prova nada.** A autenticação são três provas que o comprador
   * não consegue reunir:
   *
   *  1. o segredo no URL (`?k=`), que viaja de servidor para servidor e nunca
   *     passa pelo navegador de ninguém — comparado em tempo constante;
   *  2. o `id` do pagamento, que o cliente nunca vê;
   *  3. o montante, confirmado por quem chama contra o valor da venda
   *     (`api/payment-webhook.js`).
   *
   * `trust: "callback"` diz a quem chama que este estado veio do corpo e precisa
   * da terceira prova. Dentro da janela de 5 minutos o estado é relido da API
   * (`trust: "api"`) e o corpo é ignorado.
   */
  async parseWebhook(req) {
    const segredo = process.env.WIPAY_WEBHOOK_SECRET || "";
    if (!segredo) {
      console.error("[wiza] callback sem WIPAY_WEBHOOK_SECRET configurado");
      return null;
    }
    let url;
    try {
      url = new URL(req.url || "/", "https://local");
    } catch {
      return null;
    }
    if (!secretEquals(url.searchParams.get("k"), segredo)) return null;

    const body = await readJson(req);
    const providerRef = String(body?.id || body?.payment_id || url.searchParams.get("id") || "");
    if (!providerRef) return null;

    // Dentro da janela, a API decide. Fora dela (o caso das Referências pagas
    // horas depois), fica o corpo — e a prova do montante.
    const api = await wizaStatus(providerRef);
    if (!api.notFound && !api.error) {
      return {
        providerRef,
        status: api.status,
        statusCode: api.statusCode,
        service: api.service,
        method: methodFromService(api.service),
        amount: api.amount,
        trust: "api",
      };
    }
    const anunciado = String(body?.status || "");
    const status = anunciado === "accepted" ? "paid" : anunciado === "rejected" ? "failed" : "open";
    const valor = Number(body?.amount);
    return {
      providerRef,
      status,
      statusCode: body?.status_code ? String(body.status_code) : null,
      service: body?.service ? String(body.service) : null,
      method: methodFromService(body?.service),
      amount: Number.isFinite(valor) ? valor : null,
      trust: "callback",
    };
  },
};

/**
 * O fornecedor de pagamentos ativo, ou `null` quando não há credenciais.
 *
 * Sem credenciais, as lojas vendem por WhatsApp e os endpoints digitais
 * respondem 503 — nada fica meio ligado.
 */
export function getPaymentProvider() {
  return wizaConfigured() ? wiza : null;
}

/** Resposta comum quando não há fornecedor ligado. */
export const PAYMENTS_UNAVAILABLE = {
  success: false,
  code: "PAYMENTS_UNAVAILABLE",
  error: "Os pagamentos por Multicaixa Express e Referência Bancária ainda não estão disponíveis.",
};
