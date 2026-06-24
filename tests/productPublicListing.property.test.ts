import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import {
  createProductService,
  type ProductInput,
} from "../src/services/productService.js";
import { createInMemoryProductRepository } from "../src/services/productRepository.js";
import { isOk } from "../src/models/index.js";

/**
 * Gerador de input de Produto válido com disponibilidade aleatória.
 *  - nome: 1–120 caracteres com conteúdo não vazio após trim (Requisito 7.1);
 *  - preço: número finito entre 0,00 e 999.999.999,99 (Requisito 7.1);
 *  - available: booleano aleatório (alvo da filtragem, Requisito 7.8).
 */
const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 120 })
  .map((s) => s.replace(/\s+/g, "x"))
  .filter((s) => {
    const t = s.trim();
    return t.length >= 1 && t.length <= 120;
  });

const validPriceArb: fc.Arbitrary<number> = fc
  .double({ min: 0, max: 999_999_999.99, noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100);

const productInputArb: fc.Arbitrary<ProductInput> = fc.record({
  name: validNameArb,
  price: validPriceArb,
  available: fc.boolean(),
});

describe("ProductService — filtragem de produtos disponíveis na loja publicada (propriedade)", () => {
  it("lista publicamente exatamente os produtos disponíveis da Loja e nenhum outro", async () => {
    // **Feature: mobisno-store-builder, Property 15: Filtragem de produtos disponíveis na loja publicada**
    // **Validates: Requirements 7.8**
    await assertPropertyAsync(
      fc.asyncProperty(
        fc.array(productInputArb, { minLength: 0, maxLength: 12 }),
        fc.array(productInputArb, { minLength: 0, maxLength: 12 }),
        async (storeAInputs, storeBInputs) => {
          const storeA = "store-a";
          const storeB = "store-b";

          const productRepository = createInMemoryProductRepository();
          const service = createProductService({ productRepository });

          // Cria os produtos de cada Loja via serviço, recolhendo os ids
          // dos produtos de storeA que estão marcados como disponíveis.
          const expectedAvailableIds = new Set<string>();
          for (const input of storeAInputs) {
            const result = await service.create("owner-a", storeA, input);
            expect(isOk(result)).toBe(true);
            if (!isOk(result)) {
              return;
            }
            if (result.value.available === true) {
              expectedAvailableIds.add(result.value.id);
            }
          }

          const storeBIds = new Set<string>();
          for (const input of storeBInputs) {
            const result = await service.create("owner-b", storeB, input);
            expect(isOk(result)).toBe(true);
            if (!isOk(result)) {
              return;
            }
            storeBIds.add(result.value.id);
          }

          const publicListing = await service.listAvailableForPublic(storeA);
          const listedIds = new Set(publicListing.map((p) => p.id));

          // 1. Contém exatamente os produtos disponíveis de storeA.
          expect(listedIds).toEqual(expectedAvailableIds);

          // 2. Todo produto listado pertence a storeA e está disponível.
          for (const product of publicListing) {
            expect(product.storeId).toBe(storeA);
            expect(product.available).toBe(true);
          }

          // 3. Nenhum produto de storeB aparece na listagem pública de storeA.
          for (const id of storeBIds) {
            expect(listedIds.has(id)).toBe(false);
          }
        },
      ),
    );
  });
});
