/**
 * Comissão da Plataforma: um só número, dois lados.
 *
 * A MôBisno fica com uma fração de cada venda recebida por meios digitais; o
 * Dono levanta o resto. Esse número aparece no que a encomenda grava
 * (`orders.fee` e `orders.net`), no saldo disponível para levantar, no texto do
 * painel, no da página inicial e no do assistente.
 *
 * `api/` é JavaScript sem passo de compilação e **não pode importar de `src/`**
 * (mundos de módulos distintos; `api/_seo.js` é o precedente), por isso a regra
 * está escrita duas vezes: `src/services/fees.ts` e o espelho em
 * `api/_shared.js`. Divergirem é o defeito que estes exemplos existem para
 * apanhar — o painel a mostrar uma percentagem e o servidor a descontar outra.
 *
 * ## Como se chega ao módulo
 *
 * `api/_shared.js` importa o cliente do Supabase e está fora do `include` do
 * `tsconfig.json`: entra por `await import()` com o especificador **numa
 * constante**, o mesmo contorno de `tests/serverOrder.test.ts` e
 * `tests/serverStock.test.ts`. A forma do módulo é declarada à mão pelo mesmo
 * motivo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLATFORM_FEE_RATE, PLATFORM_FEE_LABEL, platformFee, netForOwner, feeForMethod,
} from "../src/services/fees.js";

/** Especificador em constante: mantém `api/_shared.js` fora do programa do `tsc`. */
const ESPECIFICADOR_SHARED = "../api/_shared.js";

/** Superfície de `api/_shared.js` exercitada aqui. */
interface ApiShared {
  PLATFORM_FEE_RATE: number;
  platformFeeOf(total: unknown): number;
  feeForMethodOf(method: unknown, total: unknown): number;
}

const shared = (await import(ESPECIFICADOR_SHARED)) as unknown as ApiShared;

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/* ============================== A taxa em si ============================== */

describe("a taxa é uma fração sã", () => {
  it("está entre 0 e 1, exclusive", () => {
    // Um 5 em vez de 0.05 descontava cinco vezes o valor da venda.
    expect(PLATFORM_FEE_RATE).toBeGreaterThan(0);
    expect(PLATFORM_FEE_RATE).toBeLessThan(1);
  });

  it("o rótulo é a taxa por extenso, derivada dela", () => {
    expect(PLATFORM_FEE_LABEL).toBe(`${Number((PLATFORM_FEE_RATE * 100).toFixed(2))}%`);
    expect(PLATFORM_FEE_LABEL.endsWith("%")).toBe(true);
  });
});

/* ============================== Paridade ================================== */

describe("paridade entre src/services/fees.ts e o espelho de api/_shared.js", () => {
  it("a taxa é a mesma dos dois lados", () => {
    expect(typeof shared.PLATFORM_FEE_RATE).toBe("number");
    expect(shared.PLATFORM_FEE_RATE).toBe(PLATFORM_FEE_RATE);
  });

  const TOTAIS = [0, 1, 99.99, 100, 2500, 7350.5, 10_000, 123_456.78, 1_000_000];

  for (const total of TOTAIS) {
    it(`platformFee(${total}) dá o mesmo que platformFeeOf(${total})`, () => {
      expect(shared.platformFeeOf(total)).toBe(platformFee(total));
    });
  }

  it("os dois tratam entradas inválidas da mesma forma: comissão zero", () => {
    // O servidor recebe o que vier da base de dados; um `null` numa coluna não
    // pode virar `NaN` dentro de `orders.fee`.
    for (const lixo of [null, undefined, "", "abc", NaN, Infinity, -1, -2500, {}, []]) {
      expect(platformFee(lixo), `domínio: ${String(lixo)}`).toBe(0);
      expect(shared.platformFeeOf(lixo), `espelho: ${String(lixo)}`).toBe(0);
    }
  });

  it("o WhatsApp não tem comissão, nos dois lados", () => {
    // Esse dinheiro nunca passa pela Plataforma: descontar 5% dele seria
    // descontar de dinheiro que a MôBisno não recebeu.
    for (const total of TOTAIS) {
      expect(feeForMethod("whatsapp", total), "domínio").toBe(0);
      expect(shared.feeForMethodOf("whatsapp", total), "espelho").toBe(0);
    }
  });

  it("os meios digitais têm comissão, nos dois lados", () => {
    for (const metodo of ["express", "reference", "multicaixa_express", "unknown", null]) {
      expect(feeForMethod(metodo, 10_000), `domínio: ${String(metodo)}`).toBe(platformFee(10_000));
      expect(shared.feeForMethodOf(metodo, 10_000), `espelho: ${String(metodo)}`).toBe(platformFee(10_000));
    }
  });
});

