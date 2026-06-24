/**
 * Wiring de integração do Assistente_de_Criação (Tarefa 15.1) — ver design.md →
 * "Fluxo do Assistente_de_Criação (máquina de estados)" e
 * "Components and Interfaces".
 *
 * Este módulo liga o Assistente_de_Criação ponta a ponta:
 *  - resolve o Dono_da_Loja autenticado a partir da sessão, via
 *    {@link AuthService.getCurrentOwner};
 *  - reúne e valida os dados do wizard via {@link buildConfirmation} (que usa o
 *    {@link IdentifierService} para validar o identificador e compor o
 *    subdomínio);
 *  - cria a Loja via {@link StoreService.createStore}, associada
 *    **exclusivamente** ao Dono autenticado (Requisitos 5.1, 5.2);
 *  - em sucesso, produz um descritor de redireccionamento para o
 *    Painel_de_Administração da Loja criada (Requisito 5.3);
 *  - em falha (autenticação em falta, campos inválidos ou erro de criação),
 *    devolve mensagens em português e **preserva** a mala de dados do wizard
 *    para reapresentação (Requisitos 1.4, 1.5, 5.4, 5.6, 10.2).
 *
 * Princípios de design (alinhados com o restante código):
 *  - **Determinista e injetável**: todos os serviços são recebidos por
 *    parâmetro através de {@link createWizardFlow}, mantendo o módulo testável
 *    sem infraestrutura.
 *  - **Sem exceções**: os resultados previsíveis são devolvidos como uma união
 *    discriminada ({@link WizardFlowResult}), à semelhança do padrão
 *    `Result<T, E>` dos serviços.
 *  - **Imutável**: a mala de dados do wizard nunca é mutada; em caso de erro é
 *    devolvida intacta.
 */

import type { Store, StoreOwner } from "../models/index.js";
import type { Session, AuthService } from "../services/authService.js";
import type { IdentifierService } from "../services/identifierService.js";
import type { StoreService } from "../services/storeService.js";
import {
  buildConfirmation,
  type StepFieldError,
  type WizardStepData,
} from "../ui/wizardSteps.js";

/* -------------------------------------------------------------------------- */
/*  Descritor de redireccionamento                                            */
/* -------------------------------------------------------------------------- */

/** Alvos de redireccionamento conhecidos após uma transição do fluxo. */
export type RedirectTarget = "admin-panel";

/**
 * Descritor de redireccionamento para o Painel_de_Administração da Loja criada
 * (Requisito 5.3). É uma descrição declarativa e agnóstica de framework: a
 * camada de apresentação decide como o concretizar (ex.: navegação de rota).
 */
export interface AdminPanelRedirect {
  /** Alvo do redireccionamento: o Painel_de_Administração. */
  readonly target: RedirectTarget;
  /** Identificador interno da Loja criada (para resolução no Painel). */
  readonly storeId: string;
  /** Identificador_de_Loja (subdomínio sem sufixo) da Loja criada. */
  readonly identifier: string;
  /** Subdomínio completo `${identifier}.mobisno.com` da Loja criada. */
  readonly subdomain: string;
}

/* -------------------------------------------------------------------------- */
/*  Tipos de resultado do fluxo                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resultado da conclusão do Assistente_de_Criação.
 *  - `created`: a Loja foi criada e associada exclusivamente ao Dono
 *    autenticado; `redirect` indica o destino (Painel_de_Administração)
 *    (Requisitos 5.1, 5.2, 5.3).
 *  - `unauthenticated`: não foi possível resolver um Dono autenticado a partir
 *    da sessão; a criação não pode concluir sem autenticação e os dados do
 *    wizard são preservados (Requisitos 1.4, 1.5).
 *  - `incomplete`: existem campos obrigatórios em falta ou inválidos na mala de
 *    dados; estes são identificados por campo e os dados são preservados
 *    (Requisitos 5.6, 10.6).
 *  - `failed`: a criação foi rejeitada pelo {@link StoreService} (ex.:
 *    subdomínio indisponível ou falha de persistência); a mensagem em português
 *    é exposta e os dados são preservados, sem persistir Loja parcial
 *    (Requisitos 5.4, 5.5).
 */
export type WizardFlowResult =
  | {
      readonly status: "created";
      readonly store: Store;
      readonly redirect: AdminPanelRedirect;
    }
  | {
      readonly status: "unauthenticated";
      readonly message: string;
      readonly fieldErrors: readonly StepFieldError[];
      readonly data: WizardStepData;
    }
  | {
      readonly status: "incomplete";
      readonly message: string;
      readonly fieldErrors: readonly StepFieldError[];
      readonly data: WizardStepData;
    }
  | {
      readonly status: "failed";
      readonly message: string;
      readonly fieldErrors: readonly StepFieldError[];
      readonly data: WizardStepData;
    };

