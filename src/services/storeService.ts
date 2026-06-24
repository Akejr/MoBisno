/**
 * Serviço de Lojas (StoreService) — ver design.md →
 * "Components and Interfaces → 3. Serviço de Lojas (StoreService)".
 *
 * Responsabilidades desta fase:
 *  - `createStore`: cria uma Loja apenas quando todos os campos obrigatórios
 *    são válidos (nome 2–60 após trim, Tipo_de_Loja, Modelo e Identificador),
 *    associando-a exclusivamente ao Dono_da_Loja autenticado (Requisito 5.2).
 *    Revalida a disponibilidade do subdomínio na confirmação final; se
 *    indisponível, rejeita sem persistir qualquer Loja parcial
 *    (Requisitos 5.4, 5.5). Nomes/identificadores em falta ou inválidos são
 *    identificados, permitindo à UI preservar os dados (Requisitos 5.1, 5.6).
 *  - `setTemplate`: substitui o Modelo previamente associado, mantendo sempre
 *    exatamente um Modelo associado à Loja (Requisito 3.3).
 *  - `getStoreByIdentifier` / `getStoresForOwner`: leituras de Loja, com
 *    isolamento de inquilino nas leituras por Dono (Requisito 5.2).
 *
 * Todas as dependências (repositório de Lojas, normalizador de
 * identificadores, gerador de ids e relógio) são injetáveis para manter o
 * serviço testável e independente da infraestrutura. Os erros previsíveis são
 * devolvidos via `Result<T, E>` (sem exceções), conforme design.md →
 * "Padrão de Resultado".
 */

import { randomUUID } from "node:crypto";
import type {
  Result,
  Store,
  StoreOwner,
  StoreState,
  StoreType,
} from "../models/index.js";
import { ok, err } from "../models/index.js";
import type { IdentifierService } from "./identifierService.js";
import type { StoreRepository } from "./storeRepository.js";

/** Comprimento mínimo do nome da Loja após trim (Requisito 2.7). */
export const MIN_STORE_NAME_LENGTH = 2;

/** Comprimento máximo do nome da Loja após trim (Requisito 2.6). */
export const MAX_STORE_NAME_LENGTH = 60;

/**
 * Conjunto de valores válidos de {@link StoreType} para validação em tempo de
 * execução (os tipos de TypeScript não existem em runtime).
 */
export const VALID_STORE_TYPES: readonly StoreType[] = [
  "Vestuário",
  "Alimentação",
  "Eletrónica",
  "Beleza",
  "Serviços",
  "Outro",
];

/** Estado por omissão de uma Loja recém-criada. */
export const DEFAULT_STORE_STATE: StoreState = "Rascunho";

/** Dados de entrada para a criação de uma Loja (design.md → CreateStoreInput). */
export interface CreateStoreInput {
  /** Nome da Loja (validado para 2–60 caracteres após trim). */
  name: string;
  /** Categoria de negócio selecionada (Requisito 2.3). */
  storeType: StoreType;
  /** Identificador do Modelo selecionado (exatamente um, Requisito 3.3). */
  templateId: string;
  /** Identificador da Loja, já normalizado/validado (Requisito 4.7). */
  identifier: string;
  /** Estado inicial opcional; por omissão "Rascunho". */
  state?: StoreState;
}

/** Código de erro estável da criação de Loja, para mapeamento na UI. */
export type CreateStoreErrorCode =
  | "NOME_EM_FALTA"
  | "NOME_MUITO_CURTO"
  | "NOME_MUITO_LONGO"
  | "TIPO_EM_FALTA"
  | "MODELO_EM_FALTA"
  | "IDENTIFICADOR_EM_FALTA"
  | "IDENTIFICADOR_INVALIDO"
  | "IDENTIFICADOR_INDISPONIVEL"
  | "FALHA_PERSISTENCIA";

/**
 * Erro de criação de Loja. Inclui o motivo legível (em português) e os campos
 * em causa, para que a UI assinale cada campo e preserve os restantes dados
 * (Requisitos 5.6, 10.6).
 */
export interface CreateStoreError {
  code: CreateStoreErrorCode;
  reason: string;
  fields: string[];
}

/** Código de erro estável das restantes operações de Loja. */
export type StoreErrorCode =
  | "LOJA_INEXISTENTE"
  | "MODELO_EM_FALTA"
  | "FALHA_PERSISTENCIA";

/** Erro genérico de operação de Loja (ex.: `setTemplate`). */
export interface StoreError {
  code: StoreErrorCode;
  reason: string;
  fields: string[];
}

/** Código de erro da validação pura do nome da Loja. */
export type StoreNameErrorCode = "NOME_EM_FALTA" | "NOME_MUITO_CURTO" | "NOME_MUITO_LONGO";

