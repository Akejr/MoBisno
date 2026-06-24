import { describe, it } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  normalizeIdentifier,
  isValidIdentifierFormat,
  MIN_IDENTIFIER_LENGTH,
} from "../src/services/identifierService.js";

/**
 * Geradores de nomes de Loja variados para exercitar a normalização e a
 * fronteira do comprimento mínimo (Requisitos 4.3, 4.7):
 *  - strings unicode arbitrárias (incluindo vazias e só de símbolos/acentos);
 *  - nomes "normais" com letras, dígitos e espaços;
 *  - nomes curtos (0–3 caracteres) que tendem a normalizar para < 2 caracteres,
 *    forçando o ramo de rejeição;
 *  - nomes compostos apenas por separadores/símbolos que normalizam para vazio.
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string({ minLength: 0, maxLength: 3 }),
  fc
    .array(fc.constantFrom("a", "1", " ", "-", "ã", "@", "!", "z"), {
      minLength: 0,
      maxLength: 8,
    })
    .map((parts) => parts.join("")),
  fc.constantFrom("", " ", "--", "@", "a", "ab", "  a  ", "x-y", "São Paulo", "Loja 1"),
  fc.fullUnicodeString(),
);

describe("IdentifierService — propriedades", () => {
  it("identificador normalizado com >= 2 caracteres é válido; caso contrário é rejeitado sem persistir", () => {
    // **Feature: mobisno-store-builder, Property 3: Normalização produz formato válido ou é rejeitada**
    // **Validates: Requirements 4.3, 4.7**
    assertProperty(
      fc.property(nameArb, (name) => {
        const identifier = normalizeIdentifier(name);

        if (identifier.length >= MIN_IDENTIFIER_LENGTH) {
          // Pelo menos 2 caracteres => satisfaz isValidFormat (Requisito 4.7).
          return isValidIdentifierFormat(identifier) === true;
        }

        // Menos de 2 caracteres => rejeitado (não satisfaz isValidFormat),
        // implicando pedido de nome alternativo sem persistir a Loja (Requisito 4.3).
        return isValidIdentifierFormat(identifier) === false;
      }),
    );
  });
});
