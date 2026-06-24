/** Utilitários partilhados para o checkout/contacto via WhatsApp. */
import type { StoreCustomization } from "../templates/types.js";

/** Tokens obrigatórios do modelo de mensagem do produto. */
export const WA_TOKENS = ["produto", "preco"] as const;
export type WaToken = (typeof WA_TOKENS)[number];

/** Rótulos amigáveis dos tokens (apresentados como "chips" na edição). */
export const WA_TOKEN_LABELS: Record<WaToken, string> = {
  produto: "nome do produto",
  preco: "preço",
};

/** Mensagem predefinida do botão de WhatsApp na página de produto. */
export const WA_DEFAULT_TEMPLATE =
  'Olá! Tenho interesse no produto "{produto}" ({preco}). Está disponível?';

/** Número de telefone padrão (fallback). */
export const WA_DEFAULT_PHONE = "+244 900 000 000";

/** Resolve o número de WhatsApp da loja (whatsapp.phone → footer.phone → fallback). */
export function resolveWaPhone(custom?: StoreCustomization): string {
  return custom?.whatsapp?.phone || custom?.footer?.phone || WA_DEFAULT_PHONE;
}

/** Garante que o modelo contém os dois tokens obrigatórios (acrescenta os em falta). */
export function ensureTokens(template: string): string {
  let t = template ?? "";
  if (!/\{produto\}/.test(t)) t += (t.endsWith(" ") || t === "" ? "" : " ") + '"{produto}"';
  if (!/\{preco\}/.test(t)) t += (t.endsWith(" ") ? "" : " ") + "({preco})";
  return t;
}

/** Constrói a mensagem do produto a partir do modelo, substituindo os tokens. */
export function buildProductMessage(
  template: string | undefined,
  name: string,
  priceFormatted: string,
): string {
  const t = template && template.trim() ? template : WA_DEFAULT_TEMPLATE;
  return t.replace(/\{produto\}/g, name).replace(/\{preco\}/g, priceFormatted);
}

/** Constrói um link wa.me a partir de um número e mensagem. */
export function waLink(phone: string, message: string): string {
  const digits = (phone || WA_DEFAULT_PHONE).replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
