/**
 * Serviço de Ficheiros (FileService) — validação e armazenamento de recursos
 * de imagem (Logótipo, imagem de Produto e Banner) (ver design.md → "4.
 * Serviço de Ficheiros (FileService)").
 *
 * Responsabilidades:
 *  - `validate`: valida um ficheiro carregado contra uma política de recurso
 *    (formatos permitidos, limites mínimo/máximo de tamanho e rejeição de
 *    ficheiros vazios ou corrompidos). A deteção de formato baseia-se no
 *    conteúdo (assinatura/magic bytes) e não apenas na extensão, para evitar
 *    uploads enganosos (Requisitos 6.2, 6.3, 6.4, 7.4, 8.2, 8.3).
 *  - `store`: persiste um ficheiro já validado num object storage abstraído
 *    por um backend injetável (com um backend em memória por omissão).
 *
 * Garantia central: ficheiros rejeitados nunca são persistidos. `validate` é
 * uma função pura sem efeitos colaterais; `store` apenas aceita um `ValidFile`
 * (produzido por `validate`), pelo que um ficheiro inválido não pode chegar à
 * persistência. Assim, o recurso anterior permanece inalterado em caso de
 * rejeição (Requisitos 6.3, 6.4, 7.4, 8.3).
 */

import type { Asset, AssetKind, ImageFormat } from "../models/index.js";
import { type Result, ok, err } from "../models/index.js";

/** Tamanho máximo comum aos recursos: 5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Tamanho mínimo do Logótipo: 1 KB. */
export const LOGO_MIN_BYTES = 1024;

/**
 * Ficheiro carregado pelo Dono_da_Loja, ainda por validar. O `fileName` e o
 * `declaredFormat` (derivados da extensão/tipo MIME enviado) são meramente
 * informativos: a validação de formato baseia-se sempre no `content`.
 */
export interface UploadedFile {
  /** Conteúdo bruto do ficheiro. */
  content: Uint8Array;
  /** Nome do ficheiro original (opcional, informativo). */
  fileName?: string;
  /** Formato declarado pelo cliente (opcional, informativo). */
  declaredFormat?: string;
}

/**
 * Política de validação de um recurso. Define os formatos aceites e os limites
 * de tamanho em bytes (ver tabela de políticas em design.md → secção 4).
 */
export interface FilePolicy {
  /** Formatos de imagem aceites, ex.: ["png", "jpeg", "svg"]. */
  allowedFormats: readonly ImageFormat[];
  /** Tamanho mínimo em bytes (0 quando não há mínimo). */
  minBytes: number;
  /** Tamanho máximo em bytes. */
  maxBytes: number;
}

/** Política do Logótipo: PNG, JPEG, SVG, WebP, 1 KB–5 MB (Requisito 6.2). */
export const LOGO_POLICY: FilePolicy = {
  allowedFormats: ["png", "jpeg", "svg", "webp"],
  minBytes: LOGO_MIN_BYTES,
  maxBytes: MAX_FILE_BYTES,
};

/** Política da imagem de Produto: PNG, JPEG, SVG, WebP, até 5 MB (Requisito 7.1, 7.4). */
export const PRODUCT_POLICY: FilePolicy = {
  allowedFormats: ["png", "jpeg", "svg", "webp"],
  minBytes: 0,
  maxBytes: MAX_FILE_BYTES,
};

/** Política do Banner: PNG, JPEG, WebP, até 5 MB (Requisitos 8.2, 8.3). */
export const BANNER_POLICY: FilePolicy = {
  allowedFormats: ["png", "jpeg", "webp"],
  minBytes: 0,
  maxBytes: MAX_FILE_BYTES,
};

/** Ficheiro validado: o formato foi confirmado por conteúdo e o tamanho aceite. */
export interface ValidFile {
  /** Conteúdo bruto validado. */
  content: Uint8Array;
  /** Formato detetado a partir do conteúdo. */
  format: ImageFormat;
  /** Tamanho em bytes (igual a `content.length`). */
  sizeBytes: number;
  /** Nome do ficheiro original (opcional). */
  fileName?: string;
}

/** Recurso persistido no object storage, referenciado por URL. */
export type StoredAsset = Asset;