/** Erro da validação pura do nome da Loja. */
export interface StoreNameError {
  code: StoreNameErrorCode;
  reason: string;
}

/** Gerador de identificadores de Loja injetável (facilita testes). */
export interface StoreIdGenerator {
  newId(): string;
}

/** Dependências configuráveis do {@link StoreService}. */
export interface StoreServiceDeps {
  /** Repositório de persistência de Lojas (isolamento de inquilino). */
  storeRepository: StoreRepository;
  /** Normalizador/validador de identificadores e composição de subdomínio. */
  identifierService: IdentifierService;
  /** Gerador de identificadores de Loja. Por omissão usa `randomUUID`. */
  idGenerator?: StoreIdGenerator;
  /** Relógio injetável para obter o instante atual (ISO 8601). */
  now?: () => string;
}

/** Contrato do Serviço de Lojas (ver design.md → secção 3). */
export interface StoreService {
  /**
   * Cria a Loja se e só se todos os campos obrigatórios forem válidos e o
   * subdomínio estiver disponível na confirmação final; caso contrário devolve
   * erro sem persistir qualquer Loja parcial.
   */
  createStore(
    owner: StoreOwner,
    input: CreateStoreInput,
  ): Promise<Result<Store, CreateStoreError>>;
  /** Resolve uma Loja pelo seu identificador (plano público). */
  getStoreByIdentifier(identifier: string): Promise<Store | null>;
  /** Lista as Lojas pertencentes a `ownerId` (isolamento de inquilino). */
  getStoresForOwner(ownerId: string): Promise<Store[]>;
  /**
   * Associa `templateId` à Loja, mantendo exatamente um Modelo associado
   * (substitui o anterior). Rejeita Lojas inexistentes ou de outro Dono.
   */
  setTemplate(
    ownerId: string,
    storeId: string,
    templateId: string,
  ): Promise<Result<Store, StoreError>>;
}

/**
 * Função pura de validação do nome da Loja (Property 1; Requisitos 2.2, 2.5,
 * 2.6, 2.7). Após remoção dos espaços no início e no fim:
 *  - vazio/só espaços => `NOME_EM_FALTA`;
 *  - menos de 2 caracteres => `NOME_MUITO_CURTO`;
 *  - mais de 60 caracteres => `NOME_MUITO_LONGO`;
 *  - entre 2 e 60 (inclusive) => aceite, devolvendo o nome com trim aplicado.
 */
export function validateStoreName(name: string): Result<string, StoreNameError> {
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (trimmed.length === 0) {
    return err({
      code: "NOME_EM_FALTA",
      reason: "O nome da Loja é obrigatório.",
    });
  }
  if (trimmed.length < MIN_STORE_NAME_LENGTH) {
    return err({
      code: "NOME_MUITO_CURTO",
      reason: `O nome da Loja deve ter no mínimo ${MIN_STORE_NAME_LENGTH} caracteres.`,
    });
  }
  if (trimmed.length > MAX_STORE_NAME_LENGTH) {
    return err({
      code: "NOME_MUITO_LONGO",
      reason: `O nome da Loja deve ter no máximo ${MAX_STORE_NAME_LENGTH} caracteres.`,
    });
  }
  return ok(trimmed);
}

/** Gerador de ids por omissão baseado em `randomUUID`. */
const defaultIdGenerator: StoreIdGenerator = {
  newId(): string {
    return randomUUID();
  },
};

/** Mapeia o erro da validação do nome para um {@link CreateStoreError}. */
function nameErrorToCreateError(error: StoreNameError): CreateStoreError {
  return { code: error.code, reason: error.reason, fields: ["name"] };
}

/**
 * Cria uma instância do {@link StoreService} com as dependências fornecidas.
 */
