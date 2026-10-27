/**
 * Confirmação do telemóvel por SMS — as regras, em funções puras.
 *
 * ## Porque é que isto existe
 *
 * Qualquer pessoa criava conta com um email inventado. O email nunca foi
 * verificado (e continua a não ser): o que passa a ser verificado é o
 * **telemóvel**, que em Angola é o contacto que importa — é por ele que as
 * encomendas chegam ao Dono, e é ele que distingue uma loja real de um registo
 * de teste.
 *
 * ## O que estas funções decidem, e o que não decidem
 *
 * Decidem **quando** se pode reenviar, **quantas** vezes, e **quando** desistir.
 * Não geram o código (precisa de aleatoriedade criptográfica, e vive no
 * servidor: `api/phone-verify.js`), não enviam SMS e não tocam na base de dados.
 *
 * O servidor é a autoridade: os tetos são aplicados lá, com o relógio dele.
 * Estas funções servem o ecrã, para o chat poder dizer «Reenviar em 12 s» sem
 * perguntar nada a ninguém — e são as mesmas, por isso o ecrã nunca oferece um
 * reenvio que o servidor vai recusar.
 *
 * ## O espelho em `api/`
 *
 * `api/_nsangu.js` é JavaScript simples e não pode importar este ficheiro;
 * repete os números e o texto da mensagem. `tests/phoneVerificationParity.test.ts`
 * compara os dois e falha se divergirem.
 */

/** Algarismos do código enviado por SMS. */
export const PHONE_CODE_LENGTH = 6;

/**
 * Validade do código, em ms.
 *
 * Dez minutos não é um número escolhido aqui: é o prazo da categoria `OTP` da
 * Nsangu, que descarta a mensagem se a operadora não a entregar nesse tempo.
 * Um código válido durante mais tempo do que a mensagem que o transporta só
 * daria «código expirado» a quem o recebeu a horas.
 */
export const PHONE_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Espera antes de cada reenvio, pela ordem em que são oferecidos: o primeiro
 * reenvio abre aos 20 s, o segundo 45 s depois dele.
 *
 * A espera não é decoração. Cada SMS é paga, e o primeiro instinto de quem não
 * vê a mensagem chegar é tocar no botão outra vez — três vezes seguidas, no
 * mesmo segundo, antes de a primeira ter tido tempo de chegar.
 */
export const PHONE_RESEND_DELAYS_MS: readonly number[] = [20_000, 45_000];

/** Total de SMS que um desafio chega a enviar: o primeiro envio mais os reenvios. */
export const PHONE_MAX_SENDS = PHONE_RESEND_DELAYS_MS.length + 1;

/**
 * Códigos errados aceites antes de o desafio morrer.
 *
 * Seis algarismos são um milhão de combinações; cinco tentativas tornam a força
 * bruta inútil sem castigar quem leu um 8 onde estava um 6.
 */
export const PHONE_MAX_ATTEMPTS = 5;

/**
 * Desafios que uma conta pode abrir por hora.
 *
 * O teto por desafio não chega: sem este, bastava recomeçar o assistente para
 * mandar SMS sem fim, com a carteira de SMS da plataforma a pagar.
 */
export const PHONE_MAX_SENDS_PER_HOUR = 6;

/** Janela do teto de {@link PHONE_MAX_SENDS_PER_HOUR}, em ms. */
export const PHONE_SENDS_WINDOW_MS = 60 * 60 * 1000;

/**
 * Texto da SMS.
 *
 * **Sem acentos, de propósito.** A Nsangu escolhe a codificação a partir do
 * texto: um único `ô` ou `í` passa a mensagem de GSM-7 (160 caracteres) para
 * UCS-2 (70), e uma mensagem que cresça um pouco passa a custar duas SMS em vez
 * de uma. Daí «MoBisno» e «Valido» — numa SMS de código o que conta é chegar,
 * e o remetente já identifica quem a mandou.
 */
export function phoneCodeMessage(code: string): string {
  return `Codigo MoBisno: ${code}. Valido 10 minutos. Nao partilhe.`;
}

/** O que o utilizador escreveu é um código com a forma certa? */
export function isValidPhoneCode(raw: unknown): boolean {
  return typeof raw === "string" && new RegExp(`^\\d{${PHONE_CODE_LENGTH}}$`).test(raw.trim());
}

/** Só os algarismos do que foi escrito, cortado ao tamanho do código. */
export function cleanPhoneCode(raw: string): string {
  return (raw || "").replace(/\D/g, "").slice(0, PHONE_CODE_LENGTH);
}

/** Estado de um desafio, como está gravado em `phone_verifications`. */
export interface PhoneChallengeState {
  /** SMS já enviadas neste desafio (1 depois do primeiro envio). */
  sends: number;
  /** Momento do último envio (ISO ou ms). */
  lastSentAt: string | number;
  /** Fim da validade do código (ISO ou ms). */
  expiresAt: string | number;
  /** Códigos errados já escritos. */
  attempts: number;
  /** Já confirmado. */
  verified?: boolean;
}

