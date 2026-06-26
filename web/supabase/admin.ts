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
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
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
    supabase.from("stores").select("state"),
    supabase.from("orders").select("amount, status"),
    supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "requested"),
  ]);
  const salesTotal = (orders ?? []).filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount), 0);
  const published = (stores ?? []).filter((s) => s.state === "Publicada").length;
  return {
    accounts: accounts ?? 0,
    stores: (stores ?? []).length,
    published,
    salesTotal,
    pendingWithdrawals: pending ?? 0,
  };
}

/** Lista de contas com o nº de lojas. */
export async function listAccounts(): Promise<AdminAccount[]> {
  const [{ data: profiles }, { data: stores }] = await Promise.all([
    supabase.from("profiles").select("id, email, name, plan, is_admin, created_at").order("created_at", { ascending: false }),
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
  }));
}

/** Lista de todas as lojas, com o dono e plano. */
export async function listStores(): Promise<AdminStore[]> {
  const [{ data: stores }, pm] = await Promise.all([
    supabase.from("stores").select("id, name, owner_id, state, subdomain, identifier, template_id, created_at").order("created_at", { ascending: false }),
    profilesMap(),
  ]);
  return (stores ?? []).map((s) => {
    const o = pm.get(s.owner_id);
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
  const { error } = await supabase.from("profiles").update({ plan }).eq("id", ownerId);
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
