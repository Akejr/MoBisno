/**
 * Dashboard do Dono — a moldura do painel de cada loja.
 *
 * Este ficheiro tem a navegação (barra lateral em ecrã grande, atalhos em
 * telemóvel), o seletor de loja, o cabeçalho e o despacho do separador. Cada
 * separador vive no seu ficheiro em `web/views/dashboard/`; o desenho partilhado
 * está em `web/views/dashboard/ui.ts` e o HTML puro de cada separador em
 * `web/views/dashboard/markup.ts`. Identidade visual MôBisno (branco + #F95901).
 */
import { render, go, esc, setDocTitle } from "../lib/dom.js";
import { appState, currentOwnerId, logout, storeRepository, publicStoreUrl } from "../composition.js";
import { isCurrentUserAdmin } from "../supabase/admin.js";
import { readPhoneStatus } from "../supabase/phone.js";
import { isModelIdentifier } from "../../src/services/domains.js";
import { resolveBilling, type BillingState } from "../../src/services/billing.js";
import { PLAN_UNIT_LABEL } from "../../src/services/plans.js";
import type { Store } from "../../src/models/index.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import type { AssistantScreen } from "../lib/assistantContext.js";
import type { DashCtx } from "./dashboard/context.js";
import { ACCENT, ACCENT_INK, ACCENT_TINT, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, SKELETON, card, emptyState, icon } from "./dashboard/ui.js";
import { renderInicio } from "./dashboard/inicio.js";
import { renderProdutos } from "./dashboard/produtos.js";
import { renderEntregas } from "./dashboard/entregas.js";
import { renderDescontos } from "./dashboard/descontos.js";
import { renderAvaliacoes } from "./dashboard/avaliacoes.js";
import { renderAnalises } from "./dashboard/analises.js";
import { renderPagamentos } from "./dashboard/pagamentos.js";
import { renderPlano } from "./dashboard/plano.js";
import { renderConfig } from "./dashboard/config.js";
import { PLAN_PRICE_TEXT } from "./dashboard/markup.js";

/**
 * As secções do painel, por ordem, numa lista só.
 *
 * Alimenta a navegação lateral (ecrã grande), os atalhos de secção em telemóvel
 * e o título do cabeçalho. Sem esta lista, o menu de telemóvel podia nascer com
 * oito secções enquanto o `aside` tinha nove — e ninguém notava até faltar uma.
 */
const DASH_SECTIONS: readonly { tab: string; href: string; icon: string; label: string }[] = [
  { tab: "inicio", href: "#/painel", icon: "home", label: "Início" },
  { tab: "produtos", href: "#/painel/produtos", icon: "inventory_2", label: "Produtos" },
  { tab: "entregas", href: "#/painel/entregas", icon: "local_shipping", label: "Taxa de entrega" },
  { tab: "descontos", href: "#/painel/descontos", icon: "sell", label: "Código de desconto" },
  { tab: "avaliacoes", href: "#/painel/avaliacoes", icon: "reviews", label: "Avaliações" },
  { tab: "analises", href: "#/painel/analises", icon: "monitoring", label: "Análises" },
  { tab: "pagamentos", href: "#/painel/pagamentos", icon: "payments", label: "Pagamentos" },
  { tab: "plano", href: "#/painel/plano", icon: "workspace_premium", label: "Plano" },
  { tab: "config", href: "#/painel/config", icon: "settings", label: "Configurações" },
];

function navItem(href: string, iconName: string, label: string, active: boolean): string {
  const estilo = active ? `style="background:${ACCENT_TINT};color:${ACCENT_INK}"` : "";
  const cls = active ? "" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";
  return `<a href="${href}" ${active ? 'aria-current="page"' : ""} class="rounded-xl px-4 py-2.5 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors ${cls}" ${estilo}>${icon(iconName)} ${esc(label)}</a>`;
}

/**
 * Atalho de secção em telemóvel, no formato de chip.
 *
 * O `aside` é `hidden md:flex` e durante muito tempo não havia alternativa
 * nenhuma: no telefone o Dono ficava preso na secção onde entrasse. Segue o
 * precedente do `web/views/adminPanel.ts`, que resolveu o mesmo defeito.
 */