/** Momento em ms, de um ISO ou de um número. `NaN` quando não se lê. */
function ms(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  return typeof value === "string" ? Date.parse(value) : NaN;
}

/**
 * Espera até ao próximo reenvio, a contar do envio anterior, ou `null` quando já
 * não há reenvios a oferecer.
 *
 * `sends` é quantas SMS já saíram: com 1, a resposta é a primeira espera.
 */
export function phoneResendDelayMs(sends: number): number | null {
  const n = Number.isFinite(sends) ? Math.floor(sends) : 0;
  if (n < 1) return 0;
  return PHONE_RESEND_DELAYS_MS[n - 1] ?? null;
}

/** O que o ecrã pode oferecer a quem está à espera do código. */
export type PhoneResendOffer =
  /** Reenviar já. */
  | { readonly kind: "now" }
  /** Reenviar daqui a `waitMs` (o botão conta e abre sozinho). */
  | { readonly kind: "wait"; readonly waitMs: number }
  /** Os reenvios acabaram: só resta «Não recebi o código». */
  | { readonly kind: "exhausted" };

/**
 * O que oferecer **agora**, a partir do estado gravado.
 *
 * Função pura, com o relógio por parâmetro: é a mesma decisão no chat, no
 * painel e no servidor.
 */
export function phoneResendOffer(state: PhoneChallengeState, now: number = Date.now()): PhoneResendOffer {
  const delay = phoneResendDelayMs(state.sends);
  if (delay === null) return { kind: "exhausted" };
  const desde = ms(state.lastSentAt);
  // Sem data legível, abrir o reenvio é melhor do que prender o Dono num botão
  // que nunca abre: o teto de envios continua a proteger a carteira.
  if (!Number.isFinite(desde)) return { kind: "now" };
  const falta = desde + delay - now;
  return falta > 0 ? { kind: "wait", waitMs: falta } : { kind: "now" };
}

/** Resposta a um pedido de reenvio, já com os tetos aplicados. */
export type PhoneSendDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "too-soon"; readonly waitMs: number; readonly message: string }
  | { readonly ok: false; readonly code: "max-sends"; readonly message: string };

/**
 * Pode reenviar? É o que o servidor decide antes de gastar uma SMS, e o que o
 * ecrã usa para não oferecer o que vai ser recusado.
 */
export function canSendPhoneCode(state: PhoneChallengeState, now: number = Date.now()): PhoneSendDecision {
  const offer = phoneResendOffer(state, now);
  if (offer.kind === "exhausted") {
    return {
      ok: false,
      code: "max-sends",
      message: "Já enviámos o código o número máximo de vezes. Pode continuar e confirmar o número mais tarde, no Dashboard.",
    };
  }
  if (offer.kind === "wait") {
    return {
      ok: false,
      code: "too-soon",
      waitMs: offer.waitMs,
      message: `Aguarde ${Math.ceil(offer.waitMs / 1000)} segundos para pedir outro código.`,
    };
  }
  return { ok: true };
}

/** Resposta a um código escrito, antes de o comparar. */
export type PhoneCheckDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "expired" | "max-attempts" | "bad-format"; readonly message: string };

/**
 * O desafio ainda aceita um código?
 *
 * Separado da comparação de propósito: a comparação precisa do que está gravado
 * (e corre só no servidor), estas condições não dependem do código nenhum.
 */
export function canCheckPhoneCode(
  state: PhoneChallengeState,
  code: string,
  now: number = Date.now(),
): PhoneCheckDecision {
  if (!isValidPhoneCode(code)) {
    return { ok: false, code: "bad-format", message: `O código tem ${PHONE_CODE_LENGTH} algarismos.` };
  }
  if (state.attempts >= PHONE_MAX_ATTEMPTS) {
    return {
      ok: false,
      code: "max-attempts",
      message: "Demasiadas tentativas erradas. Peça um código novo.",
    };
  }
  const fim = ms(state.expiresAt);
  if (!Number.isFinite(fim) || fim <= now) {
    return { ok: false, code: "expired", message: "Este código expirou. Peça um código novo." };
  }
  return { ok: true };
}

/** Tentativas que ainda restam antes de o desafio morrer. */
export function phoneAttemptsLeft(state: PhoneChallengeState): number {
  return Math.max(0, PHONE_MAX_ATTEMPTS - (Number.isFinite(state.attempts) ? state.attempts : 0));
}

/** «+244 923 456 789», a partir de `2449XXXXXXXX`. Para mostrar, nunca para enviar. */
export function formatPhoneForDisplay(normalized: string): string {
  const d = (normalized || "").replace(/\D/g, "");
  const n = d.startsWith("244") ? d.slice(3) : d;
  return n.length === 9 ? `+244 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : normalized;
}
