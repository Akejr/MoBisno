/**
 * Funções de pagamento sem fornecedor ligado (`api/_provider.js`).
 *
 * A integração MoMenu saiu e o fornecedor novo ainda não está ligado:
 * `getPaymentProvider()` devolve `null`. Nesse estado, `/api/payment`,
 * `/api/payment-status` e `/api/payment-webhook` têm de responder
 * `503 PAYMENTS_UNAVAILABLE` **antes de tocar na base de dados** — nem ler o
 * corpo do pedido. É a garantia de que um botão de pagamento que apareça por
 * engano não cria encomendas abertas nem pagamentos de plano órfãos, e de que
 * ninguém consegue usar o webhook para marcar uma encomenda como paga.
 *
 * Como se prova «sem tocar na base de dados»:
 *
 *  - `admin()` (o único caminho para o cliente com service role) é substituído
 *    por um espião que falha se for chamado;
 *  - o corpo do pedido é um *getter* que conta leituras, e `req.on` falha;
 *  - `fetch` é substituído por um espião: nenhum pedido sai para a rede.
 *
 * As variáveis de ambiente do Supabase são postas com valores falsos antes de
 * os módulos carregarem (o servidor estaria configurado) e repostas no fim.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { PAYMENTS_PROVIDER_READY } from "../src/services/payments.js";

const estado = vi.hoisted(() => {
  const nomes = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const antes = Object.fromEntries(nomes.map((n) => [n, process.env[n]])) as Record<(typeof nomes)[number], string | undefined>;
  process.env.SUPABASE_URL = "https://projeto-de-teste.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-service-role-de-teste";
  return { antes, nomes, chamadasAdmin: 0 };
});

vi.mock("../api/_provider.js", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, getPaymentProvider: () => null };
});

vi.mock("../api/_shared.js", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    admin: () => {
      estado.chamadasAdmin += 1;
      throw new Error("sem fornecedor de pagamentos, a base de dados não pode ser tocada");
    },
  };
});

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

/** Especificadores em constante: mantêm `api/` fora do programa do `tsc`. */
const ESPECIFICADORES = {
  payment: "../api/payment.js",
  status: "../api/payment-status.js",
  webhook: "../api/payment-webhook.js",
  health: "../api/health.js",
  provider: "../api/_provider.js",
} as const;

const carregar = async (spec: string): Promise<Handler> => ((await import(spec)) as { default: Handler }).default;

const payment = await carregar(ESPECIFICADORES.payment);
const paymentStatus = await carregar(ESPECIFICADORES.status);
const webhook = await carregar(ESPECIFICADORES.webhook);
const health = await carregar(ESPECIFICADORES.health);
const { PAYMENTS_UNAVAILABLE } = (await import(ESPECIFICADORES.provider)) as {
  PAYMENTS_UNAVAILABLE: { success: boolean; code: string; error: string };
};

/** Resposta falsa no formato do Vercel (`res.status(c).json(o)`). */
function resposta() {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    json(body: unknown) {
      r.body = body;
      return r;
    },
    setHeader() {
      /* sem cabeçalhos a verificar */
    },
  };
  return r;
}

/** Pedido falso que conta as leituras do corpo e falha se alguém o ler como stream. */
function pedido(o: { method: string; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> }) {
  const leituras = { body: 0 };
  const req = {
    method: o.method,
    headers: o.headers ?? {},
    query: o.query ?? {},
    get body() {
      leituras.body += 1;
      return o.body;
    },
    on() {
      throw new Error("o corpo do pedido não pode ser lido sem fornecedor");
    },
  };
  return { req, leituras };
}

const UUID = "3f1c2a4e-9b7d-4c1e-8a2f-6d5e4c3b2a10";
const fetchEspiao = vi.fn(() => {
  throw new Error("nenhum pedido pode sair para a rede");
});

beforeEach(() => {
  estado.chamadasAdmin = 0;
  fetchEspiao.mockClear();
  vi.stubGlobal("fetch", fetchEspiao);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const n of estado.nomes) {
    if (estado.antes[n] === undefined) delete process.env[n];
    else process.env[n] = estado.antes[n];
  }
});

/** O que nenhum pedido sem fornecedor pode fazer. */
function semEfeitos(leituras: { body: number }): void {
  expect(estado.chamadasAdmin, "admin() foi chamado").toBe(0);
  expect(leituras.body, "o corpo foi lido").toBe(0);
  expect(fetchEspiao, "houve um pedido de rede").not.toHaveBeenCalled();
}

describe("A resposta comum sem fornecedor", () => {
  it("é PAYMENTS_UNAVAILABLE, com uma frase para quem compra", () => {
    expect(PAYMENTS_UNAVAILABLE.success).toBe(false);
    expect(PAYMENTS_UNAVAILABLE.code).toBe("PAYMENTS_UNAVAILABLE");
    expect(PAYMENTS_UNAVAILABLE.error).toMatch(/Multicaixa Express/);
    expect(PAYMENTS_UNAVAILABLE.error).toMatch(/ainda não estão disponíveis/);
  });

  it("enquanto o navegador esconde os pagamentos digitais, o servidor não tem adaptador", async () => {
    // Um só sentido: com `PAYMENTS_PROVIDER_READY` a `false`, um adaptador real
    // no servidor seria pagamentos prontos que ninguém vê.
    const real = await vi.importActual<{ getPaymentProvider(): unknown }>(ESPECIFICADORES.provider);
    if (!PAYMENTS_PROVIDER_READY) expect(real.getPaymentProvider()).toBeNull();
  });
});

