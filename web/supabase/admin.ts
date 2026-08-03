/**
 * Acesso de dados do Administrador da plataforma. Usa o cliente Supabase
 * autenticado; as políticas RLS de admin (migração 0011) dão acesso total.
 * Todas as funções pressupõem que o utilizador atual é admin (validado por
 * `isCurrentUserAdmin`).
 */
import { supabase } from "./client.js";
import type { PlanId } from "../../src/services/plans.js";
import { overviewCounts } from "../../src/services/adminMetrics.js";

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  plan: string;
  isAdmin: boolean;
  createdAt: string;
  storeCount: number;
  /** Fim do período de subscrição pago (ISO) ou null. */
  planExpiresAt: string | null;
  /** Plano agendado para o próximo período, ou null. */
  nextPlan: string | null;
  /**
   * Fim do período de teste grátis (ISO) ou null. A coluna `trial_ends_at`
   * existe em `profiles` desde a migração `0018_trial.sql`; é a fonte das
   * «contas em teste a expirar» e da conversão de teste para pago (R7.2).
   */
  trialEndsAt: string | null;
}

/** Funcionalidades ativas numa loja (vistas pelo admin). */
export interface StoreFeatures {
  /** Pagamentos online (Multicaixa Express + Referência Bancária). */
  online: boolean;
  /** SMS de confirmação de compra ao cliente. */
  sms: boolean;
  /** Checkout por WhatsApp configurado (número definido). */
  whatsapp: boolean;
  /** Taxas de entrega configuradas. */
  delivery: boolean;
}

export interface AdminStore {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  state: string;
  subdomain: string;
  identifier: string;
  templateId: string;
  plan: string;
  createdAt: string;
  features: StoreFeatures;
}

export interface AdminWithdrawal {
  id: string;
  storeId: string;
  storeName: string;
  ownerEmail: string;
  amount: number;
  status: "requested" | "approved" | "paid" | "rejected";
  bankName: string | null;
  beneficiaryName: string | null;
  iban: string | null;
  createdAt: string;
  processedAt: string | null;
}

/**
 * Totais globais da Plataforma. Todos os cinco campos excluem Loja_Modelo e
 * contas de Administrador (R7.8) — ver {@link adminOverview}.
 */
export interface AdminOverview {
  /** Contas de cliente (contas de Administrador fora). */
  accounts: number;
  /** Lojas de cliente (Loja_Modelo fora). */
  stores: number;
  /** Lojas de cliente publicadas. */
  published: number;
  /**
   * **Volume de vendas das Lojas**: encomendas pagas das Lojas de cliente. É
   * dinheiro dos Donos das Lojas e **não** é receita da Plataforma — essa é
   * `businessHealth().monthRevenue` de `src/services/adminMetrics.ts`.
   */
  salesTotal: number;
  /** Levantamentos por aprovar de Lojas de cliente. */
  pendingWithdrawals: number;
}

/** Como é que uma Loja entrou no resultado de `adminStoresUsingTemplate`. */
export type TemplateMatch = "templateId" | "basedOn";

/**
 * Uma Loja que usa um dos Modelo_De_Loja verificados. Só leitura: esta forma
 * existe para ser apresentada ao Administrador antes de qualquer eliminação.
 */
export interface AdminTemplateUser {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  state: string;
  identifier: string;
  templateId: string;
  /** Valor de `customization.__basedOn`, ou null quando ausente/não textual. */
  basedOn: string | null;
  /** Loja_Modelo do Administrador (tem `customization.__template`). */
  isModel: boolean;
  /** Por que critérios foi encontrada (pode ser pelos dois). */
  matchedBy: TemplateMatch[];
  createdAt: string;
}

/**
 * Resultado da verificação de uso de Modelo_De_Loja, partido nos dois grupos
 * que a decisão de eliminação precisa de distinguir (R1.7, R1.8).
 */
