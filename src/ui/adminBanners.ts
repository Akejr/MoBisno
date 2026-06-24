/**
 * UI de Gestão de Banners do Painel_de_Administração (controlador / view-model).
 *
 * Este módulo implementa, de forma agnóstica a qualquer framework de UI, a
 * lógica de apresentação para a gestão de Banners promocionais de uma Loja,
 * ligada ao {@link BannerService}. Expõe operações deterministas e testáveis:
 *
 *  - `list`: produz o view-model dos Banners da Loja pela ordem de adição
 *    (`listOrdered`), incluindo quantos Banners ainda podem ser adicionados
 *    antes de atingir o limite de {@link MAX_BANNERS_PER_STORE} (Requisito 8.1).
 *  - `add`: submete um {@link UploadedFile}; em sucesso o Banner é adicionado e
 *    passa a constar na listagem; quando o limite de 10 é atingido devolve a
 *    mensagem em português a indicar que foi atingido o número máximo de
 *    Banners (Requisito 8.4); em erro de validação/carregamento devolve a
 *    mensagem correspondente, sem alterar os Banners existentes.
 *  - `remove`: remove um Banner através do {@link BannerService}, refletindo que
 *    deixa de ser exibido na Loja publicada (Requisito 8.7).
 *
 * Todo o texto destinado ao Dono_da_Loja é apresentado em português
 * (Requisito 10.3). O controlador não toca em infraestrutura: recebe um
 * {@link BannerService} injetado, o que o torna determinista e fácil de testar
 * isoladamente.
 */

import type { Banner } from "../models/index.js";
import type { UploadedFile } from "../services/fileService.js";
import {
  type BannerService,
  type BannerError,
  type BannerErrorCode,
  MAX_BANNERS_PER_STORE,
} from "../services/bannerService.js";

/* -------------------------------------------------------------------------- */
/*  View-models de listagem                                                   */
/* -------------------------------------------------------------------------- */

/** Item individual da listagem de Banners, pronto para apresentação. */
export interface BannerListItemViewModel {
  id: string;
  imageUrl: string;
  /** Posição de adição (estritamente crescente) atribuída pelo serviço. */
  position: number;
  /** Ordem de exibição (1-based) na listagem apresentada (Requisito 8.5). */
  displayOrder: number;
}

/** View-model da listagem completa de Banners de uma Loja. */
export interface BannerListViewModel {
  storeId: string;
  /** Banners pela ordem de adição (Requisito 8.5). */
  items: BannerListItemViewModel[];
  /** Número de Banners atualmente associados à Loja. */
  count: number;
  /** Número máximo de Banners permitidos por Loja (Requisito 8.1). */
  maxBanners: number;
  /** Quantos Banners ainda podem ser adicionados antes do limite (Req. 8.1). */
  remaining: number;
  /** Verdadeiro quando o limite de Banners foi atingido (Requisito 8.4). */
  isFull: boolean;
  /** Verdadeiro quando a Loja ainda não tem Banners. */
  isEmpty: boolean;
  /** Mensagem em português a apresentar quando a listagem está vazia. */
  emptyMessage: string;
}

/* -------------------------------------------------------------------------- */
/*  Resultados de adição                                                      */
/* -------------------------------------------------------------------------- */

/** Resultado da adição de um Banner. */
export type BannerAddResult =
  | {
      status: "added";
      /** Banner criado. */
      banner: Banner;
      /** Mensagem de confirmação em português. */
      message: string;
    }
  | {
      status: "error";
      /** Código de erro estável, para lógica de UI. */
      code: BannerErrorCode;
      /** Motivo legível em português. */
      message: string;
    };

/* -------------------------------------------------------------------------- */
/*  Resultados de remoção                                                     */
/* -------------------------------------------------------------------------- */

/** Resultado da remoção de um Banner (Requisito 8.7). */
export type BannerRemovalResult =
  | {
      status: "removed";
      bannerId: string;
      /** Mensagem de confirmação em português. */
      message: string;
    }
  | {
      status: "error";
      code: BannerErrorCode;
      message: string;
    };

/* -------------------------------------------------------------------------- */
/*  Contrato do controlador                                                   */
/* -------------------------------------------------------------------------- */

