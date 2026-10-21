/**
 * Créditos de SMS de confirmação — funcionalidade «Em breve»
 * (`COMING_SOON.sms`, `src/services/comingSoon.ts`).
 *
 * O saldo vive em `stores.sms_credits` e só o servidor o altera (gatilho
 * `stores_guard`, migração 0022). A compra de pacotes saiu com a integração
 * MoMenu; o saldo que algum Dono já tenha comprado fica guardado e é mostrado.
 */
import { supabase } from "./client.js";

/** Saldo de SMS de uma loja (0 se não existir). */
export async function getSmsCredits(storeId: string): Promise<number> {
  const { data } = await supabase.from("stores").select("sms_credits").eq("id", storeId).maybeSingle();
  return Number(data?.sms_credits ?? 0);
}
