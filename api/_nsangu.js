/**
 * Envio de SMS pela **Nsangu** (https://api.nsangu.com).
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * Serve um caso só: o código de confirmação do telemóvel de quem cria conta
 * (categoria `OTP`). Não há envios em massa nem marketing, e a API da Nsangu
 * também não os oferece.
 *
 * ## O que a API exige, e porquê é que o código aqui parece paranóico
 *
 * - **`Idempotency-Key` obrigatória, única por mensagem.** Se a rede falhar
 *   antes de a resposta chegar, não sabemos se a SMS foi aceite. Repetir o
 *   pedido com a mesma chave devolve a mesma mensagem, sem enviar nem cobrar
 *   outra. A chave é guardada com o desafio (`phone_verifications.id` entra
 *   nela), para a repetição ser possível.
 * - **A chave de API fica no servidor.** Quem a vir manda SMS pagas com o
 *   nosso saldo. Nunca entra no pacote do navegador, nunca vai para um registo.
 * - **Categoria `OTP`.** A Nsangu nunca devolve o texto de uma OTP nas
 *   consultas e descarta a mensagem se não a entregar em 10 minutos. O código
 *   tem de ser guardado por nós (em `phone_verifications`, só o SHA-256).
 * - **O saldo é pré-pago e acaba.** `insufficient_balance` não é um erro
 *   excepcional: é terça-feira. Quem chama trata-o como «não foi possível
 *   enviar», e o Dono segue sem ficar preso.
 *
 * ## Espelho de `src/services/phoneVerification.ts`
 *
 * As funções de `api/` são JavaScript simples e não podem importar `src/`. O
 * texto da mensagem está repetido aqui, e `tests/phoneVerificationParity.test.ts`
 * compara os dois ficheiros.
 */

const BASE_URL = (process.env.NSANGU_BASE_URL || "https://api.nsangu.com").replace(/\/+$/, "");

/** Tempo máximo de espera por resposta, em ms. */
const TIMEOUT_MS = 10_000;

/**
 * Texto da SMS. Espelha `phoneCodeMessage` de
 * `src/services/phoneVerification.ts` — **sem acentos**, para a mensagem sair em
 * GSM-7 (160 caracteres por SMS) em vez de UCS-2 (70) e custar uma SMS só.
 */
export function phoneCodeMessage(code) {
  return `Codigo MoBisno: ${code}. Valido 10 minutos. Nao partilhe.`;
}

/** A Nsangu está configurada? */
export function nsanguConfigured() {
  return !!process.env.NSANGU_API_KEY;
}

/**
 * Só algarismos, no formato nacional de 9 que a Nsangu aceita.
 *
 * A API recusa `923 456 789` com `validation_error`: espaços, hífenes e
 * parênteses têm de sair **antes** do envio. Aceita `9XXXXXXXX`,
 * `2449XXXXXXXX` e `+2449XXXXXXXX`, e devolve sempre normalizado.
 */
function toRecipient(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  const n = d.startsWith("244") ? d.slice(3) : d;
  return /^9\d{8}$/.test(n) ? n : "";
}

/**
 * Traduz um erro da Nsangu num código nosso.
 *
 * Pelo `code` do corpo, **nunca** pelo `title` nem pelo `detail`: a própria
 * documentação avisa que esses textos estão em português e podem mudar.
 */
function mapError(status, body) {
  const code = typeof body?.code === "string" ? body.code : "";
  if (code === "insufficient_balance") {
    return { ok: false, code: "NO_BALANCE", error: "Sem saldo de SMS para enviar o código." };
  }
  if (code === "validation_error") {
    const campo = Array.isArray(body?.errors) ? body.errors.find((e) => e?.field === "to") : null;
    if (campo) return { ok: false, code: "BAD_PHONE", error: "O número de telemóvel não é válido." };
    return { ok: false, code: "PROVIDER_REJECTED", error: "O envio foi recusado pelo serviço de SMS." };
  }
  if (code === "unauthorized" || code === "tenant_suspended") {
    return { ok: false, code: "PROVIDER_AUTH", error: "O serviço de SMS recusou as credenciais." };
  }
  if (code === "idempotency_conflict") {
    return { ok: false, code: "PROVIDER_CONFLICT", error: "Pedido repetido com dados diferentes." };
  }
  return {
    ok: false,
    code: "PROVIDER_FAILED",
    error: "Não foi possível enviar a SMS agora.",
    status,
    requestId: typeof body?.requestId === "string" ? body.requestId : null,
  };
}

/**
 * Envia o código por SMS.
 *
 * @param {object} o
 * @param {string} o.phone Telemóvel, em qualquer formato (os separadores saem aqui).
 * @param {string} o.code Código a enviar.
 * @param {string} o.idempotencyKey Única por mensagem; repetir o pedido com ela não envia duas vezes.
 * @returns `{ ok: true, id, status, from }` ou `{ ok: false, code, error }`.
 *
 * Nunca lança: uma falha de SMS não pode rebentar a criação de uma conta.
 */
export async function sendPhoneCode({ phone, code, idempotencyKey }) {
  if (!nsanguConfigured()) {
    console.warn("[nsangu] NSANGU_API_KEY não configurada: SMS não enviada");
    return { ok: false, code: "SMS_NOT_CONFIGURED", error: "O envio de SMS não está configurado." };
  }
  const to = toRecipient(phone);
  if (!to) return { ok: false, code: "BAD_PHONE", error: "O número de telemóvel não é válido." };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NSANGU_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // Obrigatória. Sem ela a resposta é 400 validation_error.
        "Idempotency-Key": String(idempotencyKey),
      },
      // Sem `from`: sai o remetente por defeito do projecto da chave. Em rede
      // Movicel a Nsangu entrega com o código curto 46554, e a resposta diz
      // sempre qual foi usado (`from`).
      body: JSON.stringify({ to, text: phoneCodeMessage(code), category: "OTP" }),
      signal: ctrl.signal,
    });
    // A API só responde JSON; um corpo que não seja JSON é um proxy a meter-se
    // à frente (502, 504), e trata-se como falha repetível.
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.id) {
      if (body) console.error("[nsangu] envio recusado", r.status, body.code ?? "", body.requestId ?? "");
      else console.error("[nsangu] resposta sem JSON", r.status);
      return mapError(r.status, body);
    }
    return { ok: true, id: String(body.id), status: String(body.status || "queued"), from: body.from ?? null };
  } catch (e) {
    // `AbortError` incluído: a mensagem pode ter sido aceite e a resposta
    // perdida. Repetir com a **mesma** chave é o caminho seguro.
    console.error("[nsangu] falha de rede", e instanceof Error ? e.name : e);
    return { ok: false, code: "PROVIDER_UNREACHABLE", error: "Não foi possível contactar o serviço de SMS." };
  } finally {
    clearTimeout(t);
  }
}

// O saldo (`GET /v1/balance`) não é lido por nenhum ecrã: é informação do
// negócio, e o único endpoint de diagnóstico que havia (`/api/health`) é
// público. Quando houver onde o mostrar — o painel de administração —, é uma
// função de seis linhas igual a esta.
