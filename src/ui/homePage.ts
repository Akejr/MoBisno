/**
 * View model da página inicial do Plano de Administração (ver design.md →
 * "Painel de Administração e Página Inicial (UI)").
 *
 * A página inicial apresenta, de forma **permanente** e **acima da dobra**
 * (área visível sem necessidade de deslocamento), uma **única** ação
 * acionável identificada com o texto exato "Criar o meu site" (Requisito 1.1).
 * Selecionar essa ação inicia o Assistente_de_Criação no primeiro passo
 * (Requisito 1.2 — a ligação efetiva é tratada na tarefa 12.2/15.1).
 *
 * Este módulo é deliberadamente agnóstico de framework: expõe um view model
 * determinístico e testável que descreve o que deve ser renderizado, sem
 * depender de qualquer biblioteca de UI. Todos os textos destinados ao
 * utilizador estão em português (Requisito 10.3).
 */

/**
 * Rótulo exato e imutável da ação única da página inicial (Requisito 1.1).
 * O texto não deve ser alterado: o requisito exige precisamente este valor.
 */
export const CRIAR_SITE_LABEL = "Criar o meu site" as const;

/**
 * Identificador estável da intenção desencadeada pela ação da página inicial.
 * A camada de integração liga este intent ao arranque do Assistente_de_Criação
 * (Requisito 1.2).
 */
export type HomePageActionIntent = "iniciarAssistente";

/**
 * Descritor da ação única e permanente da página inicial.
 *
 * As marcas `aboveTheFold` e `permanent` documentam, de forma verificável,
 * que a ação é apresentada na área visível inicial e está sempre presente
 * (Requisito 1.1).
 */
export interface HomePageCallToAction {
  /** Identificador estável do elemento de ação. */
  readonly id: string;
  /** Texto apresentado ao utilizador (exatamente {@link CRIAR_SITE_LABEL}). */
  readonly label: string;
  /** A ação é apresentada acima da dobra (sem necessidade de scroll). */
  readonly aboveTheFold: true;
  /** A ação está presente de forma permanente na página inicial. */
  readonly permanent: true;
  /** Intenção desencadeada ao acionar (iniciar o Assistente_de_Criação). */
  readonly intent: HomePageActionIntent;
}

/**
 * View model da página inicial. Nesta fase expõe exclusivamente a ação única
 * "Criar o meu site"; a ausência de quaisquer outras ações reforça a regra de
 * "uma única ação acionável" do Requisito 1.1.
 */
export interface HomePageViewModel {
  /** A única ação acionável, permanente e acima da dobra (Requisito 1.1). */
  readonly callToAction: HomePageCallToAction;
}

/** Identificador estável da ação única da página inicial. */
export const HOME_PAGE_CTA_ID = "home-cta-criar-site" as const;

/**
 * Constrói o view model da página inicial com a ação única e permanente
 * "Criar o meu site" (Requisito 1.1). É uma função pura e determinística:
 * devolve sempre o mesmo descritor, adequado a testes por exemplo.
 */
export function createHomePageViewModel(): HomePageViewModel {
  const callToAction: HomePageCallToAction = {
    id: HOME_PAGE_CTA_ID,
    label: CRIAR_SITE_LABEL,
    aboveTheFold: true,
    permanent: true,
    intent: "iniciarAssistente",
  };

  return { callToAction };
}

/**
 * View model pré-construído da página inicial, para consumo direto quando não
 * é necessária uma nova instância.
 */
export const HOME_PAGE_VIEW_MODEL: HomePageViewModel = createHomePageViewModel();

/**
 * Mensagem de erro apresentada na página inicial quando o Assistente_de_Criação
 * não consegue iniciar dentro do prazo (Requisito 1.3). Indica que o início
 * falhou e convida o Visitante a tentar novamente, mantendo-o na página
 * inicial. Texto em português (Requisito 10.3).
 */
export const WIZARD_START_ERROR_MESSAGE =
  "Não foi possível iniciar a criação do seu site. Tente novamente." as const;

/**
 * Rótulo da ação de repetição apresentada junto à
 * {@link WIZARD_START_ERROR_MESSAGE} para o Visitante voltar a tentar iniciar o
 * Assistente_de_Criação (Requisito 1.3).
 */
export const WIZARD_START_RETRY_LABEL = "Tentar novamente" as const;
