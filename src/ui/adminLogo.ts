/**
 * UI de gestão do Logótipo no Painel_de_Administração (Tarefa 13.1).
 *
 * Este módulo expõe um controlador/view-model agnóstico de framework para o
 * carregamento do Logótipo da Loja. É determinístico e testável de forma
 * isolada: não toca no DOM nem em APIs de browser, recebendo um
 * {@link UploadedFile} já lido e devolvendo um resultado de view-model que a
 * camada de apresentação mapeia para mensagens em português (Requisito 10.3).
 *
 * Comportamento (ver design.md → "4. Serviço de Ficheiros" e Requisito 6):
 *  - O controlador valida o ficheiro carregado através do {@link FileService}
 *    com a política {@link LOGO_POLICY} (PNG/JPEG/SVG, 1 KB–5 MB).
 *  - Em caso de sucesso, persiste o ficheiro como Logótipo da Loja e devolve
 *    uma mensagem de confirmação da gravação (Requisito 6.2).
 *  - Em caso de rejeição (formato não suportado ou tamanho acima do máximo,
 *    Requisito 6.3; ficheiro vazio/corrompido, Requisito 6.4), devolve a
 *    mensagem de rejeição correspondente e NÃO persiste nada — o Logótipo
 *    anterior permanece inalterado (Requisitos 6.3, 6.4).
 *
 * Garantia de não-alteração em rejeição: a persistência só ocorre depois de
 * `validate` devolver `Ok`. Quando `validate` devolve `Err`, o controlador
 * regressa imediatamente sem invocar `store` nem o repositório de Assets, pelo
 * que o Logótipo anterior nunca é tocado.
 */

import { isErr } from "../models/index.js";
import {
  LOGO_POLICY,
  type FileError,
  type FileService,
  type StoredAsset,
  type UploadedFile,
} from "../services/fileService.js";
import type { AssetRepository } from "../services/assetRepository.js";

/** Tipo de recurso do Logótipo no object storage. */
const LOGO_ASSET_KIND = "logo" as const;

/** Mensagem de confirmação de gravação do Logótipo (Requisito 6.2). */
export const LOGO_SAVED_MESSAGE = "Logótipo guardado com sucesso.";

/**
 * Resultado de sucesso do carregamento do Logótipo: o ficheiro foi validado e
 * guardado como Logótipo da Loja (Requisito 6.2).
 */
export interface LogoUploadConfirmation {
  status: "saved";
  /** Asset persistido (referência por URL ao Logótipo guardado). */
  asset: StoredAsset;
  /** Mensagem de confirmação em português para apresentação ao Dono_da_Loja. */
  message: string;
}

/**
 * Resultado de rejeição do carregamento do Logótipo: o ficheiro foi recusado e
 * nada foi persistido; o Logótipo anterior mantém-se inalterado
 * (Requisitos 6.3, 6.4).
 */
export interface LogoUploadRejection {
  status: "rejected";
  /** Detalhe estruturado do motivo da rejeição (ver {@link FileError}). */
  error: FileError;
  /**
   * Mensagem de rejeição em português. Indica os formatos e o tamanho máximo
   * aceites (Requisito 6.3) ou que o ficheiro é inválido/corrompido
   * (Requisito 6.4), conforme o motivo.
   */
  message: string;
}

/** View-model devolvido pelo controlador após uma tentativa de carregamento. */
export type LogoUploadResult = LogoUploadConfirmation | LogoUploadRejection;

/** Type guard: o carregamento foi concluído com sucesso. */
export function isLogoSaved(result: LogoUploadResult): result is LogoUploadConfirmation {
  return result.status === "saved";
}

/** Type guard: o carregamento foi rejeitado. */
export function isLogoRejected(result: LogoUploadResult): result is LogoUploadRejection {
  return result.status === "rejected";
}

/** Dependências e configuração do {@link AdminLogoController}. */
export interface AdminLogoControllerOptions {
  /** Loja cujo Logótipo está a ser gerido (isolamento de inquilino). */
  storeId: string;
  /** Serviço de Ficheiros injetável (validação + armazenamento). */
  fileService: FileService;
  /**
   * Repositório de Assets opcional. Quando fornecido, o Logótipo guardado é
   * registado como o Logótipo atual da Loja (substituindo o anterior), mantendo
   * no máximo um Logótipo por Loja. Em caso de rejeição não é tocado.
   */
  assetRepository?: AssetRepository;
}

/** Controlador da UI de gestão do Logótipo. */
export interface AdminLogoController {
  /**
   * Processa o carregamento de um ficheiro como Logótipo da Loja: valida-o com
   * a {@link LOGO_POLICY}; em caso de sucesso guarda-o e devolve confirmação;
   * em caso de rejeição devolve a mensagem de erro sem persistir nada.
   */
  uploadLogo(file: UploadedFile): Promise<LogoUploadResult>;
}

/**
 * Cria um {@link AdminLogoController} ligado ao {@link FileService} fornecido.
 *
 * @param options dependências injetáveis e identificação da Loja.
 */
export function createAdminLogoController(
  options: AdminLogoControllerOptions,
): AdminLogoController {
  const { storeId, fileService, assetRepository } = options;

  return {
    async uploadLogo(file: UploadedFile): Promise<LogoUploadResult> {
      // 1. Validação contra a política do Logótipo (Requisitos 6.2, 6.3, 6.4).
      const validation = fileService.validate(file, LOGO_POLICY);

      // 2. Rejeição: não persistir, manter o Logótipo anterior inalterado
      //    (Requisitos 6.3, 6.4). A mensagem em português provém do FileService.
      if (isErr(validation)) {
        return {
          status: "rejected",
          error: validation.error,
          message: validation.error.message,
        };
      }

      // 3. Sucesso: armazenar o ficheiro validado como Logótipo da Loja.
      const asset = await fileService.store(storeId, LOGO_ASSET_KIND, validation.value);

      // 4. Registar como Logótipo atual da Loja, se houver repositório
      //    (substitui o anterior, mantendo unicidade por Loja).
      const currentLogo = assetRepository
        ? await assetRepository.upsertLogo(storeId, asset)
        : asset;

      // 5. Mensagem de confirmação da gravação (Requisito 6.2).
      return {
        status: "saved",
        asset: currentLogo,
        message: LOGO_SAVED_MESSAGE,
      };
    },
  };
}
