/**
 * Validação e wiring por passo do Assistente_de_Criação (ver design.md →
 * "Fluxo do Assistente_de_Criação (máquina de estados)" e "Painel de
 * Administração e Página Inicial (UI)").
 *
 * O shell do Assistente (sequência, navegação e gestão de estado) vive em
 * {@link module:ui/wizard}. Este módulo complementa-o com a **lógica de cada
 * passo**: validação dos campos, ligação aos serviços de negócio e produção de
 * mensagens de erro em português junto a cada campo inválido, preservando
 * sempre os dados já introduzidos (Requisitos 10.2, 10.3, 10.6, 1.5, 1.6).
 *
 * Princípios de design:
 *  - **Determinista e injetável**: todos os serviços (Identificador,
 *    Autenticação) são recebidos por parâmetro, não instanciados internamente.
 *    Isto mantém o módulo testável sem infraestrutura.
 *  - **Imutável**: as funções nunca mutam a "mala de dados" do wizard; em caso
 *    de erro devolvem os dados originais intactos para reapresentação
 *    (Requisitos 10.2, 5.6).
 *  - **Sem exceções**: os resultados previsíveis são devolvidos como uniões
 *    discriminadas, à semelhança do padrão `Result<T, E>` dos serviços.
 *
 * A criação efetiva da Loja (chamada a `StoreService.createStore`) e o
 * redireccionamento para o Painel_de_Administração ficam para a tarefa 15.1;
 * aqui o passo de confirmação apenas reúne os dados e indica que está pronto.
 */

import type { StoreType, Template } from "../models/index.js";
import {
  validateStoreName,
  VALID_STORE_TYPES,
  type CreateStoreInput,
} from "../services/storeService.js";
import type { IdentifierService } from "../services/identifierService.js";
import type {
  AuthService,
  AuthError,
  Session,
  RegisterInput,
  LoginInput,
} from "../services/authService.js";

/* -------------------------------------------------------------------------- */
/*  Chaves de campo da mala de dados do wizard                                */
/* -------------------------------------------------------------------------- */

/**
 * Nomes estáveis dos campos guardados na mala de dados do Assistente. Usados
 * tanto para ler valores introduzidos como para associar erros a campos
 * (Requisito 10.2).
 */
export const WIZARD_FIELDS = {
  name: "name",
  storeType: "storeType",
  templateId: "templateId",
  identifier: "identifier",
  email: "email",
  password: "password",
  ownerName: "ownerName",
  /** Identificador do Dono autenticado, gravado após o passo de autenticação. */
  ownerId: "ownerId",
} as const;

/* -------------------------------------------------------------------------- */
/*  Tipos de resultado comuns                                                 */
/* -------------------------------------------------------------------------- */

/** Erro associado a um campo específico do passo, em português (Req. 10.2). */
export interface StepFieldError {
  /** Nome do campo em causa (ver {@link WIZARD_FIELDS}). */
  readonly field: string;
  /** Mensagem de correção em português. */
  readonly message: string;
}

/**
 * Resultado da validação de um passo do Assistente.
 *  - `valid`: o passo está completo e válido; `value` contém os dados
 *    normalizados do passo e `data` a mala de dados resultante (preservada).
 *  - `invalid`: o passo é rejeitado; `fieldErrors` traz a mensagem junto a cada
 *    campo inválido e `data` preserva intactos os dados introduzidos
 *    (Requisitos 10.2, 10.6, 5.6).
 */
export type StepResult<TValue> =
  | { readonly status: "valid"; readonly value: TValue; readonly data: WizardStepData }
  | {
      readonly status: "invalid";
      /** Resumo legível do(s) problema(s), em português. */
      readonly message: string;
      /** Erros por campo, para apresentação junto a cada campo (Req. 10.2). */
      readonly fieldErrors: readonly StepFieldError[];
      /** Dados introduzidos, preservados para reapresentação (Req. 10.2). */
      readonly data: WizardStepData;
    };

/**
 * Vista de leitura da mala de dados do wizard. Espelha
 * {@link module:ui/wizard.WizardData} (um saco de chaves->valores) mas é
 * declarada aqui para evitar acoplamento de importação ao shell.
 */
export type WizardStepData = Readonly<Record<string, unknown>>;

/* -------------------------------------------------------------------------- */
/*  Auxiliares                                                                */
/* -------------------------------------------------------------------------- */

/** Lê de forma segura uma string da mala de dados; devolve "" se ausente. */
function readString(data: WizardStepData, field: string): string {
  const value = data[field];
  return typeof value === "string" ? value : "";
}

