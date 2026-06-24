/** Leitura/gravação da personalização da Loja (coluna jsonb `customization`). */
import { supabase } from "./client.js";
import type { StoreCustomization } from "../templates/types.js";

/** Lê a personalização de uma Loja (vazia se não existir). */
export async function getCustomization(storeId: string): Promise<StoreCustomization> {
  const { data } = await supabase.from("stores").select("customization").eq("id", storeId).maybeSingle();
  return ((data?.customization as StoreCustomization | null) ?? {}) as StoreCustomization;
}

/** Guarda a personalização de uma Loja do dono autenticado. */
export async function saveCustomization(
  ownerId: string,
  storeId: string,
  customization: StoreCustomization,
): Promise<boolean> {
  const { error } = await supabase
    .from("stores")
    .update({ customization })
    .eq("id", storeId)
    .eq("owner_id", ownerId);
  if (error) console.error("saveCustomization", error);
  return !error;
}
