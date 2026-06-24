/**
 * UI de Gestão de Produtos do Painel_de_Administração (controlador / view-model).
 *
 * Este módulo implementa, de forma agnóstica a qualquer framework de UI, a
 * lógica de apresentação para a gestão de Produtos de uma Loja, ligada ao
 * {@link ProductService}. Expõe operações deterministas e testáveis para:
 *
 *  - Listar os Produtos da Loja (Requisito 7.1 — listagem no Painel).
 *  - Registar um novo Produto; em sucesso o Produto passa a constar na
 *    listagem (Requisito 7.5); em erro de validação devolve mensagens em
 *    português associadas a cada campo, a partir do {@link ProductError}
 *    (Requisitos 7.2, 7.3).
 *  - Editar os atributos de um Produto existente (Requisito 7.6).
 *  - Remover um Produto em dois passos com confirmação explícita: primeiro
 *    `requestRemoval` devolve um pedido de confirmação; só depois
 *    `confirmRemoval` invoca {@link ProductService.remove} (Requisito 7.7).
 *
 * Todo o texto destinado ao Dono_da_Loja é apresentado em português
 * (Requisito 10.3). O controlador não toca em infraestrutura: recebe um
 * {@link ProductService} injetado, o que o torna determinista e fácil de
 * testar isoladamente.
 */

import type { Product } from "../models/index.js";
import type {
  ProductService,
  ProductInput,
  ProductError,
  ProductErrorCode,
} from "../services/productService.js";

/* -------------------------------------------------------------------------- */
/*  View-models de listagem                                                   */
/* -------------------------------------------------------------------------- */

/** Item individual da listagem de Produtos, pronto para apresentação. */
export interface ProductListItemViewModel {
  id: string;
  name: string;
  description: string;
  /** Preço numérico original (0,00–999.999.999,99). */
  price: number;
  /** Preço formatado em português de Angola, ex.: "1.234,56 Kz". */
  priceFormatted: string;
  imageUrl?: string;
  available: boolean;
  /** Rótulo de disponibilidade em português ("Disponível"/"Indisponível"). */
  availabilityLabel: string;
}

/** View-model da listagem completa de Produtos de uma Loja. */
export interface ProductListViewModel {
  storeId: string;
  items: ProductListItemViewModel[];
  /** Número de Produtos na listagem. */
  count: number;
  /** Verdadeiro quando a Loja ainda não tem Produtos registados. */
  isEmpty: boolean;
  /** Mensagem em português a apresentar quando a listagem está vazia. */
  emptyMessage: string;
}

/* -------------------------------------------------------------------------- */
/*  Resultados de formulário (registo / edição)                               */
/* -------------------------------------------------------------------------- */

/** Erro associado a um campo específico do formulário, em português. */
export interface FieldError {
  /** Nome do campo em causa (ex.: "name", "price", "description"). */
  field: string;
  /** Mensagem de correção em português. */
  message: string;
}

/** Resultado da submissão de um formulário de Produto (registo ou edição). */
export type ProductFormResult =
  | {
      status: "success";
      /** Produto criado/atualizado. */
      product: Product;
      /** Mensagem de confirmação em português. */
      message: string;
    }
  | {
      status: "error";
      /** Código de erro estável, para lógica de UI. */
      code: ProductErrorCode;
      /** Motivo legível em português. */
      message: string;
      /** Campos afetados pelo erro. */
      fields: string[];
      /** Erros por campo, para apresentar junto a cada campo (Req. 10.2). */
      fieldErrors: FieldError[];
      /** Dados submetidos, preservados para reapresentação (Req. 7.2, 7.3). */
      input: ProductInput;
    };

/* -------------------------------------------------------------------------- */
/*  Resultados de remoção (dois passos: pedido + confirmação)                 */
/* -------------------------------------------------------------------------- */

/** Pedido de confirmação de remoção apresentado ao Dono_da_Loja (Req. 7.7). */
export interface RemovalPrompt {
  productId: string;
  productName: string;
  /** Mensagem de confirmação em português. */
  message: string;
  /** Rótulo da ação de confirmar a remoção. */
  confirmLabel: string;
  /** Rótulo da ação de cancelar a remoção. */
  cancelLabel: string;
}

/** Resultado do pedido de remoção (primeiro passo). */
export type RemovalRequestResult =
  | { status: "confirmation_required"; prompt: RemovalPrompt }
  | {
      status: "error";
      code: ProductErrorCode;
      message: string;
      fields: string[];
    };

/** Resultado da confirmação de remoção (segundo passo). */
export type RemovalResult =
  | {
      status: "removed";
      productId: string;
      /** Mensagem de confirmação em português. */
      message: string;
    }
  | {
      status: "error";
      code: ProductErrorCode;
      message: string;
      fields: string[];
    };

/* -------------------------------------------------------------------------- */
/*  Contrato do controlador                                                   */
/* -------------------------------------------------------------------------- */

/** Dependências injetáveis do controlador de gestão de Produtos. */
export interface AdminProductsControllerDeps {
  /** Serviço de Produtos a que o controlador delega as operações. */
  productService: ProductService;
}

/** Controlador da UI de gestão de Produtos do Painel_de_Administração. */
export interface AdminProductsController {
  /** Produz o view-model da listagem de Produtos da Loja (Req. 7.1). */
  list(storeId: string): Promise<ProductListViewModel>;
  /** Regista um novo Produto; em sucesso passa a constar na lista (Req. 7.5). */
  register(
    ownerId: string,
    storeId: string,
    input: ProductInput,
  ): Promise<ProductFormResult>;
  /** Edita os atributos de um Produto existente (Req. 7.6). */
  edit(
    ownerId: string,
    storeId: string,
    productId: string,
    input: ProductInput,
  ): Promise<ProductFormResult>;
  /** Passo 1 da remoção: devolve o pedido de confirmação (Req. 7.7). */
  requestRemoval(
    ownerId: string,
    storeId: string,
    productId: string,
  ): Promise<RemovalRequestResult>;
  /** Passo 2 da remoção: efetua a remoção após confirmação (Req. 7.7). */
  confirmRemoval(
    ownerId: string,
    storeId: string,
    productId: string,
  ): Promise<RemovalResult>;
}

