import { describe, it } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { isOk, isErr } from "../src/models/index.js";
import {
  validateStoreName,
  MIN_STORE_NAME_LENGTH,
  MAX_STORE_NAME_LENGTH,
} from "../src/services/storeService.js";

/**
 * Gerador de nomes de Loja que exercita todo o espaço de input relevante para
 * a validação de comprimento (Property 1; Requisitos 2.2, 2.5, 2.6, 2.7):
 *  - strings arbitrárias (incluindo com espaços no meio, acentos e símbolos);
 *  - strings vazias e compostas apenas por espaços em branco;
 *  - nomes envolvidos por espaços (whitespace no início e no fim) para
 *    exercitar o trim;
 *  - nomes nos comprimentos de fronteira (1, 2, 60, 61) após trim.
 */

/** Espaço em branco variado (espaço, tab, nova linha) para padding. */
const whitespaceArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 0, maxLength: 6 })
  .map((parts) => parts.join(""));

/** Núcleo não-vazio sem espaços nas extremidades, de comprimento variável. */
const coreArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length === s.length && s.length > 0);

/** Nomes de fronteira: comprimento exato 1, 2, 60 e 61 (caracteres "a"). */
const boundaryArb: fc.Arbitrary<string> = fc
  .constantFrom(
    MIN_STORE_NAME_LENGTH - 1, // 1 — abaixo do mínimo
    MIN_STORE_NAME_LENGTH, // 2 — mínimo aceite
    MAX_STORE_NAME_LENGTH, // 60 — máximo aceite
    MAX_STORE_NAME_LENGTH + 1, // 61 — acima do máximo
  )
  .map((n) => "a".repeat(n));

/** Nomes vazios ou compostos apenas por espaços em branco. */
const blankArb: fc.Arbitrary<string> = whitespaceArb;

/** Núcleo padrão envolvido por espaços para forçar a aplicação do trim. */
const paddedArb: fc.Arbitrary<string> = fc
  .tuple(whitespaceArb, coreArb, whitespaceArb)
  .map(([pre, core, post]) => `${pre}${core}${post}`);

/** Combinação de todas as famílias de geradores. */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.string({ minLength: 0, maxLength: 80 }) },
  { weight: 3, arbitrary: paddedArb },
  { weight: 3, arbitrary: boundaryArb },
  { weight: 2, arbitrary: blankArb },
);

describe("StoreService — validação do nome da Loja (propriedades)", () => {
  it("aceita o nome se e só se o comprimento após trim estiver entre 2 e 60 inclusive; caso contrário rejeita", () => {
    // **Feature: mobisno-store-builder, Property 1: Validação de comprimento do nome da Loja**
    // **Validates: Requirements 2.2, 2.5, 2.6, 2.7**
    assertProperty(
      fc.property(nameArb, (name) => {
        const trimmed = name.trim();
        const shouldAccept =
          trimmed.length >= MIN_STORE_NAME_LENGTH &&
          trimmed.length <= MAX_STORE_NAME_LENGTH;

        const result = validateStoreName(name);

        if (shouldAccept) {
          // Aceite (Req. 2.5) e o valor aceite é exatamente o nome com trim.
          return isOk(result) && result.value === trimmed;
        }
        // Rejeitado: vazio/só espaços (Req. 2.2), < 2 (Req. 2.7) ou > 60 (Req. 2.6).
        return isErr(result);
      }),
    );
  });
});
