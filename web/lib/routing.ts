/**
 * Navegação por URLs limpas (History API) e resolução de loja por host.
 *
 * Substitui o antigo routing por hash (`#/...`). As páginas usam caminhos
 * normais (`/painel`, `/loja/<id>`), e nas lojas em subdomínio
 * (`nomedaloja.mobisno.store`) os caminhos são ainda mais curtos
 * (`/`, `/produto/<id>`, `/categoria/<x>`, `/carrinho`).
 */

/**
 * Domínio do PAINEL/marca (MôBisno). É aqui que vivem a landing, o login e o
 * painel. O apex do domínio das lojas redireciona para cá.
 */
export const PLATFORM_APEX = "mobisno.store";

/**
 * Domínio onde vivem as LOJAS dos clientes: `nomedaloja.sualoja.digital`.
 * É o domínio usado para construir as URLs públicas.
 */
export const STORE_APEX = "sualoja.digital";

/**
 * Apexes onde um subdomínio é tratado como loja. Inclui `mobisno.store` por
 * retrocompatibilidade (lojas antigas em `nomedaloja.mobisno.store`).
 */
const STORE_APEXES: readonly string[] = [STORE_APEX, "mobisno.store"];

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
