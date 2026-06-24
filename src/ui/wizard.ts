/**
 * Shell do Assistente_de_Criação (wizard) — ver design.md → "Fluxo do
 * Assistente_de_Criação (máquina de estados)".
 *
 * Este módulo implementa **apenas** a estrutura e a gestão de estado do
 * Assistente (a validação de cada passo e a ligação aos serviços ficam para a
 * tarefa 12.2). Responsabilidades:
 *  - Sequência numerada e fixa de passos (Requisito 1.6).
 *  - Indicação do número do passo atual e do número total de passos
 *    (Requisitos 1.6, 10.5).
 *  - Navegação para o passo anterior **sem perda** dos dados já introduzidos
 *    (Requisitos 1.6, 10.4).
 *  - Instrução de orientação por passo, que identifica o objetivo e a ação
 *    necessária (Requisito 10.1).
 *
 * O estado do Assistente é mantido do lado do cliente. As transições são puras
 * e imutáveis: cada função devolve um novo estado preservando a "mala de
 * dados" (data bag) já introduzida, garantindo que nenhuma navegação descarta
 * dados (Requisitos 1.6, 10.4). Todos os textos estão em português
 * (Requisito 10.3).
 */

/**
 * Identificadores dos passos do fluxo de criação, na ordem definida pela
 * máquina de estados do design.md.
 */
export type WizardStepId =
  | "PassoNomeTipo"
  | "PassoModelo"
  | "PassoSubdominio"
  | "PassoAutenticacao"
  | "PassoConfirmacao";

/**
 * Sequência numerada e fixa dos passos do Assistente_de_Criação
 * (Requisito 1.6). A ordem corresponde ao diagrama de estados do design.md:
 * Nome/Tipo → Modelo → Subdomínio → Autenticação → Confirmação.
 */
export const WIZARD_STEP_SEQUENCE: readonly WizardStepId[] = [
  "PassoNomeTipo",
  "PassoModelo",
  "PassoSubdominio",
  "PassoAutenticacao",
  "PassoConfirmacao",
];

/** Número total de passos do Assistente_de_Criação (Requisito 10.5). */
export const TOTAL_WIZARD_STEPS: number = WIZARD_STEP_SEQUENCE.length;

/** Metadados estáticos (título e orientação) de um passo do Assistente. */
interface WizardStepMeta {
  /** Título curto do passo, em português. */
  readonly title: string;
  /**
   * Instrução de orientação que identifica o objetivo do passo e a ação
   * necessária para o concluir (Requisito 10.1).
   */
  readonly orientation: string;
}

/**
 * Conteúdo em português de cada passo: título e instrução de orientação
 * (Requisitos 10.1, 10.3).
 */
const WIZARD_STEP_META: Readonly<Record<WizardStepId, WizardStepMeta>> = {
  PassoNomeTipo: {
    title: "Nome e tipo da Loja",
    orientation:
      "Indique o nome da sua Loja e selecione o tipo de negócio para avançar.",
  },
  PassoModelo: {
    title: "Modelo do site",
    orientation:
      "Escolha um modelo pré-construído para definir o aspeto da sua Loja.",
  },
  PassoSubdominio: {
    title: "Endereço da Loja",
    orientation:
      "Confirme o endereço (subdomínio) da sua Loja antes de continuar.",
  },
  PassoAutenticacao: {
    title: "Conta de acesso",
    orientation:
      "Crie a sua conta ou inicie sessão para concluir a criação da Loja.",
  },
  PassoConfirmacao: {
    title: "Confirmação",
    orientation:
      "Reveja os dados introduzidos e confirme para criar a sua Loja.",
  },
};

/**
 * Descritor do passo atual, com os indicadores apresentados ao utilizador.
 * Inclui o número do passo atual e o total (Requisitos 1.6, 10.5) e a
 * instrução de orientação (Requisito 10.1).
 */
export interface WizardStepDescriptor {
  /** Identificador do passo. */
  readonly id: WizardStepId;
  /** Número do passo atual (1-based), para apresentação (Requisito 10.5). */
  readonly stepNumber: number;
  /** Número total de passos (Requisito 10.5). */
  readonly totalSteps: number;
  /** Título do passo, em português. */
  readonly title: string;
  /** Instrução de orientação do passo (Requisito 10.1). */
  readonly orientation: string;
  /** Indica se é possível navegar para o passo anterior (Requisito 1.6). */
  readonly canGoBack: boolean;
  /** Indica se este é o último passo da sequência. */
  readonly isLastStep: boolean;
}

