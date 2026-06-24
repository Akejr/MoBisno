/**
 * Testes unitários da UI da página inicial e do Assistente_de_Criação
 * (Tarefa 12.4).
 *
 * Foco em comportamentos específicos por exemplo (não quantificação universal):
 *  - Presença da ação única, permanente e acima da dobra "Criar o meu site"
 *    na página inicial (Requisito 1.1).
 *  - Mensagem de retry apresentada quando o arranque do Assistente falha,
 *    mantendo o Visitante na página inicial (Requisito 1.3).
 *  - Apresentação da lista de valores de Tipo_de_Loja para seleção
 *    (Requisito 2.3).
 *  - Apresentação da lista de Modelos com pré-visualização e nome
 *    (Requisito 3.1).
 *  - Apresentação do subdomínio resultante antes da confirmação final
 *    (Requisito 4.6).
 *  - Indicadores de passo (número atual/total) e instrução de orientação
 *    (Requisitos 10.1, 10.5).
 *  - Textos da interface em português (Requisito 10.3).
 *
 * Os módulos de UI são agnósticos de framework, pelo que os testes consomem
 * diretamente os view models/funções puras e o serviço real de identificadores
 * (sem mocks).
 */

import { describe, it, expect } from "vitest";

import {
  createHomePageViewModel,
  HOME_PAGE_VIEW_MODEL,
  CRIAR_SITE_LABEL,
  WIZARD_START_ERROR_MESSAGE,
  WIZARD_START_RETRY_LABEL,
} from "../src/ui/homePage.js";
import {
  createWizard,
  getCurrentStep,
  describeProgress,
  nextStep,
  TOTAL_WIZARD_STEPS,
  WIZARD_STEP_SEQUENCE,
} from "../src/ui/wizard.js";
import {
  buildStoreTypeOptions,
  buildTemplateOptions,
  resolvePassoSubdominio,
  WIZARD_FIELDS,
} from "../src/ui/wizardSteps.js";
import { VALID_STORE_TYPES } from "../src/services/storeService.js";
import { createIdentifierService } from "../src/services/identifierService.js";
import type { Template } from "../src/models/index.js";

/* -------------------------------------------------------------------------- */
/*  Página inicial — ação única acima da dobra (Requisito 1.1)                */
/* -------------------------------------------------------------------------- */

describe("Página inicial — ação única acima da dobra (Req. 1.1)", () => {
  it("apresenta uma única ação permanente, acima da dobra, com o texto exato \"Criar o meu site\"", () => {
    const viewModel = createHomePageViewModel();

    // Rótulo exato exigido pelo requisito.
    expect(viewModel.callToAction.label).toBe("Criar o meu site");
    expect(viewModel.callToAction.label).toBe(CRIAR_SITE_LABEL);

    // Acima da dobra e permanente.
    expect(viewModel.callToAction.aboveTheFold).toBe(true);
    expect(viewModel.callToAction.permanent).toBe(true);

    // Inicia o Assistente_de_Criação.
    expect(viewModel.callToAction.intent).toBe("iniciarAssistente");

    // É a única ação: o view model expõe exatamente um call to action.
    expect(Object.keys(viewModel)).toEqual(["callToAction"]);
  });

  it("o view model pré-construído é equivalente ao construído de fresco", () => {
    expect(HOME_PAGE_VIEW_MODEL).toEqual(createHomePageViewModel());
  });
});

/* -------------------------------------------------------------------------- */
/*  Página inicial — mensagem de retry no arranque (Requisito 1.3)            */
/* -------------------------------------------------------------------------- */

describe("Página inicial — mensagem de retry no arranque (Req. 1.3)", () => {
  it("disponibiliza uma mensagem de falha de arranque e uma opção de tentar novamente em português", () => {
    // Mensagem indica que o início falhou e convida a tentar novamente.
    expect(WIZARD_START_ERROR_MESSAGE.length).toBeGreaterThan(0);
    expect(WIZARD_START_ERROR_MESSAGE).toMatch(/não foi possível|falh/i);
    expect(WIZARD_START_ERROR_MESSAGE).toMatch(/tente novamente/i);

    // Rótulo de repetição da ação, em português.
    expect(WIZARD_START_RETRY_LABEL).toMatch(/tentar novamente/i);
  });
});

/* -------------------------------------------------------------------------- */
/*  Passo Nome/Tipo — lista de Tipo_de_Loja (Requisito 2.3)                   */
/* -------------------------------------------------------------------------- */

describe("Assistente — lista de Tipo_de_Loja para seleção (Req. 2.3)", () => {
  it("apresenta todos os valores de Tipo_de_Loja disponíveis para seleção", () => {
    const options = buildStoreTypeOptions();

    expect(options.map((option) => option.value)).toEqual([...VALID_STORE_TYPES]);
    expect(options.length).toBe(VALID_STORE_TYPES.length);

    // Cada opção tem um rótulo em português (igual ao valor) e nenhuma está
    // selecionada por omissão.
    for (const option of options) {
      expect(option.label).toBe(option.value);
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.selected).toBe(false);
    }
  });

  it("marca como selecionada a opção correspondente ao Tipo_de_Loja escolhido", () => {
    const options = buildStoreTypeOptions("Eletrónica");
    const selected = options.filter((option) => option.selected);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.value).toBe("Eletrónica");
  });
});

