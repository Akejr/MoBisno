/**
 * Redefinição da palavra-passe (`web/supabase/auth.ts` e `web/views/login.ts`).
 *
 * O ecrã de entrada não tinha forma de recuperar uma conta: quem se esquecia da
 * palavra-passe ficava fora da loja. O fluxo agora é o do Supabase:
 *
 *  1. «Esqueci-me da palavra-passe» → email → `resetPasswordForEmail`, com
 *     regresso a `/login?redefinir=1`. A resposta é uma frase neutra, a mesma
 *     quer a conta exista quer não;
 *  2. o link do email abre uma sessão de recuperação (evento `PASSWORD_RECOVERY`
 *     do supabase-js v2; `type=recovery` no fluxo implícito) e o ecrã mostra
 *     «Definir nova palavra-passe»;
 *  3. `updateUser({ password })` e segue para o Dashboard.
 *
 * O adaptador corre aqui a sério, com o cliente do Supabase substituído por um
 * falso que regista as chamadas (nenhum pedido sai para a rede). O ecrã depende
 * do DOM e do cliente real, e é verificado pelo texto-fonte — o padrão de
 * `tests/wizardConta.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PASSWORD_MIN_LENGTH } from "../src/ui/wizardSteps.js";

type Ouvinte = (event: string, session: unknown) => void;

const falso = vi.hoisted(() => ({
  reset: [] as unknown[][],
  update: [] as unknown[][],
  erro: null as unknown,
  lancar: false,
  sessao: null as unknown,
  ouvintes: [] as Ouvinte[],
  cancelados: 0,
}));

vi.mock("../web/supabase/client.js", () => ({
  STORAGE_BUCKET: "store-assets",
  supabase: {
    auth: {
      resetPasswordForEmail: async (...args: unknown[]) => {
        falso.reset.push(args);
        if (falso.lancar) throw new TypeError("Failed to fetch");
        return { data: {}, error: falso.erro };
      },
      updateUser: async (...args: unknown[]) => {
        falso.update.push(args);
        if (falso.lancar) throw new TypeError("Failed to fetch");
        return { data: { user: null }, error: falso.erro };
      },
      onAuthStateChange: (cb: Ouvinte) => {
        falso.ouvintes.push(cb);
        return { data: { subscription: { unsubscribe: () => { falso.cancelados += 1; } } } };
      },
      getSession: async () => {
        if (falso.lancar) throw new Error("sem armazenamento");
        return { data: { session: falso.sessao }, error: null };
      },
    },
    from: () => {
      throw new Error("a redefinição da palavra-passe não toca nas tabelas");
    },
  },
}));

type Resultado = { ok: true } | { ok: false; reason: string };

const ESPECIFICADOR = "../web/supabase/auth.js";
const auth = (await import(ESPECIFICADOR)) as {
  PASSWORD_RESET_PATH: string;
  PASSWORD_RESET_PARAM: string;
  passwordResetRedirect(origin: string): string;
  isPasswordRecoveryUrl(href: string): boolean;
  requestPasswordReset(email: string, origin: string): Promise<Resultado>;
  updatePassword(password: string): Promise<Resultado>;
  onPasswordRecovery(cb: () => void): () => void;
  hasActiveSession(): Promise<boolean>;
};

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const LOGIN = ler("web/views/login.ts");
const MAIN = ler("web/main.ts");
const WIZARD = ler("web/views/wizard.ts");

const ORIGEM = "https://mobisno.store";

beforeEach(() => {
  falso.reset.length = 0;
  falso.update.length = 0;
  falso.erro = null;
  falso.lancar = false;
  falso.sessao = null;
  falso.ouvintes.length = 0;
  falso.cancelados = 0;
});

/** Erro no formato do Supabase Auth. */
const erroSupabase = (o: { status?: number; code?: string; name?: string }) =>
  Object.assign(new Error("erro do supabase"), o);

