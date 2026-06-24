/**
 * Serviço de Produtos (ProductService) — ver design.md →
 * "Components and Interfaces → 5. Serviço de Produtos (ProductService)".
 *
 * Responsável pelo cadastro e gestão de Produtos de uma Loja, garantindo:
 *  - Validação determinística do input: nome (1–120 caracteres), descrição
 *    (até 2000 caracteres) e preço (0,00 a 999.999.999,99) (Requisito 7.1).
 *  - Rejeição de Produtos sem nome ou sem preço, ou com preço negativo,
 *    preservando os dados e indicando os campos em causa (Requisitos 7.2, 7.3).
 *  - Isolamento de inquilino: `update`/`remove` rejeitam Produtos inexistentes
 *    ou pertencentes a outra Loja, e todas as operações verificam a posse da
 *    Loja pelo Dono autenticado (Requisitos 5.2, 7.9).
 *  - `listAvailableForPublic` devolve apenas os Produtos marcados como
 *    disponíveis (Requisito 7.8).
 *
 * O serviço devolve `Result<T, ProductError>` para erros previsíveis (sem
 * exceções), permitindo à UI mapear cada erro para uma mensagem em português
 * junto ao campo correspondente. As dependências (repositório de Produtos,
 * gerador de identificadores e relógio) são injetáveis para manter o serviço
 * testável e independente da infraestrutura.
 */

import type { Product } from "../models/index.js";
import { type Result, ok, err } from "../models/index.js";
import type { ProductRepository } from "./productRepository.js";

/** Comprimento mínimo do nome do Produto (Requisito 7.1). */
export const PRODUCT_NAME_MIN = 1;
/** Comprimento máximo do nome do Produto (Requisito 7.1). */
export const PRODUCT_NAME_MAX = 120;
/** Comprimento máximo da descrição do Produto (Requisito 7.1). */
export const PRODUCT_DESCRIPTION_MAX = 2000;
/** Preço mínimo do Produto (Requisito 7.1, 7.3). */
export const PRODUCT_PRICE_MIN = 0;
/** Preço máximo do Produto: 999.999.999,99 (Requisito 7.1). */
export const PRODUCT_PRICE_MAX = 999_999_999.99;

/**
 * Dados de entrada para registar ou atualizar um Produto. O `name` e o `price`
 * são obrigatórios; `description`, `imageUrl` e `available` são opcionais.
 */
export interface ProductInput {
  /** Nome do Produto (1–120 caracteres após remoção de espaços). */
  name: string;
  /** Descrição do Produto (até 2000 caracteres). Opcional. */
  description?: string;
  /** Categoria do Produto (livre, até 60 caracteres). Opcional. */
  category?: string;
  /** Produto destacado (categoria "Destaques"). */
  featured?: boolean;
  /** Preço do Produto (0,00 a 999.999.999,99). */
  price: number;
  /** URL da imagem do Produto (opcional). */
  imageUrl?: string;
  /** Estado de disponibilidade. Por omissão, `true` na criação. */
  available?: boolean;
}

/** Código de erro de Produto, estável para mapeamento na UI. */
export type ProductErrorCode =
  | "NOME_EM_FALTA"
  | "NOME_DEMASIADO_LONGO"
  | "PRECO_EM_FALTA"
  | "PRECO_NEGATIVO"
  | "PRECO_EXCEDE_MAXIMO"
  | "DESCRICAO_DEMASIADO_LONGA"
  | "PRODUTO_NAO_ENCONTRADO"
  | "ACESSO_NEGADO";

/**
 * Erro de Produto devolvido em caso de input inválido, recurso inexistente ou
 * acesso negado. Inclui o motivo legível (em português) e os campos em causa
 * para que a UI possa assinalar cada campo e preservar os restantes dados
 * (Requisitos 7.2, 7.3, 7.9).
 */
export interface ProductError {
  code: ProductErrorCode;
  /** Motivo da rejeição, em português, para apresentação ao utilizador. */
  reason: string;
  /** Campos do formulário a que o erro diz respeito (ex.: ["name"]). */
  fields: string[];
}

/**
 * Input de Produto já validado e normalizado (nome com espaços removidos,
 * descrição garantida como string e disponibilidade resolvida).
 */
export interface NormalizedProductInput {
  name: string;
  description: string;
  category?: string;
  featured: boolean;
  price: number;
  imageUrl?: string;
  available: boolean;
}

