/**
 * Confirmação do telemóvel por SMS — as regras puras.
 *
 * ## Porque é que estas asserções existem
 *
 * Pôr uma SMS no caminho da criação de conta cria três maneiras novas de a
 * estragar, e as três já aconteceram em produtos a sério:
 *
 *  1. **o botão de reenviar aberto** — quem não vê a mensagem chegar toca três
 *     vezes no mesmo segundo, e cada toque é uma SMS paga;
 *  2. **o código adivinhável** — seis algarismos com tentativas sem limite são
 *     um milhão de pedidos, que um script faz numa tarde;
 *  3. **o Dono preso** — sem saldo, sem rede ou sem chave configurada, um ecrã
 *     que só aceita o código não deixa criar conta nenhuma.
 *
 * Os tetos e as esperas vivem em `src/services/phoneVerification.ts` e são
 * impostos pelo servidor (`api/phone-verify.js`). Estes testes fixam as regras;
 * `tests/phoneVerificationParity.test.ts` garante que o servidor usa as mesmas.
 */
import { describe, it, expect } from "vitest";
import {
  PHONE_CODE_LENGTH, PHONE_CODE_TTL_MS, PHONE_MAX_ATTEMPTS, PHONE_MAX_SENDS,
  PHONE_MAX_SENDS_PER_HOUR, PHONE_RESEND_DELAYS_MS, PHONE_SENDS_WINDOW_MS,
  canCheckPhoneCode, canSendPhoneCode, cleanPhoneCode, formatPhoneForDisplay, isValidPhoneCode,
  phoneAttemptsLeft, phoneCodeMessage, phoneResendDelayMs, phoneResendOffer,
  type PhoneChallengeState,
} from "../src/services/phoneVerification.js";
import { isValidAoPhone, normalizeAoPhone } from "../src/services/payments.js";

const AGORA = Date.parse("2026-10-21T10:00:00.000Z");

/** Desafio com o primeiro envio feito agora. */
function desafio(extra: Partial<PhoneChallengeState> = {}): PhoneChallengeState {
  return {
    sends: 1,
    lastSentAt: new Date(AGORA).toISOString(),
    expiresAt: new Date(AGORA + PHONE_CODE_TTL_MS).toISOString(),
    attempts: 0,
    ...extra,
  };
}