describe("Para onde o link do email traz o Dono", () => {
  it("para /login?redefinir=1, na origem da Plataforma", () => {
    expect(auth.passwordResetRedirect(ORIGEM)).toBe("https://mobisno.store/login?redefinir=1");
    expect(auth.passwordResetRedirect(`${ORIGEM}/`)).toBe("https://mobisno.store/login?redefinir=1");
    expect(auth.passwordResetRedirect("http://localhost:5173")).toBe("http://localhost:5173/login?redefinir=1");
  });

  it("a rota é uma das que o router da SPA encaminha para o ecrã de entrada", () => {
    expect(auth.PASSWORD_RESET_PATH).toBe("/login");
    expect(MAIN).toMatch(/path\.startsWith\("\/login"\)\)\s*\{[\s\S]{0,160}renderLogin\(\);/);
  });

  it("isPasswordRecoveryUrl reconhece as duas marcas do regresso", () => {
    for (const href of [
      `${ORIGEM}/login?redefinir=1`,
      `${ORIGEM}/login?redefinir=1&code=abc123`,
      `${ORIGEM}/login#access_token=x&refresh_token=y&type=recovery`,
    ]) {
      expect(auth.isPasswordRecoveryUrl(href), href).toBe(true);
    }
  });

  it("…e mais nenhuma", () => {
    for (const href of [
      `${ORIGEM}/login`,
      `${ORIGEM}/login?redefinir=0`,
      `${ORIGEM}/login#access_token=x&type=signup`,
      `${ORIGEM}/painel?code=abc123`,
      "não é um endereço",
      "",
    ]) {
      expect(auth.isPasswordRecoveryUrl(href), href).toBe(false);
    }
  });
});

describe("requestPasswordReset — pedir o email", () => {
  it("normaliza o email e pede o link com o regresso certo", async () => {
    expect(await auth.requestPasswordReset("  Dona@Loja.AO ", ORIGEM)).toEqual({ ok: true });
    expect(falso.reset).toEqual([["dona@loja.ao", { redirectTo: "https://mobisno.store/login?redefinir=1" }]]);
  });

  it("um email vazio ou mal escrito nem chega ao Supabase", async () => {
    for (const email of ["", "   ", "dona", "dona@loja", "dona @loja.ao"]) {
      const r = await auth.requestPasswordReset(email, ORIGEM);
      expect(r.ok, email).toBe(false);
    }
    expect(falso.reset).toEqual([]);
  });

  it("o limite de envios do Supabase dá uma frase própria", async () => {
    for (const erro of [erroSupabase({ status: 429 }), erroSupabase({ code: "over_email_send_rate_limit", status: 400 })]) {
      falso.erro = erro;
      const r = await auth.requestPasswordReset("dona@loja.ao", ORIGEM);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/demasiados pedidos/);
    }
  });

  it("uma falha de rede não finge que o email foi enviado", async () => {
    falso.lancar = true;
    const r = await auth.requestPasswordReset("dona@loja.ao", ORIGEM);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ligação/);

    falso.lancar = false;
    falso.erro = erroSupabase({ status: 0, name: "AuthRetryableFetchError" });
    const r2 = await auth.requestPasswordReset("dona@loja.ao", ORIGEM);
    expect(r2.ok).toBe(false);
  });
});

describe("updatePassword — gravar a palavra-passe nova", () => {
  it("grava com updateUser({ password })", async () => {
    expect(await auth.updatePassword("segredo-novo")).toEqual({ ok: true });
    expect(falso.update).toEqual([[{ password: "segredo-novo" }]]);
  });

  it("uma palavra-passe vazia nem chega ao Supabase", async () => {
    const r = await auth.updatePassword("");
    expect(r.ok).toBe(false);
    expect(falso.update).toEqual([]);
  });

  it("cada recusa do Supabase tem a sua frase", async () => {
    const casos: [ReturnType<typeof erroSupabase>, RegExp][] = [
      [erroSupabase({ code: "same_password", status: 422 }), /diferente da anterior/],
      [erroSupabase({ code: "weak_password", status: 422 }), /demasiado fraca/],
      [erroSupabase({ name: "AuthSessionMissingError", status: 400 }), /já não é válido/],
      [erroSupabase({ code: "session_expired", status: 403 }), /já não é válido/],
      [erroSupabase({ status: 401 }), /já não é válido/],
      [erroSupabase({ status: 429 }), /demasiados pedidos/],
      [erroSupabase({ status: 500 }), /Não foi possível guardar/],
    ];
    for (const [erro, frase] of casos) {
      falso.erro = erro;
      const r = await auth.updatePassword("segredo-novo");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason, JSON.stringify(erro)).toMatch(frase);
    }
  });
});

