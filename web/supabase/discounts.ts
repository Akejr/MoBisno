/**
 * Códigos de desconto por loja. O dono cria/gere; o checkout valida (leitura
 * pública de códigos ativos). Os usos são incrementados no servidor.
 */
import { supabase } from "./client.js";

export type DiscountType = "percent" | "fixed";

export interface DiscountCode {
  id: string;
  storeId: string;
  code: string;
  type: DiscountType;
  value: number;
  active: boolean;
  uses: number;
  createdAt: string;
}

function toDiscount(r: Record<string, unknown>): DiscountCode {
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    code: String(r.code),
    type: (r.type === "fixed" ? "fixed" : "percent"),
    value: Number(r.value),
    active: r.active === true,
    uses: Number(r.uses ?? 0),
    createdAt: String(r.created_at ?? ""),
  };
}

/** Lista os códigos de uma loja (do dono). */
export async function listDiscounts(storeId: string): Promise<DiscountCode[]> {
  const { data } = await supabase
    .from("discount_codes")
    .select("id, store_id, code, type, value, active, uses, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toDiscount);
}

/** Cria um código. Devolve erro legível ou null em sucesso. */
export async function createDiscount(
  storeId: string,
  input: { code: string; type: DiscountType; value: number },
): Promise<string | null> {
  const code = input.code.trim().toUpperCase();
  if (code.length < 3) return "O código deve ter pelo menos 3 caracteres.";
  if (!(input.value > 0)) return "O valor do desconto deve ser maior que zero.";
  if (input.type === "percent" && input.value > 100) return "A percentagem não pode exceder 100%.";
  const { error } = await supabase.from("discount_codes").insert({
    store_id: storeId, code, type: input.type, value: input.value, active: true,
  });
  if (error) {
    if (error.code === "23505") return "Já existe um código com esse nome nesta loja.";
    return "Não foi possível criar o código.";
  }
  return null;
}

/** Ativa/desativa um código. */
export async function setDiscountActive(id: string, active: boolean): Promise<boolean> {
  const { error } = await supabase.from("discount_codes").update({ active }).eq("id", id);
  return !error;
}

/** Apaga um código. */
export async function deleteDiscount(id: string): Promise<boolean> {
  const { error } = await supabase.from("discount_codes").delete().eq("id", id);
  return !error;
}

/** Valida um código no checkout (leitura pública de códigos ativos). */
export async function validateDiscount(storeId: string, code: string): Promise<DiscountCode | null> {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  const { data } = await supabase
    .from("discount_codes")
    .select("id, store_id, code, type, value, active, uses, created_at")
    .eq("store_id", storeId)
    .eq("code", norm)
    .eq("active", true)
    .maybeSingle();
  return data ? toDiscount(data) : null;
}

/** Valor do desconto (Kz) para um subtotal, nunca superior ao subtotal. */
export function discountAmount(code: Pick<DiscountCode, "type" | "value">, subtotal: number): number {
  const raw = code.type === "percent" ? (subtotal * code.value) / 100 : code.value;
  return Math.max(0, Math.min(subtotal, Math.round(raw)));
}
