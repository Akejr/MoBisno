/**
 * Códigos de desconto por loja. O Dono cria e gere; o checkout valida um código
 * de cada vez pela função `public.validate_discount` (migração 0022).
 *
 * Os códigos já não são listáveis com a chave anónima: a leitura pública de
 * todos os códigos ativos deixava qualquer pessoa ver os descontos de qualquer
 * loja. O uso é contado no servidor, quando a encomenda é paga.
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
  /** Limite de usos (null = ilimitado). */
  maxUses: number | null;
  /** Fim da validade (ISO; null = sem prazo). */
  expiresAt: string | null;
  createdAt: string;
}

/** Código encontrado pelo checkout (só o que é preciso para aplicar o desconto). */
export interface ValidDiscount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toDiscount(r: any): DiscountCode {
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    code: String(r.code),
    type: r.type === "fixed" ? "fixed" : "percent",
    value: Number(r.value),
    active: r.active === true,
    uses: Number(r.uses ?? 0),
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    expiresAt: r.expires_at ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Estado de um código para a lista do Dono. */
export function discountState(d: DiscountCode, agora: number = Date.now()): "ativo" | "inativo" | "caducado" | "esgotado" {
  if (!d.active) return "inativo";
  if (d.expiresAt && Date.parse(d.expiresAt) <= agora) return "caducado";
  if (d.maxUses != null && d.uses >= d.maxUses) return "esgotado";
  return "ativo";
}

/** Lista os códigos de uma loja (do Dono). */
export async function listDiscounts(storeId: string): Promise<DiscountCode[]> {
  const { data } = await supabase
    .from("discount_codes")
    .select("id, store_id, code, type, value, active, uses, max_uses, expires_at, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toDiscount);
}

/** Cria um código. Devolve erro legível ou null em sucesso. */
export async function createDiscount(
  storeId: string,
  input: { code: string; type: DiscountType; value: number; maxUses?: number | null; expiresAt?: string | null },
): Promise<string | null> {
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "");
  if (code.length < 3) return "O código deve ter pelo menos 3 caracteres.";
  if (!/^[A-Z0-9_-]+$/.test(code)) return "Use só letras, algarismos, hífen ou sublinhado no código.";
  if (!(input.value > 0)) return "O valor do desconto deve ser maior que zero.";
  if (input.type === "percent" && input.value > 100) return "A percentagem não pode exceder 100%.";
  const maxUses = input.maxUses == null ? null : Math.floor(input.maxUses);
  if (maxUses !== null && !(maxUses > 0)) return "O limite de usos tem de ser 1 ou mais.";
  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const t = Date.parse(input.expiresAt);
    if (!Number.isFinite(t)) return "A data de validade não é válida.";
    if (t <= Date.now()) return "A data de validade tem de ser no futuro.";
    expiresAt = new Date(t).toISOString();
  }
  const { error } = await supabase.from("discount_codes").insert({
    store_id: storeId, code, type: input.type, value: input.value, active: true,
    max_uses: maxUses, expires_at: expiresAt,
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

/**
 * Valida um código no checkout. Devolve o código, ou `null` se não existir, se
 * estiver inativo, caducado ou esgotado.
 */
export async function validateDiscount(storeId: string, code: string): Promise<ValidDiscount | null> {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  const { data, error } = await supabase.rpc("validate_discount", { p_store_id: storeId, p_code: norm });
  if (error) { console.error("validateDiscount", error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { id: String(row.id), code: String(row.code), type: row.type === "fixed" ? "fixed" : "percent", value: Number(row.value) };
}

/** Valor do desconto (Kz) para um total, nunca superior a ele. Espelhado em `api/_shared.js`. */
export function discountAmount(code: Pick<DiscountCode, "type" | "value">, subtotal: number): number {
  const raw = code.type === "percent" ? (subtotal * code.value) / 100 : code.value;
  return Math.max(0, Math.min(subtotal, Math.round(raw)));
}
