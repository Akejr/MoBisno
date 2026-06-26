/**
 * Faturação de planos (módulo de domínio puro e testável).
 *
 * Resolve o **plano efetivo** de uma conta a partir do plano guardado, da data
 * de expiração e de um eventual plano agendado (`nextPlan`). Regras:
 *
 *  - O plano `basico` é a linha de base gratuita: nunca expira.
 *  - Um plano pago (profissional/empresarial) **com** `planExpiresAt** é uma
 *    subscrição temporizada de 30 dias. Quando expira, cai para `basico`,
 *    a menos que exista um `nextPlan` agendado (ver abaixo).
 *  - Um plano pago **sem** `planExpiresAt` é uma atribuição permanente (ex.:
 *    concedida pelo administrador) e não expira.
 *  - Mudança de plano com tempo restante: o tempo de sobra mantém-se no plano
 *    atual e o novo plano fica agendado em `nextPlan`; quando o atual termina,
 *    o novo arranca por mais um período (carry-over — Req. utilizador #9).
 *
 * As funções não têm dependências de infraestrutura. A persistência (colunas
 * `plan`, `plan_expires_at`, `next_plan` em `profiles`) fica na composição e nas
 * funções serverless de pagamento.
 */

import { isPlanId, type PlanId } from "./plans.js";

/** Duração de um período de subscrição, em dias. */
export const PLAN_PERIOD_DAYS = 30;
const DAY_MS = 86_400_000;
const PERIOD_MS = PLAN_PERIOD_DAYS * DAY_MS;

/** Estado de faturação tal como está guardado na conta. */
export interface BillingInput {
  plan: string | null | undefined;
  planExpiresAt: string | null | undefined;
  nextPlan: string | null | undefined;
}

/** Transição a persistir quando um período termina. */
export interface BillingTransition {
  plan: PlanId;
  planExpiresAt: string | null;
  nextPlan: null;
}

/** Estado de faturação resolvido para o momento atual. */
export interface BillingState {
  /** Plano cujas funcionalidades estão ativas neste momento. */
  effectivePlan: PlanId;
  /** Plano guardado na conta (pode diferir do efetivo se expirou). */
  storedPlan: PlanId;
  /** Fim do período atual (ISO) ou `null` se for permanente/linha de base. */
  expiresAt: string | null;
  /** Plano agendado para o próximo período, ou `null`. */
  nextPlan: PlanId | null;
  /** Dias até à renovação (>= 0), ou `null` quando não há período ativo. */
  daysRemaining: number | null;
  /** Verdadeiro quando um plano pago temporizado expirou (caiu para básico). */
  expired: boolean;
  /** Atribuição permanente (plano pago sem data de expiração). */
  permanent: boolean;
  /** Alteração a gravar no perfil (promoção/queda), ou `null`. */
  transition: BillingTransition | null;
}

function asPlan(value: unknown): PlanId | null {
  return isPlanId(value) ? value : null;
}

/** Dias (arredondados para cima, mínimo 0) entre `now` e `target`. */
function daysUntil(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / DAY_MS));
}

/**
 * Resolve o estado de faturação efetivo. Função pura: recebe o relógio por
 * parâmetro para ser determinística nos testes.
 */
export function resolveBilling(input: BillingInput, now: number = Date.now()): BillingState {
  const stored: PlanId = asPlan(input.plan) ?? "basico";
  const next = asPlan(input.nextPlan);
  const expMs = input.planExpiresAt ? Date.parse(input.planExpiresAt) : NaN;
  const hasExpiry = Number.isFinite(expMs);

  // Linha de base: o plano básico nunca expira.
  if (stored === "basico") {
    return base(stored, next);
  }

  // Plano pago sem expiração → atribuição permanente (ex.: admin).
  if (!hasExpiry) {
    return {
      effectivePlan: stored, storedPlan: stored, expiresAt: null, nextPlan: next,
      daysRemaining: null, expired: false, permanent: true, transition: null,
    };
  }

  // Plano pago temporizado, ainda dentro do período.
  if (expMs > now) {
    return {
      effectivePlan: stored, storedPlan: stored, expiresAt: new Date(expMs).toISOString(), nextPlan: next,
      daysRemaining: daysUntil(expMs, now), expired: false, permanent: false, transition: null,
    };
  }

  // Período terminado. Há plano agendado que ainda cobre o tempo?
  if (next && next !== "basico") {
    const newExp = expMs + PERIOD_MS;
    if (newExp > now) {
      const iso = new Date(newExp).toISOString();
      return {
        effectivePlan: next, storedPlan: stored, expiresAt: iso, nextPlan: null,
        daysRemaining: daysUntil(newExp, now), expired: false, permanent: false,
        transition: { plan: next, planExpiresAt: iso, nextPlan: null },
      };
    }
  }

  // Expirou sem cobertura → cai para básico.
  return {
    effectivePlan: "basico", storedPlan: stored, expiresAt: null, nextPlan: null,
    daysRemaining: null, expired: true, permanent: false,
    transition: { plan: "basico", planExpiresAt: null, nextPlan: null },
  };
}

function base(stored: PlanId, next: PlanId | null): BillingState {
  return {
    effectivePlan: "basico", storedPlan: stored, expiresAt: null, nextPlan: next,
    daysRemaining: null, expired: false, permanent: false, transition: null,
  };
}

/**
 * Calcula a alteração a aplicar ao perfil quando um pagamento de plano é
 * confirmado. Espelha {@link resolveBilling}: renova o mesmo plano (estende o
 * período), agenda um plano diferente quando ainda há tempo, ou ativa já quando
 * não há período em curso.
 */
export function planActivationPatch(
  current: BillingInput,
  newPlan: PlanId,
  now: number = Date.now(),
): { plan?: PlanId; plan_expires_at?: string | null; next_plan?: PlanId | null } {
  const cur: PlanId = asPlan(current.plan) ?? "basico";
  const expMs = current.planExpiresAt ? Date.parse(current.planExpiresAt) : NaN;
  const activeTimed = cur !== "basico" && Number.isFinite(expMs) && expMs > now;

  if (activeTimed) {
    if (newPlan === cur) {
      // Renovação: estende a partir do fim do período atual.
      return { plan_expires_at: new Date(expMs + PERIOD_MS).toISOString(), next_plan: null };
    }
    // Mudança com tempo restante: agenda para quando o atual terminar.
    return { next_plan: newPlan };
  }
  // Sem período ativo → ativa já por um período completo.
  return { plan: newPlan, plan_expires_at: new Date(now + PERIOD_MS).toISOString(), next_plan: null };
}
