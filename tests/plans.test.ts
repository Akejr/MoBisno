import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  DEFAULT_PLAN,
  getPlan,
  isPlanId,
  listPlans,
  planRank,
  canPublishAnotherStore,
  canAddProducts,
  remainingProducts,
  allowedCheckoutMethods,
  formatLimit,
} from "../src/services/plans.js";

describe("plans — catálogo e type guards", () => {
  it("expõe os três planos na ordem canónica", () => {
    expect(PLAN_ORDER).toEqual(["basico", "profissional", "empresarial"]);
    expect(listPlans().map((p) => p.id)).toEqual(PLAN_ORDER);
  });

  it("isPlanId reconhece apenas identificadores válidos", () => {
    expect(isPlanId("basico")).toBe(true);
    expect(isPlanId("profissional")).toBe(true);
    expect(isPlanId("empresarial")).toBe(true);
    expect(isPlanId("gratis")).toBe(false);
    expect(isPlanId(null)).toBe(false);
    expect(isPlanId(123)).toBe(false);
  });

  it("getPlan recorre ao plano por omissão para valores inválidos", () => {
    expect(getPlan("profissional").id).toBe("profissional");
    expect(getPlan("desconhecido").id).toBe(DEFAULT_PLAN);
    expect(getPlan(undefined).id).toBe(DEFAULT_PLAN);
  });

  it("os preços correspondem ao definido", () => {
    expect(PLANS.basico.priceKz).toBe(5000);
    expect(PLANS.profissional.priceKz).toBe(11000);
    expect(PLANS.empresarial.priceKz).toBe(25000);
  });
});

describe("plans — limites de lojas publicadas", () => {
  it("Básico permite exatamente 1 loja publicada", () => {
    expect(canPublishAnotherStore(PLANS.basico, 0)).toBe(true);
    expect(canPublishAnotherStore(PLANS.basico, 1)).toBe(false);
    expect(canPublishAnotherStore(PLANS.basico, 2)).toBe(false);
  });

  it("Profissional permite até 3 lojas publicadas", () => {
    expect(canPublishAnotherStore(PLANS.profissional, 2)).toBe(true);
    expect(canPublishAnotherStore(PLANS.profissional, 3)).toBe(false);
  });

  it("Empresarial não tem limite de lojas publicadas", () => {
    expect(canPublishAnotherStore(PLANS.empresarial, 999)).toBe(true);
  });
});

describe("plans — limites de produtos por loja", () => {
  it("Básico permite até 100 produtos", () => {
    expect(canAddProducts(PLANS.basico, 99)).toBe(true);
    expect(canAddProducts(PLANS.basico, 100)).toBe(false);
    expect(remainingProducts(PLANS.basico, 40)).toBe(60);
    expect(remainingProducts(PLANS.basico, 200)).toBe(0);
  });

  it("Profissional e Empresarial têm produtos ilimitados", () => {
    expect(canAddProducts(PLANS.profissional, 10_000)).toBe(true);
    expect(canAddProducts(PLANS.empresarial, 10_000)).toBe(true);
    expect(remainingProducts(PLANS.profissional, 10_000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("plans — checkout e ranking", () => {
  it("checkout: Básico só WhatsApp; Profissional+ adiciona Multicaixa", () => {
    expect(allowedCheckoutMethods(PLANS.basico)).toEqual(["whatsapp"]);
    expect(allowedCheckoutMethods(PLANS.profissional)).toEqual(["whatsapp", "multicaixa"]);
    expect(allowedCheckoutMethods(PLANS.empresarial)).toEqual(["whatsapp", "multicaixa"]);
  });

  it("planRank reflete a ordem canónica", () => {
    expect(planRank("basico")).toBe(0);
    expect(planRank("profissional")).toBe(1);
    expect(planRank("empresarial")).toBe(2);
  });

  it("formatLimit apresenta 'Ilimitado' para infinito", () => {
    expect(formatLimit(100)).toBe("100");
    expect(formatLimit(Number.POSITIVE_INFINITY)).toBe("Ilimitado");
  });
});
