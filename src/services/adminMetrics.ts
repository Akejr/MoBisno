/**
 * Métricas e listas da Visão geral do Painel_Admin (domínio puro, sem DOM).
 *
 * Quatro funções, três delas uma por secção da Visão geral (R7.1):
 *
 *  - {@link businessHealth} — as seis métricas de saúde do negócio (R7.2);
 *  - {@link monthlyEvolution} — evolução mensal de receita e de contas (R7.3);
 *  - {@link attentionLists} — as cinco listas de «A precisar de atenção» (R7.4),
 *    cada item com a ligação para o separador que resolve a ação (R7.5);
 *  - {@link overviewCounts} — os cinco totais globais que `adminOverview()` de
 *    `web/supabase/admin.ts` devolve (contas, Lojas, Lojas publicadas, volume de
 *    vendas das Lojas e levantamentos por aprovar). Vive aqui, e não em `web/`,
 *    porque metade desses totais escapava à exclusão do R7.8 enquanto era
 *    contagem crua em base de dados: `salesTotal` somava as encomendas de
 *    demonstração das Loja_Modelo e `accounts` contava as contas de
 *    Administrador. Sendo função pura, a exclusão passa a ser testável (D8).
 *
 * **Não consulta nada.** Recebe os dados já lidos por `web/supabase/admin.ts`
 * (`adminOverview`, `listAccounts`, `listStores`, `listAllWithdrawals`,
 * `listServiceTransactions` e `adminStoreProductCounts`) através dos tipos
 * `…Like` deste ficheiro, que são estruturalmente compatíveis com
 * `AdminAccount`, `AdminStore`, `AdminWithdrawal` e `AdminServiceTx` sem criar
 * dependência de `web/` — `src/**` é verificado pelo `tsc` com `lib: ["ES2022"]`,
 * sem DOM (decisão D5).
 *
 * **Exclusão de Loja_Modelo e de contas de Administrador (R7.8).** É aplicada
 * uma única vez, em {@link buildScope}, que produz os conjuntos elegíveis. Todas
 * as agregações leem exclusivamente esses conjuntos — nenhuma toca nos arrays
 * crus de `AdminMetricsInput`. É deliberado: a exclusão é consumida em dezoito
 * agregações distintas (seis métricas, duas séries mensais, cinco listas, cinco
 * totais globais) e um filtro repetido dezoito vezes esquece-se exatamente numa
 * delas — foi precisamente o que aconteceu enquanto os totais globais eram
 * contados em base de dados.
 *
 * **Totalidade.** Os dados chegam de JSON e de colunas anuláveis: datas
 * inválidas, montantes `null`, `customization` de qualquer forma. Nenhuma função
 * lança, para qualquer entrada — nem sequer com `input` vazio. Segue o estilo de
 * `src/services/storeCustom.ts` e `src/services/locations.ts`.
 *
 * **Armadilha de nomes, dita de frente:** {@link OverviewCounts.salesTotal} — o
 * que `adminOverview().salesTotal` devolve — é o **volume de vendas das Lojas**
 * (tabela `orders`, dinheiro dos clientes dos Donos); a **receita da Plataforma**
 * é {@link BusinessHealth.monthRevenue} e vem das **transações de serviço**
 * (planos, SMS, logótipos). São grandezas diferentes e levam rótulos distintos e
 * inequívocos na interface (D5).
 */

import { resolveBilling, type BillingState } from "./billing.js";

/** Meses apresentados na evolução mensal (R7.3). */
export const MONTHS_IN_EVOLUTION = 6;

/** Janela de aviso, em dias, das contas a expirar (R7.2, R7.4). */
export const ATTENTION_WINDOW_DAYS = 7;

/** Limite defensivo de meses da evolução: uma entrada absurda não gera milhões. */
const MAX_EVOLUTION_MONTHS = 60;

/** Estados de transação de serviço que exigem ação do Administrador (R7.4). */
const STUCK_STATUSES: readonly string[] = ["open", "failed", "expired"];

