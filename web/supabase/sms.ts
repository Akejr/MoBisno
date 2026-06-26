/**
 * Créditos de SMS de confirmação. Cada SMS custa {@link SMS_UNIT_PRICE} Kz.
 * O saldo vive em `stores.sms_credits` (creditado no servidor após pagamento).
 */
import { supabase } from "./client.js";

/** Preço por mensagem (Kz). */
export const SMS_UNIT_PRICE = 300;

/** Pacotes de mensagens disponíveis para compra. */
export const SMS_PACKAGES = [15, 50, 100, 200] as const;

/** Saldo de SMS de uma loja (0 se não existir). */
export async function getSmsCredits(storeId: string): Promise<number> {
  const { data } = await supabase.from("stores").select("sms_credits").eq("id", storeId).maybeSingle();
  return Number(data?.sms_credits ?? 0);
}