/* ========================== Propriedades do cálculo ======================= */

describe("propriedades que a base de dados também exige", () => {
  // `orders_net_within_amount` (migração 0024) recusa uma linha com
  // `net < 0` ou `net > amount`. Estas asserções são a mesma regra, um passo
  // antes: se o cálculo as violar, a escrita falha e a venda fica sem registo.
  const TOTAIS = [0.01, 1, 100, 2500, 9999.99, 50_000, 999_999.99];

  it("a comissão nunca é negativa nem maior do que o total", () => {
    for (const total of TOTAIS) {
      const fee = platformFee(total);
      expect(fee, `total ${total}`).toBeGreaterThanOrEqual(0);
      expect(fee, `total ${total}`).toBeLessThanOrEqual(total);
    }
  });

  it("o líquido do Dono está entre zero e o total", () => {
    for (const total of TOTAIS) {
      const net = netForOwner(total);
      expect(net, `total ${total}`).toBeGreaterThanOrEqual(0);
      expect(net, `total ${total}`).toBeLessThanOrEqual(total);
    }
  });

  it("comissão + líquido voltam a dar o total, ao cêntimo", () => {
    for (const total of TOTAIS) {
      expect(platformFee(total) + netForOwner(total), `total ${total}`).toBeCloseTo(total, 2);
    }
  });

  it("arredonda ao cêntimo, sem ruído de vírgula flutuante", () => {
    // 0.1 + 0.2 do mundo dos Kwanzas: 7350.5 × 0.05 = 367.525 em binário.
    expect(platformFee(7350.5)).toBe(367.53);
    expect(String(platformFee(2500))).toBe("125");
    expect(String(netForOwner(2500))).toBe("2375");
  });
});

/* ======================= Nenhuma percentagem à mão ======================== */

describe("a percentagem não está escrita à mão em sítio nenhum", () => {
  /**
   * O defeito que originou o módulo: a taxa escrita em cada ecrã. Mudar de
   * valor deixava textos antigos a prometer uma comissão que já não era a
   * cobrada — e ninguém via, porque nada falhava.
   */
  const FICHEIROS = [
    "web/views/dashboard/markup.ts",
    "web/views/dashboard/pagamentos.ts",
    "web/views/dashboard/vendas.ts",
    "web/views/landingHtml.ts",
    "web/lib/assistantContext.ts",
    "src/services/seo.ts",
    "api/_seo.js",
    "api/_payments.js",
    "api/_fulfil.js",
  ];

  for (const f of FICHEIROS) {
    it(`${f} não tem a percentagem escrita no código`, () => {
      // Sem comentários: a história («a taxa de 2 % da MoMenu saiu») pode
      // mencionar números, o código que corre não.
      const codigo = ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(codigo, `${f} escreve ${PLATFORM_FEE_LABEL} à mão`).not.toContain(PLATFORM_FEE_LABEL);
      expect(codigo, `${f} escreve a taxa à mão`).not.toContain("0.05");
    });
  }

  it("o texto da comissão que o Dono lê sai do rótulo, não de uma cópia", () => {
    expect(ler("web/views/dashboard/markup.ts")).toContain("${PLATFORM_FEE_LABEL}");
    expect(ler("src/services/seo.ts")).toContain("${PLATFORM_FEE_LABEL}");
  });
});

/* ========================= Quem decide a comissão ======================== */

describe("a comissão é decidida pelo servidor, a partir do meio de pagamento", () => {
  it("api/_payments.js calcula o fee por feeForMethodOf e não pelo que o fornecedor diga", () => {
    const src = ler("api/_payments.js");
    expect(src).toContain("feeForMethodOf");
    // Se o `fee` viesse no corpo de um callback, bastava um pedido forjado para
    // o Dono receber mais do que vendeu.
    expect(src).not.toMatch(/fee\s*[:=]\s*(body|payload|data|event)\./);
  });

  it("o domínio não exporta uma taxa a partir de payments.ts", () => {
    // A comissão tem um módulo só dela; espalhá-la outra vez por `payments.ts`
    // era o começo da divergência.
    const src = ler("src/services/payments.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toContain("export const FEE_RATE");
    expect(src).not.toContain("export function computeFee");
  });
});
