/**
 * Repositório de Lojas (StoreRepository) — camada de persistência
 * multi-inquilino (ver design.md → "Architecture → Multi-tenancy" e
 * "Data Models → Invariantes de Dados").
 *
 * Princípios:
 *  - **Isolamento de inquilino**: as operações orientadas ao Dono_da_Loja
 *    (`findByIdForOwner`, `listByOwner`, `update`) filtram obrigatoriamente
 *    por `ownerId`; nenhuma operação permite a um Dono aceder ou alterar
 *    Lojas de outro Dono (Requisitos 5.2, 7.9).
 *  - **Resolução pública**: `findByIdentifier` resolve uma Loja pelo seu
 *    identificador (plano público de storefront e verificação de unicidade);
 *    é intencionalmente independente do `ownerId`, por ser usada para o
 *    roteamento por subdomínio e para impor a unicidade do identificador.
 *  - **Invariantes de dados**: a escrita impõe a unicidade do
 *    `identifier` em toda a Plataforma e a coerência do `subdomain`
 *    (`subdomain === identifier + ".mobisno.com"`).
 */

import type { Result, Store } from "../models/index.js";
import { ok, err } from "../models/index.js";
import { SUBDOMAIN_SUFFIX } from "./identifierService.js";

/** Código de erro estável da camada de persistência de Lojas. */
export type StoreRepositoryErrorCode =
  | "IDENTIFICADOR_DUPLICADO"
  | "SUBDOMINIO_INCOERENTE"
  | "LOJA_INEXISTENTE";

/**
 * Erro de persistência de Loja devolvido quando uma invariante de dados é
 * violada ou o recurso não existe / não pertence ao Dono.
 */
export interface StoreRepositoryError {
  code: StoreRepositoryErrorCode;
  /** Motivo legível (em português) para apresentação/diagnóstico. */
  reason: string;
}

/**
 * Repositório de Lojas. A implementação concreta garante o isolamento de
 * inquilino e as invariantes de dados descritas no design.
 */
export interface StoreRepository {
  /**
   * Persiste uma nova Loja, impondo a unicidade do `identifier` na
   * Plataforma e a coerência do `subdomain`. Devolve erro sem persistir se
   * alguma invariante for violada.
   */
  create(store: Store): Promise<Result<Store, StoreRepositoryError>>;
  /**
   * Atualiza uma Loja existente **pertencente a `ownerId`**. Rejeita se a
   * Loja não existir ou pertencer a outro Dono (isolamento), bem como em caso
   * de violação de invariantes de dados.
   */
  update(ownerId: string, store: Store): Promise<Result<Store, StoreRepositoryError>>;
  /**
   * Devolve a Loja `storeId` apenas se pertencer a `ownerId`; caso contrário
   * devolve `null` (isolamento de inquilino).
   */
  findByIdForOwner(ownerId: string, storeId: string): Promise<Store | null>;
  /** Devolve todas as Lojas de `ownerId` (isolamento de inquilino). */
  listByOwner(ownerId: string): Promise<Store[]>;
  /**
   * Resolve uma Loja pelo `identifier` (plano público / unicidade).
   * Independente do `ownerId` por construção.
   */
  findByIdentifier(identifier: string): Promise<Store | null>;
  /** Indica se o `identifier` já está associado a uma Loja existente. */
  isIdentifierTaken(identifier: string): Promise<boolean>;
}

/** Normaliza um identificador para comparação de unicidade (case-insensitive). */
function normalizeIdentifierKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * Valida a coerência do subdomínio em relação ao identificador
 * (`subdomain === identifier + ".mobisno.com"`).
 */
function isSubdomainCoherent(store: Store): boolean {
  return store.subdomain === `${store.identifier}${SUBDOMAIN_SUFFIX}`;
}

/** Cria um {@link StoreRepository} em memória. */
export function createInMemoryStoreRepository(seed: Store[] = []): StoreRepository {
  const byId = new Map<string, Store>();
  const byIdentifier = new Map<string, Store>();

  function index(store: Store): void {
    byId.set(store.id, store);
    byIdentifier.set(normalizeIdentifierKey(store.identifier), store);
  }

  for (const store of seed) {
    index(store);
  }

  function validateInvariants(
    store: Store,
    options: { excludeStoreId?: string } = {},
  ): StoreRepositoryError | null {
    // Coerência de subdomínio.
    if (!isSubdomainCoherent(store)) {
      return {
        code: "SUBDOMINIO_INCOERENTE",
        reason:
          "O subdomínio da Loja deve ser exatamente o identificador seguido de \".mobisno.com\".",
      };
    }
    // Unicidade do identificador na Plataforma.
    const existing = byIdentifier.get(normalizeIdentifierKey(store.identifier));
    if (existing && existing.id !== options.excludeStoreId) {
      return {
        code: "IDENTIFICADOR_DUPLICADO",
        reason: "O identificador da Loja já está associado a outra Loja.",
      };
    }
    return null;
  }

  return {
    async create(store: Store): Promise<Result<Store, StoreRepositoryError>> {
      const violation = validateInvariants(store);
      if (violation !== null) {
        return err(violation);
      }
      index(store);
      return ok(store);
    },

    async update(
      ownerId: string,
      store: Store,
    ): Promise<Result<Store, StoreRepositoryError>> {
      const current = byId.get(store.id);
      // Isolamento de inquilino: só atualiza Lojas do próprio Dono.
      if (!current || current.ownerId !== ownerId) {
        return err({
          code: "LOJA_INEXISTENTE",
          reason: "A Loja não existe ou não pertence a este Dono.",
        });
      }
      const violation = validateInvariants(store, { excludeStoreId: store.id });
      if (violation !== null) {
        return err(violation);
      }
      // Se o identificador mudou, remover a chave antiga do índice.
      const previousKey = normalizeIdentifierKey(current.identifier);
      const nextKey = normalizeIdentifierKey(store.identifier);
      if (previousKey !== nextKey) {
        byIdentifier.delete(previousKey);
      }
      index(store);
      return ok(store);
    },

    async findByIdForOwner(
      ownerId: string,
      storeId: string,
    ): Promise<Store | null> {
      const store = byId.get(storeId);
      if (!store || store.ownerId !== ownerId) {
        return null;
      }
      return store;
    },

    async listByOwner(ownerId: string): Promise<Store[]> {
      return [...byId.values()].filter((store) => store.ownerId === ownerId);
    },

    async findByIdentifier(identifier: string): Promise<Store | null> {
      return byIdentifier.get(normalizeIdentifierKey(identifier)) ?? null;
    },

    async isIdentifierTaken(identifier: string): Promise<boolean> {
      return byIdentifier.has(normalizeIdentifierKey(identifier));
    },
  };
}