/**
 * Verificador injetável de posse de Loja. Devolve `true` se a Loja `storeId`
 * pertence ao Dono `ownerId`. Quando não fornecido, o serviço assume que o
 * acesso à Loja já foi verificado pela camada chamadora (o repositório de
 * Produtos garante, de qualquer forma, o isolamento ao nível da Loja).
 */
export type StoreOwnershipVerifier = (
  ownerId: string,
  storeId: string,
) => Promise<boolean>;

/** Dependências configuráveis do {@link ProductService}. */
export interface ProductServiceDeps {
  /** Repositório de Produtos (persistência delimitada por Loja). */
  productRepository: ProductRepository;
  /** Gerador de identificadores de Produto. Por omissão, contador interno. */
  idGenerator?: () => string;
  /** Relógio injetável para obter o instante atual (ISO 8601). */
  now?: () => string;
  /** Verificador opcional de posse da Loja pelo Dono (isolamento, Req. 7.9). */
  verifyStoreOwnership?: StoreOwnershipVerifier;
}

/** Contrato do Serviço de Produtos (design.md → secção 5). */
export interface ProductService {
  /** Regista um novo Produto válido na Loja, associando-o à Loja. */
  create(
    ownerId: string,
    storeId: string,
    input: ProductInput,
  ): Promise<Result<Product, ProductError>>;
  /** Atualiza um Produto existente da Loja, rejeitando recursos de outra Loja. */
  update(
    ownerId: string,
    storeId: string,
    productId: string,
    input: ProductInput,
  ): Promise<Result<Product, ProductError>>;
  /** Remove um Produto da Loja, rejeitando recursos inexistentes/de outra Loja. */
  remove(
    ownerId: string,
    storeId: string,
    productId: string,
  ): Promise<Result<void, ProductError>>;
  /** Lista todos os Produtos da Loja (uso no Painel_de_Administração). */
  listForStore(storeId: string): Promise<Product[]>;
  /** Lista apenas os Produtos disponíveis da Loja (loja publicada, Req. 7.8). */
  listAvailableForPublic(storeId: string): Promise<Product[]>;
}

/**
 * Valida e normaliza um {@link ProductInput} (função pura, sem efeitos
 * colaterais). Devolve `Ok<NormalizedProductInput>` quando o input tem nome
 * (1–120 caracteres após trim), preço presente entre 0,00 e 999.999.999,99 e
 * descrição até 2000 caracteres; caso contrário devolve `Err<ProductError>`
 * com o primeiro motivo de rejeição encontrado (Requisitos 7.1, 7.2, 7.3).
 */
export function validateProduct(
  input: ProductInput,
): Result<NormalizedProductInput, ProductError> {
  // Nome: obrigatório, 1–120 caracteres após remoção de espaços.
  const rawName = typeof input?.name === "string" ? input.name : "";
  const name = rawName.trim();
  if (name.length < PRODUCT_NAME_MIN) {
    return err({
      code: "NOME_EM_FALTA",
      reason: "O nome do produto é obrigatório.",
      fields: ["name"],
    });
  }
  if (name.length > PRODUCT_NAME_MAX) {
    return err({
      code: "NOME_DEMASIADO_LONGO",
      reason: `O nome do produto não pode exceder ${PRODUCT_NAME_MAX} caracteres.`,
      fields: ["name"],
    });
  }

  // Preço: obrigatório, número finito entre 0,00 e 999.999.999,99.
  const price = input?.price;
  if (typeof price !== "number" || Number.isNaN(price)) {
    return err({
      code: "PRECO_EM_FALTA",
      reason: "O preço do produto é obrigatório.",
      fields: ["price"],
    });
  }
  if (!Number.isFinite(price) || price < PRODUCT_PRICE_MIN) {
    return err({
      code: "PRECO_NEGATIVO",
      reason: "O preço deve ser maior ou igual a zero.",
      fields: ["price"],
    });
  }
  if (price > PRODUCT_PRICE_MAX) {
    return err({
      code: "PRECO_EXCEDE_MAXIMO",
      reason: "O preço não pode exceder 999.999.999,99.",
      fields: ["price"],
    });
  }

  // Descrição: opcional, até 2000 caracteres.
  const description = typeof input?.description === "string" ? input.description : "";
  if (description.length > PRODUCT_DESCRIPTION_MAX) {
    return err({
      code: "DESCRICAO_DEMASIADO_LONGA",
      reason: `A descrição não pode exceder ${PRODUCT_DESCRIPTION_MAX} caracteres.`,
      fields: ["description"],
    });
  }

  return ok({
    name,
    description,
    category: typeof input.category === "string" && input.category.trim() !== ""
      ? input.category.trim()
      : undefined,
    featured: input.featured === true,
    price,
    imageUrl: input.imageUrl,
    available: input.available ?? true,
  });
}

