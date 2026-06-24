/**
 * Repositório de Banners (BannerRepository) — camada de persistência
 * multi-inquilino.
 *
 * Todas as operações são estritamente delimitadas por `storeId`: nenhuma
 * leitura ou escrita pode aceder ou alterar Banners de outra Loja
 * (isolamento de inquilino). A listagem é devolvida pela ordem de adição
 * (campo `position` estritamente crescente por Loja, Requisito 8.5). A
 * imposição do limite máximo de Banners por Loja (Requisito 8.4) é
 * responsabilidade do BannerService; este repositório expõe `countByStore`
 * para suportar essa verificação.
 */

import type { Banner } from "../models/index.js";

/** Repositório de Banners delimitado por Loja. */
export interface BannerRepository {
  /**
   * Persiste um novo Banner na Loja `storeId`. O `storeId` do Banner é
   * forçado para `storeId` para garantir a coerência de propriedade.
   */
  create(storeId: string, banner: Banner): Promise<Banner>;
  /**
   * Remove o Banner `bannerId` da Loja `storeId`. Devolve `false` se o Banner
   * não existir ou não pertencer a `storeId` (isolamento).
   */
  remove(storeId: string, bannerId: string): Promise<boolean>;
  /**
   * Devolve o Banner `bannerId` apenas se pertencer a `storeId`; caso
   * contrário devolve `null` (isolamento de inquilino).
   */
  findById(storeId: string, bannerId: string): Promise<Banner | null>;
  /** Lista os Banners da Loja `storeId` por ordem de adição (`position`). */
  listByStore(storeId: string): Promise<Banner[]>;
  /** Conta os Banners associados à Loja `storeId` (suporte ao limite de 10). */
  countByStore(storeId: string): Promise<number>;
}

/** Cria um {@link BannerRepository} em memória. */
export function createInMemoryBannerRepository(seed: Banner[] = []): BannerRepository {
  const byId = new Map<string, Banner>();

  for (const banner of seed) {
    byId.set(banner.id, banner);
  }

  /** Devolve o Banner se existir e pertencer à Loja indicada. */
  function ownedByStore(storeId: string, bannerId: string): Banner | null {
    const banner = byId.get(bannerId);
    if (!banner || banner.storeId !== storeId) {
      return null;
    }
    return banner;
  }

  return {
    async create(storeId: string, banner: Banner): Promise<Banner> {
      const owned: Banner = { ...banner, storeId };
      byId.set(owned.id, owned);
      return owned;
    },

    async remove(storeId: string, bannerId: string): Promise<boolean> {
      const current = ownedByStore(storeId, bannerId);
      if (current === null) {
        return false;
      }
      byId.delete(bannerId);
      return true;
    },

    async findById(storeId: string, bannerId: string): Promise<Banner | null> {
      return ownedByStore(storeId, bannerId);
    },

    async listByStore(storeId: string): Promise<Banner[]> {
      return [...byId.values()]
        .filter((banner) => banner.storeId === storeId)
        .sort((a, b) => a.position - b.position);
    },

    async countByStore(storeId: string): Promise<number> {
      let count = 0;
      for (const banner of byId.values()) {
        if (banner.storeId === storeId) {
          count += 1;
        }
      }
      return count;
    },
  };
}
