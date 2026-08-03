/**
 * Pagina_Loja_Nao_Encontrada — ecrã partilhado por todas as vistas públicas
 * (storefront, produto, categoria, carrinho e checkout).
 *
 * Existe num só sítio por duas razões. A primeira é o R10.6: as cinco vistas
 * têm de mostrar exatamente o mesmo ecrã, e cinco cópias do HTML divergem
 * sempre. A segunda é o R10.7: o `notFoundHtml` de `api/prerender.js` tem de
 * apresentar **a mesma mensagem e o mesmo convite**, e é mais fácil manter a
 * paridade quando o texto vive em constantes com nome.
 *
 * **Ao alterar os literais abaixo, alterar também `api/prerender.js`.** As
 * quatro constantes exportadas são a fonte do texto dos dois lados.
 *
 * Todas as ligações usam caminhos reais (`/criar`, `/lojas`), nunca um
 * fragmento `#` — invariante §5.1 do `SEO.md`. Numa loja em subdomínio os
 * caminhos são prefixados com o apex da plataforma por `platformHomeUrl()`,
 * porque `/criar` e `/lojas` vivem no domínio da MôBisno.
 */
import { esc } from "../lib/dom.js";
import { STORE_APEX, platformHomeUrl } from "../lib/routing.js";

/** Título do ecrã (R10.1). */
export const STORE_NOT_FOUND_TITLE = "Loja não encontrada";

/** Mensagem: diz que a loja não foi encontrada (R10.1). Paridade com `api/prerender.js`. */
export const STORE_NOT_FOUND_MESSAGE =
  "Não encontrámos nenhuma loja publicada neste endereço.";

/** Convite a criar loja (R10.3). Paridade com `api/prerender.js`. */
export const STORE_NOT_FOUND_INVITE =
  "Aproveite para criar a sua: escolha um modelo pronto, personalize os textos, as fotografias e as cores, e comece a vender online em Angola.";

/** Rótulo da ação principal — percurso de criação de Loja (R10.3). */
export const STORE_NOT_FOUND_PRIMARY_LABEL = "Criar a minha loja";

/** Rótulo da ação secundária — diretório público de lojas (R10.4). */
export const STORE_NOT_FOUND_SECONDARY_LABEL = "Ver lojas criadas na MôBisno";

/** Caminho real de uma página da plataforma, absoluto quando estamos num subdomínio de loja. */
function platformHref(path: string): string {
  const home = platformHomeUrl(); // "/" no domínio principal, "https://<apex>" em subdomínio
  return home === "/" ? path : `${home}${path}`;
}

/**
 * Endereço pedido pelo visitante (R10.2). Usa o endereço real do browser; o
 * identificador da loja só serve de recurso quando não há `location`.
 */
export function requestedStoreAddress(identifier?: string): string {
  const loc = typeof location === "undefined" ? undefined : location;
  if (loc) {
    const path = loc.pathname === "/" ? "" : loc.pathname;
    return `${loc.host}${path}`;
  }
  return identifier ? `${identifier}.${STORE_APEX}` : "";
}

/**
 * HTML do ecrã de loja não encontrada. Sem deslocamento horizontal a 360 px
 * (`break-words` no endereço e ações em coluna até `sm`).
 */
export function storeNotFoundHtml(identifier?: string): string {
  const address = requestedStoreAddress(identifier);
  return `
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 py-16">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">storefront</span>
    <h1 class="text-headline-lg text-on-surface">${esc(STORE_NOT_FOUND_TITLE)}</h1>
    <p class="text-on-surface-variant max-w-xl">${esc(STORE_NOT_FOUND_MESSAGE)}</p>
    ${address ? `<p class="text-label-md text-on-surface-variant max-w-full break-words"><span class="font-medium">${esc(address)}</span></p>` : ""}
    <p class="text-on-surface-variant max-w-xl">${esc(STORE_NOT_FOUND_INVITE)}</p>
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2 w-full max-w-sm sm:w-auto sm:max-w-none">
      <a href="${esc(platformHref("/criar"))}" class="px-6 py-3 rounded-full font-bold text-center" style="background:var(--brand,#a73a00);color:var(--brand-ink,#fff)">${esc(STORE_NOT_FOUND_PRIMARY_LABEL)}</a>
      <a href="${esc(platformHref("/lojas"))}" class="px-6 py-3 rounded-full border border-outline text-on-surface font-medium text-center">${esc(STORE_NOT_FOUND_SECONDARY_LABEL)}</a>
    </div>
  </div>`;
}