/**
 * Cria uma instância de {@link ProductService} com as dependências fornecidas.
 *
 * @param deps Dependências do serviço (repositório obrigatório; gerador de
 *             ids, relógio e verificador de posse opcionais).
 */
export function createProductService(deps: ProductServiceDeps): ProductService {
  const productRepository = deps.productRepository;
  let counter = 0;
  const idGenerator = deps.idGenerator ?? (() => `product-${++counter}`);
  const now = deps.now ?? (() => new Date().toISOString());
  const verifyStoreOwnership = deps.verifyStoreOwnership;

  /** Verifica a posse da Loja pelo Dono, quando há verificador configurado. */
  async function ensureStoreAccess(
    ownerId: string,
    storeId: string,
  ): Promise<Result<void, ProductError>> {
    if (verifyStoreOwnership === undefined) {
      return ok(undefined);
    }
    const owns = await verifyStoreOwnership(ownerId, storeId);
    if (!owns) {
      return err({
        code: "ACESSO_NEGADO",
        reason: "A loja indicada não pertence a este utilizador.",
        fields: ["storeId"],
      });
    }
    return ok(undefined);
  }

  return {
    async create(
      ownerId: string,
      storeId: string,
      input: ProductInput,
    ): Promise<Result<Product, ProductError>> {
      const access = await ensureStoreAccess(ownerId, storeId);
      if (!access.ok) {
        return access;
      }

      const validated = validateProduct(input);
      if (!validated.ok) {
        return validated;
      }
      const v = validated.value;

      const product: Product = {
        id: idGenerator(),
        storeId,
        name: v.name,
        description: v.description,
        category: v.category,
        featured: v.featured,
        price: v.price,
        imageUrl: v.imageUrl,
        available: v.available,
        createdAt: now(),
      };

      const created = await productRepository.create(storeId, product);
      return ok(created);
    },

    async update(
      ownerId: string,
      storeId: string,
      productId: string,
      input: ProductInput,
    ): Promise<Result<Product, ProductError>> {
      const access = await ensureStoreAccess(ownerId, storeId);
      if (!access.ok) {
        return access;
      }

      // Isolamento: o Produto tem de existir e pertencer à Loja (Req. 7.9).
      const existing = await productRepository.findById(storeId, productId);
      if (existing === null) {
        return err({
          code: "PRODUTO_NAO_ENCONTRADO",
          reason: "O produto não existe ou não pertence a esta loja.",
          fields: ["productId"],
        });
      }

      const validated = validateProduct(input);
      if (!validated.ok) {
        return validated;
      }
      const v = validated.value;

      const updated: Product = {
        ...existing,
        name: v.name,
        description: v.description,
        category: v.category,
        featured: v.featured,
        price: v.price,
        imageUrl: v.imageUrl,
        available: input.available ?? existing.available,
      };

      const result = await productRepository.update(storeId, updated);
      if (result === null) {
        return err({
          code: "PRODUTO_NAO_ENCONTRADO",
          reason: "O produto não existe ou não pertence a esta loja.",
          fields: ["productId"],
        });
      }
      return ok(result);
    },

    async remove(
      ownerId: string,
      storeId: string,
      productId: string,
    ): Promise<Result<void, ProductError>> {
      const access = await ensureStoreAccess(ownerId, storeId);
      if (!access.ok) {
        return access;
      }

      // Isolamento: só remove se o Produto pertencer à Loja (Req. 7.9).
      const removed = await productRepository.remove(storeId, productId);
      if (!removed) {
        return err({
          code: "PRODUTO_NAO_ENCONTRADO",
          reason: "O produto não existe ou não pertence a esta loja.",
          fields: ["productId"],
        });
      }
      return ok(undefined);
    },

    async listForStore(storeId: string): Promise<Product[]> {
      return productRepository.listByStore(storeId);
    },

    async listAvailableForPublic(storeId: string): Promise<Product[]> {
      const products = await productRepository.listByStore(storeId);
      return products.filter((product) => product.available === true);
    },
  };
}
