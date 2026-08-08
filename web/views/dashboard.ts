/**
 * Dashboard do Dono — Início, Produtos, Pagamentos, Configurações.
 * Identidade visual MôBisno (branco + #F95901). Logótipo, banners e aparência
 * vivem no ecrã "Personalizar".
 */
import { render, $, go, esc, toast, formatKz, withBusy, withButton, fadeInImages } from "../lib/dom.js";
import { appState, currentOwnerId, logout, storeRepository, productRepository, adminPanelFor, getOwnerBilling, publicStoreUrl, deleteStore, setStoreState, getOwnerName, STORE_APEX } from "../composition.js";
import { openProductForm } from "../lib/productForm.js";
import { PRICE_KZ, BILLING_PERIODS, PERIOD_LABEL, PLAN_HIGHLIGHTS, priceFor, yearlySavingKz, type BillingPeriod } from "../../src/services/plans.js";
import { canPublishStore, type BillingState } from "../../src/services/billing.js";
import type { Store, Product } from "../../src/models/index.js";
import { getPaymentConfig, savePaymentConfig, getOrderStats, listOrders, deleteOrder, orderEffectiveStatus, canDeleteOrder, type PaymentConfig, type OrderRow } from "../supabase/payments.js";
import { listWithdrawals, committedWithdrawals, requestWithdrawal, type WithdrawalRow } from "../supabase/withdrawals.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { generateLogos, improveLogoDescription, dataUrlToUint8Array, LOGO_PROPOSALS, type LogoDirection } from "../lib/logoApi.js";
import { composeLogo, PREVIEW_SIZE, FINAL_SIZE } from "../lib/logoCompose.js";
import { LOGO_POLICY } from "../../src/services/fileService.js";
import { resolveWaPhone } from "../lib/whatsapp.js";
import { openPlanCheckout } from "../lib/planCheckout.js";
import { openSmsCheckout } from "../lib/smsCheckout.js";
import { getSmsCredits, SMS_UNIT_PRICE, SMS_PACKAGES } from "../supabase/sms.js";
import { listDiscounts, createDiscount, deleteDiscount, setDiscountActive, type DiscountCode } from "../supabase/discounts.js";
import { isCurrentUserAdmin } from "../supabase/admin.js";
import { listStoreReviews, setReviewApproved, deleteReview, type Review } from "../supabase/reviews.js";
import { getStoreAnalytics } from "../supabase/analytics.js";
import { LUANDA_AREAS } from "../lib/areas.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import type { AssistantScreen } from "../lib/assistantContext.js";

const ACCENT = "#F95901";
const ACCENT_TINT = "rgba(249,89,1,.1)";

/**
 * Funcionalidades anunciadas mas ainda não disponíveis (decisão D6).
 * Enquanto a bandeira está a `true`, a interface apresenta a etiqueta «Em breve»
 * e os manipuladores devolvem antecipadamente, sem escrever nada.
 * Reverter é pôr a bandeira a `false`.
 */
const COMING_SOON = { sms: true, customDomain: true };

/** Etiqueta «Em breve» das funcionalidades por lançar. */
function comingSoonBadge(): string {
  return `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[14px]">schedule</span> Em breve</span>`;
}

/** Aviso dentro da secção de uma funcionalidade «Em breve». */
function comingSoonNotice(text: string): string {
  return `<div class="rounded-xl border p-4 mb-4 flex items-start gap-3" style="border-color:${ACCENT_TINT};background:${ACCENT_TINT}">
    <span class="material-symbols-outlined shrink-0" style="color:${ACCENT}">schedule</span>
    <div class="min-w-0">
      <p class="text-sm font-bold text-gray-900 mb-0.5">Em breve</p>
      <p class="text-sm text-gray-600">${esc(text)}</p>
    </div>
  </div>`;
}

/**
 * Versão do Gerador_De_Logotipos, apresentada ao lado do selo «Beta».
 *
 * SUBIR A CADA ALTERAÇÃO do gerador — prompt, plano de direções, composição
 * tipográfica ou interface da secção. É o que permite ao Dono dizer «as
 * propostas pioraram na 1.3» em vez de «pioraram esta semana», e a nós saber
 * de que versão fala um screenshot enviado por ele.
 *
 * Histórico:
 *  - 1.0  gerador inicial (a IA de imagem desenhava o logótipo completo).
 *  - 1.1  o briefing do Dono passa a ganhar às predefinições de estilo.
 *  - 1.2  briefing estruturado, plano determinístico de cinco direções e nome
 *         da marca composto por nós com tipografia curada.
 */
export const LOGO_GENERATOR_VERSION = "1.2";

/**
 * Selo «Beta» das funcionalidades já disponíveis mas ainda em afinação (R2.9).
 * Segue o estilo visual de `comingSoonBadge()` para a interface ficar coerente,
 * mas diz outra coisa: «Beta» é usável hoje, «Em breve» não é.
 *
 * `version` acrescenta a versão em letra mais pequena, ao lado do selo.
 */
function betaBadge(version?: string): string {
  const selo = `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[14px]">science</span> Beta</span>`;
  if (!version) return selo;
  return `${selo}<span class="text-[11px] text-gray-400 font-medium shrink-0">versão ${esc(version)}</span>`;
}

function navItem(href: string, icon: string, label: string, active: boolean): string {
  const base = "rounded-xl px-4 py-3 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors";
  const style = active ? `style="background:${ACCENT_TINT};color:${ACCENT}"` : "";
  const cls = active ? "" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  return `<a href="${href}" class="${base} ${cls}" ${style}><span class="material-symbols-outlined">${icon}</span> ${label}</a>`;
}

/**
 * As secções do painel, por ordem, numa lista só.
 *
 * Alimenta a navegação lateral (ecrã grande), os atalhos de secção em telemóvel
 * e o título do cabeçalho. Sem esta lista, o menu de telemóvel podia nascer com
 * seis secções enquanto o `aside` tinha sete — e ninguém notava até faltar uma.
 */
const DASH_SECTIONS: readonly { tab: string; href: string; icon: string; label: string }[] = [
  { tab: "inicio", href: "#/painel", icon: "home", label: "Início" },
  { tab: "produtos", href: "#/painel/produtos", icon: "inventory_2", label: "Produtos" },
  { tab: "logotipo", href: "#/painel/logotipo", icon: "auto_awesome", label: "Criar logótipo" },
  { tab: "analises", href: "#/painel/analises", icon: "monitoring", label: "Análises" },
  { tab: "pagamentos", href: "#/painel/pagamentos", icon: "payments", label: "Pagamentos" },
  { tab: "plano", href: "#/painel/plano", icon: "workspace_premium", label: "Plano" },
  { tab: "config", href: "#/painel/config", icon: "settings", label: "Configurações" },
];

/**
 * Atalho de secção em telemóvel, no formato de chip.
 *
 * O `aside` é `hidden md:flex` e durante muito tempo não havia alternativa
 * nenhuma: no telefone o Dono ficava preso na secção onde entrasse. Segue o
 * precedente do `web/views/adminPanel.ts`, que resolveu o mesmo defeito.
 */
function navChip(href: string, icon: string, label: string, active: boolean): string {
  const style = active ? `background:${ACCENT_TINT};color:${ACCENT}` : "color:#6b7280";
  return `<a href="${href}" ${active ? 'aria-current="page"' : ""} class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors" style="${style}"><span class="material-symbols-outlined text-[18px]">${icon}</span> ${esc(label)}</a>`;
}

/** Classes dos botões de ícone da barra de conta em telemóvel. */
const MOBILE_ICON_BTN = "shrink-0 w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition-colors";

/**
 * Separador do painel → ecrã do assistente. Cada separador tem orientação
 * própria em `web/lib/assistantContext.ts`; ao acrescentar um separador,
 * acrescentar aqui e lá (ver `.kiro/steering/assistente.md`).
 */
const DASH_SCREEN: Record<string, AssistantScreen> = {
  inicio: "painel",
  produtos: "produtos",
  logotipo: "logotipo",
  analises: "analises",
  pagamentos: "pagamentos",
  plano: "plano",
  config: "config",
};

function currentTab(): string {
  const m = location.pathname.match(/^\/painel\/?([a-z]*)/i);
  return (m && m[1]) ? m[1].toLowerCase() : "inicio";
}

function emptyState(icon: string, message: string, actions: string): string {
  return `<div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 bg-gray-50">
    <span class="material-symbols-outlined text-gray-400" style="font-size:56px;">${icon}</span>
    <p class="text-gray-500">${message}</p>
    <div class="flex gap-3">${actions}</div>
  </div>`;
}

/** Indicador de espera, usado no arranque do painel e em cada secção. */
const SPINNER = `<div class="flex items-center justify-center py-20"><span class="material-symbols-outlined animate-spin text-gray-300" style="font-size:40px">progress_activity</span></div>`;

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

