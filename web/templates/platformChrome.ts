/**
 * Cabeçalho e rodapé da plataforma (`mobisno.store`) — **uma só definição**.
 *
 * Estavam escritos à mão dentro de `web/views/landing.ts` e voltaram a ser
 * escritos à mão, em versão simplificada, em `api/_seo.js` (`platformHtml`) e
 * depois em `web/views/directory.ts`. Três cópias do mesmo cromo é a receita
 * conhecida: uma delas muda e as outras ficam para trás sem nada falhar. Este
 * módulo existe para as páginas da SPA partilharem o original.
 *
 * **Pré-renderização.** A página inicial é desenhada no servidor com este mesmo
 * cromo: `web/views/landingHtml.ts` entra no pacote `api/_ssr/render.mjs`
 * (`web/ssr/entry.ts`), e a SPA adota o HTML em vez de o reescrever. As outras
 * páginas da plataforma (legais, diretório) continuam a ser servidas com o cromo
 * simplificado do `platformHtml` de `api/_seo.js` até a SPA arrancar.
 */
import { esc } from "../lib/dom.js";
import { PLATFORM_CONTACT_EMAIL } from "../../src/services/domains.js";

/** Laranja da plataforma. Só interface da MôBisno — as Lojas usam `var(--brand)`. */
export const PLATFORM_ACCENT = "#F95901";

/** Nome apresentado da plataforma. */
const PLATFORM_LABEL = "MôBisno";

/**
 * Secções da página inicial que o cabeçalho oferece. O `id` tem de existir no
 * HTML de `web/views/landingHtml.ts` — se lá for renomeado, a ligação deixa de
 * encontrar nada e o clique não faz visivelmente nada.
 * `tests/landingCopy.test.ts` desenha a página e confirma que cada `id` existe.
 *
 * `integracoes` passou a `pagamentos` quando a secção deixou de se chamar
 * «Integrações» e passou a responder à pergunta que de facto se faz: como é que
 * o dinheiro entra.
 */
export const HOME_SECTIONS: readonly { id: string; label: string }[] = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "pagamentos", label: "Pagamentos" },
  { id: "precos", label: "Preços" },
];

/**
 * Secção pedida antes de a página inicial existir.
 *
 * Clicar em «Preços» a partir da `/lojas` navega primeiro para `/` e só depois
 * pode rolar: o destino é guardado aqui e a landing consome-o quando monta.
 * Variável de módulo e não `sessionStorage` porque a navegação é interna à SPA —
 * não há recarregamento a atravessar.
 */
let pendingSection: string | null = null;

/** Lê e limpa a secção pendente. Chamado pela página inicial ao montar. */
export function consumePendingSection(): string | null {
  const target = pendingSection;
  pendingSection = null;
  return target;
}

/**
 * Rola até uma secção da página, se ela existir.
 *
 * `scroll-margin-top` está no CSS de cada secção: sem isso a barra fixa tapava
 * o título a que acabámos de chegar.
 */
export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}

/**
 * Liga as ligações de secção do cabeçalho, em qualquer página.
 *
 * As ligações são `href="/"` com `data-goto="<id>"`, e não `href="#<id>"`, por
 * duas razões: o interceptor de `web/main.ts` ignora fragmentos puros (o que
 * funcionaria na home mas não fora dela), e `href="/#<id>"` seria intercetado e
 * passado por `cleanPath`, que não preserva o fragmento. Assim o mesmo cabeçalho
 * serve todas as páginas: já estamos na home, rola; não estamos, navega e a
 * landing rola ao montar.
 */
export function mountSectionNav(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-goto]").forEach((el) => {
    if (el.dataset.gotoOn === "1") return;
    el.dataset.gotoOn = "1";
    el.addEventListener("click", (e) => {
      const id = el.dataset.goto;
      if (!id) return;
      if (scrollToSection(id)) {
        e.preventDefault(); // já estamos na página que tem a secção
        return;
      }
      pendingSection = id; // deixa o `href="/"` navegar; a landing termina o trabalho
    });
  });
}

/**
 * Barra de navegação da plataforma.
 *
 * @param opts.brandHtml Conteúdo da marca. A landing passa um `<div id="brand">`
 *        com um manipulador próprio; as outras páginas devem passar uma
 *        **ligação real** para `/`, que é o que o Google segue.
 * @param opts.actionsHtml Ações à direita, que variam com a sessão.
 */