export function createStoreService(deps: StoreServiceDeps): StoreService {
  const storeRepository = deps.storeRepository;
  const identifierService = deps.identifierService;
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    async createStore(
      owner: StoreOwner,
      input: CreateStoreInput,
    ): Promise<Result<Store, CreateStoreError>> {
      // 1. Nome obrigatório e dentro do comprimento permitido (Req. 2.2, 2.5–2.7).
      const nameResult = validateStoreName(input?.name);
      if (!nameResult.ok) {
        return err(nameErrorToCreateError(nameResult.error));
      }
      const name = nameResult.value;

      // 2. Tipo_de_Loja obrigatório e válido (Req. 5.6, ver 2.4).
      const storeType = input?.storeType;
      if (typeof storeType !== "string" || !VALID_STORE_TYPES.includes(storeType)) {
        return err({
          code: "TIPO_EM_FALTA",
          reason: "A seleção do tipo de Loja é obrigatória.",
          fields: ["storeType"],
        });
      }

      // 3. Modelo obrigatório (exatamente um, Req. 3.3, 5.6).
      const templateId = typeof input?.templateId === "string" ? input.templateId.trim() : "";
      if (templateId.length === 0) {
        return err({
          code: "MODELO_EM_FALTA",
          reason: "A seleção do Modelo é obrigatória.",
          fields: ["templateId"],
        });
      }

      // 4. Identificador obrigatório e com formato válido (Req. 4.7, 5.6).
      const identifier = typeof input?.identifier === "string" ? input.identifier.trim() : "";
      if (identifier.length === 0) {
        return err({
          code: "IDENTIFICADOR_EM_FALTA",
          reason: "O identificador da Loja é obrigatório.",
          fields: ["identifier"],
        });
      }
      if (!identifierService.isValidFormat(identifier)) {
        return err({
          code: "IDENTIFICADOR_INVALIDO",
          reason:
            "O identificador deve ter entre 2 e 63 caracteres, conter apenas letras minúsculas, dígitos e hífenes, e não começar/terminar com hífen nem conter hífenes consecutivos.",
          fields: ["identifier"],
        });
      }

      // 5. Revalidação da disponibilidade do subdomínio na confirmação final
      //    (Req. 5.5): não usado e não reservado. Caso contrário, rejeita sem
      //    persistir qualquer Loja parcial.
      const available = await identifierService.isAvailable(identifier);
      if (!available) {
        return err({
          code: "IDENTIFICADOR_INDISPONIVEL",
          reason:
            "O subdomínio escolhido já não está disponível. Indique um identificador alternativo.",
          fields: ["identifier"],
        });
      }

      // 6. Construção da Loja, associada exclusivamente ao Dono autenticado
      //    (Req. 5.2) e com subdomínio coerente (Req. 4.4).
      const store: Store = {
        id: idGenerator.newId(),
        ownerId: owner.id,
        name,
        storeType,
        templateId,
        identifier,
        subdomain: identifierService.toSubdomain(identifier),
        state: input?.state ?? DEFAULT_STORE_STATE,
        createdAt: now(),
      };

      // 7. Persistência atómica: se a invariante de unicidade for violada (corrida
      //    de identificador) ou ocorrer outra falha, nada é persistido (Req. 5.4, 5.5).
      const created = await storeRepository.create(store);
      if (!created.ok) {
        if (created.error.code === "IDENTIFICADOR_DUPLICADO") {
          return err({
            code: "IDENTIFICADOR_INDISPONIVEL",
            reason:
              "O subdomínio escolhido já não está disponível. Indique um identificador alternativo.",
            fields: ["identifier"],
          });
        }
        return err({
          code: "FALHA_PERSISTENCIA",
          reason: "Não foi possível criar a Loja. Tente novamente.",
          fields: [],
        });
      }

      return ok(created.value);
    },

    async getStoreByIdentifier(identifier: string): Promise<Store | null> {
      if (typeof identifier !== "string" || identifier.trim().length === 0) {
        return null;
      }
      return storeRepository.findByIdentifier(identifier);
    },

    async getStoresForOwner(ownerId: string): Promise<Store[]> {
      if (typeof ownerId !== "string" || ownerId.length === 0) {
        return [];
      }
      return storeRepository.listByOwner(ownerId);
    },

    async setTemplate(
      ownerId: string,
      storeId: string,
      templateId: string,
    ): Promise<Result<Store, StoreError>> {
      // Modelo obrigatório (mantém exatamente um Modelo, Req. 3.3).
      const nextTemplateId = typeof templateId === "string" ? templateId.trim() : "";
      if (nextTemplateId.length === 0) {
        return err({
          code: "MODELO_EM_FALTA",
          reason: "A seleção do Modelo é obrigatória.",
          fields: ["templateId"],
        });
      }

      // Isolamento de inquilino: só resolve Lojas do próprio Dono (Req. 5.2, 7.9).
      const current = await storeRepository.findByIdForOwner(ownerId, storeId);
      if (current === null) {
        return err({
          code: "LOJA_INEXISTENTE",
          reason: "A Loja não existe ou não pertence a este Dono.",
          fields: ["storeId"],
        });
      }

      // Substitui a associação anterior, mantendo exatamente um Modelo (Req. 3.3).
      const updatedStore: Store = { ...current, templateId: nextTemplateId };
      const updated = await storeRepository.update(ownerId, updatedStore);
      if (!updated.ok) {
        if (updated.error.code === "LOJA_INEXISTENTE") {
          return err({
            code: "LOJA_INEXISTENTE",
            reason: "A Loja não existe ou não pertence a este Dono.",
            fields: ["storeId"],
          });
        }
        return err({
          code: "FALHA_PERSISTENCIA",
          reason: "Não foi possível atualizar o Modelo da Loja. Tente novamente.",
          fields: [],
        });
      }

      return ok(updated.value);
    },
  };
}