export async function renderDashboard(): Promise<void> {
  appState.editOwnerId = null;
  appState.editorReturn = null; // o dono volta sempre ao seu painel ao sair do editor
  // Só na primeira entrada no painel: ao trocar de separador o painel já está no
  // ecrã, e substituí-lo por um indicador nu seria pior do que deixar a secção
  // anterior visível até a nova estar pronta.
  if (!document.querySelector("[data-panel-shell]")) render(bootPanel());
  const ownerId = appState.ownerId ?? (await currentOwnerId());
  if (!ownerId) {
    render(emptyState("lock", "Inicie sessão para aceder ao Dashboard.",
      `<a href="#/login" class="text-white px-6 py-3 rounded-xl font-semibold" style="background:${ACCENT}">Iniciar sessão</a>
       <a href="#/criar" class="border border-gray-200 text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50">Criar loja</a>`));
    return;
  }
  // As três só dependem do `ownerId` e não umas das outras. Em fila eram três
  // idas ao servidor antes do primeiro pixel; juntas custam o tempo da mais
  // lenta. É o caminho que corre outra vez a cada troca de separador.
  const [allStores, billing, isAdmin] = await Promise.all([
    storeRepository.listByOwner(ownerId),
    getOwnerBilling(ownerId),
    isCurrentUserAdmin(),
  ]);
  // Esconde as lojas-modelo (secção Modelos do admin) do painel pessoal.
  const stores = allStores.filter((s) => !s.identifier.startsWith("modelo-"));
  let store: Store | null = appState.storeId ? (stores.find((s) => s.id === appState.storeId) ?? null) : null;
  if (!store) store = stores[0] ?? null;
  if (!store) {
    render(emptyState("storefront", "Ainda não tem nenhuma loja. Crie a sua primeiro.",
      `<a href="#/criar" class="text-white px-6 py-3 rounded-xl font-semibold" style="background:${ACCENT}">Criar minha loja</a>
       <button id="logout" class="border border-gray-200 text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50">Terminar sessão</button>`));
    $("#logout")?.addEventListener("click", async () => { await logout(); go("#/"); });
    return;
  }
  appState.ownerId = ownerId; appState.storeId = store.id;

  const panel = adminPanelFor(store.id);
  const tab = currentTab();
  const storeUrl = publicStoreUrl(store.identifier);
  /** Título do cabeçalho: o mesmo rótulo da secção, sem uma segunda lista. */
  const tabTitle = DASH_SECTIONS.find((s) => s.tab === tab)?.label ?? tab;
  /**
   * Opções do seletor de loja, escritas uma vez.
   *
   * O seletor aparece em dois sítios (o `aside` e a barra de telemóvel) mas os
   * `id` são diferentes de propósito: dois elementos com o mesmo identificador
   * fariam uma busca por `id` apanhar só o primeiro, e o segundo ficava morto.
   * Por isso a ligação é feita pelo atributo `data-store-switch`.
   */
  const storeOptions = stores
    .map((s) => `<option value="${esc(s.id)}" ${s.id === store!.id ? "selected" : ""}>${esc(s.name)}</option>`)
    .join("");

  function shell(content: string): string {
    return `
    <div data-panel-shell class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
      <aside class="hidden md:flex flex-col py-6 bg-white border-r border-gray-100 w-64 shrink-0 sticky top-0 h-screen">
        <div class="px-6 mb-6">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:26px" />
        </div>
        <div class="px-4 mb-5 space-y-2">
          ${stores.length > 1
            ? `<div class="relative">
                 <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] pointer-events-none">storefront</span>
                 <select id="store-switch" data-store-switch class="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-9 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#F95901] cursor-pointer hover:bg-gray-100 transition-colors">
                   ${storeOptions}
                 </select>
                 <span class="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] pointer-events-none">expand_more</span>
               </div>`
            : `<div class="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                 <span class="material-symbols-outlined text-gray-400 text-[20px] shrink-0">storefront</span>
                 <span class="text-sm font-semibold text-gray-900 truncate">${esc(store!.name)}</span>
               </div>`}
          <a href="#/criar" class="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-dashed border-gray-200 text-gray-500 hover:text-[#F95901] hover:border-[#F95901] rounded-xl py-2 transition-colors"><span class="material-symbols-outlined text-[18px]">add_business</span> Nova loja</a>
        </div>
        <nav class="flex flex-col gap-1 px-2">
          ${DASH_SECTIONS.map((s) => navItem(s.href, s.icon, s.label, tab === s.tab)).join("")}
        </nav>
        <div class="mt-auto px-4 space-y-1">
          ${isAdmin ? `<a href="#/adminPainel" class="w-full inline-flex items-center gap-2 text-sm font-bold px-2 py-2 rounded-lg transition-colors" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">shield_person</span> Dashboard de Administração</a>` : ""}
          <button id="logout" data-logout class="w-full text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-semibold px-2 py-2 transition-colors"><span class="material-symbols-outlined">logout</span> Terminar sessão</button>
        </div>
      </aside>

      <div class="flex-1 min-w-0 flex flex-col">
        <!-- Cabeçalho e atalhos de secção colados juntos, num só invólucro
             pegajoso. O Painel_Admin cola os atalhos a uma distância do topo
             medida à mão, afinada ao cabeçalho dele; este cabeçalho tem outra
             altura (py-3 e o botão Personalizar loja) e qualquer número
             chumbado erraria — a mais tapa o cabeçalho, a menos deixa uma
             faixa de conteúdo a passar por baixo. Aqui não há número. -->
        <div class="sticky top-0 z-40">
          <header class="bg-white/90 backdrop-blur border-b border-gray-100 flex items-center justify-between gap-2 px-4 md:px-8 py-3">
            <h2 class="text-lg sm:text-xl font-black tracking-tight min-w-0 truncate">${esc(tabTitle)}</h2>
            <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <a href="#/personalizar" class="text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span><span class="hidden sm:inline">Personalizar loja</span></a>
              ${store.state === "Publicada" && billing.accessActive
                ? `<a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="text-gray-500 hover:text-gray-900 text-sm font-semibold flex items-center gap-1 px-2 sm:px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"><span class="material-symbols-outlined text-[18px]">open_in_new</span><span class="hidden sm:inline">Ver loja</span></a>`
                : `<a href="/previsualizar/${esc(store.identifier)}" target="_blank" rel="noopener" class="text-gray-500 hover:text-gray-900 text-sm font-semibold flex items-center gap-1 px-2 sm:px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors" title="Só você vê esta pré-visualização"><span class="material-symbols-outlined text-[18px]">visibility</span><span class="hidden sm:inline">Pré-visualizar</span></a>`}
            </div>
          </header>
          <nav aria-label="Secções do painel" class="md:hidden flex gap-1 overflow-x-auto px-3 py-2 bg-white border-b border-gray-100">
            ${DASH_SECTIONS.map((s) => navChip(s.href, s.icon, s.label, tab === s.tab)).join("")}
          </nav>
        </div>
        <!-- Loja, nova loja, administração e terminar sessão: em telemóvel o
             aside não existe, e sem esta barra o Dono com várias lojas não
             conseguia trocar de loja nem sair da conta. -->
        <div class="md:hidden flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-100">
          ${stores.length > 1
            ? `<div class="relative flex-1 min-w-0">
                 <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] pointer-events-none">storefront</span>
                 <select id="store-switch-mobile" data-store-switch aria-label="Loja em edição" class="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-[#F95901]">
                   ${storeOptions}
                 </select>
                 <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] pointer-events-none">expand_more</span>
               </div>`
            : `<div class="flex-1 min-w-0 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2">
                 <span class="material-symbols-outlined text-gray-400 text-[18px] shrink-0">storefront</span>
                 <span class="text-sm font-semibold text-gray-900 truncate">${esc(store!.name)}</span>
               </div>`}
          <a href="#/criar" title="Nova loja" aria-label="Nova loja" class="${MOBILE_ICON_BTN}"><span class="material-symbols-outlined text-[20px]">add_business</span></a>
          ${isAdmin ? `<a href="#/adminPainel" title="Dashboard de Administração" aria-label="Dashboard de Administração" class="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[20px]">shield_person</span></a>` : ""}
          <button data-logout type="button" title="Terminar sessão" aria-label="Terminar sessão" class="${MOBILE_ICON_BTN}"><span class="material-symbols-outlined text-[20px]">logout</span></button>
        </div>
        <main class="flex-1 min-w-0 p-margin-mobile md:p-margin-desktop">
          <div class="max-w-container-max mx-auto w-full">${content}</div>
        </main>
      </div>
    </div>`;
  }

  function bindShell(): void {
    // Por atributo e não por `id`: o mesmo comando existe no `aside` (ecrã
    // grande) e na barra de telemóvel, e dois elementos com o mesmo `id`
    // deixariam o segundo sem ligação nenhuma.
    document.querySelectorAll<HTMLElement>("[data-logout]").forEach((b) =>
      b.addEventListener("click", async () => { await logout(); go("#/"); }));
    document.querySelectorAll<HTMLSelectElement>("[data-store-switch]").forEach((sw) =>
      sw.addEventListener("change", () => {
        appState.storeId = sw.value;
        void renderDashboard();
      }));
  }

  /**
   * Esqueleto da secção: o painel inteiro, com o separador certo **já
   * realçado**, e um indicador no lugar do conteúdo. Chamado no início de cada
   * secção que consulta dados, antes de esperar por eles.
   *
   * É isto que faz o clique parecer instantâneo, e é também a razão de não ser
   * preciso marcar o separador activo à parte: o realce vem do `shell`.
   */
  function showSectionLoading(): void {
    render(shell(SPINNER));
    bindShell();
  }

  // O assistente é montado DEPOIS da secção: cada secção chama `render()`, que
  // substitui o `#app` inteiro e levaria o widget com ele.
  await renderTab();
  mountAiAgent(document.getElementById("app"), { screen: DASH_SCREEN[tab] ?? "painel" });
  return;

  /** Despacho do separador. O separador activo já vem realçado do `shell`. */
  async function renderTab(): Promise<void> {
    if (tab === "produtos") return renderProdutos();
    if (tab === "logotipo") return renderLogotipo();
    if (tab === "analises") return renderAnalises();
    if (tab === "plano") return renderPlano();
    if (tab === "pagamentos") return renderPagamentos();
    if (tab === "config") return renderConfig();
    return renderInicio();
  }

  async function renderInicio(): Promise<void> {
    showSectionLoading();
    /*
     * Teto de vendas lidas. Fica numa constante — e não escrito no meio da
     * chamada — porque o gráfico das vendas por dia é montado a partir **desta**
     * lista: sem saber onde ela foi cortada, os dias mais antigos sairiam
     * incompletos e o gráfico mentia sem dar sinal.
     */
    const ORDERS_LIMIT = 100;
    // Eram oito idas ao servidor em fila, cada uma à espera da anterior sem
    // precisar. Ficam duas ondas: primeiro o que só depende da Loja, depois o
    // que depende de os pagamentos online estarem ativos. Dentro de cada onda
    // nada depende de nada.
    const [products, payCfg, ownerNameRaw] = await Promise.all([
      productRepository.listByStore(store!.id),
      getPaymentConfig(store!.id),
      getOwnerName(ownerId),
    ]);
    const online = payCfg.onlineEnabled;
    const ownerName = ownerNameRaw || store!.name;
    let stats: Awaited<ReturnType<typeof getOrderStats>> | null = null;
    let orders: Awaited<ReturnType<typeof listOrders>> = [];
    let withdrawals: Awaited<ReturnType<typeof listWithdrawals>> = [];
    let committed = 0;
    if (online) {
      [stats, orders, withdrawals, committed] = await Promise.all([
        getOrderStats(store!.id),
        listOrders(store!.id, ORDERS_LIMIT),
        listWithdrawals(store!.id),
        committedWithdrawals(store!.id),
      ]);
    }
    const available = stats ? Math.max(0, Math.round((stats.netReceived - committed) * 100) / 100) : 0;
    const published = store!.state === "Publicada";
    const suspended = billing.suspended;
    /** Publicada **e** com subscrição a pagar: é o que faz a loja estar no ar. */
    const visivel = published && !suspended;

    /**
     * Animações do separador «Início».
     *
     * Folha própria, com `id` próprio, no mesmo padrão de `renderAnalises` e de
     * `web/views/start.ts`: são `@keyframes` que o Tailwind não gera a partir do
     * `content`, e uma classe inventada não sobrevive ao purge. O `id` é também
     * o que impede a folha de ser injetada outra vez a cada troca de separador.
     *
     * Quem pede menos movimento vê tudo já no estado final — nunca uma barra a
     * zero nem uma coluna achatada, que seriam um gráfico errado e não apenas um
     * ecrã mais quieto.
     */
    function injectHomeStyle(): void {
      if (document.getElementById("mb-home-style")) return;
      const st = document.createElement("style");
      st.id = "mb-home-style";
      st.textContent = `
        @keyframes mbHomeRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes mbHomeRow{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes mbHomeBar{from{width:0}to{width:var(--mb-w,0%)}}
        @keyframes mbHomeCol{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes mbHomeBeat{0%{box-shadow:0 0 0 0 rgba(16,185,129,.5)}70%{box-shadow:0 0 0 9px rgba(16,185,129,0)}100%{box-shadow:0 0 0 9px rgba(16,185,129,0)}}
        .mb-home-rise{opacity:0;animation:mbHomeRise .5s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--mb-i,0)*70ms)}
        .mb-home-row{opacity:0;animation:mbHomeRow .34s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--mb-i,0)*45ms)}
        .mb-home-bar{width:0;animation:mbHomeBar .9s cubic-bezier(.16,1,.3,1) .25s forwards}
        .mb-home-col{transform:scaleY(0);transform-origin:bottom;animation:mbHomeCol .55s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(.2s + var(--mb-i,0)*40ms)}
        .mb-home-beat{animation:mbHomeBeat 2.4s ease-out infinite}
        .mb-home-day{transition:opacity .12s ease}
        .mb-home-day:hover{opacity:.8}
        .mb-home-day:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px;border-radius:6px}
        .mb-home-tip{transition:opacity .12s ease}
        .mb-home-copy:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px}
        @media(prefers-reduced-motion:reduce){
          .mb-home-rise,.mb-home-row{animation:none;opacity:1;transform:none}
          .mb-home-bar{animation:none;width:var(--mb-w,0%)}
          .mb-home-col{animation:none;transform:none}
          .mb-home-beat{animation:none}
          .mb-home-day,.mb-home-tip{transition:none}
        }`;
      document.head.appendChild(st);
    }
    injectHomeStyle();

    /** Quem pediu menos movimento não leva contagens nem transições em JS. */
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    /*
     * Valor pintado no primeiro HTML. Só arranca de zero quando vai haver
     * contagem: sem isto, quem pede menos movimento (ou quem tem o JavaScript a
     * meio) ficava com um zero permanente em vez do número real.
     */
    const kzInicial = (v: number): string => formatKz(reduceMotion || v <= 0 ? v : 0);
    const numInicial = (v: number): string => String(reduceMotion || v <= 0 ? v : 0);

    /**
     * Contagem crescente dos números, em `requestAnimationFrame`.
     *
     * Tem de ser decidida em JavaScript e não em CSS: o CSS não conta números.
     * `data-count-kz` é dinheiro (passa pelo `formatKz`, o mesmo formato do resto
     * da plataforma); `data-count-to` é uma contagem inteira.
     */
    function animarNumeros(raiz: ParentNode): void {
      if (reduceMotion) return;
      raiz.querySelectorAll<HTMLElement>("[data-count-to],[data-count-kz]").forEach((el) => {
        const dinheiro = el.dataset.countKz != null;
        const alvo = Number(dinheiro ? el.dataset.countKz : el.dataset.countTo);
        if (!Number.isFinite(alvo) || alvo <= 0) return;
        const escrever = (v: number): void => { el.textContent = dinheiro ? formatKz(v) : String(Math.round(v)); };
        const inicio = performance.now();
        const passo = (agora: number): void => {
          const p = Math.min(1, (agora - inicio) / 750);
          if (p < 1) { escrever(alvo * (1 - Math.pow(1 - p, 3))); requestAnimationFrame(passo); }
          else escrever(alvo); // o último fotograma é o valor exacto, sem arredondamento a meio
        };
        requestAnimationFrame(passo);
      });
    }

    /**
     * Estado da Loja com sinal visual e uma frase que o explica.
     *
     * O ponto verde a pulsar diz «está no ar» de relance, mas a cor sozinha não
     * chega: o rótulo e a nota dizem o mesmo por palavras, e a nota diz também o
     * que isso significa para quem tenta abrir o endereço.
     */
    const estado = suspended
      ? { rotulo: "Fora do ar", fundo: "#fef2f2", tinta: "#b91c1c", ponto: "#ef4444", pulsa: false, nota: "A subscrição não está ativa, por isso a loja saiu da web. Os dados ficam." }
      : published
        ? { rotulo: "Publicada", fundo: "#ecfdf5", tinta: "#047857", ponto: "#10b981", pulsa: true, nota: "A loja está no ar: qualquer pessoa com o endereço pode comprar." }
        : { rotulo: "Não publicada", fundo: "#f3f4f6", tinta: "#6b7280", ponto: "#9ca3af", pulsa: false, nota: "Ainda só você a vê, pela pré-visualização. Publique para a pôr no ar." };

    const statePill = `<span class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold" style="background:${estado.fundo};color:${estado.tinta}">
      <span class="w-2.5 h-2.5 rounded-full shrink-0 ${estado.pulsa ? "mb-home-beat" : ""}" style="background:${estado.ponto}"></span>${esc(estado.rotulo)}</span>`;

    /*
     * Endereço sempre clicável, mas nunca a apontar para uma página que não
     * existe: com a loja no ar abre a loja, fora do ar abre a pré-visualização
     * privada. O botão de copiar está ao lado porque é isso que o Dono faz com o
     * endereço — mandá-lo a alguém.
     */
    const enderecoNu = storeUrl.replace(/^https?:\/\//, "");
    const enderecoLink = visivel
      ? `<a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-bold hover:underline break-all" style="color:${ACCENT}">${esc(enderecoNu)}<span class="material-symbols-outlined text-[16px] shrink-0">open_in_new</span></a>`
      : `<a href="/previsualizar/${esc(store!.identifier)}" target="_blank" rel="noopener" title="A loja ainda não está no ar: isto abre a pré-visualização, que só você vê" class="inline-flex items-center gap-1 font-bold hover:underline break-all" style="color:${ACCENT}">${esc(enderecoNu)}<span class="material-symbols-outlined text-[16px] shrink-0">visibility</span></a>`;

    const placarPlano = planStatusCard(billing);

    const greeting = `
      <section class="mb-home-rise mb-6 flex flex-wrap items-start justify-between gap-4" style="--mb-i:0">
        <div class="min-w-0">
          <h3 class="text-2xl md:text-3xl font-black tracking-tight break-words">Olá, ${esc(ownerName)}</h3>
          <p class="mt-2 flex items-center gap-2 flex-wrap text-gray-500">
            <span class="material-symbols-outlined text-[18px] text-gray-400 shrink-0">link</span>
            ${enderecoLink}
            <button id="copy-url" type="button" class="mb-home-copy inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors shrink-0"><span class="material-symbols-outlined text-[15px]">content_copy</span> Copiar</button>
          </p>
          <p class="text-sm text-gray-400 mt-1.5 break-words">${esc(estado.nota)}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${statePill}
          ${`<button id="toggle-state" class="text-sm font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">${published ? "Despublicar" : "Publicar"}</button>`}
          <a href="#/painel/plano" class="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-full text-sm" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> ${billing.accessActive ? "Subscrição ativa" : "Sem subscrição"}</a>
        </div>
      </section>

      ${placarPlano ? `<div class="mb-home-rise" style="--mb-i:1">${placarPlano}</div>` : ""}`;

    /**
     * Cartão de uma informação — **uma só** por cartão.
     *
     * Todos os números do ecrã passam por aqui: mesmo vocabulário visual, mesma
     * entrada escalonada, mesma contagem crescente. Havia antes um bloco laranja
     * gigante que juntava o total vendido, o disponível, a barra do dinheiro e o
     * gráfico, com dois números a 36 px a dominar o ecrã; a hierarquia agora
     * está no tamanho da letra e no cartão destacado, não no tamanho do bloco.
     *
     * `destaque` pinta o cartão com a cor da plataforma (é o valor principal);
     * `extra` acrescenta ao cartão o que pertence àquele valor e mais nada — o
     * botão do levantamento, a barra do dinheiro já pedido.
     */
    function homeMetric(i: number, icon: string, label: string, valor: number | string,
      opcoes: { kz?: boolean; nota?: string; destaque?: boolean; extra?: string; classe?: string } = {}): string {
      const numerico = typeof valor === "number";
      const conta = numerico ? (opcoes.kz ? `data-count-kz="${valor}"` : `data-count-to="${valor}"`) : "";
      const texto = numerico ? (opcoes.kz ? kzInicial(valor) : numInicial(valor)) : valor;
      const d = opcoes.destaque === true;
      // `break-words` e não `truncate`: em Kwanzas os valores são longos
      // ("1.234.567,89 Kz") e um número cortado é um número errado.
      const cls = d ? "text-white" : "bg-white border border-gray-200";
      const estilo = d ? `--mb-i:${i};background:linear-gradient(135deg,${ACCENT},#ff7e33)` : `--mb-i:${i}`;
      return `<div class="mb-home-rise rounded-2xl p-5 flex flex-col gap-3 min-w-0 ${opcoes.classe ?? ""} ${cls}" style="${estilo}">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style="${d ? "background:rgba(255,255,255,.22);color:#fff" : `background:${ACCENT_TINT};color:${ACCENT}`}"><span class="material-symbols-outlined text-[20px]">${icon}</span></span>
          <p class="text-sm font-semibold ${d ? "text-white/90" : "text-gray-500"} min-w-0 break-words">${esc(label)}</p>
        </div>
        <div class="min-w-0">
          <p class="${d ? "text-2xl sm:text-3xl text-white" : "text-xl sm:text-2xl text-gray-900"} font-black tracking-tight tabular-nums break-words leading-tight" ${conta}>${esc(texto)}</p>
          ${opcoes.nota ? `<p class="text-xs ${d ? "text-white/70" : "text-gray-400"} mt-1 break-words">${esc(opcoes.nota)}</p>` : ""}
        </div>
        ${opcoes.extra ?? ""}
      </div>`;
    }

    /** Cartão de um objecto que não é um número (o gráfico das vendas por dia). */
    function homeCard(i: number, icon: string, titulo: string, aparte: string, corpo: string): string {
      return `<div class="mb-home-rise bg-white border border-gray-200 rounded-2xl p-5 min-w-0" style="--mb-i:${i}">
        <div class="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[20px]">${icon}</span></span>
            <p class="text-sm font-bold text-gray-900 min-w-0 break-words">${esc(titulo)}</p>
          </div>
          ${aparte ? `<p class="text-xs text-gray-400 tabular-nums min-w-0 break-words">${esc(aparte)}</p>` : ""}
        </div>
        ${corpo}
      </div>`;
    }

    const disponiveis = products.filter((p) => p.available).length;

    function bindInicio(): void {
      const app = document.getElementById("app");
      if (app) animarNumeros(app);
      $("#copy-url")?.addEventListener("click", async () => {
        // `navigator.clipboard` não existe em contexto não seguro nem em browsers
        // antigos: em vez de falhar em silêncio, mostra-se o endereço para copiar
        // à mão.
        try {
          await navigator.clipboard.writeText(storeUrl);
          toast("Endereço copiado.");
        } catch {
          toast(`Copie o endereço à mão: ${enderecoNu}`, "error");
        }
      });
      $("#toggle-state")?.addEventListener("click", async () => {
        const next = published ? "Rascunho" : "Publicada";
        /*
         * Publicar exige subscrição **e um lugar pago**: a mensalidade é por Loja
         * publicada. A base de dados impõe as duas regras (gatilho
         * `stores_publish_requires_plan`, migração 0020), mas apanhá-las aqui dá ao
         * Dono uma frase útil em vez de um erro do Postgres — e leva-o ao ecrã onde
         * resolve, que é diferente em cada caso.
         */
        if (next === "Publicada") {
          const publicadas = stores.filter((s) => s.state === "Publicada").length;
          const decisao = canPublishStore(billing, publicadas);
          if (!decisao.allowed) {
            toast(decisao.reason === "sem-subscricao"
              ? "Ative a subscrição para publicar a loja."
              : `A subscrição cobre ${billing.paidStores} loja(s) publicada(s). Pague mais uma loja ou despublique outra.`, "error");
            go("#/painel/plano");
            return;
          }
        }
        const ok = await withBusy(() => setStoreState(ownerId, store!.id, next), "A atualizar…");
        if (ok) { toast(next === "Publicada" ? "Loja publicada." : "Loja despublicada."); await renderDashboard(); }
        else toast("Não foi possível atualizar o estado.", "error");
      });
      $("#request-withdraw")?.addEventListener("click", async () => {
        if (available <= 0) return;
        if (!payCfg.iban) { toast("Vincule a conta bancária em Pagamentos antes de levantar.", "error"); return; }
        if (!confirm(`Solicitar o levantamento de ${formatKz(available)} para a conta ${payCfg.iban}?`)) return;
        const ok = await withBusy(() => requestWithdrawal(store!.id, ownerId, available, payCfg), "A enviar pedido…");
        if (ok) { toast("Pedido de levantamento enviado. Será processado pela equipa MôBisno."); await renderDashboard(); }
        else toast("Não foi possível enviar o pedido.", "error");
      });
    }

    if (!online) {
      render(shell(`${greeting}
        <section class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          ${homeMetric(2, "inventory_2", "Produtos", products.length, { nota: `${disponiveis} disponível(eis) na loja` })}
          ${homeMetric(3, "storefront", "Estado", estado.rotulo, { nota: estado.nota })}
        </section>
        <div class="mb-home-rise rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 text-center" style="--mb-i:4">
          <div class="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}">
            <span class="material-symbols-outlined" style="font-size:34px">payments</span>
          </div>
          <h3 class="text-xl font-black text-gray-900 mt-4">Ative as vendas online</h3>
          <p class="text-gray-500 max-w-md mx-auto mt-1">Receba por Multicaixa Express e Referência Bancária e acompanhe aqui as suas vendas e levantamentos.</p>
          <a href="#/painel/pagamentos" class="inline-flex items-center gap-1.5 mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">bolt</span> Ativar pagamentos</a>
        </div>`));
      bindShell();
      bindInicio();
      return;
    }

    const PAGE = 8;
    let page = 0;

    /*
     * Série diária das vendas pagas, montada a partir das encomendas **já
     * carregadas** — o gráfico não custa uma ida ao servidor.
     *
     * Os dias são agrupados em UTC (como em `renderAnalises`) para o mesmo
     * pagamento não mudar de dia conforme o fuso do telemóvel de quem consulta.
     */
    const DIA_MS = 86_400_000;
    const chaveDia = (iso: string): string | null => {
      const t = Date.parse(iso);
      return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
    };
    const diaLongo = (dia: string): string =>
      new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
    const diaCurto = (dia: string): string =>
      new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

    const janela: string[] = [];
    for (let i = 13; i >= 0; i--) janela.push(new Date(Date.now() - i * DIA_MS).toISOString().slice(0, 10));
    /*
     * Com a lista de vendas cortada no teto, o dia mais antigo que veio pode
     * estar cortado ao meio — e um dia meio contado desenha uma queda que não
     * aconteceu. A série encolhe até ao primeiro dia inteiramente coberto.
     */
    const truncado = orders.length >= ORDERS_LIMIT;
    const cortadoEm = truncado ? chaveDia(orders[orders.length - 1]!.createdAt) : null;
    const dias = cortadoEm ? janela.filter((d) => d > cortadoEm) : janela;

    const porDia = new Map<string, { total: number; n: number }>();
    for (const o of orders) {
      if (o.status !== "paid") continue;
      const k = chaveDia(o.paidAt ?? o.createdAt);
      if (!k) continue;
      const acc = porDia.get(k);
      if (acc) { acc.total += o.amount; acc.n += 1; }
      else porDia.set(k, { total: o.amount, n: 1 });
    }
    const serie = dias.map((dia) => ({ dia, total: porDia.get(dia)?.total ?? 0, n: porDia.get(dia)?.n ?? 0 }));
    const maxDia = Math.max(1, ...serie.map((d) => d.total));
    const totalSerie = serie.reduce((s, d) => s + d.total, 0);

    const colunas = serie.map((d, i) => {
      // 6% de altura mínima para um dia com vendas se ver; 2% para o dia a zero
      // deixar o traço da base, em vez de desaparecer.
      const altura = d.total > 0 ? Math.max(6, Math.round((d.total / maxDia) * 100)) : 2;
      const rotulo = `${diaLongo(d.dia)}: ${d.n} venda(s), ${formatKz(d.total)}`;
      return `<button type="button" data-venda-dia="${i}" class="mb-home-day flex-1 min-w-0 h-full flex items-end" title="${esc(rotulo)}" aria-label="${esc(rotulo)}">
        <span class="mb-home-col w-full rounded-t-md" style="--mb-i:${i};height:${altura}%;background:${d.total > 0 ? ACCENT : "#f3f4f6"}"></span>
      </button>`;
    }).join("");

    /*
     * Barra de progresso do dinheiro: quanto do líquido recebido já foi pedido
     * em levantamentos e quanto continua disponível. `committedWithdrawals`
     * conta pedidos, aprovados e pagos — por isso o rótulo é «já pedido» e não
     * «já recebido no banco», que seria mentira enquanto o pedido não é pago.
     */
    const pctPedido = stats!.netReceived > 0
      ? Math.max(0, Math.min(100, Math.round((committed / stats!.netReceived) * 100)))
      : 0;
    const legenda = (cor: string, texto: string, valor: string): string =>
      `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 min-w-0"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${cor}"></span>${esc(texto)}: <strong class="font-black text-gray-900 tabular-nums break-words">${esc(valor)}</strong></span>`;

    /*
     * A barra vive no cartão do valor sobre o qual é calculada — o líquido
     * recebido — e não num cartão à parte: uma percentagem sem a base ao lado
     * não se lê. A frase de baixo diz qual é essa base.
     */
    const barraDinheiro = stats!.netReceived > 0 ? `
      <div class="mt-1">
        <div class="h-2.5 rounded-full overflow-hidden" style="background:#f3f4f6">
          <div class="mb-home-bar h-full rounded-full" style="--mb-w:${pctPedido}%;background:${ACCENT}"></div>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5">
          ${legenda(ACCENT, "Já pedido", formatKz(committed))}
          ${legenda("#e5e7eb", "Disponível", formatKz(available))}
        </div>
        <p class="text-xs text-gray-400 mt-1.5 break-words">De ${esc(formatKz(stats!.netReceived))} recebidos (líquido, já sem a taxa).</p>
      </div>` : "";

    /*
     * A acção fica no cartão do valor a que se aplica: pede-se o levantamento
     * **daquele** disponível. O botão é de largura total dentro do cartão para
     * não sair dele a 360 px.
     */
    const botaoLevantar = `
      <div class="mt-1">
        <button id="request-withdraw" ${available > 0 ? "" : "disabled"} class="w-full inline-flex items-center justify-center gap-1.5 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-transform active:scale-95 ${available > 0 ? "hover:opacity-95" : "opacity-60 cursor-not-allowed"}" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">account_balance_wallet</span> Solicitar levantamento</button>
      </div>`;

    const temGrafico = stats!.paidCount > 0 && serie.length >= 2;
    const corpoGrafico = temGrafico ? `
        <div id="home-plot" class="relative">
          <div class="flex items-stretch gap-1" style="height:72px">${colunas}</div>
          <div id="home-tip" class="mb-home-tip absolute z-10 pointer-events-none rounded-xl px-3 py-2 shadow-lg" style="opacity:0;visibility:hidden;bottom:calc(100% + 6px);transform:translateX(-50%);background:#111827;color:#fff"></div>
        </div>
        <div class="flex items-center justify-between mt-1.5 text-[10px] font-semibold text-gray-400 tabular-nums">
          <span>${esc(diaCurto(serie[0]!.dia))}</span>
          <span>${esc(diaCurto(serie[serie.length - 1]!.dia))}</span>
        </div>`
      : `<p class="flex items-start gap-2 text-sm text-gray-500"><span class="material-symbols-outlined text-[18px] shrink-0" style="color:${ACCENT}">insights</span> O gráfico das vendas por dia aparece com a primeira venda paga.</p>`;

    /*
     * O gráfico tem cartão próprio, com título próprio: é um objecto diferente
     * de um número, e antes vivia colado por baixo dos valores no mesmo bloco
     * laranja.
     */
    const graficoVendas = homeCard(8, "insights", "Vendas pagas por dia",
      temGrafico ? `${formatKz(totalSerie)} em ${serie.length} dia(s)${truncado ? ", das vendas mais recentes" : ""}` : "",
      corpoGrafico);

    render(shell(`${greeting}
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        ${homeMetric(2, "trending_up", "Valor total vendido", stats!.totalSales, { kz: true, destaque: true, nota: "Soma de todas as vendas pagas" })}
        ${homeMetric(3, "savings", "Recebido (líquido)", stats!.netReceived, { kz: true, extra: barraDinheiro })}
        ${homeMetric(4, "account_balance", "Disponível para levantar", available, {
          kz: true,
          nota: payCfg.iban ? `Para a conta ${maskIban(payCfg.iban)}` : "Vincule a conta bancária em Pagamentos",
          extra: botaoLevantar,
        })}
      </section>

      <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        ${homeMetric(5, "receipt_long", "Vendas pagas", stats!.paidCount, { nota: "Compras concluídas na sua loja" })}
        ${homeMetric(6, "inventory_2", "Produtos", products.length, { nota: `${disponiveis} disponível(eis) na loja` })}
        ${homeMetric(7, "schedule", "Referências pendentes", stats!.pendingCount, { nota: "Por pagar e ainda dentro do prazo" })}
      </section>

      <section class="mb-4">${graficoVendas}</section>

      <section class="mb-home-rise bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4" style="--mb-i:9">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 class="font-black text-gray-900">Vendas</h3>
          <span id="orders-count" class="text-sm text-gray-400">${orders.length} registo(s)</span>
        </div>
        <div id="orders-body"></div>
        <div id="orders-pager" class="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-sm"></div>
      </section>

      <section class="mb-home-rise bg-white border border-gray-200 rounded-2xl overflow-hidden" style="--mb-i:10">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-black text-gray-900">Levantamentos</h3></div>
        <div class="divide-y divide-gray-50">
          ${withdrawals.length ? withdrawals.map(withdrawalRow).join("") : `<div class="px-5 py-8 text-center">
            <span class="material-symbols-outlined text-gray-300" style="font-size:30px">account_balance</span>
            <p class="text-sm text-gray-500 mt-1">Ainda não pediu nenhum levantamento.</p>
            <p class="text-xs text-gray-400">O que pedir aparece aqui, com o estado do pedido.</p>
          </div>`}
        </div>
      </section>`));
    bindShell();
    bindInicio();
    drawOrders();
    ligarGrafico();

    /**
     * Dica de cada dia do gráfico das vendas.
     *
     * Fica fora de `bindInicio` porque a `serie` só existe neste ramo: chamada
     * dali, o ramo sem pagamentos online tocaria numa constante ainda não
     * inicializada. O `title` de cada coluna já cobre o intervalo até o
     * JavaScript ligar, e é o que um leitor de ecrã anuncia.
     */
    function ligarGrafico(): void {
      const plot = document.getElementById("home-plot");
      const tip = document.getElementById("home-tip");
      if (!plot || !tip) return;
      const esconder = (): void => { tip.style.opacity = "0"; tip.style.visibility = "hidden"; };
      plot.querySelectorAll<HTMLElement>("[data-venda-dia]").forEach((col) => {
        const mostrar = (): void => {
          const i = Number(col.dataset.vendaDia);
          const d = serie[i];
          if (!d) return;
          tip.innerHTML = `<span class="block text-[10px] font-semibold text-white/60 whitespace-nowrap">${esc(diaLongo(d.dia))}</span>
            <span class="block text-sm font-black whitespace-nowrap tabular-nums">${esc(formatKz(d.total))}</span>
            <span class="block text-[10px] font-semibold text-white/60 whitespace-nowrap">${d.n} venda(s)</span>`;
          tip.style.left = `${(((i + 0.5) / serie.length) * 100).toFixed(2)}%`;
          tip.style.visibility = "visible";
          tip.style.opacity = "1";
        };
        col.addEventListener("pointerenter", mostrar);
        col.addEventListener("focus", mostrar);
        col.addEventListener("click", mostrar);
        col.addEventListener("blur", esconder);
      });
      plot.addEventListener("pointerleave", esconder);
    }

    /**
     * Loja sem uma única venda: em vez de «Ainda não há vendas.» seco, diz o que
     * falta para a primeira acontecer, com os passos já feitos marcados a partir
     * do estado real da Loja — mesmo espírito do estado vazio das Análises.
     *
     * Este ramo só corre com os pagamentos online ligados, por isso esse passo
     * está sempre feito. Marcá-lo como pendente seria mandar o Dono ativar o que
     * já está ativo.
     */
    function vendasVazias(): string {
      const passo = (n: number, feito: boolean, texto: string): string => `<li class="flex items-start gap-2.5">
        <span class="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5" style="background:${feito ? "#ecfdf5" : ACCENT_TINT};color:${feito ? "#047857" : ACCENT}">${feito ? "&check;" : n}</span>
        <span class="text-sm ${feito ? "text-gray-400 line-through" : "text-gray-600"}">${esc(texto)}</span>
      </li>`;
      return `<div class="px-5 py-10 text-center">
        <div class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}">
          <span class="material-symbols-outlined" style="font-size:30px">receipt_long</span>
        </div>
        <h4 class="font-black text-gray-900 mt-3">Ainda não há vendas</h4>
        <p class="text-sm text-gray-500 max-w-sm mx-auto mt-1">Cada compra paga na sua loja entra nesta lista, com o método, a taxa e o valor líquido. Falta só chegar a primeira.</p>
        <ul class="mt-5 mb-5 space-y-2.5 text-left max-w-xs mx-auto">
          ${passo(1, true, "Pagamentos online ativos")}
          ${passo(2, products.length > 0, "Ter produtos no catálogo")}
          ${passo(3, visivel, "Ter a loja publicada")}
          ${passo(4, false, "Partilhar o endereço com os seus clientes")}
        </ul>
        <div class="flex flex-wrap items-center justify-center gap-3">
          ${visivel
            ? `<a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">open_in_new</span> Abrir a minha loja</a>`
            : `<a href="/previsualizar/${esc(store!.identifier)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">visibility</span> Pré-visualizar a loja</a>`}
          <a href="#/painel/produtos" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">inventory_2</span> Gerir produtos</a>
        </div>
      </div>`;
    }

    /** Cor da faixa lateral de cada venda, pelo estado efetivo da encomenda. */
    function corEstado(status: string): string {
      if (status === "paid") return "#10b981";
      if (status === "open") return "#f59e0b";
      if (status === "failed") return "#ef4444";
      return "#d1d5db";
    }

    function drawOrders(): void {
      const body = $("#orders-body");
      const pager = $("#orders-pager");
      if (!body || !pager) return;
      if (!orders.length) {
        body.innerHTML = vendasVazias();
        pager.innerHTML = "";
        return;
      }
      const pages = Math.ceil(orders.length / PAGE);
      page = Math.max(0, Math.min(page, pages - 1));
      const slice = orders.slice(page * PAGE, page * PAGE + PAGE);
      body.innerHTML = slice.map(orderRow).join("");
      /*
       * A entrada escalonada e a faixa de estado são postas aqui, e não no HTML
       * de `orderRow`: essa função é o formato de linha partilhado e leva o
       * `last:border-0`, que deixaria de funcionar se cada linha ganhasse um
       * invólucro só para levar a animação.
       */
      const linhas = Array.from(body.children) as HTMLElement[];
      slice.forEach((o, i) => {
        const linha = linhas[i];
        if (!linha) return;
        linha.classList.add("mb-home-row");
        linha.style.setProperty("--mb-i", String(i));
        linha.style.borderLeft = `3px solid ${corEstado(orderEffectiveStatus(o))}`;
      });
      pager.innerHTML = `
        <span class="text-gray-400">Página ${page + 1} de ${pages}</span>
        <div class="flex gap-2">
          <button data-pg="prev" ${page === 0 ? "disabled" : ""} class="px-3 py-1.5 rounded-lg border border-gray-200 ${page === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"}">Anterior</button>
          <button data-pg="next" ${page >= pages - 1 ? "disabled" : ""} class="px-3 py-1.5 rounded-lg border border-gray-200 ${page >= pages - 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"}">Seguinte</button>
        </div>`;
      pager.querySelector('[data-pg="prev"]')?.addEventListener("click", () => { page--; drawOrders(); });
      pager.querySelector('[data-pg="next"]')?.addEventListener("click", () => { page++; drawOrders(); });
      body.querySelectorAll<HTMLElement>("[data-order-toggle]").forEach((r) =>
        r.addEventListener("click", () => {
          const id = r.dataset.orderToggle;
          body.querySelector<HTMLElement>(`[data-order-detail="${id}"]`)?.classList.toggle("hidden");
        }));
      body.querySelectorAll<HTMLButtonElement>("[data-order-del]").forEach((b) =>
        b.addEventListener("click", () => void apagarVenda(b)));
    }

    /**
     * Apaga uma referência expirada e deixa o ecrã coerente **sem recarregar**.
     *
     * A lista em memória é a fonte de tudo o que está desenhado: a contagem de
     * registos, a paginação e a série do gráfico saem dela. Por isso a linha é
     * removida de `orders` e a lista é redesenhada — e não há nada a recalcular
     * no gráfico nem nos totais, porque só as vendas **pagas** os alimentam e uma
     * paga nunca é apagável. A janela do gráfico também não se alarga: os dias
     * que a lista não trouxe continuam a não ter dados para mostrar.
     *
     * A confirmação diz que é definitivo porque é: não há lixeira nem histórico
     * de tentativas de compra a que voltar.
     */
    async function apagarVenda(btn: HTMLButtonElement): Promise<void> {
      const id = btn.dataset.orderDel;
      if (!id) return;
      if (!confirm("Apagar este registo de referência expirada? A tentativa de compra deixa de aparecer nas suas vendas, para sempre, e não é possível recuperá-la.")) return;
      const apagado = await withButton(btn, () => deleteOrder(id), "A apagar…");
      if (!apagado) {
        // `deleteOrder` confirma pela linha devolvida: um `delete` sem política
        // que o cubra não apaga nada e também não dá erro.
        toast("Não foi possível apagar este registo.", "error");
        return;
      }
      const i = orders.findIndex((o) => o.id === id);
      if (i >= 0) orders.splice(i, 1);
      const contador = $("#orders-count");
      if (contador) contador.textContent = `${orders.length} registo(s)`;
      toast("Registo apagado.");
      drawOrders();
    }
  }

  async function renderProdutos(): Promise<void> {
    showSectionLoading();
    const list = await productRepository.listByStore(store!.id);
    const atLimit = false; // sem escalões, não há limite de produtos
    const usage = `${list.length}`;
    const cats = [...new Set(list.map((p) => p.category).filter((c): c is string => !!c))];

    const addBtn = atLimit
      ? `<a href="#/painel/plano" class="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">lock</span> Fazer upgrade</a>`
      : `<button id="add" class="text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 transition-opacity hover:opacity-95 shrink-0" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add</span> Adicionar produto</button>`;

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 class="text-xl font-black text-gray-900">Produtos</h3>
          <p class="text-sm text-gray-400">${usage} produto(s)</p>
        </div>
        ${addBtn}
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="prod-search" type="search" placeholder="Pesquisar produtos…" class="${inputCls}" />
        </div>
        <select id="prod-cat" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-48">
          <option value="">Todas as categorias</option>
          ${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
        </select>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0">
          <button data-type="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Todos</button>
          <button data-type="physical" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Físicos</button>
          <button data-type="digital" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Digitais</button>
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 shrink-0">
          <button data-view="grid" title="Grelha" class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"><span class="material-symbols-outlined text-[20px]">grid_view</span></button>
          <button data-view="list" title="Lista" class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"><span class="material-symbols-outlined text-[20px]">view_list</span></button>
        </div>
      </div>
      <div id="prod-grid"></div>`));

    bindShell();

    let q = "";
    let cat = "";
    let type: "all" | "physical" | "digital" = "all";
    let view: "grid" | "list" = localStorage.getItem("mb-prod-view") === "list" ? "list" : "grid";

    const applyType = (): void => {
      document.querySelectorAll<HTMLElement>("[data-type]").forEach((b) => {
        const active = b.dataset.type === type;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };
    const applyView = (): void => {
      document.querySelectorAll<HTMLElement>("[data-view]").forEach((b) => {
        const active = b.dataset.view === view;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#9ca3af";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function drawGrid(): void {
      const grid = $("#prod-grid");
      if (!grid) return;
      const ql = q.trim().toLowerCase();
      const filtered = list.filter((p) => {
        if (cat && (p.category ?? "") !== cat) return false;
        if (type === "physical" && p.physical === false) return false;
        if (type === "digital" && p.physical !== false) return false;
        if (ql && !(`${p.name} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase().includes(ql))) return false;
        return true;
      });
      if (!list.length) {
        grid.innerHTML = `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Ainda não há produtos. Adicione o primeiro.</div>`;
        return;
      }
      if (!filtered.length) {
        grid.innerHTML = `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhum produto corresponde aos filtros.</div>`;
        return;
      }
      grid.innerHTML = view === "list"
        ? `<div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">${filtered.map(productRowAdmin).join("")}</div>`
        : `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">${filtered.map(productCardAdmin).join("")}</div>`;
      fadeInImages(grid);
      grid.querySelectorAll<HTMLElement>("[data-edit-prod]").forEach((b) =>
        b.addEventListener("click", () => {
          const p = list.find((x) => x.id === b.dataset.editProd);
          if (p) openProductForm({ panel, ownerId, storeId: store!.id, product: p, categories: cats, onDone: renderProdutos });
        }));
      grid.querySelectorAll<HTMLElement>("[data-del-prod]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.delProd!;
          const req = await panel.controllers.products.requestRemoval(ownerId, store!.id, id);
          if (req.status !== "confirmation_required") { toast(req.message, "error"); return; }
          if (!confirm(req.prompt.message)) return;
          const done = await withBusy(() => panel.controllers.products.confirmRemoval(ownerId, store!.id, id), "A remover produto…");
          if (done.status === "removed") { toast(done.message); await renderProdutos(); }
          else toast(done.message, "error");
        }));
    }

    applyType();
    applyView();
    drawGrid();

    ($("#prod-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; drawGrid(); });
    ($("#prod-cat") as HTMLSelectElement | null)?.addEventListener("change", (e) => { cat = (e.target as HTMLSelectElement).value; drawGrid(); });
    document.querySelectorAll<HTMLElement>("[data-type]").forEach((b) =>
      b.addEventListener("click", () => { type = (b.dataset.type as "all" | "physical" | "digital"); applyType(); drawGrid(); }));
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((b) =>
      b.addEventListener("click", () => { view = b.dataset.view === "list" ? "list" : "grid"; localStorage.setItem("mb-prod-view", view); applyView(); drawGrid(); }));

    $("#add")?.addEventListener("click", () => {
      openProductForm({ panel, ownerId, storeId: store!.id, categories: cats, onDone: renderProdutos });
    });
  }

  async function renderAnalises(): Promise<void> {
    showSectionLoading();

    const [a, products] = await Promise.all([
      getStoreAnalytics(store!.id),
      productRepository.listByStore(store!.id),
    ]);

    /**
     * Animações do ecrã de Análises.
     *
     * Ficam numa folha injetada com `id` próprio, como em `web/views/start.ts`:
     * são `@keyframes` (traçado da linha, entrada das barras) que o Tailwind não
     * gera a partir do `content`, e uma classe inventada seria removida pelo
     * purge. Quem pede menos movimento vê tudo já no estado final — nunca uma
     * linha a meio de ser desenhada nem uma barra a zero.
     */
    function injectAnalyticsStyle(): void {
      if (document.getElementById("mb-analytics-style")) return;
      const st = document.createElement("style");
      st.id = "mb-analytics-style";
      st.textContent = `
        @keyframes mbAnaRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes mbAnaDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
        @keyframes mbAnaFade{from{opacity:0}to{opacity:1}}
        @keyframes mbAnaPop{from{opacity:0;transform:translate(-50%,50%) scale(.2)}to{opacity:1;transform:translate(-50%,50%) scale(1)}}
        @keyframes mbAnaBar{from{width:0}to{width:var(--mb-w,0%)}}
        @keyframes mbAnaHalo{0%{transform:translate(-50%,50%) scale(.9);opacity:.55}70%{transform:translate(-50%,50%) scale(2.1);opacity:0}100%{transform:translate(-50%,50%) scale(2.1);opacity:0}}
        .mb-ana-rise{opacity:0;animation:mbAnaRise .5s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--mb-i,0)*70ms)}
        .mb-ana-line{stroke-dasharray:1;stroke-dashoffset:1;animation:mbAnaDraw 1.1s cubic-bezier(.4,0,.2,1) .1s forwards}
        .mb-ana-area{opacity:0;animation:mbAnaFade .7s ease .45s forwards}
        .mb-ana-dot{opacity:0;animation:mbAnaPop .32s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.4s + var(--mb-i,0)*45ms)}
        .mb-ana-halo{opacity:0;animation:mbAnaHalo 2.4s ease-out 1.2s infinite backwards}
        .mb-ana-bar{width:0;animation:mbAnaBar .9s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(.15s + var(--mb-i,0)*60ms)}
        .mb-ana-col:hover{background:rgba(249,89,1,.06)}
        .mb-ana-col:focus-visible{outline:2px solid ${ACCENT};outline-offset:-2px}
        .mb-ana-tip{transition:opacity .12s ease}
        @media(prefers-reduced-motion:reduce){
          .mb-ana-rise,.mb-ana-area{animation:none;opacity:1;transform:none}
          .mb-ana-line{animation:none;stroke-dashoffset:0}
          .mb-ana-dot{animation:none;opacity:1;transform:translate(-50%,50%)}
          .mb-ana-halo{animation:none;opacity:0}
          .mb-ana-bar{animation:none;width:var(--mb-w,0%)}
          .mb-ana-tip{transition:none}
        }`;
      document.head.appendChild(st);
    }
    injectAnalyticsStyle();

    /** Quem pediu menos movimento não leva contagens nem transições em JS. */
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dayShort = (iso: string): string =>
      new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    const dayLong = (iso: string): string =>
      new Date(iso).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

    /*
     * A comparação entre períodos sai da série diária, a única coisa em
     * `getStoreAnalytics` que dá para partir em dois períodos iguais: 14 dias =
     * 7 + 7. O número em destaque também vem dela (e não de `visits7`, que é
     * uma janela deslizante de 168 horas) para o valor e a variação terem a
     * mesma base — senão o Dono vê 12 visitas com «+40%» calculado sobre outra
     * contagem. As visualizações de produtos não têm série diária, por isso não
     * têm variação: inventá-la era pior do que não a ter.
     */
    const dias = a.daily.length;
    const last7 = a.daily.slice(-7).reduce((s, d) => s + d.visits, 0);
    const prev7 = a.daily.slice(0, Math.max(0, dias - 7)).reduce((s, d) => s + d.visits, 0);
    const total14 = a.daily.reduce((s, d) => s + d.visits, 0);
    const maxV = Math.max(1, ...a.daily.map((d) => d.visits));
    const peak = a.daily.reduce((best, d, i) => (d.visits > (a.daily[best]?.visits ?? -1) ? i : best), 0);
    const mediaDia = Math.round((a.visits30 / 30) * 10) / 10;
    const disponiveis = products.filter((p) => p.available).length;

    /**
     * Variação face ao período anterior, com seta e cor.
     *
     * Sem período anterior com dados não há percentagem que signifique algo
     * (dividir por zero dá infinito, e «+100%» sobre zero é uma invenção): esses
     * casos dizem-se por palavras.
     */
    function deltaPill(cur: number, prev: number): string {
      const wrap = (bg: string, color: string, icon: string, text: string): string =>
        `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0" style="background:${bg};color:${color}">
          <span class="material-symbols-outlined text-[13px]">${icon}</span>${esc(text)}</span>`;
      if (cur === 0 && prev === 0) return wrap("#f3f4f6", "#6b7280", "remove", "sem visitas");
      if (prev === 0) return wrap("#ecfdf5", "#047857", "arrow_upward", "primeiras visitas");
      if (cur === prev) return wrap("#f3f4f6", "#6b7280", "remove", "igual");
      const pct = Math.round(((cur - prev) / prev) * 100);
      return pct > 0
        ? wrap("#ecfdf5", "#047857", "arrow_upward", `+${pct}%`)
        : wrap("#fef2f2", "#b91c1c", "arrow_downward", `${pct}%`);
    }

    /** Cartão de número: valor com contagem de entrada, variação e nota de contexto. */
    function statCard(i: number, icon: string, label: string, value: number, pill: string, hint: string): string {
      return `<div class="mb-ana-rise bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3" style="--mb-i:${i}">
        <div class="flex items-start justify-between gap-2">
          <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">${icon}</span></div>
          ${pill}
        </div>
        <div class="min-w-0">
          <p class="text-sm text-gray-500 mb-0.5">${esc(label)}</p>
          <p class="text-3xl font-black text-gray-900 tabular-nums" data-count-to="${value}">${reduceMotion ? value : 0}</p>
          <p class="text-xs text-gray-400 mt-1">${esc(hint)}</p>
        </div>
      </div>`;
    }

    /*
     * Gráfico à mão, sem biblioteca, no espírito de `evolutionChart` em
     * `web/views/adminPanel.ts`: aqui é área + linha porque catorze barras nuas
     * a 360 px não deixam ver a tendência, que é a leitura que interessa.
     *
     * A linha vai em SVG com `preserveAspectRatio="none"` (estica-se à largura
     * disponível, e o `vector-effect` impede o traço de engordar com ela); os
     * pontos, as colunas de leitura e os rótulos são HTML posicionado em
     * percentagem, porque um círculo SVG num sistema esticado sairia elipse.
     */
    const xOf = (i: number): number => ((i + 0.5) / Math.max(1, dias)) * 100;
    const yOf = (v: number): number => 100 - (v / maxV) * 94; // 6% de folga no topo: o ponto do pico não fica cortado
    const pontos = a.daily.map((d, i) => `${xOf(i).toFixed(2)},${yOf(d.visits).toFixed(2)}`);
    const linePath = `M${pontos.join(" L")}`;
    const areaPath = `${linePath} L${xOf(dias - 1).toFixed(2)},100 L${xOf(0).toFixed(2)},100 Z`;

    const ticks = [...new Set([maxV, Math.round(maxV / 2), 0])];
    const grade = ticks.map((v) => `<div class="absolute left-0 right-0 flex items-center gap-2" style="top:${yOf(v).toFixed(2)}%;transform:translateY(-50%)">
        <span class="w-8 shrink-0 text-right text-[10px] font-semibold text-gray-400 tabular-nums">${v}</span>
        <span class="flex-1 border-t border-dashed border-gray-200"></span>
      </div>`).join("");

    const dots = a.daily.map((d, i) => {
      const destaque = i === peak && d.visits > 0;
      const r = destaque ? 12 : 8;
      // O centrar é feito pelo `translate(-50%,50%)` das animações, e não por
      // margens negativas: assim o ponto fica no sítio com ou sem movimento.
      const halo = destaque
        ? `<span class="mb-ana-halo absolute rounded-full pointer-events-none" style="left:${xOf(i).toFixed(2)}%;bottom:${(100 - yOf(d.visits)).toFixed(2)}%;width:14px;height:14px;background:${ACCENT}"></span>`
        : "";
      const corpo = destaque
        ? `background:#fff;border:3px solid ${ACCENT};box-shadow:0 4px 12px -2px rgba(249,89,1,.55)`
        : `background:${ACCENT};border:2px solid #fff`;
      return `${halo}<span data-dot="${i}" class="mb-ana-dot absolute rounded-full pointer-events-none" style="--mb-i:${i};left:${xOf(i).toFixed(2)}%;bottom:${(100 - yOf(d.visits)).toFixed(2)}%;width:${r}px;height:${r}px;${corpo}"></span>`;
    }).join("");

    /*
     * Uma coluna invisível por dia, larga o suficiente para o rato e o dedo
     * acertarem, e focável pelo teclado. O `title` garante o valor mesmo antes
     * de o JavaScript ligar a dica.
     */
    const colunas = a.daily.map((d, i) => {
      const rotulo = `${dayLong(d.date)}: ${d.visits} visita(s)`;
      return `<button type="button" data-day="${i}" class="mb-ana-col flex-1 min-w-0 h-full rounded-md transition-colors" title="${esc(rotulo)}" aria-label="${esc(rotulo)}"></button>`;
    }).join("");

    const rotulosX = a.daily.map((d, i) => {
      // Catorze datas lado a lado ficam ilegíveis: mostra-se dia sim, dia não,
      // e o último dia (hoje) é sempre um dos mostrados.
      const mostrar = (dias - 1 - i) % 2 === 0;
      return `<span class="flex-1 min-w-0 text-center text-[10px] font-semibold ${i === peak && d.visits > 0 ? "" : "text-gray-400"}" ${i === peak && d.visits > 0 ? `style="color:${ACCENT}"` : ""}>${mostrar ? esc(dayShort(d.date)) : "&nbsp;"}</span>`;
    }).join("");

    const picoTexto = a.daily[peak] && a.daily[peak]!.visits > 0
      ? `Dia de maior tráfego: <strong class="font-bold" style="color:${ACCENT}">${esc(dayLong(a.daily[peak]!.date))}</strong>, com ${a.daily[peak]!.visits} visita(s).`
      : "Sem visitas registadas nos últimos 14 dias.";

    const chartCard = `
      <section class="mb-ana-rise bg-white border border-gray-200 rounded-2xl p-5 md:p-6 mb-6" style="--mb-i:4">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div class="min-w-0">
            <h3 class="font-black text-gray-900">Visitas — últimos 14 dias</h3>
            <p class="text-sm text-gray-400 mt-0.5">${total14} visita(s) no período. Passe o rato num dia para ver o valor.</p>
          </div>
          <span class="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-1 shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}">
            <span class="w-2 h-2 rounded-full" style="background:${ACCENT}"></span> Visitas por dia
          </span>
        </div>
        <div class="relative" style="height:190px">
          ${grade}
          <div id="ana-plot" class="absolute inset-y-0 left-10 right-0">
            <svg class="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="ana-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.28" />
                  <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <path class="mb-ana-area" d="${areaPath}" fill="url(#ana-fill)" />
              <path class="mb-ana-line" d="${linePath}" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" vector-effect="non-scaling-stroke" />
            </svg>
            ${dots}
            <div class="absolute inset-0 flex items-stretch gap-0.5">${colunas}</div>
            <div id="ana-tip" class="mb-ana-tip absolute z-10 pointer-events-none rounded-xl px-3 py-2 text-white shadow-lg" style="opacity:0;visibility:hidden;background:#111827;transform:translateX(-50%)"></div>
          </div>
        </div>
        <div class="flex items-stretch gap-0.5 pl-10 mt-2">${rotulosX}</div>
        <p class="text-sm text-gray-500 mt-4">${picoTexto}</p>
      </section>`;

    const topMax = Math.max(1, ...a.topProducts.map((t) => t.count));
    const byId = new Map(products.map((p) => [p.id, p]));
    const topRows = a.topProducts.map((t, i) => {
      const p = byId.get(t.productId);
      const quota = Math.max(4, Math.round((t.count / topMax) * 100)); // 4%: uma barra de 1 px não se vê
      const foto = p?.imageUrl
        ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" class="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />`
        : `<span class="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-gray-300 text-[20px]">image</span></span>`;
      return `<div class="flex items-center gap-3 px-5 py-3">
        ${foto}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-semibold text-gray-800 truncate">${esc(p?.name ?? "Produto já removido")}</span>
            <span class="text-sm font-black text-gray-900 tabular-nums shrink-0">${t.count}</span>
          </div>
          <div class="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div class="mb-ana-bar h-full rounded-full" style="--mb-w:${quota}%;--mb-i:${i};background:${ACCENT}"></div>
          </div>
        </div>
      </div>`;
    }).join("");

    const topCard = `
      <section class="mb-ana-rise bg-white border border-gray-200 rounded-2xl overflow-hidden" style="--mb-i:5">
        <div class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-black text-gray-900">Produtos mais vistos (30 dias)</h3>
          <span class="text-xs text-gray-400">${a.views30} visualização(ões) no total</span>
        </div>
        <div class="divide-y divide-gray-50">${a.topProducts.length
          ? topRows
          : `<div class="px-5 py-10 text-center">
              <span class="material-symbols-outlined text-gray-300" style="font-size:34px">visibility_off</span>
              <p class="text-sm text-gray-500 mt-1">Ainda ninguém abriu a página de um produto.</p>
              <a href="#/painel/produtos" class="text-sm font-bold hover:underline" style="color:${ACCENT}">Ver os meus produtos</a>
            </div>`}</div>
      </section>`;

    const fonte = `<p class="text-xs text-gray-400 mt-6">Os números vêm dos eventos da sua própria loja (visitas e páginas de produto abertas), não do Google Analytics.</p>`;

    const cabecalho = `
      <section class="mb-6">
        <h3 class="text-2xl font-black tracking-tight">Análises</h3>
        <p class="text-gray-500 mt-1">Quem visita a sua loja e o que anda a ser visto.</p>
      </section>`;

    /*
     * Loja sem um único evento em 30 dias não mostra quatro zeros: quatro zeros
     * lidos por quem acabou de criar a loja parecem avaria do painel. Mostra-se
     * o que falta fazer para os números começarem a existir, e o passo a seguir
     * depende do estado real da Loja.
     */
    if (a.visits30 === 0 && a.views30 === 0) {
      const publicada = store!.state === "Publicada" && billing.accessActive;
      const passo = (n: number, feito: boolean, texto: string): string => `<li class="flex items-start gap-2.5">
        <span class="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5" style="background:${feito ? "#ecfdf5" : ACCENT_TINT};color:${feito ? "#047857" : ACCENT}">${feito ? "&check;" : n}</span>
        <span class="text-sm ${feito ? "text-gray-400 line-through" : "text-gray-600"}">${texto}</span>
      </li>`;
      render(shell(`${cabecalho}
        <section class="mb-ana-rise bg-white border border-gray-200 rounded-3xl p-8 md:p-10 text-center">
          <div class="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}">
            <span class="material-symbols-outlined" style="font-size:34px">monitoring</span>
          </div>
          <h3 class="text-xl font-black text-gray-900 mt-4">Ainda não há visitas para mostrar</h3>
          <p class="text-gray-500 max-w-md mx-auto mt-1.5">Este ecrã enche-se sozinho: cada pessoa que abre a sua loja e cada produto que ela vê passam a contar aqui. Os primeiros números aparecem minutos depois da primeira visita.</p>
          <ul class="mt-6 mb-6 space-y-2.5 text-left max-w-sm mx-auto">
            ${passo(1, products.length > 0, "Ter produtos no catálogo")}
            ${passo(2, publicada, "Publicar a loja")}
            ${passo(3, false, "Partilhar o endereço com os seus clientes")}
          </ul>
          <div class="flex flex-wrap items-center justify-center gap-3">
            ${publicada
              ? `<a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">open_in_new</span> Abrir a minha loja</a>`
              : `<a href="#/painel" class="inline-flex items-center gap-1.5 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">rocket_launch</span> Publicar a loja</a>`}
            <a href="#/painel/produtos" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">inventory_2</span> Gerir produtos</a>
          </div>
        </section>
        ${fonte}`));
      bindShell();
      return;
    }

    render(shell(`${cabecalho}
      <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        ${statCard(0, "group", "Visitas (7 dias)", last7, deltaPill(last7, prev7), `${prev7} nos 7 dias anteriores`)}
        ${statCard(1, "calendar_month", "Visitas (30 dias)", a.visits30, "", `Média de ${esc(String(mediaDia).replace(".", ","))} por dia`)}
        ${statCard(2, "visibility", "Produtos vistos (7 dias)", a.views7, "", `${a.views30} nos últimos 30 dias`)}
        ${statCard(3, "inventory_2", "Produtos", products.length, "", `${disponiveis} disponível(eis) na loja`)}
      </section>
      ${chartCard}
      ${topCard}
      ${fonte}`));
    bindShell();
    bindAnalises();

    /** Contagem crescente dos números e dica do gráfico. */
    function bindAnalises(): void {
      const app = document.getElementById("app");
      if (!app) return;
      fadeInImages(app);

      if (!reduceMotion) {
        app.querySelectorAll<HTMLElement>("[data-count-to]").forEach((el) => {
          const alvo = Number(el.dataset.countTo ?? "0");
          if (!Number.isFinite(alvo) || alvo <= 0) { el.textContent = String(alvo || 0); return; }
          const inicio = performance.now();
          const passo = (agora: number): void => {
            const p = Math.min(1, (agora - inicio) / 750);
            el.textContent = String(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(passo);
          };
          requestAnimationFrame(passo);
        });
      }

      const plot = document.getElementById("ana-plot");
      const tip = document.getElementById("ana-tip");
      if (!plot || !tip) return;
      const esconder = (): void => { tip.style.opacity = "0"; tip.style.visibility = "hidden"; };
      const realce = (i: number): void => {
        plot.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot) => {
          dot.style.transform = dot.dataset.dot === String(i) ? "translate(-50%,50%) scale(1.7)" : "translate(-50%,50%)";
        });
      };
      plot.querySelectorAll<HTMLElement>("[data-day]").forEach((col) => {
        const mostrar = (): void => {
          const i = Number(col.dataset.day);
          const d = a.daily[i];
          if (!d) return;
          tip.innerHTML = `<span class="block text-[10px] font-semibold text-white/60 whitespace-nowrap">${esc(dayLong(d.date))}</span>
            <span class="block text-sm font-black whitespace-nowrap">${d.visits} visita(s)</span>`;
          tip.style.left = `${xOf(i).toFixed(2)}%`;
          tip.style.bottom = `calc(${(100 - yOf(d.visits)).toFixed(2)}% + 16px)`;
          tip.style.visibility = "visible";
          tip.style.opacity = "1";
          realce(i);
        };
        col.addEventListener("pointerenter", mostrar);
        col.addEventListener("focus", mostrar);
        col.addEventListener("click", mostrar);
        col.addEventListener("blur", esconder);
      });
      plot.addEventListener("pointerleave", () => { esconder(); realce(-1); });
    }
  }

  async function renderPagamentos(): Promise<void> {
    showSectionLoading();
    const [cfg, customLoaded] = await Promise.all([
      getPaymentConfig(store!.id),
      getCustomization(store!.id),
    ]);
    let custom = customLoaded;

    // Auto-reparação do espelho público de pagamentos.
    //
    // `store_payments` é a fonte de verdade (é o que `api/payment.js` consulta),
    // mas não tem leitura pública, por isso o storefront decide a partir do
    // espelho `customization.payments.onlineEnabled`. Uma loja pode ter ficado
    // com o espelho divergente — herdado de uma loja-modelo, ou escrito quando a
    // gravação da verdade falhou. Quando o Dono abre este separador temos as duas
    // leituras em mão: se divergirem, corrigimos o espelho a partir da verdade,
    // uma só escrita e em silêncio. Sem divergência não se escreve nada.
    if ((custom.payments?.onlineEnabled === true) !== cfg.onlineEnabled) {
      const repaired = { ...custom, payments: { ...(custom.payments ?? {}), onlineEnabled: cfg.onlineEnabled } };
      const okRepair = await saveCustomization(ownerId, store!.id, repaired);
      if (okRepair) custom = repaired;
      // A correção é invisível para o Dono: uma falha aqui não é erro dele.
      else console.error("renderPagamentos: espelho de pagamentos divergente não corrigido");
    }

    const waPhone = custom.whatsapp?.phone || resolveWaPhone(custom);
    const online = billing.accessActive;

    const field = (id: string, label: string, value: string, ph: string, type = "text"): string => `
      <label class="block">
        <span class="text-sm font-semibold text-gray-700">${esc(label)}</span>
        <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}"
          class="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#F95901]" />
      </label>`;

    const whatsappCard = `
      <div class="bg-white border border-gray-200 rounded-2xl p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 text-green-600"><span class="material-symbols-outlined">chat</span></div>
          <div><h3 class="font-black text-gray-900">WhatsApp</h3><p class="text-sm text-gray-500">Incluído na subscrição.</p></div>
        </div>
        ${field("wa-phone", "Número de WhatsApp", waPhone, "+244 9XX XXX XXX")}
        <button id="save-wa" class="mt-4 w-full text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>
      </div>`;

    const infoCard = `
      <div class="rounded-2xl p-6" style="background:${ACCENT_TINT}">
        <h3 class="font-black flex items-center gap-1.5" style="color:${ACCENT}"><span class="material-symbols-outlined text-[20px]">bolt</span> Como recebe</h3>
        <ul class="mt-3 space-y-2.5 text-sm text-gray-700">
          <li class="flex gap-2"><span class="material-symbols-outlined text-[18px] shrink-0" style="color:${ACCENT}">check_circle</span> O cliente paga por Multicaixa Express, Referência ou WhatsApp.</li>
          <li class="flex gap-2"><span class="material-symbols-outlined text-[18px] shrink-0" style="color:${ACCENT}">check_circle</span> O valor (menos a taxa de 2%) é transferido automaticamente para a sua conta bancária a cada venda.</li>
          <li class="flex gap-2"><span class="material-symbols-outlined text-[18px] shrink-0" style="color:${ACCENT}">check_circle</span> A fatura é gerada automaticamente.</li>
        </ul>
      </div>`;

    const onlineCard = online ? `
      <div class="bg-white border border-gray-200 rounded-2xl p-6">
        <div class="flex items-center justify-between gap-3 mb-1">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">credit_card</span></div>
            <div><h3 class="font-black text-gray-900">Pagamentos online</h3><p class="text-sm text-gray-500">Multicaixa Express e Referência Bancária.</p></div>
          </div>
          <label class="inline-flex items-center cursor-pointer select-none shrink-0">
            <input id="online-toggle" type="checkbox" ${cfg.onlineEnabled ? "checked" : ""} class="peer sr-only" />
            <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
          </label>
        </div>
        <div class="mt-6">
          <h4 class="text-sm font-black text-gray-900 mb-1 flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">account_balance</span> Conta bancária (Angola)</h4>
          <p class="text-xs text-gray-500 mb-4">Onde recebe o valor das vendas. Tem de estar verificada na MoMenu.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${field("bank-name", "Nome do banco", cfg.bankName, "ex.: BAI, BFA, BIC")}
            ${field("bank-benef", "Nome do beneficiário", cfg.beneficiaryName, "titular da conta")}
          </div>
          <div class="mt-4">${field("bank-iban", "IBAN", cfg.iban, "AO06 0000 0000 0000 0000 0000 0")}</div>
        </div>
        <button id="save-online" class="mt-6 w-full sm:w-auto text-white px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar pagamentos online</button>
      </div>`
      : `
      <div class="bg-white border border-gray-200 rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined" style="font-size:42px;color:${ACCENT}">lock</span>
        <h3 class="font-black text-gray-900 mt-2">Pagamentos online</h3>
        <p class="text-sm text-gray-500 max-w-md mx-auto mt-1">Multicaixa Express e Referência Bancária fazem parte da subscrição. Ative-a para os usar.</p>
        <a href="#/painel/plano" class="inline-flex items-center gap-1.5 mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-bold" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> Ativar subscrição</a>
      </div>`;

    const statusBanner = online && cfg.onlineEnabled
      ? `<div class="rounded-2xl px-5 py-4 flex items-center gap-3 text-sm font-semibold mb-6" style="background:#ecfdf5;color:#047857"><span class="material-symbols-outlined">check_circle</span> Pagamentos online ativos. Os clientes podem pagar por Multicaixa Express e Referência no checkout.</div>`
      : "";

    render(shell(`
      <section>
        ${statusBanner}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div class="lg:col-span-2 space-y-6">${onlineCard}</div>
          <div class="space-y-6">${online ? infoCard : ""}${whatsappCard}</div>
        </div>
      </section>`));
    bindShell();

    $("#save-wa")?.addEventListener("click", async () => {
      const phone = ($("#wa-phone") as HTMLInputElement)?.value.trim() ?? "";
      const next = { ...custom, whatsapp: { ...(custom.whatsapp ?? {}), phone } };
      const okSave = await withBusy(() => saveCustomization(ownerId, store!.id, next), "A guardar…");
      okSave ? toast("Número de WhatsApp guardado.") : toast("Não foi possível guardar.", "error");
    });

    $("#save-online")?.addEventListener("click", async () => {
      const enabled = ($("#online-toggle") as HTMLInputElement)?.checked ?? false;
      const next: PaymentConfig = {
        onlineEnabled: enabled,
        bankName: ($("#bank-name") as HTMLInputElement)?.value.trim() ?? "",
        beneficiaryName: ($("#bank-benef") as HTMLInputElement)?.value.trim() ?? "",
        iban: ($("#bank-iban") as HTMLInputElement)?.value.trim() ?? "",
      };
      if (enabled && !next.iban) { toast("Indique o IBAN da conta bancária para ativar.", "error"); return; }
      const okSave = await withBusy(() => savePaymentConfig(store!.id, next), "A guardar…");
      // A fonte de verdade primeiro. Se falhar, o espelho não é tocado: escrevê-lo
      // mesmo assim anunciaria os métodos online no checkout com `store_payments`
      // a dizer o contrário, e o servidor recusaria a compra.
      if (!okSave) { toast("Não foi possível guardar.", "error"); return; }
      // Espelha o flag público (não sensível) na customização, para o storefront.
      const mirrored = { ...custom, payments: { ...(custom.payments ?? {}), onlineEnabled: enabled } };
      await saveCustomization(ownerId, store!.id, mirrored);
      toast("Pagamentos online guardados.");
      await renderPagamentos();
    });
  }

  async function renderLogotipo(): Promise<void> {
    showSectionLoading();
    const custom = await getCustomization(store!.id);
    const logos = Array.isArray(custom.logos) ? custom.logos : [];
    // Fundo axadrezado para evidenciar a transparência do PNG.
    const checker = "background-image:linear-gradient(45deg,#eef1f4 25%,transparent 25%),linear-gradient(-45deg,#eef1f4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f4 75%),linear-gradient(-45deg,transparent 75%,#eef1f4 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;background-color:#fff;";

    render(shell(`
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <h3 class="text-2xl md:text-3xl font-black tracking-tight">Criar logótipo</h3>
        ${betaBadge(LOGO_GENERATOR_VERSION)}
      </div>
      <p class="text-gray-500 mb-5 max-w-2xl">Descreva o seu negócio e a IA cria <strong>${LOGO_PROPOSALS} variações</strong> de logótipo em PNG com fundo transparente. Escolha a que preferir — fica guardada em "Meus logótipos".</p>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8 items-start">
        <section class="lg:col-span-3 bg-white border border-gray-200 rounded-3xl p-5 md:p-6">
          <div class="relative">
            <textarea id="logo-desc" rows="4" maxlength="600" placeholder="Ex.: Loja de doces artesanais chamada 'Doce Mel', tons de rosa e dourado, com um símbolo delicado." class="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pb-7 text-sm outline-none focus:border-[#F95901] focus:bg-white transition-colors resize-none"></textarea>
            <span id="logo-count" class="absolute right-3 bottom-2.5 text-[11px] text-gray-400 pointer-events-none">0 / 600</span>
          </div>
          <div class="flex flex-col sm:flex-row gap-2.5 mt-3">
            <button id="logo-improve" class="sm:flex-1 px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 border transition-colors hover:bg-gray-50" style="border-color:${ACCENT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">auto_fix_high</span> Melhorar com IA</button>
            <button id="logo-gen" class="sm:flex-1 text-white px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">auto_awesome</span> Gerar ${LOGO_PROPOSALS} variações</button>
          </div>
        </section>

        <aside class="lg:col-span-2 bg-white border border-gray-200 rounded-3xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">tips_and_updates</span></span>
            <h4 class="font-black text-gray-900">Dicas para um bom logótipo</h4>
          </div>
          <ul class="space-y-3 text-sm text-gray-600">
            <li class="flex gap-2.5"><span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5" style="color:${ACCENT}">check_circle</span><span>Indique o <strong>nome</strong> da marca (curto sai melhor).</span></li>
            <li class="flex gap-2.5"><span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5" style="color:${ACCENT}">check_circle</span><span>Diga <strong>o que vende</strong> ou o setor do negócio.</span></li>
            <li class="flex gap-2.5"><span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5" style="color:${ACCENT}">check_circle</span><span>Escolha <strong>1 a 2 cores</strong> e um estilo (moderno, elegante…).</span></li>
            <li class="flex gap-2.5"><span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5" style="color:${ACCENT}">check_circle</span><span>Sem ideias? Escreva o essencial e use <strong>Melhorar com IA</strong>.</span></li>
          </ul>
        </aside>
      </div>

      <section id="logo-results-wrap" class="mb-8 hidden">
        <div class="flex items-center gap-2 mb-4">
          <span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span></span>
          <h4 class="font-black text-gray-900">Variações geradas</h4>
        </div>
        <div id="logo-results"></div>
      </section>

      <section class="mb-4">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">collections_bookmark</span></span>
            <h4 class="font-black text-gray-900">Meus logótipos</h4>
          </div>
          <span class="text-sm text-gray-400">${logos.length} guardado(s)</span>
        </div>
        <div id="my-logos">
          ${logos.length
            ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                 ${logos.map((url, i) => `
                   <div class="group relative rounded-2xl border border-gray-200 overflow-hidden bg-white transition-shadow hover:shadow-md">
                     <div class="aspect-square flex items-center justify-center p-4" style="${checker}">
                       <img src="${esc(url)}" alt="Logótipo ${i + 1}" class="max-w-full max-h-full object-contain" />
                     </div>
                     <div class="flex border-t border-gray-100">
                       <a href="${esc(url)}" download="logotipo-${i + 1}.png" target="_blank" rel="noopener" class="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[16px]">download</span> Descarregar</a>
                       <button data-logo-remove="${i}" class="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 border-l border-gray-100 transition-colors"><span class="material-symbols-outlined text-[16px]">delete</span> Remover</button>
                     </div>
                   </div>`).join("")}
               </div>`
            : `<div class="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                 <span class="material-symbols-outlined text-gray-300" style="font-size:40px">image</span>
                 <p class="text-gray-400 text-sm mt-2">Ainda não guardou nenhum logótipo.<br/>Gere e escolha uma variação acima.</p>
               </div>`}
        </div>
      </section>`));
    bindShell();

    const descEl = $("#logo-desc") as HTMLTextAreaElement | null;
    const resultsEl = $("#logo-results");
    const resultsWrap = $("#logo-results-wrap");
    const countEl = $("#logo-count");

    /**
     * Descrição do último pedido submetido. É esta — e não o que estiver no
     * campo no momento — que o «Tentar de novo» repete (R2.8).
     */
    let lastDescription = "";
    /**
     * Estado de progresso: enquanto está a `true` a secção mostra os esqueletos
     * e qualquer submissão adicional é rejeitada (R2.7).
     */
    let generating = false;

    // Contador de caracteres.
    const updateCount = (): void => { if (countEl && descEl) countEl.textContent = `${descEl.value.length} / 600`; };
    descEl?.addEventListener("input", updateCount);
    updateCount();

    // Melhorar/estruturar a descrição com IA.
    $("#logo-improve")?.addEventListener("click", async () => {
      if (generating) { toast("Aguarde: as propostas de logótipo estão a ser criadas.", "error"); return; }
      const desc = (descEl?.value ?? "").trim();
      if (desc.length < 4) { toast("Escreva primeiro a sua ideia, mesmo que simples.", "error"); descEl?.focus(); return; }
      await withButton($("#logo-improve") as HTMLButtonElement, async () => {
        const improved = await improveLogoDescription(desc);
        if (!improved) { toast("Não foi possível melhorar o texto agora. Tenta de novo.", "error"); return; }
        if (descEl) { descEl.value = improved.slice(0, 600); updateCount(); }
        toast("Descrição melhorada pela IA.");
      }, "A melhorar…");
    });

    // Estado "a gerar": esqueletos animados no lugar das variações.
    function showGenerating(): void {
      if (!resultsWrap || !resultsEl) return;
      resultsWrap.classList.remove("hidden");
      resultsEl.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          ${Array.from({ length: LOGO_PROPOSALS }, () => `
            <div class="rounded-2xl border border-gray-200 overflow-hidden">
              <div class="aspect-square bg-gray-100 animate-pulse flex items-center justify-center">
                <span class="material-symbols-outlined text-gray-300 animate-spin" style="font-size:26px">progress_activity</span>
              </div>
              <div class="h-9 bg-gray-100 animate-pulse border-t border-gray-100"></div>
            </div>`).join("")}
        </div>
        <p class="text-sm text-gray-400 mt-4">A criar ${LOGO_PROPOSALS} variações… isto pode demorar alguns segundos. Aguarde sem sair desta página.</p>`;
      resultsWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    /**
     * Desenha uma marca de água (grelha + texto diagonal) por cima da imagem
     * num canvas e devolve o PNG resultante. Assim, qualquer cópia feita a
     * partir da pré-visualização (screenshot, arrastar, botão direito) leva a
     * marca de água. A versão limpa só é usada ao "Escolher esta".
     */
    function watermark(src: string): Promise<string> {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const size = 420;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(src); return; }
          ctx.drawImage(img, 0, 0, size, size);
          // Grelha subtil.
          ctx.strokeStyle = "rgba(120,120,120,0.30)";
          ctx.lineWidth = 1;
          const step = 30;
          for (let x = step; x < size; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
          for (let y = step; y < size; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
          // Texto diagonal repetido.
          ctx.save();
          ctx.translate(size / 2, size / 2);
          ctx.rotate(-Math.PI / 6);
          ctx.font = "bold 20px Inter, Arial, sans-serif";
          ctx.fillStyle = "rgba(249,89,1,0.38)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (let i = -3; i <= 3; i++) ctx.fillText("MôBisno · pré-visualização", 0, i * 52);
          ctx.restore();
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(src);
        img.src = src;
      });
    }

    /**
     * Desenha as propostas recebidas. `missing` é quantas das `LOGO_PROPOSALS`
     * pedidas não chegaram: quando é maior que zero, mostra-se o que chegou e
     * diz-se ao Dono quantas ficaram em falta (R2.3).
     *
     * As direções são RECEITAS, não imagens: o PNG de cada proposta nasce aqui,
     * em `composeLogo`, com o nome da marca desenhado por nós. O ficheiro que o
     * Dono guarda é composto de novo em `FINAL_SIZE` no momento da escolha —
     * mesmo desenho, mais resolução.
     */
    async function renderVariations(directions: LogoDirection[], brandName: string, missing: number): Promise<void> {
      if (!resultsWrap || !resultsEl) return;
      resultsWrap.classList.remove("hidden");
      const clean = await Promise.all(directions.map((d) => composeLogo(brandName, d, PREVIEW_SIZE)));
      // Gera as versões com marca de água para pré-visualização.
      const display = await Promise.all(clean.map((u) => watermark(u)));
      const guard = 'oncontextmenu="return false" draggable="false" style="max-width:100%;max-height:100%;object-fit:contain;-webkit-user-drag:none;user-select:none"';
      const faltam = missing > 0
        ? `<div class="rounded-2xl border p-4 mb-4 flex items-start gap-3" style="border-color:${ACCENT_TINT};background:${ACCENT_TINT}">
             <span class="material-symbols-outlined shrink-0" style="color:${ACCENT}">info</span>
             <div class="min-w-0">
               <p class="text-sm font-bold text-gray-900 mb-0.5">${clean.length} de ${LOGO_PROPOSALS} propostas</p>
               <p class="text-sm text-gray-600">${missing === 1 ? "Uma proposta ficou em falta" : `${missing} propostas ficaram em falta`}. Pode escolher uma das que chegaram ou tentar de novo para ver outras.</p>
               <button id="logo-retry" class="mt-2.5 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 border bg-white transition-colors hover:bg-gray-50" style="border-color:${ACCENT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">refresh</span> Tentar de novo</button>
             </div>
           </div>`
        : "";
      resultsEl.innerHTML = `
        ${faltam}
        <p class="text-sm text-gray-500 mb-4">Clique em <strong>Escolher</strong> na variação que prefere para a guardar. As pré-visualizações têm marca de água — só a versão escolhida é guardada limpa.</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          ${display.map((src, i) => `
            <div class="rounded-2xl border border-gray-200 overflow-hidden bg-white transition-shadow hover:shadow-md">
              <div class="aspect-square flex items-center justify-center p-3" style="${checker}">
                <img src="${src}" alt="${esc(directions[i]?.label ?? `Variação ${i + 1}`)}" ${guard} />
              </div>
              <button data-logo-pick="${i}" class="w-full py-2.5 text-sm font-bold text-white inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">check_circle</span> Escolher</button>
            </div>`).join("")}
        </div>`;
      resultsEl.querySelectorAll<HTMLButtonElement>("[data-logo-pick]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.logoPick);
          const chosen = directions[idx];
          if (!chosen) return;
          await withButton(btn, async () => {
            // Composto de novo em alta resolução: mesmo desenho, sem marca de
            // água e com o acabamento que o cartão de pré-visualização não tem.
            const src = await composeLogo(brandName, chosen, FINAL_SIZE);
            if (!src) { toast("Não foi possível preparar o ficheiro do logótipo.", "error"); return; }
            const content = dataUrlToUint8Array(src);
            const validation = panel.services.fileService.validate({ content, fileName: "logotipo.png" }, LOGO_POLICY);
            if (!validation.ok) { toast(validation.error.message, "error"); return; }
            const stored = await panel.services.fileService.store(store!.id, "logo", validation.value);
            const fresh = await getCustomization(store!.id);
            const next = { ...fresh, logos: [...(Array.isArray(fresh.logos) ? fresh.logos : []), stored.url] };
            const okSave = await saveCustomization(ownerId, store!.id, next);
            if (okSave) { toast("Logótipo guardado em \"Meus logótipos\"."); await renderLogotipo(); }
            else toast("Não foi possível guardar o logótipo.", "error");
          }, "A guardar…");
        });
      });
      bindRetry();
    }

    /**
     * Aviso de falha dentro da secção de resultados, sempre com a ação «Tentar
     * de novo» (R2.8). `detail` é texto do servidor a mostrar ao Dono (R2.4);
     * `tech` é diagnóstico técnico e vai em letra pequena, para não se confundir
     * com a explicação.
     */
    function renderFailure(f: { icon: string; title: string; message: string; detail?: string; tech?: string }): void {
      if (!resultsWrap || !resultsEl) return;
      resultsWrap.classList.remove("hidden");
      resultsEl.innerHTML = `
        <div class="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 text-center">
          <span class="w-12 h-12 rounded-full mx-auto flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">${f.icon}</span></span>
          <p class="font-black text-gray-900 mt-3 break-words">${esc(f.title)}</p>
          <p class="text-sm text-gray-600 mt-1.5 max-w-xl mx-auto break-words">${esc(f.message)}</p>
          ${f.detail ? `<p class="text-sm text-gray-500 mt-2 max-w-xl mx-auto break-words">${esc(f.detail)}</p>` : ""}
          ${f.tech ? `<p class="text-[11px] text-gray-400 mt-3 max-w-xl mx-auto break-words">Detalhe técnico: ${esc(f.tech)}</p>` : ""}
          <button id="logo-retry" class="mt-4 px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 text-white transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">refresh</span> Tentar de novo</button>
        </div>`;
      bindRetry();
    }

    /** Liga o «Tentar de novo» que repete o pedido com a mesma descrição (R2.8). */
    function bindRetry(): void {
      const btn = $("#logo-retry") as HTMLButtonElement | null;
      btn?.addEventListener("click", () => { void generate(lastDescription, btn); });
    }

    /**
     * Pede as propostas e trata as três variantes de `LogoResult` (decisão D3).
     * Enquanto espera, a secção fica em estado de progresso e novas submissões
     * são rejeitadas (R2.7).
     */
    async function generate(desc: string, btn: HTMLButtonElement | null): Promise<void> {
      if (generating) { toast("Já estamos a criar as propostas. Aguarde um momento.", "error"); return; }
      if (desc.length < 6) { toast("Escreva uma descrição do logótipo primeiro.", "error"); descEl?.focus(); return; }
      generating = true;
      lastDescription = desc;
      showGenerating();
      try {
        await withButton(btn, async () => {
          const result = await generateLogos(desc);

          if (result.kind === "network-error") {
            // Falha de comunicação: não sabemos se havia propostas (R2.5).
            renderFailure({
              icon: "wifi_off",
              title: "Não conseguimos falar com o servidor",
              message: "O pedido não chegou ao servidor, por isso não sabemos se havia propostas. Verifique a ligação à internet e tente de novo.",
              tech: result.message,
            });
            toast("Sem ligação ao servidor de logótipos. Verifique a internet.", "error");
            return;
          }

          if (result.kind === "server-error") {
            // O motivo é o que o servidor manda; o texto genérico só entra
            // quando a resposta não trouxe motivo legível (R2.4).
            const message = result.error || `O servidor recusou o pedido (código ${result.status}). Tente de novo dentro de instantes.`;
            renderFailure({
              icon: "report",
              title: "O servidor não criou os logótipos",
              message,
              ...(result.detail ? { detail: result.detail } : {}),
            });
            toast(result.error || "Não foi possível criar os logótipos agora.", "error");
            return;
          }

          if (!result.directions.length) {
            // Respondeu sem propostas: é aviso, não falha de comunicação.
            renderFailure({
              icon: "image_not_supported",
              title: "O servidor respondeu sem propostas",
              message: `Não veio nenhuma das ${LOGO_PROPOSALS} propostas pedidas. Tente de novo, ou acrescente detalhes à descrição (nome, setor, cores e estilo).`,
            });
            toast("Nenhuma proposta foi devolvida. Tente de novo.", "error");
            return;
          }

          await renderVariations(result.directions, result.brief.brandName, result.missing);
          if (result.missing > 0) {
            toast(`Chegaram ${result.directions.length} de ${LOGO_PROPOSALS} propostas.`);
          }
        }, "A gerar…");
      } finally {
        generating = false;
      }
    }

    $("#logo-gen")?.addEventListener("click", () => {
      void generate((descEl?.value ?? "").trim(), $("#logo-gen") as HTMLButtonElement | null);
    });

    $("#my-logos")?.querySelectorAll<HTMLButtonElement>("[data-logo-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.logoRemove);
        if (!confirm("Remover este logótipo dos guardados?")) return;
        const fresh = await getCustomization(store!.id);
        const arr = Array.isArray(fresh.logos) ? [...fresh.logos] : [];
        arr.splice(idx, 1);
        const okSave = await saveCustomization(ownerId, store!.id, { ...fresh, logos: arr });
        if (okSave) { toast("Logótipo removido."); await renderLogotipo(); }
        else toast("Não foi possível remover.", "error");
      });
    });
  }

  async function renderConfig(): Promise<void> {
    showSectionLoading();
    // Quatro consultas independentes: eram quatro esperas em fila.
    const [c, smsCredits, discounts, reviews] = await Promise.all([
      getCustomization(store!.id),
      getSmsCredits(store!.id),
      listDiscounts(store!.id),
      listStoreReviews(store!.id),
    ]);
    const canDomain = billing.accessActive;
    const productNames = new Map((await productRepository.listByStore(store!.id)).map((p) => [p.id, p.name]));
    const fees = c.delivery?.fees ?? {};
    const inp = "w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#F95901]";

    const toggle = (id: string, on: boolean, label: string): string => `
      <label class="flex items-center justify-between gap-3 cursor-pointer select-none">
        <span class="text-sm font-semibold text-gray-700">${esc(label)}</span>
        <span class="relative inline-flex items-center">
          <input id="${id}" type="checkbox" ${on ? "checked" : ""} class="peer sr-only" />
          <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
        </span>
      </label>`;

    const dmodeInit = c.delivery?.mode ?? (c.delivery?.flatFee != null ? "single" : "perArea");
    const deliveryBody = `
      <p class="text-sm text-gray-500 mb-4">Defina como cobra a entrega (Província: <b>Luanda</b>). A taxa é somada ao total no checkout.</p>
      <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm mb-5">
        <button type="button" data-dmode="single" class="px-4 py-2 rounded-lg font-semibold transition-colors">Valor único</button>
        <button type="button" data-dmode="perArea" class="px-4 py-2 rounded-lg font-semibold transition-colors">Por área</button>
      </div>
      <div id="del-single" class="${dmodeInit === "single" ? "" : "hidden"}">
        <label class="block max-w-xs"><span class="text-sm font-semibold text-gray-700">Taxa de entrega (todas as áreas)</span>
          <input id="del-flat" type="number" min="0" value="${c.delivery?.flatFee ?? ""}" placeholder="ex.: 2000" class="${inp} mt-1.5" /></label>
        <p class="text-xs text-gray-400 mt-2">O cliente continua a escolher a área (para a morada), mas a taxa é igual para todas.</p>
      </div>
      <div id="del-perarea" class="${dmodeInit === "perArea" ? "" : "hidden"}">
        <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Áreas e taxas</p>
        <p class="text-xs text-gray-400 mb-3">Ative só as áreas onde entrega. As desativadas não aparecem ao cliente.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${LUANDA_AREAS.map((a) => areaRowHtml(a, typeof fees[a] === "number" ? fees[a] : null)).join("")}
        </div>
      </div>
      <label class="block mt-5 max-w-xs"><span class="text-sm font-semibold text-gray-700">Entrega grátis acima de (Kz) — opcional</span>
        <input id="del-free" type="number" min="0" value="${c.delivery?.freeAbove ?? ""}" placeholder="ex.: 20000" class="${inp} mt-1.5" />
        <span class="block text-xs text-gray-400 mt-1">Em pedidos com subtotal igual ou acima deste valor, a entrega fica grátis.</span></label>
      <button id="save-delivery" class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar entregas</button>`;

    const smsSoon = COMING_SOON.sms;
    const smsBody = `
      ${smsSoon ? comingSoonNotice("O SMS de confirmação fica disponível em breve. Até lá não é possível comprar créditos nem ativar o envio, e o saldo que já tenha fica guardado.") : ""}
      <p class="text-sm text-gray-500 mb-3">Quando ativo, o seu cliente recebe um <b>SMS de confirmação</b> assim que a compra é concluída, com o resumo da encomenda. Isto transmite confiança, reduz dúvidas e diminui as desistências — o cliente sente que está a comprar numa loja séria.</p>
      <div class="rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" style="background:#fafafa">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Saldo de mensagens</p>
          <p class="text-2xl font-black text-gray-900 flex items-center gap-2"><span class="material-symbols-outlined" style="color:${ACCENT}">sms</span> ${smsCredits} SMS</p>
        </div>
        <p class="text-xs text-gray-500 max-w-[14rem]">${smsSoon
          ? "O seu saldo mantém-se intacto. A funcionalidade fica disponível em breve e só então começa a ser usado."
          : `Cada SMS custa <b style="color:${ACCENT}">${esc(formatKz(SMS_UNIT_PRICE))}</b>. Compre um pacote para ter saldo.`}</p>
      </div>
      <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Comprar pacote</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5 ${smsSoon ? "opacity-60" : ""}">
        ${SMS_PACKAGES.map((n) => `
          <button type="button" data-sms-pack="${n}" ${smsSoon ? `disabled aria-disabled="true" title="Em breve"` : ""} class="rounded-xl border-2 border-gray-200 ${smsSoon ? "cursor-not-allowed" : "hover:border-[#F95901]"} p-3 text-center transition-colors">
            <span class="block text-xl font-black text-gray-900">${n}</span>
            <span class="block text-[11px] text-gray-400 mb-1">mensagens</span>
            <span class="block text-xs font-bold" style="color:${ACCENT}">${esc(formatKz(n * SMS_UNIT_PRICE))}</span>
          </button>`).join("")}
      </div>
      <div class="mb-2 ${smsSoon ? "opacity-60" : ""}">${toggle("sms-enabled", !!c.sms?.enabled, "Enviar SMS de confirmação ao cliente")}</div>
      <p class="text-xs text-gray-400">O número usado é o que o cliente indica no checkout. O envio consome 1 SMS do saldo.</p>
      <button id="save-sms" ${smsSoon ? `disabled aria-disabled="true" title="Em breve"` : ""} class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity ${smsSoon ? "opacity-60 cursor-not-allowed" : "hover:opacity-95"}" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>`;

    const discountBody = `
      <p class="text-sm text-gray-500 mb-4">Crie códigos que os seus clientes inserem no checkout para ganhar desconto. Pode escolher uma <b>percentagem</b> ou um <b>valor fixo</b>, e acompanhar quantas vezes cada código foi usado.</p>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto] gap-2.5 items-end mb-4">
        <label class="block"><span class="text-xs font-semibold text-gray-600">Código</span>
          <input id="dc-code" type="text" placeholder="ex.: BEMVINDO10" class="${inp} mt-1 uppercase" /></label>
        <label class="block"><span class="text-xs font-semibold text-gray-600">Tipo</span>
          <select id="dc-type" class="${inp} mt-1"><option value="percent">Percentagem (%)</option><option value="fixed">Valor fixo (Kz)</option></select></label>
        <label class="block"><span class="text-xs font-semibold text-gray-600">Valor</span>
          <input id="dc-value" type="number" min="1" placeholder="ex.: 10" class="${inp} mt-1" /></label>
        <button id="dc-add" class="text-white px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1 transition-opacity hover:opacity-95 h-[42px]" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add</span> Criar</button>
      </div>
      <div id="dc-list">${discountListHtml(discounts)}</div>`;

    const marketingBody = `
      <p class="text-sm text-gray-500 mb-4">Ligue os pixels de marketing para medir visitas e otimizar os seus anúncios no <b>Facebook/Instagram</b> e <b>Google</b>. Os eventos de visita, visualização de produto, adição ao carrinho e compra são enviados automaticamente.</p>
      <label class="block mb-3"><span class="text-sm font-semibold text-gray-700">Meta Pixel ID (Facebook/Instagram)</span>
        <input id="mk-meta" type="text" value="${esc(c.marketing?.metaPixelId ?? "")}" placeholder="ex.: 1234567890123456" class="${inp} mt-1.5" /></label>
      <label class="block"><span class="text-sm font-semibold text-gray-700">Google Analytics 4 (Measurement ID)</span>
        <input id="mk-ga" type="text" value="${esc(c.marketing?.gaId ?? "")}" placeholder="ex.: G-XXXXXXXXXX" class="${inp} mt-1.5" /></label>
      <button id="save-marketing" class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar pixels</button>`;

    const reviewsBody = `
      <p class="text-sm text-gray-500 mb-4">As avaliações dos seus clientes aparecem na página de cada produto. Pode esconder ou apagar avaliações.</p>
      <div id="rv-list">${reviewsModerationHtml(reviews, productNames)}</div>`;

    const domainSoon = COMING_SOON.customDomain;
    const domainBody = canDomain ? `
      ${domainSoon ? comingSoonNotice("O domínio próprio fica disponível em breve. Até lá não é possível guardar um domínio para esta loja.") : ""}
      <p class="text-sm text-gray-500 mb-4">Ligue um domínio que já tenha (ex.: <b>www.minhaloja.co.ao</b>) à sua loja.</p>
      <label class="block"><span class="text-sm font-semibold text-gray-700">O seu domínio</span>
        <input id="domain" type="text" value="${esc(c.customDomain ?? "")}" placeholder="www.minhaloja.co.ao" ${domainSoon ? "disabled" : ""} class="${inp} mt-1.5 ${domainSoon ? "opacity-60 cursor-not-allowed" : ""}" /></label>
      <div class="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600">
        <p class="font-semibold text-gray-800 mb-1 flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ACCENT}">dns</span> Como ligar</p>
        No painel do seu domínio, crie um registo <b>CNAME</b> a apontar para <code class="px-1.5 py-0.5 rounded bg-white border border-gray-200">cname.vercel-dns.com</code>. Depois de guardar aqui, a ligação fica ativa em minutos.
      </div>
      <button id="save-domain" ${domainSoon ? `disabled aria-disabled="true" title="Em breve"` : ""} class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity ${domainSoon ? "opacity-60 cursor-not-allowed" : "hover:opacity-95"}" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar domínio</button>`
      : `
      ${domainSoon ? comingSoonNotice("O domínio próprio fica disponível em breve.") : ""}
      <p class="text-sm text-gray-500">O domínio próprio faz parte da subscrição.</p>
      <a href="#/painel/plano" class="inline-flex items-center gap-1.5 mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-bold" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> Ativar subscrição</a>`;

    const dangerBody = `
      <p class="text-sm text-gray-600">Apagar a loja remove <b>permanentemente</b> todos os produtos, imagens, banners, personalização e configurações. <b class="text-red-600">Esta ação é irreversível.</b></p>
      <button id="delete-store" class="mt-4 inline-flex items-center gap-2 bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-red-700 transition-colors"><span class="material-symbols-outlined text-[18px]">delete_forever</span> Apagar esta loja</button>`;

    render(shell(`
      <style>details.mb-acc>summary{list-style:none}details.mb-acc>summary::-webkit-details-marker{display:none}details.mb-acc[open] .mb-acc-chev{transform:rotate(180deg)}</style>
      <section class="space-y-4">
        ${settingsAccordion({ icon: "local_shipping", title: "Entregas", desc: "Declare as taxas de entrega da sua loja por zona.", body: deliveryBody })}
        ${settingsAccordion({ icon: "sms", title: "SMS de confirmação", desc: "Ative o SMS de confirmação de compra que o seu cliente recebe.", body: smsBody, comingSoon: smsSoon })}
        ${settingsAccordion({ icon: "sell", title: "Código de desconto", desc: "Crie e gira códigos de desconto para os seus clientes.", body: discountBody })}
        ${settingsAccordion({ icon: "ads_click", title: "Marketing e Pixels", desc: "Meta Pixel e Google Analytics para medir e impulsionar vendas.", body: marketingBody })}
        ${settingsAccordion({ icon: "reviews", title: "Avaliações", desc: "Veja e modere as avaliações dos seus clientes.", body: reviewsBody })}
        ${settingsAccordion({ icon: "language", title: "Domínio", desc: "Ligue o seu próprio domínio à loja.", body: domainBody, lockedPlan: canDomain ? undefined : "Subscrição", comingSoon: domainSoon })}
        ${settingsAccordion({ icon: "warning", title: "Apagar a loja", desc: "Remove a loja para sempre. Ação irreversível.", body: dangerBody, danger: true })}
      </section>`));
    bindShell();

    // Entregas (modo + áreas)
    let dmode: "single" | "perArea" = dmodeInit === "single" ? "single" : "perArea";
    const applyDmode = (): void => {
      document.querySelectorAll<HTMLElement>("[data-dmode]").forEach((b) => {
        const active = b.dataset.dmode === dmode;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
      $("#del-single")?.classList.toggle("hidden", dmode !== "single");
      $("#del-perarea")?.classList.toggle("hidden", dmode !== "perArea");
    };
    applyDmode();
    document.querySelectorAll<HTMLElement>("[data-dmode]").forEach((b) =>
      b.addEventListener("click", () => { dmode = b.dataset.dmode === "single" ? "single" : "perArea"; applyDmode(); }));
    document.querySelectorAll<HTMLElement>(".mb-area").forEach((row) => {
      const on = row.querySelector("[data-a-on]") as HTMLInputElement | null;
      const fee = row.querySelector("[data-a-fee]") as HTMLInputElement | null;
      on?.addEventListener("change", () => { if (!fee) return; fee.disabled = !on.checked; if (on.checked) fee.focus(); });
    });
    $("#save-delivery")?.addEventListener("click", async () => {
      const freeRaw = Number(($("#del-free") as HTMLInputElement)?.value);
      const freeAbove = Number.isFinite(freeRaw) && freeRaw > 0 ? freeRaw : undefined;
      if (dmode === "single") {
        const flat = Math.max(0, Number(($("#del-flat") as HTMLInputElement)?.value) || 0);
        c.delivery = { mode: "single", flatFee: flat, freeAbove };
      } else {
        const feesOut: Record<string, number> = {};
        document.querySelectorAll<HTMLElement>(".mb-area").forEach((row) => {
          const area = row.dataset.area ?? "";
          const on = (row.querySelector("[data-a-on]") as HTMLInputElement | null)?.checked ?? false;
          if (area && on) feesOut[area] = Math.max(0, Number((row.querySelector("[data-a-fee]") as HTMLInputElement | null)?.value) || 0);
        });
        c.delivery = { mode: "perArea", fees: feesOut, freeAbove };
      }
      const ok = await withBusy(() => saveCustomization(ownerId, store!.id, c), "A guardar…");
      ok ? toast("Entregas guardadas.") : toast("Não foi possível guardar.", "error");
    });

    // SMS — funcionalidade «Em breve» (D6): ativar e comprar créditos ficam bloqueados.
    $("#save-sms")?.addEventListener("click", async () => {
      if (COMING_SOON.sms) { toast("O SMS de confirmação fica disponível em breve.", "error"); return; }
      c.sms = { enabled: ($("#sms-enabled") as HTMLInputElement)?.checked ?? false };
      const ok = await withBusy(() => saveCustomization(ownerId, store!.id, c), "A guardar…");
      ok ? toast("Preferência de SMS guardada.") : toast("Não foi possível guardar.", "error");
    });
    document.querySelectorAll<HTMLElement>("[data-sms-pack]").forEach((b) =>
      b.addEventListener("click", () => {
        if (COMING_SOON.sms) { toast("A compra de créditos de SMS fica disponível em breve.", "error"); return; }
        const qty = parseInt(b.dataset.smsPack || "0", 10);
        if (qty > 0) openSmsCheckout({ ownerId, storeId: store!.id, quantity: qty, onPaid: () => { void renderConfig(); } });
      }));

    // Código de desconto
    function redrawDiscounts(items: DiscountCode[]): void {
      const el = $("#dc-list");
      if (el) { el.innerHTML = discountListHtml(items); bindDiscountRows(items); }
    }
    function bindDiscountRows(items: DiscountCode[]): void {
      document.querySelectorAll<HTMLElement>("[data-dc-toggle]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.dcToggle!;
          const it = items.find((x) => x.id === id);
          if (!it) return;
          const ok = await withBusy(() => setDiscountActive(id, !it.active), "A atualizar…");
          if (ok) { it.active = !it.active; redrawDiscounts(items); } else toast("Falhou.", "error");
        }));
      document.querySelectorAll<HTMLElement>("[data-dc-del]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.dcDel!;
          if (!confirm("Apagar este código de desconto?")) return;
          const ok = await withBusy(() => deleteDiscount(id), "A apagar…");
          if (ok) { const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1); redrawDiscounts(items); toast("Código apagado."); }
          else toast("Falhou.", "error");
        }));
    }
    bindDiscountRows(discounts);
    $("#dc-add")?.addEventListener("click", async () => {
      const code = ($("#dc-code") as HTMLInputElement)?.value ?? "";
      const type = (($("#dc-type") as HTMLSelectElement)?.value === "fixed" ? "fixed" : "percent") as "percent" | "fixed";
      const value = Number(($("#dc-value") as HTMLInputElement)?.value);
      const err = await withBusy(() => createDiscount(store!.id, { code, type, value }), "A criar código…");
      if (err) { toast(err, "error"); return; }
      toast("Código criado.");
      const updated = await listDiscounts(store!.id);
      discounts.length = 0; discounts.push(...updated);
      redrawDiscounts(discounts);
      ($("#dc-code") as HTMLInputElement).value = "";
      ($("#dc-value") as HTMLInputElement).value = "";
    });

    // Avaliações (moderação)
    function bindReviewRows(): void {
      document.querySelectorAll<HTMLElement>("[data-rv-toggle]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.rvToggle!;
          const r = reviews.find((x) => x.id === id);
          if (!r) return;
          const ok = await withBusy(() => setReviewApproved(id, !r.approved), "A atualizar…");
          if (ok) { r.approved = !r.approved; redrawReviews(); } else toast("Falhou.", "error");
        }));
      document.querySelectorAll<HTMLElement>("[data-rv-del]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.rvDel!;
          if (!confirm("Apagar esta avaliação?")) return;
          const ok = await withBusy(() => deleteReview(id), "A apagar…");
          if (ok) { const i = reviews.findIndex((x) => x.id === id); if (i >= 0) reviews.splice(i, 1); redrawReviews(); }
          else toast("Falhou.", "error");
        }));
    }
    function redrawReviews(): void {
      const el = $("#rv-list");
      if (el) { el.innerHTML = reviewsModerationHtml(reviews, productNames); bindReviewRows(); }
    }
    bindReviewRows();

    // Marketing / Pixels
    $("#save-marketing")?.addEventListener("click", async () => {
      const metaPixelId = ($("#mk-meta") as HTMLInputElement)?.value.trim() || undefined;
      const gaId = ($("#mk-ga") as HTMLInputElement)?.value.trim() || undefined;
      c.marketing = { metaPixelId, gaId };
      const ok = await withBusy(() => saveCustomization(ownerId, store!.id, c), "A guardar…");
      ok ? toast("Pixels guardados.") : toast("Não foi possível guardar.", "error");
    });

    // Domínio — funcionalidade «Em breve» (D6): guardar domínio fica bloqueado.
    $("#save-domain")?.addEventListener("click", async () => {
      if (COMING_SOON.customDomain) { toast("O domínio próprio fica disponível em breve.", "error"); return; }
      c.customDomain = ($("#domain") as HTMLInputElement)?.value.trim() || undefined;
      const ok = await withBusy(() => saveCustomization(ownerId, store!.id, c), "A guardar…");
      ok ? toast("Domínio guardado.") : toast("Não foi possível guardar.", "error");
    });

    // Apagar
    $("#delete-store")?.addEventListener("click", async () => {
      const typed = prompt(`Esta ação é permanente. Para confirmar, escreva o nome da loja:\n\n${store!.name}`);
      if (typed === null) return;
      if (typed.trim() !== store!.name.trim()) { toast("Nome não corresponde. Loja não apagada.", "error"); return; }
      const ok = await withBusy(() => deleteStore(ownerId, store!.id), "A apagar loja…");
      if (!ok) { toast("Não foi possível apagar a loja.", "error"); return; }
      toast("Loja apagada.");
      appState.storeId = null;
      void renderDashboard();
    });
  }

  /**
   * Separador «Plano» — a conta é **por Loja publicada**.
   *
   * O ecrã existe para responder a uma pergunta: quanto vou pagar, e porquê. Por
   * isso mostra a lista das Lojas com o interruptor de publicação ao lado e o
   * total a mudar **ao vivo**: despublicar uma Loja aqui é a forma de baixar a
   * mensalidade, e o Dono vê o efeito antes de decidir.
   *
   * Uma conta de administrador não vê nada disto: administra a Plataforma e não
   * paga. Mostrar-lhe uma fatura seria mentira.
   */
  async function renderPlano(): Promise<void> {
    const ativa = billing.accessActive;
    const poupanca = yearlySavingKz();
    /** Lojas do Dono que contam para a fatura (as lojas-modelo já foram filtradas). */
    const publicadas = (): number => stores.filter((s) => s.state === "Publicada").length;

    /** Lista de Lojas com o interruptor de publicação — o que mexe no total. */
    function lojasHtml(): string {
      const linhas = stores.map((s) => {
        const on = s.state === "Publicada";
        return `<div class="flex items-center gap-3 px-4 py-3">
          <span class="material-symbols-outlined text-[20px] shrink-0" style="color:${on ? ACCENT : "#d4d4d8"}">storefront</span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-gray-900 text-sm truncate">${esc(s.name)}</p>
            <p class="text-xs text-gray-400 truncate">${esc(s.identifier)}.${esc(STORE_APEX)}</p>
          </div>
          <span class="text-xs font-bold shrink-0" style="color:${on ? ACCENT : "#9ca3af"}">${on ? esc(formatKz(PRICE_KZ.mensal)) + "/mês" : "não conta"}</span>
          <label class="relative inline-flex items-center shrink-0 cursor-pointer" title="${on ? "Despublicar" : "Publicar"}">
            <input type="checkbox" data-pub-store="${esc(s.id)}" ${on ? "checked" : ""} class="peer sr-only" />
            <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
          </label>
        </div>`;
      }).join("");
      return `<div class="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">${linhas}</div>`;
    }

    /** Cartões dos dois ciclos, com o total já multiplicado pelas Lojas. */
    function cartoesHtml(): string {
      const n = Math.max(1, publicadas());
      return BILLING_PERIODS.map((ciclo) => {
        const anual = ciclo === "anual";
        const total = priceFor(ciclo, n);
        const poupancaTotal = poupanca * n;
        return `<div class="relative rounded-2xl border-2 bg-white p-6 flex flex-col text-left" style="border-color:${anual ? ACCENT : "#e5e7eb"}">
          ${anual && poupancaTotal > 0 ? `<div class="absolute top-0 right-0 text-[11px] font-bold text-white px-3 py-1 rounded-bl-xl" style="background:${ACCENT}">POUPA ${poupancaTotal.toLocaleString("pt-PT")} Kz</div>` : ""}
          <h4 class="text-lg font-black text-gray-900">${esc(PERIOD_LABEL[ciclo])}</h4>
          <div class="flex items-baseline mt-2 mb-1">
            <span class="text-sm font-bold text-gray-900 mr-1">Kz</span>
            <span data-total="${ciclo}" class="text-3xl font-black tracking-tight">${esc(total.toLocaleString("pt-PT"))}</span>
            <span class="text-sm text-gray-500 ml-1">/${anual ? "ano" : "mês"}</span>
          </div>
          <p class="text-sm text-gray-500"><span data-conta="${ciclo}">${n} loja(s) × ${esc(PRICE_KZ[ciclo].toLocaleString("pt-PT"))} Kz</span></p>
          <button data-ciclo="${ciclo}" class="w-full mt-6 text-center font-bold rounded-xl py-3 text-sm transition-opacity ${anual ? "text-white hover:opacity-95" : "bg-gray-100 text-gray-900 hover:bg-gray-200"}" ${anual ? `style="background:${ACCENT}"` : ""}>${ativa ? "Renovar" : "Ativar"} ${esc(PERIOD_LABEL[ciclo].toLowerCase())}</button>
        </div>`;
      }).join("");
    }

    const incluido = `<ul class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">${PLAN_HIGHLIGHTS.map((h) =>
      `<li class="flex items-start gap-2 text-sm text-gray-700"><span class="material-symbols-outlined text-[18px] shrink-0" style="color:${ACCENT}">check_circle</span> ${esc(h)}</li>`).join("")}</ul>`;

    // Administrador: sem fatura e sem limite de Lojas.
    if (billing.byAdmin) {
      render(shell(`
        <section class="mb-6">
          <h3 class="text-2xl font-black tracking-tight">A sua subscrição</h3>
          <p class="text-gray-500 mt-1">Esta conta é de administração da plataforma.</p>
        </section>
        <section class="rounded-2xl border p-5 flex items-center gap-3" style="border-color:${ACCENT_TINT};background:${ACCENT_TINT}">
          <span class="material-symbols-outlined shrink-0" style="color:${ACCENT}">shield_person</span>
          <div class="min-w-0">
            <p class="font-black text-gray-900">Acesso permanente, sem cobrança</p>
            <p class="text-sm text-gray-600">Pode criar e publicar quantas lojas quiser. O preço por loja publicada aplica-se às contas de Dono.</p>
          </div>
        </section>
        <section class="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
          <h4 class="font-black text-gray-900">Incluído</h4>
          ${incluido}
        </section>`));
      bindShell();
      return;
    }

    render(shell(`
      <section class="mb-6">
        <h3 class="text-2xl font-black tracking-tight">A sua subscrição</h3>
        <p class="text-gray-500 mt-1">${ativa
          ? `Ativa${billing.daysRemaining != null ? ` — renova em ${billing.daysRemaining} dia(s)` : ""}, para ${billing.paidStores} loja(s) publicada(s). Pagar de novo acrescenta tempo ao que já tem.`
          : "Sem subscrição ativa. As suas lojas ficam visíveis só para si até a ativar."}</p>
      </section>
      ${planStatusCard(billing)}
      <section class="mb-6">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h4 class="font-black text-gray-900">Lojas publicadas</h4>
          <p class="text-sm text-gray-500">Paga-se <b>por loja online</b>. Despublique uma loja para pagar menos.</p>
        </div>
        ${lojasHtml()}
      </section>
      <div data-ciclos class="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">${cartoesHtml()}</div>
      <section class="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h4 class="font-black text-gray-900">Incluído em cada loja</h4>
        <p class="text-sm text-gray-500 mt-1">Sem escalões. Tudo o que a plataforma faz está cá dentro.</p>
        ${incluido}
      </section>`));
    bindShell();

    /*
     * Publicar ou despublicar aqui mexe na fatura, por isso o total é recalculado
     * na hora. A gravação é imediata (é o mesmo `setStoreState` do separador
     * Início), mas a vista **não** é redesenhada: o Dono está a comparar preços e
     * perder o ecrã a cada clique tornava a comparação impossível.
     */
    document.querySelectorAll<HTMLInputElement>("[data-pub-store]").forEach((sw) =>
      sw.addEventListener("change", async () => {
        const id = sw.dataset.pubStore!;
        const alvo = stores.find((s) => s.id === id);
        if (!alvo) return;
        const next = sw.checked ? "Publicada" : "Rascunho";
        if (next === "Publicada") {
          const decisao = canPublishStore(billing, publicadas());
          if (!decisao.allowed) {
            sw.checked = false;
            toast(decisao.reason === "sem-subscricao"
              ? "Ative a subscrição para publicar esta loja."
              : `A subscrição cobre ${billing.paidStores} loja(s). Pague mais uma loja para publicar esta.`, "error");
            return;
          }
        }
        const ok = await withBusy(() => setStoreState(ownerId, id, next), "A atualizar…");
        if (!ok) { sw.checked = !sw.checked; toast("Não foi possível atualizar o estado.", "error"); return; }
        alvo.state = next;
        // Actualiza o total sem redesenhar o ecrã.
        const n = Math.max(1, publicadas());
        for (const ciclo of BILLING_PERIODS) {
          const el = document.querySelector<HTMLElement>(`[data-total="${ciclo}"]`);
          const conta = document.querySelector<HTMLElement>(`[data-conta="${ciclo}"]`);
          if (el) el.textContent = priceFor(ciclo, n).toLocaleString("pt-PT");
          if (conta) conta.textContent = `${n} loja(s) × ${PRICE_KZ[ciclo].toLocaleString("pt-PT")} Kz`;
        }
        toast(next === "Publicada" ? "Loja publicada." : "Loja despublicada — a mensalidade desce no próximo pagamento.");
      }));

    document.querySelectorAll<HTMLElement>("[data-ciclo]").forEach((b) =>
      b.addEventListener("click", () => {
        const ciclo = b.dataset.ciclo;
        if (ciclo !== "mensal" && ciclo !== "anual") return;
        openPlanCheckout({
          ownerId,
          period: ciclo as BillingPeriod,
          stores: Math.max(1, publicadas()),
          onPaid: () => { void renderDashboard(); },
        });
      }));
  }

}

