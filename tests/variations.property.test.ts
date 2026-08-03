import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { effectivePrice } from "../src/services/variations.js";
import { combinationArb, modoDePrecoArb, precoBaseArb } from "./geradores.js";

describe("variations — preço efetivo de uma Combinação (propriedade)", () => {
  it("nunca é negativo e é igual ao preço base quando a Combinação não define preço", () => {
    // Feature: melhorias-loja-e-admin, Property 2: Para qualquer preço base, Combinação e modo de preço, o preço efetivo nunca é negativo e é igual ao preço base quando a Combinação não define preço
    // **Validates: Requirements 4.6, 4.7, 4.8, 4.16**

    // Guardas anti-trivialidade. Cada uma das três regras de R4.6/R4.7/R4.8 só
    // é exercida numa fatia das amostras, e a quarta — o limite inferior a 0 —
    // exige um desconto por versão maior do que o preço base. Sem estes
    // registos, um gerador que deixasse de produzir uma das fatias faria a
    // propriedade passar sem nunca ter testado o que existe para testar, e
    // ninguém dava por isso.
    let viuCombinacaoSemPreco = false;
    let viuSubstituiComPreco = false;
    let viuAcresceComPreco = false;
    let viuLimiteInferiorAplicado = false;

    assertProperty(
      fc.property(precoBaseArb, combinationArb, modoDePrecoArb, (basePrice, comb, mode) => {
        const preco = effectivePrice(basePrice, comb, mode);

        // Garantia central, válida em todos os ramos: número finito e ≥ 0. Um
        // `NaN` ou um preço negativo aqui chegariam ao total do Checkout.
        expect(Number.isFinite(preco)).toBe(true);
        expect(preco).toBeGreaterThanOrEqual(0);

        if (comb.price === undefined) {
          // R4.8 — sem preço na Combinação, o preço é o do Produto, em qualquer
          // dos dois modos. É também o comportamento que R4.16 preserva.
          viuCombinacaoSemPreco = true;
          expect(preco).toBe(basePrice);
        } else if (mode === "substitui") {
          // R4.6 — o preço da Combinação substitui o base. `precoBaseArb` só
          // gera valores ≥ 0 e o preço da Combinação pode ser negativo, pelo que
          // o limite inferior a 0 também se aplica neste ramo.
          viuSubstituiComPreco = true;
          expect(preco).toBe(Math.max(0, comb.price));
        } else {
          // R4.7 — «acresce» soma o preço da Combinação ao base, com o limite
          // inferior a 0 aplicado uma vez, no fim.
          viuAcresceComPreco = true;
          const soma = basePrice + comb.price;
          expect(preco).toBe(Math.max(0, soma));
          if (soma < 0) {
            expect(preco).toBe(0);
            viuLimiteInferiorAplicado = true;
          }
        }
      }),
      { numRuns: 100 },
    );

    expect(viuCombinacaoSemPreco).toBe(true);
    expect(viuSubstituiComPreco).toBe(true);
    expect(viuAcresceComPreco).toBe(true);
    expect(viuLimiteInferiorAplicado).toBe(true);
  });
});