function navChip(href: string, iconName: string, label: string, active: boolean): string {
  const estilo = active ? `background:${ACCENT_TINT};color:${ACCENT_INK}` : "color:#4b5563";
  return `<a href="${href}" ${active ? 'aria-current="page"' : ""} class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors" style="${estilo}">${icon(iconName, "text-[18px]")} ${esc(label)}</a>`;
}

/** Classes dos botões de ícone da barra de conta em telemóvel. */
const MOBILE_ICON_BTN = "shrink-0 w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition-colors";

/**
 * Separador do painel → ecrã do assistente. Cada separador tem orientação
 * própria em `web/lib/assistantContext.ts`; ao acrescentar um separador,
 * acrescentar aqui e lá (ver `.kiro/steering/assistente.md`).
 */
const DASH_SCREEN: Record<string, AssistantScreen> = {
  inicio: "painel",
  produtos: "produtos",
  entregas: "entregas",
  descontos: "descontos",
  avaliacoes: "avaliacoes",
  analises: "analises",
  pagamentos: "pagamentos",
  plano: "plano",
  config: "config",
};

/** Cada separador e quem o desenha. */
const TAB_RENDER: Readonly<Record<string, (ctx: DashCtx) => Promise<void>>> = {
  inicio: renderInicio,
  produtos: renderProdutos,
  entregas: renderEntregas,
  descontos: renderDescontos,
  avaliacoes: renderAvaliacoes,
  analises: renderAnalises,
  pagamentos: renderPagamentos,
  plano: renderPlano,
  config: renderConfig,
};

/**
 * Separador pedido pelo caminho (`/painel/<separador>`).
 *
 * Um separador que já não existe — o antigo `/painel/logotipo`, por exemplo —
 * cai no «Início» (`known: false`), em vez de abrir um painel sem nenhuma
 * secção realçada e com o nome cru no título.
 */
function tabFromPath(path: string): { tab: string; known: boolean } {
  const m = path.match(/^\/painel\/?([a-z]*)/i);
  const pedido = m && m[1] ? m[1].toLowerCase() : "inicio";
  return DASH_SECTIONS.some((s) => s.tab === pedido) ? { tab: pedido, known: true } : { tab: "inicio", known: false };
}

/** Indicador de espera do arranque. */
const SPINNER = `<div class="flex items-center justify-center py-20" role="status"><span class="sr-only">A carregar…</span><span class="material-symbols-outlined animate-spin motion-reduce:animate-none text-gray-300" style="font-size:40px" aria-hidden="true">progress_activity</span></div>`;

/**
 * Primeiro pixel do painel, pintado **antes** de qualquer consulta.
 *
 * O painel é um pedaço separado do pacote (`import()` em `web/main.ts`), por isso
 * entre o clique em «Painel» e o primeiro render há o download desse pedaço mais
 * as consultas ao Supabase. Sem isto o ecrã fica na página anterior e o Dono
 * conclui que o clique não funcionou — e clica outra vez.
 */
function bootPanel(): string {
  return `<div class="min-h-screen w-full flex items-center justify-center bg-gray-50">${SPINNER}</div>`;
}

/** Página inteira sem painel (sem sessão, sem loja). */
function standalonePage(o: { icon: string; title: string; text: string; actions: string }): string {
  return `<main class="min-h-screen flex items-center justify-center px-6 bg-gray-50">
    <div class="w-full max-w-md">${card(emptyState(o))}</div>
  </main>`;
}

/**
 * Folha do painel: o foco visível de todos os botões, ligações e campos.
 *
 * Numa folha e não em classes soltas: um botão novo ganha o contorno sem que
 * ninguém se lembre de o pôr. Os interruptores (`peer sr-only`) têm a caixa
 * escondida, por isso o contorno vai para o desenho ao lado.
 */
