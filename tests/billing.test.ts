import { describe, it, expect } from "vitest";
import { resolveBilling, planActivationPatch, PLAN_PERIOD_DAYS } from "../src/services/billing.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-01T00:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

describe("resolveBilling", () => {
  it("conta nova em teste tem acesso e usa o plano escolhido", () => {
    const s = resolveBilling({ plan: "profissional", planExpiresAt: null, nextPlan: null, trialEndsAt: iso(NOW + 5 * DAY) }, NOW);
    expect(s.inTrial).toBe(true);
    expect(s.accessActive).toBe(true);
    expect(s.suspended).toBe(false);
    expect(s.effectivePlan).toBe("profissional");
    expect(s.trialDaysRemaining).toBe(5);
  });

  it("teste terminado sem plano pago → suspensa (loja offline)", () => {
    const s = resolveBilling({ plan: "basico", planExpiresAt: null, nextPlan: null, trialEndsAt: iso(NOW - DAY) }, NOW);
    expect(s.accessActive).toBe(false);
    expect(s.suspended).toBe(true);
    expect(s.inTrial).toBe(false);
  });

  it("admin tem sempre acesso", () => {
    const s = resolveBilling({ plan: "basico", planExpiresAt: null, nextPlan: null, trialEndsAt: iso(NOW - DAY), isAdmin: true }, NOW);
    expect(s.accessActive).toBe(true);
    expect(s.suspended).toBe(false);
  });

  it("plano pago dentro do período mantém-se ativo com dias restantes", () => {
    const s = resolveBilling({ plan: "profissional", planExpiresAt: iso(NOW + 10 * DAY), nextPlan: null, trialEndsAt: iso(NOW - DAY) }, NOW);
    expect(s.effectivePlan).toBe("profissional");
    expect(s.daysRemaining).toBe(10);
    expect(s.accessActive).toBe(true);
    expect(s.suspended).toBe(false);
  });

  it("plano pago expirado e teste terminado → suspensa", () => {
    const s = resolveBilling({ plan: "empresarial", planExpiresAt: iso(NOW - DAY), nextPlan: null, trialEndsAt: iso(NOW - 30 * DAY) }, NOW);
    expect(s.suspended).toBe(true);
    expect(s.accessActive).toBe(false);
  });

  it("promove o plano agendado quando o atual termina (carry-over)", () => {
    const expired = NOW - DAY;
    const s = resolveBilling({ plan: "empresarial", planExpiresAt: iso(expired), nextPlan: "profissional", trialEndsAt: iso(NOW - 30 * DAY) }, NOW);
    expect(s.effectivePlan).toBe("profissional");
    expect(s.accessActive).toBe(true);
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