/** Constrói um resultado de passo inválido a partir de erros por campo. */
function invalid<TValue>(
  data: WizardStepData,
  fieldErrors: readonly StepFieldError[],
): StepResult<TValue> {
  const message =
    fieldErrors.length === 1
      ? fieldErrors[0]!.message
      : "Corrija os campos assinalados para continuar.";
  return { status: "invalid", message, fieldErrors, data };
}

/* ========================================================================== */
/*  Passo 1 — Nome e Tipo da Loja (Req. 2.1, 2.3, 2.4, 10.2, 10.6)            */
/* ========================================================================== */

/** Opção de Tipo_de_Loja apresentada para seleção (Requisito 2.3). */
export interface StoreTypeOptionViewModel {
  readonly value: StoreType;
  /** Rótulo apresentado (igual ao valor; já em português). */
  readonly label: string;
  /** Verdadeiro quando corresponde ao Tipo_de_Loja atualmente selecionado. */
  readonly selected: boolean;
}

/** Dados normalizados produzidos por um Passo Nome/Tipo válido. */
export interface PassoNomeTipoValue {
  /** Nome da Loja após remoção de espaços (2–60 caracteres). */
  readonly name: string;
  readonly storeType: StoreType;
}

/**
 * Constrói a lista de opções de Tipo_de_Loja para apresentação, marcando a
 * opção atualmente selecionada (Requisito 2.3).
 */
export function buildStoreTypeOptions(
  selected?: string,
): readonly StoreTypeOptionViewModel[] {
  return VALID_STORE_TYPES.map((value) => ({
    value,
    label: value,
    selected: value === selected,
  }));
}

/**
 * Valida o passo de Nome e Tipo da Loja (Requisitos 2.1, 2.2, 2.3, 2.4, 2.5,
 * 2.6, 2.7). Acumula erros de **todos** os campos inválidos para os apresentar
 * em simultâneo junto a cada campo (Requisitos 10.2, 10.6) e preserva os dados
 * introduzidos. Em caso de sucesso, devolve o nome já com trim aplicado e a
 * mala de dados atualizada com os valores normalizados.
 */
export function validatePassoNomeTipo(data: WizardStepData): StepResult<PassoNomeTipoValue> {
  const rawName = readString(data, WIZARD_FIELDS.name);
  const rawStoreType = readString(data, WIZARD_FIELDS.storeType);
  const fieldErrors: StepFieldError[] = [];

  // Nome obrigatório e dentro do comprimento permitido (Req. 2.2, 2.5–2.7).
  const nameResult = validateStoreName(rawName);
  let normalizedName = "";
  if (nameResult.ok) {
    normalizedName = nameResult.value;
  } else {
    fieldErrors.push({ field: WIZARD_FIELDS.name, message: nameResult.error.reason });
  }

  // Tipo_de_Loja obrigatório e válido (Req. 2.4).
  const isValidType = VALID_STORE_TYPES.includes(rawStoreType as StoreType);
  if (!isValidType) {
    fieldErrors.push({
      field: WIZARD_FIELDS.storeType,
      message: "A seleção do tipo de Loja é obrigatória.",
    });
  }

  if (fieldErrors.length > 0) {
    return invalid<PassoNomeTipoValue>(data, fieldErrors);
  }

  const storeType = rawStoreType as StoreType;
  return {
    status: "valid",
    value: { name: normalizedName, storeType },
    data: { ...data, [WIZARD_FIELDS.name]: normalizedName, [WIZARD_FIELDS.storeType]: storeType },
  };
}

/* ========================================================================== */
/*  Passo 2 — Seleção de Modelo (Req. 3.1, 3.2, 3.4, 3.5)                     */
/* ========================================================================== */

/** Opção de Modelo apresentada com pré-visualização e nome (Requisito 3.1). */
export interface TemplateOptionViewModel {
  readonly id: string;
  readonly name: string;
  /** URL de pré-visualização visual do Modelo (Requisito 3.1). */
  readonly previewUrl: string;
  /** Verdadeiro quando este Modelo é o atualmente associado à Loja. */
  readonly selected: boolean;
}

/**
 * Constrói a lista de Modelos disponíveis para apresentação, cada um com
 * pré-visualização e nome, marcando o Modelo atualmente selecionado
 * (Requisitos 3.1, 3.2).
 */
export function buildTemplateOptions(
  templates: readonly Template[],
  selectedId?: string,
): readonly TemplateOptionViewModel[] {
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    previewUrl: template.previewUrl,
    selected: template.id === selectedId,
  }));
}

