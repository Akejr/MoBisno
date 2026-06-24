/**
 * Planos de subscrição da MôBisno (módulo de domínio puro e testável).
 *
 * Define o catálogo de planos, os respetivos limites e funcionalidades, e
 * funções puras de verificação usadas para ativar/desativar funções com base
 * no plano do Dono_da_Loja:
 *  - número máximo de lojas **publicadas**;
 *  - número máximo de produtos por loja;
 *  - métodos de checkout disponíveis;
 *  - domínio próprio e funcionalidades empresariais.
 *
 * O módulo não tem dependências de infraestrutura: a persistência do plano
 * (coluna `plan` em `profiles`) e a leitura/escrita ficam na raiz de composição.
 */

/** Identificador estável de um plano. */
export type PlanId = "basico" | "profissional" | "empresarial";

/** Métodos de checkout que um plano pode disponibilizar. */
export type CheckoutMethod = "whatsapp" | "multicaixa";

/** Limites quantitativos de um plano (use `Infinity` para "ilimitado"). */
export interface PlanLimits {
  /** Máximo de lojas no estado "Publicada" que o Dono pode ter em simultâneo. */
  readonly maxPublishedStores: number;
  /** Máximo de produtos por loja. */
  readonly maxProductsPerStore: number;
}

/** Funcionalidades booleanas desbloqueadas por um plano. */
export interface PlanFeatures {
  readonly whatsappCheckout: boolean;
  /** Multicaixa Express + referência bancária. */
  readonly multicaixaCheckout: boolean;
  readonly customDomain: boolean;
  readonly dedicatedManager: boolean;
  readonly customIntegrations: boolean;
  readonly prioritySupport: boolean;
}

/** Definição completa de um plano. */
export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  /** Preço mensal em Kwanzas (Kz). */
  readonly priceKz: number;
  readonly limits: PlanLimits;
  readonly features: PlanFeatures;
  /** Lista de destaques apresentada na página de preços/conta. */
  readonly highlights: readonly string[];
}

/** Plano por omissão atribuído a uma conta recém-criada. */
export const DEFAULT_PLAN: PlanId = "basico";

/** Ordem canónica dos planos (do mais simples ao mais completo). */
export const PLAN_ORDER: readonly PlanId[] = ["basico", "profissional", "empresarial"];

/** Catálogo de planos. Fonte única de verdade para limites e funcionalidades. */
export const PLANS: Readonly<Record<PlanId, Plan>> = {
  basico: {
    id: "basico",
    name: "Básico",
    priceKz: 5000,
    limits: { maxPublishedStores: 1, maxProductsPerStore: 100 },
    features: {
      whatsappCheckout: true,
      multicaixaCheckout: false,
      customDomain: false,
      dedicatedManager: false,
      customIntegrations: false,
      prioritySupport: false,
    },
    highlights: [
      "1 loja publicada",
      "100 produtos cadastrados",
      "Checkout via WhatsApp",
      "Endereço .mobisno.com",
    ],
  },
  profissional: {
    id: "profissional",
    name: "Profissional",
    priceKz: 11000,
    limits: { maxPublishedStores: 3, maxProductsPerStore: Number.POSITIVE_INFINITY },
    features: {
      whatsappCheckout: true,
      multicaixaCheckout: true,
      customDomain: true,
      dedicatedManager: false,
      customIntegrations: false,
      prioritySupport: false,
    },
    highlights: [
      "Tudo do plano Básico",
      "Produtos ilimitados",
      "Checkout Multicaixa Express e referência bancária",
      "3 lojas publicadas",
      "Domínio próprio (opcional)",
    ],
  },
  empresarial: {
    id: "empresarial",
    name: "Empresarial",
    priceKz: 25000,
    limits: {
      maxPublishedStores: Number.POSITIVE_INFINITY,
      maxProductsPerStore: Number.POSITIVE_INFINITY,
    },
    features: {
      whatsappCheckout: true,
      multicaixaCheckout: true,
      customDomain: true,
      dedicatedManager: true,
      customIntegrations: true,
      prioritySupport: true,
    },
    highlights: [
      "Tudo do plano Profissional",
      "Lojas ilimitadas",
      "Gestor dedicado",
      "Integrações à medida",
      "Suporte prioritário",
    ],
  },
};

/** Type guard: verifica se um valor desconhecido é um {@link PlanId} válido. */
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}

/**
 * Resolve um plano a partir de um identificador possivelmente inválido,
 * recorrendo ao {@link DEFAULT_PLAN} quando o valor não é reconhecido.
 */
export function getPlan(id: unknown): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS[DEFAULT_PLAN];
}

/** Lista de planos na ordem canónica. */
export function listPlans(): Plan[] {
  return PLAN_ORDER.map((id) => PLANS[id]);
}

/** Posição do plano na ordem canónica (0 = mais simples). */
export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

/**
 * Indica se o Dono pode publicar mais uma loja, dado o número de lojas já
 * publicadas. Lojas em rascunho não contam para o limite.
 */
export function canPublishAnotherStore(plan: Plan, publishedCount: number): boolean {
  const count = Number.isFinite(publishedCount) ? Math.max(0, publishedCount) : 0;
  return count < plan.limits.maxPublishedStores;
}

/**
 * Indica se é possível adicionar `adding` produto(s) a uma loja que já tem
 * `currentCount` produtos, sem exceder o limite do plano.
 */
export function canAddProducts(plan: Plan, currentCount: number, adding = 1): boolean {
  const count = Number.isFinite(currentCount) ? Math.max(0, currentCount) : 0;
  return count + Math.max(0, adding) <= plan.limits.maxProductsPerStore;
}

/**
 * Número de produtos ainda disponíveis numa loja (pode ser `Infinity`).
 * Nunca devolve valores negativos.
 */
export function remainingProducts(plan: Plan, currentCount: number): number {
  const count = Number.isFinite(currentCount) ? Math.max(0, currentCount) : 0;
  return Math.max(0, plan.limits.maxProductsPerStore - count);
}

/** Métodos de checkout disponíveis para o plano, na ordem de apresentação. */
export function allowedCheckoutMethods(plan: Plan): CheckoutMethod[] {
  const methods: CheckoutMethod[] = [];
  if (plan.features.whatsappCheckout) methods.push("whatsapp");
  if (plan.features.multicaixaCheckout) methods.push("multicaixa");
  return methods;
}

/** Formata um limite numérico para apresentação ("Ilimitado" quando infinito). */
export function formatLimit(value: number): string {
  return Number.isFinite(value) ? String(value) : "Ilimitado";
}