function productCardAdmin(p: Product): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex items-center justify-center"><span class="material-symbols-outlined text-gray-300 text-4xl">image</span></div>`;
  const typeBadge = p.physical === false ? badge("Digital", "#eff6ff", "#1d4ed8") : badge("Físico", "#f0fdf4", "#15803d");
  return `<div class="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
    <div class="relative bg-gray-50 overflow-hidden" style="aspect-ratio:1/1">
      ${img}
      <div class="absolute top-2 left-2 flex flex-col items-start gap-1">
        ${p.featured ? badge("Destaque", ACCENT_TINT, ACCENT) : ""}
        ${p.available ? "" : badge("Indisponível", "#f3f4f6", "#6b7280")}
      </div>
    </div>
    <div class="p-3 flex flex-col flex-1">
      <p class="font-semibold text-gray-900 text-sm line-clamp-1">${esc(p.name)}</p>
      <p class="font-black mt-0.5" style="color:${ACCENT}">${esc(formatKz(p.price))}</p>
      <div class="flex items-center gap-1.5 flex-wrap mt-2">
        ${p.category ? badge(p.category, "#f3f4f6", "#6b7280") : ""}
        ${typeBadge}
      </div>
      <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <button data-edit-prod="${esc(p.id)}" class="flex-1 inline-flex items-center justify-center gap-1 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg py-1.5 transition-colors"><span class="material-symbols-outlined text-[18px]">edit</span> Editar</button>
        <button data-del-prod="${esc(p.id)}" class="inline-flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg w-9 h-8 transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>
    </div>
  </div>`;
}