/**
 * Valida o passo de seleção de Modelo (Requisitos 3.4, 3.5):
 *  - se não existir qualquer Modelo disponível, impede o avanço com a mensagem
 *    apropriada (Requisito 3.5);
 *  - se nenhum Modelo foi selecionado, impede o avanço (Requisito 3.4);
 *  - se o `templateId` selecionado não pertence à lista disponível, é
 *    rejeitado (proteção contra seleção inválida);
 *  - caso contrário aceita e regista a associação, mantendo exatamente um
 *    Modelo na mala de dados (Requisito 3.2/3.3).
 */
export function validatePassoModelo(
  data: WizardStepData,
  availableTemplates: readonly Template[],
): StepResult<{ readonly templateId: string }> {
  if (availableTemplates.length === 0) {
    return invalid<{ readonly templateId: string }>(data, [
      {
        field: WIZARD_FIELDS.templateId,
        message: "Não existem modelos disponíveis para seleção de momento.",
      },
    ]);
  }

  const templateId = readString(data, WIZARD_FIELDS.templateId).trim();
  if (templateId.length === 0) {
    return invalid<{ readonly templateId: string }>(data, [
      { field: WIZARD_FIELDS.templateId, message: "A seleção do modelo é obrigatória." },
    ]);
  }

  const exists = availableTemplates.some((template) => template.id === templateId);
  if (!exists) {
    return invalid<{ readonly templateId: string }>(data, [
      {
        field: WIZARD_FIELDS.templateId,
        message: "O modelo selecionado não está disponível. Escolha um dos modelos apresentados.",
      },
    ]);
  }

  return {
    status: "valid",
    value: { templateId },
    data: { ...data, [WIZARD_FIELDS.templateId]: templateId },
  };
}

/* ========================================================================== */
/*  Passo 3 — Subdomínio (Req. 4.3, 4.4, 4.5, 4.6, 4.7, 4.8)                  */
/* ========================================================================== */

/** Dados produzidos por um Passo Subdomínio válido (Requisito 4.6). */
export interface PassoSubdominioValue {
  /** Identificador_de_Loja válido e disponível. */
  readonly identifier: string;
  /** Subdomínio resultante apresentado antes da confirmação (Req. 4.6). */
  readonly subdomain: string;
  /**
   * Indica se o identificador foi derivado do nome (`derivado`) ou fornecido
   * pelo Dono como alternativa (`alternativo`).
   */
  readonly origin: "derivado" | "alternativo";
}

/**
 * Deriva e valida o subdomínio da Loja, apresentando-o **antes** da
 * confirmação final (Requisito 4.6). Comportamento:
 *  - Se o Dono forneceu um identificador alternativo (`identifier` na mala de
 *    dados), valida o seu formato (Requisitos 4.7, 4.8).
 *  - Caso contrário, deriva o identificador a partir do nome da Loja via
 *    `normalize` (Requisitos 4.1, 4.2). Se o resultado tiver menos de 2
 *    caracteres, rejeita e solicita um nome alternativo (Requisito 4.3).
 *  - Verifica a disponibilidade (não usado e não reservado) via `isAvailable`;
 *    se indisponível, solicita um identificador alternativo (Requisito 4.5).
 *  - Em sucesso, compõe e devolve o subdomínio `identificador.mobisno.com`
 *    (Requisito 4.4) para apresentação antes da confirmação (Requisito 4.6).
 *
 * O serviço de identificadores é injetado, mantendo a função determinista e
 * testável. Os dados introduzidos são sempre preservados (Req. 10.2).
 */
export async function resolvePassoSubdominio(
  data: WizardStepData,
  identifierService: IdentifierService,
): Promise<StepResult<PassoSubdominioValue>> {
  const alternative = readString(data, WIZARD_FIELDS.identifier).trim();
  const name = readString(data, WIZARD_FIELDS.name);

  let identifier: string;
  let origin: "derivado" | "alternativo";

  if (alternative.length > 0) {
    // Identificador alternativo fornecido pelo Dono (Req. 4.8).
    origin = "alternativo";
    identifier = alternative;
    if (!identifierService.isValidFormat(identifier)) {
      return invalid<PassoSubdominioValue>(data, [
        {
          field: WIZARD_FIELDS.identifier,
          message:
            "O endereço deve ter entre 2 e 63 caracteres, conter apenas letras minúsculas, dígitos e hífenes, e não começar/terminar com hífen nem conter hífenes consecutivos.",
        },
      ]);
    }
  } else {
    // Derivação a partir do nome da Loja (Req. 4.1, 4.2).
    origin = "derivado";
    identifier = identifierService.normalize(name);
    if (!identifierService.isValidFormat(identifier)) {
      // Normalização com menos de 2 caracteres (ou formato inválido): pedir
      // nome alternativo, preservando os dados (Req. 4.3).
      return invalid<PassoSubdominioValue>(data, [
        {
          field: WIZARD_FIELDS.name,
          message:
            "Não foi possível gerar um endereço válido a partir deste nome. Indique um nome alternativo.",
        },
      ]);
    }
  }

  // Disponibilidade: não usado e não reservado (Req. 4.5).
  const available = await identifierService.isAvailable(identifier);
  if (!available) {
    return invalid<PassoSubdominioValue>(data, [
      {
        field: WIZARD_FIELDS.identifier,
        message:
          "Este endereço já não está disponível. Indique um endereço (identificador) alternativo.",
      },
    ]);
  }

  // Composição do subdomínio a apresentar antes da confirmação (Req. 4.4, 4.6).
  const subdomain = identifierService.toSubdomain(identifier);
  return {
    status: "valid",
    value: { identifier, subdomain, origin },
    data: { ...data, [WIZARD_FIELDS.identifier]: identifier },
  };
}

