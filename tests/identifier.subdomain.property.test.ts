import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  toSubdomain,
  isValidIdentifierFormat,
  SUBDOMAIN_SUFFIX,
} from "../src/services/identifierService.js";

/**
 * Gerador de Identificadores_de_Loja válidos: blocos de `[a-z0-9]` unidos por
 * um único hífen, com comprimento total entre 2 e 63 caracteres. Por construção
 * não há hífenes no início, no fim ou consecutivos, satisfazendo
 * `isValidIdentifierFormat`.
 */
const alnumChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);

const segmentArb: fc.Arbitrary<string> = fc
  .array(alnumChar, { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(segmentArb, { minLength: 1, maxLength: 8 })
  .map((segments) => segments.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63);

describe("IdentifierService — composição de subdomínio (propriedade)", () => {
  it("compõe o subdomínio como identificador + sufixo e a extração devolve o identificador original (round trip)", () => {
    // **Feature: mobisno-store-builder, Property 5: Composição determinística do subdomínio**
    // **Validates: Requirements 4.4**
    assertProperty(
      fc.property(validIdentifierArb, (identifier) => {
        // Pré-condição: o gerador só produz identificadores de formato válido.
        expect(isValidIdentifierFormat(identifier)).toBe(true);

        const subdomain = toSubdomain(identifier);

        // Composição determinística: exatamente identificador + ".mobisno.com".
        expect(subdomain).toBe(`${identifier}${SUBDOMAIN_SUFFIX}`);

        // Round trip: remover o sufixo devolve o identificador original.
        expect(subdomain.endsWith(SUBDOMAIN_SUFFIX)).toBe(true);
        const extracted = subdomain.slice(
          0,
          subdomain.length - SUBDOMAIN_SUFFIX.length,
        );
        expect(extracted).toBe(identifier);
      }),
    );
  });
});
