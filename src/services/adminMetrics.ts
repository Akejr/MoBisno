/**
 * Painel de Administração — domínio puro (sem DOM, sem Supabase).
 *
 * Tudo o que o Painel_Admin decide e que se pode testar sem navegador vive
 * aqui. A vista (`web/views/adminPanel.ts` e `web/views/admin/*`) lê os dados,
 * chama estas funções e desenha; não agrega nem decide nada por si.
 *
 * ## O que há aqui
 *
 *  - **Visão geral** — {@link overviewKpis}, os números do topo, e
 *    {@link attentionLists}, «A precisar de atenção»: verificações de empresa por
 *    aprovar e levantamentos pedidos;
 *  - **saúde do negócio** — {@link businessHealth} e {@link monthlyEvolution};
 *  - **transações** — {@link transactionOverview}: subscrições e vendas das
 *    lojas por categoria (concluídas, pendentes e canceladas), num período;
 *  - **estado de uma conta e de uma loja** — {@link accountStatus} e
 *    {@link storeStatus}, com os mesmos critérios das métricas;
 *  - **o que o Administrador grava** — ao ativar ou desativar uma subscrição
 *    ({@link activationPatch}, {@link deactivationPatch}) e ao aprovar ou
 *    rejeitar uma verificação de empresa ({@link approvalPatch},
 *    {@link rejectionPatch}), mais a ordem da fila de aprovações
 *    ({@link sortVerificationQueue}).
 *
 * **Não consulta nada.** Recebe os dados já lidos por `web/supabase/admin.ts`
 * através dos tipos `…Like` deste ficheiro, estruturalmente compatíveis com
 * `AdminAccount`, `AdminStore`, `AdminWithdrawal`, `AdminPlanPayment`,
 * `AdminOrder` e `AdminVerification` sem criar dependência de `web/` — `src/**` é verificado
 * pelo `tsc` com `lib: ["ES2022"]`, sem DOM.
 *
 * ## Três regras que atravessam o ficheiro
 *
 * 1. **Lojas-modelo e contas de Administrador ficam fora de todas as
 *    contagens.** Uma loja-modelo é uma demonstração da galeria: tem
 *    `customization.__template`, ou o identificador com o prefixo reservado
 *    `modelo-` (`isModelIdentifier`), ou vem marcada com `isModel`. A exclusão é
 *    aplicada uma única vez, em {@link buildScope}, e nenhuma agregação toca nos
 *    arrays crus: um filtro repetido em cada agregação esquece-se exatamente numa
 *    delas — foi o que aconteceu enquanto os totais eram contados em base de
 *    dados.
 * 2. **Receita da Plataforma = pagamentos de subscrição pagos** (`plan_payments`
 *    com `status = "paid"`). As compras de SMS e de logótipos saíram do produto, e
 *    as linhas antigas desses serviços são ignoradas. A receita **não** é o
 *    volume de vendas das lojas (`orders`): esse dinheiro é dos Donos.
 * 3. **Uma loja suspensa é uma loja _publicada_ de uma conta sem subscrição
 *    ativa** — é a que está fora do ar. Um rascunho de uma conta sem subscrição
 *    não está suspenso: nunca esteve no ar.
 *
 * **Totalidade.** Os dados chegam de JSON e de colunas anuláveis: datas
 * inválidas, montantes `null`, `customization` de qualquer forma. Nenhuma função
 * lança, para qualquer entrada — nem sequer com `input` vazio.
 */

import { planActivationPatch, resolveBilling, type BillingState } from "./billing.js";
import { isModelIdentifier } from "./domains.js";
import { PLAN_PERIOD_DAYS, PLAN_PRICE_KZ } from "./plans.js";
import { COMPANY_DOCUMENTS, asVerificationStatus, type VerificationStatus } from "./paymentVerification.js";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Meses apresentados na evolução mensal. */
export const MONTHS_IN_EVOLUTION = 6;

/** Janela de aviso, em dias, das subscrições a terminar. */
export const ATTENTION_WINDOW_DAYS = 7;

/** Limite defensivo de meses da evolução: uma entrada absurda não gera milhões. */
const MAX_EVOLUTION_MONTHS = 60;

/** Estado de uma Loja publicada, tal como está gravado em `stores.state`. */
const PUBLISHED_STATE = "Publicada";

/** Serviço das linhas de subscrição — o único que é receita da Plataforma. */
const PLAN_SERVICE = "plan";

/** Maior instante que um `Date` aceita (±8,64 × 10¹⁵ ms). */
const MAX_DATE_MS = 8.64e15;

/**
 * Endereços das secções do Painel_Admin: `#/adminPainel/<secção>[/<sub>]`.
 *
 * O segundo segmento escolhe o separador de «Pagamentos» ou o filtro inicial de
 * «Contas» e «Lojas». A vista lê-os com o mesmo esquema; os itens de «A precisar
 * de atenção» trazem o `href` daqui, para cada linha abrir o ecrã onde a ação se
 * resolve.
 */
export const ADMIN_HREFS = {
  visao: "#/adminPainel",
  aprovacoes: "#/adminPainel/aprovacoes",
  contas: "#/adminPainel/contas",
  contasAtivas: "#/adminPainel/contas/ativas",
  lojas: "#/adminPainel/lojas",
  lojasPublicadas: "#/adminPainel/lojas/publicadas",
  modelos: "#/adminPainel/modelos",
  pagamentos: "#/adminPainel/pagamentos",
  subscricoes: "#/adminPainel/pagamentos/subscricoes",
  encomendas: "#/adminPainel/pagamentos/encomendas",
  levantamentos: "#/adminPainel/pagamentos/levantamentos",
} as const;

/**
 * Durações que o Administrador pode ativar à mão, em meses. Cada mês é um
 * período de `PLAN_PERIOD_DAYS` dias — a mesma unidade que um pagamento de
 * subscrição compra.
 */
export const ACTIVATION_MONTHS = [1, 3, 6, 12] as const;

/** Uma das durações de {@link ACTIVATION_MONTHS}. */
export type ActivationMonths = (typeof ACTIVATION_MONTHS)[number];

/** Comprimento mínimo do motivo de uma rejeição, em caracteres. */
export const REJECTION_REASON_MIN = 10;

/** Comprimento máximo do motivo de uma rejeição, em caracteres. */
export const REJECTION_REASON_MAX = 500;

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

/** Momento de referência aceite pelas funções deste módulo. */
export type Instant = number | string | Date | null | undefined;

/**
 * Conta da Plataforma. Forma mínima de `AdminAccount` de `web/supabase/admin.ts`.
 *
 * `planExpiresAt` é o único campo de subscrição que existe: é dele que sai
 * «subscrições ativas» e «a terminar». Há um só plano, sem escalões.
 */
export interface AccountLike {
  readonly id: string;
  readonly email?: string | null | undefined;
  readonly name?: string | null | undefined;
  /** Conta de Administrador: excluída de todas as agregações. */
  readonly isAdmin?: boolean | undefined;
  readonly createdAt?: string | null | undefined;
  /** Fim da subscrição paga (ISO) ou `null`. */
  readonly planExpiresAt?: string | null | undefined;
  readonly storeCount?: number | undefined;
}