/* ========================================================================== */
/*  Passo 4 — Autenticação (Req. 1.4, 1.5, 5.3, 10.2)                         */
/* ========================================================================== */

/**
 * Resultado do passo de autenticação.
 *  - `authenticated`: registo/login bem-sucedido; `session` traz a sessão e
 *    `data` a mala de dados com o `ownerId` gravado (sem nunca guardar a
 *    palavra-passe).
 *  - `invalid`: dados de registo/autenticação inválidos ou incompletos; os
 *    erros são associados a cada campo e os dados introduzidos preservados
 *    (Requisito 1.5).
 */
export type AuthStepResult =
  | { readonly status: "authenticated"; readonly session: Session; readonly data: WizardStepData }
  | {
      readonly status: "invalid";
      readonly message: string;
      readonly fieldErrors: readonly StepFieldError[];
      readonly data: WizardStepData;
    };

/** Controlador do passo de autenticação do Assistente (Requisitos 1.4, 1.5). */
export interface AuthStepController {
  /** Regista uma nova conta de Dono_da_Loja e autentica-a (Req. 1.4). */
  register(data: WizardStepData, input: RegisterInput): Promise<AuthStepResult>;
  /** Autentica um Dono_da_Loja existente (Req. 1.4). */
  login(data: WizardStepData, input: LoginInput): Promise<AuthStepResult>;
}

/** Converte um {@link AuthError} numa lista de erros por campo (Req. 10.2). */
function authErrorToFieldErrors(error: AuthError): StepFieldError[] {
  const fields = error.fields.length > 0 ? error.fields : ["geral"];
  return fields.map((field) => ({ field, message: error.reason }));
}

/**
 * Funde a mala de dados com a sessão obtida, gravando o `ownerId` e o email, e
 * **removendo** a palavra-passe para não a manter no estado do wizard.
 */
function dataWithSession(data: WizardStepData, session: Session): WizardStepData {
  const next: Record<string, unknown> = { ...data };
  delete next[WIZARD_FIELDS.password];
  next[WIZARD_FIELDS.ownerId] = session.ownerId;
  next[WIZARD_FIELDS.email] = session.email;
  return next;
}

/**
 * Cria um controlador do passo de autenticação ligado ao {@link AuthService}
 * fornecido. Exige registo ou autenticação antes de concluir a criação da Loja
 * (Requisito 1.4); em caso de falha preserva os dados já introduzidos no
 * Assistente (Requisitos 1.5, 5.3) e remove a palavra-passe do estado em
 * sucesso.
 */
export function createAuthStepController(deps: {
  authService: AuthService;
}): AuthStepController {
  const authService = deps.authService;

  return {
    async register(data: WizardStepData, input: RegisterInput): Promise<AuthStepResult> {
      const result = await authService.register(input);
      if (result.ok) {
        return {
          status: "authenticated",
          session: result.value,
          data: dataWithSession(data, result.value),
        };
      }
      return {
        status: "invalid",
        message: result.error.reason,
        fieldErrors: authErrorToFieldErrors(result.error),
        data,
      };
    },

    async login(data: WizardStepData, input: LoginInput): Promise<AuthStepResult> {
      const result = await authService.login(input);
      if (result.ok) {
        return {
          status: "authenticated",
          session: result.value,
          data: dataWithSession(data, result.value),
        };
      }
      return {
        status: "invalid",
        message: result.error.reason,
        fieldErrors: authErrorToFieldErrors(result.error),
        data,
      };
    },
  };
}