describe("POST /api/payment sem fornecedor", () => {
  it("encomenda numa loja: 503 PAYMENTS_UNAVAILABLE, sem tocar em nada", async () => {
    const { req, leituras } = pedido({
      method: "POST",
      body: {
        kind: "store", storeId: UUID, method: "mcx", phone: "923456789",
        lines: [{ id: UUID, quantity: 2 }], expectedTotal: 5000,
      },
    });
    const res = resposta();
    await payment(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual(PAYMENTS_UNAVAILABLE);
    semEfeitos(leituras);
  });

  it("subscrição: 503 PAYMENTS_UNAVAILABLE, nem com sessão iniciada", async () => {
    const { req, leituras } = pedido({
      method: "POST",
      headers: { authorization: "Bearer token-de-sessao" },
      body: { kind: "plan", method: "reference" },
    });
    const res = resposta();
    await payment(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual(PAYMENTS_UNAVAILABLE);
    semEfeitos(leituras);
  });

  it("outro método HTTP: 405, também sem tocar em nada", async () => {
    const { req, leituras } = pedido({ method: "GET" });
    const res = resposta();
    await payment(req, res);
    expect(res.statusCode).toBe(405);
    semEfeitos(leituras);
  });
});

describe("GET /api/payment-status sem fornecedor", () => {
  for (const kind of ["store", "plan"]) {
    it(`${kind}: 503 PAYMENTS_UNAVAILABLE, sem ler o registo`, async () => {
      const { req, leituras } = pedido({ method: "GET", query: { kind, id: UUID } });
      const res = resposta();
      await paymentStatus(req, res);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual(PAYMENTS_UNAVAILABLE);
      semEfeitos(leituras);
    });
  }

  it("outro método HTTP: 405", async () => {
    const { req, leituras } = pedido({ method: "POST", body: {} });
    const res = resposta();
    await paymentStatus(req, res);
    expect(res.statusCode).toBe(405);
    semEfeitos(leituras);
  });
});

describe("POST /api/payment-webhook sem fornecedor", () => {
  it("503 PAYMENTS_UNAVAILABLE: uma notificação forjada não marca nada como pago", async () => {
    // Era o buraco da versão MoMenu: qualquer POST com o `transactionId` certo
    // confirmava a encomenda.
    const { req, leituras } = pedido({
      method: "POST",
      body: { transactionId: "abc", status: "paid", providerRef: "abc" },
    });
    const res = resposta();
    await webhook(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual(PAYMENTS_UNAVAILABLE);
    semEfeitos(leituras);
  });

  it("outro método HTTP: 405", async () => {
    const { req, leituras } = pedido({ method: "GET" });
    const res = resposta();
    await webhook(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ received: false });
    semEfeitos(leituras);
  });
});

describe("GET /api/health sem fornecedor", () => {
  /**
   * É por este endpoint que se confirma, ao ligar a cobrança, que cada variável
   * de ambiente chegou às funções serverless. Daí as duas exigências: dizer a
   * verdade sobre **cada** peça, uma a uma (as credenciais, o segredo do
   * callback e o email são variáveis distintas, e falhar uma delas falha de
   * formas diferentes), e não deixar escapar nada de um segredo.
   */
  const SEM_NADA = {
    ok: true,
    supabaseUrl: true,
    serviceRole: true,
    paymentProvider: null,
    paymentWebhook: false,
    email: false,
    sms: false,
  };

  it("diz que não há fornecedor, nem callback, nem email, e que o Supabase está configurado", async () => {
    const { req, leituras } = pedido({ method: "GET" });
    const res = resposta();
    await health(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(SEM_NADA);
    semEfeitos(leituras);
  });

  it("cada peça é lida da sua própria variável", async () => {
    // Uma só variável a ligar tudo dava um `true` a mentir sobre as outras.
    const antes = { k: process.env.WIPAY_WEBHOOK_SECRET, r: process.env.RESEND_API_KEY };
    process.env.WIPAY_WEBHOOK_SECRET = "segredo-de-teste";
    process.env.RESEND_API_KEY = "chave-resend-de-teste";
    try {
      const res = resposta();
      await health(pedido({ method: "GET" }).req, res);
      expect(res.body).toEqual({ ...SEM_NADA, paymentWebhook: true, email: true });
    } finally {
      if (antes.k === undefined) delete process.env.WIPAY_WEBHOOK_SECRET;
      else process.env.WIPAY_WEBHOOK_SECRET = antes.k;
      if (antes.r === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = antes.r;
    }
  });

  it("nenhum segredo, nem um pedaço de um, sai na resposta", async () => {
    const antes = { k: process.env.WIPAY_WEBHOOK_SECRET, r: process.env.RESEND_API_KEY };
    process.env.WIPAY_WEBHOOK_SECRET = "segredo-de-teste";
    process.env.RESEND_API_KEY = "chave-resend-de-teste";
    try {
      const res = resposta();
      await health(pedido({ method: "GET" }).req, res);
      const texto = JSON.stringify(res.body);
      for (const segredo of ["chave-service-role-de-teste", "projeto-de-teste", "segredo-de-teste", "chave-resend-de-teste"]) {
        expect(texto, `o segredo «${segredo}» saiu na resposta`).not.toContain(segredo);
      }
      // Nem o tamanho de um segredo: só booleanos e o nome do fornecedor.
      for (const valor of Object.values(res.body as Record<string, unknown>)) {
        expect(["boolean", "object", "string"], `tipo inesperado: ${typeof valor}`).toContain(typeof valor);
        if (typeof valor === "number") expect.unreachable();
      }
    } finally {
      if (antes.k === undefined) delete process.env.WIPAY_WEBHOOK_SECRET;
      else process.env.WIPAY_WEBHOOK_SECRET = antes.k;
      if (antes.r === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = antes.r;
    }
  });
});
