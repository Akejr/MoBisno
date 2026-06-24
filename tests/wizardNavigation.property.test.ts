import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  createWizard,
  nextStep,
  previousStep,
  updateWizardData,
  TOTAL_WIZARD_STEPS,
  type WizardState,
  type WizardData,
} from "../src/ui/wizard.js";

/**
 * Chaves possíveis dos campos da mala de dados. Um conjunto pequeno e fixo
 * garante que os patches gerados se sobrepõem com frequência, exercitando
 * tanto a preservação como a sobrescrita explícita de campos.
 */
const fieldKeyArb: fc.Arbitrary<string> = fc.constantFrom(
  "nome",
  "tipo",
  "modelo",
  "subdominio",
  "email",
  "password",
);

/** Valor de um campo: string, número ou booleano (dados típicos do Assistente). */
const fieldValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
);

/** Mala de dados (record de chaves de campo para valores). */
const dataBagArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fieldKeyArb,
  fieldValueArb,
  { maxKeys: 6 },
);

/** Patch opcional de dados (pode ser indefinido para simular navegação sem edição). */
const dataPatchArb: fc.Arbitrary<Record<string, unknown> | undefined> = fc.option(
  dataBagArb,
  { nil: undefined },
);

/** Ação de navegação aplicada ao estado do Assistente. */
type WizardAction =
  | { readonly kind: "next"; readonly patch?: Record<string, unknown> }
  | { readonly kind: "previous"; readonly patch?: Record<string, unknown> }
  | { readonly kind: "update"; readonly patch: Record<string, unknown> };

const actionArb: fc.Arbitrary<WizardAction> = fc.oneof(
  dataPatchArb.map((patch) => ({ kind: "next" as const, patch })),
  dataPatchArb.map((patch) => ({ kind: "previous" as const, patch })),
  dataBagArb.map((patch) => ({ kind: "update" as const, patch })),
);

describe("Assistente_de_Criação — preservação de dados na navegação (propriedade)", () => {
  it("preserva todos os campos introduzidos em qualquer sequência de navegação, exceto os sobrescritos por um patch posterior", () => {
    // **Feature: mobisno-store-builder, Property 20: Preservação de dados na navegação do Assistente**
    // **Validates: Requirements 1.5, 1.6, 10.2, 10.4**
    assertProperty(
      fc.property(
        dataBagArb,
        fc.array(actionArb, { minLength: 0, maxLength: 30 }),
        (initialData, actions) => {
          let state: WizardState = createWizard(initialData);

          // Mapa de dados esperado, mantido de forma independente: funde os
          // patches pela mesma ordem em que são aplicados ao Assistente.
          let expected: Record<string, unknown> = { ...initialData };

          // Invariante inicial.
          expect(state.data).toEqual(expected);
          expect(state.currentStepIndex).toBeGreaterThanOrEqual(0);
          expect(state.currentStepIndex).toBeLessThanOrEqual(TOTAL_WIZARD_STEPS - 1);

          for (const action of actions) {
            switch (action.kind) {
              case "next":
                state = nextStep(state, action.patch as WizardData | undefined);
                if (action.patch !== undefined) {
                  expected = { ...expected, ...action.patch };
                }
                break;
              case "previous":
                state = previousStep(state, action.patch as WizardData | undefined);
                if (action.patch !== undefined) {
                  expected = { ...expected, ...action.patch };
                }
                break;
              case "update":
                state = updateWizardData(state, action.patch as WizardData);
                expected = { ...expected, ...action.patch };
                break;
            }

            // A mala de dados contém exatamente os campos esperados: nenhum
            // campo previamente introduzido é descartado pela navegação; só é
            // alterado quando um patch posterior o sobrescreve explicitamente
            // (Requisitos 1.5, 1.6, 10.2, 10.4).
            expect(state.data).toEqual(expected);

            // O índice do passo mantém-se sempre dentro do intervalo válido.
            expect(state.currentStepIndex).toBeGreaterThanOrEqual(0);
            expect(state.currentStepIndex).toBeLessThanOrEqual(TOTAL_WIZARD_STEPS - 1);
          }
        },
      ),
    );
  });
});