/* ========================================================================== */
/*  Passo 5 — Confirmação (Req. 5.1, 5.3, 5.6, 10.6)                          */
/* ========================================================================== */

/** Resumo dos dados reunidos para confirmação final (Requisito 4.6/5.1). */
export interface ConfirmationSummary {
  readonly name: string;
  readonly storeType: StoreType;
  readonly templateId: string;
  readonly identifier: string;
  /** Subdomínio resultante, apresentado para revisão (Req. 4.6). */
  readonly subdomain: string;
}

/**
 * Resultado do passo de confirmação.
 *  - `ready`: todos os campos obrigatórios estão presentes e válidos; o
 *    `createStoreInput` está pronto a ser entregue ao `StoreService.createStore`
 *    na tarefa 15.1, e `summary` resume os dados para revisão.
 *  - `incomplete`: existem campos obrigatórios em falta ou inválidos; estes são
 *    identificados por campo e os dados introduzidos são preservados
 *    (Requisitos 5.6, 10.6).
 */
export type ConfirmationResult =
  | {
      readonly status: "ready";
      readonly summary: ConfirmationSummary;
      readonly createStoreInput: CreateStoreInput;
      readonly data: WizardStepData;
    }
  | {
      readonly status: "incomplete";
      readonly message: string;
      readonly fieldErrors: readonly StepFieldError[];
      readonly data: WizardStepData;
    };

/**
 * Reúne os dados de todos os passos e indica se a criação da Loja está pronta a
 * ser confirmada (Requisitos 5.1, 5.6, 10.6). Revalida cada campo obrigatório
 * (nome, tipo, modelo, identificador) e identifica os que estiverem em falta ou
 * inválidos, preservando os dados introduzidos. A criação efetiva e o
 * redireccionamento para o Painel_de_Administração ficam para a tarefa 15.1.
 *
 * Exige ainda que exista uma sessão autenticada (gravada no passo de
 * autenticação), pois a criação não pode concluir sem autenticação
 * (Requisito 1.4).
 */
export function buildConfirmation(
  data: WizardStepData,
  identifierService: IdentifierService,
): ConfirmationResult {
  const fieldErrors: StepFieldError[] = [];

  // Nome (Req. 2.x).
  const nameResult = validateStoreName(readString(data, WIZARD_FIELDS.name));
  const name = nameResult.ok ? nameResult.value : "";
  if (!nameResult.ok) {
    fieldErrors.push({ field: WIZARD_FIELDS.name, message: nameResult.error.reason });
  }

  // Tipo_de_Loja (Req. 2.4).
  const rawStoreType = readString(data, WIZARD_FIELDS.storeType);
  const hasValidType = VALID_STORE_TYPES.includes(rawStoreType as StoreType);
  if (!hasValidType) {
    fieldErrors.push({
      field: WIZARD_FIELDS.storeType,
      message: "A seleção do tipo de Loja é obrigatória.",
    });
  }

  // Modelo (Req. 3.4).
  const templateId = readString(data, WIZARD_FIELDS.templateId).trim();
  if (templateId.length === 0) {
    fieldErrors.push({
      field: WIZARD_FIELDS.templateId,
      message: "A seleção do modelo é obrigatória.",
    });
  }

  // Identificador (Req. 4.7).
  const identifier = readString(data, WIZARD_FIELDS.identifier).trim();
  if (identifier.length === 0) {
    fieldErrors.push({
      field: WIZARD_FIELDS.identifier,
      message: "O endereço (identificador) da Loja é obrigatório.",
    });
  } else if (!identifierService.isValidFormat(identifier)) {
    fieldErrors.push({
      field: WIZARD_FIELDS.identifier,
      message: "O endereço da Loja não tem um formato válido.",
    });
  }

  // Autenticação obrigatória antes de concluir (Req. 1.4).
  const ownerId = readString(data, WIZARD_FIELDS.ownerId).trim();
  if (ownerId.length === 0) {
    fieldErrors.push({
      field: WIZARD_FIELDS.ownerId,
      message: "É necessário criar conta ou iniciar sessão para concluir a criação da Loja.",
    });
  }

  if (fieldErrors.length > 0) {
    const message =
      fieldErrors.length === 1
        ? fieldErrors[0]!.message
        : "Existem campos obrigatórios em falta ou inválidos. Reveja os passos assinalados.";
    return { status: "incomplete", message, fieldErrors, data };
  }

  const storeType = rawStoreType as StoreType;
  const subdomain = identifierService.toSubdomain(identifier);
  return {
    status: "ready",
    summary: { name, storeType, templateId, identifier, subdomain },
    createStoreInput: { name, storeType, templateId, identifier },
    data,
  };
}
