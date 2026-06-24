/**
 * Middleware de Subdomínio + Resolução de Loja (StorefrontResolver) — ver
 * design.md → "Components and Interfaces → 7. Middleware de Subdomínio +
 * Renderizador de Loja (StorefrontRenderer)".
 *
 * Responsável por resolver, a partir do cabeçalho `Host` de um pedido, a Loja
 * a renderizar no plano público (`[identificador].mobisno.com`). Garante a
 * segurança por omissão exigida pelo Requisito 9:
 *  - Devolve `not_found` para formato de identificador inválido, Loja
 *    inexistente ou Loja cujo estado não é "Publicada", **sem expor quaisquer
 *    dados** dessa Loja (Requisitos 9.3, 9.4, 9.5).
 *  - Para uma Loja existente e Publicada, devolve `render` com o Modelo
 *    (referenciado pela própria Loja), o Logótipo, os Banners por ordem de
 *    adição e apenas os Produtos disponíveis (Requisito 9.1).
 *
 * Nota de coerência (design.md → "Roteamento por Subdomínio"): a validação de
 * formato do identificador acedido aceita 1–63 caracteres (Requisito 9.5),
 * enquanto a geração de novos identificadores exige 2–63 (Requisito 4.7). Um
 * identificador de comprimento 1 é aceite pela validação de formato mas nunca
 * corresponderá a uma Loja existente, resultando em `not_found`.
 *
 * As dependências (repositórios) são injetáveis para manter o resolvedor
 * testável e independente da infraestrutura.
 */

import type { Asset, Banner, Product, Store } from "../models/index.js";
import { SUBDOMAIN_SUFFIX } from "./identifierService.js";
import type { StoreRepository } from "./storeRepository.js";
import type { AssetRepository } from "./assetRepository.js";
import type { BannerRepository } from "./bannerRepository.js";
import type { ProductRepository } from "./productRepository.js";

/** Comprimento mínimo de um identificador aceite na resolução (Requisito 9.5). */
export const RESOLUTION_MIN_IDENTIFIER_LENGTH = 1;

/** Comprimento máximo de um identificador aceite na resolução (Requisito 9.5). */
export const RESOLUTION_MAX_IDENTIFIER_LENGTH = 63;

/**
 * Identificadores do plano de Administração (`app`/`www`): não correspondem a
 * lojas publicadas e, no plano público, resolvem para `not_found`.
 */
const ADMIN_PLANE_IDENTIFIERS: ReadonlySet<string> = new Set(["app", "www"]);

/**
 * Resultado da resolução de storefront. Em caso de sucesso (`render`) inclui
 * a Loja e os recursos necessários à renderização; caso contrário devolve
 * `not_found` sem expor quaisquer dados.
 */
export type StorefrontResult =
  | {
      kind: "render";
      store: Store;
      /** Logótipo da Loja, ou `null` se não existir (usa-se a identidade de substituição). */
      logo: Asset | null;
      /** Banners da Loja por ordem de adição (Requisito 8.5). */
      banners: Banner[];
      /** Apenas os Produtos disponíveis da Loja (Requisito 7.8/9.1). */
      products: Product[];
    }
  | { kind: "not_found" };

/** Contrato do resolvedor de storefront (design.md → secção 7). */
export interface StorefrontResolver {
  /** Resolve a Loja a renderizar a partir do cabeçalho `Host`. */
  resolve(host: string): Promise<StorefrontResult>;
}

/** Dependências configuráveis do {@link StorefrontResolver}. */
export interface StorefrontResolverDeps {
  /** Repositório de Lojas (resolução por identificador). */
  storeRepository: StoreRepository;
  /** Repositório de Assets (Logótipo). */
  assetRepository: AssetRepository;
  /** Repositório de Banners (listagem por ordem de adição). */
  bannerRepository: BannerRepository;
  /** Repositório de Produtos (filtragem de disponíveis). */
  productRepository: ProductRepository;
}

