/**
 * `/api/email-check` — «este email já tem conta?», perguntado no passo do email.
 *
 * ## O que isto fecha
 *
 * O assistente de criação só descobria que o email estava ocupado **no fim**:
 * depois do nome, do email, da palavra-passe escrita duas vezes e do resumo
 * confirmado. Aconteceu com um email real, e a pessoa teve de voltar atrás com
 * tudo escrito.
 *
 * ## As duas asserções que importam
 *
 *  - **Lê as identidades, não os perfis.** O caso que motivou isto era um email
 *    ocupado por uma identidade **sem perfil** — o que ficava das contas
 *    eliminadas antes de `api/admin-account.js` apagar as três camadas. Um
 *    `select` em `profiles` dizia «livre» e o registo falhava logo a seguir.
 *  - **A resposta não diz mais do que «ocupado».** Nem de quem é a conta, nem se
 *    tem perfil: isso é informação do Painel_Admin.
 *
 * O especificador fica numa constante: com ele literal, o `tsc` segue-o e
 * compila `api/` dentro do programa de `tests/`.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const env = vi.hoisted(() => {
  const nomes = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const antes = Object.fromEntries(nomes.map((n) => [n, process.env[n]])) as Record<string, string | undefined>;
  process.env.SUPABASE_URL = "https://projeto-de-teste.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  return { nomes, antes };
});

const estado = vi.hoisted(() => ({
  /** Identidades em `auth.users`. Nenhuma tem perfil: o endpoint não os lê. */
  users: [] as { id: string; email: string }[],
  erro: null as { message: string } | null,
  /** Quantas vezes `listUsers` foi chamada, para provar de onde vem a resposta. */
  leituras: 0,
}));

vi.mock("../api/_shared.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admin: () => ({
    auth: {
      admin: {
        listUsers: async () => {
          estado.leituras += 1;
          if (estado.erro) return { data: null, error: estado.erro };
          return { data: { users: estado.users }, error: null };
        },
      },
    },
    from: () => { throw new Error("o email-check não lê tabelas: a identidade pode não ter perfil"); },
  }),
}));

const ESP_EMAIL_CHECK = "../api/email-check.js";
const handler = ((await import(ESP_EMAIL_CHECK)) as { default: (req: unknown, res: unknown) => Promise<unknown> }).default;

function resposta() {
  const r = {
    statusCode: 0,
    body: undefined as Record<string, unknown> | undefined,
    status(code: number) { r.statusCode = code; return r; },
    json(body: unknown) { r.body = body as Record<string, unknown>; return r; },
    setHeader() { /* sem cabeçalhos a verificar */ },
  };
  return r;
}

function pedido(opts: { method?: string; email?: unknown; origin?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? "1.1.1.1" };
  if (opts.origin) headers.origin = opts.origin;
  return {
    method: opts.method ?? "POST",
    headers,
    query: {},
    // `in` e não `??`: `null` é um caso a testar, não uma ausência de valor.
    body: { email: "email" in opts ? opts.email : "amigo@exemplo.ao" },
    on() { throw new Error("o corpo já vem lido"); },
  };
}

beforeEach(() => {
  estado.users = [];
  estado.erro = null;
  estado.leituras = 0;
});

afterAll(() => {
  for (const n of env.nomes) {
    if (env.antes[n] === undefined) delete process.env[n];
    else process.env[n] = env.antes[n];
  }
});

describe("Email já ocupado — a pergunta é sobre as identidades", () => {
  it("uma identidade sem perfil conta como ocupada: é a que faz o registo falhar", async () => {
    // O caso real: a conta foi eliminada, o perfil foi-se, a identidade ficou.
    estado.users = [{ id: "u1", email: "eaafonso24@gmail.com" }];
    const res = resposta();
    await handler(pedido({ email: "eaafonso24@gmail.com" }), res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ ok: true, taken: true });
    expect(estado.leituras, "não leu as identidades").toBe(1);
  });

  it("um email que ninguém tem está livre", async () => {
    estado.users = [{ id: "u1", email: "outro@exemplo.ao" }];
    const res = resposta();
    await handler(pedido({ email: "amigo@exemplo.ao" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, taken: false });
  });

  it("maiúsculas e espaços não fazem um email novo", async () => {
    estado.users = [{ id: "u1", email: "eaafonso24@gmail.com" }];
    const res = resposta();
    await handler(pedido({ email: "  EAAfonso24@Gmail.COM  " }), res);
    expect(res.body).toEqual({ ok: true, taken: true });
  });

  it("a resposta não diz de quem é a conta", async () => {
    estado.users = [{ id: "u1", email: "eaafonso24@gmail.com" }];
    const res = resposta();
    await handler(pedido({ email: "eaafonso24@gmail.com" }), res);
    const chaves = Object.keys(res.body ?? {}).sort();
    expect(chaves).toEqual(["ok", "taken"]);
  });
});

describe("Email já ocupado — o que é recusado", () => {
  it("um email sem forma de email: 400, sem ler nada", async () => {
    for (const mau of ["", "   ", "sem-arroba", "a@b", 12, null]) {
      const res = resposta();
      await handler(pedido({ email: mau }), res);
      expect(res.statusCode, String(mau)).toBe(400);
      expect(res.body).toMatchObject({ code: "BAD_EMAIL" });
    }
    expect(estado.leituras).toBe(0);
  });

  it("outro método HTTP: 405", async () => {
    const res = resposta();
    await handler(pedido({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
    expect(estado.leituras).toBe(0);
  });

  it("um site de fora: 403", async () => {
    const res = resposta();
    await handler(pedido({ origin: "https://outro-site.example" }), res);
    expect(res.statusCode).toBe(403);
    expect(estado.leituras).toBe(0);
  });

  it("a nossa origem passa", async () => {
    const res = resposta();
    await handler(pedido({ origin: "https://mobisno.store" }), res);
    expect(res.statusCode).toBe(200);
  });

  it("uma falha a ler as identidades diz-se, e não se inventa «livre»", async () => {
    // Quem chama trata isto como «não foi possível verificar» e segue: a última
    // palavra é o registo (`web/supabase/auth.ts`, `emailTaken` devolve `null`).
    estado.erro = { message: "service unavailable" };
    const res = resposta();
    await handler(pedido(), res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ code: "LOOKUP_FAILED" });
    expect(res.body?.taken).toBeUndefined();
  });

  it("demasiadas perguntas do mesmo IP: 429", async () => {
    // O limite existe porque cada pedido é uma pergunta sobre o email de outra
    // pessoa. 20 numa janela chegam para quem se engana a escrever.
    const IP = "9.9.9.9";
    let ultimo = resposta();
    for (let i = 0; i < 21; i += 1) {
      ultimo = resposta();
      await handler(pedido({ ip: IP }), ultimo);
    }
    expect(ultimo.statusCode).toBe(429);
    expect(ultimo.body).toMatchObject({ code: "RATE_LIMITED" });
  });
});