/** Estado de uma Loja publicada, tal como está gravado em `stores.state`. */
const PUBLISHED_STATE = "Publicada";

/**
 * Ligações dos separadores do Painel_Admin que resolvem cada ação (R7.5).
 * Caminhos reais da navegação de `web/views/adminPanel.ts` (`tabOf()`).
 */
export const ADMIN_HREFS = {
  levantamentos: "#/adminPainel/levantamentos",
  transacoes: "#/adminPainel/transacoes",
  contas: "#/adminPainel/contas",
  lojas: "#/adminPainel/lojas",
} as const;

/** Momento de referência aceite pelas funções deste módulo. */
export type Instant = number | string | Date | null | undefined;

/**
 * Conta da Plataforma. Forma mínima de `AdminAccount` de `web/supabase/admin.ts`.
 *
 * `planExpiresAt` é o único campo de subscrição que existe: é dele que sai
 * «subscrições ativas» e «a expirar». Os campos `plan`, `nextPlan` e
 * `trialEndsAt` foram removidos com os escalões e o teste grátis — mantê-los
 * declarados convidava a apoiar-se em dados que já ninguém escreve, que foi
 * exactamente a origem da avaria do plano vitalício.
 */
export interface AccountLike {
  readonly id: string;
  readonly email?: string | null | undefined;
  readonly name?: string | null | undefined;
  /** Conta de Administrador: excluída de todas as agregações (R7.8). */
  readonly isAdmin?: boolean | undefined;
  readonly createdAt?: string | null | undefined;
  /** Fim da subscrição paga (ISO) ou `null`. */
  readonly planExpiresAt?: string | null | undefined;
  readonly storeCount?: number | undefined;
}

/**
 * Loja. Forma mínima de `AdminStore`, mais `customization` — que `listStores()`
 * não devolve porque já filtra as Loja_Modelo, e que aqui é opcional
 * precisamente por isso: quando vem, `customization.__template` identifica uma
 * Loja_Modelo e exclui-a (R7.8).
 */
export interface StoreLike {
  readonly id: string;
  readonly name?: string | null | undefined;
  readonly ownerId?: string | null | undefined;
  readonly ownerEmail?: string | null | undefined;
  readonly ownerName?: string | null | undefined;
  readonly state?: string | null | undefined;
  readonly identifier?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  /** Personalização crua. `__template` presente ⇒ Loja_Modelo. */
  readonly customization?: unknown;
}

/** Pedido de levantamento. Forma mínima de `AdminWithdrawal`. */
export interface WithdrawalLike {
  readonly id: string;
  readonly storeId?: string | null | undefined;
  readonly storeName?: string | null | undefined;
  readonly ownerEmail?: string | null | undefined;
  readonly amount?: number | string | null | undefined;
  readonly status?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
}

/**
 * Encomenda de uma Loja (tabela `orders`). Forma mínima para o **volume de
 * vendas das Lojas**: só o estado, o montante e a Loja a que pertence.
 *
 * `storeId` não é decorativo — é o que permite deixar fora as encomendas de
 * demonstração das Loja_Modelo (R7.8). Sem ele, o volume apresentado ao
 * Administrador vinha inflacionado pelas vendas de mentira dos modelos.
 */
export interface OrderLike {
  readonly storeId?: string | null | undefined;
  readonly amount?: number | string | null | undefined;
  /** `"open"`, `"paid"`, `"failed"` ou `"cancelled"`. */
  readonly status?: string | null | undefined;
}

