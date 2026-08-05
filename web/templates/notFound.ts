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

/** Laranja da plataforma. Este ecrã é da MôBisno, não de uma Loja — ver nota abaixo. */
const ACCENT = "#F95901";

/**
 * HTML do ecrã de loja não encontrada, com o desenho da página inicial da
 * plataforma.
 *
 * **Porque é que este ecrã não usa `var(--brand)`.** As cores de marca são de uma
 * Loja, e aqui não há Loja nenhuma — o endereço não corresponde a nada
 * publicado. Quem aterra aqui está a ver uma página da MôBisno, e é a identidade
 * da MôBisno que faz sentido: o laranja da plataforma, o logótipo no topo e o
 * convite a criar loja. A versão anterior usava `var(--brand)` com um recuo
 * castanho, o que dava uma cor arbitrária herdada da última Loja visitada.
 *
 * **Porque é que a estrutura é esta e não outra.** Este ecrã existe em dois
 * lados: aqui, e no `notFoundHtml` de `api/prerender.js`, que é o que um
 * visitante sem JavaScript recebe (com 404 ou 410). O servidor monta-o com o
 * `platformHtml` de `api/_seo.js` — barra de navegação, título grande, corpo e
 * rodapé. Esta função reproduz **a mesma estrutura e as mesmas classes**, por
 * duas razões: segue o desenho da página inicial, e faz desaparecer o salto que
 * havia quando a SPA arrancava e substituía a versão do servidor por outra
 * completamente diferente.
 *
 * Ao mexer no desenho de um lado, mexer no outro. Os literais de texto já são
 * partilhados por constantes (ver topo do ficheiro) e `tests/notFoundPage.test.ts`
 * garante que não divergem; o **desenho** não tem guarda automática.
 *
 * Sem deslocamento horizontal a 360 px: o endereço leva `break-all` e as duas
 * ações ficam em coluna até `sm`.
 */
export function storeNotFoundHtml(identifier?: string): string {
  const address = requestedStoreAddress(identifier);
  const home = esc(platformHref("/"));
  return `
  <div class="min-h-screen flex flex-col bg-white font-sans text-gray-900">
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <a href="${home}" class="flex items-center gap-2"><img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" /></a>
        <a href="${esc(platformHref("/criar"))}" class="inline-flex items-center gap-2 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors" style="background:${ACCENT}">Criar minha loja</a>
      </div>
    </nav>
    <main class="flex-grow flex flex-col">
      <section class="max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-12 md:py-20">
        <div class="w-full lg:w-2/3 text-center lg:text-left">
          <h1 class="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight">${esc(STORE_NOT_FOUND_TITLE)}</h1>
          <p class="mt-6 text-lg text-gray-600 max-w-xl mx-auto lg:mx-0">${esc(STORE_NOT_FOUND_MESSAGE)}</p>
          ${address ? `<p class="mt-4 text-gray-900 font-bold break-all">${esc(address)}</p>` : ""}
          <p class="mt-4 text-gray-600 max-w-xl mx-auto lg:mx-0">${esc(STORE_NOT_FOUND_INVITE)}</p>
          <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <a href="${esc(platformHref("/criar"))}" class="inline-flex items-center justify-center text-white font-semibold px-8 py-3 rounded-lg transition-colors" style="background:${ACCENT}">${esc(STORE_NOT_FOUND_PRIMARY_LABEL)}</a>
            <a href="${esc(platformHref("/lojas"))}" class="inline-flex items-center justify-center border border-gray-300 text-gray-800 font-semibold px-8 py-3 rounded-lg hover:bg-gray-50 transition-colors">${esc(STORE_NOT_FOUND_SECONDARY_LABEL)}</a>
          </div>
        </div>
      </section>
    </main>
    <footer class="bg-white border-t border-gray-100">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-10 text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span>MôBisno · Plataforma angolana para criar lojas online</span>
        <a href="${esc(platformHref("/termos"))}" class="hover:text-gray-900 transition-colors">Termos</a>
        <a href="${esc(platformHref("/privacidade"))}" class="hover:text-gray-900 transition-colors">Privacidade</a>
      </div>
    </footer>
  </div>`;
}
