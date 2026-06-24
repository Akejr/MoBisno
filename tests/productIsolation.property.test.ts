import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import {
  createProductService,
  type ProductInput,
} from "../src/services/productService.js";
import { createInMemoryProductRepository } from "../src/services/productRepository.js";
import { isOk, isErr } from "../src/models/index.js";

/**
 * Gerador de input de Produto válido (nome 1–120 após trim, preço dentro dos
 * limites, descrição até 2000). Suficiente para que a criação em storeA suceda.
 */
const validProductInputArb: fc.Arbitrary<ProductInput> = fc.record({
  name: fc
    .string({ minLength: 1, maxLength: 120 })
    .map((s) => s.replace(/\s+/g, "x"))
    .filter((s) => {
      const t = s.trim();
      return t.length >= 1 && t.length <= 120;
    }),
  description: fc.string({ maxLength: 2000 }),
  price: fc
    .double({ min: 0, max: 999_999_999.99, noNaN: true })
    .filter((n) => Number.isFinite(n)),
  available: fc.boolean(),
});

describe("ProductService — isolamento de inquilino em operações de Produto (propriedade)", () => {
  it("rejeita editar/remover produtos de outra Loja ou inexistentes sem alterar dados de qualquer Loja", async () => {
    // **Feature: mobisno-store-builder, Property 14: Isolamento de inquilino em operações de Produto**
    // **Validates: Requirements 7.9**
    await assertPropertyAsync(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        validProductInputArb,
        fc.uuid(),
        validProductInputArb,
        async (
          ownerA,
          ownerB,
          storeA,
          storeB,
          productInput,
          nonexistentId,
          attemptInput,
        ) => {
          // Duas Lojas distintas (e, por simplicidade, dois Donos distintos).
          fc.pre(storeA !== storeB);

          const productRepository = createInMemoryProductRepository();
          const service = createProductService({ productRepository });

          // Cria um Produto válido em storeA.
          const created = await service.create(ownerA, storeA, productInput);
          expect(isOk(created)).toBe(true);
          if (!isOk(created)) {
            return;
          }
          const product = created.value;

          // O id gerado não pode colidir com o id "inexistente" gerado.
          fc.pre(product.id !== nonexistentId);

          // Estado inicial registado para comparação posterior.
          const snapshot = { ...product };

          // --- Tentativas cross-tenant (via storeB) ---
          const crossUpdate = await service.update(
            ownerB,
            storeB,
            product.id,
            attemptInput,
          );
          expect(isErr(crossUpdate)).toBe(true);
          if (isErr(crossUpdate)) {
            expect(crossUpdate.error.code).toBe("PRODUTO_NAO_ENCONTRADO");
          }

          const crossRemove = await service.remove(ownerB, storeB, product.id);
          expect(isErr(crossRemove)).toBe(true);
          if (isErr(crossRemove)) {
            expect(crossRemove.error.code).toBe("PRODUTO_NAO_ENCONTRADO");
          }

          // --- Tentativas sobre um Produto inexistente (em qualquer Loja) ---
          const missingUpdateA = await service.update(
            ownerA,
            storeA,
            nonexistentId,
            attemptInput,
          );
          expect(isErr(missingUpdateA)).toBe(true);
          if (isErr(missingUpdateA)) {
            expect(missingUpdateA.error.code).toBe("PRODUTO_NAO_ENCONTRADO");
          }

          const missingRemoveB = await service.remove(
            ownerB,
            storeB,
            nonexistentId,
          );
          expect(isErr(missingRemoveB)).toBe(true);
          if (isErr(missingRemoveB)) {
            expect(missingRemoveB.error.code).toBe("PRODUTO_NAO_ENCONTRADO");
          }

          // --- Nenhum dado de qualquer Loja foi alterado ---
          // storeA: o Produto continua a existir com os atributos originais.
          const listA = await productRepository.listByStore(storeA);
          expect(listA).toHaveLength(1);
          expect(listA[0]).toEqual(snapshot);

          const stillThere = await productRepository.findById(
            storeA,
            product.id,
          );
          expect(stillThere).toEqual(snapshot);

          // storeB: permanece sem quaisquer Produtos.
          const listB = await productRepository.listByStore(storeB);
          expect(listB).toHaveLength(0);
        },
      ),
    );
  });
});
