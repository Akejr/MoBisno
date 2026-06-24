/**
 * Repositório de Produtos (ProductRepository) — camada de persistência
 * multi-inquilino.
 *
 * Todas as operações são estritamente delimitadas por `storeId`: nenhuma
 * leitura ou escrita pode aceder ou alterar Produtos de outra Loja
 * (isolamento de inquilino, Requisito 7.9). Operações sobre um Produto que
 * não pertence ao `storeId` indicado comportam-se como se o Produto não
 * existisse (devolvem `null`/`false`), nunca expondo nem alterando dados de
 * outra Loja.
 */

import type { Product } from "../models/index.js";

/** Repositório de Produtos delimitado por Loja. */
export interface ProductRepository {
  /**
   * Persiste um novo Produto na Loja `storeId`. O `storeId` do Produto é
   * forçado para `storeId` para garantir a coerência de propriedade.
   */
  create(storeId: string, product: Product): Promise<Product>;
  /**
   * Atualiza um Produto existente da Loja `storeId`. Devolve `null` se o
   * Produto não existir ou não pertencer a `storeId` (isolamento).
   */
  update(storeId: string, product: Product): Promise<Product | null>;
  /**
   * Remove o Produto `productId` da Loja `storeId`. Devolve `false` se o
   * Produto não existir ou não pertencer a `storeId` (isolamento).
   */
  remove(storeId: string, productId: string): Promise<boolean>;
  /**
   * Devolve o Produto `productId` apenas se pertencer a `storeId`; caso
   * contrário devolve `null` (isolamento de inquilino).
   */
  findById(storeId: string, productId: string): Promise<Product | null>;
  /** Lista todos os Produtos da Loja `storeId` por ordem de criação. */
  listByStore(storeId: string): Promise<Product[]>;
}

/** Cria um {@link ProductRepository} em memória. */
export function createInMemoryProductRepository(seed: Product[] = []): ProductRepository {
  // Mantém a ordem de inserção (Map preserva a ordem de inserção).
  const byId = new Map<string, Product>();

  for (const product of seed) {
    byId.set(product.id, product);
  }

  /** Devolve o Produto se existir e pertencer à Loja indicada. */
  function ownedByStore(storeId: string, productId: string): Product | null {
    const product = byId.get(productId);
    if (!product || product.storeId !== storeId) {
      return null;
    }
    return product;
  }

  return {
    async create(storeId: string, product: Product): Promise<Product> {
      // Força a propriedade do recurso à Loja indicada.
      const owned: Product = { ...product, storeId };
      byId.set(owned.id, owned);
      return owned;
    },

    async update(storeId: string, product: Product): Promise<Product | null> {
      const current = ownedByStore(storeId, product.id);
      if (current === null) {
        return null;
      }
      // Impede a "mudança" de Loja: mantém o storeId original.
      const updated: Product = { ...product, storeId };
      byId.set(updated.id, updated);
      return updated;
    },

    async remove(storeId: string, productId: string): Promise<boolean> {
      const current = ownedByStore(storeId, productId);
      if (current === null) {
        return false;
      }
      byId.delete(productId);
      return true;
    },

    async findById(storeId: string, productId: string): Promise<Product | null> {
      return ownedByStore(storeId, productId);
    },

    async listByStore(storeId: string): Promise<Product[]> {
      return [...byId.values()].filter((product) => product.storeId === storeId);
    },
  };
}
