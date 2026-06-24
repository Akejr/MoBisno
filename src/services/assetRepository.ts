/**
 * Repositório de Assets (AssetRepository) — camada de persistência
 * multi-inquilino para recursos de imagem (Logótipo, imagem de Produto e
 * Banner) referenciados por URL.
 *
 * Todas as operações são estritamente delimitadas por `storeId`: nenhuma
 * leitura ou escrita pode aceder ou alterar Assets de outra Loja (isolamento
 * de inquilino). Para o Logótipo (`kind === "logo"`), uma Loja tem no máximo
 * um Asset desse tipo; `upsertLogo` substitui o Logótipo anterior mantendo a
 * unicidade por Loja (suporte aos Requisitos 6.2/6.7).
 */

import type { Asset, AssetKind } from "../models/index.js";

/** Repositório de Assets delimitado por Loja. */
export interface AssetRepository {
  /**
   * Persiste um Asset na Loja `storeId`. O `storeId` do Asset é forçado para
   * `storeId` para garantir a coerência de propriedade.
   */
  create(storeId: string, asset: Asset): Promise<Asset>;
  /**
   * Define (ou substitui) o Logótipo da Loja `storeId`, garantindo no máximo
   * um Asset de tipo `logo` por Loja.
   */
  upsertLogo(storeId: string, asset: Asset): Promise<Asset>;
  /**
   * Remove o Asset `assetId` da Loja `storeId`. Devolve `false` se o Asset não
   * existir ou não pertencer a `storeId` (isolamento).
   */
  remove(storeId: string, assetId: string): Promise<boolean>;
  /**
   * Devolve o Asset `assetId` apenas se pertencer a `storeId`; caso contrário
   * devolve `null` (isolamento de inquilino).
   */
  findById(storeId: string, assetId: string): Promise<Asset | null>;
  /** Devolve o Logótipo da Loja `storeId`, ou `null` se não existir. */
  findLogo(storeId: string): Promise<Asset | null>;
  /** Lista os Assets da Loja `storeId`, opcionalmente filtrados por tipo. */
  listByStore(storeId: string, kind?: AssetKind): Promise<Asset[]>;
}

/** Cria um {@link AssetRepository} em memória. */
export function createInMemoryAssetRepository(seed: Asset[] = []): AssetRepository {
  const byId = new Map<string, Asset>();

  for (const asset of seed) {
    byId.set(asset.id, asset);
  }

  /** Devolve o Asset se existir e pertencer à Loja indicada. */
  function ownedByStore(storeId: string, assetId: string): Asset | null {
    const asset = byId.get(assetId);
    if (!asset || asset.storeId !== storeId) {
      return null;
    }
    return asset;
  }

  return {
    async create(storeId: string, asset: Asset): Promise<Asset> {
      const owned: Asset = { ...asset, storeId };
      byId.set(owned.id, owned);
      return owned;
    },

    async upsertLogo(storeId: string, asset: Asset): Promise<Asset> {
      // Remove qualquer Logótipo existente da Loja (unicidade por Loja).
      for (const [id, existing] of byId) {
        if (existing.storeId === storeId && existing.kind === "logo") {
          byId.delete(id);
        }
      }
      const owned: Asset = { ...asset, storeId, kind: "logo" };
      byId.set(owned.id, owned);
      return owned;
    },

    async remove(storeId: string, assetId: string): Promise<boolean> {
      const current = ownedByStore(storeId, assetId);
      if (current === null) {
        return false;
      }
      byId.delete(assetId);
      return true;
    },

    async findById(storeId: string, assetId: string): Promise<Asset | null> {
      return ownedByStore(storeId, assetId);
    },

    async findLogo(storeId: string): Promise<Asset | null> {
      for (const asset of byId.values()) {
        if (asset.storeId === storeId && asset.kind === "logo") {
          return asset;
        }
      }
      return null;
    },

    async listByStore(storeId: string, kind?: AssetKind): Promise<Asset[]> {
      return [...byId.values()].filter(
        (asset) => asset.storeId === storeId && (kind === undefined || asset.kind === kind),
      );
    },
  };
}