/** Linha de produto (vista lista). */
function productRowAdmin(p: Product): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex items-center justify-center"><span class="material-symbols-outlined text-gray-300 text-[22px]">image</span></div>`;
  const typeBadge = p.physical === false ? badge("Digital", "#eff6ff", "#1d4ed8") : badge("Físico", "#f0fdf4", "#15803d");
  return `<div class="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
    <div class="w-14 h-14 rounded-xl overflow-hidden bg-gray-50 shrink-0" style="aspect-ratio:1/1">${img}</div>
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-gray-900 truncate">${esc(p.name)}${p.available ? "" : ' <span class="text-xs text-gray-400">(indisponível)</span>'}</p>
      <div class="flex items-center gap-1.5 flex-wrap mt-1">
        <span class="font-bold text-sm" style="color:${ACCENT}">${esc(formatKz(p.price))}</span>
        ${p.featured ? badge("Destaque", ACCENT_TINT, ACCENT) : ""}
        ${p.category ? badge(p.category, "#f3f4f6", "#6b7280") : ""}
        ${typeBadge}
      </div>
    </div>
    <button data-edit-prod="${esc(p.id)}" class="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg p-2 shrink-0 transition-colors"><span class="material-symbols-outlined text-[20px]">edit</span></button>
    <button data-del-prod="${esc(p.id)}" class="text-red-600 hover:bg-red-50 rounded-lg p-2 shrink-0 transition-colors"><span class="material-symbols-outlined text-[20px]">delete</span></button>
  </div>`;
}

