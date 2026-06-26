import { describe, it, expect } from "vitest";
import { resolveBilling, planActivationPatch, PLAN_PERIOD_DAYS } from "../src/services/billing.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-01T00:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

describe("resolveBilling", () => {
  it("básico é sempre a linha de base e nunca expira", () => {
    const s = resolveBilling({ plan: "basico", planExpiresAt: null, nextPlan: null }, NOW);
    expect(s.effectivePlan).toBe("basico");
    expect(s.expiresAt).toBeNull();
    expect(s.daysRemaining).toBeNull();
    expect(s.transition).toBeNull();
  });

  it("plano pago sem expiração é permanente (atribuição admin)", () => {
    const s = resolveBilling({ plan: "profissional", planExpiresAt: null, nextPlan: null }, NOW);
    expect(s.effectivePlan).toBe("profissional");
    expect(s.permanent).toBe(true);
    expect(s.transition).toBeNull();
  });

  it("plano pago dentro do período mantém-se ativo com dias restantes", () => {
    const s = resolveBilling({ plan: "profissional", planExpiresAt: iso(NOW + 10 * DAY), nextPlan: null }, NOW);
    expect(s.effectivePlan).toBe("profissional");
    expect(s.daysRemaining).toBe(10);
    expect(s.expired).toBe(false);
  });

  it("plano pago expirado cai para básico e pede transição", () => {
    const s = resolveBilling({ plan: "empresarial", planExpiresAt: iso(NOW - DAY), nextPlan: null }, NOW);
    expect(s.effectivePlan).toBe("basico");
    expect(s.expired).toBe(true);
    expect(s.transition).toEqual({ plan: "basico", planExpiresAt: null, nextPlan: null });
  });

  it("promove o plano agendado quando o atual termina (carry-over)", () => {
    // Expirou há 1 dia; nextPlan cobre +30 dias a partir do fim.
    const expired = NOW - DAY;
    const s = resolveBilling({ plan: "empresarial", planExpiresAt: iso(expired), nextPlan: "profissional" }, NOW);
    expect(s.effectivePlan).toBe("profissional");
    expect(s.expired).toBe(false);
    expect(s.transition?.plan).toBe("profissional");
    expect(s.daysRemaining).toBe(PLAN_PERIOD_DAYS - 1);
  });
});

describe("planActivationPatch", () => {
  it("ativa de imediato quando não há período em curso", () => {
    const p = planActivationPatch({ plan: "basico", planExpiresAt: null, nextPlan: null }, "profissional", NOW);
    expect(p.plan).toBe("profissional");
    expect(p.plan_expires_at).toBe(iso(NOW + PLAN_PERIOD_DAYS * DAY));
    expect(p.next_plan).toBeNull();
  });

  it("renova o mesmo plano estendendo o período", () => {
    const exp = NOW + 5 * DAY;
    const p = planActivationPatch({ plan: "profissional", planExpiresAt: iso(exp), nextPlan: null }, "profissional", NOW);
    expect(p.plan).toBeUndefined();
    expect(p.plan_expires_at).toBe(iso(exp + PLAN_PERIOD_DAYS * DAY));
  });

  it("agenda um plano diferente quando ainda há tempo (mantém o atual)", () => {
    const exp = NOW + 5 * DAY;
    const p = planActivationPatch({ plan: "empresarial", planExpiresAt: iso(exp), nextPlan: null }, "profissional", NOW);
    expect(p.next_plan).toBe("profissional");
    expect(p.plan).toBeUndefined();
    expect(p.plan_expires_at).toBeUndefined();
  });
});