export interface AdminTemplateUsage {
  /** Identificadores efetivamente verificados (normalizados, sem vazios). */
  ids: string[];
  /** Loja_Modelo — as demonstrações do Administrador. */
  models: AdminTemplateUser[];
  /** Lojas de cliente. Grupo não vazio ⇒ a eliminação não avança (R1.8). */
  customerStores: AdminTemplateUser[];
}

/** O utilizador autenticado é administrador? */
export async function isCurrentUserAdmin(): Promise<boolean> {
  // getSession() espera pela hidratação a partir do armazenamento local,
  // evitando falsos negativos logo após um refresh da página.
  const { data: sess } = await supabase.auth.getSession();
  const id = sess.session?.user?.id;
  if (!id) return false;
  const { data: row } = await supabase.from("profiles").select("is_admin").eq("id", id).maybeSingle();
  return row?.is_admin === true;
}

async function profilesMap(): Promise<Map<string, { email: string; name: string; plan: string }>> {
  const { data } = await supabase.from("profiles").select("id, email, name, plan");
  const m = new Map<string, { email: string; name: string; plan: string }>();
  (data ?? []).forEach((p) => m.set(p.id, { email: p.email ?? "", name: p.name ?? "", plan: p.plan ?? "basico" }));
  return m;
}

/**
 * Métricas globais da plataforma, **todas** sem Loja_Modelo e sem contas de
 * Administrador (R7.8).
 *
 * **Só leitura.** Esta função lê as quatro tabelas e não agrega nada: a contagem
 * é `overviewCounts()` de `src/services/adminMetrics.ts`, a mesma função pura que
 * produz as outras treze agregações da Visão geral a partir do mesmo âmbito
 * (decisão D8). Estava aqui antes, em contagem de base de dados, e era por isso
 * que metade dos campos escapava à regra: `salesTotal` somava as encomendas de
 * demonstração das Loja_Modelo e `accounts` era um `count` cru de `profiles`, com
 * as contas de Administrador dentro. `pendingWithdrawals` tinha o mesmo defeito
 * pela mesma razão — era um `count` com `eq("status", "requested")` e nada mais.
 *
 * O que as consultas trazem, e porquê:
 *  - `profiles(id, is_admin)` em vez de um `count` cru — sem `is_admin` não há
 *    como deixar as contas de Administrador fora;
 *  - `stores(id, owner_id, state, customization)` — `customization.__template`
 *    marca a Loja_Modelo e `owner_id` liga a Loja à conta que a detém;
 *  - `orders(store_id, amount, status)` — `store_id` é o que permite ficar só
 *    com as encomendas das Lojas elegíveis (o mesmo nº de linhas de antes);
 *  - `withdrawals(id, store_id, status)` — linhas em vez de contagem, pela mesma
 *    razão que as encomendas.
 *
 * O custo mantém-se na mesma ordem: o Painel_Admin já carrega `profiles` inteira
 * em `listAccounts`, `stores` em `listStores` e `withdrawals` em
 * `listAllWithdrawals` no mesmo ecrã.
 */
export async function adminOverview(): Promise<AdminOverview> {
  const [{ data: profiles }, { data: stores }, { data: orders }, { data: withdrawals }] = await Promise.all([
    supabase.from("profiles").select("id, is_admin"),
    supabase.from("stores").select("id, owner_id, state, customization"),
    supabase.from("orders").select("store_id, amount, status"),
    supabase.from("withdrawals").select("id, store_id, status"),
  ]);
  return overviewCounts({
    accounts: (profiles ?? []).map((p) => ({ id: String(p.id), isAdmin: p.is_admin === true })),
    stores: (stores ?? []).map((s) => ({
      id: String(s.id),
      ownerId: s.owner_id ?? null,
      state: s.state ?? null,
      customization: s.customization,
    })),
    orders: (orders ?? []).map((o) => ({ storeId: o.store_id ?? null, amount: o.amount ?? null, status: o.status ?? null })),
    withdrawals: (withdrawals ?? []).map((w) => ({ id: String(w.id), storeId: w.store_id ?? null, status: w.status ?? null })),
  });
}

