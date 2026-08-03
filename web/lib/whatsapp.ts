/**
 * Utilitários partilhados para o checkout/contacto via WhatsApp.
 *
 * A leitura defensiva da Personalização (`resolveWaPhone`, `WA_DEFAULT_PHONE`)
 * vive em `src/services/storeCustom.ts` — domínio puro, dentro do programa do
 * `tsc` e portanto testável sem contornos. Este ficheiro reexporta-a, seguindo
 * o precedente de `web/lib/slug.ts` e `web/lib/dom.ts`, para que nenhum dos
 * pontos de chamada existentes mude de import.
 *
 * O que fica aqui: a composição da mensagem e do link (`WA_TOKENS`,
 * `WA_TOKEN_LABELS`, `WA_DEFAULT_TEMPLATE`, `ensureTokens`,
 * `buildProductMessage`, `waLink`). São regras de apresentação do modelo de
 * mensagem, não leitura defensiva de campos legados.
 */
import { resolveWaPhone, WA_DEFAULT_PHONE } from "../../src/services/storeCustom.js";

/**
 * Número de WhatsApp da Loja e respetivo valor predefinido.
 *
 * `resolveWaPhone` desce `whatsapp.phone → footer.phone → WA_DEFAULT_PHONE`
 * aplicando a validação de tipo em cada passo, e devolve **sempre** uma string
 * não vazia (R11.2, R11.3). É por isso que o `waLink` abaixo pode chamar
 * `.replace` no resultado sem se defender: antes, um `footer.phone` a apontar
 * para um objeto dava `TypeError` e a Pagina_De_Produto abria em branco.
 *
 * Reexportados (e não reimplementados) para que os pontos de chamada em `web/`
 * continuem a importar deste módulo.
 */
export { resolveWaPhone, WA_DEFAULT_PHONE };

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
