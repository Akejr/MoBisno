/**
 * Navegação por URLs limpas (History API) e resolução de loja por host.
 *
 * Substitui o antigo routing por hash (`#/...`). As páginas usam caminhos
 * normais (`/painel`, `/loja/<id>`), e nas lojas em subdomínio
 * (`nomedaloja.mobisno.store`) os caminhos são ainda mais curtos
 * (`/`, `/produto/<id>`, `/categoria/<x>`, `/carrinho`).
 */

import { PLATFORM_APEX, STORE_APEX, LEGACY_STORE_APEX } from "../../src/services/domains.js";

/**
 * Domínios da Plataforma. Vivem em `src/services/domains.ts` (sem DOM), para o
 * domínio, os testes e a pré-renderização no servidor usarem os mesmos; são
 * reexportados aqui para quem já os importava de `routing`.
 */
export { PLATFORM_APEX, STORE_APEX };

/**
 * Apexes onde um subdomínio é tratado como loja. Inclui `mobisno.store` por
 * retrocompatibilidade (lojas antigas em `nomedaloja.mobisno.store`).
 */
const STORE_APEXES: readonly string[] = [STORE_APEX, LEGACY_STORE_APEX];

/** Evento disparado em cada navegação interna (ouvido pelo router). */
export const ROUTE_EVENT = "mb:route";

/**
 * Identificador da loja a partir do subdomínio real do browser, ou `null`.
 * Procura em todos os apexes de loja; `www`/`app` e o apex puro não são lojas.
 */
export function storeSubdomain(): string | null {
  const host = location.hostname.toLowerCase();
  for (const apex of STORE_APEXES) {
    if (host.endsWith(`.${apex}`)) {
      const sub = host.slice(0, host.length - apex.length - 1);
      if (!sub || sub === "www" || sub === "app" || sub.includes(".")) return null;
      return sub;
    }
  }
  return null;
}

/** Verdadeiro quando a app corre num domínio de produção (painel ou loja). */
export function isPlatformHost(): boolean {
  const h = location.hostname.toLowerCase();
  return h === PLATFORM_APEX || STORE_APEXES.some((a) => h === a || h.endsWith(`.${a}`));
}

/** Verdadeiro no apex (ou www) do domínio das lojas — deve redirecionar para o painel. */
export function isStoreApexRoot(): boolean {
  const h = location.hostname.toLowerCase();
  return h === STORE_APEX || h === `www.${STORE_APEX}`;
}

/**
 * Identificador da loja "ativa": o subdomínio em produção ou, no domínio
 * principal/preview, o segmento `/loja/<id>` do caminho — ou
 * `/previsualizar/<id>`, a pré-visualização privada do Dono, para a pesquisa e
 * o carrinho também funcionarem lá. `null` se nenhum.
 */
export function currentStoreIdentifier(): string | null {
  const sub = storeSubdomain();
  if (sub) return sub;
  const m = location.pathname.match(/^\/(?:loja|previsualizar)\/([^/]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/**
 * Prefixo de caminho REAL (nunca `#`) para as páginas de uma loja.
 *
 * - Em subdomínio de loja (`nomedaloja.sualoja.digital`) → `""`, porque o host
 *   já identifica a loja e as rotas são `/produto/...`, `/categoria/...`.
 * - No domínio principal ou em `localhost` → `/loja/<identificador>`.
 *
 * Usar caminhos reais é obrigatório para SEO: o Google descarta o fragmento de
 * uma URL, por isso ligações `#/loja/x/produto/y` NÃO são seguidas nem
 * indexadas — todas as páginas da loja ficariam invisíveis na pesquisa.
 */
export function storeBasePath(identifier: string): string {
  return storeSubdomain() ? "" : `/loja/${encodeURIComponent(identifier)}`;
}

/** Caminho da página inicial da loja (`/` em subdomínio, `/loja/<id>` fora). */
export function storeHomePath(identifier: string): string {
  return storeBasePath(identifier) || "/";
}

/**
 * Normaliza uma rota para um caminho limpo. Aceita o formato antigo (`#/x`) e o
 * novo (`/x`). Em subdomínio de loja, remove o prefixo redundante
 * `/loja/<identificador>` (o host já identifica a loja).
 */
export function cleanPath(route: string): string {
  let p = route ?? "/";
  if (p.startsWith("#")) p = p.slice(1); // "#/x" -> "/x"; "#" -> ""
  if (p === "") p = "/";
  if (!p.startsWith("/")) p = `/${p}`;

  if (storeSubdomain()) {
    const m = p.match(/^\/loja\/[^/]+(\/.*)?$/);
    if (m) p = m[1] && m[1] !== "" ? m[1] : "/";
  }
  return p;
}

/** URL da home da plataforma MôBisno (apex), a partir de qualquer contexto. */
export function platformHomeUrl(): string {
  return storeSubdomain() ? `https://${PLATFORM_APEX}` : "/";
}

/** Navega para uma rota (push no histórico) e notifica o router. */
export function navigate(route: string): void {
  const target = cleanPath(route);
  const current = location.pathname + location.search;
  if (target !== current) history.pushState({}, "", target);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}