/** Loja. Forma mínima de `AdminStore`. */
export interface StoreLike {
  readonly id: string;
  readonly name?: string | null | undefined;
  readonly ownerId?: string | null | undefined;
  readonly ownerEmail?: string | null | undefined;
  readonly ownerName?: string | null | undefined;
  readonly state?: string | null | undefined;
  /**
   * Fim da subscrição DESTA loja (ISO) ou `null` (migração 0025). Ausente =
   * loja de antes da migração: conta a data da conta do dono.
   */
  readonly planExpiresAt?: string | null | undefined;
  /** Identificador público. O prefixo `modelo-` marca uma loja-modelo. */
  readonly identifier?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  /** Personalização crua. `__template` presente ⇒ loja-modelo. */
  readonly customization?: unknown;
  /** Loja-modelo já identificada por quem leu os dados (`listStores`). */
  readonly isModel?: boolean | undefined;
}

/** Pedido de levantamento. Forma mínima de `AdminWithdrawal`. */
export interface WithdrawalLike {
  readonly id: string;
  readonly storeId?: string | null | undefined;
  readonly storeName?: string | null | undefined;
  readonly ownerEmail?: string | null | undefined;
  readonly amount?: number | string | null | undefined;
  /** `"requested"`, `"approved"`, `"paid"` ou `"rejected"`. */
  readonly status?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
}

/**
 * Pagamento de subscrição (`plan_payments`). Forma mínima de
 * `AdminPlanPayment`.
 *
 * O nome do tipo vem do tempo em que a Plataforma vendia também SMS e
 * logótipos («transações de serviço»). Só `service === "plan"` conta; uma linha
 * antiga de outro serviço é ignorada em todas as agregações.
 */
export interface ServiceTxLike {
  readonly id: string;
  /** `"plan"`. Qualquer outro valor (linhas antigas de SMS e logótipos) é ignorado. */
  readonly service?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly ownerId?: string | null | undefined;
  readonly ownerEmail?: string | null | undefined;
  readonly ownerName?: string | null | undefined;
  readonly storeName?: string | null | undefined;
  readonly amount?: number | string | null | undefined;
  readonly method?: string | null | undefined;
  /** `"open"`, `"paid"`, `"failed"`, `"cancelled"` ou `"expired"`. */
  readonly status?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  readonly paidAt?: string | null | undefined;
}

/** Nome atual de {@link ServiceTxLike}: um pagamento de subscrição. */
export type PlanPaymentLike = ServiceTxLike;

/**
 * Venda de uma loja (`orders`), por Multicaixa Express ou Referência Bancária.
 * Forma mínima de `AdminOrder`. É dinheiro do Dono, não receita da Plataforma:
 * entra nas transações da Visão geral, nunca na «Receita do mês».
 */
export interface OrderLike {
  readonly id: string;
  readonly storeId?: string | null | undefined;
  readonly storeName?: string | null | undefined;
  readonly customerName?: string | null | undefined;
  readonly amount?: number | string | null | undefined;
  readonly method?: string | null | undefined;
  /** `"open"`, `"paid"`, `"failed"`, `"cancelled"` ou `"expired"`. */
  readonly status?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  readonly paidAt?: string | null | undefined;
}

/**
 * Pedido de verificação de empresa (`store_payments`). Forma mínima de
 * `AdminVerification`.
 */
export interface VerificationLike {
  readonly storeId: string;
  /** `"none"`, `"pending"`, `"approved"` ou `"rejected"`. */
  readonly status?: string | null | undefined;
  readonly submittedAt?: string | null | undefined;
  readonly reviewedAt?: string | null | undefined;
  readonly storeName?: string | null | undefined;
  readonly companyName?: string | null | undefined;
  readonly ownerEmail?: string | null | undefined;
}

/** Dados de um pedido que a aprovação exige (o mesmo que a base de dados exige). */
export interface VerificationDataLike {
  readonly companyName?: string | null | undefined;
  readonly companyNif?: string | null | undefined;
  readonly bankName?: string | null | undefined;
  readonly beneficiaryName?: string | null | undefined;
  readonly iban?: string | null | undefined;
  readonly documents?: {
    readonly matricula?: string | null | undefined;
    readonly certidao?: string | null | undefined;
  } | null | undefined;
}

/** Dados já lidos da Plataforma, tal como o Painel_Admin os tem em mão. */
export interface AdminMetricsInput {
  /**
   * Momento de referência. Omitido ⇒ `Date.now()`. Injetado para as métricas
   * serem determinísticas nos testes.
   */
  readonly now?: Instant;
  readonly accounts?: readonly AccountLike[] | null | undefined;
  readonly stores?: readonly StoreLike[] | null | undefined;
  readonly withdrawals?: readonly WithdrawalLike[] | null | undefined;
  /** Pagamentos de subscrição (`plan_payments`). */
  readonly transactions?: readonly ServiceTxLike[] | null | undefined;
  /** Vendas das lojas (`orders`). Só as transações da Visão geral as leem. */
  readonly orders?: readonly OrderLike[] | null | undefined;
  /** Pedidos de verificação de empresa (`store_payments`). */
  readonly verifications?: readonly VerificationLike[] | null | undefined;
}

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

/** Saúde do negócio. Nenhuma métrica é negativa. */
export interface BusinessHealth {
  /** Receita da Plataforma no mês corrente: subscrições pagas com `paidAt` no mês. */
  readonly monthRevenue: number;
  /** Contas de cliente com subscrição em vigor. */
  readonly activeSubscriptions: number;
  /** Subscrições que terminam nos próximos {@link ATTENTION_WINDOW_DAYS} dias. */
  readonly subscriptionsExpiring: number;
  /** Lojas de cliente com `state === "Publicada"`. */
  readonly publishedStores: number;
  /** Lojas **publicadas** cujo dono está sem subscrição ativa: estão fora do ar. */
  readonly suspendedStores: number;
}

/**
 * Os números da Visão geral. Cada um corresponde a uma secção do painel, para
 * onde o cartão leva.
 */
export interface OverviewKpis {
  /** Contas de cliente (Administradores fora). → «Contas» */
  readonly accounts: number;
  /** Lojas de cliente publicadas (lojas-modelo fora). → «Lojas» */
  readonly publishedStores: number;
  /** Das publicadas, as que estão fora do ar por o dono não ter subscrição. */
  readonly suspendedStores: number;
  /** Contas de cliente com subscrição em vigor. → «Contas» */
  readonly activeSubscriptions: number;
  /** Subscrições pagas no mês corrente. → «Pagamentos» */
  readonly monthRevenue: number;
  /** Pedidos de verificação de empresa em análise. → «Aprovações» */
  readonly pendingVerifications: number;
  /** Levantamentos pedidos e ainda não tratados. → «Pagamentos» */
  readonly pendingWithdrawals: number;
}

/** Um mês da evolução mensal. `month` no formato `"AAAA-MM"` (UTC). */
export interface MonthPoint {
  readonly month: string;
  readonly revenue: number;
  readonly accounts: number;
}

/** Item de «A precisar de atenção», com a ligação para o ecrã que o resolve. */
export interface AttentionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly amount?: number | undefined;
  /** Momento do pedido (ISO), para a vista dizer há quanto tempo espera. */
  readonly at?: string | undefined;
  readonly href: string;
}

/** As duas listas de «A precisar de atenção», as mais antigas primeiro. */
export interface AttentionLists {
  readonly verificationsToReview: readonly AttentionItem[];
  readonly withdrawalsToApprove: readonly AttentionItem[];
}

/** Estado da subscrição de uma conta, como o Administrador o lê. */
export type AccountStatusKind = "admin" | "active" | "expiring" | "expired" | "none";

/** Estado da subscrição de uma conta, resolvido para um momento. */
export interface AccountStatus {
  readonly kind: AccountStatusKind;
  /** Fim da subscrição em vigor (ISO), ou `null`. */
  readonly expiresAt: string | null;
  /** Dias até ao fim (>= 0), ou `null` sem subscrição em vigor. */
  readonly daysRemaining: number | null;
  /** Quando terminou a última subscrição (ISO), se `kind === "expired"`. */
  readonly expiredAt: string | null;
}

