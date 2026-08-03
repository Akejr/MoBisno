import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { onlinePaymentsVisible, isPaymentsDemo } from "../src/services/paymentVisibility.js";
import { customizationArb } from "./geradores.js";

/**
 * Teste da **Propriedade 1** da spec `melhorias-loja-e-admin`.
 *
 * A regra sob teste é a decisão única de visibilidade dos métodos de pagamento
 * online (`src/services/paymentVisibility.ts`). Existe porque a versão anterior
 * da regra lia `__basedOn`/`__template`: como `__basedOn` **é copiado** para a
 * Personalização da Loja do cliente ao aplicar um Modelo_De_Loja, uma Loja nova
 * sem pagamentos online ativos anunciava Multicaixa Express e Referência
 * Bancária no Checkout. As asserções 3 e 4 são a guarda de que isso não volta.
 *
 * Os geradores vivem todos em `tests/geradores.ts` — este ficheiro não define
 * nenhum.
 */

/** A decisão tal como as vistas a compõem (Checkout e Gaveta_Do_Carrinho). */
function visivel(custom: unknown): boolean {
  return onlinePaymentsVisible(custom) || isPaymentsDemo(custom);
}

/** Cópia da Personalização sem uma chave. */
function semChave(custom: Record<string, unknown>, chave: string): Record<string, unknown> {
  const copia = { ...custom };
  delete copia[chave];
  return copia;
}

/** Cópia da Personalização com uma chave definida com o valor dado. */
function comChave(
  custom: Record<string, unknown>,
  chave: string,
  valor: unknown,
): Record<string, unknown> {
  return { ...custom, [chave]: valor };
}

/**
 * Valores de `__basedOn`/`__template` usados para provar a insensibilidade da
 * regra: identificadores reais de Modelo_De_Loja, mais tipos errados.
 */
const VALORES_DE_MARCA: readonly unknown[] = [
  "vermelho-moderno",
  "lumiere",
  "neonlab",
  true,
  1,
  {},
];

/**
 * Valores de `__demoPayments` usados na asserção 4. Só o booleano `true` liga a
 * marca de demonstração; os restantes (incluindo os *truthy* `"true"`, `1`, `{}`)
 * não, porque a comparação é estrita.
 */
const VALORES_DE_DEMO: readonly unknown[] = [true, false, "true", 1, 0, {}, [], null, undefined];

describe("paymentVisibility — visibilidade dos métodos de pagamento online (propriedade)", () => {
  it("a visibilidade é payments.onlineEnabled === true || __demoPayments === true, ignora __basedOn e __template, e só depende de __demoPayments quando os pagamentos online não estão ativos", () => {
    // Feature: melhorias-loja-e-admin, Property 1: Para qualquer Personalização, a visibilidade dos métodos de pagamento online é igual a payments.onlineEnabled === true || __demoPayments === true, é insensível a __basedOn e __template, e só depende de __demoPayments quando payments.onlineEnabled não é true
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.13, 3.16**
    assertProperty(
      fc.property(customizationArb, (custom) => {
        // 1. Nenhuma das funções lança, para qualquer forma de Personalização.
        expect(() => onlinePaymentsVisible(custom)).not.toThrow();
        expect(() => isPaymentsDemo(custom)).not.toThrow();

        const resultado = visivel(custom);

        // 2. O resultado é exatamente a disjunção das duas comparações estritas.
        const payments = (custom as { payments?: { onlineEnabled?: unknown } }).payments;
        const onlineAtivo = payments?.onlineEnabled === true;
        const demoAtiva = (custom as { __demoPayments?: unknown }).__demoPayments === true;
        expect(resultado).toBe(onlineAtivo || demoAtiva);

        // 3. Acrescentar ou remover `__basedOn`/`__template` não muda nada: a
        //    regra não lê nenhuma das duas marcas.
        const semMarcas = semChave(semChave(custom, "__basedOn"), "__template");
        expect(visivel(semMarcas)).toBe(resultado);
        for (const valor of VALORES_DE_MARCA) {
          expect(visivel(comChave(semMarcas, "__basedOn", valor))).toBe(resultado);
          expect(visivel(comChave(semMarcas, "__template", valor))).toBe(resultado);
          expect(
            visivel(comChave(comChave(custom, "__basedOn", valor), "__template", valor)),
          ).toBe(resultado);
        }

        // 4. `__demoPayments` só altera o resultado quando `payments.onlineEnabled`
        //    não é `true`. Com os pagamentos online ativos, a marca é irrelevante;
        //    sem eles, a marca é a única coisa que decide.
        const semDemo = semChave(custom, "__demoPayments");
        if (onlineAtivo) {
          expect(visivel(semDemo)).toBe(true);
          for (const valor of VALORES_DE_DEMO) {
            expect(visivel(comChave(semDemo, "__demoPayments", valor))).toBe(true);
          }
        } else {
          expect(visivel(semDemo)).toBe(false);
          for (const valor of VALORES_DE_DEMO) {
            expect(visivel(comChave(semDemo, "__demoPayments", valor))).toBe(valor === true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