/** Lista de contas com o nº de lojas. */
export async function listAccounts(): Promise<AdminAccount[]> {
  const [{ data: profiles }, { data: stores }] = await Promise.all([
    supabase.from("profiles").select("id, email, name, plan, is_admin, created_at, plan_expires_at, next_plan, trial_ends_at").order("created_at", { ascending: false }),
    supabase.from("stores").select("owner_id"),
  ]);
  const counts = new Map<string, number>();
  (stores ?? []).forEach((s) => counts.set(s.owner_id, (counts.get(s.owner_id) ?? 0) + 1));
  return (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email ?? "",
    name: p.name ?? "",
    plan: p.plan ?? "basico",
    isAdmin: p.is_admin === true,
    createdAt: p.created_at,
    storeCount: counts.get(p.id) ?? 0,
    planExpiresAt: p.plan_expires_at ?? null,
    nextPlan: p.next_plan ?? null,
    trialEndsAt: p.trial_ends_at ?? null,
  }));
}

/**
 * Contagem de Produtos por Loja, indexada pelo `id` da Loja (decisão D5).
 *
 * **Só leitura.** Não escreve, não apaga, não migra.
 *
 * Traz uma linha por Produto da Plataforma com uma única coluna (`store_id`) e
 * conta em memória, sem `join` — a mesma abordagem que `listAccounts` já usa
 * para contar Lojas por dono. À escala atual o custo é irrelevante; se crescer,
 * troca-se por uma vista agregada no Supabase.
 *
 * Lojas sem Produtos não aparecem no `Map`: quem consome trata a ausência como
 * zero. Em caso de erro de leitura segue a convenção das **listagens** deste
 * ficheiro — registar no `console` e devolver resultado vazio —, e não a de
 * `adminStoresUsingTemplate`, que lança de propósito por ser guarda de uma
 * eliminação irreversível. Aqui um resultado vazio degrada a lista «Lojas sem
 * Produtos» (mostra Lojas a mais), não autoriza nenhuma ação destrutiva.
 */