function injectDashStyle(): void {
  if (document.getElementById("mb-dash-style")) return;
  const st = document.createElement("style");
  st.id = "mb-dash-style";
  st.textContent = `
    [data-panel-shell] a:focus-visible,[data-panel-shell] button:focus-visible,[data-panel-shell] select:focus-visible,[data-panel-shell] summary:focus-visible,[data-panel-shell] input[type=file]:focus-visible,[data-panel-shell] input[type=checkbox]:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px}
    [data-panel-shell] input.peer:focus-visible + span{box-shadow:0 0 0 2px #fff,0 0 0 4px ${ACCENT}}
    [data-store-menu] > summary::-webkit-details-marker{display:none}
    #dash-main:focus{outline:none}`;
  document.head.appendChild(st);
}

/** O que a moldura precisa para se desenhar. */
interface ShellInput {
  tab: string;
  stores: readonly Store[];
  store: Store;
  isAdmin: boolean;
  billing: BillingState;
  storeUrl: string;
  previewUrl: string;
}

/** Estado do telemóvel da conta, lido uma vez por entrada no painel. */
interface PhoneState {
  verified: boolean;
  phone: string | null;
}

/** Estado público de uma loja, para o ponto de cor do seletor. A subscrição é de cada loja. */
function storeDot(s: Store, isAdmin: boolean): { label: string; color: string } {
  if (s.state !== "Publicada") return { label: "Rascunho", color: "#9ca3af" };
  const ativa = resolveBilling({ planExpiresAt: s.planExpiresAt ?? null, isAdmin }).accessActive;
  return ativa ? { label: "No ar", color: "#10b981" } : { label: "Fora do ar", color: "#f59e0b" };
}

/**
 * Seletor de loja: um menu com a loja em edição, o estado de cada uma e
 * «Nova loja», que diz o que custa antes de o Dono a criar.
 *
 * O mesmo HTML vai para o `aside` e para a barra de telemóvel, por isso não tem
 * `id` nenhum: dois elementos com o mesmo identificador deixariam o segundo sem
 * ligação. A ligação é pelo atributo `data-store-switch-to`.
 */
function storeMenuHtml(o: ShellInput): string {
  const { stores, store, isAdmin } = o;
  const quadrado = (s: Store, tamanho: string): string =>
    `<span aria-hidden="true" class="${tamanho} rounded-lg flex items-center justify-center shrink-0 text-sm font-black" style="background:${ACCENT_TINT};color:${ACCENT_INK}">${esc((s.name.trim().charAt(0) || "?").toUpperCase())}</span>`;
  const estado = (s: Store): string => {
    const d = storeDot(s, isAdmin);
    return `<span class="flex items-center gap-1.5 text-xs text-gray-500"><span aria-hidden="true" class="w-1.5 h-1.5 rounded-full" style="background:${d.color}"></span>${esc(d.label)}</span>`;
  };
  const linhas = stores.map((s) => {
    const escolhida = s.id === store.id;
    return `<li><button type="button" data-store-switch-to="${esc(s.id)}" ${escolhida ? 'aria-current="true"' : ""} class="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50 transition-colors">
        ${quadrado(s, "w-8 h-8")}
        <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-gray-900 truncate">${esc(s.name)}</span>${estado(s)}</span>
        ${escolhida ? `<span class="shrink-0" style="color:${ACCENT}">${icon("check", "text-[18px]")}</span>` : ""}
      </button></li>`;
  }).join("");
  return `<details data-store-menu class="relative group">
    <summary class="list-none flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
      ${quadrado(store, "w-9 h-9")}
      <span class="min-w-0 flex-1"><span class="sr-only">Loja em edição: </span><span class="block text-sm font-bold text-gray-900 truncate">${esc(store.name)}</span>${estado(store)}</span>
      <span class="text-gray-400 shrink-0 transition-transform group-open:rotate-180">${icon("expand_more", "text-[20px]")}</span>
    </summary>
    <div class="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
      <p class="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">As suas lojas</p>
      <ul>${linhas}</ul>
      <div class="mt-1.5 border-t border-gray-100 pt-1.5">
        <a href="#/criar" class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-bold hover:bg-gray-50 transition-colors" style="color:${ACCENT_INK}">${icon("add_business", "text-[20px]")} Nova loja</a>
        <p class="px-2.5 pb-1.5 text-xs text-gray-500">Grátis até publicar. Depois, ${esc(PLAN_PRICE_TEXT)} ${esc(PLAN_UNIT_LABEL)}.</p>
      </div>
    </div>
  </details>`;
}