/** Máscara curta para o IBAN (4 primeiros + 4 últimos). */
function maskIban(iban: string): string {
  const s = iban.replace(/\s+/g, "");
  return s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

const METHOD_LABELS: Record<string, string> = { mcx: "Multicaixa Express", reference: "Referência Bancária", whatsapp: "WhatsApp" };

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-PT")} · ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
}

function badge(text: string, bg: string, color: string): string {
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap" style="background:${bg};color:${color}">${esc(text)}</span>`;
}

function orderStatusBadge(status: string): string {
  switch (status) {
    case "paid": return badge("Paga", "#ecfdf5", "#047857");
    case "open": return badge("Pendente", "#fff7ed", "#c2410c");
    case "failed": return badge("Falhou", "#fef2f2", "#b91c1c");
    case "cancelled": return badge("Cancelada", "#f3f4f6", "#6b7280");
    case "expired": return badge("Expirada", "#f3f4f6", "#6b7280");
    default: return badge(status, "#f3f4f6", "#6b7280");
  }
}

function withdrawalStatusBadge(status: string): string {
  switch (status) {
    case "requested": return badge("Pendente", "#fff7ed", "#c2410c");
    case "approved": return badge("Aprovado", "#eff6ff", "#1d4ed8");
    case "paid": return badge("Pago", "#ecfdf5", "#047857");
    case "rejected": return badge("Rejeitado", "#fef2f2", "#b91c1c");
    default: return badge(status, "#f3f4f6", "#6b7280");
  }
}