/**
 * Motivos de rejeição de um ficheiro (união discriminada). Cada caso inclui
 * uma `message` em português para apresentação junto ao campo.
 */
export type FileError =
  | { kind: "empty"; message: string }
  | { kind: "corrupted"; message: string }
  | {
      kind: "unsupported_format";
      detectedFormat: ImageFormat | null;
      allowedFormats: readonly ImageFormat[];
      message: string;
    }
  | { kind: "too_small"; sizeBytes: number; minBytes: number; message: string }
  | { kind: "too_large"; sizeBytes: number; maxBytes: number; message: string };

/**
 * Backend de object storage injetável. `put` persiste o conteúdo sob uma chave
 * e devolve o URL público do recurso.
 */
export interface StorageBackend {
  put(key: string, content: Uint8Array, contentType: string): Promise<string>;
}

/** Opções de configuração do {@link FileService}. */
export interface FileServiceOptions {
  /** Backend de object storage. Por omissão usa um backend em memória. */
  storage?: StorageBackend;
  /** Gerador de identificadores de Asset. Por omissão usa um contador interno. */
  generateId?: () => string;
}

/** Contrato do Serviço de Ficheiros (ver design.md → secção 4). */
export interface FileService {
  /**
   * Valida `file` contra `policy`. Devolve `Ok<ValidFile>` se o formato
   * (detetado por conteúdo) pertencer aos formatos permitidos e o tamanho
   * estiver dentro dos limites, e o ficheiro não estiver vazio/corrompido.
   * Caso contrário devolve `Err<FileError>` sem qualquer efeito colateral.
   */
  validate(file: UploadedFile, policy: FilePolicy): Result<ValidFile, FileError>;
  /** Persiste um ficheiro já validado no object storage e devolve o Asset. */
  store(storeId: string, kind: AssetKind, file: ValidFile): Promise<StoredAsset>;
}

/** Assinatura PNG: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Assinatura JPEG (SOI + marcador): 0xFF 0xD8 0xFF. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** Assinatura WebP: bytes 0–3 "RIFF" e bytes 8–11 "WEBP". */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

