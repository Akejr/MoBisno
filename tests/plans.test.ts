/**
 * Subscrição: um plano, dois ciclos (`src/services/plans.ts`).
 *
 * ## O que estes exemplos guardam
 *
 * A versão anterior tinha três escalões com uma matriz de limites e
 * funcionalidades. Caiu porque produzia complexidade a mais para o que
 * entregava — e porque o escalão Básico desligava o Multicaixa Express, ou
 * seja, cobrava-se a alguém para essa pessoa **não** poder receber pagamentos
 * online, que é a principal razão para usar a plataforma.
 *
 * O que fica fixado aqui é o pouco que sobrou e que não pode derivar: os dois
 * preços, as duas durações, e a aritmética do desconto anual — a única conta do
 * módulo, e a que aparece na página de preços.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O módulo é um catálogo: dois ciclos, dois preços, duas durações. Não há
 * espaço de entrada a explorar; há valores a fixar para que ninguém os mude sem
 * reparar que a página de preços passa a mentir.
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_ID, BILLING_PERIODS, PRICE_KZ, PERIOD_DAYS,
  isBillingPeriod, asBillingPeriod, priceOf, daysOf,
  yearlySavingKz, yearlyFreeMonths,
} from "../src/services/plans.js";

describe("Catálogo — um plano, dois ciclos", () => {
  it("há um só plano", () => {
    expect(PLAN_ID).toBe("pro");
  });

  it("os ciclos são mensal e anual, por esta ordem", () => {
    expect([...BILLING_PERIODS]).toEqual(["mensal", "anual"]);
  });

  it("os preços são os anunciados", () => {
    expect(PRICE_KZ.mensal).toBe(11_000);
    expect(PRICE_KZ.anual).toBe(120_000);
    expect(priceOf("mensal")).toBe(11_000);
    expect(priceOf("anual")).toBe(120_000);
  });

  it("as durações são 30 e 365 dias", () => {
    expect(PERIOD_DAYS.mensal).toBe(30);
    expect(PERIOD_DAYS.anual).toBe(365);
    expect(daysOf("anual")).toBe(365);
  });
});

describe("Desconto anual — a conta que aparece na página de preços", () => {
  it("o anual poupa face a doze meses avulsos", () => {
    expect(yearlySavingKz()).toBe(PRICE_KZ.mensal * 12 - PRICE_KZ.anual);
    expect(yearlySavingKz()).toBe(12_000);
  });

  it("a poupança equivale a um mês grátis, não a dois", () => {
    // 120.000 são 10,9 meses de preço mensal. Anunciar «dois meses grátis»
    // seria falso — e chegou a ser escrito assim.
    expect(yearlyFreeMonths()).toBe(1);
  });

  it("nunca anuncia poupança negativa se os preços mudarem", () => {
    // Se um dia o anual deixar de compensar, a página mostra zero em vez de um
    // número negativo.
    expect(yearlySavingKz()).toBeGreaterThanOrEqual(0);
    expect(yearlyFreeMonths()).toBeGreaterThanOrEqual(0);
  });
});

describe("Leitura de um ciclo vindo de fora", () => {
  it("reconhece os dois ciclos válidos", () => {
    expect(isBillingPeriod("mensal")).toBe(true);
    expect(isBillingPeriod("anual")).toBe(true);
  });

  it("recusa tudo o resto", () => {
    for (const lixo of ["basico", "profissional", "", null, undefined, 7, {}, "ANUAL"]) {
      expect(isBillingPeriod(lixo), String(lixo)).toBe(false);
    }
  });

  it("perante um valor que não percebe, escolhe o ciclo mais barato", () => {
    // O valor chega do corpo de um pedido HTTP e de uma coluna de texto.
    // Recorrer ao anual cobraria 120.000 Kz a quem pediu outra coisa.
    for (const lixo of ["profissional", "", null, undefined, 7, {}]) {
      expect(asBillingPeriod(lixo)).toBe("mensal");
    }
    expect(asBillingPeriod("anual")).toBe("anual");
  });
});
