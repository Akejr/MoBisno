import { describe, it } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { isOk } from "../src/models/index.js";
import {
  validateProduct,
  PRODUCT_NAME_MIN,
  PRODUCT_NAME_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_PRICE_MIN,
  PRODUCT_PRICE_MAX,
  type ProductInput,
} from "../src/services/productService.js";

/**
 * Construtores de strings de comprimento conhecido por construção. Servem de
 * oráculo independente: sabemos o comprimento exato sem depender da
 * implementação que está a ser testada.
 */
function repeat(length: number): string {
  return "a".repeat(Math.max(0, length));
}

/**
 * Nomes que exercitam as fronteiras (vazio, só espaços, 1, 120, 121 caracteres),
 * incluindo padding de espaços para verificar que o nome é avaliado após `trim`.
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  // Casos de fronteira (comprimento após trim conhecido).
  fc.constantFrom(
    "", // vazio
    " ", // só espaço
    "   ",
    "\t\n ",
    repeat(PRODUCT_NAME_MIN), // 1 caráter
    repeat(2),
    repeat(60),
    repeat(PRODUCT_NAME_MAX - 1), // 119
    repeat(PRODUCT_NAME_MAX), // 120
    repeat(PRODUCT_NAME_MAX + 1), // 121
    repeat(200),
  ),
  // Strings arbitrárias de comprimento variado.
  fc.string({ maxLength: 130 }),
  // Conteúdo arbitrário envolto em espaços (exercita o trim nas fronteiras).
  fc
    .tuple(fc.string({ maxLength: 130 }), fc.constantFrom("", " ", "   ", "\t"))
    .map(([core, pad]) => `${pad}${core}${pad}`),
);

/**
 * Preços variados: em falta, NaN, infinitos, negativos, zero, válidos, no
 * máximo e acima do máximo.
 */
const priceArb: fc.Arbitrary<number | undefined> = fc.oneof(
  fc.constant<number | undefined>(undefined),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.constantFrom(
    -1,
    -0.01,
    PRODUCT_PRICE_MIN, // 0
    0.01,
    1234.56,
    PRODUCT_PRICE_MAX, // 999.999.999,99
    PRODUCT_PRICE_MAX + 0.01, // acima do máximo
    PRODUCT_PRICE_MAX + 1000,
  ),
  fc.double({ min: -1000, max: 2_000_000_000, noNaN: true }),
);

/**
 * Descrições variadas: em falta, vazia, no limite (2000) e acima (2001).
 */
const descriptionArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant<string | undefined>(undefined),
  fc.constantFrom(
    "",
    repeat(1),
    repeat(PRODUCT_DESCRIPTION_MAX - 1), // 1999
    repeat(PRODUCT_DESCRIPTION_MAX), // 2000
    repeat(PRODUCT_DESCRIPTION_MAX + 1), // 2001
    repeat(2500),
  ),
  fc.string({ maxLength: 2100 }),
);

describe("ProductService.validateProduct — propriedades", () => {
  it("aceita um input de Produto se e só se nome (1–120 após trim), preço (0–999.999.999,99) e descrição (≤2000) forem válidos; rejeições indicam um campo realmente inválido", () => {
    // **Feature: mobisno-store-builder, Property 13: Validação de Produto**
    // **Validates: Requirements 7.1, 7.2, 7.3, 7.5**
    assertProperty(
      fc.property(nameArb, priceArb, descriptionArb, (name, price, description) => {
        const input = { name, price, description } as ProductInput;

        // Oráculo independente da implementação.
        const trimmedNameLen = (typeof name === "string" ? name.trim() : "").length;
        const nameOk =
          trimmedNameLen >= PRODUCT_NAME_MIN && trimmedNameLen <= PRODUCT_NAME_MAX;
        const priceOk =
          typeof price === "number" &&
          Number.isFinite(price) &&
          price >= PRODUCT_PRICE_MIN &&
          price <= PRODUCT_PRICE_MAX;
        const descLen = typeof description === "string" ? description.length : 0;
        const descOk = descLen <= PRODUCT_DESCRIPTION_MAX;
        const expectedAccept = nameOk && priceOk && descOk;

        const result = validateProduct(input);

        // Aceite se e só se o oráculo aceitar.
        if (isOk(result) !== expectedAccept) {
          return false;
        }

        if (isOk(result)) {
          // Dados preservados/normalizados: nome com espaços removidos e preço inalterado.
          const value = result.value;
          return (
            value.name === (name as string).trim() &&
            value.price === price &&
            value.description === (typeof description === "string" ? description : "")
          );
        }

        // Em caso de rejeição, os campos indicados têm de ser realmente inválidos.
        const fieldIsValid: Record<string, boolean> = {
          name: nameOk,
          price: priceOk,
          description: descOk,
        };
        const fields = result.error.fields;
        if (fields.length === 0) {
          return false;
        }
        return fields.every((field) => fieldIsValid[field] === false);
      }),
    );
  });
});