/** A moldura do painel, com o conteúdo do separador dentro de `#dash-content`. */
function shellHtml(o: ShellInput, content: string): string {
  const { tab, store, isAdmin } = o;
  const titulo = DASH_SECTIONS.find((s) => s.tab === tab)?.label ?? "Início";
  const menu = storeMenuHtml(o);
  const noAr = store.state === "Publicada" && o.billing.accessActive;
  return `
  <div data-panel-shell data-tab="${esc(tab)}" data-store="${esc(store.id)}" class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
    <button type="button" data-skip class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 ${BTN_PRIMARY}">Saltar para o conteúdo</button>
    <aside class="hidden md:flex flex-col py-6 bg-white border-r border-gray-200 w-64 shrink-0 sticky top-0 h-screen">
      <div class="px-6 mb-6">
        <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:26px" />
      </div>
      <div class="px-4 mb-5">${menu}</div>
      <nav aria-label="Secções do painel" class="flex-1 overflow-y-auto flex flex-col gap-0.5 px-2">
        ${DASH_SECTIONS.map((s) => navItem(s.href, s.icon, s.label, tab === s.tab)).join("")}
      </nav>
      <div class="mt-4 px-4 space-y-1">
        ${isAdmin ? `<a href="#/adminPainel" class="w-full inline-flex items-center gap-2 text-sm font-bold px-2 py-2 rounded-lg transition-colors" style="background:${ACCENT_TINT};color:${ACCENT_INK}">${icon("shield_person")} Dashboard de Administração</a>` : ""}
        <button id="logout" data-logout type="button" class="w-full text-gray-600 hover:text-gray-900 flex items-center gap-2 text-sm font-semibold px-2 py-2 rounded-lg transition-colors">${icon("logout")} Terminar sessão</button>
      </div>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Cabeçalho e atalhos de secção colados juntos, num só invólucro
           pegajoso: qualquer distância ao topo medida à mão erraria, porque a
           altura do cabeçalho muda com o ecrã. -->
      <div class="sticky top-0 z-40">
        <header class="bg-white/90 backdrop-blur border-b border-gray-200 flex items-center justify-between gap-2 px-4 md:px-8 py-3">
          <h1 class="text-lg sm:text-xl font-black tracking-tight min-w-0 truncate">${esc(titulo)}</h1>
          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a href="#/personalizar" aria-label="Personalizar loja" class="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-sm font-bold text-white bg-[#F95901] hover:bg-[#E04F00] transition-colors">${icon("palette", "text-[18px]")}<span class="hidden sm:inline">Personalizar loja</span></a>
            ${noAr
              ? `<a href="${esc(o.storeUrl)}" target="_blank" rel="noopener" aria-label="Ver loja (abre noutro separador)" class="${BTN_GHOST}">${icon("open_in_new", "text-[18px]")}<span class="hidden sm:inline">Ver loja</span></a>`
              : `<a href="${esc(o.previewUrl)}" target="_blank" rel="noopener" aria-label="Pré-visualizar (só você vê; abre noutro separador)" title="Só você vê esta pré-visualização" class="${BTN_GHOST}">${icon("visibility", "text-[18px]")}<span class="hidden sm:inline">Pré-visualizar</span></a>`}
          </div>
        </header>
        <nav aria-label="Secções do painel" class="md:hidden flex gap-1 overflow-x-auto relative px-3 py-2 bg-white border-b border-gray-200" data-mobile-nav>
          ${DASH_SECTIONS.map((s) => navChip(s.href, s.icon, s.label, tab === s.tab)).join("")}
        </nav>
      </div>
      <!-- Loja, nova loja, administração e terminar sessão: em telemóvel o
           aside não existe, e sem esta barra o Dono com várias lojas não
           conseguia trocar de loja nem sair da conta. -->
      <div class="md:hidden flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200">
        <div class="flex-1 min-w-0">${menu}</div>
        ${isAdmin ? `<a href="#/adminPainel" title="Dashboard de Administração" aria-label="Dashboard de Administração" class="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT_INK}">${icon("shield_person")}</a>` : ""}
        <button data-logout type="button" title="Terminar sessão" aria-label="Terminar sessão" class="${MOBILE_ICON_BTN}">${icon("logout")}</button>
      </div>
      <main id="dash-main" tabindex="-1" class="flex-1 min-w-0 p-margin-mobile md:p-margin-desktop">
        <div id="dash-content" class="max-w-container-max mx-auto w-full">${content}</div>
      </main>
    </div>
  </div>`;
}

