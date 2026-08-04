/**
 * Contrato de erro do Gerador_De_Logotipos (R2, decisão D3).
 *
 * A avaria que estes exemplos guardam: `generateLogos` devolvia
 * `Promise<string[]>` e fazia `return []` em **qualquer** falha, pelo que o Dono
 * ficava «a olhar para um ecrã vazio sem explicação» — uma lista vazia não
 * distingue «o servidor recusou e disse porquê» de «não houve resposta». O tipo
 * discriminado `LogoResult` separa as três situações (R2.6) e é isso que se fixa
 * aqui.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O valor de R2 está no **contrato de erro**, não em variação de entrada: a
 * descrição submetida pelo Dono é transportada tal e qual para o corpo do
 * pedido e não entra em nenhuma decisão. O que interessa enumerar são os estados
 * da resposta — propostas completas, propostas em falta, recusa do servidor,
 * ausência de resposta e corpo ilegível —, e esses são casos contáveis.
 *
 * ## Como se chega ao módulo
 *
 * `web/lib/logoApi.ts` está fora do programa do `tsc` (`tsconfig.json` inclui só
 * `src/**` e `tests/**`, com `lib: ["ES2022"]`, sem DOM) e usa `fetch`/`atob`.
 * Usa-se o mesmo contorno de `tests/storeCustom.property.test.ts`: `await
 * import()` com o especificador numa **constante**. Como o especificador é um
 * identificador e não um literal, o `tsc` não segue o import e o módulo de
 * `web/` não entra no programa; em execução, o `vitest` resolve-o normalmente.
 *
 * O `fetch` global é substituído por um stub por exemplo e **restaurado no
 * `afterEach`**, para nenhum outro ficheiro de teste apanhar um `fetch` trocado.
 */
import { describe, it, expect, afterEach } from "vitest";

/** Especificador em constante: mantém `web/lib/logoApi.ts` fora do `tsc`. */
const ESPECIFICADOR_LOGO_API = "../web/lib/logoApi.js";

/** Receita de composição de uma direção, como `api/logo.js` a devolve. */
interface Direction {
  slot: string;
  layout: string;
  fontFamily: string;
  weight: number;
  color: string;
  symbol: string | null;
}

type LogoResult =
  | { kind: "ok"; brief: unknown; directions: Direction[]; requested: number; missing: number }
  | { kind: "server-error"; status: number; error: string; detail?: string }
  | { kind: "network-error"; message: string };

/** Direção mínima utilizável (o que `isDirection` exige para a deixar passar). */
function direcao(slot: string, over: Partial<Direction> = {}): Direction {
  return { slot, layout: "wordmark", fontFamily: "Manrope", weight: 700, color: "#111827", symbol: null, ...over };
}

const { LOGO_PROPOSALS, generateLogos, improveLogoDescription } = (await import(
  ESPECIFICADOR_LOGO_API
)) as {
  LOGO_PROPOSALS: number;
  generateLogos(description: string): Promise<LogoResult>;
  improveLogoDescription(text: string): Promise<string | null>;
};

/** O mínimo da `Response` que `generateLogos` toca: `ok`, `status` e `json()`. */
type RespostaFalsa = { ok: boolean; status: number; json(): Promise<unknown> };

/** Pedidos capturados pelo stub, para verificar rota e corpo enviado. */
let pedidos: { url: string; corpo: unknown }[] = [];

/** `fetch` original do ambiente, guardado uma única vez. */
const FETCH_ORIGINAL = globalThis.fetch;

