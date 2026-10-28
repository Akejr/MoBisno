/**
 * `/api/payment` com fornecedor ligado: os endereços que a cobrança leva.
 *
 * ## Porque é que este ficheiro existe
 *
 * O pagamento respondia **500 em todas as tentativas**, desde sempre. A causa
 * era uma variável livre: `callbackUrls({ host, … })` e `platformOrigin(host)`
 * liam um `host` que nunca foi declarado em `api/payment.js`. Num módulo ESM
 * isso é um `ReferenceError`, que caía no `catch` do fim e saía como «Erro
 * interno ao iniciar o pagamento» — uma mensagem que não distingue um erro de
 * programação de uma falha do banco.
 *
 * `tests/providerCore.test.ts` cobre o caminho **sem** fornecedor, que responde
 * 503 antes de chegar aqui; por isso esta linha nunca foi executada por nenhum
 * teste. Este ficheiro corre o handler com um fornecedor falso e verifica os
 * três endereços que ele recebe — é o que falhava, e é o que importa:
 *
 *  - `callbackUrl`, por onde o fornecedor avisa (de servidor para servidor, com
 *    o segredo);
 *  - `successUrl`, para onde o Dono volta, **com a loja no endereço** — sem ela
 *    o painel abria na primeira loja da conta e não na que ele pagou;
 *  - `failureUrl`, o mesmo com a marca de desistência.
 *
 * O especificador fica numa constante: com ele literal, o `tsc` segue-o e
 * compila `api/` dentro do programa de `tests/`.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const LOJA = "7c1e4b2a-33d5-4f6e-9a8b-1c2d3e4f5a60";
const PAGAMENTO = "9a6d597f-86b2-45aa-8cb7-91aa94cd20ae";
const DONO = "3f1c2a4e-9b7d-4c1e-8a2f-6d5e4c3b2a10";

const env = vi.hoisted(() => {
  const nomes = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WIPAY_WEBHOOK_SECRET"] as const;
  const antes = Object.fromEntries(nomes.map((n) => [n, process.env[n]])) as Record<string, string | undefined>;
  process.env.SUPABASE_URL = "https://projeto-de-teste.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  process.env.WIPAY_WEBHOOK_SECRET = "segredo-de-teste";
  return { nomes, antes };
});

/** O que o fornecedor recebeu no último pedido de cobrança. */
const recebido = vi.hoisted(() => ({ ultimo: null as Record<string, unknown> | null }));

vi.mock("../api/_provider.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPaymentProvider: () => ({
    name: "falso",
    createPayment: async (pedido: Record<string, unknown>) => {
      recebido.ultimo = pedido;
      return { ok: true, hostedUrl: "https://pagar.exemplo/abc", referenceInfo: null, invoiceUrl: null };
    },
  }),
}));

/**
 * Base de dados falsa: só o que o ramo da subscrição lê — a loja, para
 * confirmar que é de quem paga.
 */
vi.mock("../api/_shared.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: LOJA, name: "Kitanda", owner_id: DONO } }) }),
      }),
    }),
  }),
}));

/** Gravação do pagamento: por omissão corre bem; um teste troca-a por uma falha. */
const gravacao = vi.hoisted(() => ({
  resultado: { ok: true, id: "", amount: 10_000 } as { ok: boolean; id?: string; amount?: number; cause?: string },
}));

vi.mock("../api/_payments.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ownerFromRequest: async () => DONO,
  createPlanPayment: async () => gravacao.resultado,
  saveProviderResult: async () => undefined,
  markNotPaid: async () => undefined,
}));

const ESP_PAYMENT = "../api/payment.js";
const payment = ((await import(ESP_PAYMENT)) as { default: (req: unknown, res: unknown) => Promise<unknown> }).default;

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

/** Pedido de subscrição, com o domínio que a Vercel põe no cabeçalho. */
function pedidoPlano(host = "mobisno.store") {
  return {
    method: "POST",
    headers: { host, authorization: "Bearer token-de-teste" },
    query: {},
    body: { kind: "plan", method: "mcx", phone: "923456789", storeId: LOJA },
    on() { throw new Error("o corpo já vem lido"); },
  };
}

beforeEach(() => {
  recebido.ultimo = null;
  gravacao.resultado = { ok: true, id: PAGAMENTO, amount: 10_000 };
});

afterAll(() => {
  for (const n of env.nomes) {
    if (env.antes[n] === undefined) delete process.env[n];
    else process.env[n] = env.antes[n];
  }
});

