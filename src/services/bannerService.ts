/**
 * Serviço de Banners (BannerService) — ver design.md →
 * "Components and Interfaces → 6. Serviço de Banners (BannerService)".
 *
 * Responsável pela gestão de Banners promocionais de uma Loja:
 *  - `add`: adiciona um Banner através do carregamento de uma imagem, impondo
 *    o máximo de 10 Banners por Loja (Requisitos 8.1, 8.4). A imagem é validada
 *    e armazenada através do {@link FileService} com a política de Banner
 *    (`BANNER_POLICY`). A `position` é atribuída pela ordem de adição
 *    (estritamente crescente, Requisito 8.5). Uma falha de validação ou de
 *    carregamento nunca altera os Banners já existentes (Requisito 8.6).
 *  - `remove`: remove um Banner existente da Loja (Requisito 8.7).
 *  - `listOrdered`: devolve os Banners pela ordem de adição (Requisito 8.5).
 *
 * Garantia central de tolerância a falhas (Requisito 8.6): o serviço só cria
 * um novo Banner no repositório depois de a validação e o armazenamento da
 * imagem terem sido concluídos com sucesso. Em qualquer rejeição (limite
 * atingido, ficheiro inválido ou falha de carregamento) nenhuma escrita é
 * efetuada, pelo que o conjunto de Banners existentes permanece inalterado.
 *
 * As dependências (repositório de Banners, serviço de ficheiros, gerador de
 * identificadores e relógio) são injetáveis para manter o serviço testável e
 * independente da infraestrutura.
 */

import { randomUUID } from "node:crypto";
import type { Banner } from "../models/index.js";
import { type Result, ok, err } from "../models/index.js";
import type { BannerRepository } from "./bannerRepository.js";
import {
  type FileService,
  type FileError,
  type UploadedFile,
  BANNER_POLICY,
} from "./fileService.js";

/** Número máximo de Banners associados a uma Loja (Requisitos 8.1, 8.4). */
export const MAX_BANNERS_PER_STORE = 10;

/** Código de erro estável do BannerService, para mapeamento na UI. */
export type BannerErrorCode =
  | "MAXIMO_BANNERS_ATINGIDO"
  | "FICHEIRO_INVALIDO"
  | "FALHA_CARREGAMENTO"
  | "BANNER_INEXISTENTE";

/**
 * Erro do BannerService devolvido em caso de limite atingido, ficheiro
 * inválido, falha de carregamento ou Banner inexistente. Inclui sempre um
 * `reason` em português para apresentação ao Dono_da_Loja.
 */
export interface BannerError {
  code: BannerErrorCode;
  /** Motivo legível (em português) para apresentação ao utilizador. */
  reason: string;
  /** Erro detalhado de validação do ficheiro (quando `code` é FICHEIRO_INVALIDO). */
  fileError?: FileError;
}

/** Dependências configuráveis do {@link BannerService}. */
export interface BannerServiceDeps {
  /** Repositório de Banners (delimitado por Loja). */
  bannerRepository: BannerRepository;
  /** Serviço de ficheiros para validar e armazenar a imagem do Banner. */
  fileService: FileService;
  /** Gerador de identificadores de Banner. Por omissão usa `randomUUID`. */
  generateId?: () => string;
  /** Relógio injetável para obter o instante atual (ISO 8601). */
  now?: () => string;
  /**
   * Verificador opcional de posse: confirma que a Loja `storeId` pertence ao
   * Dono `ownerId` (isolamento de inquilino). Quando omitido, o isolamento é
   * garantido pela delimitação por `storeId` do repositório.
   */
  verifyOwnership?: (ownerId: string, storeId: string) => Promise<boolean>;
}

/** Contrato do Serviço de Banners (design.md → secção 6). */
export interface BannerService {
  /**
   * Adiciona um Banner à Loja `storeId` a partir de `file`. Impõe o máximo de
   * 10 Banners por Loja: a 11.ª adição é rejeitada com mensagem, sem alterar
   * os Banners existentes (Requisitos 8.1, 8.4). A imagem é validada e
   * armazenada via FileService (`BANNER_POLICY`); em falha, nada é persistido
   * e os Banners existentes permanecem inalterados (Requisitos 8.3, 8.6). A
   * `position` reflete a ordem de adição, estritamente crescente (Req. 8.5).
   */
  add(ownerId: string, storeId: string, file: UploadedFile): Promise<Result<Banner, BannerError>>;
  /**
   * Remove o Banner `bannerId` da Loja `storeId`. Rejeita se o Banner não
   * existir ou não pertencer à Loja (Requisito 8.7).
   */
  remove(ownerId: string, storeId: string, bannerId: string): Promise<Result<void, BannerError>>;
  /** Lista os Banners da Loja `storeId` por ordem de adição (Requisito 8.5). */
  listOrdered(storeId: string): Promise<Banner[]>;
}

