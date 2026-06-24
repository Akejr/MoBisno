import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import type { Store, StoreOwner } from "../src/models/index.js";
import {
  createIdentifierService,
  isValidIdentifierFormat,
  toSubdomain,
  DEFAULT_RESERVED_IDENTIFIERS,
} from "../src/services/identifierService.js";
import { createInMemoryStoreRepository } from "../src/services/storeRepository.js";
import {
  createStoreService,
  type CreateStoreInput,
  type StoreIdGenerator,
} from "../src/services/storeService.js";

/**
 * Gerador de Identificadores_de_Loja válidos: blocos de `[a-z0-9]` unidos por
 * um único hífen, com comprimento total entre 2 e 63 caracteres. Por construção
 * satisfaz `isValidIdentifierFormat` (sem hífen inicial/final/consecutivo).
 */
const alnumChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);

const segmentArb: fc.Arbitrary<string> = fc
  .array(alnumChar, { minLength: 1, maxLength: 10 })
  .map((chars) => chars.join(""));

const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(segmentArb, { minLength: 1, maxLength: 6 })
  .map((segments) => segments.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63);

/**
 * Gerador de identificadores com formato inválido: qualquer string que NÃO
 * satisfaça `isValidIdentifierFormat` (ex.: maiúsculas, hífenes nas pontas ou
 * consecutivos, caracteres especiais, comprimento fora dos limites).
 */
const invalidIdentifierArb: fc.Arbitrary<string> = fc
  .string({ minLength: 0, maxLength: 70 })
  .filter((s) => !isValidIdentifierFormat(s.trim()));

/** Dono_da_Loja mínimo usado para seed e criação. */
const owner: StoreOwner = {
  id: "owner-1",
  email: "dono@example.com",
  passwordHash: "hash",
  name: "Dono Teste",
  createdAt: "2024-01-01T00:00:00.000Z",
};

/** Constrói uma Loja de seed coerente a partir de um identificador válido. */
function seedStore(id: string, identifier: string): Store {
  return {
    id,
    ownerId: owner.id,
    name: "Loja Seed",
    storeType: "Outro",
    templateId: "tpl-seed",
    identifier,
    subdomain: toSubdomain(identifier),
    state: "Rascunho",
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

/**
 * Cenário: um conjunto de Lojas pré-existentes (identificadores válidos e
 * distintos) e um identificador candidato que pode colidir com uma Loja
 * existente, ser uma palavra reservada, ser fresco e válido, ou ser inválido.
 */
const scenarioArb = fc
  .uniqueArray(validIdentifierArb, { minLength: 0, maxLength: 5 })
  .chain((seedIds) => {
    const candidateKinds: fc.Arbitrary<string>[] = [
      validIdentifierArb, // fresco (pode ou não colidir/ser reservado)
      fc.constantFrom(...DEFAULT_RESERVED_IDENTIFIERS), // reservado
      invalidIdentifierArb, // formato inválido
    ];
    if (seedIds.length > 0) {
      candidateKinds.push(fc.constantFrom(...seedIds)); // colisão garantida
    }
    return fc.record({
      seedIds: fc.constant(seedIds),
      candidate: fc.oneof(...candidateKinds),
    });
  });

describe("StoreService — unicidade e reserva de identificador (propriedade)", () => {
  it("permite a criação se e só se o identificador for válido, não reservado e não usado; caso contrário rejeita sem persistir", async () => {
    // **Feature: mobisno-store-builder, Property 6: Unicidade e reserva de identificador**
    // **Validates: Requirements 4.5, 5.5**
    const reservedSet = new Set(
      DEFAULT_RESERVED_IDENTIFIERS.map((r) => r.toLowerCase()),
    );

    await assertPropertyAsync(
      fc.asyncProperty(scenarioArb, async ({ seedIds, candidate }) => {
        // Repositório semeado com as Lojas pré-existentes.
        const seedStores = seedIds.map((id, index) =>
          seedStore(`seed-${index}`, id),
        );
        const repository = createInMemoryStoreRepository(seedStores);

        // Disponibilidade reflete as Lojas existentes do repositório.
        const identifierService = createIdentifierService({
          isIdentifierTaken: (id) => repository.isIdentifierTaken(id),
        });

        // Gerador determinístico de ids sem colisão com os ids de seed.
        let counter = 0;
        const idGenerator: StoreIdGenerator = {
          newId: () => `created-${counter++}`,
        };

        const service = createStoreService({
          storeRepository: repository,
          identifierService,
          idGenerator,
        });

        const input: CreateStoreInput = {
          name: "Loja Teste",
          storeType: "Outro",
          templateId: "tpl-1",
          identifier: candidate,
        };

        // Condições da especificação calculadas independentemente do serviço.
        const key = candidate.trim().toLowerCase();
        const validFormat = isValidIdentifierFormat(candidate.trim());
        const isReserved = reservedSet.has(key);
        const isTaken = await repository.isIdentifierTaken(candidate);
        const shouldSucceed = validFormat && !isReserved && !isTaken;

        const countBefore = (await repository.listByOwner(owner.id)).length;
        const result = await service.createStore(owner, input);
        const countAfter = (await repository.listByOwner(owner.id)).length;

        if (shouldSucceed) {
          // Criação permitida: a Loja é criada e persistida.
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.identifier).toBe(candidate.trim());
            expect(result.value.subdomain).toBe(toSubdomain(candidate.trim()));
          }
          expect(countAfter).toBe(countBefore + 1);
          const persisted = await repository.findByIdentifier(candidate);
          expect(persisted).not.toBeNull();
        } else {
          // Indisponibilidade ou formato inválido: rejeição sem persistência.
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect([
              "IDENTIFICADOR_INDISPONIVEL",
              "IDENTIFICADOR_INVALIDO",
              "IDENTIFICADOR_EM_FALTA",
            ]).toContain(result.error.code);
          }
          // Nenhuma Loja foi persistida: a contagem permanece inalterada.
          expect(countAfter).toBe(countBefore);
        }
      }),
    );
  });
});