/** Verifica se `content` contém `signature` a partir de `offset`. */
function hasSignatureAt(content: Uint8Array, signature: readonly number[], offset: number): boolean {
  if (content.length < offset + signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i++) {
    if (content[offset + i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

/** Deteta o formato WebP pelo contentor RIFF (RIFF....WEBP). */
function isWebp(content: Uint8Array): boolean {
  return hasSignatureAt(content, RIFF_SIGNATURE, 0) && hasSignatureAt(content, WEBP_TAG, 8);
}

/** Verifica se `content` começa exatamente pela sequência de bytes `signature`. */
function hasSignature(content: Uint8Array, signature: readonly number[]): boolean {
  if (content.length < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i++) {
    if (content[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Deteta se o conteúdo é um SVG. O SVG é baseado em texto: após remoção de um
 * eventual BOM e de espaços iniciais, o documento começa por `<svg` ou por uma
 * declaração XML (`<?xml ...`) que contém um elemento `<svg`.
 */
function isSvg(content: Uint8Array): boolean {
  // Decodifica um prefixo razoável como UTF-8 para inspeção textual.
  const prefixBytes = content.subarray(0, Math.min(content.length, 1024));
  let text = new TextDecoder("utf-8", { fatal: false }).decode(prefixBytes);
  // Remove BOM e espaços em branco iniciais.
  text = text.replace(/^\uFEFF/, "").trimStart();
  const lower = text.toLowerCase();
  if (lower.startsWith("<svg")) {
    return true;
  }
  if (lower.startsWith("<?xml")) {
    // Declaração XML seguida (eventualmente após comentários/doctype) de <svg.
    return lower.includes("<svg");
  }
  return false;
}

/**
 * Deteta o formato de imagem a partir do conteúdo (magic bytes / assinatura
 * textual). Devolve `null` se o conteúdo não corresponder a nenhum formato
 * conhecido (considerado corrompido).
 */
export function detectFormat(content: Uint8Array): ImageFormat | null {
  if (hasSignature(content, PNG_SIGNATURE)) {
    return "png";
  }
  if (hasSignature(content, JPEG_SIGNATURE)) {
    return "jpeg";
  }
  if (isWebp(content)) {
    return "webp";
  }
  if (isSvg(content)) {
    return "svg";
  }
  return null;
}

/** Constrói um {@link StorageBackend} em memória (backend por omissão). */
export function createInMemoryStorageBackend(): StorageBackend {
  const objects = new Map<string, { content: Uint8Array; contentType: string }>();
  return {
    async put(key: string, content: Uint8Array, contentType: string): Promise<string> {
      // Copia o conteúdo para isolar a cópia armazenada de mutações externas.
      objects.set(key, { content: content.slice(), contentType });
      return `memory://mobisno-assets/${key}`;
    },
  };
}

/** Tipo de conteúdo (MIME) correspondente a cada formato de imagem. */
const CONTENT_TYPE_BY_FORMAT: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/** Extensão de ficheiro correspondente a cada formato de imagem. */
const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  svg: "svg",
  webp: "webp",
};

/**
 * Cria uma instância de {@link FileService} com o backend de object storage e
 * o gerador de identificadores injetáveis.
 */
export function createFileService(options: FileServiceOptions = {}): FileService {
  const storage = options.storage ?? createInMemoryStorageBackend();
  let counter = 0;
  const generateId = options.generateId ?? (() => `asset-${++counter}`);

  return {
    validate(file: UploadedFile, policy: FilePolicy): Result<ValidFile, FileError> {
      const content = file.content;
      const sizeBytes = content.length;

      // 1. Ficheiro vazio (Requisito 6.4).
      if (sizeBytes === 0) {
        return err({
          kind: "empty",
          message: "O ficheiro está vazio. Carregue um ficheiro de imagem válido.",
        });
      }

      // 2. Deteção de formato por conteúdo; ausência => corrompido (Requisito 6.4).
      const detectedFormat = detectFormat(content);
      if (detectedFormat === null) {
        return err({
          kind: "corrupted",
          message:
            "O ficheiro é inválido ou está corrompido. Carregue um ficheiro de imagem válido.",
        });
      }

      // 3. Formato não suportado pela política (Requisitos 6.3, 7.4, 8.3).
      if (!policy.allowedFormats.includes(detectedFormat)) {
        return err({
          kind: "unsupported_format",
          detectedFormat,
          allowedFormats: policy.allowedFormats,
          message: `Formato não suportado. Formatos aceites: ${formatList(
            policy.allowedFormats,
          )}.`,
        });
      }

      // 4. Tamanho abaixo do mínimo (Requisito 6.3 — limite inferior do Logótipo).
      if (sizeBytes < policy.minBytes) {
        return err({
          kind: "too_small",
          sizeBytes,
          minBytes: policy.minBytes,
          message: `O ficheiro é demasiado pequeno. Tamanho mínimo: ${describeBytes(
            policy.minBytes,
          )}.`,
        });
      }

      // 5. Tamanho acima do máximo (Requisitos 6.3, 7.4, 8.3).
      if (sizeBytes > policy.maxBytes) {
        return err({
          kind: "too_large",
          sizeBytes,
          maxBytes: policy.maxBytes,
          message: `O ficheiro excede o tamanho máximo de ${describeBytes(policy.maxBytes)}.`,
        });
      }

      return ok({
        content,
        format: detectedFormat,
        sizeBytes,
        fileName: file.fileName,
      });
    },

    async store(storeId: string, kind: AssetKind, file: ValidFile): Promise<StoredAsset> {
      const id = generateId();
      const extension = EXTENSION_BY_FORMAT[file.format];
      const key = `${storeId}/${kind}/${id}.${extension}`;
      const contentType = CONTENT_TYPE_BY_FORMAT[file.format];
      const url = await storage.put(key, file.content, contentType);

      return {
        id,
        storeId,
        kind,
        url,
        format: file.format,
        sizeBytes: file.sizeBytes,
      };
    },
  };
}

/** Apresenta a lista de formatos permitidos em maiúsculas, separados por vírgula. */
function formatList(formats: readonly ImageFormat[]): string {
  return formats.map((f) => f.toUpperCase()).join(", ");
}

/** Descreve um número de bytes de forma legível (KB ou MB) para mensagens. */
function describeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${bytes / (1024 * 1024)} MB`;
  }
  if (bytes >= 1024) {
    return `${bytes / 1024} KB`;
  }
  return `${bytes} bytes`;
}