/** Estado de uma loja, como o público a vê. */
export type StoreStatusKind = "online" | "offline" | "draft";

/** Resultado de construir uma alteração: a alteração, ou a frase do erro. */
export type AdminPatch<P> =
  | { readonly ok: true; readonly patch: P }
  | { readonly ok: false; readonly message: string };

/** O que a ativação manual de uma subscrição grava em `profiles`. */
export interface PlanPatch {
  readonly plan_expires_at: string;
}

/** Quanto vale uma ativação manual: dias e preço, a partir do plano único. */
export interface ActivationQuote {
  readonly months: ActivationMonths;
  readonly days: number;
  readonly amountKz: number;
}

/** O que a aprovação grava em `store_payments`. */
export interface ApprovalPatch {
  readonly verification_status: "approved";
  readonly reviewed_at: string;
  readonly reviewed_by: string;
  readonly rejection_reason: null;
}

/** O que a rejeição grava em `store_payments`. */
export interface RejectionPatch {
  readonly verification_status: "rejected";
  readonly reviewed_at: string;
  readonly reviewed_by: string;
  readonly rejection_reason: string;
}

/** Fila de aprovações: os pedidos por decidir e as decisões já tomadas. */
export interface VerificationQueue<T> {
  /** Em análise, o mais antigo primeiro (é o que espera há mais tempo). */
  readonly pending: T[];
  /** Aprovados e rejeitados, a decisão mais recente primeiro. */
  readonly history: T[];
}

/** Filtro do histórico de aprovações. */
export type HistoryFilter = "all" | "approved" | "rejected";

// ---------------------------------------------------------------------------
// Leitura defensiva
// ---------------------------------------------------------------------------

/**
 * Lista utilizável, ou vazia. Os arrays chegam de chamadores JavaScript
 * (`web/`) e podem vir ausentes ou nem ser arrays — e um `for…of` sobre um
 * não-array lançaria.
 */
function asList<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/** Objeto onde faça sentido ler campos, ou `null`. Arrays contam como não-objeto. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Texto usável, ou `undefined`. */
function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value;
}

/** Texto usável, ou o substituto dado. */
function textOr(value: unknown, fallback: string): string {
  return asText(value) ?? fallback;
}

/**
 * Momento em milissegundos, ou `null` quando não é uma data utilizável. Aceita
 * número, `Date` e cadeia ISO — é o que chega das colunas `timestamptz`.
 */
function asInstant(value: Instant): number | null {
  if (value === null || value === undefined) return null;
  let ms: number;
  if (typeof value === "number") ms = value;
  else if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "string") ms = Date.parse(value);
  else return null;
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS ? ms : null;
}

/** Momento de referência: o dado, ou o relógio. */
function nowOf(value: Instant): number {
  return asInstant(value) ?? Date.now();
}

/** ISO de um instante já validado. */
function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

/** ISO de uma data de origem desconhecida, ou `undefined` quando não é data. */
function isoOrUndefined(value: unknown): string | undefined {
  const ms = asInstant(typeof value === "string" ? value : null);
  return ms === null ? undefined : isoOf(ms);
}

/**
 * Montante somável: `0` para `null`, `undefined`, texto não numérico, `NaN`,
 * `Infinity` **e para valores negativos** — é o que garante que nenhuma receita
 * agregada é negativa, sem depender da qualidade dos dados gravados.
 */
function asAmount(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Estado normalizado para comparação (`status` chega em minúsculas do Supabase). */
function asStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Chave de mês em UTC, `"AAAA-MM"`. UTC para não depender do fuso do cliente. */
function monthKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Comparação total e determinística de cadeias, sem depender de locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A Loja é uma loja-modelo (demonstração da galeria)?
 *
 * Três marcas, qualquer uma basta: `isModel` (já resolvido por quem leu os
 * dados), o prefixo reservado `modelo-` no identificador, e
 * `customization.__template`. As duas últimas são as que a base de dados
 * protege (`stores_guard`, migração 0022): um Dono não cria uma loja com o
 * prefixo nem escreve a marca.
 */
export function isLojaModelo(store: StoreLike | null | undefined): boolean {
  if (!store) return false;
  if (store.isModel === true) return true;
  if (isModelIdentifier(store.identifier)) return true;
  const custom = asRecord(store.customization);
  if (!custom) return false;
  const marker = custom["__template"];
  return marker !== undefined && marker !== null && marker !== false;
}

// ---------------------------------------------------------------------------
// Âmbito: o único sítio onde a exclusão é aplicada
// ---------------------------------------------------------------------------

/**
 * Conjuntos elegíveis, já sem lojas-modelo e sem contas de Administrador. Todas
 * as agregações deste módulo leem daqui — e só daqui.
 */
interface Scope {
  readonly nowMs: number;
  /** Contas elegíveis: sem `isAdmin`. */
  readonly accounts: readonly AccountLike[];
  /**
   * Faturação resolvida por conta elegível (`resolveBilling`). Uma conta tem
   * subscrição em vigor se ela ou alguma das suas lojas a tiver.
   */
  readonly billing: ReadonlyMap<string, BillingState>;
  /**
   * Faturação de cada loja elegível: a subscrição é da loja (migração 0025).
   * Uma loja sem data própria e sem dono conhecido não tem entrada.
   */
  readonly storeBilling: ReadonlyMap<string, BillingState>;
  /** Lojas elegíveis: sem lojas-modelo e sem lojas de conta de Administrador. */
  readonly stores: readonly StoreLike[];
  /** Levantamentos de lojas elegíveis. */
  readonly withdrawals: readonly WithdrawalLike[];
  /** Pagamentos de subscrição de contas que não são de Administrador. */
  readonly transactions: readonly ServiceTxLike[];
  /** Vendas de lojas elegíveis. */
  readonly orders: readonly OrderLike[];
  /** Pedidos de verificação de lojas elegíveis. */
  readonly verifications: readonly VerificationLike[];
}

/**
 * Aplica a exclusão e devolve os conjuntos elegíveis.
 *
 * Regras, todas conservadoras por desenho — nunca **acrescentam** nada às
 * agregações a partir de dados que não sejam elegíveis, o que torna a
 * invariância face às lojas-modelo verdadeira por construção:
 *
 *  - **contas** — fora as que têm `isAdmin`;
 *  - **lojas** — fora as lojas-modelo e as lojas cujo dono é uma conta de
 *    Administrador conhecida;
 *  - **levantamentos** e **pedidos de verificação** — só os de uma loja
 *    **elegível**. Exigir pertença (em vez de excluir as lojas-modelo
 *    conhecidas) é o que garante que acrescentar uma loja-modelo à entrada
 *    nunca retira nada de uma lista;
 *  - **pagamentos de subscrição** — só os do serviço `plan`, e fora os de uma
 *    conta de Administrador conhecida.
 *
 * Uma loja sem dono conhecido continua elegível: a lista de contas pode não
 * cobrir todos os donos, e apagar lojas reais das métricas por isso seria pior
 * do que contá-las. O que ela nunca faz é contar como suspensa, porque essa
 * métrica exige faturação resolvida.
 */
function buildScope(input: AdminMetricsInput | null | undefined, override?: Instant): Scope {
  const nowMs = asInstant(override) ?? asInstant(input?.now) ?? Date.now();

  // Exclusão 1 — contas de Administrador.
  const adminIds = new Set<string>();
  const accounts: AccountLike[] = [];
  for (const account of asList(input?.accounts)) {
    if (!account || typeof account.id !== "string") continue;
    if (account.isAdmin === true) {
      adminIds.add(account.id);
      continue;
    }
    accounts.push(account);
  }

  // Exclusão 2 — lojas-modelo e lojas de conta de Administrador.
  const stores: StoreLike[] = [];
  const storeIds = new Set<string>();
  for (const store of asList(input?.stores)) {
    if (!store || typeof store.id !== "string") continue;
    if (isLojaModelo(store)) continue;
    if (typeof store.ownerId === "string" && adminIds.has(store.ownerId)) continue;
    stores.push(store);
    storeIds.add(store.id);
  }

  // A subscrição é de cada loja (migração 0025). A data da conta fica como
  // recurso para lojas sem data própria (dados de antes da migração).
  const accountDate = new Map<string, string | null>();
  for (const account of accounts) {
    accountDate.set(account.id, typeof account.planExpiresAt === "string" ? account.planExpiresAt : null);
  }
  const storeBilling = new Map<string, BillingState>();
  const latestByOwner = new Map<string, string | null>();
  for (const store of stores) {
    const owner = typeof store.ownerId === "string" ? store.ownerId : "";
    let raw: string | null;
    if (store.planExpiresAt !== undefined) raw = typeof store.planExpiresAt === "string" ? store.planExpiresAt : null;
    else if (accountDate.has(owner)) raw = accountDate.get(owner) ?? null;
    else continue; // sem data própria e sem dono conhecido: faturação por resolver
    storeBilling.set(store.id, resolveBilling({ planExpiresAt: raw, isAdmin: false }, nowMs));
    if (owner) latestByOwner.set(owner, latestExpiry([latestByOwner.get(owner), raw]));
  }

  const billing = new Map<string, BillingState>();
  for (const account of accounts) {
    const raw = latestExpiry([accountDate.get(account.id), latestByOwner.get(account.id)]);
    billing.set(account.id, resolveBilling({ planExpiresAt: raw, isAdmin: false }, nowMs));
  }

  // Exclusão 3 — levantamentos e pedidos que não pertencem a uma loja elegível.
  const ofEligibleStore = (storeId: unknown): boolean => typeof storeId === "string" && storeIds.has(storeId);
  const withdrawals = asList(input?.withdrawals).filter((w) => !!w && ofEligibleStore(w.storeId));
  const verifications = asList(input?.verifications).filter((v) => !!v && ofEligibleStore(v.storeId));
  // As vendas, pela mesma regra: só as de uma loja elegível (as de demonstração
  // das lojas-modelo e as de teste das lojas da equipa ficam de fora).
  const orders = asList(input?.orders).filter((o) => !!o && ofEligibleStore(o.storeId));

  // Exclusão 4 — o que não é subscrição, e as subscrições de Administradores.
  const transactions = asList(input?.transactions).filter(
    (t) => !!t && asText(t.service) === PLAN_SERVICE && !(typeof t.ownerId === "string" && adminIds.has(t.ownerId)),
  );

  return { nowMs, accounts, billing, storeBilling, stores, withdrawals, transactions, orders, verifications };
}

/**
 * A data mais tardia de uma lista (ISO), ignorando as ausentes e as ilegíveis;
 * `null` sem nenhuma. É o fim da subscrição de uma conta com várias lojas: a
 * conta está «com subscrição» enquanto alguma loja dela estiver.
 */
export function latestExpiry(dates: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const d of dates) {
    if (typeof d !== "string") continue;
    const ms = Date.parse(d);
    if (Number.isFinite(ms) && ms > bestMs) {
      best = d;
      bestMs = ms;
    }
  }
  return best;
}