/** Transação de serviço da Plataforma. Forma mínima de `AdminServiceTx`. */
export interface ServiceTxLike {
  readonly id: string;
  /** `"plan"`, `"sms"` ou `"logo"`. */
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

/** Nome do design para {@link AccountLike}. */
export type AdminAccountLike = AccountLike;
/** Nome do design para {@link StoreLike}. */
export type AdminStoreLike = StoreLike;

/** Dados já lidos da Plataforma, tal como o Painel_Admin os tem em mão. */
export interface AdminMetricsInput {
  /**
   * Momento de referência. Omitido ⇒ `Date.now()`. Injetado para as métricas
   * serem determinísticas nos testes e para a evolução de 6 meses ser fixável.
   */
  readonly now?: Instant;
  readonly accounts?: readonly AccountLike[] | null | undefined;
  readonly stores?: readonly StoreLike[] | null | undefined;
  readonly withdrawals?: readonly WithdrawalLike[] | null | undefined;
  readonly transactions?: readonly ServiceTxLike[] | null | undefined;
  /**
   * Encomendas das Lojas (tabela `orders`). Só {@link overviewCounts} as lê; as
   * três secções da Visão geral não dependem delas.
   */
  readonly orders?: readonly OrderLike[] | null | undefined;
  /** Nº de Produtos por Loja (`storeId` → contagem). */
  readonly productCounts?: ReadonlyMap<string, number> | null | undefined;
}

/** As seis métricas de saúde do negócio (R7.2). Nenhuma é negativa. */
export interface BusinessHealth {
  /** Receita da Plataforma no mês corrente (transações de serviço pagas). */
  readonly monthRevenue: number;
  readonly activeSubscriptions: number;
  /** Contas em teste que termina nos próximos {@link ATTENTION_WINDOW_DAYS} dias. */
  readonly subscriptionsExpiring: number;
  /** Conversão de teste para pago, entre 0 e 1 inclusive. */
  readonly payingRate: number;
  readonly publishedStores: number;
  readonly suspendedStores: number;
}

/**
 * Os cinco totais globais da Plataforma, todos sobre os conjuntos elegíveis
 * (R7.8). Estruturalmente igual a `AdminOverview` de `web/supabase/admin.ts`,
 * que é o que esta forma existe para preencher. Nenhum total é negativo.
 */
export interface OverviewCounts {
  /** Contas de cliente. Contas de Administrador **fora**. */
  readonly accounts: number;
  /** Lojas de cliente. Loja_Modelo **fora**. */
  readonly stores: number;
  /** Lojas de cliente com `state === "Publicada"`. */
  readonly published: number;
  /**
   * **Volume de vendas das Lojas**: soma das encomendas `paid` das Lojas
   * elegíveis. Dinheiro dos clientes dos Donos, **não** receita da Plataforma —
   * essa é {@link BusinessHealth.monthRevenue}.
   */
  readonly salesTotal: number;
  /** Levantamentos com `status === "requested"` de Lojas elegíveis. */
  readonly pendingWithdrawals: number;
}

/** Um mês da evolução mensal. `month` no formato `"AAAA-MM"` (UTC). */
export interface MonthPoint {
  readonly month: string;
  readonly revenue: number;
  readonly accounts: number;
}

/** Item de lista com a ligação para o ecrã do Painel_Admin que resolve a ação (R7.5). */
export interface AttentionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly amount?: number | undefined;
  readonly href: string;
}

/** As cinco listas de «A precisar de atenção» (R7.4). */
export interface AttentionLists {
  readonly withdrawalsToApprove: readonly AttentionItem[];
  readonly paymentsStuck: readonly AttentionItem[];
  readonly accountsExpiring7d: readonly AttentionItem[];
  readonly storesWithoutProducts: readonly AttentionItem[];
  readonly storesUnpublished: readonly AttentionItem[];
}

// ---------------------------------------------------------------------------
// Leitura defensiva
// ---------------------------------------------------------------------------

/**
 * Lista utilizável, ou vazia. Guarda de totalidade: os arrays chegam de
 * chamadores JavaScript (`web/`) e podem vir ausentes ou nem ser arrays — e um
 * `for…of` sobre um não-array lançaria.
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
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Montante somável: `0` para `null`, `undefined`, texto não numérico, `NaN`,
 * `Infinity` **e para valores negativos**. O limite inferior a zero é o que
 * garante que nenhuma receita agregada é negativa (Propriedade 5), sem depender
 * da qualidade dos dados gravados.
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
 * A Loja é uma Loja_Modelo? Convenção da Plataforma: `customization.__template`
 * presente (a mesma de `listStores`, `adminOverview` e `listTemplateModels`).
 * Total: aceita `customization` de qualquer forma.
 */