describe("As esperas dos reenvios são as pedidas: 20 s e depois 45 s", () => {
  it("há dois reenvios, com estas esperas e por esta ordem", () => {
    expect([...PHONE_RESEND_DELAYS_MS]).toEqual([20_000, 45_000]);
    expect(PHONE_MAX_SENDS).toBe(3);
  });

  it("depois do primeiro envio o reenvio abre aos 20 s; depois do segundo, 45 s", () => {
    expect(phoneResendDelayMs(1)).toBe(20_000);
    expect(phoneResendDelayMs(2)).toBe(45_000);
  });

  it("ao terceiro envio não há mais reenvios: resta «Não recebi o código»", () => {
    expect(phoneResendDelayMs(3)).toBeNull();
    expect(phoneResendOffer(desafio({ sends: 3 }), AGORA)).toEqual({ kind: "exhausted" });
    const d = canSendPhoneCode(desafio({ sends: 3 }), AGORA);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("max-sends");
  });

  it("o botão está fechado antes da hora e abre exatamente nela", () => {
    const d = desafio();
    expect(phoneResendOffer(d, AGORA)).toEqual({ kind: "wait", waitMs: 20_000 });
    expect(phoneResendOffer(d, AGORA + 19_999)).toEqual({ kind: "wait", waitMs: 1 });
    expect(phoneResendOffer(d, AGORA + 20_000)).toEqual({ kind: "now" });
    expect(phoneResendOffer(d, AGORA + 60_000)).toEqual({ kind: "now" });
  });

  it("um pedido antes da hora é recusado, e a frase diz quantos segundos faltam", () => {
    const d = canSendPhoneCode(desafio(), AGORA + 5_000);
    expect(d.ok).toBe(false);
    if (!d.ok && d.code === "too-soon") {
      expect(d.waitMs).toBe(15_000);
      expect(d.message).toContain("15 segundos");
    }
  });

  it("uma data gravada ilegível abre o reenvio em vez de prender o Dono", () => {
    // O teto de envios continua a proteger a carteira; o que não pode acontecer
    // é um botão que nunca abre.
    expect(phoneResendOffer(desafio({ lastSentAt: "não é data" }), AGORA)).toEqual({ kind: "now" });
    expect(canSendPhoneCode(desafio({ lastSentAt: "lixo" }), AGORA).ok).toBe(true);
  });

  it("o teto por hora existe, e é maior do que um desafio inteiro", () => {
    // Senão, recomeçar o assistente uma vez já batia no teto.
    expect(PHONE_MAX_SENDS_PER_HOUR).toBeGreaterThan(PHONE_MAX_SENDS);
    expect(PHONE_SENDS_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

describe("O código: seis algarismos, cinco tentativas, dez minutos", () => {
  it("a validade acompanha o prazo da categoria OTP do fornecedor", () => {
    // A Nsangu descarta uma OTP que não entregue em 10 minutos. Um código
    // válido por mais tempo do que a mensagem que o transporta só daria
    // «expirado» a quem o recebeu a horas.
    expect(PHONE_CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(phoneCodeMessage("123456")).toContain("10 minutos");
  });

  it("só seis algarismos passam por código", () => {
    expect(PHONE_CODE_LENGTH).toBe(6);
    for (const bom of ["123456", "000000", "999999"]) expect(isValidPhoneCode(bom), bom).toBe(true);
    for (const mau of ["12345", "1234567", "12345a", "", " ", "abcdef", null, undefined, 123456]) {
      expect(isValidPhoneCode(mau as unknown), String(mau)).toBe(false);
    }
    // Espaços nas pontas não invalidam: é o que acontece ao colar de uma SMS.
    expect(isValidPhoneCode(" 123456 ")).toBe(true);
  });

  it("o que o Dono escreve é limpo de tudo o que não é algarismo", () => {
    expect(cleanPhoneCode("12 34-56")).toBe("123456");
    expect(cleanPhoneCode("Codigo: 123456")).toBe("123456");
    expect(cleanPhoneCode("1234567890")).toBe("123456");
    expect(cleanPhoneCode("")).toBe("");
  });

  it("cinco tentativas erradas e o desafio morre", () => {
    expect(PHONE_MAX_ATTEMPTS).toBe(5);
    for (let n = 0; n < PHONE_MAX_ATTEMPTS; n += 1) {
      expect(canCheckPhoneCode(desafio({ attempts: n }), "123456", AGORA).ok, `tentativa ${n}`).toBe(true);
      expect(phoneAttemptsLeft(desafio({ attempts: n }))).toBe(PHONE_MAX_ATTEMPTS - n);
    }
    const d = canCheckPhoneCode(desafio({ attempts: PHONE_MAX_ATTEMPTS }), "123456", AGORA);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("max-attempts");
    expect(phoneAttemptsLeft(desafio({ attempts: PHONE_MAX_ATTEMPTS }))).toBe(0);
  });

  it("no instante exato do fim, o código já não serve", () => {
    expect(canCheckPhoneCode(desafio(), "123456", AGORA + PHONE_CODE_TTL_MS - 1).ok).toBe(true);
    const d = canCheckPhoneCode(desafio(), "123456", AGORA + PHONE_CODE_TTL_MS);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("expired");
  });

  it("uma data de fim ilegível trata-se como expirada, não como eterna", () => {
    const d = canCheckPhoneCode(desafio({ expiresAt: "não é data" }), "123456", AGORA);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("expired");
  });

  it("o formato é verificado antes de tudo: nem conta como tentativa", () => {
    const d = canCheckPhoneCode(desafio(), "12", AGORA);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("bad-format");
  });
});

describe("A mensagem da SMS custa uma SMS, e não duas", () => {
  /**
   * O fornecedor escolhe a codificação a partir do texto: GSM-7 leva 160
   * caracteres por SMS, UCS-2 leva 70. Um único «ô» ou «í» passa a mensagem
   * para UCS-2 — e uma mensagem que cresça um pouco passa a custar o dobro, em
   * todos os registos, para sempre.
   */
  const GSM7 = /^[A-Za-z0-9 .,:;!?'"()\-+/=@&#%*<>\n\r$éèàùìòÇäöüñ]+$/;

  it("o texto não tem um único carácter fora do alfabeto GSM-7", () => {
    const texto = phoneCodeMessage("123456");
    expect(texto, texto).toMatch(GSM7);
    // Os acentos do português que forçam UCS-2, nomeados: é o erro fácil de
    // cometer ao «corrigir» a ortografia desta frase.
    for (const acento of ["á", "â", "ã", "ç", "ê", "í", "ó", "ô", "õ", "ú", "º", "ª"]) {
      expect(texto, `«${acento}» passa a mensagem para UCS-2 e duplica o custo`).not.toContain(acento);
    }
  });

  it("cabe num segmento com folga, mesmo que o código mude de tamanho", () => {
    expect(phoneCodeMessage("1".repeat(PHONE_CODE_LENGTH)).length).toBeLessThanOrEqual(160);
    // Com folga para UCS-2 (70) também: se um dia a frase ganhar um acento por
    // engano, continua a ser uma SMS.
    expect(phoneCodeMessage("1".repeat(PHONE_CODE_LENGTH)).length).toBeLessThanOrEqual(70);
  });

  it("diz o código, diz a marca e avisa para não o partilhar", () => {
    const texto = phoneCodeMessage("482913");
    expect(texto).toContain("482913");
    expect(texto).toMatch(/MoBisno/);
    expect(texto).toMatch(/[Nn]ao partilhe/);
  });
});

describe("O número: o mesmo formato do resto da plataforma", () => {
  it("a validação é a que já existia para o WhatsApp e para os pagamentos", () => {
    // Um segundo conceito de «número válido» era a garantia de duas respostas
    // diferentes à mesma pergunta.
    for (const bom of ["923456789", "244923456789", "+244 923 456 789", "923 456 789"]) {
      expect(isValidAoPhone(bom), bom).toBe(true);
      expect(normalizeAoPhone(bom), bom).toBe("244923456789");
    }
    for (const mau of ["823456789", "12345", "", "244823456789"]) {
      expect(isValidAoPhone(mau), mau).toBe(false);
    }
  });

  it("mostra-se legível, com o indicativo", () => {
    expect(formatPhoneForDisplay("244923456789")).toBe("+244 923 456 789");
    expect(formatPhoneForDisplay("923456789")).toBe("+244 923 456 789");
  });

  it("o que não se consegue formatar sai como está, em vez de sair truncado", () => {
    expect(formatPhoneForDisplay("")).toBe("");
    expect(formatPhoneForDisplay("12345")).toBe("12345");
  });
});
