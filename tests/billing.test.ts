/**
 * Subscrição de uma conta (`src/services/billing.ts`).
 *
 * ## A avaria que estes exemplos guardam
 *
 * A versão anterior tinha cinco ramos a interagir — plano pago dentro do prazo,
 * plano agendado (carry-over), teste grátis, atribuição permanente e expirado.
 * Um deles era um acidente: um plano gravado SEM data de expiração contava como
 * permanente. O assistente de criação de loja gravava exactamente isso ao
 * registar o plano que o dono escolhia e não pagava, pelo que qualquer conta
 * ficava com plano vitalício grátis quando o teste acabava.
 *
 * Pior: o espelho que corre nas funções serverless não tinha esse ramo e lia
 * «básico». O painel dizia ao dono que tinha plano ativo, ele ligava os
 * pagamentos, e os clientes dele batiam em `PLAN_NOT_COVERED` no checkout.
 *
 * Agora a regra é uma: **ativo se for administrador, ou se `planExpiresAt` for
 * futuro.** O que se fixa aqui é que não voltam a aparecer ramos.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O estado tem quatro casos nomeáveis — admin, pago, caducado, nunca pagou — e
 * a fronteira entre eles é um instante. É isso que se enumera. A aritmética de
 * renovação tem os seus próprios exemplos, incluindo o dia exacto da fronteira.
 */
import { describe, it, expect } from "vitest";
import { resolveBilling, planActivationPatch } from "../src/services/billing.js";

const DIA = 86_400_000;
const AGORA = Date.parse("2026-06-01T00:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

describe("resolveBilling — quatro estados, sem ramos escondidos", () => {
  it("administrador tem acesso sem nunca pagar", () => {
    const s = resolveBilling({ planExpiresAt: null, isAdmin: true }, AGORA);
    expect(s.accessActive).toBe(true);
    expect(s.byAdmin).toBe(true);
    expect(s.suspended).toBe(false);
    expect(s.expiresAt).toBeNull();
  });

  it("subscrição paga e dentro do prazo", () => {
    const s = resolveBilling({ planExpiresAt: iso(AGORA + 10 * DIA) }, AGORA);
    expect(s.accessActive).toBe(true);
    expect(s.suspended).toBe(false);
    expect(s.expired).toBe(false);
    expect(s.daysRemaining).toBe(10);
    expect(s.byAdmin).toBe(false);
  });

  it("subscrição caducada suspende a conta", () => {
    const s = resolveBilling({ planExpiresAt: iso(AGORA - DIA) }, AGORA);
    expect(s.accessActive).toBe(false);
    expect(s.suspended).toBe(true);
    expect(s.expired).toBe(true);
    expect(s.daysRemaining).toBeNull();
    expect(s.expiresAt).toBeNull();
  });

  it("quem nunca pagou está suspenso, mas não «caducado»", () => {
    // A distinção interessa ao painel: «Ative a subscrição» é uma mensagem
    // diferente de «A sua subscrição terminou».
    const s = resolveBilling({ planExpiresAt: null }, AGORA);
    expect(s.suspended).toBe(true);
    expect(s.expired).toBe(false);
  });

  it("uma data ilegível conta como não ter pago", () => {
    const s = resolveBilling({ planExpiresAt: "não é uma data" }, AGORA);
    expect(s.accessActive).toBe(false);
    expect(s.expired).toBe(false);
  });

  it("NÃO existe plano vitalício grátis", () => {
    // Era isto que dava Profissional para sempre a quem escolhesse um plano no
    // assistente sem pagar. Sem data futura não há acesso, ponto final.
    const s = resolveBilling({ planExpiresAt: null, isAdmin: false }, AGORA);
    expect(s.accessActive).toBe(false);
  });

  it("o instante exacto da expiração já não dá acesso", () => {
    expect(resolveBilling({ planExpiresAt: iso(AGORA) }, AGORA).accessActive).toBe(false);
    expect(resolveBilling({ planExpiresAt: iso(AGORA + 1) }, AGORA).accessActive).toBe(true);
  });
});

describe("planActivationPatch — o que um pagamento confirmado grava", () => {
  it("quem nunca pagou começa a contar de agora", () => {
    const p = planActivationPatch({ planExpiresAt: null }, "mensal", AGORA);
    expect(p.plan_expires_at).toBe(iso(AGORA + 30 * DIA));
  });

  it("o ciclo anual dá 365 dias", () => {
    const p = planActivationPatch({ planExpiresAt: null }, "anual", AGORA);
    expect(p.plan_expires_at).toBe(iso(AGORA + 365 * DIA));
  });

  it("renovar acrescenta AO FIM do período atual, sem perder dias", () => {
    // Quem paga adiantado não pode perder o tempo que ainda tinha.
    const fim = AGORA + 10 * DIA;
    const p = planActivationPatch({ planExpiresAt: iso(fim) }, "mensal", AGORA);
    expect(p.plan_expires_at).toBe(iso(fim + 30 * DIA));
  });

  it("um período já caducado não é aproveitado", () => {
    // Somar ao fim de um período caducado dava menos dias do que os comprados.
    const p = planActivationPatch({ planExpiresAt: iso(AGORA - 100 * DIA) }, "mensal", AGORA);
    expect(p.plan_expires_at).toBe(iso(AGORA + 30 * DIA));
  });

  it("um ciclo que não se percebe é cobrado como mensal", () => {
    const p = planActivationPatch({ planExpiresAt: null }, "vitalicio", AGORA);
    expect(p.plan_expires_at).toBe(iso(AGORA + 30 * DIA));
  });
});