export async function adminStoreProductCounts(): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase.from("products").select("store_id");
  if (error) {
    console.error("adminStoreProductCounts", error);
    return counts;
  }
  (data ?? []).forEach((r) => {
    const id = typeof r.store_id === "string" ? r.store_id : "";
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return counts;
}

/** Lista de todas as lojas, com o dono, plano e funcionalidades ativas. */
export async function listStores(): Promise<AdminStore[]> {
  const [{ data: stores }, { data: pays }, pm] = await Promise.all([
    supabase.from("stores").select("id, name, owner_id, state, subdomain, identifier, template_id, customization, created_at").order("created_at", { ascending: false }),
    supabase.from("store_payments").select("store_id, online_enabled"),
    profilesMap(),
  ]);
  const onlineByStore = new Map<string, boolean>();
  (pays ?? []).forEach((p) => onlineByStore.set(p.store_id, !!p.online_enabled));

  return (stores ?? []).filter((s) => !((s.customization ?? {}) as { __template?: unknown }).__template).map((s) => {
    const o = pm.get(s.owner_id);
    const c = (s.customization ?? {}) as {
      sms?: { enabled?: boolean };
      whatsapp?: { phone?: string };
      delivery?: { mode?: string; flatFee?: number; fees?: Record<string, number> };
    };
    const deliveryActive = !!c.delivery && (
      (c.delivery.mode === "single" && Number(c.delivery.flatFee) > 0) ||
      (c.delivery.mode === "perArea" && !!c.delivery.fees && Object.keys(c.delivery.fees).length > 0)
    );
    return {
      id: s.id,
      name: s.name,
      ownerId: s.owner_id,
      ownerEmail: o?.email ?? "",
      ownerName: o?.name ?? "",
      state: s.state,
      subdomain: s.subdomain,
      identifier: s.identifier,
      templateId: s.template_id,
      plan: o?.plan ?? "basico",
      createdAt: s.created_at,
      features: {
        online: onlineByStore.get(s.id) ?? false,
        sms: !!c.sms?.enabled,
        whatsapp: !!(c.whatsapp?.phone && c.whatsapp.phone.trim()),
        delivery: deliveryActive,
      },
    };
  });
}

/** Normaliza um identificador de Modelo_De_Loja para comparação. */
function normId(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Verificação em base de dados de quem usa um ou mais Modelo_De_Loja (R1.7).
 *
 * **Só leitura.** Não escreve, não apaga, não migra. Existe para ser corrida e
 * lida ANTES de qualquer eliminação de Loja_Modelo, que apaga Lojas publicadas
 * reais e é irreversível (decisão D7, rede de segurança da assunção `[A4]`).
 *
 * Devolve **todas** as Lojas que usam os `ids` — Loja_Modelo incluídas, ao
 * contrário de `listStores()`, que as filtra —, partidas em dois grupos:
 *  - `models`: as Loja_Modelo (têm `customization.__template`), a mesma
 *    convenção de `listTemplateModels` em `web/supabase/models.ts`;
 *  - `customerStores`: as Lojas de cliente. Se este grupo não estiver vazio, a
 *    eliminação **não avança** e o Modelo_De_Loja mantém-se registado (R1.8).
 *
 * Uma Loja entra no resultado se `template_id` estiver em `ids` **ou** se
 * `customization.__basedOn` estiver em `ids`.
 *
 * **Porque é que o filtro corre em memória e não na consulta.** `__basedOn` vive
 * dentro da coluna JSON `customization`, e combinar um `in` sobre `template_id`
 * com um filtro `->>` sobre uma chave com dois sublinhados num único `or` do
 * PostgREST é frágil (citação da chave, escape do valor). Aqui um falso negativo
 * apaga a loja de um cliente, por isso trazemos as linhas — o Painel_Admin já
 * carrega a tabela `stores` inteira em `listStores` e `adminOverview` — e
 * comparamos em JavaScript, onde a regra é legível e determinística. Sem `join`,
 * como as restantes consultas deste ficheiro: o email do dono vem de
 * `profilesMap()`.
 *
 * **Erros não são silenciados.** Ao contrário das listagens deste ficheiro, que
 * devolvem lista vazia em caso de erro, esta função lança: um resultado vazio
 * por falha de leitura seria indistinguível de «nenhuma Loja afetada» — o falso
 * negativo que autoriza uma eliminação irreversível.
 */
export async function adminStoresUsingTemplate(ids: string[]): Promise<AdminTemplateUsage> {
  const wanted = new Set((ids ?? []).map(normId).filter((v) => v !== ""));
  if (wanted.size === 0) return { ids: [], models: [], customerStores: [] };

  const [{ data, error }, pm] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, owner_id, state, subdomain, identifier, template_id, customization, created_at")
      .order("created_at", { ascending: false }),
    profilesMap(),
  ]);
  if (error) {
    console.error("adminStoresUsingTemplate", error);
    throw new Error(`adminStoresUsingTemplate: leitura de lojas falhou (${error.message})`);
  }

  type Row = {
    id: string; name: string; owner_id: string; state: string; subdomain: string;
    identifier: string; template_id: string; customization: unknown; created_at: string;
  };
  const rows = (data ?? []) as Row[];
  const customOf = (r: Row) => (r.customization ?? {}) as { __template?: unknown; __basedOn?: unknown };

  // `__basedOn` de uma Loja de cliente guarda o ID da loja-modelo aplicada
  // (`applyModelToStore`), não o id do Modelo_De_Loja. Juntamos esses IDs ao
  // conjunto procurado para que uma Loja baseada numa destas Loja_Modelo seja
  // encontrada mesmo que o seu `template_id` já tenha divergido. Só pode
  // acrescentar Lojas ao resultado — nunca retirar.
  const keys = new Set(wanted);
  for (const r of rows) {
    if (customOf(r).__template && wanted.has(normId(r.template_id))) keys.add(normId(r.id));
  }

  const models: AdminTemplateUser[] = [];
  const customerStores: AdminTemplateUser[] = [];
  for (const r of rows) {
    const c = customOf(r);
    const basedOn = typeof c.__basedOn === "string" ? c.__basedOn : null;
    const matchedBy: TemplateMatch[] = [];
    if (wanted.has(normId(r.template_id))) matchedBy.push("templateId");
    if (keys.has(normId(basedOn))) matchedBy.push("basedOn");
    if (matchedBy.length === 0) continue;

    const isModel = !!c.__template;
    const entry: AdminTemplateUser = {
      id: r.id,
      name: r.name,
      ownerId: r.owner_id,
      ownerEmail: pm.get(r.owner_id)?.email ?? "",
      state: r.state,
      identifier: r.identifier,
      templateId: r.template_id,
      basedOn,
      isModel,
      matchedBy,
      createdAt: r.created_at,
    };
    (isModel ? models : customerStores).push(entry);
  }

  return { ids: [...wanted], models, customerStores };
}