/** A subscrição está em vigor e termina dentro da janela de aviso. */
function subscriptionExpiringSoon(state: BillingState): boolean {
  return state.accessActive && !state.byAdmin && (state.daysRemaining ?? Infinity) <= ATTENTION_WINDOW_DAYS;
}

/** Pagamento de subscrição pago, com a data de pagamento em milissegundos. */
function paidAtOf(tx: ServiceTxLike): number | null {
  if (asStatus(tx.status) !== "paid") return null;
  return asInstant(tx.paidAt ?? null);
}

/** O pedido de verificação está em análise? */
function isPending(v: VerificationLike): boolean {
  return asVerificationStatus(asStatus(v.status)) === "pending";
}

/** Pedidos de verificação em análise. Partilhado pelo KPI e pela lista. */
function pendingVerificationsOf(scope: Scope): readonly VerificationLike[] {
  return scope.verifications.filter(isPending);
}

/** Levantamentos pedidos e ainda não tratados. Partilhado pelo KPI e pela lista. */
function requestedWithdrawalsOf(scope: Scope): readonly WithdrawalLike[] {
  return scope.withdrawals.filter((w) => asStatus(w.status) === "requested");
}

/** Chave da submissão: sem data válida, vai para o fim da fila. */
function submittedKey(v: VerificationLike): number {
  return asInstant(v.submittedAt ?? null) ?? Number.MAX_SAFE_INTEGER;
}

/** Chave da decisão: a revisão, ou a submissão; sem nenhuma, vai para o fim. */
function decisionKey(v: VerificationLike): number {
  return asInstant(v.reviewedAt ?? null) ?? asInstant(v.submittedAt ?? null) ?? -Number.MAX_SAFE_INTEGER;
}

/** O pedido mais antigo primeiro; desempate pela loja, para a ordem ser total. */
function byOldestSubmission(a: VerificationLike, b: VerificationLike): number {
  return submittedKey(a) - submittedKey(b) || compareText(a.storeId, b.storeId);
}

/** A decisão mais recente primeiro; desempate pela loja. */
function byLatestDecision(a: VerificationLike, b: VerificationLike): number {
  return decisionKey(b) - decisionKey(a) || compareText(a.storeId, b.storeId);
}

// ---------------------------------------------------------------------------
// Saúde do negócio e Visão geral
// ---------------------------------------------------------------------------

/** As métricas de saúde sobre um âmbito já construído. */
function healthOf(scope: Scope): BusinessHealth {
  const currentMonth = monthKeyOf(scope.nowMs);

  let monthRevenue = 0;
  for (const tx of scope.transactions) {
    const paidAt = paidAtOf(tx);
    if (paidAt !== null && monthKeyOf(paidAt) === currentMonth) monthRevenue += asAmount(tx.amount);
  }

  let activeSubscriptions = 0;
  let subscriptionsExpiring = 0;
  for (const account of scope.accounts) {
    const state = scope.billing.get(account.id);
    if (!state) continue;
    if (state.accessActive) activeSubscriptions += 1;
    if (subscriptionExpiringSoon(state)) subscriptionsExpiring += 1;
  }

  let publishedStores = 0;
  let suspendedStores = 0;
  for (const store of scope.stores) {
    if (asText(store.state) !== PUBLISHED_STATE) continue;
    publishedStores += 1;
    // Só uma loja publicada pode estar fora do ar: um rascunho nunca esteve no ar.
    // A subscrição é da loja: outra loja paga do mesmo dono não a põe no ar.
    if (scope.storeBilling.get(store.id)?.suspended === true) suspendedStores += 1;
  }

  return { monthRevenue, activeSubscriptions, subscriptionsExpiring, publishedStores, suspendedStores };
}