/** O menu de loja fecha ao tocar fora dele e com Escape. Liga-se uma vez só. */
let storeMenuCloseBound = false;

/** Liga os comandos da moldura: terminar sessão, trocar de loja, saltar para o conteúdo. */
function bindShell(): void {
  // Por atributo e não por `id`: o mesmo comando existe no `aside` (ecrã
  // grande) e na barra de telemóvel, e dois elementos com o mesmo `id`
  // deixariam o segundo sem ligação nenhuma.
  document.querySelectorAll<HTMLElement>("[data-logout]").forEach((b) =>
    b.addEventListener("click", async () => { await logout(); go("#/"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-store-switch-to]").forEach((b) =>
    b.addEventListener("click", () => {
      b.closest("details")?.removeAttribute("open");
      const id = b.dataset.storeSwitchTo;
      if (!id || id === appState.storeId) return;
      appState.storeId = id;
      void renderDashboard();
    }));
  if (!storeMenuCloseBound) {
    storeMenuCloseBound = true;
    const abertos = (): HTMLDetailsElement[] => [...document.querySelectorAll<HTMLDetailsElement>("details[data-store-menu][open]")];
    document.addEventListener("click", (e) => {
      for (const d of abertos()) if (!d.contains(e.target as Node)) d.removeAttribute("open");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      for (const d of abertos()) {
        d.removeAttribute("open");
        d.querySelector("summary")?.focus();
      }
    });
  }
  document.querySelector<HTMLElement>("[data-skip]")?.addEventListener("click", () =>
    document.getElementById("dash-main")?.focus());
  // Nove atalhos não cabem num telemóvel: a faixa abre já com o separador
  // atual à vista, e não com «Configurações» escondido à direita.
  const faixa = document.querySelector<HTMLElement>("[data-mobile-nav]");
  const atual = faixa?.querySelector<HTMLElement>('[aria-current="page"]');
  if (faixa && atual) faixa.scrollLeft = Math.max(0, atual.offsetLeft - (faixa.clientWidth - atual.offsetWidth) / 2);
}

/**
 * Número do desenho em curso. Cada entrada no painel (trocar de separador, de
 * loja, recarregar depois de uma ação) leva um número novo; um desenho mais
 * antigo que acabe de chegar depois não pinta nada por cima do mais recente.
 */
let renderSeq = 0;

export async function renderDashboard(): Promise<void> {
  const seq = ++renderSeq;
  appState.editOwnerId = null;
  appState.editorReturn = null; // o dono volta sempre ao seu painel ao sair do editor
  injectDashStyle();
  // Só na primeira entrada no painel: ao trocar de separador o painel já está no
  // ecrã, e substituí-lo por um indicador nu seria pior do que deixar a secção
  // anterior visível até a nova estar pronta.
  if (!document.querySelector("[data-panel-shell]")) render(bootPanel());
  const ownerId = appState.ownerId ?? (await currentOwnerId());
  if (seq !== renderSeq) return;
  if (!ownerId) {
    render(standalonePage({
      icon: "lock", title: "Inicie sessão", text: "Inicie sessão para aceder ao Dashboard.",
      actions: `<a href="#/login" class="${BTN_PRIMARY}">Iniciar sessão</a><a href="#/criar" class="${BTN_SECONDARY}">Criar loja</a>`,
    }));
    return;
  }
  // As três só dependem do `ownerId` e não umas das outras: juntas custam o
  // tempo da mais lenta. É o caminho que corre outra vez a cada troca de separador.
  const [allStores, isAdmin, phoneStatus] = await Promise.all([
    storeRepository.listByOwner(ownerId),
    isCurrentUserAdmin(),
    readPhoneStatus(ownerId),
  ]);
  if (seq !== renderSeq) return;
  // Esconde as lojas-modelo (secção Modelos do admin) do painel pessoal.
  const stores = allStores.filter((s) => !isModelIdentifier(s.identifier));
  // No regresso da página de pagamento a página recarrega e perde a loja que
  // estava escolhida: o endereço diz de que loja era a subscrição (`?loja=`).
  const pedida = appState.storeId ?? new URLSearchParams(location.search).get("loja");
  const escolhida = pedida ? stores.find((s) => s.id === pedida) ?? null : null;
  const store = escolhida ?? stores[0] ?? null;
  if (!store) {
    render(standalonePage({
      icon: "storefront", title: "Ainda não tem nenhuma loja", text: "Crie a sua primeira loja: escolha um modelo pronto e personalize-o.",
      actions: `<a href="#/criar" class="${BTN_PRIMARY}">Criar a minha loja</a><button type="button" data-logout class="${BTN_SECONDARY}">Terminar sessão</button>`,
    }));
    document.querySelector<HTMLElement>("[data-logout]")?.addEventListener("click", async () => { await logout(); go("#/"); });
    return;
  }
  appState.ownerId = ownerId;
  appState.storeId = store.id;
  // A subscrição é de cada loja (migração 0025): o estado é o da loja escolhida.
  const billing = resolveBilling({ planExpiresAt: store.planExpiresAt ?? null, isAdmin });
  // O telemóvel é da conta, e serve todas as lojas. Um administrador publica
  // sem confirmar nada.
  const telefone: PhoneState = isAdmin ? { verified: true, phone: phoneStatus.phone } : phoneStatus;

  const { tab, known } = tabFromPath(location.pathname);
  // Um separador que já não existe mostra o «Início», e o endereço passa a
  // dizer isso — senão recarregar a página voltava a pedir o separador velho.
  if (!known) history.replaceState(history.state, "", "/painel");
  const titulo = DASH_SECTIONS.find((s) => s.tab === tab)?.label ?? "Início";
  setDocTitle(`${titulo} · Dashboard — MôBisno`);

  const storeUrl = publicStoreUrl(store.identifier);
  const previewUrl = `/previsualizar/${encodeURIComponent(store.identifier)}`;
  const moldura: ShellInput = { tab, stores, store, isAdmin, billing, storeUrl, previewUrl };
  let molduraPintada = false;

  const ctx: DashCtx = {
    ownerId,
    store,
    stores,
    billing,
    phoneVerified: telefone.verified,
    phone: telefone.phone,
    storeUrl,
    previewUrl,
    paint(content: string): boolean {
      if (seq !== renderSeq) return false;
      const slot = document.getElementById("dash-content");
      // A primeira pintura desta entrada desenha a moldura inteira (o separador
      // realçado, o estado da loja no cabeçalho); as seguintes só o conteúdo, e
      // o assistente montado ao lado fica onde está.
      if (molduraPintada && slot) {
        slot.innerHTML = content;
      } else {
        render(shellHtml(moldura, content));
        bindShell();
        molduraPintada = true;
      }
      return true;
    },
    loading(): void {
      ctx.paint(SKELETON);
    },
    reload: () => renderDashboard(),
  };

  try {
    await (TAB_RENDER[tab] ?? renderInicio)(ctx);
  } catch (e) {
    console.error("renderDashboard", tab, e);
    if (ctx.paint(card(emptyState({
      icon: "cloud_off", title: "Não foi possível carregar esta secção",
      text: "Verifique a ligação à internet e tente de novo.",
      actions: `<button type="button" id="dash-retry" class="${BTN_PRIMARY}">${icon("refresh", "text-[18px]")} Tentar de novo</button>`,
    })))) {
      document.getElementById("dash-retry")?.addEventListener("click", () => { void ctx.reload(); });
    }
  }
  // O assistente é montado DEPOIS da secção, fora de `#dash-content`: as
  // pinturas seguintes do separador só mexem no conteúdo e não o levam.
  if (seq === renderSeq) mountAiAgent(document.getElementById("app"), { screen: DASH_SCREEN[tab] ?? "painel" });
}
