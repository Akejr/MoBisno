/**
 * Contrato de erro do Gerador_De_Logotipos: `generateLogos` devolve um
 * `LogoResult` discriminado (R2.1, R2.3, R2.4, R2.5, R2.6, decisão D3).
 *
 * A avaria que este ficheiro guarda: antes de 9.1, qualquer falha colapsava no
 * mesmo `return []` e o Dono ficava «a olhar para um ecrã vazio sem
 * explicação». Uma lista vazia não distingue «o servidor recusou e disse
 * porquê» (`server-error`, com `error`/`detail`) de «não houve resposta»
 * (`network-error`). O que se fixa aqui é a fronteira entre as três variantes —
 * é aí que está o valor de R2, não em variação de entrada, e por isso este
 * ficheiro é de exemplos e não de propriedade.
 *
 * ## Contorno escolhido: `await import()` com o especificador em constante
 *
 * `web/lib/logoApi.ts` depende de `fetch` e de `atob` (em
 * `dataUrlToUint8Array`), e `tests/` compila com `lib: ["ES2022"]`, sem DOM,
 * pelo que um import estático não compila. Usa-se o contorno já em vigor no
 * repositório (`tests/storeCustom.property.test.ts`, `tests/registry.test.ts`):
 * o especificador vive numa **constante**, logo o `tsc` não segue o import e o
 * módulo de `web/` não entra no programa; em execução, o `vitest` resolve-o
 * normalmente. Nada corre no carregamento do módulo — só declarações.
 *
 * ## `fetch` em stub, reposto no fim
 *
 * Cada exemplo troca `globalThis.fetch` por uma resposta preparada e o
 * `afterEach` repõe o `fetch` original, para não contaminar os outros ficheiros
 * de teste (o `vitest` corre-os no mesmo processo por ficheiro, mas o hábito de
 * repor é o que impede um stub esquecido de mentir a quem vier depois).
 */
import { describe, it, expect, afterEach } from "vitest";

/** Especificador em constante: mantém `web/lib/logoApi.ts` fora do `tsc`. */
const ESPECIFICADOR_LOGO_API = "../web/lib/logoApi.js";

type LogoResult =
  | { kind: "ok"; images: string[]; requested: number; missing: number }
  | { kind: "server-error"; status: number; error: string; detail?: string }
  | { kind: "network-error"; message: string };

const { LOGO_PROPOSALS, generateLogos } = (await import(ESPECIFICADOR_LOGO_API)) as {
  LOGO_PROPOSALS: number;
  generateLogos(description: string): Promise<LogoResult>;
};

/** O `fetch` real, guardado antes de qualquer stub. */
const FETCH_ORIGINAL = globalThis.fetch;

/** Pedidos que o stub em vigor recebeu, para inspeção do exemplo. */
let pedidos: { url: string; init?: { method?: string; body?: string } }[] = [];

/** Instala um stub de `fetch` que devolve `resposta`. */
function comResposta(resposta: { ok: boolean; status: number; json: () => Promise<unknown> }): void {
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    pedidos.push({
      url: String(url),
      init: init as { method?: string; body?: string } | undefined,
    });
    return resposta;
  }) as unknown as typeof globalThis.fetch;
}

/** Resposta `res.ok` com este corpo JSON. */
function corpoOk(body: unknown): void {
  comResposta({ ok: true, status: 200, json: async () => body });
}

/** Resposta `!res.ok` com este código e corpo JSON (o que `api/logo.js` manda). */
function corpoRecusado(status: number, body: unknown): void {
  comResposta({ ok: false, status, json: async () => body });
}

/** Resposta sem JSON legível (o `res.json()` rejeita), como em dev local. */
function corpoIlegivel(ok: boolean, status: number): void {
  comResposta({
    ok,
    status,
    json: async () => {
      throw new Error("Unexpected token < in JSON at position 0");
    },
  });
}

/** Instala um stub de `fetch` que rejeita com `err`. */
function comFalhaDeRede(err: unknown): void {
  globalThis.fetch = (async () => {
    throw err;
  }) as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  globalThis.fetch = FETCH_ORIGINAL;
  pedidos = [];
});