/**
 * Linha de venda (resumo clicável + detalhe expansível).
 *
 * A acção de apagar só existe onde `canDeleteOrder` a autoriza — hoje, só as
 * referências expiradas — e vive **no detalhe**, não no resumo: o resumo é uma
 * área clicável inteira, e um botão destrutivo a 360 px, ao lado do valor e da
 * etiqueta de estado, apanha o dedo de quem só queria abrir a venda.
 */
function orderRow(o: OrderRow): string {
  const customer = o.customer?.name || o.customer?.phone || "Cliente";
  const detailItem = (label: string, value: string): string =>
    `<div><p class="text-xs text-gray-400">${esc(label)}</p><p class="font-medium text-gray-800">${value}</p></div>`;
  const ref = o.referenceNumber ? `${o.referenceEntity ? o.referenceEntity + " · " : ""}${o.referenceNumber}` : "—";
  const apagavel = canDeleteOrder(o);
  const acoes = [
    o.invoiceUrl ? `<a href="${esc(o.invoiceUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-sm font-semibold" style="color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">receipt_long</span> Ver fatura</a>` : "",
    apagavel ? `<button type="button" data-order-del="${esc(o.id)}" class="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 border border-red-200 rounded-xl px-3 py-1.5 hover:bg-red-50 transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span> Apagar registo</button>` : "",
  ].filter(Boolean).join("");
  return `<div class="border-b border-gray-50 last:border-0">
    <div data-order-toggle="${esc(o.id)}" class="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-900 text-sm truncate">${esc(customer)}</p>
        <p class="text-xs text-gray-400">${esc(fmtDateTime(o.createdAt))} · ${esc(METHOD_LABELS[o.method] ?? o.method)}</p>
      </div>
      <span class="font-bold text-gray-900 text-sm whitespace-nowrap">${esc(formatKz(o.amount))}</span>
      ${orderStatusBadge(orderEffectiveStatus(o))}
      <span class="material-symbols-outlined text-gray-300 text-[20px]">expand_more</span>
    </div>
    <div data-order-detail="${esc(o.id)}" class="hidden px-5 pb-4 pt-1 bg-gray-50/60">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        ${detailItem("Método", esc(METHOD_LABELS[o.method] ?? o.method))}
        ${detailItem("Taxa (2%)", esc(formatKz(o.fee)))}
        ${detailItem("Líquido", esc(formatKz(o.net)))}
        ${detailItem("Referência", esc(ref))}
        ${o.customer?.phone ? detailItem("Telefone", esc(o.customer.phone)) : ""}
        ${o.customer?.nif ? detailItem("NIF", esc(o.customer.nif)) : ""}
      </div>
      ${apagavel ? `<p class="text-xs text-gray-500 mt-3">A referência passou a data-limite e já não pode ser paga. Apagar remove este registo para sempre.</p>` : ""}
      ${acoes ? `<div class="flex flex-wrap items-center gap-3 mt-3">${acoes}</div>` : ""}
    </div>
  </div>`;
}