describe("A sessão de recuperação", () => {
  it("onPasswordRecovery avisa só no evento PASSWORD_RECOVERY, e cancela-se", () => {
    let avisos = 0;
    const cancelar = auth.onPasswordRecovery(() => { avisos += 1; });
    expect(falso.ouvintes).toHaveLength(1);
    const ouvinte = falso.ouvintes[0]!;
    for (const evento of ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "SIGNED_OUT"]) ouvinte(evento, null);
    expect(avisos).toBe(0);
    ouvinte("PASSWORD_RECOVERY", { user: {} });
    expect(avisos).toBe(1);
    cancelar();
    expect(falso.cancelados).toBe(1);
  });

  it("hasActiveSession diz se o link abriu uma sessão, e nunca lança", async () => {
    expect(await auth.hasActiveSession()).toBe(false);
    falso.sessao = { access_token: "x" };
    expect(await auth.hasActiveSession()).toBe(true);
    falso.lancar = true;
    expect(await auth.hasActiveSession()).toBe(false);
  });
});

describe("O ecrã de entrada (texto-fonte de web/views/login.ts)", () => {
  it("tem os rótulos do fluxo, com a frase neutra exata", () => {
    expect(LOGIN).toContain('"Esqueci-me da palavra-passe"');
    expect(LOGIN).toContain('"Se existir uma conta com este email, enviámos um link para redefinir a palavra-passe."');
    expect(LOGIN).toContain('"Definir nova palavra-passe"');
  });

  it("pede o link com a origem da página e grava a palavra-passe pelo adaptador", () => {
    expect(LOGIN).toContain("requestPasswordReset(email.value, location.origin)");
    expect(LOGIN).toContain("updatePassword(nova.value)");
    expect(LOGIN).toContain("isPasswordRecoveryUrl(location.href)");
    expect(LOGIN).toContain("onPasswordRecovery(");
    expect(LOGIN).toContain("hasActiveSession()");
  });

  it("depois de gravar a palavra-passe nova segue para o Dashboard", () => {
    const depois = LOGIN.slice(LOGIN.indexOf("updatePassword(nova.value)"));
    expect(depois).toMatch(/^[\s\S]*?go\("\/painel"\)/);
  });

  it("o mínimo vem de PASSWORD_MIN_LENGTH e a confirmação tem de coincidir", () => {
    expect(LOGIN).toContain("PASSWORD_MIN_LENGTH");
    expect(LOGIN).toContain("validatePasswordLength(");
    expect(LOGIN).toContain("validatePasswordConfirmation(");
    // Nenhum número do mínimo escrito à mão.
    expect(LOGIN).not.toMatch(new RegExp(`pelo menos ${PASSWORD_MIN_LENGTH}\\b|minlength="${PASSWORD_MIN_LENGTH}"`));
  });

  it("todos os formulários passam pela guarda contra duplo envio", () => {
    const formularios = LOGIN.match(/<form id="/g) ?? [];
    expect(formularios.length).toBe(3);
    // Uma definição e uma chamada por formulário.
    expect((LOGIN.match(/onSubmitOnce\(/g) ?? []).length).toBe(formularios.length + 1);
    // O único ouvinte de `submit` é o da guarda.
    expect((LOGIN.match(/addEventListener\("submit"/g) ?? []).length).toBe(1);
    const guarda = LOGIN.slice(LOGIN.indexOf("function onSubmitOnce("));
    expect(guarda).toMatch(/if \(ocupado\) return;[\s\S]*?botao\.disabled = true;[\s\S]*?aria-busy/);
  });

  it("cada campo tem rótulo, e os avisos são anunciados", () => {
    for (const m of LOGIN.matchAll(/<input id="([^"]+)"/g)) {
      expect(LOGIN, `campo ${m[1]} sem <label for>`).toContain(`<label for="${m[1]}"`);
    }
    expect(LOGIN).toContain('id="login-alert" role="alert"');
    expect(LOGIN).toContain('id="login-status" role="status" aria-live="polite"');
    expect(LOGIN).toContain('setAttribute("aria-invalid", "true")');
  });

  it("continua a montar o assistente do ecrã «registo»", () => {
    expect(LOGIN).toContain('mountAiAgent(document.getElementById("app"), { screen: "registo" })');
  });
});

describe("O registo no assistente de criação também tem guarda contra duplo envio", () => {
  it("createAccount não chama register enquanto um registo está a correr", () => {
    const fn = WIZARD.slice(WIZARD.indexOf("function createAccount("));
    expect(fn).toMatch(/^function createAccount\(\): void \{\s*if \(registering\) return;\s*registering = true;/);
    expect(fn.indexOf("if (registering) return;")).toBeLessThan(fn.indexOf("authService.register("));
    expect(fn).toMatch(/finally \{\s*registering = false;/);
  });
});