/** Dependências injetáveis do controlador de gestão de Banners. */
export interface AdminBannersControllerDeps {
  /** Serviço de Banners a que o controlador delega as operações. */
  bannerService: BannerService;
}

/** Controlador da UI de gestão de Banners do Painel_de_Administração. */
export interface AdminBannersController {
  /**
   * Produz o view-model da listagem de Banners da Loja, pela ordem de adição,
   * incluindo quantos Banners ainda podem ser adicionados (Requisitos 8.1, 8.5).
   */
  list(storeId: string): Promise<BannerListViewModel>;
  /**
   * Adiciona um Banner à Loja a partir de `file`; em sucesso passa a constar na
   * listagem; quando o limite é atingido devolve a mensagem de máximo atingido
   * (Requisito 8.4); em erro de validação/carregamento devolve a mensagem
   * correspondente (Requisitos 8.1, 8.4).
   */
  add(
    ownerId: string,
    storeId: string,
    file: UploadedFile,
  ): Promise<BannerAddResult>;
  /** Remove um Banner; deixa de ser exibido na Loja publicada (Requisito 8.7). */
  remove(
    ownerId: string,
    storeId: string,
    bannerId: string,
  ): Promise<BannerRemovalResult>;
}

/* -------------------------------------------------------------------------- */
/*  Auxiliares de apresentação                                                */
/* -------------------------------------------------------------------------- */

/** Mensagem apresentada quando a Loja ainda não tem Banners. */
export const BANNERS_EMPTY_MESSAGE =
  "Ainda não adicionou banners. Adicione o primeiro banner promocional da sua loja.";

/** Mensagem de confirmação da adição de um Banner. */
export const BANNER_ADDED_MESSAGE = "Banner adicionado com sucesso.";

/** Mensagem de confirmação da remoção de um Banner (Requisito 8.7). */
export const BANNER_REMOVED_MESSAGE = "Banner removido com sucesso.";

/** Constrói o view-model de um item de Banner para a listagem. */
function toListItem(banner: Banner, index: number): BannerListItemViewModel {
  return {
    id: banner.id,
    imageUrl: banner.imageUrl,
    position: banner.position,
    displayOrder: index + 1,
  };
}

/* -------------------------------------------------------------------------- */
/*  Fábrica do controlador                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Cria um {@link AdminBannersController} ligado ao {@link BannerService}
 * fornecido. O controlador é puro em termos de apresentação: toda a
 * persistência e validação é delegada ao serviço injetado.
 */
export function createAdminBannersController(
  deps: AdminBannersControllerDeps,
): AdminBannersController {
  const bannerService = deps.bannerService;

  return {
    async list(storeId: string): Promise<BannerListViewModel> {
      const banners = await bannerService.listOrdered(storeId);
      const items = banners.map(toListItem);
      const count = items.length;
      // Nunca devolver um valor negativo de "restantes" caso, por algum motivo,
      // a contagem ultrapasse o limite.
      const remaining = Math.max(0, MAX_BANNERS_PER_STORE - count);
      return {
        storeId,
        items,
        count,
        maxBanners: MAX_BANNERS_PER_STORE,
        remaining,
        isFull: count >= MAX_BANNERS_PER_STORE,
        isEmpty: count === 0,
        emptyMessage: BANNERS_EMPTY_MESSAGE,
      };
    },

    async add(
      ownerId: string,
      storeId: string,
      file: UploadedFile,
    ): Promise<BannerAddResult> {
      const result = await bannerService.add(ownerId, storeId, file);
      if (result.ok) {
        return {
          status: "added",
          banner: result.value,
          message: BANNER_ADDED_MESSAGE,
        };
      }
      // Mensagens em português provêm do BannerError (limite atingido,
      // ficheiro inválido, falha de carregamento) — Requisitos 8.1, 8.4.
      const error: BannerError = result.error;
      return {
        status: "error",
        code: error.code,
        message: error.reason,
      };
    },

    async remove(
      ownerId: string,
      storeId: string,
      bannerId: string,
    ): Promise<BannerRemovalResult> {
      const result = await bannerService.remove(ownerId, storeId, bannerId);
      if (result.ok) {
        return {
          status: "removed",
          bannerId,
          message: BANNER_REMOVED_MESSAGE,
        };
      }
      return {
        status: "error",
        code: result.error.code,
        message: result.error.reason,
      };
    },
  };
}
