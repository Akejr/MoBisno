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