export function isLojaModelo(store: StoreLike | null | undefined): boolean {
  const custom = asRecord(store?.customization);
  if (!custom) return false;
  const marker = custom["__template"];
  return marker !== undefined && marker !== null && marker !== false;
}

// ---------------------------------------------------------------------------
// Âmbito: o único sítio onde a exclusão do R7.8 é aplicada
// ---------------------------------------------------------------------------

/**
 * Conjuntos elegíveis, já sem Loja_Modelo e sem contas de Administrador. Todas
 * as agregações deste módulo leem daqui — e só daqui.
 */
interface Scope {
  readonly nowMs: number;
  /** Contas elegíveis: sem `isAdmin`. */
  readonly accounts: readonly AccountLike[];
  /** Faturação resolvida por conta elegível (`resolveBilling`, `src/services/billing.ts`). */
  readonly billing: ReadonlyMap<string, BillingState>;
  /** Lojas elegíveis: sem Loja_Modelo e sem Lojas de conta de Administrador. */
  readonly stores: readonly StoreLike[];
  /** IDs das Lojas elegíveis. */
  readonly storeIds: ReadonlySet<string>;
  /** Levantamentos de Lojas elegíveis. */
  readonly withdrawals: readonly WithdrawalLike[];
  /** Encomendas de Lojas elegíveis (as de demonstração das Loja_Modelo ficam fora). */
  readonly orders: readonly OrderLike[];
  /** Transações de serviço de contas que não são de Administrador. */
  readonly transactions: readonly ServiceTxLike[];
  /** Nº de Produtos por Loja, lido em segurança. */
  readonly productsOf: (storeId: string) => number;
}

/** Momento de referência: parâmetro explícito → `input.now` → `Date.now()`. */
function resolveNow(input: AdminMetricsInput | null | undefined, override?: Instant): number {
  return asInstant(override) ?? asInstant(input?.now) ?? Date.now();
}

/**
 * Aplica a exclusão do R7.8 e devolve os conjuntos elegíveis.
 *
 * Regras, todas conservadoras por desenho — nunca **acrescentam** nada às
 * agregações a partir de dados que não sejam elegíveis, o que é o que torna a
 * Propriedade 5 verdadeira por construção e não por remendo:
 *
 *  - **contas** — fora as que têm `isAdmin`;
 *  - **Lojas** — fora as Loja_Modelo (`customization.__template`) e as Lojas
 *    cujo dono é uma conta de Administrador conhecida;
 *  - **levantamentos** — só os de uma Loja **elegível**. Exigir pertença (em vez
 *    de excluir as Loja_Modelo conhecidas) é o que garante que acrescentar uma
 *    Loja_Modelo à entrada nunca pode retirar um levantamento da lista;
 *  - **encomendas** — só as de uma Loja **elegível**, pela mesma razão. As
 *    Loja_Modelo têm Produtos e encomendas de demonstração, e é exatamente por
 *    isso que o volume de vendas não as pode somar;
 *  - **transações de serviço** — fora as de uma conta de Administrador conhecida.
 *
 * Uma Loja sem dono conhecido continua elegível: a lista de contas pode não
 * cobrir todos os donos, e apagar Lojas reais das métricas por isso seria pior
 * do que contá-las. O que ela nunca faz é entrar nas Lojas suspensas, porque
 * essa métrica exige faturação resolvida.
 */
