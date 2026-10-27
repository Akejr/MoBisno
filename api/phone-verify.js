/**
 * Confirmação do telemóvel da conta, por SMS.
 *
 * `POST /api/phone-verify`
 *   `{ action: "send",  phone: "9XXXXXXXX" }` → envia (ou reenvia) o código
 *   `{ action: "check", code: "123456" }`     → confirma o número
 *
 * Exige sessão: o Dono vem do token (`Authorization: Bearer …`), nunca de um
 * campo do corpo. Era trivial escrever o id de outra conta e confirmá-la.
 *
 * ## O que corre aqui e não pode correr no navegador
 *
 * - **A chave da Nsangu.** Quem a vir manda SMS pagas com o nosso saldo.
 * - **O código.** Gerado aqui, guardado só como SHA-256 de `<id>:<código>`,
 *   comparado aqui. A Nsangu também não o devolve (categoria `OTP`).
 * - **Os tetos.** O ecrã usa as mesmas regras
 *   (`src/services/phoneVerification.ts`) para não oferecer o que vai ser
 *   recusado, mas quem as impõe é este ficheiro, com o relógio do servidor.
 * - **A confirmação.** `profiles.phone_verified_at` só é escrita pela service
 *   role; o gatilho `profiles_guard` (migração 0026) repõe o valor antigo a
 *   quem tentar pelo navegador.
 *
 * ## Falhar sem prender ninguém
 *
 * Sem saldo, sem chave configurada ou com a Nsangu em baixo, a resposta diz-o e
 * o assistente segue para «Não recebi o código»: a conta é criada e o número
 * confirma-se depois, no Dashboard. O que nunca acontece é o Dono ficar preso
 * num ecrã à espera de uma SMS que não vai chegar.
 */
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { admin, missingEnvMessage, readBody, send } from "./_shared.js";
import { ownerFromRequest } from "./_payments.js";
import { sendPhoneCode } from "./_nsangu.js";

/* ----------------------- Espelho de phoneVerification.ts ----------------------- */
// `tests/phoneVerificationParity.test.ts` compara estes números com os do
// domínio e falha se divergirem.

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_DELAYS_MS = [20_000, 45_000];
const MAX_SENDS = RESEND_DELAYS_MS.length + 1;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 6;
const SENDS_WINDOW_MS = 60 * 60 * 1000;

/**
 * Teto de SMS de toda a plataforma, por hora.
 *
 * Os tetos por conta não protegem a carteira de quem **cria contas** em série:
 * criar conta não custa nada a ninguém, e seiscentas SMS custam-nos dinheiro
 * real. Este é o travão de mão. Com ele accionado, o registo continua a
 * funcionar — só não envia SMS, e o número confirma-se mais tarde.
 */
const MAX_SENDS_PER_HOUR_GLOBAL = 120;

/* --------------------------------- Auxiliares --------------------------------- */

/** Telemóvel angolano normalizado (`2449XXXXXXXX`), ou `""`. Espelha `normalizeAoPhone`. */
function aoPhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  const n = d.startsWith("244") ? d : d.length === 9 ? `244${d}` : d;
  return /^2449\d{8}$/.test(n) ? n : "";
}

/**
 * Código de {@link CODE_LENGTH} algarismos, com aleatoriedade criptográfica.
 *
 * `randomInt` e não `Math.random()`: um gerador previsível torna o código
 * adivinhável, e com ele a confirmação não confirma nada.
 */
function newCode() {
  const max = 10 ** CODE_LENGTH;
  return String(randomInt(0, max)).padStart(CODE_LENGTH, "0");
}

/** SHA-256 de `<id>:<código>`. O `id` é o sal: códigos iguais dão hashes diferentes. */
function hashCode(id, code) {
  return createHash("sha256").update(`${id}:${code}`).digest("hex");
}

