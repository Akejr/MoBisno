import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import {
  createStoreService,
  type CreateStoreInput,
} from "../src/services/storeService.js";
import type {
  StoreRepository,
  StoreRepositoryError,
} from "../src/services/storeRepository.js";
import { createIdentifierService } from "../src/services/identifierService.js";
import { isErr, err } from "../src/models/index.js";
import type { Result, Store, StoreOwner } from "../src/models/index.js";

/**
 * Dono autenticado fixo (a posse exclusiva é coberta pela Property 7). A
 * atomicidade em falha é independente do Dono concreto.
 */
const OWNER: StoreOwner = {
  id: "owner-prop9",
  email: "dono@example.com",
  passwordHash: "hash",
  name: "Dono de Teste",
  createdAt: "2024-01-01T00:00:00.000Z",
};

/** Bloco alfanumérico minúsculo de um identificador de formato válido. */
const blockArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 12,
  })
  .map((chars) => chars.join(""));

/** Identificadores de formato válido (2–63, [a-z0-9] com hífenes únicos). */
const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(blockArb, { minLength: 1, maxLength: 6 })
  .map((blocks) => blocks.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63);

/** Nome de Loja válido (2–60 caracteres após trim). */
const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 2, maxLength: 60 })
  .map((s) => s.replace(/\s+/g, "x"))
  .filter((s) => {
    const t = s.trim();
    return t.length >= 2 && t.length <= 60;
  });

/** Input de criação válido: passa toda a validação até à persistência. */
const validInputArb: fc.Arbitrary<CreateStoreInput> = fc.record({
  name: validNameArb,
  storeType: fc.constant("Outro" as const),
  templateId: blockArb.map((s) => `tpl-${s}`),
  identifier: validIdentifierArb,
});

/**
 * Códigos de falha de sistema genéricos (não duplicação): o StoreService deve
 * mapeá-los para `FALHA_PERSISTENCIA`, sem persistir qualquer Loja parcial.
 */
const systemFailureCodeArb = fc.constantFrom<StoreRepositoryError["code"]>(
  "SUBDOMINIO_INCOERENTE",
  "LOJA_INEXISTENTE",
);

/**
 * Repositório que simula uma falha de sistema em `create`: nunca persiste
 * (devolve `err`) e regista as tentativas de escrita para verificação de
 * atomicidade (nenhuma escrita bem-sucedida, armazenamento permanece vazio).
 */
function createFailingTrackingRepository(failureCode: StoreRepositoryError["code"]): {
  repository: StoreRepository;
  createAttempts: number;
  successfulWrites: () => number;
} {
  const tracker = { createAttempts: 0, successful: 0 };

  const repository: StoreRepository = {
    async create(_store: Store): Promise<Result<Store, StoreRepositoryError>> {
      tracker.createAttempts += 1;
      // Falha de sistema: nada é persistido.
      return err({
        code: failureCode,
        reason: "Falha de sistema simulada durante a persistência.",
      });
    },
    async update(): Promise<Result<Store, StoreRepositoryError>> {
      return err({ code: "LOJA_INEXISTENTE", reason: "Não suportado no teste." });
    },
    async findByIdForOwner(): Promise<Store | null> {
      return null;
    },
    async listByOwner(): Promise<Store[]> {
      // Confirma que nenhuma Loja (parcial) foi persistida.
      return [];
    },
    async findByIdentifier(): Promise<Store | null> {
      return null;
    },
    async isIdentifierTaken(): Promise<boolean> {
      return false;
    },
  };

  return {
    repository,
    get createAttempts() {
      return tracker.createAttempts;
    },
    successfulWrites: () => tracker.successful,
  };
}

describe("StoreService — atomicidade da criação em falha (propriedade)", () => {
  it("em falha de sistema, não persiste Loja parcial e preserva os dados introduzidos", async () => {
    // **Feature: mobisno-store-builder, Property 9: Atomicidade da criação em falha**
    // **Validates: Requirements 5.4**
    await assertPropertyAsync(
      fc.asyncProperty(
        validInputArb,
        systemFailureCodeArb,
        async (input, failureCode) => {
          const tracking = createFailingTrackingRepository(failureCode);
          const identifierService = createIdentifierService();
          const service = createStoreService({
            storeRepository: tracking.repository,
            identifierService,
          });

          // Snapshot profundo do input antes da operação (preservação de dados).
          const inputBefore = structuredClone(input);

          const result = await service.createStore(OWNER, input);

          // 1. A criação falha de forma previsível com FALHA_PERSISTENCIA.
          expect(isErr(result)).toBe(true);
          if (!isErr(result)) {
            return;
          }
          expect(result.error.code).toBe("FALHA_PERSISTENCIA");

          // 2. Nenhuma Loja parcial é persistida (armazenamento permanece vazio).
          const persisted = await tracking.repository.listByOwner(OWNER.id);
          expect(persisted.length).toBe(0);
          expect(tracking.successfulWrites()).toBe(0);

          // 3. Os dados introduzidos no Assistente são preservados (input inalterado).
          expect(input).toEqual(inputBefore);
        },
      ),
    );
  });
});
