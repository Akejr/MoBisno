/**
 * Cabeçalho e rodapé da plataforma (`mobisno.store`) — **uma só definição**.
 *
 * Estavam escritos à mão dentro de `web/views/landing.ts` e voltaram a ser
 * escritos à mão, em versão simplificada, em `api/_seo.js` (`platformHtml`) e
 * depois em `web/views/directory.ts`. Três cópias do mesmo cromo é a receita
 * conhecida: uma delas muda e as outras ficam para trás sem nada falhar. Este
 * módulo existe para as páginas da SPA partilharem o original.
 *
 * **O que este módulo NÃO resolve:** `api/_seo.js` corre em JavaScript sem passo
 * de compilação e não pode importar daqui (a mesma parede que obriga a espelhar
 * `src/services/` — `SEO.md` §5.2). O cromo do HTML pré-renderizado continua a
 * ser o do `platformHtml`, mais simples. Quem chega vê o cromo simples até a SPA
 * arrancar. Fechar isso exige a paridade real de renderização, que é trabalho
 * de outra dimensão.
 */
import { esc } from "../lib/dom.js";

/** Laranja da plataforma. Só interface da MôBisno — as Lojas usam `var(--brand)`. */
export const PLATFORM_ACCENT = "#F95901";

/** Nome apresentado da plataforma. */
const PLATFORM_LABEL = "MôBisno";

/**
 * Secções da página inicial que o cabeçalho oferece. O `id` tem de existir na
 * `web/views/landing.ts` — se lá for renomeado, a ligação deixa de encontrar
 * nada e o clique não faz visivelmente nada.
 */
export const HOME_SECTIONS: readonly { id: string; label: string }[] = [
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "integracoes", label: "Integrações" },
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
  const actions = opts.actionsHtml
    ?? `<a href="/criar" class="inline-flex items-center whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${PLATFORM_ACCENT}">Criar<span class="hidden sm:inline"> minha</span> loja</a>`;
  // Escondidas abaixo de `md`: ao lado da marca e das ações não cabem num
  // telemóvel, e um menu sanduíche é outra conversa.
  const sections = HOME_SECTIONS.map((s) =>
    `<a href="/" data-goto="${esc(s.id)}" class="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">${esc(s.label)}</a>`).join("");
  return `
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center gap-3 md:gap-4 px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <div class="shrink-0 min-w-0">${brand}</div>
        <div class="hidden md:flex items-center gap-6 shrink-0">${sections}</div>
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">${actions}</div>
      </div>
    </nav>`;
}

/**
 * Rodapé da plataforma, em quatro colunas.
 *
 * As ligações de painel usam o esquema `#/` da aplicação **privada**, que é
 * legítimo e não é indexado; as páginas públicas (`/lojas`, `/criar`, legais)
 * usam caminhos reais, como o `SEO.md` §5.1 exige.
 */
export function platformFooterHtml(): string {
  const social = (href: string, label: string, icon: string, target = false): string =>
    `<a href="${esc(href)}"${target ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(label)}" class="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:text-white transition-colors" onmouseover="this.style.background='${PLATFORM_ACCENT}';this.style.borderColor='${PLATFORM_ACCENT}'" onmouseout="this.style.background='';this.style.borderColor=''"><span class="material-symbols-outlined text-[18px]">${icon}</span></a>`;

  const link = (href: string, label: string, target = false): string =>
    `<li><a href="${esc(href)}"${target ? ' target="_blank" rel="noopener"' : ""} class="text-gray-500 hover:text-gray-900 transition-colors">${esc(label)}</a></li>`;

  return `
    <footer class="bg-white border-t border-gray-100">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-14">
        <div class="grid grid-cols-2 md:grid-cols-12 gap-10">
          <div class="col-span-2 md:col-span-4 flex flex-col gap-4">
            <img src="/logo-header.png" alt="${esc(PLATFORM_LABEL)}" style="height:26px" class="w-auto object-contain self-start" />
            <p class="text-sm text-gray-500 max-w-xs leading-relaxed">A forma mais simples de criar a sua loja online em Angola. Modelos prontos, pagamentos locais e venda pelo WhatsApp.</p>
            <div class="flex items-center gap-2 mt-1">
              ${social("https://wa.me/244900000000", "WhatsApp", "chat", true)}
              ${social("mailto:geral@mobisno.store", "Email", "mail")}
              ${social("#", "Instagram", "photo_camera")}
            </div>
          </div>
          <div class="md:col-span-3">
            <h4 class="text-sm font-bold text-gray-900 mb-4">Plataforma</h4>
            <ul class="space-y-3 text-sm">
              ${link("#/criar", "Criar loja")}
              ${link("#/login", "Entrar")}
              ${link("#/painel", "Painel")}
              ${link("#", "Preços")}
            </ul>
          </div>
          <div class="md:col-span-3">
            <h4 class="text-sm font-bold text-gray-900 mb-4">Recursos</h4>
            <ul class="space-y-3 text-sm">
              ${link("/lojas", "Lojas criadas na MôBisno")}
              ${link("/criar", "Criar loja online")}
              ${link("https://wa.me/244900000000", "Contacto", true)}
            </ul>
          </div>
          <div class="md:col-span-2">
            <h4 class="text-sm font-bold text-gray-900 mb-4">Legal</h4>
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