/**
 * "Mala de dados" do Assistente: dados já introduzidos pelo Dono_da_Loja ao
 * longo dos passos. É preservada em todas as transições, incluindo a
 * navegação para trás (Requisitos 1.6, 10.4).
 */
export type WizardData = Readonly<Record<string, unknown>>;

/**
 * Estado imutável do Assistente_de_Criação: o índice do passo atual (0-based)
 * e a mala de dados acumulada.
 */
export interface WizardState {
  /** Índice (0-based) do passo atual na {@link WIZARD_STEP_SEQUENCE}. */
  readonly currentStepIndex: number;
  /** Dados já introduzidos, preservados entre passos (Requisitos 1.6, 10.4). */
  readonly data: WizardData;
}

/**
 * Cria um novo estado de Assistente, posicionado no primeiro passo
 * (Requisito 1.2). Aceita opcionalmente dados iniciais para a mala de dados.
 */
export function createWizard(initialData: WizardData = {}): WizardState {
  return {
    currentStepIndex: 0,
    data: { ...initialData },
  };
}

/** Restringe um índice ao intervalo válido de passos [0, total-1]. */
function clampStepIndex(index: number): number {
  if (index < 0) {
    return 0;
  }
  const lastIndex = TOTAL_WIZARD_STEPS - 1;
  if (index > lastIndex) {
    return lastIndex;
  }
  return index;
}

/** Funde a mala de dados atual com um patch opcional, sem mutação. */
function mergeData(current: WizardData, patch?: WizardData): WizardData {
  if (patch === undefined) {
    return current;
  }
  return { ...current, ...patch };
}

/**
 * Devolve o descritor do passo atual, com os indicadores de número do passo
 * atual/total e a instrução de orientação (Requisitos 1.6, 10.1, 10.5).
 */
export function getCurrentStep(state: WizardState): WizardStepDescriptor {
  const index = clampStepIndex(state.currentStepIndex);
  const id = WIZARD_STEP_SEQUENCE[index]!;
  const meta = WIZARD_STEP_META[id];

  return {
    id,
    stepNumber: index + 1,
    totalSteps: TOTAL_WIZARD_STEPS,
    title: meta.title,
    orientation: meta.orientation,
    canGoBack: index > 0,
    isLastStep: index === TOTAL_WIZARD_STEPS - 1,
  };
}

/**
 * Avança para o passo seguinte, fundindo um patch opcional de dados na mala de
 * dados. Os dados já introduzidos são sempre preservados (Requisito 1.6). No
 * último passo, o índice permanece inalterado (não há passo seguinte nesta
 * camada; a conclusão é tratada na confirmação final).
 */
export function nextStep(state: WizardState, dataPatch?: WizardData): WizardState {
  return {
    currentStepIndex: clampStepIndex(state.currentStepIndex + 1),
    data: mergeData(state.data, dataPatch),
  };
}

/**
 * Regressa ao passo anterior **sem perder** os dados já introduzidos
 * (Requisitos 1.6, 10.4). Um patch opcional permite guardar edições do passo
 * atual antes de recuar. No primeiro passo, o índice permanece inalterado.
 */
export function previousStep(state: WizardState, dataPatch?: WizardData): WizardState {
  return {
    currentStepIndex: clampStepIndex(state.currentStepIndex - 1),
    data: mergeData(state.data, dataPatch),
  };
}

/**
 * Atualiza a mala de dados do passo atual sem alterar o passo, preservando os
 * restantes dados (Requisitos 1.6, 10.4). Útil para registar edições parciais.
 */
export function updateWizardData(state: WizardState, dataPatch: WizardData): WizardState {
  return {
    currentStepIndex: state.currentStepIndex,
    data: mergeData(state.data, dataPatch),
  };
}

/**
 * Constrói o texto do indicador de progresso em português, no formato
 * "Passo {atual} de {total}" (Requisito 10.5).
 */
export function describeProgress(state: WizardState): string {
  const { stepNumber, totalSteps } = getCurrentStep(state);
  return `Passo ${stepNumber} de ${totalSteps}`;
}
