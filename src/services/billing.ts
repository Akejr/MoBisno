/**
 * Subscrição de uma conta (módulo de domínio puro e testável).
 *
 * A regra é uma só: **a conta está ativa enquanto `planExpiresAt` for futuro,
 * ou sempre, se for de administrador.** Não há escalões, não há teste grátis e
 * não há plano agendado.
 *
 * PORQUÊ TÃO POUCO: a versão anterior tinha cinco ramos a interagir — plano pago
 * dentro do prazo, plano agendado (carry-over), teste grátis, atribuição
 * permanente e expirado — porque havia três planos entre os quais trocar e um
 * teste que concedia o plano escolhido. Essa complexidade produziu uma avaria
 * real: o painel lia «Profissional ativo» e o servidor lia «básico», e as lojas
 * com pagamentos ligados recusavam cobrar aos clientes. Com um preço único não
 * há troca de plano, logo não há carry-over; sem teste grátis não há esse ramo;
 * e a atribuição permanente era um acidente que dava plano vitalício grátis a
 * quem escolhesse um no assistente sem pagar.
 *
 * Sobra uma data e uma comparação — que o espelho em `api/_shared.js` consegue
 * reproduzir sem margem para divergir.
 *
 * As funções não têm dependências de infraestrutura. A persistência (coluna
 * `plan_expires_at` em `profiles`) fica na composição e nas funções serverless.
 */

import { asBillingPeriod, daysOf, type BillingPeriod } from "./plans.js";

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
  /** Fim do período pago (ISO), ou `null` se não houver período. */
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

/**
 * Alteração a aplicar ao perfil quando um pagamento é confirmado.
 *
 * Renovar acrescenta o período **ao fim do atual**, para quem paga adiantado não
 * perder os dias que ainda tinha. Sem período em curso, conta a partir de agora.
 */
export function planActivationPatch(
  current: BillingInput,
  period: unknown,
  now: number = Date.now(),
): { plan_expires_at: string } {
  const ciclo: BillingPeriod = asBillingPeriod(period);
  const expMs = current.planExpiresAt ? Date.parse(current.planExpiresAt) : NaN;
  const base = Number.isFinite(expMs) && expMs > now ? expMs : now;
  return { plan_expires_at: new Date(base + daysOf(ciclo) * DAY_MS).toISOString() };
}
