/**
 * `/api/admin-account` — eliminar uma conta a sério, e quem pode fazê-lo.
 *
 * ## O defeito que isto fecha
 *
 * «Eliminar conta» apagava as lojas e o perfil **do navegador**. A identidade
 * vive em `auth.users`, que só a service role pode tocar, e sobrevivia: o email
 * ficava ocupado para sempre. Um Dono cuja conta foi eliminada tentou criar
 * outra com o mesmo email e ouviu «já existe uma conta associada a este email».
 *
 * ## Porque é que as asserções são sobre a autorização
 *
 * Esta função apaga identidades com a service role. Se a guarda cair, qualquer
 * pessoa com sessão apaga a conta de qualquer outra. Por isso os primeiros
 * exemplos são os que **recusam**: sem token, com token de quem não é
 * administrador, a própria conta e a de outro administrador.
 *
 * O especificador fica numa constante: com ele literal, o `tsc` segue-o e
 * compila `api/` dentro do programa de `tests/`. É o padrão de
 * `tests/paymentCallbacks.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const DONO = "22222222-2222-4222-8222-222222222222";
const OUTRO_ADMIN = "33333333-3333-4333-8333-333333333333";
const PRESO = "44444444-4444-4444-8444-444444444444";

const env = vi.hoisted(() => {
  const nomes = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const antes = Object.fromEntries(nomes.map((n) => [n, process.env[n]])) as Record<string, string | undefined>;
  process.env.SUPABASE_URL = "https://projeto-de-teste.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  return { nomes, antes };
});

/** Base de dados e serviço de autenticação falsos. */
const estado = vi.hoisted(() => ({
  /** Quem o token identifica, ou `null` para «sem sessão». */
  user: null as { id: string } | null,
  /** `profiles` por id. Ausente = conta sem perfil. */
  perfis: {} as Record<string, { is_admin?: boolean }>,
  /** Contas em `auth.users`. */
  users: [] as { id: string; email: string; created_at: string }[],
  apagados: { stores: [] as string[], profiles: [] as string[], identidades: [] as string[] },
  /** Falha a apagar a identidade, para o caminho em que o email fica preso. */
  erroIdentidade: null as { message: string } | null,
}));

vi.mock("../api/_shared.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admin: () => ({
    auth: {
      getUser: async (token: string) => (estado.user && token
        ? { data: { user: estado.user }, error: null }
        : { data: null, error: { message: "token inválido" } }),
      admin: {
        deleteUser: async (id: string) => {
          if (estado.erroIdentidade) return { error: estado.erroIdentidade };
          estado.apagados.identidades.push(id);
          return { error: null };
        },
        listUsers: async () => ({ data: { users: estado.users }, error: null }),
      },
    },
    from: (tabela: string) => ({
      select: () => ({
        eq: (_coluna: string, id: string) => ({
          maybeSingle: async () => ({ data: estado.perfis[id] ?? null, error: null }),
        }),
        in: async (_coluna: string, ids: string[]) => ({
          data: ids.filter((id) => estado.perfis[id] !== undefined).map((id) => ({ id })),
          error: null,
        }),
      }),
      delete: () => ({
        eq: async (_coluna: string, id: string) => {
          (tabela === "stores" ? estado.apagados.stores : estado.apagados.profiles).push(id);
          return { error: null };
        },
      }),
    }),
  }),
}));

const ESP_ADMIN_ACCOUNT = "../api/admin-account.js";
const handler = ((await import(ESP_ADMIN_ACCOUNT)) as { default: (req: unknown, res: unknown) => Promise<unknown> }).default;

/** Resposta falsa no formato do Vercel. */
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

function pedido(opts: { method?: string; token?: boolean; body?: unknown } = {}) {
  return {
    method: opts.method ?? "POST",
    headers: opts.token === false ? {} : { authorization: "Bearer token-de-teste" },
    query: {},
    body: opts.body ?? { ownerId: DONO },
    on() { throw new Error("o corpo já vem lido"); },
  };
}

/** Nada foi apagado, em nenhuma das três camadas. */
function nadaApagado(): void {
  expect(estado.apagados.stores, "apagou lojas").toEqual([]);
  expect(estado.apagados.profiles, "apagou perfis").toEqual([]);
  expect(estado.apagados.identidades, "apagou identidades").toEqual([]);
}

beforeEach(() => {
  estado.user = { id: ADMIN };
  estado.perfis = {
    [ADMIN]: { is_admin: true },
    [OUTRO_ADMIN]: { is_admin: true },
    [DONO]: { is_admin: false },
  };
  estado.users = [];
  estado.apagados = { stores: [], profiles: [], identidades: [] };
  estado.erroIdentidade = null;
});

