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
 * Geradores de apoio. Reaproveitam a mesma estratégia das restantes
 * propriedades do StoreService: identificadores válidos e não reservados,
 * nomes válidos (2–60 após trim) e Modelos com conteúdo não vazio.
 */
const alnumChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);

const segmentArb: fc.Arbitrary<string> = fc
  .array(alnumChar, { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

const reservedSet = new Set(
  DEFAULT_RESERVED_IDENTIFIERS.map((id) => id.toLowerCase()),
);

const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(segmentArb, { minLength: 1, maxLength: 8 })
  .map((segments) => segments.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63 && !reservedSet.has(id));

const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 2, maxLength: 60 })
  .map((s) => s.replace(/\s+/g, "x"))
  .filter((s) => {
    const t = s.trim();
    return t.length >= 2 && t.length <= 60;
  });

/** Modelo (templateId) com conteúdo não vazio após trim. */
const templateIdArb: fc.Arbitrary<string> = fc
  .array(alnumChar, { minLength: 1, maxLength: 12 })
  .map((chars) => `tpl-${chars.join("")}`);

/** Input de criação válido. */
const validInputArb: fc.Arbitrary<CreateStoreInput> = fc.record({
  name: validNameArb,
  storeType: fc.constant("Outro" as const),
  templateId: templateIdArb,
  identifier: validIdentifierArb,
});

describe("StoreService — Modelo único associado à Loja (propriedade)", () => {
  it("mantém exatamente um Modelo associado, igual ao último selecionado, após cada confirmação", async () => {
    // **Feature: mobisno-store-builder, Property 10: Modelo único associado à Loja**
    // **Validates: Requirements 3.3**
    await assertPropertyAsync(
      fc.asyncProperty(
        fc.uuid(),
        validInputArb,
        // Sequência não vazia de seleções de Modelo (confirmações sucessivas).
        fc.array(templateIdArb, { minLength: 1, maxLength: 12 }),
        async (ownerId, input, selections) => {
          const owner: StoreOwner = {
            id: ownerId,
            email: "dono@example.com",
            passwordHash: "hash",
            name: "Dono",
            createdAt: "2024-01-01T00:00:00.000Z",
          };

          const storeRepository = createInMemoryStoreRepository();
          const identifierService = createIdentifierService();
          const service = createStoreService({
            storeRepository,
            identifierService,
          });

          // Cria a Loja (input válido => criação bem-sucedida).
          const created = await service.createStore(owner, input);
          expect(isOk(created)).toBe(true);
          if (!isOk(created)) {
            return;
          }
          const storeId = created.value.id;

          // Aplica a sequência de seleções de Modelo, validando após cada
          // confirmação que existe exatamente um Modelo associado e que é
          // igual ao último selecionado (Requisito 3.3).
          for (const templateId of selections) {
            const result = await service.setTemplate(ownerId, storeId, templateId);
            expect(isOk(result)).toBe(true);
            if (!isOk(result)) {
              return;
            }

            const expected = templateId.trim();

            // 1. A Loja devolvida tem exatamente um Modelo (campo único, não
            //    vazio) igual ao último selecionado.
            expect(typeof result.value.templateId).toBe("string");
            expect(result.value.templateId.length).toBeGreaterThan(0);
            expect(result.value.templateId).toBe(expected);

            // 2. A leitura de volta do repositório confirma a mesma associação
            //    única (a confirmação anterior foi substituída, não acumulada).
            const stored = await storeRepository.findByIdForOwner(ownerId, storeId);
            expect(stored).not.toBeNull();
            expect(stored?.templateId).toBe(expected);
          }
        },
      ),
    );
  });
});