/**
 * Saúde do negócio, sobre os conjuntos elegíveis:
 *
 *  1. **receita do mês corrente** — subscrições `paid` com `paidAt` no mês do
 *     momento de referência;
 *  2. **subscrições ativas** — contas de cliente com subscrição em vigor;
 *  3. **subscrições a terminar** — nos próximos {@link ATTENTION_WINDOW_DAYS} dias;
 *  4. **lojas publicadas** — `state === "Publicada"`;
 *  5. **lojas suspensas** — publicadas, de uma conta sem subscrição ativa.
 *
 * @param input Dados já lidos da Plataforma.
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function businessHealth(input: AdminMetricsInput, now?: Instant): BusinessHealth {
  return healthOf(buildScope(input, now));
}

/**
 * Os números da Visão geral. Saem do mesmo âmbito e dos mesmos critérios de
 * {@link businessHealth} e de {@link attentionLists}, por isso o número do cartão
 * e o comprimento da lista correspondente nunca divergem.
 *
 * @param input Dados já lidos da Plataforma, incluindo `verifications`.
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function overviewKpis(input: AdminMetricsInput, now?: Instant): OverviewKpis {
  const scope = buildScope(input, now);
  const health = healthOf(scope);
  return {
    accounts: scope.accounts.length,
    publishedStores: health.publishedStores,
    suspendedStores: health.suspendedStores,
    activeSubscriptions: health.activeSubscriptions,
    monthRevenue: health.monthRevenue,
    pendingVerifications: pendingVerificationsOf(scope).length,
    pendingWithdrawals: requestedWithdrawalsOf(scope).length,
  };
}

/**
 * Evolução mensal da receita de subscrições e do número de contas novas, nos
 * meses mais recentes **do mais antigo para o mais recente**.
 *
 * Os meses são gerados a partir do momento de referência, em UTC, pelo que um
 * mês sem receita e sem contas novas aparece com zeros em vez de ser saltado —
 * uma série com buracos desenharia um gráfico enganador.
 *
 * @param input Dados já lidos da Plataforma.
 * @param months Nº de meses. Omitido ⇒ {@link MONTHS_IN_EVOLUTION}; limitado a
 *        `[1, 60]` e truncado a inteiro.
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function monthlyEvolution(input: AdminMetricsInput, months?: number, now?: Instant): MonthPoint[] {
  const scope = buildScope(input, now);

  const requested = typeof months === "number" && Number.isFinite(months) ? Math.floor(months) : MONTHS_IN_EVOLUTION;
  const total = Math.min(MAX_EVOLUTION_MONTHS, Math.max(1, requested));

  // Chaves dos meses, do mais antigo para o mais recente.
  const ref = new Date(scope.nowMs);
  const keys: string[] = [];
  for (let back = total - 1; back >= 0; back -= 1) {
    keys.push(monthKeyOf(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - back, 1)));
  }

  const revenue = new Map<string, number>();
  const accounts = new Map<string, number>();
  for (const key of keys) {
    revenue.set(key, 0);
    accounts.set(key, 0);
  }

  for (const tx of scope.transactions) {
    const paidAt = paidAtOf(tx);
    if (paidAt === null) continue;
    const key = monthKeyOf(paidAt);
    const current = revenue.get(key);
    if (current !== undefined) revenue.set(key, current + asAmount(tx.amount));
  }

  for (const account of scope.accounts) {
    const created = asInstant(account.createdAt ?? null);
    if (created === null) continue;
    const key = monthKeyOf(created);
    const current = accounts.get(key);
    if (current !== undefined) accounts.set(key, current + 1);
  }

  return keys.map((month) => ({
    month,
    revenue: revenue.get(month) ?? 0,
    accounts: accounts.get(month) ?? 0,
  }));
}

/**
 * «A precisar de atenção»: o que está à espera de uma decisão do Administrador,
 * o mais antigo primeiro (é o que espera há mais tempo).
 *
 *  - **verificações por aprovar** — pedidos `pending`, ligação para «Aprovações»;
 *  - **levantamentos pedidos** — `requested`, ligação para «Pagamentos ›
 *    Levantamentos».
 *
 * Os comprimentos coincidem sempre com `pendingVerifications` e
 * `pendingWithdrawals` de {@link overviewKpis}. A ordenação é total
 * (desempate por identificador): a mesma entrada dá sempre a mesma lista.
 *
 * @param input Dados já lidos da Plataforma.
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function attentionLists(input: AdminMetricsInput, now?: Instant): AttentionLists {
  const scope = buildScope(input, now);

  const verificationsToReview: AttentionItem[] = pendingVerificationsOf(scope)
    .slice()
    .sort(byOldestSubmission)
    .map((v) => {
      const company = asText(v.companyName);
      const owner = textOr(v.ownerEmail, "dono desconhecido");
      return {
        id: v.storeId,
        title: textOr(v.storeName, "Loja sem nome"),
        detail: company ? `${company} · ${owner}` : owner,
        at: isoOrUndefined(v.submittedAt),
        href: ADMIN_HREFS.aprovacoes,
      };
    });

  const withdrawalsToApprove: AttentionItem[] = requestedWithdrawalsOf(scope)
    .map((w) => ({
      item: {
        id: w.id,
        title: textOr(w.storeName, "Loja sem nome"),
        detail: textOr(w.ownerEmail, "dono desconhecido"),
        amount: asAmount(w.amount),
        at: isoOrUndefined(w.createdAt),
        href: ADMIN_HREFS.levantamentos,
      },
      sortAt: asInstant(w.createdAt ?? null) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.sortAt - b.sortAt || compareText(a.item.id, b.item.id))
    .map((row) => row.item);

  return { verificationsToReview, withdrawalsToApprove };
}

// ---------------------------------------------------------------------------
// Transações da Visão geral
// ---------------------------------------------------------------------------

/**
 * Categoria de uma transação, como o Administrador a lê:
 *
 *  - `concluida`: paga;
 *  - `pendente`: à espera do pagamento (uma referência por pagar, um pedido
 *    Multicaixa Express por confirmar);
 *  - `cancelada`: não vai ser paga, porque falhou, foi cancelada ou expirou.
 */
export type TxCategory = "concluida" | "pendente" | "cancelada";

/** As categorias, pela ordem em que a Visão geral as mostra. */
export const TX_CATEGORIES: readonly TxCategory[] = ["concluida", "pendente", "cancelada"];

/**
 * Nome de cada categoria, tal como está nos quadros da Visão geral. A vista e a
 * orientação do assistente leem-no daqui, para dizerem a mesma palavra.
 */
export const TX_CATEGORY_LABELS: Readonly<Record<TxCategory, string>> = {
  concluida: "Concluídas",
  pendente: "Pendentes",
  cancelada: "Canceladas",
};

/** Origem de uma transação: subscrição (`plan_payments`) ou venda de uma loja (`orders`). */
export type TxKind = "plan" | "order";

/** Período das transações: os últimos 7 dias, os últimos 30, ou os últimos 12 meses. */
export type TxPeriod = "7d" | "30d" | "12m";

/** Os períodos, pela ordem dos botões. */
export const TX_PERIODS: readonly TxPeriod[] = ["7d", "30d", "12m"];

/** Período com que a Visão geral abre. */
export const TX_DEFAULT_PERIOD: TxPeriod = "30d";

/** Nome de cada período, tal como está no botão (e na orientação do assistente). */
export const TX_PERIOD_LABELS: Readonly<Record<TxPeriod, string>> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "12m": "12 meses",
};

/**
 * Fuso de Angola (WAT): UTC+1, fixo, sem hora de verão. Os dias e os meses das
 * transações são os de Luanda, e não os do navegador de quem abre o painel nem
 * os de UTC: uma venda às 00:30 de Luanda é desse dia, e não do anterior. Sendo
 * fixo, é uma soma, e o resultado é o mesmo em qualquer máquina.
 */