/* -------------------------------------------------------------------------- */
/*  Contrato e dependências do controlador                                    */
/* -------------------------------------------------------------------------- */

/** Dependências injetáveis do fluxo do Assistente_de_Criação. */
export interface WizardFlowDeps {
  /** Resolve o Dono autenticado a partir da sessão (Requisito 1.4). */
  readonly authService: AuthService;
  /** Valida o identificador e compõe o subdomínio (Requisitos 4.4, 4.7). */
  readonly identifierService: IdentifierService;
  /** Cria a Loja, associando-a ao Dono autenticado (Requisitos 5.1, 5.2). */
  readonly storeService: StoreService;
}

/** Controlador do fluxo de conclusão do Assistente_de_Criação. */
export interface WizardFlow {
  /**
   * Conclui a criação da Loja a partir da mala de dados do wizard e da sessão
   * autenticada. Resolve o Dono via {@link AuthService.getCurrentOwner}, valida
   * os dados via {@link buildConfirmation} e cria a Loja via
   * {@link StoreService.createStore}. Em sucesso devolve o descritor de
   * redireccionamento para o Painel_de_Administração; em falha preserva os
   * dados e expõe a mensagem em português.
   */
  completeCreation(data: WizardStepData, session: Session): Promise<WizardFlowResult>;
}

/* -------------------------------------------------------------------------- */
/*  Implementação                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Constrói o descritor de redireccionamento para o Painel_de_Administração da
 * Loja criada (Requisito 5.3).
 */
function buildAdminPanelRedirect(store: Store): AdminPanelRedirect {
  return {
    target: "admin-panel",
    storeId: store.id,
    identifier: store.identifier,
    subdomain: store.subdomain,
  };
}

/**
 * Cria um controlador do fluxo do Assistente_de_Criação ligado aos serviços
 * fornecidos. Mantém-se determinista e injetável para facilitar os testes de
 * integração (Tarefa 15.3).
 */
export function createWizardFlow(deps: WizardFlowDeps): WizardFlow {
  const { authService, identifierService, storeService } = deps;

  return {
    async completeCreation(
      data: WizardStepData,
      session: Session,
    ): Promise<WizardFlowResult> {
      // 1. Resolver o Dono autenticado a partir da sessão (Requisito 1.4). Sem
      //    um Dono válido, a criação não pode concluir; preservar os dados.
      const owner: StoreOwner | null = await authService.getCurrentOwner(session);
      if (owner === null) {
        return {
          status: "unauthenticated",
          message:
            "É necessário criar conta ou iniciar sessão para concluir a criação da Loja.",
          fieldErrors: [
            {
              field: "ownerId",
              message:
                "É necessário criar conta ou iniciar sessão para concluir a criação da Loja.",
            },
          ],
          data,
        };
      }

      // 2. Reunir e validar os dados do wizard (Requisitos 5.1, 5.6, 10.6).
      const confirmation = buildConfirmation(data, identifierService);
      if (confirmation.status === "incomplete") {
        return {
          status: "incomplete",
          message: confirmation.message,
          fieldErrors: confirmation.fieldErrors,
          data: confirmation.data,
        };
      }

      // 3. Criar a Loja, associada exclusivamente ao Dono autenticado
      //    (Requisitos 5.1, 5.2). Em falha, preservar os dados sem persistir
      //    Loja parcial (Requisitos 5.4, 5.5).
      const result = await storeService.createStore(owner, confirmation.createStoreInput);
      if (!result.ok) {
        return {
          status: "failed",
          message: result.error.reason,
          fieldErrors: result.error.fields.map((field) => ({
            field,
            message: result.error.reason,
          })),
          data,
        };
      }

      const store = result.value;

      // 4. Reforço da invariante de posse exclusiva (Requisito 5.2): a Loja
      //    criada tem de pertencer ao Dono autenticado e a nenhum outro.
      if (store.ownerId !== owner.id) {
        return {
          status: "failed",
          message: "Não foi possível associar a Loja à sua conta. Tente novamente.",
          fieldErrors: [],
          data,
        };
      }

      // 5. Sucesso: redireccionar para o Painel_de_Administração (Requisito 5.3).
      return {
        status: "created",
        store,
        redirect: buildAdminPanelRedirect(store),
      };
    },
  };
}
