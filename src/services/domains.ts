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
 * Contacto geral da MôBisno (o que os Termos e a Política de Privacidade já
 * indicam). É o único contacto real conhecido: o painel usa-o para a ativação
 * manual da subscrição, enquanto não há pagamentos online.
 */
export const PLATFORM_CONTACT_EMAIL = `geral@${PLATFORM_APEX}`;

/** Endereço público de uma loja em produção. */
export function storePublicUrl(identifier: string): string {
  return `https://${identifier}.${STORE_APEX}`;
}
