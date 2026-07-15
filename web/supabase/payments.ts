/**
 * Configuração de pagamentos e encomendas (Supabase).
 *
 * `store_payments` guarda a ativação, a chave MoMenu do comerciante e os dados
 * bancários. O RLS garante que só o dono lê/escreve a configuração da sua loja
 * (não há leitura pública: a chave nunca é exposta a visitantes).
 *
 * `orders` é só de leitura para o dono (a criação/atualização é feita pelas
 * funções serverless com a service role).
 */
import { supabase } from "./client.js";

export interface PaymentConfig {
  onlineEnabled: boolean;
  bankName: string;
  beneficiaryName: string;
  iban: string;
}

export const EMPTY_PAYMENT_CONFIG: PaymentConfig = {
  onlineEnabled: false,
  bankName: "",
  beneficiaryName: "",
  iban: "",
};

export interface OrderRow {
  id: string;
  method: "mcx" | "reference" | "whatsapp";
  status: "open" | "paid" | "failed" | "cancelled";
  amount: number;
  fee: number;
  net: number;
  invoiceUrl: string | null;
  referenceNumber: string | null;
  referenceEntity: string | null;
  /** Data-limite da referência bancária (ISO), quando aplicável. */
  dueDate: string | null;
  customer: { name?: string; nif?: string; phone?: string } | null;
  createdAt: string;
  paidAt: string | null;
}

/**
 * Uma referência bancária por pagar (`open`) cuja data-limite já passou é
 * considerada **expirada** — deixa de ficar "pendente" para sempre.
 */
export function isReferenceExpired(row: { status: string; method: string; dueDate: string | null }): boolean {
  if (row.status !== "open" || row.method !== "reference" || !row.dueDate) return false;
  const t = Date.parse(row.dueDate);
  return Number.isFinite(t) && t < Date.now();
}

/** Estado efetivo de uma encomenda (com "expired" derivado da data-limite). */
export function orderEffectiveStatus(row: { status: string; method: string; dueDate: string | null }): string {
  return isReferenceExpired(row) ? "expired" : row.status;
}

export interface OrderStats {
  totalSales: number;   // soma de `amount` das encomendas pagas
  netReceived: number;  // soma de `net` (transferido via levantamento instantâneo)
  totalFees: number;    // soma das taxas (2%)
  paidCount: number;
  pendingCount: number; // referências por pagar
}

/** Lê a configuração de pagamentos de uma loja (valores por omissão se ausente). */
export async function getPaymentConfig(storeId: string): Promise<PaymentConfig> {
  const { data } = await supabase
    .from("store_payments")
    .select("online_enabled, bank_name, beneficiary_name, iban")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!data) return { ...EMPTY_PAYMENT_CONFIG };
  return {
    onlineEnabled: !!data.online_enabled,
    bankName: data.bank_name ?? "",
    beneficiaryName: data.beneficiary_name ?? "",
    iban: data.iban ?? "",
  };
}

/** Grava (upsert) a configuração de pagamentos de uma loja. */
export async function savePaymentConfig(storeId: string, cfg: PaymentConfig): Promise<boolean> {
  const row = {
    store_id: storeId,
    online_enabled: cfg.onlineEnabled,
    bank_name: cfg.bankName.trim() || null,
    beneficiary_name: cfg.beneficiaryName.trim() || null,
    iban: cfg.iban.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("store_payments").upsert(row, { onConflict: "store_id" });
  if (error) console.error("savePaymentConfig", error);
  return !error;
}

/** Lê as encomendas de uma loja (mais recentes primeiro). */
export async function listOrders(storeId: string, limit = 50): Promise<OrderRow[]> {
  const { data } = await supabase
    .from("orders")
    .select("id, method, status, amount, fee, net, invoice_url, reference_number, reference_entity, reference_due_date, customer, created_at, paid_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    method: r.method,
    status: r.status,
    amount: Number(r.amount),
    fee: Number(r.fee),
    net: Number(r.net),
    invoiceUrl: r.invoice_url,
    referenceNumber: r.reference_number,
    referenceEntity: r.reference_entity,
    dueDate: r.reference_due_date ?? null,
    customer: r.customer,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
}

/** Resumo financeiro de uma loja (calculado a partir das encomendas). */
export async function getOrderStats(storeId: string): Promise<OrderStats> {
  const { data } = await supabase
    .from("orders")
    .select("status, method, amount, fee, net, reference_due_date")
    .eq("store_id", storeId);
  const rows = data ?? [];
  const stats: OrderStats = { totalSales: 0, netReceived: 0, totalFees: 0, paidCount: 0, pendingCount: 0 };
  for (const r of rows) {
    if (r.status === "paid") {
      stats.totalSales += Number(r.amount);
      stats.netReceived += Number(r.net);
      stats.totalFees += Number(r.fee);
      stats.paidCount += 1;
    } else if (r.status === "open" && r.method === "reference"
      && !isReferenceExpired({ status: r.status, method: r.method, dueDate: r.reference_due_date ?? null })) {
      // Só conta como pendente se ainda não expirou.
      stats.pendingCount += 1;
    }
  }
  return stats;
}
