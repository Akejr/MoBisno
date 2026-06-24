import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import {
  createStoreService,
  type CreateStoreInput,
} from "../src/services/storeService.js";
import { createInMemoryStoreRepository } from "../src/services/storeRepository.js";
import {
  createIdentifierService,
  DEFAULT_RESERVED_IDENTIFIERS,
} from "../src/services/identifierService.js";
import { isOk } from "../src/models/index.js";
import type { StoreOwner } from "../src/models/index.js";

/**
 * Gerador de Identificadores_de_Loja válidos e não reservados: blocos de
 * `[a-z0-9]` unidos por um único hífen, comprimento total 2–63, excluindo
 * os identificadores reservados (para que `isAvailable` devolva `true`).
 */
const alnumChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);

const segmentArb: fc.Arbitrary<string> = fc
  .array(alnumChar, { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

const reservedSet = new Set(DEFAULT_RESERVED_IDENTIFIERS.map((id) => id.toLowerCase()));

const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(segmentArb, { minLength: 1, maxLength: 8 })
  .map((segments) => segments.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63 && !reservedSet.has(id));

/** Nome de Loja válido (2–60 caracteres após trim). */
const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 2, maxLength: 60 })
  .map((s) => s.replace(/\s+/g, "x")) // garante conteúdo não vazio após trim
  .filter((s) => {
    const t = s.trim();
    return t.length >= 2 && t.length <= 60;
  });

/** Input de criação válido (name, storeType "Outro", templateId, identifier válido). */
const validInputArb: fc.Arbitrary<CreateStoreInput> = fc.record({
  name: validNameArb,
  storeType: fc.constant("Outro" as const),
  templateId: fc
    .array(alnumChar, { minLength: 1, maxLength: 12 })
    .map((chars) => `tpl-${chars.join("")}`),
  identifier: validIdentifierArb,
});

describe("StoreService — posse exclusiva da Loja criada (propriedade)", () => {
  it("associa a Loja criada exclusivamente ao Dono autenticado e a nenhum outro", async () => {
    // **Feature: mobisno-store-builder, Property 7: Posse exclusiva da Loja criada**
    // **Validates: Requirements 5.2**
    await assertPropertyAsync(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validInputArb,
        async (ownerId, otherOwnerId, input) => {
          // O Dono que cria e um outro Dono distinto.
          fc.pre(ownerId !== otherOwnerId);

          const owner: StoreOwner = {
            id: ownerId,
            email: "dono@example.com",
            passwordHash: "hash",
            name: "Dono",
            createdAt: "2024-01-01T00:00:00.000Z",
          };

          const storeRepository = createInMemoryStoreRepository();
          const identifierService = createIdentifierService();
          const service = createStoreService({ storeRepository, identifierService });

          const result = await service.createStore(owner, input);

          // Pré-condição: o input é válido e disponível, logo a criação sucede.
          expect(isOk(result)).toBe(true);
          if (!isOk(result)) {
            return;
          }
          const store = result.value;

          // 1. A Loja fica associada exclusivamente a este Dono (Requisito 5.2).
          expect(store.ownerId).toBe(owner.id);

          // 2. A Loja aparece na listagem do Dono proprietário.
          const ownerStores = await storeRepository.listByOwner(owner.id);
          expect(ownerStores.some((s) => s.id === store.id)).toBe(true);

          // 3. Nenhum outro Dono tem acesso à Loja (isolamento de inquilino).
          const otherStores = await storeRepository.listByOwner(otherOwnerId);
          expect(otherStores.some((s) => s.id === store.id)).toBe(false);

          const fromOther = await storeRepository.findByIdForOwner(
            otherOwnerId,
            store.id,
          );
          expect(fromOther).toBeNull();
        },
      ),
    );
  });
});
