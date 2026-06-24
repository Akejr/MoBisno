/**
 * Implementação em memória do `OwnerRepository`.
 *
 * Útil como abstração de persistência por omissão para desenvolvimento e
 * testes. Indexa os Donos_da_Loja por `id` e por `email` normalizado (trim +
 * minúsculas) para garantir a unicidade do email.
 */

import type { StoreOwner } from "../models/index.js";
import type { OwnerRepository } from "./authService.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Cria um `OwnerRepository` em memória. */
export function createInMemoryOwnerRepository(
  seed: StoreOwner[] = [],
): OwnerRepository {
  const byId = new Map<string, StoreOwner>();
  const byEmail = new Map<string, StoreOwner>();

  function index(owner: StoreOwner): void {
    byId.set(owner.id, owner);
    byEmail.set(normalizeEmail(owner.email), owner);
  }

  for (const owner of seed) {
    index(owner);
  }

  return {
    async findByEmail(email: string): Promise<StoreOwner | null> {
      return byEmail.get(normalizeEmail(email)) ?? null;
    },

    async findById(id: string): Promise<StoreOwner | null> {
      return byId.get(id) ?? null;
    },

    async create(owner: StoreOwner): Promise<StoreOwner> {
      index(owner);
      return owner;
    },
  };
}
