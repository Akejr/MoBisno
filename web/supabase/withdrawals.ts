/**
 * Pedidos de levantamento (Supabase). O dono solicita; a plataforma processa
 * depois (/admin). O "disponível para levantar" é o líquido recebido menos os
 * levantamentos já pedidos/pagos (não rejeitados).
 */
import { supabase } from "./client.js";
import type { PaymentConfig } from "./payments.js";

export type WithdrawalStatus = "requested" | "approved" | "paid" | "rejected";

export interface WithdrawalRow {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  bankName: string | null;
  beneficiaryName: string | null;
  iban: string | null;
  createdAt: string;
  processedAt: string | null;
}

/** Lista os levantamentos de uma loja (mais recentes primeiro). */
export async function listWithdrawals(storeId: string): Promise<WithdrawalRow[]> {
  const { data } = await supabase
    .from("withdrawals")
    .select("id, amount, status, bank_name, beneficiary_name, iban, created_at, processed_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    status: r.status,
    bankName: r.bank_name,
    beneficiaryName: r.beneficiary_name,
    iban: r.iban,
    createdAt: r.created_at,
    processedAt: r.processed_at,
  }));
}

/** Total já comprometido em levantamentos (pedidos/aprovados/pagos). */
export async function committedWithdrawals(storeId: string): Promise<number> {
  const { data } = await supabase
    .from("withdrawals")
    .select("amount, status")
    .eq("store_id", storeId);
  return (data ?? [])
    .filter((r) => r.status !== "rejected")
    .reduce((sum, r) => sum + Number(r.amount), 0);
}

/** Cria um pedido de levantamento (guarda um instantâneo da conta bancária). */
export async function requestWithdrawal(
  storeId: string,
  ownerId: string,
  amount: number,
  bank: Pick<PaymentConfig, "bankName" | "beneficiaryName" | "iban">,
): Promise<boolean> {
  const { error } = await supabase.from("withdrawals").insert({
    store_id: storeId,
    owner_id: ownerId,
    amount: Math.max(0, Math.round(amount * 100) / 100),
    status: "requested",
    bank_name: bank.bankName || null,
    beneficiary_name: bank.beneficiaryName || null,
    iban: bank.iban || null,
  });
  if (error) console.error("requestWithdrawal", error);
  return !error;
}