/* -------------------------------------------------------------------------- */
/*  Passo Modelo — lista de Modelos com pré-visualização (Requisito 3.1)      */
/* -------------------------------------------------------------------------- */

describe("Assistente — lista de Modelos com pré-visualização e nome (Req. 3.1)", () => {
  const templates: readonly Template[] = [
    { id: "moderno", name: "Moderno", previewUrl: "https://cdn.mobisno.com/moderno.png" },
    { id: "classico", name: "Clássico", previewUrl: "https://cdn.mobisno.com/classico.png" },
  ];

  it("apresenta cada Modelo com o nome identificador e a pré-visualização", () => {
    const options = buildTemplateOptions(templates);

    expect(options).toHaveLength(templates.length);
    options.forEach((option, index) => {
      expect(option.id).toBe(templates[index]!.id);
      expect(option.name).toBe(templates[index]!.name);
      expect(option.previewUrl).toBe(templates[index]!.previewUrl);
      expect(option.selected).toBe(false);
    });
  });

  it("marca como selecionado o Modelo atualmente associado", () => {
    const options = buildTemplateOptions(templates, "classico");
    const selected = options.filter((option) => option.selected);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("classico");
  });
});

/* -------------------------------------------------------------------------- */
/*  Passo Subdomínio — subdomínio apresentado antes da confirmação (Req. 4.6) */
/* -------------------------------------------------------------------------- */

describe("Assistente — subdomínio resultante antes da confirmação (Req. 4.6)", () => {
  it("apresenta o subdomínio derivado do nome, terminado em \".mobisno.store\"", async () => {
    const identifierService = createIdentifierService();
    const data = { [WIZARD_FIELDS.name]: "Loja do João" };

    const result = await resolvePassoSubdominio(data, identifierService);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.value.subdomain.endsWith(".mobisno.store")).toBe(true);
      expect(result.value.subdomain).toBe(`${result.value.identifier}.mobisno.store`);
      expect(result.value.origin).toBe("derivado");
      // Identificador normalizado: apenas [a-z0-9-].
      expect(result.value.identifier).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Indicadores de passo e orientação (Requisitos 10.1, 10.5)                 */
/* -------------------------------------------------------------------------- */

describe("Assistente — indicadores de passo e orientação (Req. 10.1, 10.5)", () => {
  it("getCurrentStep expõe o número do passo atual, o total e uma instrução de orientação", () => {
    const wizard = createWizard();
    const step = getCurrentStep(wizard);

    expect(step.stepNumber).toBe(1);
    expect(step.totalSteps).toBe(TOTAL_WIZARD_STEPS);
    expect(step.totalSteps).toBe(WIZARD_STEP_SEQUENCE.length);
    expect(step.canGoBack).toBe(false);
    expect(step.isLastStep).toBe(false);

    // Instrução de orientação presente e não vazia (Requisito 10.1).
    expect(step.orientation.length).toBeGreaterThan(0);
    expect(step.title.length).toBeGreaterThan(0);
  });

  it("describeProgress devolve \"Passo 1 de N\" no primeiro passo (Req. 10.5)", () => {
    const wizard = createWizard();
    expect(describeProgress(wizard)).toBe(`Passo 1 de ${TOTAL_WIZARD_STEPS}`);
  });

  it("atualiza o indicador de passo ao avançar e permite recuar a partir do segundo passo", () => {
    const wizard = nextStep(createWizard());
    const step = getCurrentStep(wizard);

    expect(describeProgress(wizard)).toBe(`Passo 2 de ${TOTAL_WIZARD_STEPS}`);
    expect(step.stepNumber).toBe(2);
    expect(step.canGoBack).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Textos da interface em português (Requisito 10.3)                         */
/* -------------------------------------------------------------------------- */

describe("Assistente — textos da interface em português (Req. 10.3)", () => {
  it("apresenta rótulos e orientações em português nos passos do Assistente", () => {
    let wizard = createWizard();

    // Percorre toda a sequência de passos e verifica títulos/orientações.
    for (let index = 0; index < TOTAL_WIZARD_STEPS; index += 1) {
      const step = getCurrentStep(wizard);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.orientation.length).toBeGreaterThan(0);
      // Indicador de progresso em português ("Passo X de Y").
      expect(describeProgress(wizard)).toMatch(/^Passo \d+ de \d+$/);
      wizard = nextStep(wizard);
    }

    // Rótulo da ação inicial em português, com o texto exato exigido.
    expect(CRIAR_SITE_LABEL).toBe("Criar o meu site");
  });

  it("usa acentuação portuguesa nas orientações dos passos", () => {
    const orientations = WIZARD_STEP_SEQUENCE.map((_, index) => {
      let wizard = createWizard();
      for (let step = 0; step < index; step += 1) {
        wizard = nextStep(wizard);
      }
      return getCurrentStep(wizard).orientation;
    });

    // Pelo menos uma orientação contém caracteres acentuados típicos do
    // português (ex.: "ã", "ç", "é", "ó", "í").
    const joined = orientations.join(" ");
    expect(joined).toMatch(/[ãâáàçéêíóôõ]/i);
  });
});