/**
 * Cria uma instância do BannerService com as dependências fornecidas.
 *
 * @param deps Dependências do serviço (repositório de Banners e serviço de
 *             ficheiros obrigatórios; gerador de ids, relógio e verificador de
 *             posse opcionais com implementações por omissão).
 */
export function createBannerService(deps: BannerServiceDeps): BannerService {
  const bannerRepository = deps.bannerRepository;
  const fileService = deps.fileService;
  const generateId = deps.generateId ?? (() => randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());
  const verifyOwnership = deps.verifyOwnership;

  /** Confirma a posse da Loja quando um verificador foi fornecido. */
  async function ensureOwnership(ownerId: string, storeId: string): Promise<boolean> {
    if (!verifyOwnership) {
      return true;
    }
    return verifyOwnership(ownerId, storeId);
  }

  /**
   * Calcula a próxima `position` (ordem de adição) para a Loja `storeId`. A
   * posição é estritamente crescente: maior posição existente + 1, ou 1 quando
   * não existe qualquer Banner. Usar o máximo (e não a contagem) garante que,
   * após remoções, novas adições mantêm uma ordem coerente com a adição.
   */
  function nextPosition(existing: Banner[]): number {
    if (existing.length === 0) {
      return 1;
    }
    const maxPosition = existing.reduce((max, banner) => Math.max(max, banner.position), 0);
    return maxPosition + 1;
  }

  return {
    async add(
      ownerId: string,
      storeId: string,
      file: UploadedFile,
    ): Promise<Result<Banner, BannerError>> {
      // Isolamento de inquilino: a Loja tem de pertencer ao Dono autenticado.
      const owns = await ensureOwnership(ownerId, storeId);
      if (!owns) {
        return err({
          code: "BANNER_INEXISTENTE",
          reason: "A Loja não existe ou não pertence a este Dono.",
        });
      }

      // Limite de 10 Banners por Loja (Requisitos 8.1, 8.4). Verificado antes
      // de validar/armazenar para não efetuar trabalho desnecessário e para
      // garantir que a rejeição não altera os Banners existentes.
      const count = await bannerRepository.countByStore(storeId);
      if (count >= MAX_BANNERS_PER_STORE) {
        return err({
          code: "MAXIMO_BANNERS_ATINGIDO",
          reason: `Foi atingido o número máximo de ${MAX_BANNERS_PER_STORE} Banners por Loja.`,
        });
      }

      // Validação do ficheiro pela política de Banner (Requisitos 8.2, 8.3).
      // Em caso de rejeição, nada é persistido (Requisito 8.6).
      const validation = fileService.validate(file, BANNER_POLICY);
      if (!validation.ok) {
        return err({
          code: "FICHEIRO_INVALIDO",
          reason: validation.error.message,
          fileError: validation.error,
        });
      }

      // Armazenamento da imagem. Uma falha de carregamento não pode alterar os
      // Banners existentes (Requisito 8.6): o Banner só é criado após sucesso.
      let imageUrl: string;
      try {
        const stored = await fileService.store(storeId, "banner", validation.value);
        imageUrl = stored.url;
      } catch {
        return err({
          code: "FALHA_CARREGAMENTO",
          reason:
            "O carregamento do Banner falhou. Os Banners existentes não foram alterados. Tente novamente.",
        });
      }

      // Posição por ordem de adição (Requisito 8.5).
      const existing = await bannerRepository.listByStore(storeId);
      const banner: Banner = {
        id: generateId(),
        storeId,
        imageUrl,
        position: nextPosition(existing),
        createdAt: now(),
      };

      const created = await bannerRepository.create(storeId, banner);
      return ok(created);
    },

    async remove(
      ownerId: string,
      storeId: string,
      bannerId: string,
    ): Promise<Result<void, BannerError>> {
      const owns = await ensureOwnership(ownerId, storeId);
      if (!owns) {
        return err({
          code: "BANNER_INEXISTENTE",
          reason: "A Loja não existe ou não pertence a este Dono.",
        });
      }

      const removed = await bannerRepository.remove(storeId, bannerId);
      if (!removed) {
        return err({
          code: "BANNER_INEXISTENTE",
          reason: "O Banner não existe ou não pertence a esta Loja.",
        });
      }
      return ok(undefined);
    },

    async listOrdered(storeId: string): Promise<Banner[]> {
      // O repositório já devolve os Banners ordenados por `position` (ordem de
      // adição), de forma estritamente crescente por Loja (Requisito 8.5).
      return bannerRepository.listByStore(storeId);
    },
  };
}
