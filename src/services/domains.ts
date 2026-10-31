/**
 * Domínios da Plataforma, num só sítio e sem DOM.
 *
 * Viviam em `web/lib/routing.ts`, que lê `location` — e por isso não podiam ser
 * importados pelo domínio (`src/`), pelos testes, nem pela pré-renderização no
 * servidor. O resultado era o domínio das lojas escrito à mão em vários sítios
 * (`PLAN_HIGHLIGHTS`, dados de exemplo dos modelos), e «mudar `STORE_APEX`
 * propaga por todo o sistema» deixava de ser verdade.
 *
 * `web/lib/routing.ts` reexporta estas constantes: quem já as importava de lá
 * continua igual.
 */

/** Domínio da Plataforma: landing, login, Dashboard e administração. */
export const PLATFORM_APEX = "mobisno.store";

/** Domínio das Lojas dos clientes: `nomedaloja.sualoja.digital`. */
export const STORE_APEX = "sualoja.digital";

/**
 * Domínio das lojas antigas (`nomedaloja.mobisno.store`), mantido por
 * retrocompatibilidade. É também o sufixo gravado em `stores.subdomain`
 * (restrição `stores_subdomain_coherent`, migração 0007).
 */
export const LEGACY_STORE_APEX = "mobisno.store";

/**
 * Prefixo dos identificadores das lojas-modelo (demonstrações da Plataforma).
 *
 * Reservado: um Dono não pode criar uma loja com este prefixo. Antes não era, e
 * uma loja `modelo-x` de um cliente desaparecia do próprio Dashboard dele, que
 * esconde as lojas-modelo por este prefixo.
 */
export const MODEL_STORE_PREFIX = "modelo-";

/** O identificador é de uma loja-modelo? */
export function isModelIdentifier(identifier: unknown): boolean {
  return typeof identifier === "string" && identifier.toLowerCase().startsWith(MODEL_STORE_PREFIX);
}

/**
 * WhatsApp do suporte da MôBisno. **Por agora é o único contacto** da
 * plataforma: está no rodapé, nas perguntas frequentes, nas páginas legais, no
 * pedido de ativação da subscrição e no topo do assistente. Não há email de
 * contacto. Em algarismos, com o indicativo de Angola, como o `wa.me` o quer.
 */
export const PLATFORM_SUPPORT_WHATSAPP = "244931343433";

/** O mesmo número, como se lê: «+244 9XX XXX XXX». */
export const PLATFORM_SUPPORT_WHATSAPP_LABEL =
  `+${PLATFORM_SUPPORT_WHATSAPP.slice(0, 3)} ${PLATFORM_SUPPORT_WHATSAPP.slice(3, 6)} ${PLATFORM_SUPPORT_WHATSAPP.slice(6, 9)} ${PLATFORM_SUPPORT_WHATSAPP.slice(9)}`;

/**
 * A mensagem com que a conversa abre, já escrita: quem atende sabe logo que a
 * pessoa vem da MôBisno.
 */
export const PLATFORM_SUPPORT_MESSAGE = `Olá! Vim do site da MôBisno (${PLATFORM_APEX}) e preciso de ajuda.`;

/**
 * Ligação para a conversa com o suporte, com a mensagem já escrita. Por
 * omissão, {@link PLATFORM_SUPPORT_MESSAGE}; o pedido de ativação da subscrição
 * passa a sua, com a loja.
 */
export function supportWhatsAppUrl(message: string = PLATFORM_SUPPORT_MESSAGE): string {
  return `https://wa.me/${PLATFORM_SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

/** Ligação que abre a conversa com o suporte, com {@link PLATFORM_SUPPORT_MESSAGE}. */
export const PLATFORM_SUPPORT_WHATSAPP_URL = supportWhatsAppUrl();

/** Endereço público de uma loja em produção. */
export function storePublicUrl(identifier: string): string {
  return `https://${identifier}.${STORE_APEX}`;
}