export function platformNavHtml(opts: { brandHtml?: string; actionsHtml?: string } = {}): string {
  const brand = opts.brandHtml
    ?? `<a href="/" class="flex items-center gap-2" aria-label="${esc(PLATFORM_LABEL)}"><img src="/logo-header.png" alt="${esc(PLATFORM_LABEL)}" class="w-auto object-contain" style="height:24px" /></a>`;
  // `whitespace-nowrap` e `shrink-0` não são decoração: sem eles o rótulo parte
  // em duas linhas no telemóvel e o botão vira um quadrado alto. O rótulo encurta
  // abaixo de `sm` em vez de encolher a caixa.
  //
  // O `gap-1` é obrigatório, não estético: num contentor `inline-flex` cada nó de
  // texto vira um item de flex e o espaço no início e no fim de cada item é
  // **descartado**. O botão lia-se «Criarminhaloja» — o espaço estava escrito no
  // HTML e o flex comia-o. Daí o espaçamento vir do `gap` e os rótulos não terem
  // espaços à volta.
  const actions = opts.actionsHtml
    ?? `<a href="/criar" class="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${PLATFORM_ACCENT}">Criar<span class="hidden sm:inline">minha</span>loja</a>`;
  // Escondidas abaixo de `md`: ao lado da marca e das ações não cabem num
  // telemóvel, e um menu sanduíche é outra conversa.
  const sections = HOME_SECTIONS.map((s) =>
    `<a href="/" data-goto="${esc(s.id)}" class="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap">${esc(s.label)}</a>`).join("");
  // `gap-4` em `md` e `gap-6` só a partir de `lg`: com quatro secções, a marca e
  // as ações, o espaçamento largo deixava de caber à largura de um tablet.
  return `
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center gap-3 md:gap-4 px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <div class="shrink-0 min-w-0">${brand}</div>
        <div class="hidden md:flex items-center gap-4 lg:gap-6 shrink-0">${sections}</div>
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">${actions}</div>
      </div>
    </nav>`;
}

/**
 * Rodapé da plataforma, em quatro colunas. **Uma só definição** — a página
 * inicial também usa esta, depois de ter tido uma cópia escrita à mão.
 *
 * Todas as ligações são caminhos reais (`/criar`, `/login`, `/painel`,
 * `/lojas`, legais), como o `SEO.md` §5.1 exige: o rodapé sai no HTML
 * pré-renderizado da página inicial e tem de funcionar sem JavaScript. «Preços»
 * usa o mesmo mecanismo das secções do cabeçalho (`data-goto`, ligado por
 * `mountSectionNav`): rola na página inicial e, fora dela, navega para lá.
 */
export function platformFooterHtml(): string {
  const link = (href: string, label: string, extra = ""): string =>
    `<li><a href="${esc(href)}"${extra} class="text-gray-500 hover:text-gray-900 transition-colors">${esc(label)}</a></li>`;
  const mail = `mailto:${PLATFORM_CONTACT_EMAIL}`;

  // Só contactos verdadeiros: o email geral. As ligações de WhatsApp
  // (`wa.me/244900000000`) e de Instagram (`#`) eram marcadores de posição —
  // um número que não é de ninguém e uma ligação para lado nenhum.
  return `
    <footer class="bg-white border-t border-gray-100">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-14">
        <div class="grid grid-cols-2 md:grid-cols-12 gap-10">
          <div class="col-span-2 md:col-span-4 flex flex-col gap-4">
            <img src="/logo-header.png" alt="${esc(PLATFORM_LABEL)}" style="height:26px" class="w-auto object-contain self-start" />
            <!-- Sem superlativos: «a forma mais simples» não é verificável. O que
                 a loja faz é que é. -->
            <p class="text-sm text-gray-500 max-w-xs leading-relaxed">Lojas online angolanas, sem programar: modelos prontos, editor visual e encomendas por WhatsApp em todas as lojas.</p>
            <a href="${esc(mail)}" class="inline-flex items-center gap-2 self-start text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined mb-ico text-[18px]" aria-hidden="true">mail</span>${esc(PLATFORM_CONTACT_EMAIL)}</a>
          </div>
          <!-- Os titulos das colunas sao h3, e nao h4: a pagina acima deles
               acaba em h2, e saltar de h2 para h4 deixa um degrau vazio na
               arvore de titulos, um leitor de ecra anuncia uma seccao de nivel
               quatro sem a de nivel tres existir. O teste landingCopy guarda-o.
               (Sem acentos graves aqui: isto esta dentro de um template literal.) -->
          <div class="md:col-span-3">
            <h3 class="text-sm font-bold text-gray-900 mb-4">Plataforma</h3>
            <ul class="space-y-3 text-sm">
              ${link("/criar", "Criar loja")}
              ${link("/login", "Entrar")}
              ${link("/painel", "Dashboard")}
              ${link("/", "Preços", ' data-goto="precos"')}
            </ul>
          </div>
          <div class="md:col-span-3">
            <h3 class="text-sm font-bold text-gray-900 mb-4">Recursos</h3>
            <ul class="space-y-3 text-sm">
              ${link("/lojas", "Lojas criadas na MôBisno")}
              ${link("/modelos", "Modelos prontos")}
              ${link("/criar", "Criar loja online")}
              ${link("/", "Perguntas frequentes", ' data-goto="perguntas"')}
              ${link(mail, "Contacto")}
            </ul>
          </div>
          <div class="md:col-span-2">
            <h3 class="text-sm font-bold text-gray-900 mb-4">Legal</h3>
            <ul class="space-y-3 text-sm">
              ${link("/termos", "Termos")}
              ${link("/privacidade", "Privacidade")}
              ${link("/politica", "Política Geral")}
            </ul>
          </div>
        </div>
        <div class="mt-12 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p class="text-sm text-gray-500">© 2026 ${esc(PLATFORM_LABEL)}</p>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 uppercase tracking-wider">Pagamentos</span>
            <img src="/integrations/Express.png" alt="Multicaixa Express" class="h-6 w-auto object-contain" />
            <img src="/integrations/ATM.png" alt="Multicaixa" class="h-6 w-auto object-contain" />
          </div>
        </div>
      </div>
    </footer>`;
}
