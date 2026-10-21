import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { digitalPaymentsVisible } from "../src/services/paymentVisibility.js";
import { PAYMENTS_PROVIDER_READY } from "../src/services/payments.js";
import * as visibilidade from "../src/services/paymentVisibility.js";
import { fornecedorLigadoArb, lojaPagamentosArb } from "./geradores.js";

/**
 * Teste da **Propriedade 1** da spec `melhorias-loja-e-admin`, na forma que a
 * regra tem agora.
 *
 * A decisão única de visibilidade dos pagamentos digitais (Multicaixa Express e
 * Referência Bancária) é `digitalPaymentsVisible(store, providerReady)`: só
 * aparecem quando a Loja foi **aprovada** (`stores.digital_payments`, que só a
 * aprovação da verificação de empresa liga) **e** o fornecedor de pagamentos
 * está ligado. As duas juntas, e só o booleano `true` em cada uma.
 *
 * A versão anterior decidia por `customization.payments.onlineEnabled` — um
 * interruptor que o próprio Dono escrevia — e por uma marca de demonstração. A
 * Personalização gerada traz essas marcas antigas, ligadas, para provar que já
 * não decidem nada.
 *
 * Os geradores vivem todos em `tests/geradores.ts` — este ficheiro não define
 * nenhum.
 */

/**
 * Oráculo independente: comparações estritas, sem coerção.
 *
 * `providerReady` é um parâmetro **opcional**, por isso `undefined` não é «não
 * está ligado»: é «não disseste nada, usa o estado real» — a semântica normal de
 * um valor por omissão em JavaScript, e a que o exemplo «por omissão usa o
 * estado real do fornecedor» fixa mais abaixo. O oráculo tem de modelar isso.
 *
 * Esta linha faltava, e durante muito tempo não se notou: enquanto
 * `PAYMENTS_PROVIDER_READY` era `false`, o valor por omissão dava `false` e o
 * oráculo acertava por coincidência. Ao ligar o fornecedor (Wiza), o `undefined`
 * do gerador passou a valer `true` na implementação e `false` aqui, e o teste
 * começou a falhar só nas sementes em que o gerador escolhe `undefined`. Uma
 * falha intermitente num teste de propriedade é quase sempre isto: o oráculo a
 * descrever o contrato de forma incompleta.
 */
function oraculo(store: unknown, ready: unknown): boolean {
  const pronto = ready === undefined ? PAYMENTS_PROVIDER_READY : ready;
  if (pronto !== true) return false;
  if (store === null || (typeof store !== "object" && typeof store !== "function")) return false;
  return (store as { digitalPayments?: unknown }).digitalPayments === true;
}

/** A Loja com outra Personalização (ou sem nenhuma), quando é um objeto. */
function comPersonalizacao(store: unknown, customization: unknown): unknown {
  if (typeof store !== "object" || store === null || Array.isArray(store)) return store;
  const copia: Record<string, unknown> = { ...(store as Record<string, unknown>) };
  if (customization === undefined) delete copia.customization;
  else copia.customization = customization;
  return copia;
}

type Visivel = (store: unknown, providerReady?: unknown) => boolean;
const visivel = digitalPaymentsVisible as unknown as Visivel;

describe("paymentVisibility — pagamentos digitais só em Lojas aprovadas e com fornecedor ligado (propriedade)", () => {
  it("é verdadeiro se e só se digitalPayments === true e o fornecedor está ligado; total, estrito e insensível à Personalização", () => {
    // Feature: melhorias-loja-e-admin, Property 1: Para qualquer Loja e qualquer estado do fornecedor, os pagamentos digitais são visíveis se e só se store.digitalPayments === true e providerReady === true; a decisão nunca lança, não faz coerção e ignora a Personalização (payments.onlineEnabled, __demoPayments, __basedOn, __template)
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.13, 3.16**
    let viuVisivel = false;
    let viuMarcasAntigasLigadas = false;

    assertProperty(
      fc.property(lojaPagamentosArb, fornecedorLigadoArb, (store, ready) => {
        // 1. Total: nunca lança, para qualquer valor.
        expect(() => visivel(store, ready)).not.toThrow();

        // 2. Exatamente as duas comparações estritas.
        const resultado = visivel(store, ready);
        expect(resultado).toBe(oraculo(store, ready));
        if (resultado) viuVisivel = true;

        // 3. A Personalização não decide nada: nem as marcas antigas ligadas,
        //    nem a ausência delas.
        const custom = (store as { customization?: { payments?: { onlineEnabled?: unknown }; __demoPayments?: unknown } } | null)
          ?.customization;
        if (custom?.payments?.onlineEnabled === true || custom?.__demoPayments === true) viuMarcasAntigasLigadas = true;
        expect(visivel(comPersonalizacao(store, undefined), ready)).toBe(resultado);
        expect(visivel(comPersonalizacao(store, { payments: { onlineEnabled: true }, __demoPayments: true }), ready))
          .toBe(resultado);

        // 4. Sem fornecedor ligado, nenhuma Loja mostra pagamentos digitais.
        expect(visivel(store, false)).toBe(false);
      }),
      { numRuns: 200 },
    );

    // Guardas contra uma propriedade que passe por trivialidade.
    expect(viuVisivel).toBe(true);
    expect(viuMarcasAntigasLigadas).toBe(true);
  });

  it("só o booleano true conta, em digitalPayments e no fornecedor", () => {
    // `undefined` não entra nesta lista de propósito: no fornecedor significa
    // «usa o valor por omissão», e tem o exemplo a seguir.
    const truthy: unknown[] = ["true", 1, {}, [], "sim"];
    for (const valor of truthy) {
      expect(visivel({ digitalPayments: valor }, true), JSON.stringify(valor)).toBe(false);
      expect(visivel({ digitalPayments: true }, valor), JSON.stringify(valor)).toBe(false);
    }
    expect(visivel({ digitalPayments: true }, true)).toBe(true);
  });

  it("por omissão usa o estado real do fornecedor (PAYMENTS_PROVIDER_READY)", () => {
    for (const store of [{ digitalPayments: true }, { digitalPayments: false }, {}, null]) {
      expect(digitalPaymentsVisible(store)).toBe(digitalPaymentsVisible(store, PAYMENTS_PROVIDER_READY));
      // Passar `undefined` é o mesmo que não passar nada. É isto que o oráculo
      // da propriedade tem de modelar, e é a diferença que fazia o teste falhar
      // só em algumas sementes depois de o fornecedor ter sido ligado.
      expect(visivel(store, undefined)).toBe(digitalPaymentsVisible(store));
    }
  });

  it("as decisões antigas saíram do módulo", () => {
    // `onlinePaymentsVisible` e `isPaymentsDemo` decidiam pela Personalização.
    expect(visibilidade).not.toHaveProperty("onlinePaymentsVisible");
    expect(visibilidade).not.toHaveProperty("isPaymentsDemo");
  });
});
