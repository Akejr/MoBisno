import { describe, it } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  normalizeIdentifier,
  MAX_IDENTIFIER_LENGTH,
} from "../src/services/identifierService.js";

/**
 * Gerador de nomes de Loja que exercita o algoritmo de normalização em toda a
 * sua amplitude: strings arbitrárias, acentos, espaços, símbolos, caracteres
 * unicode, maiúsculas/minúsculas misturadas e strings longas (para testar o
 * truncamento a 63 caracteres).
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  // Strings totalmente arbitrárias (inclui vazias, espaços, símbolos, unicode).
  fc.string(),
  // Strings unicode arbitrárias de comprimento variável.
  fc.string({ unit: "binary", maxLength: 120 }),
  // Composições a partir de um alfabeto rico: letras, dígitos, espaços,
  // hífenes, símbolos, acentos e outros caracteres unicode.
  fc
    .array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        ..." \t\n-_.,;:!?@#$%&*()[]{}/\\|+=<>\"'`~^",
        ..."áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇñÑ",
        ..."€£¥•—–…©®™°中文日本語ωΩαβ😀🎉",
      ),
      { maxLength: 100 },
    )
    .map((chars) => chars.join("")),
  // Strings longas para forçar o truncamento a 63 caracteres.
  fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 -"), {
      minLength: 64,
      maxLength: 200,
    })
    .map((chars) => chars.join("")),
);

describe("IdentifierService — normalização (propriedades)", () => {
  it("normaliza qualquer nome para minúsculas, apenas [a-z0-9-], sem hífenes nas pontas nem consecutivos, e ≤ 63 caracteres", () => {
    // **Feature: mobisno-store-builder, Property 2: Normalização de nome em Identificador_de_Loja**
    // **Validates: Requirements 4.1, 4.2**
    assertProperty(
      fc.property(nameArb, (name) => {
        const identifier = normalizeIdentifier(name);

        // Está sempre em minúsculas.
        if (identifier !== identifier.toLowerCase()) {
          return false;
        }
        // Contém apenas [a-z0-9-].
        if (!/^[a-z0-9-]*$/.test(identifier)) {
          return false;
        }
        // Sem hífenes consecutivos.
        if (identifier.includes("--")) {
          return false;
        }
        // Sem hífen no início ou no fim (quando não vazio).
        if (identifier.length > 0) {
          if (identifier.startsWith("-") || identifier.endsWith("-")) {
            return false;
          }
        }
        // Tem no máximo 63 caracteres.
        if (identifier.length > MAX_IDENTIFIER_LENGTH) {
          return false;
        }
        return true;
      }),
    );
  });
});
