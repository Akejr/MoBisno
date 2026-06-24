import { describe, it } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  isValidIdentifierFormat,
  MIN_IDENTIFIER_LENGTH,
  MAX_IDENTIFIER_LENGTH,
} from "../src/services/identifierService.js";

/**
 * Oráculo independente do formato de Identificador_de_Loja (Requisitos 4.7, 4.8):
 * comprimento entre 2 e 63 caracteres E composto por blocos de [a-z0-9]
 * separados por hífenes únicos (sem hífen inicial, final ou consecutivo).
 *
 * Implementado de forma independente da função sob teste para servir de
 * referência fiável na verificação do "se e só se".
 */
function oracleIsValidFormat(identifier: string): boolean {
  const lengthOk =
    identifier.length >= MIN_IDENTIFIER_LENGTH &&
    identifier.length <= MAX_IDENTIFIER_LENGTH;
  const shapeOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier);
  return lengthOk && shapeOk;
}

/**
 * Caracteres que exercitam tanto os válidos (a-z, 0-9, hífen) como os que
 * devem provocar rejeição (maiúsculas, símbolos, espaços).
 */
const charArb = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")) },
  { weight: 3, arbitrary: fc.constantFrom(..."0123456789".split("")) },
  { weight: 3, arbitrary: fc.constant("-") },
  { weight: 2, arbitrary: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")) },
  { weight: 2, arbitrary: fc.constantFrom(..."_. !@#/áç".split("")) },
);

/**
 * Strings tipo-identificador com comprimentos que abrangem vazio, abaixo do
 * mínimo, dentro do intervalo válido e acima do máximo (até 80 caracteres),
 * para exercitar todas as fronteiras de aceitação e rejeição.
 */
const identifierArb: fc.Arbitrary<string> = fc
  .array(charArb, { minLength: 0, maxLength: 80 })
  .map((chars) => chars.join(""));

describe("IdentifierService — propriedades", () => {
  it("isValidFormat devolve verdadeiro se e só se a string respeita comprimento (2–63) e o formato [a-z0-9] com hífenes únicos não terminais", () => {
    // **Feature: mobisno-store-builder, Property 4: Validação de formato de identificador**
    // **Validates: Requirements 4.7, 4.8**
    assertProperty(
      fc.property(identifierArb, (identifier) => {
        return isValidIdentifierFormat(identifier) === oracleIsValidFormat(identifier);
      }),
    );
  });
});