function buildScope(input: AdminMetricsInput | null | undefined, override?: Instant): Scope {
  const nowMs = resolveNow(input, override);

  // Exclusão 1 — contas de Administrador, na origem de todas as métricas de conta.
  const rawAccounts = asList(input?.accounts);
  const adminIds = new Set<string>();
  const accounts: AccountLike[] = [];
  for (const account of rawAccounts) {
    if (!account || typeof account.id !== "string") continue;
    if (account.isAdmin === true) {
      adminIds.add(account.id);
      continue;
    }
    accounts.push(account);
  }

  const billing = new Map<string, BillingState>();
  for (const account of accounts) {
    billing.set(
      account.id,
      resolveBilling(
        { planExpiresAt: account.planExpiresAt ?? null, isAdmin: false },
        nowMs,
      ),
    );
  }

  // Exclusão 2 — Loja_Modelo e Lojas de conta de Administrador.
  const rawStores = asList(input?.stores);
  const stores: StoreLike[] = [];
  const storeIds = new Set<string>();
  for (const store of rawStores) {
    if (!store || typeof store.id !== "string") continue;
    if (isLojaModelo(store)) continue;
    if (typeof store.ownerId === "string" && adminIds.has(store.ownerId)) continue;
    stores.push(store);
    storeIds.add(store.id);
  }

  // Exclusão 3 — levantamentos que não pertencem a uma Loja elegível.
  const rawWithdrawals = asList(input?.withdrawals);
  const withdrawals = rawWithdrawals.filter(
    (w) => !!w && typeof w.storeId === "string" && storeIds.has(w.storeId),
  );

  // Exclusão 4 — transações de serviço de contas de Administrador.
  const rawTransactions = asList(input?.transactions);
  const transactions = rawTransactions.filter(
    (t) => !!t && !(typeof t.ownerId === "string" && adminIds.has(t.ownerId)),
  );

  // Exclusão 5 — encomendas que não pertencem a uma Loja elegível. Mesma regra
  // de pertença dos levantamentos, e não «excluir as Loja_Modelo conhecidas».
  const rawOrders = asList(input?.orders);
  const orders = rawOrders.filter((o) => !!o && typeof o.storeId === "string" && storeIds.has(o.storeId));

  const counts = input?.productCounts;
  const productsOf = (storeId: string): number => {
    if (!counts || typeof counts.get !== "function") return 0;
    const n = counts.get(storeId);
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  return { nowMs, accounts, billing, stores, storeIds, withdrawals, orders, transactions, productsOf };
}

/** Faturação da conta elegível, ou `null` quando a conta não é elegível/conhecida. */
function billingOf(scope: Scope, accountId: unknown): BillingState | null {
  if (typeof accountId !== "string") return null;
  return scope.billing.get(accountId) ?? null;
}

/**
 * A subscrição termina dentro da janela de aviso (R7.2, R7.4).
 *
 * Substitui o critério do teste grátis, que deixou de existir. O que interessa
 * agora ao Administrador é quem está prestes a deixar de pagar — é aí que se
 * perde receita e é aí que uma chamada a tempo a salva.
 */
function subscriptionExpiringSoon(state: BillingState): boolean {
  return state.accessActive && !state.byAdmin && (state.daysRemaining ?? Infinity) <= ATTENTION_WINDOW_DAYS;
}

/** Transação de serviço paga, com a data de pagamento em milissegundos. */
function paidAtOf(tx: ServiceTxLike): number | null {
  if (asStatus(tx.status) !== "paid") return null;
  return asInstant(tx.paidAt ?? null);
}

// ---------------------------------------------------------------------------
// Totais globais da Plataforma (R7.8) — o que `adminOverview()` apresenta
// ---------------------------------------------------------------------------

/**
 * Os cinco totais globais da Plataforma, sobre os conjuntos elegíveis (R7.8):
 *
 *  - agregação 14 — **contas de cliente** (contas de Administrador fora);
 *  - agregação 15 — **Lojas de cliente** (Loja_Modelo fora);
 *  - agregação 16 — **Lojas publicadas** (`state === "Publicada"`);
 *  - agregação 17 — **volume de vendas das Lojas**: encomendas `paid` das Lojas
 *    elegíveis. É dinheiro dos clientes dos Donos e não receita da Plataforma —
 *    ver a armadilha de nomes no topo do ficheiro;
 *  - agregação 18 — **levantamentos por aprovar** (`status === "requested"`).
 *
 * Estas contagens eram feitas em base de dados por `adminOverview()`, e metade
 * delas escapava à exclusão do R7.8: o volume de vendas somava as encomendas de
 * demonstração das Loja_Modelo e as contas incluíam as de Administrador. Aqui
 * saem do mesmo âmbito das outras treze agregações, pelo que:
 *
 *  - `published` coincide sempre com `businessHealth().publishedStores`;
 *  - `pendingWithdrawals` coincide sempre com o comprimento de
 *    `attentionLists().withdrawalsToApprove`.
 *
 * @param input Dados já lidos da Plataforma, incluindo `orders`.
 * @param now Momento de referência; tem precedência sobre `input.now`. Nenhum
 *        destes totais depende do tempo — é aceite só para a assinatura ser a
 *        mesma das outras três funções.
 */
export function overviewCounts(input: AdminMetricsInput, now?: Instant): OverviewCounts {
  const scope = buildScope(input, now);

  // Agregação 17 — volume de vendas: só encomendas pagas de Lojas elegíveis.
  let salesTotal = 0;
  for (const order of scope.orders) {
    if (asStatus(order.status) === "paid") salesTotal += asAmount(order.amount);
  }

  // Agregação 16 — mesmo critério de `businessHealth().publishedStores`.
  let published = 0;
  for (const store of scope.stores) {
    if (asText(store.state) === PUBLISHED_STATE) published += 1;
  }

  // Agregação 18 — mesmo critério de `attentionLists().withdrawalsToApprove`.
  let pendingWithdrawals = 0;
  for (const withdrawal of scope.withdrawals) {
    if (asStatus(withdrawal.status) === "requested") pendingWithdrawals += 1;
  }

  return {
    accounts: scope.accounts.length,
    stores: scope.stores.length,
    published,
    salesTotal,
    pendingWithdrawals,
  };
}

// ---------------------------------------------------------------------------
// Secção 1 — saúde do negócio (R7.2)
// ---------------------------------------------------------------------------

/**
 * As seis métricas de saúde do negócio (R7.2), todas sobre os conjuntos
 * elegíveis (R7.8):
 *
 *  1. **receita do mês corrente** — transações de serviço `paid` com `paidAt` no
 *     mês do momento de referência. É a receita da **Plataforma** (planos, SMS,
 *     logótipos), não o volume de vendas das Lojas de `adminOverview().salesTotal`;
 *  2. **assinaturas ativas** — contas com plano pago em vigor (`resolveBilling`);
 *  3. **contas em teste a expirar** — teste a terminar nos próximos
 *     {@link ATTENTION_WINDOW_DAYS} dias;
 *  4. **conversão de teste para pago** — contas com pelo menos uma transação de
 *     plano paga, sobre o total de contas. Numerador contado por interseção com o
 *     conjunto de contas elegíveis, pelo que fica sempre em `[0, 1]`;
 *  5. **Lojas publicadas** — `state === "Publicada"`;
 *  6. **Lojas suspensas** — `resolveBilling(conta dona).suspended`.
 *
 * Nenhuma métrica é negativa: as contagens são cardinais e a receita soma
 * montantes já limitados a zero por baixo.
 *
 * @param input Dados já lidos da Plataforma.
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function businessHealth(input: AdminMetricsInput, now?: Instant): BusinessHealth {
  const scope = buildScope(input, now);
  const currentMonth = monthKeyOf(scope.nowMs);

  // Agregação 1 — receita do mês corrente.
  let monthRevenue = 0;
  // Agregação 4a — numerador da conversão: contas elegíveis com plano pago.
  const converted = new Set<string>();
  for (const tx of scope.transactions) {
    const paidAt = paidAtOf(tx);
    if (paidAt === null) continue;
    if (monthKeyOf(paidAt) === currentMonth) monthRevenue += asAmount(tx.amount);
    const ownerId = tx.ownerId;
    // Interseção com as contas elegíveis: é o que mantém o numerador ⊆ denominador
    // e, com isso, a conversão dentro de `[0, 1]`.
    if (asText(tx.service) === "plan" && typeof ownerId === "string" && scope.billing.has(ownerId)) {
      converted.add(ownerId);
    }
  }

  // Agregações 2, 3 e 4b — assinaturas ativas, testes a expirar, denominador.
  let activeSubscriptions = 0;
  let subscriptionsExpiring = 0;
  for (const account of scope.accounts) {
    const state = scope.billing.get(account.id);
    if (!state) continue;
    if (state.accessActive) activeSubscriptions += 1;
    if (subscriptionExpiringSoon(state)) subscriptionsExpiring += 1;
  }
  const payingRate = scope.accounts.length === 0 ? 0 : converted.size / scope.accounts.length;

  // Agregações 5 e 6 — Lojas publicadas e Lojas suspensas.
  let publishedStores = 0;
  let suspendedStores = 0;
  for (const store of scope.stores) {
    if (asText(store.state) === PUBLISHED_STATE) publishedStores += 1;
    if (billingOf(scope, store.ownerId)?.suspended === true) suspendedStores += 1;
  }

  return { monthRevenue, activeSubscriptions, subscriptionsExpiring, payingRate, publishedStores, suspendedStores };
}

// ---------------------------------------------------------------------------
// Secção 1b — evolução mensal (R7.3)
// ---------------------------------------------------------------------------

/**
 * Evolução mensal de receita e de número de contas, nos meses mais recentes
 * **do mais antigo para o mais recente** (R7.3).
 *
 * Os meses são gerados a partir do momento de referência, em UTC, pelo que um
 * mês sem receita e sem contas novas aparece com zeros em vez de ser saltado —
 * uma série com buracos desenharia um gráfico enganador.
 *
 * Agregação 7 (receita por mês de `paidAt`, só transações pagas) e agregação 8
 * (contas por mês de `createdAt`), ambas sobre os conjuntos elegíveis (R7.8).
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

  // Agregação 7 — receita por mês.
  for (const tx of scope.transactions) {
    const paidAt = paidAtOf(tx);
    if (paidAt === null) continue;
    const key = monthKeyOf(paidAt);
    const current = revenue.get(key);
    if (current !== undefined) revenue.set(key, current + asAmount(tx.amount));
  }

  // Agregação 8 — contas por mês.
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

// ---------------------------------------------------------------------------
// Secção 2 — «A precisar de atenção» (R7.4, R7.5)
// ---------------------------------------------------------------------------

/** Rótulo em pt-PT do estado de uma transação de serviço por resolver. */
function stuckLabel(status: string): string {
  if (status === "failed") return "Falhado";
  if (status === "expired") return "Expirado";
  return "Pendente";
}

/**
 * As cinco listas de «A precisar de atenção» (R7.4), cada item com `href` para o
 * separador do Painel_Admin que resolve a ação (R7.5), e todas sobre os
 * conjuntos elegíveis (R7.8):
 *
 *  - agregação 9 — **levantamentos por aprovar** (`status === "requested"`),
 *    mais antigos primeiro, porque é o mais antigo que está à espera há mais tempo;
 *  - agregação 10 — **pagamentos por resolver** (`open`, `failed`, `expired`);
 *  - agregação 11 — **contas a expirar** nos próximos
 *    {@link ATTENTION_WINDOW_DAYS} dias, as mais urgentes primeiro. A lista e a
 *    métrica `subscriptionsExpiring` partilham o mesmo critério, por isso o número da
 *    secção de saúde e o comprimento desta lista nunca divergem;
 *  - agregação 12 — **Lojas sem Produtos** (contagem ausente conta como zero);
 *  - agregação 13 — **Lojas não publicadas** (`state !== "Publicada"`).
 *
 * A ordenação é total e determinística (critério principal, desempate por `id`),
 * para que a mesma entrada produza sempre a mesma lista.
 *
 * @param input Dados já lidos da Plataforma.
 * @param now Momento de referência; tem precedência sobre `input.now`.
 */
export function attentionLists(input: AdminMetricsInput, now?: Instant): AttentionLists {
  const scope = buildScope(input, now);

  // Agregação 9 — levantamentos por aprovar.
  const withdrawalsToApprove = scope.withdrawals
    .filter((w) => asStatus(w.status) === "requested")
    .map((w) => ({
      id: w.id,
      title: textOr(w.storeName, "Loja sem nome"),
      detail: textOr(w.ownerEmail, "dono desconhecido"),
      amount: asAmount(w.amount),
      href: ADMIN_HREFS.levantamentos,
      sortAt: asInstant(w.createdAt ?? null) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.sortAt - b.sortAt || compareText(a.id, b.id))
    .map(stripSort);

  // Agregação 10 — pagamentos por resolver.
  const paymentsStuck = scope.transactions
    .filter((t) => STUCK_STATUSES.includes(asStatus(t.status)))
    .map((t) => ({
      id: t.id,
      title: textOr(t.description, "Transação de serviço"),
      detail: `${stuckLabel(asStatus(t.status))} · ${textOr(t.ownerEmail, "dono desconhecido")}`,
      amount: asAmount(t.amount),
      href: ADMIN_HREFS.transacoes,
      sortAt: asInstant(t.createdAt ?? null) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.sortAt - b.sortAt || compareText(a.id, b.id))
    .map(stripSort);

  // Agregação 11 — contas a expirar nos próximos 7 dias.
  const accountsExpiring7d = scope.accounts
    .map((account) => ({ account, state: scope.billing.get(account.id) }))
    .filter((row) => !!row.state && subscriptionExpiringSoon(row.state))
    .map(({ account, state }) => {
      const days = state?.daysRemaining ?? 0;
      return {
        id: account.id,
        title: textOr(account.email, textOr(account.name, "Conta sem email")),
        detail: days <= 0 ? "Subscrição termina hoje" : days === 1 ? "Subscrição termina amanhã" : `Subscrição termina em ${days} dias`,
        href: ADMIN_HREFS.contas,
        sortAt: days,
      };
    })
    .sort((a, b) => a.sortAt - b.sortAt || compareText(a.id, b.id))
    .map(stripSort);

  // Agregações 12 e 13 — Lojas sem Produtos e Lojas não publicadas.
  const withoutProducts: (AttentionItem & { sortAt: number })[] = [];
  const unpublished: (AttentionItem & { sortAt: number })[] = [];
  for (const store of scope.stores) {
    const title = textOr(store.name, "Loja sem nome");
    const owner = textOr(store.ownerEmail, "dono desconhecido");
    // Mais recentes primeiro: uma Loja criada agora ainda pode não ter Produtos.
    const sortAt = -(asInstant(store.createdAt ?? null) ?? 0);
    if (scope.productsOf(store.id) === 0) {
      withoutProducts.push({ id: store.id, title, detail: `Sem Produtos · ${owner}`, href: ADMIN_HREFS.lojas, sortAt });
    }
    const state = asText(store.state);
    if (state !== PUBLISHED_STATE) {
      unpublished.push({
        id: store.id,
        title,
        detail: `${state ?? "Rascunho"} · ${owner}`,
        href: ADMIN_HREFS.lojas,
        sortAt,
      });
    }
  }
  const byRecency = (a: { sortAt: number; id: string }, b: { sortAt: number; id: string }): number =>
    a.sortAt - b.sortAt || compareText(a.id, b.id);

  return {
    withdrawalsToApprove,
    paymentsStuck,
    accountsExpiring7d,
    storesWithoutProducts: withoutProducts.sort(byRecency).map(stripSort),
    storesUnpublished: unpublished.sort(byRecency).map(stripSort),
  };
}

/** Retira a chave de ordenação, deixando o {@link AttentionItem} público. */
function stripSort(row: AttentionItem & { sortAt: number }): AttentionItem {
  const { sortAt: _sortAt, ...item } = row;
  return item;
}
