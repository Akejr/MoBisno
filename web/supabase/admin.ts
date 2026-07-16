/**
 * Acesso de dados do Administrador da plataforma. Usa o cliente Supabase
 * autenticado; as políticas RLS de admin (migração 0011) dão acesso total.
 * Todas as funções pressupõem que o utilizador atual é admin (validado por
 * `isCurrentUserAdmin`).
 */
import { supabase } from "./client.js";
import type { PlanId } from "../../src/services/plans.js";

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

export interface AdminOverview {
  accounts: number;
  stores: number;
  published: number;
  salesTotal: number;
  pendingWithdrawals: number;
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

/** Métricas globais da plataforma. */
export async function adminOverview(): Promise<AdminOverview> {
  const [{ count: accounts }, { data: stores }, { data: orders }, { count: pending }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("stores").select("state, customization"),
    supabase.from("orders").select("amount, status"),
    supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "requested"),
  ]);
  const realStores = (stores ?? []).filter((s) => !((s.customization ?? {}) as { __template?: unknown }).__template);
  const salesTotal = (orders ?? []).filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount), 0);
  const published = realStores.filter((s) => s.state === "Publicada").length;
  return {
    accounts: accounts ?? 0,
    stores: realStores.length,
    published,
    salesTotal,
    pendingWithdrawals: pending ?? 0,
  };
}

/** Lista de contas com o nº de lojas. */
export async function listAccounts(): Promise<AdminAccount[]> {
  const [{ data: profiles }, { data: stores }] = await Promise.all([
    supabase.from("profiles").select("id, email, name, plan, is_admin, created_at, plan_expires_at, next_plan").order("created_at", { ascending: false }),
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
  }));
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
  service: "plan" | "sms";
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
  const [{ data: plans }, { data: sms }, { data: stores }, pm] = await Promise.all([
    supabase.from("plan_payments").select("id, owner_id, plan, amount, method, status, reference_due_date, created_at, paid_at").order("created_at", { ascending: false }),
    supabase.from("sms_purchases").select("id, owner_id, store_id, quantity, amount, method, status, created_at, paid_at").order("created_at", { ascending: false }),
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

  return [...planTx, ...smsTx].sort(
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
