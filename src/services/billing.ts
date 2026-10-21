/**
 * Estado da subscrição de uma conta (módulo de domínio puro).
 *
 * A regra inteira: **a conta está ativa se for de administrador, ou se
 * `plan_expires_at` estiver no futuro.** Não há escalões, ciclos, lugares por
 * loja nem teste grátis — ver `src/services/plans.ts`.
 *
 * É espelhada em três sítios, e os três têm de concordar:
 *  - `public.account_active(uid)` na base de dados (migração 0019), que decide
 *    se uma loja publicada é servida;
 *  - `accountActive(profile)` em `api/_shared.js`, que decide se o servidor
 *    aceita pagamentos para a loja;
 *  - esta função, que decide o que o painel mostra.
 *
 * `tests/planParity.test.ts` compara a do servidor com esta.
 */
import { PLAN_PERIOD_DAYS } from "./plans.js";

const DAY_MS = 86_400_000;

/** Estado da subscrição tal como está guardado na conta. */
export interface BillingInput {
  /** Fim do período pago (ISO). `null` = nunca pagou, ou já caducou. */
  planExpiresAt: string | null | undefined;
  /** Conta de administrador: acesso sempre ativo, sem pagar. */
  isAdmin?: boolean;
}

/** Estado da subscrição resolvido para o momento atual. */
export interface BillingState {
  /** A conta pode publicar e manter lojas online. */
  accessActive: boolean;
  /** Fim do período pago (ISO), ou `null` se não houver período em curso. */
  expiresAt: string | null;
  /** Dias até à renovação (>= 0), ou `null` quando não há período ativo. */
  daysRemaining: number | null;
  /** Já houve um período pago e terminou (distinto de nunca ter pago). */
  expired: boolean;
  /** Acesso ativo por ser administrador, e não por pagamento. */
  byAdmin: boolean;
  /** Precisa de pagar para publicar ou para a loja voltar a ficar online. */
  suspended: boolean;
}

/** Dias (arredondados para cima, mínimo 0) entre `now` e `target`. */
function daysUntil(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / DAY_MS));
}

/**
 * Resolve o estado da subscrição. Função pura: recebe o relógio por parâmetro
 * para ser determinística nos testes.
 */
export function resolveBilling(input: BillingInput, now: number = Date.now()): BillingState {
  const byAdmin = input.isAdmin === true;
  const expMs = input.planExpiresAt ? Date.parse(input.planExpiresAt) : NaN;
  const temData = Number.isFinite(expMs);
  const pago = temData && expMs > now;

  return {
    accessActive: byAdmin || pago,
    expiresAt: pago ? new Date(expMs).toISOString() : null,
    daysRemaining: pago ? daysUntil(expMs, now) : null,
    // Caducou é diferente de nunca ter pago: só há caducidade se houve data.
    expired: temData && !pago,
    byAdmin,
    suspended: !byAdmin && !pago,
  };
}

/** Resultado de pedir para publicar uma Loja. */
export interface PublishDecision {
  /** A Loja pode ir para a web agora. */
  allowed: boolean;
  /** Razão para apresentar ao Dono quando não pode publicar. */
  reason: "ok" | "sem-subscricao";
}

/**
 * Pode esta conta publicar uma Loja?
 *
 * Com um só plano e lojas ilimitadas há uma pergunta só: a subscrição está
 * ativa? A base de dados impõe a mesma regra (gatilho
 * `stores_publish_requires_plan`); esta função existe para o painel dar uma
 * frase útil antes de o Postgres recusar.
 */
export function canPublishStore(state: BillingState): PublishDecision {
  return state.accessActive ? { allowed: true, reason: "ok" } : { allowed: false, reason: "sem-subscricao" };
}

/**
 * Alteração a aplicar ao perfil quando um pagamento de subscrição é confirmado
 * (ou quando o administrador ativa um período à mão).
 *
 * Renovar acrescenta o período **ao fim do atual**, para quem paga adiantado não
 * perder os dias que ainda tinha. Sem período em curso, conta a partir de agora.
 * `periods` permite ao administrador ativar vários meses de uma vez.
 */
export function planActivationPatch(
  current: BillingInput,
  now: number = Date.now(),
  periods = 1,
): { plan_expires_at: string } {
  const n = Number.isFinite(periods) ? Math.max(1, Math.floor(periods)) : 1;
  const expMs = current.planExpiresAt ? Date.parse(current.planExpiresAt) : NaN;
  const base = Number.isFinite(expMs) && expMs > now ? expMs : now;
  return { plan_expires_at: new Date(base + n * PLAN_PERIOD_DAYS * DAY_MS).toISOString() };
}
