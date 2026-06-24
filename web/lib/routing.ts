/**
 * Navegação por URLs limpas (History API) e resolução de loja por host.
 *
 * Substitui o antigo routing por hash (`#/...`). As páginas usam caminhos
 * normais (`/painel`, `/loja/<id>`), e nas lojas em subdomínio
 * (`nomedaloja.mobisno.store`) os caminhos são ainda mais curtos
 * (`/`, `/produto/<id>`, `/categoria/<x>`, `/carrinho`).
 */

/** Domínio raiz da plataforma. As lojas vivem em `nomedaloja.mobisno.store`. */
export const PLATFORM_APEX = "mobisno.store";

/** Evento disparado em cada navegação interna (ouvido pelo router). */
export const ROUTE_EVENT = "mb:route";

/** Identificador da loja a partir do subdomínio, ou `null` fora de produção. */
export function storeSubdomain(): string | null {
  const host = location.hostname.toLowerCase();
  if (!host.endsWith(`.${PLATFORM_APEX}`)) return null;
  const sub = host.slice(0, host.length - PLATFORM_APEX.length - 1);
  if (!sub || sub === "www" || sub === "app" || sub.includes(".")) return null;
  return sub;
}

/** Verdadeiro quando a app corre no domínio de produção (mobisno.store). */
export function isPlatformHost(): boolean {
  const h = location.hostname.toLowerCase();
  return h === PLATFORM_APEX || h.endsWith(`.${PLATFORM_APEX}`);
}

/**
 * Identificador da loja "ativa": o subdomínio em produção ou, no domínio
 * principal/preview, o segmento `/loja/<id>` do caminho. `null` se nenhum.
 */
export function currentStoreIdentifier(): string | null {
  const sub = storeSubdomain();
  if (sub) return sub;
  const m = location.pathname.match(/^\/loja\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
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

/** Navega para uma rota (push no histórico) e notifica o router. */
export function navigate(route: string): void {
  const target = cleanPath(route);
  const current = location.pathname + location.search;
  if (target !== current) history.pushState({}, "", target);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}