/** Comparação em tempo constante, para o tempo de resposta não denunciar o código. */
function sameHash(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Espera até ao próximo reenvio, ou `null` quando já não há reenvios. */
function resendDelayMs(sends) {
  return RESEND_DELAYS_MS[Math.max(0, sends - 1)] ?? null;
}

/** O desafio em curso desta conta: o mais recente que ainda não foi confirmado. */
async function openChallenge(db, ownerId) {
  const { data } = await db
    .from("phone_verifications")
    .select("id, phone, code_hash, sends, attempts, expires_at, last_sent_at, verified_at")
    .eq("owner_id", ownerId)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** SMS enviadas numa janela de tempo. `ownerId` omitido = toda a plataforma. */
async function sendsInWindow(db, ownerId, since) {
  let q = db.from("phone_verifications").select("sends").gte("created_at", since);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q;
  if (error) return 0;
  return (data ?? []).reduce((total, r) => total + (Number(r.sends) || 0), 0);
}

/** A conta já tem o número confirmado? */
async function alreadyVerified(db, ownerId) {
  const { data } = await db.from("profiles").select("phone_verified_at").eq("id", ownerId).maybeSingle();
  return !!data?.phone_verified_at;
}

/* ---------------------------------- Enviar ---------------------------------- */

/**
 * Envia o código, criando um desafio novo ou reenviando o que está em curso.
 *
 * O reenvio leva o **mesmo** código: se a primeira SMS chegar atrasada, as duas
 * servem. A `Idempotency-Key` leva o número do envio (`<id>:<n>`), porque cada
 * reenvio é uma mensagem nova — com a mesma chave, a Nsangu devolvia a primeira
 * sem enviar nada.
 */
async function doSend(db, res, ownerId, body) {
  const phone = aoPhone(body.phone);
  if (!phone) {
    return send(res, 400, {
      success: false, code: "BAD_PHONE",
      error: "Indique um número de telemóvel angolano válido: 9 algarismos, a começar por 9.",
    });
  }

  const agora = Date.now();
  const desde = new Date(agora - SENDS_WINDOW_MS).toISOString();
  if (await sendsInWindow(db, ownerId, desde) >= MAX_SENDS_PER_HOUR) {
    return send(res, 429, {
      success: false, code: "MAX_SENDS",
      error: "Pedidos de código em excesso nesta conta. Tente daqui a uma hora, ou confirme o número mais tarde no Dashboard.",
    });
  }
  if (await sendsInWindow(db, null, desde) >= MAX_SENDS_PER_HOUR_GLOBAL) {
    return send(res, 503, {
      success: false, code: "SMS_BUSY",
      error: "O envio de SMS está temporariamente indisponível. Pode continuar e confirmar o número mais tarde.",
    });
  }

  const atual = await openChallenge(db, ownerId);
  // Número diferente do que estava a ser confirmado: desafio novo, código novo.
  const reenvio = atual && atual.phone === phone && Date.parse(atual.expires_at) > agora;

  if (reenvio) {
    const sends = Number(atual.sends) || 1;
    const espera = resendDelayMs(sends);
    if (espera === null) {
      return send(res, 429, {
        success: false, code: "MAX_SENDS",
        error: "Já enviámos o código o número máximo de vezes. Pode continuar e confirmar o número mais tarde, no Dashboard.",
      });
    }
    const falta = Date.parse(atual.last_sent_at) + espera - agora;
    if (Number.isFinite(falta) && falta > 0) {
      return send(res, 429, {
        success: false, code: "TOO_SOON", waitMs: falta,
        error: `Aguarde ${Math.ceil(falta / 1000)} segundos para pedir outro código.`,
      });
    }
  }

  // Um desafio novo nasce com o código; um reenvio reutiliza o que já foi
  // gerado — que não sabemos qual é (só temos o hash), por isso o reenvio gera
  // um código novo e substitui o hash. É a única forma honesta: guardar o
  // código em claro para o poder repetir seria pior do que mandar outro.
  const code = newCode();
  const expiresAt = new Date(agora + CODE_TTL_MS).toISOString();
  let id;
  let sends;
  if (reenvio) {
    id = atual.id;
    sends = (Number(atual.sends) || 1) + 1;
    const { error } = await db
      .from("phone_verifications")
      .update({ code_hash: hashCode(id, code), sends, attempts: 0, expires_at: expiresAt, last_sent_at: new Date(agora).toISOString() })
      .eq("id", id);
    if (error) {
      console.error("phone-verify: update", error);
      return send(res, 500, { success: false, code: "PERSIST_FAILED", error: "Não foi possível preparar o código." });
    }
  } else {
    sends = 1;
    // O id é escolhido aqui, e não deixado à base de dados, porque é o sal do
    // hash: assim a linha nasce já com o hash certo, numa escrita só. Com duas,
    // uma segunda escrita falhada deixava um desafio que nunca confirmaria — e
    // a SMS já tinha sido paga.
    id = randomUUID();
    const { error } = await db
      .from("phone_verifications")
      .insert({ id, owner_id: ownerId, phone, code_hash: hashCode(id, code), expires_at: expiresAt });
    if (error) {
      console.error("phone-verify: insert", error);
      return send(res, 500, { success: false, code: "PERSIST_FAILED", error: "Não foi possível preparar o código." });
    }
  }

  const envio = await sendPhoneCode({ phone, code, idempotencyKey: `mb-otp-${id}-${sends}` });
  if (!envio.ok) {
    // A SMS não saiu: o desafio fica, mas este envio não conta para o teto.
    await db.from("phone_verifications").update({ sends: sends - 1 }).eq("id", id);
    const semServico = envio.code === "SMS_NOT_CONFIGURED" || envio.code === "NO_BALANCE"
      || envio.code === "PROVIDER_AUTH" || envio.code === "PROVIDER_UNREACHABLE";
    return send(res, semServico ? 503 : 502, {
      success: false,
      code: semServico ? "SMS_UNAVAILABLE" : envio.code,
      error: semServico
        ? "Não foi possível enviar a SMS agora. Pode continuar e confirmar o número mais tarde, no Dashboard."
        : envio.error,
    });
  }

  await db.from("phone_verifications").update({ provider_message_id: envio.id }).eq("id", id);
  const proximo = resendDelayMs(sends);
  return send(res, 200, {
    success: true,
    sends,
    maxSends: MAX_SENDS,
    /** `null` quando já não há reenvios: o ecrã passa a oferecer só «Não recebi o código». */
    resendInMs: proximo,
    expiresInMs: CODE_TTL_MS,
  });
}

/* --------------------------------- Confirmar --------------------------------- */

/** Compara o código escrito e, se estiver certo, confirma o número na conta. */
async function doCheck(db, res, ownerId, body) {
  const code = String(body.code || "").replace(/\D/g, "");
  if (code.length !== CODE_LENGTH) {
    return send(res, 400, { success: false, code: "BAD_CODE_FORMAT", error: `O código tem ${CODE_LENGTH} algarismos.` });
  }
  const desafio = await openChallenge(db, ownerId);
  if (!desafio) {
    return send(res, 404, { success: false, code: "NO_CHALLENGE", error: "Não há nenhum código à espera de confirmação. Peça um código novo." });
  }
  const attempts = Number(desafio.attempts) || 0;
  if (attempts >= MAX_ATTEMPTS) {
    return send(res, 429, { success: false, code: "MAX_ATTEMPTS", error: "Demasiadas tentativas erradas. Peça um código novo." });
  }
  if (!(Date.parse(desafio.expires_at) > Date.now())) {
    return send(res, 410, { success: false, code: "EXPIRED", error: "Este código expirou. Peça um código novo." });
  }

  if (!sameHash(desafio.code_hash, hashCode(desafio.id, code))) {
    await db.from("phone_verifications").update({ attempts: attempts + 1 }).eq("id", desafio.id);
    const restam = MAX_ATTEMPTS - (attempts + 1);
    return send(res, 400, {
      success: false, code: "WRONG_CODE", attemptsLeft: Math.max(0, restam),
      error: restam > 0 ? "O código não está certo. Confira os algarismos." : "O código não está certo, e as tentativas acabaram. Peça um código novo.",
    });
  }

  const agora = new Date().toISOString();
  await db.from("phone_verifications").update({ verified_at: agora }).eq("id", desafio.id);
  const { error } = await db
    .from("profiles")
    .update({ phone: desafio.phone, phone_verified_at: agora })
    .eq("id", ownerId);
  if (error) {
    console.error("phone-verify: confirmar perfil", error);
    return send(res, 500, { success: false, code: "PERSIST_FAILED", error: "O código está certo, mas não foi possível guardar a confirmação. Tente de novo." });
  }
  return send(res, 200, { success: true, phone: desafio.phone });
}

/* ---------------------------------- Entrada ---------------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Método não permitido." });

  const db = admin();
  if (!db) return send(res, 500, { success: false, code: "SERVER_NOT_CONFIGURED", error: missingEnvMessage() });

  const ownerId = await ownerFromRequest(db, req);
  if (!ownerId) {
    return send(res, 401, { success: false, code: "UNAUTHENTICATED", error: "Inicie sessão para confirmar o número." });
  }

  const body = await readBody(req);
  const action = body.action === "check" ? "check" : body.action === "send" ? "send" : null;
  if (!action) return send(res, 400, { success: false, code: "INVALID_ACTION", error: "Ação inválida." });

  // Já confirmado: não se gasta uma SMS para confirmar o que está confirmado, e
  // o ecrã trata esta resposta como sucesso.
  if (await alreadyVerified(db, ownerId)) {
    return send(res, 200, { success: true, alreadyVerified: true });
  }

  try {
    return action === "send" ? await doSend(db, res, ownerId, body) : await doCheck(db, res, ownerId, body);
  } catch (e) {
    console.error("phone-verify", e);
    return send(res, 500, { success: false, code: "SERVER_ERROR", error: "Não foi possível tratar o pedido." });
  }
}
