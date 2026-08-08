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

import {
  asBillingPeriod, billableStores, daysOf, priceFor, proratedStorePrice, type BillingPeriod,
} from "./plans.js";

const DAY_MS = 86_400_000;

/** Estado da subscrição tal como está guardado na conta. */
export interface BillingInput {
  /** Fim do período pago (ISO). `null` = nunca pagou, ou já caducou. */
  planExpiresAt: string | null | undefined;
  /** Conta de administrador: acesso sempre ativo, sem pagar. */
  isAdmin?: boolean;
  /**
   * Lojas pagas no ciclo em curso (coluna `plan_stores` em `profiles`).
   *
   * **Ausente vale uma.** A coluna foi acrescentada quando o preço passou a ser
   * por Loja publicada, e todas as contas anteriores pagaram uma — ler ausência
   * como «uma» é o que mantém essas contas exactamente como estavam, e é também o
   * que faz o código funcionar antes de a migração correr.
   */
  planStores?: number | null;
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
  /**
   * Lojas que o ciclo em curso paga (**`Infinity` num administrador**).
   *
   * `Infinity` e não um número grande: um administrador não tem limite, e
   * qualquer comparação `publicadas < slots` fica verdadeira sem casos especiais
   * espalhados por quem chama.
   */
  paidStores: number;
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
    paidStores: byAdmin ? Number.POSITIVE_INFINITY : (pago ? billableStores(input.planStores) : 0),
  };
}

/** Resultado de pedir para publicar mais uma Loja. */
export interface PublishDecision {
  /** A Loja pode ir para a web agora. */
  allowed: boolean;
  /**
   * Preço a pagar para publicar esta Loja, em Kwanzas, ou `0` quando não há nada
   * a pagar. É **proporcional aos dias que faltam** do ciclo em curso: cobrar um
   * ciclo completo a meio do mês era cobrar duas vezes as Lojas já pagas.
   */
  amountDue: number;
  /** Razão para apresentar ao Dono quando não pode publicar. */
  reason: "ok" | "sem-subscricao" | "sem-lugar";
}

/**
 * Pode esta conta publicar mais uma Loja?
 *
 * As três respostas possíveis, e é de propósito que são só três:
 *
 *  - **administrador** → sempre sim, sem pagar. É a excepção pedida: quem
 *    administra a Plataforma cria as Lojas que precisar (as demonstrações dos
 *    modelos são Lojas como as outras);
 *  - **sem subscrição ativa** → não, e o que falta é subscrever;
 *  - **subscrição ativa mas sem lugar pago** → não, e o que falta é pagar a Loja
 *    adicional pelos dias que restam do ciclo.
 *
 * Função pura: `publishedStores` é quem chama que conta, porque é quem sabe se as
 * lojas-modelo entram (não entram) e qual o Dono.
 */
export function canPublishStore(
  state: BillingState,
  publishedStores: number,
  period: BillingPeriod = "mensal",
): PublishDecision {
  if (state.byAdmin) return { allowed: true, amountDue: 0, reason: "ok" };
  if (!state.accessActive) return { allowed: false, amountDue: priceFor(period, 1), reason: "sem-subscricao" };
  const publicadas = Number.isFinite(publishedStores) ? Math.max(0, Math.floor(publishedStores)) : 0;
  if (publicadas < state.paidStores) return { allowed: true, amountDue: 0, reason: "ok" };
  return {
    allowed: false,
    amountDue: proratedStorePrice(period, state.daysRemaining ?? 0),
    reason: "sem-lugar",
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
  stores?: unknown,
): { plan_expires_at: string; plan_stores: number } {
  const ciclo: BillingPeriod = asBillingPeriod(period);
  const expMs = current.planExpiresAt ? Date.parse(current.planExpiresAt) : NaN;
  const base = Number.isFinite(expMs) && expMs > now ? expMs : now;
  /*
   * Lojas pagas: exactamente as que este pagamento cobre.
   *
   * **Pode descer**, e é intencional: o Dono que despublica uma Loja antes de
   * pagar fica a pagar menos, que é a forma de baixar a mensalidade. Não há risco
   * de o pagamento tirar do ar uma Loja que estava online, porque o montante é
   * calculado a partir das Lojas publicadas **naquele momento** — pagar por menos
   * do que está publicado não é um estado que o ecrã de pagamento permita.
   */
  return {
    plan_expires_at: new Date(base + daysOf(ciclo) * DAY_MS).toISOString(),
    plan_stores: billableStores(stores ?? current.planStores),
  };
}
