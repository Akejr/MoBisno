/**
 * Adaptador de autenticação sobre o Supabase Auth, implementando a interface
 * AuthService usada pelo Assistente e pelo wizardFlow. Cada Dono_da_Loja é um
 * utilizador do Supabase Auth; o `StoreOwner.id` é o `auth.uid()`.
 */

import type { Result, StoreOwner } from "../../src/models/index.js";
import { ok, err } from "../../src/models/index.js";
import type {
  AuthService, Session, AuthError, RegisterInput, LoginInput,
} from "../../src/services/authService.js";
import { supabase } from "./client.js";

/* ----------------------- Redefinição da palavra-passe ----------------------- */

/**
 * Rota para onde o link do email traz o Dono de volta: o ecrã de início de
 * sessão (`web/main.ts` encaminha tudo o que começa por `/login` para
 * `renderLogin`), que reconhece {@link PASSWORD_RESET_PARAM} e mostra «Definir
 * nova palavra-passe».
 */
export const PASSWORD_RESET_PATH = "/login";

/** Parâmetro que marca, no endereço, o regresso de um link de redefinição. */
export const PASSWORD_RESET_PARAM = "redefinir";

/**
 * Endereço de regresso do link de redefinição, na origem da Plataforma.
 *
 * Tem de constar de «Redirect URLs» no Supabase (Authentication → URL
 * Configuration). Um endereço fora da lista é trocado pelo «Site URL»: o Dono
 * aterrava na página inicial com a sessão aberta e sem lhe ser pedida a
 * palavra-passe nova.
 */
export function passwordResetRedirect(origin: string): string {
  return `${String(origin ?? "").replace(/\/+$/, "")}${PASSWORD_RESET_PATH}?${PASSWORD_RESET_PARAM}=1`;
}

/**
 * O endereço é o regresso de um link de redefinição?
 *
 * Duas marcas, porque o Supabase tem dois fluxos: a nossa (`?redefinir=1`, posta
 * em `redirectTo`) e a do fluxo implícito (`#…&type=recovery`). No fluxo PKCE —
 * o deste cliente — o Supabase acrescenta `?code=…` e só a primeira existe.
 */
export function isPasswordRecoveryUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.searchParams.get(PASSWORD_RESET_PARAM) === "1") return true;
  return new URLSearchParams(url.hash.replace(/^#/, "")).get("type") === "recovery";
}

/** Resultado de uma operação de palavra-passe: sucesso, ou a frase a mostrar. */
export type PasswordResult = { ok: true } | { ok: false; reason: string };

/** Mesmo formato de email que o `AuthService` aceita. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MSG_EMAIL_INVALIDO = "O email indicado não tem um formato válido.";
const MSG_LIMITE = "Foram feitos demasiados pedidos seguidos. Aguarde alguns minutos e tente de novo.";
const MSG_LINK_EXPIRADO = "O link para redefinir a palavra-passe já não é válido. Peça um novo.";

/** Estado, código e nome de um erro do Supabase Auth, lidos sem confiar no tipo. */
function errorInfo(error: unknown): { status: number; code: string; name: string } {
  const e = (error ?? {}) as { status?: unknown; code?: unknown; name?: unknown };
  return {
    status: typeof e.status === "number" ? e.status : 0,
    code: typeof e.code === "string" ? e.code : "",
    name: typeof e.name === "string" ? e.name : "",
  };
}

/**
 * Pede o email com o link para redefinir a palavra-passe.
 *
 * O sucesso não diz se a conta existe: o Supabase responde da mesma forma para
 * qualquer email, e o ecrã mostra a mesma frase neutra. As falhas que se
 * mostram (formato, limite de envios, rede) também não dependem da conta.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<PasswordResult> {
  const clean = (typeof email === "string" ? email : "").trim().toLowerCase();
  if (!clean) return { ok: false, reason: "Indique o email da sua conta." };
  if (!EMAIL_RE.test(clean)) return { ok: false, reason: MSG_EMAIL_INVALIDO };

  let error: unknown = null;
  try {
    ({ error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: passwordResetRedirect(origin) }));
  } catch (e) {
    error = e;
  }
  if (!error) return { ok: true };

  const e = errorInfo(error);
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit") {
    return { ok: false, reason: MSG_LIMITE };
  }
  if (e.code === "email_address_invalid" || e.code === "validation_failed") return { ok: false, reason: MSG_EMAIL_INVALIDO };
  return { ok: false, reason: "Não foi possível enviar o email agora. Verifique a ligação e tente de novo." };
}

/**
 * Grava a nova palavra-passe na sessão aberta pelo link de recuperação.
 *
 * Só exige palavra-passe não vazia, como o resto deste adaptador: o mínimo de
 * caracteres é a regra do ecrã (`PASSWORD_MIN_LENGTH`), aplicada antes de chegar
 * aqui.
 */
export async function updatePassword(password: string): Promise<PasswordResult> {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, reason: "Escreva a nova palavra-passe." };
  }
  let error: unknown = null;
  try {
    ({ error } = await supabase.auth.updateUser({ password }));
  } catch (e) {
    error = e;
  }
  if (!error) return { ok: true };

  const e = errorInfo(error);
  if (e.code === "same_password") return { ok: false, reason: "A nova palavra-passe tem de ser diferente da anterior." };
  if (e.code === "weak_password" || e.name === "AuthWeakPasswordError") {
    return { ok: false, reason: "Essa palavra-passe é demasiado fraca. Escolha uma mais longa e difícil de adivinhar." };
  }
  if (e.status === 429 || e.code === "over_request_rate_limit") return { ok: false, reason: MSG_LIMITE };
  if (
    e.name === "AuthSessionMissingError"
    || ["session_not_found", "session_expired", "bad_jwt", "refresh_token_not_found", "reauthentication_needed"].includes(e.code)
    || e.status === 401 || e.status === 403
  ) {
    return { ok: false, reason: MSG_LINK_EXPIRADO };
  }
  return { ok: false, reason: "Não foi possível guardar a nova palavra-passe. Tente de novo." };
}