afterAll(() => {
  for (const n of env.nomes) {
    if (env.antes[n] === undefined) delete process.env[n];
    else process.env[n] = env.antes[n];
  }
});

describe("Eliminar conta — quem não pode", () => {
  it("sem sessão: 403 e nada apagado", async () => {
    estado.user = null;
    const res = resposta();
    await handler(pedido({ token: false }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
    nadaApagado();
  });

  it("com sessão mas sem ser administrador: 403 e nada apagado", async () => {
    // A guarda é `profiles.is_admin` lido no servidor — nunca um campo do corpo.
    estado.user = { id: DONO };
    const res = resposta();
    await handler(pedido({ body: { ownerId: OUTRO_ADMIN } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
    nadaApagado();
  });

  it("uma conta sem perfil não é administrador: 403", async () => {
    estado.user = { id: PRESO };
    const res = resposta();
    await handler(pedido(), res);
    expect(res.statusCode).toBe(403);
    nadaApagado();
  });

  it("a própria conta: 400 e nada apagado", async () => {
    const res = resposta();
    await handler(pedido({ body: { ownerId: ADMIN } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "SELF" });
    nadaApagado();
  });

  it("a conta de outro administrador: 400 e nada apagado", async () => {
    const res = resposta();
    await handler(pedido({ body: { ownerId: OUTRO_ADMIN } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "IS_ADMIN" });
    nadaApagado();
  });

  it("sem conta no corpo: 400", async () => {
    const res = resposta();
    await handler(pedido({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "MISSING_OWNER" });
    nadaApagado();
  });

  it("outro método HTTP: 405", async () => {
    const res = resposta();
    await handler(pedido({ method: "PUT" }), res);
    expect(res.statusCode).toBe(405);
    nadaApagado();
  });
});

describe("Eliminar conta — as três camadas, incluindo a identidade", () => {
  it("apaga as lojas, o perfil e a identidade", async () => {
    // A identidade é o passo que faltava: é ela que liberta o email.
    const res = resposta();
    await handler(pedido(), res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(estado.apagados.stores).toEqual([DONO]);
    expect(estado.apagados.profiles).toEqual([DONO]);
    expect(estado.apagados.identidades, "o email continuaria ocupado").toEqual([DONO]);
  });

  it("uma conta já sem perfil é aceite: é o email preso a ser libertado", async () => {
    const res = resposta();
    await handler(pedido({ body: { ownerId: PRESO } }), res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(estado.apagados.identidades).toEqual([PRESO]);
  });

  it("se a identidade não for apagada, a resposta diz que o email continua ocupado", async () => {
    /*
     * O silêncio aqui era o defeito original: o painel dizia «Conta eliminada»
     * e o email ficava preso. Falhar tem de ser visível.
     */
    estado.erroIdentidade = { message: "User not allowed" };
    const res = resposta();
    await handler(pedido(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: "AUTH_FAILED" });
    expect(String(res.body?.error)).toContain("email continua ocupado");
    expect(String(res.body?.error)).toContain("User not allowed");
  });
});

describe("Emails presos — contas em auth.users sem perfil", () => {
  it("lista só as que não têm perfil", async () => {
    estado.users = [
      { id: ADMIN, email: "admin@mobisno.store", created_at: "2026-01-01T00:00:00Z" },
      { id: DONO, email: "dono@exemplo.ao", created_at: "2026-02-01T00:00:00Z" },
      { id: PRESO, email: "amigo@exemplo.ao", created_at: "2026-03-01T00:00:00Z" },
    ];
    const res = resposta();
    await handler(pedido({ method: "GET" }), res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const presos = (res.body?.orphans ?? []) as { id: string; email: string }[];
    expect(presos).toHaveLength(1);
    expect(presos[0]).toMatchObject({ id: PRESO, email: "amigo@exemplo.ao" });
    // Quantas identidades foram lidas: é o que distingue «nenhum email preso»
    // de «não consegui ler nada», que o painel mostrava igual.
    expect(res.body?.checked).toBe(3);
  });

  it("sem contas em auth.users, a lista é vazia e nada foi verificado", async () => {
    const res = resposta();
    await handler(pedido({ method: "GET" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body?.orphans).toEqual([]);
    expect(res.body?.checked).toBe(0);
  });

  it("a listagem também exige ser administrador: traz emails de contas", async () => {
    estado.user = { id: DONO };
    estado.users = [{ id: PRESO, email: "amigo@exemplo.ao", created_at: "2026-03-01T00:00:00Z" }];
    const res = resposta();
    await handler(pedido({ method: "GET" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body?.orphans).toBeUndefined();
  });
});
