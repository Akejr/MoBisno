/** Cliente Supabase partilhado (browser). Usa a chave anon (pública). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Configuração do Supabase em falta: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em web/.env",
  );
}

/** Bucket público para logótipos, banners e imagens de produtos. */
export const STORAGE_BUCKET = "store-assets";

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