describe("generateLogos — propostas obtidas (R2.1, R2.6)", () => {
  it("devolve as cinco propostas como data URLs PNG, sem nada em falta", async () => {
    corpoOk({ images: ["aaa", "bbb", "ccc", "ddd", "eee"] });

    const r = await generateLogos("padaria de bairro, pão quente ao amanhecer");

    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(LOGO_PROPOSALS).toBe(5);
    expect(r.requested).toBe(5);
    expect(r.images).toHaveLength(5);
    expect(r.missing).toBe(0);
    // Prontas a pôr num `<img>`: o cliente é que junta o prefixo ao base64.
    expect(r.images[0]).toBe("data:image/png;base64,aaa");
    for (const img of r.images) expect(img.startsWith("data:image/png;base64,")).toBe(true);
    // E o pedido foi o que `api/logo.js` espera, com a descrição do Dono.
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.url).toBe("/api/logo");
    expect(pedidos[0]!.init?.method).toBe("POST");
    expect(pedidos[0]!.init?.body).toContain("padaria de bairro");
  });

  it("descarta entradas inúteis do array `images` do servidor", async () => {
    // Um `null`, um vazio ou um número não dão imagem nenhuma: entrariam como
    // `data:image/png;base64,null` e o Dono via um quadrado partido.
    corpoOk({ images: ["aaa", "", null, 7, "bbb", undefined] });

    const r = await generateLogos("gelataria artesanal");

    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.images).toEqual(["data:image/png;base64,aaa", "data:image/png;base64,bbb"]);
    expect(r.missing).toBe(3);
  });
});

describe("generateLogos — menos de cinco propostas (R2.3)", () => {
  it("devolve as recebidas e diz quantas ficaram em falta", async () => {
    corpoOk({ images: ["aaa", "bbb"] });

    const r = await generateLogos("oficina de bicicletas");

    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.images).toHaveLength(2);
    expect(r.requested).toBe(LOGO_PROPOSALS);
    expect(r.missing).toBe(3);
  });

  it("com zero propostas continua `ok` — resposta houve, propostas é que não", async () => {
    // A distinção que D3 pede: isto não é `network-error`. O servidor respondeu.
    corpoOk({ images: [] });

    const r = await generateLogos("consultório dentário");

    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.images).toEqual([]);
    expect(r.missing).toBe(5);
  });
});

describe("generateLogos — falha reportada pelo servidor (R2.4, R2.6)", () => {
  it("transporta `status`, `error` e `detail` tal como `api/logo.js` os manda", async () => {
    corpoRecusado(502, {
      error: "Não foi possível gerar os logótipos. Tenta de novo.",
      detail: "rate limit | sem imagem",
    });

    const r = await generateLogos("loja de plantas");

    expect(r).toEqual({
      kind: "server-error",
      status: 502,
      error: "Não foi possível gerar os logótipos. Tenta de novo.",
      detail: "rate limit | sem imagem",
    });
  });

  it("omite `detail` quando o servidor não o manda (400/405/500 de `api/logo.js`)", async () => {
    corpoRecusado(400, { error: "Descrição em falta." });

    const r = await generateLogos("");

    expect(r.kind).toBe("server-error");
    if (r.kind !== "server-error") return;
    expect(r.status).toBe(400);
    expect(r.error).toBe("Descrição em falta.");
    expect("detail" in r).toBe(false);
  });

  it("sem corpo legível dá `server-error` com o `status` real e `error` vazio", async () => {
    // O caso de dev local: `vercel dev` desligado devolve HTML de 404. Ainda há
    // `status` para reportar, logo é recusa do servidor e não falha de rede — o
    // chamador põe o seu texto genérico com o `status` à mão.
    corpoIlegivel(false, 404);

    const r = await generateLogos("barbearia");

    expect(r).toEqual({ kind: "server-error", status: 404, error: "" });
  });
});

describe("generateLogos — falha de comunicação (R2.5, R2.6)", () => {
  it("`fetch` rejeitado dá `network-error` com o motivo técnico", async () => {
    comFalhaDeRede(new Error("Failed to fetch"));

    const r = await generateLogos("food truck de hambúrgueres");

    expect(r).toEqual({ kind: "network-error", message: "Failed to fetch" });
  });

  it("`fetch` rejeitado sem motivo legível cai no texto por omissão", async () => {
    comFalhaDeRede(new Error("   "));

    const r = await generateLogos("estúdio de tatuagens");

    expect(r).toEqual({
      kind: "network-error",
      message: "Falha de comunicação com o servidor.",
    });
  });

  it("resposta `ok` sem corpo legível dá `network-error`, não `ok` com zero propostas", async () => {
    // O outro caso de dev local, e o que separa as duas variantes: com `res.ok`
    // não há propostas nem motivo, logo a falha é de comunicação.
    corpoIlegivel(true, 200);

    const r = await generateLogos("livraria de usados");

    expect(r.kind).toBe("network-error");
    if (r.kind !== "network-error") return;
    expect(r.message).toContain("JSON");
  });
});

describe("stub de `fetch` reposto (higiene entre ficheiros)", () => {
  it("o `fetch` global é o original depois dos exemplos anteriores", () => {
    expect(globalThis.fetch).toBe(FETCH_ORIGINAL);
  });
});
