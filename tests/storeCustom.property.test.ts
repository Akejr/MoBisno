/**
 * Propriedade 3 da spec `melhorias-loja-e-admin` (R11).
 *
 * A avaria que esta propriedade guarda: uma Loja antiga com
 * `footer.phone` a apontar para um objeto, ou com uma garantia cujo `text` é um
 * número, fazia a Pagina_De_Produto **abrir em branco** — `.replace` num objeto
 * e `.trim` num número lançam `TypeError`, e o erro propaga-se até apagar a
 * página inteira. Daí a forma desta propriedade: para **qualquer** entrada,
 * `resolveWaPhone` e `normalizePerks` terminam sem lançar e devolvem valores do
 * tipo declarado, e o `waLink` que consome o número produz sempre uma URL
 * bem formada.
 *
 * ## Como se chega ao `waLink`
 *
 * `waLink` vive em `web/lib/whatsapp.ts`, fora do programa do `tsc`
 * (`tsconfig.json` inclui só `src/**` e `tests/**`, com `lib: ["ES2022"]`, sem
 * DOM). Usa-se o contorno mais simples dos dois em vigor no repositório:
 * `await import()` com o especificador numa **constante**. Como o especificador
 * é um identificador e não um literal, o `tsc` não segue o import e o módulo de
 * `web/` não entra no programa; em execução, o `vitest` resolve-o normalmente.
 * O outro contorno (`readFileSync` do texto-fonte, `tests/seoInfra.test.ts`)
 * não serve aqui, porque esta propriedade precisa de **executar** `waLink`, não
 * de inspecionar a sua fonte. Nenhum stub é necessário: depois da tarefa 2.2 o
 * módulo é puro — reexporta `resolveWaPhone`/`WA_DEFAULT_PHONE` de
 * `src/services/storeCustom.ts` e não toca em `document`, `window` nem
 * `localStorage`.
 */
import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { customizationArb } from "./geradores.js";
import { normalizePerks, resolveWaPhone } from "../src/services/storeCustom.js";

/** Especificador em constante: mantém `web/lib/whatsapp.ts` fora do `tsc`. */
const ESPECIFICADOR_WHATSAPP = "../web/lib/whatsapp.js";

const { waLink } = (await import(ESPECIFICADOR_WHATSAPP)) as {
  waLink(phone: string, message: string): string;
};

/**
 * Valores crus, fora do domínio de um objeto.
 *
 * `customizationArb` gera **sempre** um objeto, por decisão de
 * `tests/geradores.ts`. Estes são deliberadamente responsabilidade deste teste:
 * a Personalização chega de JSON da base de dados e pode ser `null` (coluna
 * vazia), `undefined` (Loja carregada sem o campo), um número, uma cadeia (JSON
 * duplamente serializado) ou uma lista.
 */
const valorCruArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown[]>(null, undefined, 0, 42, -7, Number.NaN, "", "   ", "{}"),
  fc.integer({ min: -1_000, max: 1_000 }),
  fc.string({ maxLength: 20 }),
  fc.array(fc.oneof(fc.string({ maxLength: 6 }), fc.integer()), { maxLength: 3 }),
);

/** Entrada da propriedade: Personalização arbitrária **ou** valor cru. */
const entradaArb: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: customizationArb as fc.Arbitrary<unknown>, weight: 4 },
  { arbitrary: valorCruArb, weight: 1 },
);

/** Mensagem de exemplo passada ao `waLink`; o conteúdo é irrelevante à regra. */
const MENSAGEM = "Olá! Gostaria de encomendar: 1x Camisola oficial (30 000,00 Kz)";

// Feature: melhorias-loja-e-admin, Property 3: Para qualquer entrada, resolveWaPhone e normalizePerks nunca lançam e devolvem sempre valores do tipo declarado
describe("Propriedade 3 — leitura defensiva da Personalização legada", () => {
  it("resolveWaPhone e normalizePerks são totais e devolvem sempre o tipo declarado", () => {
    assertProperty(
      fc.property(entradaArb, (custom) => {
        // R11.2, R11.3 — nunca lança, e o número é sempre utilizável como texto.
        const phone = resolveWaPhone(custom);
        expect(typeof phone).toBe("string");
        expect(phone.length).toBeGreaterThan(0);

        // R11.4, R11.5 — pelo menos um item, e em todos `icon` e `text` são strings.
        const perks = normalizePerks(custom);
        expect(Array.isArray(perks)).toBe(true);
        expect(perks.length).toBeGreaterThanOrEqual(1);
        for (const perk of perks) {
          expect(typeof perk.icon).toBe("string");
          expect(typeof perk.text).toBe("string");
        }

        // O consumidor a jusante: `waLink` chama `.replace` no número sem se
        // defender, por isso a URL só é sempre válida se o número for sempre
        // uma string.
        const link = waLink(phone, MENSAGEM);
        expect(link.startsWith("https://wa.me/")).toBe(true);
        const url = new URL(link);
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toBe("wa.me");
        // `waLink` retira tudo o que não seja dígito do número.
        expect(url.pathname).toMatch(/^\/\d*$/);
        expect(url.searchParams.get("text")).toBe(MENSAGEM);
      }),
      { numRuns: 300 },
    );
  });
});