describe("Pagar a subscrição — a cobrança é criada e devolve a página de pagamento", () => {
  it("responde 200 com o endereço onde o Dono paga", async () => {
    // A asserção que faltava: antes disto, **qualquer** tentativa dava 500.
    const res = resposta();
    await payment(pedidoPlano(), res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ success: true, kind: "plan", id: PAGAMENTO, status: "open", amount: 10_000 });
    expect(res.body?.hostedUrl).toBe("https://pagar.exemplo/abc");
  });

  it("nenhum dos três endereços tem «undefined»", async () => {
    // `host` era uma variável livre: é assim que um endereço sai com
    // «undefined» no meio, ou que o pedido rebenta antes de chegar aqui.
    await payment(pedidoPlano(), resposta());
    const urls = [recebido.ultimo?.callbackUrl, recebido.ultimo?.successUrl, recebido.ultimo?.failureUrl];
    expect(urls.length).toBe(3);
    for (const u of urls) {
      expect(typeof u, "endereço em falta").toBe("string");
      expect(String(u), `endereço com undefined: ${u}`).not.toContain("undefined");
      expect(String(u)).toMatch(/^https:\/\//);
    }
  });

  it("o aviso do fornecedor vai para a plataforma, com o segredo", async () => {
    const res = resposta();
    await payment(pedidoPlano(), res);
    expect(String(recebido.ultimo?.callbackUrl)).toBe("https://mobisno.store/api/payment-webhook?k=segredo-de-teste");
  });

  it("o regresso leva o pagamento e a loja: o painel abre na loja que foi paga", async () => {
    const res = resposta();
    await payment(pedidoPlano(), res);
    const sucesso = String(recebido.ultimo?.successUrl);
    expect(sucesso).toBe(`https://mobisno.store/painel/plano?pagamento=${PAGAMENTO}&tipo=plan&loja=${LOJA}`);
    // A desistência volta ao mesmo sítio, marcada.
    expect(String(recebido.ultimo?.failureUrl)).toBe(`${sucesso}&falhou=1`);
  });

  it("a origem do regresso é a do pedido, dentro da família do apex", async () => {
    // `www.` e o apex não se trocam um pelo outro: o apex redireciona (308), e
    // um regresso que redireciona perde os parâmetros em alguns navegadores.
    for (const [host, esperado] of [
      ["www.mobisno.store", "https://www.mobisno.store"],
      ["mobisno.store", "https://mobisno.store"],
      // De uma loja, o regresso da subscrição é para a plataforma.
      ["kitanda.sualoja.digital", "https://mobisno.store"],
    ] as const) {
      const res = resposta();
      await payment(pedidoPlano(host), res);
      expect(res.statusCode, host).toBe(200);
      expect(String(recebido.ultimo?.successUrl).startsWith(`${esperado}/painel/plano`), host).toBe(true);
    }
  });

  it("sem loja no corpo não há cobrança: cada loja tem a sua subscrição", async () => {
    const res = resposta();
    await payment({ ...pedidoPlano(), body: { kind: "plan", method: "mcx", phone: "923456789" } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "MISSING_STORE" });
    expect(recebido.ultimo, "não pode criar cobrança sem saber a loja").toBeNull();
  });

  it("sem telemóvel válido não há cobrança", async () => {
    const res = resposta();
    await payment({ ...pedidoPlano(), body: { kind: "plan", method: "mcx", phone: "123", storeId: LOJA } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "MISSING_PHONE" });
  });

  it("uma gravação falhada diz a CAUSA, e não cobra nada", async () => {
    /*
     * O segundo 500 dos pagamentos: `createPlanPayment` escrevia a coluna
     * `period`, que não existe na base de dados de produção. O insert falhava, a
     * função devolvia `null`, e a resposta era «não foi possível registar o
     * pagamento» — indistinguível de uma migração que falta. Foram precisas
     * duas rondas de perguntas para encontrar o nome de uma coluna que o
     * Postgres já tinha dito.
     */
    gravacao.resultado = { ok: false, cause: 'column plan_payments.period does not exist (42703)' };
    const res = resposta();
    await payment(pedidoPlano(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, code: "PERSIST_FAILED" });
    expect(String(res.body?.error)).toContain("plan_payments.period");
    expect(String(res.body?.error)).toContain("42703");
    // E não se pede cobrança nenhuma de um pagamento que não ficou gravado.
    expect(recebido.ultimo, "cobrou sem ter gravado o pagamento").toBeNull();
  });

  it("o `period` saiu do insert: com um só plano não distingue nada", async () => {
    // A coluna vinha de quando havia ciclo mensal e anual. Escrever um campo
    // que ninguém lê não vale o risco de ele não existir.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(join(__dirname, "..", "api/_payments.js"), "utf8");
    const fn = fonte.slice(fonte.indexOf("export async function createPlanPayment("));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).not.toContain("period");
    // E a falha devolve a causa, em vez de `null`.
    expect(corpo).toContain("dbCause(error)");
    expect(corpo).toContain("ok: false");
  });
});