/** Linha de levantamento. */
function withdrawalRow(w: WithdrawalRow): string {
  return `<div class="px-5 py-3 flex items-center gap-3">
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-gray-900 text-sm">${esc(formatKz(w.amount))}</p>
      <p class="text-xs text-gray-400">${esc(fmtDateTime(w.createdAt))}${w.iban ? " · " + esc(maskIban(w.iban)) : ""}</p>
    </div>
    ${withdrawalStatusBadge(w.status)}
  </div>`;
}



/**
 * Placar do estado da subscrição.
 *
 * Três estados, não cinco: sem subscrição, ativa a renovar, ou nada a dizer
 * (administrador). Deixaram de existir teste grátis e plano agendado.
 */
function planStatusCard(b: BillingState): string {
  if (b.suspended) {
    // Distingue quem nunca pagou de quem deixou caducar: a primeira frase é um
    // convite, a segunda é um aviso.
    const titulo = b.expired ? "A sua subscrição terminou" : "A sua loja ainda não está online";
    const texto = b.expired
      ? "A loja saiu da web. Renove a subscrição para a pôr outra vez online."
      : "Pode criar, ver e personalizar à vontade. Para a publicar, ative a subscrição.";
    return `<section class="rounded-2xl border border-red-200 bg-red-50 p-5 mb-6 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-red-500 shrink-0">cloud_off</span>
        <div class="min-w-0"><p class="font-black text-red-700">${titulo}</p><p class="text-sm text-red-600/80">${texto}</p></div>
      </div>
      <a href="#/painel/plano" class="text-sm font-bold text-white px-4 py-2 rounded-xl shrink-0" style="background:${ACCENT}">Ativar subscrição</a>
    </section>`;
  }
  if (b.daysRemaining != null) {
    const pct = Math.max(0, Math.min(100, Math.round((b.daysRemaining / 30) * 100)));
    return `<section class="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">event_repeat</span></div>
          <div class="min-w-0">
            <p class="font-black text-gray-900">Renova em ${b.daysRemaining} dia(s)</p>
            <p class="text-sm text-gray-500">A loja está online.</p>
          </div>
        </div>
        <a href="#/painel/plano" class="text-sm font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shrink-0">Gerir subscrição</a>
      </div>
      <div class="h-2 rounded-full bg-gray-100 overflow-hidden mt-4"><div class="h-full rounded-full" style="width:${pct}%;background:${ACCENT}"></div></div>
    </section>`;
  }
  return "";
}