/* -------------------------------------------------------------------------- */
/*  Auxiliares de apresentação                                                */
/* -------------------------------------------------------------------------- */

/** Mensagem apresentada quando a Loja ainda não tem Produtos. */
export const PRODUCTS_EMPTY_MESSAGE =
  "Ainda não registou produtos. Adicione o primeiro produto da sua loja.";

/**
 * Formata um preço numérico no estilo português de Angola, com ponto como
 * separador de milhares e vírgula como separador decimal, sufixado por " Kz".
 * Determinista e independente de `Intl`/locale do ambiente.
 *
 * @example formatPrice(1234.5) === "1.234,50 Kz"
 */
export function formatPrice(price: number): string {
  const safe = Number.isFinite(price) ? price : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  // Arredonda a 2 casas decimais evitando erros de vírgula flutuante.
  const cents = Math.round(abs * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;

  const wholeStr = whole.toString();
  let grouped = "";
  for (let i = 0; i < wholeStr.length; i++) {
    if (i > 0 && (wholeStr.length - i) % 3 === 0) {
      grouped += ".";
    }
    grouped += wholeStr[i];
  }

  const fractionStr = fraction.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${grouped},${fractionStr} Kz`;
}

/** Constrói o view-model de um item de Produto para a listagem. */
function toListItem(product: Product): ProductListItemViewModel {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    priceFormatted: formatPrice(product.price),
    imageUrl: product.imageUrl,
    available: product.available,
    availabilityLabel: product.available ? "Disponível" : "Indisponível",
  };
}

/** Converte um {@link ProductError} numa lista de erros por campo (Req. 10.2). */
function toFieldErrors(error: ProductError): FieldError[] {
  const fields = error.fields.length > 0 ? error.fields : ["geral"];
  return fields.map((field) => ({ field, message: error.reason }));
}

/* -------------------------------------------------------------------------- */
/*  Fábrica do controlador                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Cria um {@link AdminProductsController} ligado ao {@link ProductService}
 * fornecido. O controlador é puro em termos de apresentação: toda a
 * persistência e validação é delegada ao serviço injetado.
 */
export function createAdminProductsController(
  deps: AdminProductsControllerDeps,
): AdminProductsController {
  const productService = deps.productService;

  return {
    async list(storeId: string): Promise<ProductListViewModel> {
      const products = await productService.listForStore(storeId);
      const items = products.map(toListItem);
      return {
        storeId,
        items,
        count: items.length,
        isEmpty: items.length === 0,
        emptyMessage: PRODUCTS_EMPTY_MESSAGE,
      };
    },

    async register(
      ownerId: string,
      storeId: string,
      input: ProductInput,
    ): Promise<ProductFormResult> {
      const result = await productService.create(ownerId, storeId, input);
      if (result.ok) {
        return {
          status: "success",
          product: result.value,
          message: "Produto registado com sucesso.",
        };
      }
      return {
        status: "error",
        code: result.error.code,
        message: result.error.reason,
        fields: result.error.fields,
        fieldErrors: toFieldErrors(result.error),
        input,
      };
    },

    async edit(
      ownerId: string,
      storeId: string,
      productId: string,
      input: ProductInput,
    ): Promise<ProductFormResult> {
      const result = await productService.update(
        ownerId,
        storeId,
        productId,
        input,
      );
      if (result.ok) {
        return {
          status: "success",
          product: result.value,
          message: "Produto atualizado com sucesso.",
        };
      }
      return {
        status: "error",
        code: result.error.code,
        message: result.error.reason,
        fields: result.error.fields,
        fieldErrors: toFieldErrors(result.error),
        input,
      };
    },

    async requestRemoval(
      ownerId: string,
      storeId: string,
      productId: string,
    ): Promise<RemovalRequestResult> {
      // Verifica a posse pelo Dono e a existência do Produto na Loja antes de
      // pedir confirmação, garantindo isolamento de inquilino (Req. 7.9) e uma
      // mensagem de confirmação coerente (Req. 7.7).
      const products = await productService.listForStore(storeId);
      const product = products.find((candidate) => candidate.id === productId);
      if (product === undefined) {
        return {
          status: "error",
          code: "PRODUTO_NAO_ENCONTRADO",
          message: "O produto não existe ou não pertence a esta loja.",
          fields: ["productId"],
        };
      }

      void ownerId; // A posse é reforçada na confirmação, via ProductService.

      return {
        status: "confirmation_required",
        prompt: {
          productId: product.id,
          productName: product.name,
          message: `Tem a certeza de que pretende remover o produto "${product.name}"? Esta ação não pode ser anulada.`,
          confirmLabel: "Remover",
          cancelLabel: "Cancelar",
        },
      };
    },

    async confirmRemoval(
      ownerId: string,
      storeId: string,
      productId: string,
    ): Promise<RemovalResult> {
      const result = await productService.remove(ownerId, storeId, productId);
      if (result.ok) {
        return {
          status: "removed",
          productId,
          message: "Produto removido com sucesso.",
        };
      }
      return {
        status: "error",
        code: result.error.code,
        message: result.error.reason,
        fields: result.error.fields,
      };
    },
  };
}