export const ANGOLA_UTC_OFFSET_MINUTES = 60;

const DAY_MS = 86_400_000;
const ANGOLA_OFFSET_MS = ANGOLA_UTC_OFFSET_MINUTES * 60_000;

/** Intervalos do gráfico em cada período, e a unidade de cada um. */
const PERIOD_SHAPE: Readonly<Record<TxPeriod, { readonly unit: "day" | "month"; readonly buckets: number }>> = {
  "7d": { unit: "day", buckets: 7 },
  "30d": { unit: "day", buckets: 30 },
  "12m": { unit: "month", buckets: 12 },
};

/** Uma transação, já lida e normalizada para a Visão geral. */
export interface PlatformTx {
  readonly id: string;
  readonly kind: TxKind;
  readonly category: TxCategory;
  /**
   * Estado gravado, em minúsculas. A categoria junta «falhada», «cancelada» e
   * «expirada»; é o estado que as distingue no selo ({@link txStatusLabel}).
   */
  readonly status: string;
  /** Montante em Kz; `0` quando ilegível ou negativo. */
  readonly amount: number;
  /** Momento da criação, em milissegundos. */
  readonly createdAt: number;
  /** Método gravado (`mcx`, `reference`), ou `""`. */
  readonly method: string;
  /** Quem paga: o Dono numa subscrição (o email, ou o nome), o cliente numa venda. */
  readonly who: string;
  /** A loja: a da venda, ou a da subscrição quando se sabe; `""` sem loja conhecida. */
  readonly store: string;
}

/** Número e montante de um conjunto de transações. */
export interface TxTotals {
  readonly count: number;
  readonly amount: number;
}

/** Totais do período, por categoria. `total` é a soma das três. */
export interface TxSummary {
  readonly total: TxTotals;
  readonly concluida: TxTotals;
  readonly pendente: TxTotals;
  readonly cancelada: TxTotals;
}

/** Um intervalo do gráfico: um dia (7 e 30 dias) ou um mês (12 meses). */
export interface TxBucket {
  /** Início do intervalo, em milissegundos: a meia-noite, ou o dia 1, em Luanda. */
  readonly start: number;
  readonly concluida: number;
  readonly pendente: number;
  readonly cancelada: number;
  /** Montante das concluídas no intervalo: o dinheiro que entrou. */
  readonly amount: number;
}

/** O que a Visão geral mostra das transações, para um período e uma origem. */
export interface TransactionOverview {
  readonly period: TxPeriod;
  readonly unit: "day" | "month";
  /** Início do período, em milissegundos: o início do primeiro intervalo. */
  readonly from: number;
  /** Totais do período e da origem, das três categorias. */
  readonly summary: TxSummary;
  /** Um intervalo por dia ou por mês, do mais antigo para o atual, sem buracos. */
  readonly series: readonly TxBucket[];
  /** As transações do período, da origem e da categoria pedidas, a mais recente primeiro. */
  readonly items: readonly PlatformTx[];
  /**
   * Há vendas de lojas na entrada, de qualquer data? Sem nenhuma, escolher a
   * origem não tem o que escolher, e a vista não mostra essa escolha.
   */
  readonly hasOrders: boolean;
}

/** O que mostrar. Um campo omitido ou inválido fica no valor por omissão. */
export interface TxQuery {
  /** Omitido ⇒ {@link TX_DEFAULT_PERIOD}. */
  readonly period?: TxPeriod | undefined;
  /** Omitido ⇒ `"all"`: subscrições e vendas. */
  readonly kind?: TxKind | "all" | undefined;
  /** Filtra só `items`: o resumo e o gráfico mostram sempre as três. Omitido ⇒ `"all"`. */
  readonly category?: TxCategory | "all" | undefined;
}

/**
 * Categoria de um estado gravado. `paid` é concluída; `open` (e `pending`) é
 * pendente; tudo o resto é cancelada: `failed`, `cancelled`, `expired` e
 * qualquer estado que não se conheça. Um estado desconhecido nunca passa por
 * dinheiro recebido nem por dinheiro a caminho.
 */
export function txCategory(status: unknown): TxCategory {
  const s = asStatus(status);
  if (s === "paid") return "concluida";
  if (s === "open" || s === "pending") return "pendente";
  return "cancelada";
}

/** Nome de cada estado gravado, no feminino de «transação». */
const TX_STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ["paid", "Concluída"],
  ["open", "Pendente"],
  ["pending", "Pendente"],
  ["failed", "Falhada"],
  ["cancelled", "Cancelada"],
  ["expired", "Expirada"],
]);

/**
 * Nome do estado, para o selo de uma linha: «Concluída», «Pendente»,
 * «Falhada», «Cancelada» ou «Expirada». Um estado desconhecido é «Cancelada»,
 * que é a categoria onde conta ({@link txCategory}).
 */
export function txStatusLabel(status: unknown): string {
  return TX_STATUS_LABELS.get(asStatus(status)) ?? "Cancelada";
}

/** Período válido, ou o de omissão. */
function asPeriod(value: unknown): TxPeriod {
  return value === "7d" || value === "30d" || value === "12m" ? value : TX_DEFAULT_PERIOD;
}

/** Meia-noite de Luanda do dia que contém `ms`. */
function angolaDayStart(ms: number): number {
  return Math.floor((ms + ANGOLA_OFFSET_MS) / DAY_MS) * DAY_MS - ANGOLA_OFFSET_MS;
}