/**
 * Valida o formato de um identificador para fins de **resolução** de
 * storefront (Requisito 9.5): 1–63 caracteres, apenas letras minúsculas,
 * dígitos e hífenes, sem hífen no início, no fim ou consecutivos.
 *
 * Difere de `isValidIdentifierFormat` (2–63) por aceitar comprimento 1, como
 * previsto na nota de coerência do design para o plano público.
 */
export function isValidResolutionIdentifierFormat(identifier: string): boolean {
  if (
    identifier.length < RESOLUTION_MIN_IDENTIFIER_LENGTH ||
    identifier.length > RESOLUTION_MAX_IDENTIFIER_LENGTH
  ) {
    return false;
  }
  // Blocos de [a-z0-9] separados por hífenes únicos; sem hífen inicial/final/duplo.
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier);
}

/**
 * Extrai o Identificador_de_Loja a partir de um valor do cabeçalho `Host`.
 *
 * Procedimento:
 *  1. Normaliza para minúsculas e remove espaços.
 *  2. Remove uma eventual porta (`:porta`).
 *  3. Exige que o host termine com `.mobisno.com`; caso contrário devolve `null`.
 *  4. Remove o sufixo `.mobisno.com`, devolvendo a parte de subdomínio.
 *
 * Devolve `null` quando o host não pertence ao domínio da Plataforma ou não
 * tem qualquer parte de subdomínio. A validação do formato do identificador
 * resultante é feita separadamente por {@link isValidResolutionIdentifierFormat}.
 */
export function extractIdentifierFromHost(host: string): string | null {
  if (typeof host !== "string") {
    return null;
  }
  // 1. Normalizar.
  let value = host.trim().toLowerCase();
  // 2. Remover porta, se existir.
  const colonIndex = value.indexOf(":");
  if (colonIndex !== -1) {
    value = value.slice(0, colonIndex);
  }
  // 3. Exigir o sufixo do domínio da Plataforma.
  if (!value.endsWith(SUBDOMAIN_SUFFIX)) {
    return null;
  }
  // 4. Remover o sufixo e devolver a parte de subdomínio.
  const identifier = value.slice(0, value.length - SUBDOMAIN_SUFFIX.length);
  if (identifier.length === 0) {
    return null;
  }
  return identifier;
}

/**
 * Cria uma instância de {@link StorefrontResolver} com os repositórios
 * fornecidos. O resolvedor não expõe qualquer dado de Lojas que não estejam
 * publicadas, sejam inexistentes ou tenham subdomínio inválido.
 */
export function createStorefrontResolver(
  deps: StorefrontResolverDeps,
): StorefrontResolver {
  const { storeRepository, assetRepository, bannerRepository, productRepository } = deps;

  return {
    async resolve(host: string): Promise<StorefrontResult> {
      // Extrair o identificador do host; host inválido => Loja não encontrada.
      const identifier = extractIdentifierFromHost(host);
      if (identifier === null) {
        return { kind: "not_found" };
      }

      // Plano de Administração (app/www): não é uma loja publicada.
      if (ADMIN_PLANE_IDENTIFIERS.has(identifier)) {
        return { kind: "not_found" };
      }

      // Formato inválido => Loja não encontrada, sem expor dados (Requisito 9.5).
      if (!isValidResolutionIdentifierFormat(identifier)) {
        return { kind: "not_found" };
      }

      // Resolver a Loja pelo identificador.
      const store = await storeRepository.findByIdentifier(identifier);

      // Loja inexistente => Loja não encontrada (Requisito 9.3).
      // Loja não Publicada => Loja não encontrada, sem expor dados (Requisito 9.4).
      if (store === null || store.state !== "Publicada") {
        return { kind: "not_found" };
      }

      // Loja existente e Publicada: reunir os recursos a renderizar (Requisito 9.1).
      const logo = await assetRepository.findLogo(store.id);
      const banners = await bannerRepository.listByStore(store.id);
      const allProducts = await productRepository.listByStore(store.id);
      const products = allProducts.filter((product) => product.available === true);

      return {
        kind: "render",
        store,
        logo,
        banners,
        products,
      };
    },
  };
}