/** Troca `globalThis.fetch` por um stub que devolve sempre `resposta`. */
function stubResposta(resposta: RespostaFalsa): void {
  globalThis.fetch = (async (entrada: unknown, init?: { body?: unknown }) => {
    pedidos.push({
      url: String(entrada),
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    return resposta as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
}

/** Troca `globalThis.fetch` por um stub que rejeita com `motivo`. */
function stubRejeicao(motivo: unknown): void {
  globalThis.fetch = (async (entrada: unknown) => {
    pedidos.push({ url: String(entrada), corpo: undefined });
    throw motivo;
  }) as unknown as typeof globalThis.fetch;
}

/** Resposta com corpo JSON legível. */
function comJson(ok: boolean, status: number, corpo: unknown): RespostaFalsa {
  return { ok, status, json: async () => corpo };
}

/** Resposta cujo corpo não é JSON legível (`res.json()` rejeita). */
function semJson(ok: boolean, status: number): RespostaFalsa {
  return {
    ok,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON");
    },
  };
}

// Restauro do `fetch` original: sem isto, o stub contamina os outros ficheiros.
afterEach(() => {
  if (FETCH_ORIGINAL) globalThis.fetch = FETCH_ORIGINAL;
  else delete (globalThis as { fetch?: unknown }).fetch;
  pedidos = [];
});

const DESCRICAO = "Loja de artigos desportivos, cores laranja e preto, estilo moderno";

describe("generateLogos — contrato de erro do Gerador_De_Logotipos", () => {
  it("pede cinco propostas e devolve `ok` sem nada em falta quando as cinco chegam (R2.1, R2.2)", async () => {
    const direcoes = ["wordmark", "spaced", "initial", "companion", "crest"].map((s) => direcao(s));
    const brief = { brandName: "Ekolo", wantsSymbol: "either" };
    stubResposta(comJson(true, 200, { brief, directions: direcoes, requested: 5 }));

    const resultado = await generateLogos(DESCRICAO);

    expect(LOGO_PROPOSALS).toBe(5);
    expect(resultado).toEqual({ kind: "ok", brief, directions: direcoes, requested: 5, missing: 0 });
    // A descrição do Dono é transportada tal e qual para a função serverless.
    expect(pedidos).toEqual([{ url: "/api/logo", corpo: { description: DESCRICAO } }]);
  });

  it("devolve `ok` com `missing > 0` quando chegam menos de cinco propostas (R2.3)", async () => {
    // `api/logo.js` omite as direções cujo símbolo não conseguiu gerar. O
    // cliente não pode contar entradas truncadas nem valores de outro tipo:
    // uma receita incompleta rebentaria no Canvas em vez de faltar um cartão.
    const boas = [direcao("wordmark"), direcao("initial")];
    stubResposta(comJson(true, 200, {
      brief: {},
      directions: [boas[0], { slot: "sem-fonte" }, boas[1], null, 7],
      requested: 5,
    }));

    const resultado = await generateLogos(DESCRICAO);

    expect(resultado).toEqual({ kind: "ok", brief: {}, directions: boas, requested: 5, missing: 3 });
  });

  it("assume as cinco propostas quando o servidor não diz quantas pediu", async () => {
    // `requested` ausente ou absurdo não pode zerar a contagem de propostas em
    // falta: o cartão «faltaram N» é o que explica ao Dono a grelha incompleta.
    stubResposta(comJson(true, 200, { brief: {}, directions: [direcao("wordmark")] }));

    const resultado = await generateLogos(DESCRICAO);

    expect(resultado).toMatchObject({ kind: "ok", requested: 5, missing: 4 });
  });

  it("devolve `server-error` com o `error` e o `detail` do servidor quando `!res.ok` (R2.4, R2.6)", async () => {
    stubResposta(
      comJson(false, 502, {
        error: "  Não foi possível gerar o logótipo.  ",
        detail: "  upstream timeout  ",
      }),
    );

    const resultado = await generateLogos(DESCRICAO);

    // Texto transportado tal como vem (aparado), sem nada inventado no cliente.
    expect(resultado).toEqual({
      kind: "server-error",
      status: 502,
      error: "Não foi possível gerar o logótipo.",
      detail: "upstream timeout",
    });
  });

  it("devolve `server-error` com `error` vazio e sem `detail` quando o corpo não traz motivo (R2.4)", async () => {
    stubResposta(comJson(false, 429, { detail: "   " }));

    const resultado = await generateLogos(DESCRICAO);

    // `detail` só entra quando é uma string não vazia; o chamador mostra o seu
    // texto genérico e tem o `status` à mão.
    expect(resultado).toEqual({ kind: "server-error", status: 429, error: "" });
    expect(resultado).not.toHaveProperty("detail");
  });

  it("devolve `network-error` quando o `fetch` rejeita (R2.5, R2.6)", async () => {
    stubRejeicao(new TypeError("Failed to fetch"));

    const resultado = await generateLogos(DESCRICAO);

    // Falha de comunicação distinta de «não vieram propostas».
    expect(resultado).toEqual({ kind: "network-error", message: "Failed to fetch" });
  });

  it("devolve `server-error` com o estado real quando `!res.ok` e o corpo é ilegível (R2.4)", async () => {
    // Página de erro em HTML servida por um proxy: ainda dá para reportar o
    // estado do servidor, e é isso que o Dono precisa de ver.
    stubResposta(semJson(false, 504));

    const resultado = await generateLogos(DESCRICAO);

    expect(resultado).toEqual({ kind: "server-error", status: 504, error: "" });
  });

  it("devolve `network-error` quando `res.ok` mas o corpo é ilegível (R2.5)", async () => {
    // Resposta 200 sem JSON: não há propostas nem motivo, logo é comunicação.
    stubResposta(semJson(true, 200));

    const resultado = await generateLogos(DESCRICAO);

    expect(resultado.kind).toBe("network-error");
    if (resultado.kind === "network-error") {
      expect(resultado.message.length).toBeGreaterThan(0);
    }
  });
});

describe("improveLogoDescription — comportamento atual preservado (R2.11)", () => {
  it("devolve `null` quando o servidor recusa", async () => {
    stubResposta(comJson(false, 500, { error: "IA indisponível" }));

    await expect(improveLogoDescription("loja de desporto")).resolves.toBeNull();
    expect(pedidos).toEqual([
      { url: "/api/assistant", corpo: { scope: "logo", question: "loja de desporto" } },
    ]);
  });

  it("devolve `null` quando o `fetch` rejeita", async () => {
    stubRejeicao(new TypeError("Failed to fetch"));

    await expect(improveLogoDescription("loja de desporto")).resolves.toBeNull();
  });
});