/** Número do mês de Luanda que contém `ms` (ano × 12 + mês), para contar meses. */
function angolaMonthNumber(ms: number): number {
  const d = new Date(ms + ANGOLA_OFFSET_MS);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Uma subscrição como transação; `null` sem data de criação legível. */
function planTxOf(t: ServiceTxLike): PlatformTx | null {
  const createdAt = asInstant(t.createdAt ?? null);
  if (createdAt === null) return null;
  return {
    id: typeof t.id === "string" ? t.id : "",
    kind: "plan",
    category: txCategory(t.status),
    status: asStatus(t.status),
    amount: asAmount(t.amount),
    createdAt,
    method: asText(t.method) ?? "",
    who: asText(t.ownerEmail) ?? asText(t.ownerName) ?? "Conta desconhecida",
    store: asText(t.storeName) ?? "",
  };
}

/** Uma venda como transação; `null` sem data de criação legível. */
function orderTxOf(o: OrderLike): PlatformTx | null {
  const createdAt = asInstant(o.createdAt ?? null);
  if (createdAt === null) return null;
  return {
    id: typeof o.id === "string" ? o.id : "",
    kind: "order",
    category: txCategory(o.status),
    status: asStatus(o.status),
    amount: asAmount(o.amount),
    createdAt,
    method: asText(o.method) ?? "",
    who: asText(o.customerName) ?? "Cliente sem nome",
    store: asText(o.storeName) ?? "Loja sem nome",
  };
}

/** A mais recente primeiro; desempate pela origem e pelo identificador, para a ordem ser total. */
function byNewestTx(a: PlatformTx, b: PlatformTx): number {
  return b.createdAt - a.createdAt || compareText(a.kind, b.kind) || compareText(a.id, b.id);
}

/**
 * As transações da Visão geral: as subscrições e as vendas das lojas, por
 * categoria ({@link txCategory}), num período que acaba agora.
 *
 *  - **período**: os últimos 7 ou 30 dias (com o de hoje), ou os últimos 12
 *    meses (com o atual), em hora de Luanda ({@link ANGOLA_UTC_OFFSET_MINUTES});
 *  - **âmbito**: o de todas as métricas ({@link buildScope}), sem as
 *    subscrições de contas de Administrador e sem as vendas das lojas-modelo e
 *    das lojas da equipa;
 *  - **data**: a da criação, a única que uma transação pendente ou cancelada
 *    tem. Uma data ilegível deixa a transação de fora; uma no futuro (um relógio
 *    adiantado) conta no último intervalo, para a soma do gráfico bater sempre
 *    com o resumo.
 *
 * As vendas são dinheiro dos Donos. Estão aqui para o Administrador ver o
 * movimento da Plataforma, e nunca entram na receita ({@link businessHealth}).
 *
 * @param input Dados já lidos da Plataforma, com `transactions` e `orders`.
 * @param query Período, origem e categoria (a categoria só filtra `items`).
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function transactionOverview(
  input: AdminMetricsInput,
  query?: TxQuery | null,
  now?: Instant,
): TransactionOverview {
  const scope = buildScope(input, now);
  const period = asPeriod(query?.period);
  const kind: TxKind | "all" = query?.kind === "plan" || query?.kind === "order" ? query.kind : "all";
  const category: TxCategory | "all" = TX_CATEGORIES.find((c) => c === query?.category) ?? "all";
  const { unit, buckets } = PERIOD_SHAPE[period];

  // Os inícios dos intervalos, do mais antigo para o atual.
  const starts: number[] = [];
  if (unit === "day") {
    const today = angolaDayStart(scope.nowMs);
    for (let back = buckets - 1; back >= 0; back -= 1) starts.push(today - back * DAY_MS);
  } else {
    const ref = new Date(scope.nowMs + ANGOLA_OFFSET_MS);
    for (let back = buckets - 1; back >= 0; back -= 1) {
      starts.push(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - back, 1) - ANGOLA_OFFSET_MS);
    }
  }
  const from = starts[0] ?? scope.nowMs;
  const firstMonth = angolaMonthNumber(from);
  const series = starts.map((start) => ({ start, concluida: 0, pendente: 0, cancelada: 0, amount: 0 }));
  const totals: Record<TxCategory, { count: number; amount: number }> = {
    concluida: { count: 0, amount: 0 },
    pendente: { count: 0, amount: 0 },
    cancelada: { count: 0, amount: 0 },
  };

  const inPeriod: PlatformTx[] = [];
  const add = (tx: PlatformTx | null): void => {
    if (tx === null || !(tx.createdAt >= from)) return;
    const index = unit === "day" ? Math.floor((tx.createdAt - from) / DAY_MS) : angolaMonthNumber(tx.createdAt) - firstMonth;
    const bucket = series[Math.min(buckets - 1, index)];
    if (!bucket) return;
    bucket[tx.category] += 1;
    if (tx.category === "concluida") bucket.amount += tx.amount;
    totals[tx.category].count += 1;
    totals[tx.category].amount += tx.amount;
    inPeriod.push(tx);
  };
  if (kind !== "order") for (const t of scope.transactions) add(planTxOf(t));
  if (kind !== "plan") for (const o of scope.orders) add(orderTxOf(o));

  const summary: TxSummary = {
    total: {
      count: totals.concluida.count + totals.pendente.count + totals.cancelada.count,
      amount: totals.concluida.amount + totals.pendente.amount + totals.cancelada.amount,
    },
    concluida: totals.concluida,
    pendente: totals.pendente,
    cancelada: totals.cancelada,
  };
  const items = (category === "all" ? inPeriod : inPeriod.filter((tx) => tx.category === category)).sort(byNewestTx);

  return { period, unit, from, summary, series, items, hasOrders: scope.orders.length > 0 };
}

// ---------------------------------------------------------------------------
// Estado de uma conta e de uma loja
// ---------------------------------------------------------------------------

/**
 * Estado da subscrição de uma conta, com os critérios das métricas:
 *
 *  - `admin` — conta de Administrador (acesso sempre ativo, sem pagar);
 *  - `active` — subscrição em vigor, com mais de {@link ATTENTION_WINDOW_DAYS} dias;
 *  - `expiring` — em vigor, a terminar dentro da janela de aviso;
 *  - `expired` — houve subscrição e já terminou;
 *  - `none` — nunca teve subscrição (ou a data gravada é ilegível).
 */
export function accountStatus(
  account: Pick<AccountLike, "isAdmin" | "planExpiresAt"> | null | undefined,
  now?: Instant,
): AccountStatus {
  if (account?.isAdmin === true) return { kind: "admin", expiresAt: null, daysRemaining: null, expiredAt: null };
  const raw = typeof account?.planExpiresAt === "string" ? account.planExpiresAt : null;
  const state = resolveBilling({ planExpiresAt: raw, isAdmin: false }, nowOf(now));
  if (state.accessActive) {
    return {
      kind: subscriptionExpiringSoon(state) ? "expiring" : "active",
      expiresAt: state.expiresAt,
      daysRemaining: state.daysRemaining,
      expiredAt: null,
    };
  }
  const endedAt = state.expired ? isoOrUndefined(raw) : undefined;
  if (endedAt) return { kind: "expired", expiresAt: null, daysRemaining: null, expiredAt: endedAt };
  return { kind: "none", expiresAt: null, daysRemaining: null, expiredAt: null };
}

/**
 * Estado público de uma loja:
 *
 *  - `online` — publicada, e o dono tem subscrição ativa;
 *  - `offline` — publicada, mas fora do ar: o dono está sem subscrição;
 *  - `draft` — rascunho (nunca publicada, ou despublicada).
 */
export function storeStatus(state: unknown, ownerActive: unknown): StoreStatusKind {
  if (asText(state) !== PUBLISHED_STATE) return "draft";
  return ownerActive === true ? "online" : "offline";
}

// ---------------------------------------------------------------------------
// Ativação manual da subscrição
// ---------------------------------------------------------------------------

/** A duração é uma das de {@link ACTIVATION_MONTHS}? */
export function isActivationMonths(value: unknown): value is ActivationMonths {
  return typeof value === "number" && (ACTIVATION_MONTHS as readonly number[]).includes(value);
}

/** «1, 3, 6 ou 12», a partir de {@link ACTIVATION_MONTHS}. */
function activationMonthsText(): string {
  const all = ACTIVATION_MONTHS.map(String);
  return `${all.slice(0, -1).join(", ")} ou ${all[all.length - 1]}`;
}

/**
 * Dias e preço de uma ativação manual, a partir do plano único: cada mês é um
 * período de `PLAN_PERIOD_DAYS` dias a `PLAN_PRICE_KZ`. É o valor que o Dono
 * deve ter pago por fora para o Administrador ativar.
 */
export function activationQuote(months: ActivationMonths): ActivationQuote {
  return { months, days: months * PLAN_PERIOD_DAYS, amountKz: months * PLAN_PRICE_KZ };
}

/**
 * O que gravar em `profiles` para ativar `months` meses à mão.
 *
 * É `planActivationPatch` (`src/services/billing.ts`), a mesma regra de um
 * pagamento confirmado: com subscrição em vigor, os dias somam-se ao fim do
 * período atual (quem renova adiantado não perde dias); sem ela, contam a partir
 * de agora. Antes, a ativação manual gravava uma data a cem anos — uma
 * subscrição vitalícia que ninguém pagou.
 *
 * @param current Estado gravado da conta (`plan_expires_at`).
 * @param months Uma das durações de {@link ACTIVATION_MONTHS}.
 * @param now Momento de referência.
 */
export function activationPatch(
  current: { readonly planExpiresAt?: string | null | undefined } | null | undefined,
  months: unknown,
  now?: Instant,
): AdminPatch<PlanPatch> {
  if (!isActivationMonths(months)) {
    return { ok: false, message: `Escolha uma duração de ${activationMonthsText()} meses.` };
  }
  const raw = typeof current?.planExpiresAt === "string" ? current.planExpiresAt : null;
  try {
    return { ok: true, patch: planActivationPatch({ planExpiresAt: raw }, nowOf(now), months) };
  } catch {
    // Só com uma data gravada no limite do calendário do `Date`.
    return { ok: false, message: "A data de fim da subscrição gravada não é válida." };
  }
}

/**
 * O que gravar em `profiles` para desativar a subscrição: o fim do período
 * passa a ser agora. As lojas publicadas da conta saem do ar; nada é apagado.
 */
export function deactivationPatch(now?: Instant): PlanPatch {
  return { plan_expires_at: isoOf(nowOf(now)) };
}

// ---------------------------------------------------------------------------
// Aprovação da verificação de empresa
// ---------------------------------------------------------------------------

/** Mensagem quando não há Administrador identificado para assinar a decisão. */
const NO_REVIEWER = "Sessão de administrador inválida. Volte a entrar e tente de novo.";

/** Identificador do Administrador que decide, ou `null` se não for utilizável. */
function reviewerOf(adminId: unknown): string | null {
  return typeof adminId === "string" && adminId.trim() !== "" ? adminId.trim() : null;
}

/**
 * Motivo da rejeição tal como fica gravado: sem espaços nas pontas, espaços
 * repetidos colapsados, no máximo uma linha em branco seguida. As mudanças de
 * linha ficam — o Dono lê o motivo no painel dele.
 */
export function normalizeRejectionReason(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Nº de caracteres, contando cada emoji e letra acentuada como um. */
function charCount(text: string): number {
  return Array.from(text).length;
}

/**
 * Valida o motivo de uma rejeição: entre {@link REJECTION_REASON_MIN} e
 * {@link REJECTION_REASON_MAX} caracteres, depois de normalizado. Um motivo
 * curto («não») não diz ao Dono o que corrigir, e ele fica sem forma de voltar a
 * pedir.
 */
export function validateRejectionReason(
  raw: unknown,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly message: string } {
  const value = normalizeRejectionReason(raw);
  const length = charCount(value);
  if (length === 0) {
    return { ok: false, message: "Escreva o motivo da rejeição: o Dono vai lê-lo no painel dele." };
  }
  if (length < REJECTION_REASON_MIN) {
    return { ok: false, message: `O motivo tem de ter pelo menos ${REJECTION_REASON_MIN} caracteres (tem ${length}).` };
  }
  if (length > REJECTION_REASON_MAX) {
    return { ok: false, message: `O motivo pode ter no máximo ${REJECTION_REASON_MAX} caracteres (tem ${length}).` };
  }
  return { ok: true, value };
}

/**
 * O que gravar em `store_payments` para **aprovar** um pedido. O gatilho
 * `store_payments_sync_store` (migração 0023) liga então
 * `stores.digital_payments` sozinho.
 *
 * Limpa o motivo de uma rejeição anterior: um pedido aprovado com um motivo de
 * rejeição gravado mostraria ao Dono uma frase que já não é verdade.
 */
export function approvalPatch(adminId: unknown, now?: Instant): AdminPatch<ApprovalPatch> {
  const reviewer = reviewerOf(adminId);
  if (!reviewer) return { ok: false, message: NO_REVIEWER };
  return {
    ok: true,
    patch: {
      verification_status: "approved",
      reviewed_at: isoOf(nowOf(now)),
      reviewed_by: reviewer,
      rejection_reason: null,
    },
  };
}

/**
 * O que gravar em `store_payments` para **rejeitar** um pedido (ou revogar uma
 * aprovação). Exige um motivo válido ({@link validateRejectionReason}). O
 * gatilho desliga `stores.digital_payments`.
 */
export function rejectionPatch(adminId: unknown, reason: unknown, now?: Instant): AdminPatch<RejectionPatch> {
  const reviewer = reviewerOf(adminId);
  if (!reviewer) return { ok: false, message: NO_REVIEWER };
  const checked = validateRejectionReason(reason);
  if (!checked.ok) return { ok: false, message: checked.message };
  return {
    ok: true,
    patch: {
      verification_status: "rejected",
      reviewed_at: isoOf(nowOf(now)),
      reviewed_by: reviewer,
      rejection_reason: checked.value,
    },
  };
}

/**
 * O que falta a um pedido para poder ser aprovado — vazio quando está completo.
 *
 * Espelha a restrição `store_payments_submission_complete` da base de dados
 * (migração 0023), que recusa uma aprovação sem estes dados: a interface
 * desliga «Aprovar» e diz o que falta, em vez de deixar o Postgres responder
 * com um erro.
 */
export function missingForApproval(v: VerificationDataLike | null | undefined): string[] {
  const fields: readonly [unknown, string][] = [
    [v?.companyName, "Nome da empresa"],
    [v?.companyNif, "NIF"],
    [v?.bankName, "Banco"],
    [v?.beneficiaryName, "Titular da conta"],
    [v?.iban, "IBAN"],
  ];
  const missing = fields.filter(([value]) => asText(value) === undefined).map(([, label]) => label);
  const docs = asRecord(v?.documents);
  for (const doc of COMPANY_DOCUMENTS) {
    if (asText(docs?.[doc.id]) === undefined) missing.push(doc.label);
  }
  return missing;
}

/**
 * Que decisões fazem sentido para um pedido neste estado:
 *
 *  - em análise — aprovar ou rejeitar;
 *  - aprovado — rejeitar (revoga os pagamentos digitais);
 *  - rejeitado — aprovar (corrige uma rejeição feita por engano);
 *  - por enviar — nenhuma: não há nada para decidir.
 */
export function verificationActions(status: unknown): { readonly approve: boolean; readonly reject: boolean } {
  const s: VerificationStatus = asVerificationStatus(asStatus(status));
  return { approve: s === "pending" || s === "rejected", reject: s === "pending" || s === "approved" };
}

/**
 * Parte os pedidos na fila de aprovações: **em análise** primeiro, o mais antigo
 * à frente; depois o **histórico** (aprovados e rejeitados), a decisão mais
 * recente à frente. Os pedidos «por enviar» não entram em nenhum dos dois.
 */
export function splitVerificationQueue<T extends VerificationLike>(
  rows: readonly T[] | null | undefined,
): VerificationQueue<T> {
  const pending: T[] = [];
  const history: T[] = [];
  for (const row of asList(rows)) {
    if (!row || typeof row.storeId !== "string") continue;
    const s = asVerificationStatus(asStatus(row.status));
    if (s === "pending") pending.push(row);
    else if (s === "approved" || s === "rejected") history.push(row);
  }
  return { pending: pending.sort(byOldestSubmission), history: history.sort(byLatestDecision) };
}

/** A fila inteira numa só lista: os em análise primeiro, depois o histórico. */
export function sortVerificationQueue<T extends VerificationLike>(rows: readonly T[] | null | undefined): T[] {
  const { pending, history } = splitVerificationQueue(rows);
  return [...pending, ...history];
}

/** Filtra o histórico pelo estado da decisão, mantendo a ordem. */
export function filterVerificationHistory<T extends VerificationLike>(
  history: readonly T[] | null | undefined,
  filter: HistoryFilter,
): T[] {
  const list = asList(history).filter((row) => !!row);
  if (filter === "all") return [...list];
  return list.filter((row) => asVerificationStatus(asStatus(row.status)) === filter);
}