/** Lista de avaliações para moderação (Configurações). */
function reviewsModerationHtml(items: Review[], productNames: Map<string, string>): string {
  if (!items.length) {
    return `<div class="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">Ainda não há avaliações.</div>`;
  }
  const stars = (n: number): string => "★".repeat(n) + "☆".repeat(5 - n);
  return `<div class="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">${items.map((r) => `
    <div class="p-3.5 ${r.approved ? "" : "opacity-60"}">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold text-gray-900 text-sm">${esc(r.author)}</span>
        <span class="text-[13px]" style="color:#f59e0b">${stars(r.rating)}</span>
        <span class="text-xs text-gray-400">${esc(productNames.get(r.productId) ?? "Produto")}</span>
        ${r.approved ? "" : `<span class="text-[11px] font-bold text-gray-400">(escondida)</span>`}
        <div class="ml-auto flex items-center gap-1.5">
          <button data-rv-toggle="${esc(r.id)}" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">${r.approved ? "Esconder" : "Mostrar"}</button>
          <button data-rv-del="${esc(r.id)}" class="text-red-600 hover:bg-red-50 rounded-lg p-1.5 transition-colors" title="Apagar"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </div>
      </div>
      ${r.comment ? `<p class="text-sm text-gray-600 mt-1">${esc(r.comment)}</p>` : ""}
    </div>`).join("")}</div>`;
}

/** Lista de códigos de desconto (Configurações). */
function discountListHtml(items: DiscountCode[]): string {
  if (!items.length) {
    return `<div class="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">Ainda não há códigos de desconto.</div>`;
  }
  return `<div class="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">${items.map(discountRow).join("")}</div>`;
}

function discountRow(d: DiscountCode): string {
  const val = d.type === "percent" ? `${d.value}%` : formatKz(d.value);
  const status = d.active
    ? `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold" style="background:#ecfdf5;color:#047857">Ativo</span>`
    : `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold" style="background:#f3f4f6;color:#9ca3af">Inativo</span>`;
  return `<div class="flex items-center gap-3 p-3.5 flex-wrap">
    <span class="font-mono font-black px-2.5 py-1 rounded-lg" style="background:${ACCENT_TINT};color:${ACCENT}">${esc(d.code)}</span>
    <span class="text-sm font-semibold text-gray-700">${esc(val)} de desconto</span>
    ${status}
    <span class="text-xs text-gray-400 flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">confirmation_number</span> ${d.uses} uso(s)</span>
    <div class="ml-auto flex items-center gap-1.5">
      <button data-dc-toggle="${esc(d.id)}" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">${d.active ? "Desativar" : "Ativar"}</button>
      <button data-dc-del="${esc(d.id)}" class="text-red-600 hover:bg-red-50 rounded-lg p-1.5 transition-colors" title="Apagar"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div>
  </div>`;
}

/** Secção em acordeão (Configurações). */
function settingsAccordion(o: { icon: string; title: string; desc: string; body: string; open?: boolean; danger?: boolean; lockedPlan?: string; comingSoon?: boolean }): string {
  const danger = !!o.danger;
  const lock = o.lockedPlan
    ? `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[14px]">lock</span> ${esc(o.lockedPlan)}</span>`
    : "";
  const soon = o.comingSoon ? comingSoonBadge() : "";
  return `<details ${o.open ? "open" : ""} class="mb-acc rounded-2xl border ${danger ? "border-red-200" : "border-gray-200"} bg-white overflow-hidden">
    <summary class="cursor-pointer flex items-center gap-4 p-5 hover:bg-gray-50/60 transition-colors">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="${danger ? "background:#fef2f2;color:#dc2626" : `background:${ACCENT_TINT};color:${ACCENT}`}"><span class="material-symbols-outlined">${o.icon}</span></div>
      <div class="flex-1 min-w-0"><h3 class="font-black ${danger ? "text-red-700" : "text-gray-900"} flex items-center gap-2 flex-wrap">${esc(o.title)} ${lock} ${soon}</h3><p class="text-sm text-gray-500">${esc(o.desc)}</p></div>
      <span class="material-symbols-outlined text-gray-400 mb-acc-chev transition-transform shrink-0">expand_more</span>
    </summary>
    <div class="px-5 pb-5 pt-1 border-t border-gray-100">${o.body}</div>
  </details>`;
}

/** Célula compacta de área de entrega (toggle + taxa), para grelha de 2 colunas. */
function areaRowHtml(area: string, fee: number | null): string {
  const on = fee !== null;
  return `<div class="mb-area flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2" data-area="${esc(area)}">
    <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none">
      <input data-a-on type="checkbox" ${on ? "checked" : ""} class="w-4 h-4 accent-[#F95901] shrink-0" />
      <span class="text-sm font-medium text-gray-800 truncate">${esc(area)}</span>
    </label>
    <input data-a-fee type="number" min="0" value="${on ? esc(String(fee)) : ""}" placeholder="Kz" ${on ? "" : "disabled"} class="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:border-[#F95901] disabled:bg-gray-50 disabled:text-gray-300" />
  </div>`;
}

function stub(icon: string, title: string, desc: string): string {
  return `<div class="bg-white border border-gray-200 rounded-3xl p-12 flex flex-col items-center text-center gap-3">
    <span class="material-symbols-outlined" style="font-size:48px;color:${ACCENT}">${icon}</span>
    <h3 class="text-xl font-black text-gray-900">${esc(title)}</h3>
    <p class="text-gray-500 max-w-md">${esc(desc)}</p>
    <span class="mt-2 text-xs bg-gray-100 px-3 py-1 rounded-full text-gray-500">Em breve</span>
  </div>`;
}