/**
 * Avisa quando o Supabase confirma uma sessão de recuperação (evento
 * `PASSWORD_RECOVERY` do supabase-js v2). Devolve a função que cancela.
 */
export function onPasswordRecovery(cb: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") cb();
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Há sessão neste navegador? Espera que o cliente acabe de ler o link (a troca
 * do código PKCE é feita quando o cliente arranca).
 */
export async function hasActiveSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

function toSession(ownerId: string, email: string, token: string): Session {
  return { ownerId, email, token, createdAt: new Date().toISOString() };
}

function authErr(code: AuthError["code"], reason: string, fields: string[]): Result<Session, AuthError> {
  return err({ code, reason, fields });
}

/** Garante a existência do perfil (profiles) do utilizador autenticado. */
async function ensureProfile(id: string, email: string, name: string): Promise<void> {
  await supabase.from("profiles").upsert({ id, email, name }, { onConflict: "id" });
}

export function createSupabaseAuthService(): AuthService {
  return {
    async register(input: RegisterInput): Promise<Result<Session, AuthError>> {
      const email = (input?.email ?? "").trim().toLowerCase();
      const password = input?.password ?? "";
      const name = (input?.name ?? "").trim();
      if (!email) return authErr("EMAIL_EM_FALTA", "O email é obrigatório.", ["email"]);
      if (!password) return authErr("PALAVRA_PASSE_EM_FALTA", "A palavra-passe é obrigatória.", ["password"]);
      if (!name) return authErr("NOME_EM_FALTA", "O nome é obrigatório.", ["name"]);

      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { name } },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        const status = (error as { status?: number }).status;
        if (status === 429 || msg.includes("rate limit")) {
          return authErr("CREDENCIAIS_INVALIDAS",
            "Limite de registos atingido (envio de email do Supabase). Desative a confirmação de email no Supabase e aguarde alguns minutos antes de tentar de novo.",
            ["email"]);
        }
        if (msg.includes("already") || msg.includes("registered")) {
          return authErr("EMAIL_JA_REGISTADO", "Já existe uma conta associada a este email.", ["email"]);
        }
        return authErr("EMAIL_INVALIDO", error.message, ["email"]);
      }
      if (!data.session || !data.user) {
        // Confirmação de email ativa: não há sessão ainda.
        return authErr("CREDENCIAIS_INVALIDAS",
          "Conta criada, mas é necessário confirmar o email. Para testes, desative a confirmação de email no Supabase (Authentication → Providers → Email).",
          ["email"]);
      }
      await ensureProfile(data.user.id, email, name);
      return ok(toSession(data.user.id, email, data.session.access_token));
    },

    async login(input: LoginInput): Promise<Result<Session, AuthError>> {
      const email = (input?.email ?? "").trim().toLowerCase();
      const password = input?.password ?? "";
      if (!email) return authErr("EMAIL_EM_FALTA", "O email é obrigatório.", ["email"]);
      if (!password) return authErr("PALAVRA_PASSE_EM_FALTA", "A palavra-passe é obrigatória.", ["password"]);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) {
        return authErr("CREDENCIAIS_INVALIDAS", "O email ou a palavra-passe estão incorretos.", ["email", "password"]);
      }
      const name = (data.user.user_metadata?.name as string | undefined) ?? "";
      await ensureProfile(data.user.id, email, name);
      return ok(toSession(data.user.id, email, data.session.access_token));
    },

    async getCurrentOwner(_session: Session): Promise<StoreOwner | null> {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: profile } = await supabase.from("profiles").select("name,email").eq("id", user.id).maybeSingle();
      return {
        id: user.id,
        email: profile?.email ?? user.email ?? "",
        passwordHash: "",
        name: profile?.name ?? (user.user_metadata?.name as string | undefined) ?? "",
        createdAt: user.created_at ?? new Date().toISOString(),
      };
    },
  };
}
