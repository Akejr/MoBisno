/**
 * Confirmação do telemóvel da conta, do lado do navegador.
 *
 * O envio e a comparação do código correm no servidor
 * (`api/phone-verify.js`): a chave do serviço de SMS e o próprio código nunca
 * chegam aqui. Este módulo só leva o pedido com o token da sessão e devolve a
 * resposta tal como ela vem.
 *
 * A leitura do estado (`readPhoneStatus`) vai direta ao Supabase: o Dono lê o
 * seu próprio perfil (política `profiles_self`), e escrevê-lo não lhe serve de
 * nada — o gatilho `profiles_guard` repõe os dois campos (migração 0026).
 */
import { supabase } from "./client.js";

/** O que a conta tem gravado sobre o telemóvel. */
export interface PhoneStatus {
  /** Número confirmado (`2449XXXXXXXX`), ou `null`. */
  phone: string | null;
  /** Confirmado? Enquanto for `false`, nenhuma loja da conta pode ser publicada. */
  verified: boolean;
}

/** Resposta de um pedido de código ou de uma confirmação. */
export interface PhoneResult {
  success: boolean;
  /** Código do erro, para decidir o que fazer. A frase é do servidor. */
  code?: string;
  error?: string;
  /** Já estava confirmado: quem chama trata como sucesso. */
  alreadyVerified?: boolean;
  /** Envios já feitos neste desafio. */
  sends?: number;
  /** Espera até ao próximo reenvio, ou `null` quando já não há reenvios. */
  resendInMs?: number | null;
  /** Validade do código enviado. */
  expiresInMs?: number;
  /** Quanto falta para poder pedir outro código (resposta `TOO_SOON`). */
  waitMs?: number;
  /** Tentativas que restam (resposta `WRONG_CODE`). */
  attemptsLeft?: number;
}

/** Cabeçalho com o token da sessão. Sem sessão, o servidor responde 401. */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Chama `/api/phone-verify`. Uma falha de rede é um resultado, não uma excepção. */
async function call(body: Record<string, unknown>): Promise<PhoneResult> {
  try {
    const r = await fetch("/api/phone-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    return (await r.json()) as PhoneResult;
  } catch {
    return { success: false, code: "NETWORK", error: "Não foi possível contactar o servidor. Verifique a ligação." };
  }
}

/** Envia (ou reenvia) o código por SMS para `phone`. */
export async function requestPhoneCode(phone: string): Promise<PhoneResult> {
  return call({ action: "send", phone });
}

/** Confirma o código que o Dono escreveu. */
export async function confirmPhoneCode(code: string): Promise<PhoneResult> {
  return call({ action: "check", code });
}

/**
 * Estado gravado do telemóvel desta conta.
 *
 * Em caso de falha de leitura devolve `verified: true`. É deliberado: a guarda
 * de verdade é o gatilho da base de dados, e tratar uma falha de rede como
 * «número por confirmar» poria um aviso falso no painel de quem já confirmou —
 * e escondia o botão de publicar a quem tem tudo em ordem.
 */
export async function readPhoneStatus(ownerId: string): Promise<PhoneStatus> {
  const { data, error } = await supabase
    .from("profiles")
    .select("phone, phone_verified_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) {
    console.error("readPhoneStatus", error);
    return { phone: null, verified: true };
  }
  return {
    phone: typeof data?.phone === "string" ? data.phone : null,
    verified: !!data?.phone_verified_at,
  };
}