/** Lista de todos os pedidos de levantamento. */
export async function listAllWithdrawals(): Promise<AdminWithdrawal[]> {
  const [{ data: w }, { data: stores }, pm] = await Promise.all([
    supabase.from("withdrawals").select("id, store_id, owner_id, amount, status, bank_name, beneficiary_name, iban, created_at, processed_at").order("created_at", { ascending: false }),
    supabase.from("stores").select("id, name"),
    profilesMap(),
  ]);
  const storeNames = new Map<string, string>();
  (stores ?? []).forEach((s) => storeNames.set(s.id, s.name));
  return (w ?? []).map((r) => ({
    id: r.id,
    storeId: r.store_id,
    storeName: storeNames.get(r.store_id) ?? "—",
    ownerEmail: pm.get(r.owner_id)?.email ?? "",
    amount: Number(r.amount),
    status: r.status,
    bankName: r.bank_name,
    beneficiaryName: r.beneficiary_name,
    iban: r.iban,
    createdAt: r.created_at,
    processedAt: r.processed_at,
  }));
}

/** Transação de um serviço da plataforma (plano ou pacote de SMS). */
export interface AdminServiceTx {
  id: string;
  service: "plan" | "sms" | "logo";
  description: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  storeName: string | null;
  amount: number;
  method: string;
  status: "open" | "paid" | "failed" | "cancelled" | "expired";
  createdAt: string;
  paidAt: string | null;
}

/** Referência bancária por pagar cuja data-limite já passou = expirada. */
function txStatus(status: string, method: string, dueDate: string | null): AdminServiceTx["status"] {
  if (status === "open" && method === "reference" && dueDate) {
    const t = Date.parse(dueDate);
    if (Number.isFinite(t) && t < Date.now()) return "expired";
  }
  return (status as AdminServiceTx["status"]) ?? "open";
}

/** Lista as transações de serviços (planos + SMS), mais recentes primeiro. */
export async function listServiceTransactions(): Promise<AdminServiceTx[]> {
  const [{ data: plans }, { data: sms }, { data: logos }, { data: stores }, pm] = await Promise.all([
    supabase.from("plan_payments").select("id, owner_id, plan, amount, method, status, reference_due_date, created_at, paid_at").order("created_at", { ascending: false }),
    supabase.from("sms_purchases").select("id, owner_id, store_id, quantity, amount, method, status, created_at, paid_at").order("created_at", { ascending: false }),
    supabase.from("logo_purchases").select("id, owner_id, store_id, amount, method, status, created_at, paid_at").order("created_at", { ascending: false }),
    supabase.from("stores").select("id, name"),
    profilesMap(),
  ]);
  const storeNames = new Map<string, string>();
  (stores ?? []).forEach((s) => storeNames.set(s.id, s.name));

  const planName = (id: string): string => {
    const map: Record<string, string> = { basico: "Básico", profissional: "Profissional", empresarial: "Empresarial" };
    return map[id] ?? id;
  };

  const planTx: AdminServiceTx[] = (plans ?? []).map((r) => ({
    id: String(r.id),
    service: "plan",
    description: `Plano ${planName(String(r.plan))}`,
    ownerId: r.owner_id,
    ownerEmail: pm.get(r.owner_id)?.email ?? "",
    ownerName: pm.get(r.owner_id)?.name ?? "",
    storeName: null,
    amount: Number(r.amount),
    method: r.method,
    status: txStatus(String(r.status), String(r.method), r.reference_due_date ?? null),
    createdAt: r.created_at,
    paidAt: r.paid_at ?? null,
  }));

  const smsTx: AdminServiceTx[] = (sms ?? []).map((r) => ({
    id: String(r.id),
    service: "sms",
    description: `${r.quantity} SMS de confirmação`,
    ownerId: r.owner_id,
    ownerEmail: pm.get(r.owner_id)?.email ?? "",
    ownerName: pm.get(r.owner_id)?.name ?? "",
    storeName: storeNames.get(r.store_id) ?? null,
    amount: Number(r.amount),
    method: r.method,
    status: (r.status as AdminServiceTx["status"]) ?? "open",
    createdAt: r.created_at,
    paidAt: r.paid_at ?? null,
  }));

  const logoTx: AdminServiceTx[] = (logos ?? []).map((r) => ({
    id: String(r.id),
    service: "logo",
    description: "Criação de logótipo",
    ownerId: r.owner_id,
    ownerEmail: pm.get(r.owner_id)?.email ?? "",
    ownerName: pm.get(r.owner_id)?.name ?? "",
    storeName: storeNames.get(r.store_id) ?? null,
    amount: Number(r.amount),
    method: r.method,
    status: (r.status as AdminServiceTx["status"]) ?? "open",
    createdAt: r.created_at,
    paidAt: r.paid_at ?? null,
  }));

  return [...planTx, ...smsTx, ...logoTx].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function adminSetStoreState(storeId: string, state: "Publicada" | "Rascunho"): Promise<boolean> {
  const { error } = await supabase.from("stores").update({ state }).eq("id", storeId);
  if (error) console.error("adminSetStoreState", error);
  return !error;
}

export async function adminDeleteStore(storeId: string): Promise<boolean> {
  const { error } = await supabase.from("stores").delete().eq("id", storeId);
  if (error) console.error("adminDeleteStore", error);
  return !error;
}

export async function adminSetAccountPlan(ownerId: string, plan: PlanId): Promise<boolean> {
  // Concessão pelo admin: plano ativo sem data de fim (expiração longa).
  const farFuture = new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString();
  const { error } = await supabase.from("profiles").update({ plan, plan_expires_at: farFuture, next_plan: null }).eq("id", ownerId);
  if (error) console.error("adminSetAccountPlan", error);
  return !error;
}

/** Cancela a conta: remove as lojas (cascata) e o perfil. */
export async function adminDeleteAccount(ownerId: string): Promise<boolean> {
  await supabase.from("stores").delete().eq("owner_id", ownerId);
  const { error } = await supabase.from("profiles").delete().eq("id", ownerId);
  if (error) console.error("adminDeleteAccount", error);
  return !error;
}

export async function adminProcessWithdrawal(id: string, status: "approved" | "paid" | "rejected"): Promise<boolean> {
  const { error } = await supabase.from("withdrawals").update({ status, processed_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("adminProcessWithdrawal", error);
  return !error;
}

/** Tabela de origem de cada tipo de transação de serviço. */
const TX_TABLE: Record<AdminServiceTx["service"], string> = {
  plan: "plan_payments",
  sms: "sms_purchases",
  logo: "logo_purchases",
};

/**
 * Apaga uma transação de serviço (ex.: uma referência pendente que ficou
 * "presa"). Usado pelo admin para limpar transações que nunca concluem.
 */
export async function adminDeleteServiceTransaction(id: string, service: AdminServiceTx["service"]): Promise<boolean> {
  const table = TX_TABLE[service];
  if (!table) return false;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error("adminDeleteServiceTransaction", error);
  return !error;
}
