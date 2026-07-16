/**
 * Painel de Administração — Início, Produtos, Pagamentos, Configurações.
 * Identidade visual MôBisno (branco + #F95901). Logótipo, banners e aparência
 * vivem no ecrã "Personalizar".
 */
import { render, $, go, esc, toast, formatKz, withBusy, withButton, fadeInImages } from "../lib/dom.js";
import { appState, currentOwnerId, logout, storeRepository, productRepository, adminPanelFor, getOwnerBilling, countPublishedStores, publicStoreUrl, deleteStore, setStoreState, getOwnerName } from "../composition.js";
import { openProductForm } from "../lib/productForm.js";
import { getPlan, listPlans, planRank, canAddProducts, remainingProducts, formatLimit, isPlanId, type Plan } from "../../src/services/plans.js";
import { PLAN_PERIOD_DAYS, type BillingState } from "../../src/services/billing.js";
import type { Store, Product } from "../../src/models/index.js";
import { getPaymentConfig, savePaymentConfig, getOrderStats, listOrders, orderEffectiveStatus, type PaymentConfig, type OrderRow } from "../supabase/payments.js";
import { listWithdrawals, committedWithdrawals, requestWithdrawal, type WithdrawalRow } from "../supabase/withdrawals.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { generateLogos, improveLogoDescription, dataUrlToUint8Array } from "../lib/logoApi.js";
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

const ACCENT = "#F95901";
const ACCENT_TINT = "rgba(249,89,1,.1)";

function navItem(href: string, icon: string, label: string, active: boolean): string {
  const base = "rounded-xl px-4 py-3 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors";
  const style = active ? `style="background:${ACCENT_TINT};color:${ACCENT}"` : "";
  const cls = active ? "" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  return `<a href="${href}" class="${base} ${cls}" ${style}><span class="material-symbols-outlined">${icon}</span> ${label}</a>`;
}

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

export async function renderDashboard(): Promise<void> {
  appState.editOwnerId = null;
  appState.editorReturn = null; // o dono volta sempre ao seu painel ao sair do editor
  const ownerId = appState.ownerId ?? (await currentOwnerId());
  if (!ownerId) {
    render(emptyState("lock", "Inicie sessão para aceder ao painel.",
      `<a href="#/login" class="text-white px-6 py-3 rounded-xl font-semibold" style="background:${ACCENT}">Iniciar sessão</a>
       <a href="#/criar" class="border border-gray-200 text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50">Criar loja</a>`));
    return;
  }
  const allStores = await storeRepository.listByOwner(ownerId);
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
  const billing = await getOwnerBilling(ownerId);
  const plan = getPlan(billing.effectivePlan);
  const isAdmin = await isCurrentUserAdmin();
  const tab = currentTab();
  const storeUrl = publicStoreUrl(store.identifier);

  function shell(content: string): string {
    return `
    <div class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
      <aside class="hidden md:flex flex-col py-6 bg-white border-r border-gray-100 w-64 shrink-0 sticky top-0 h-screen">
        <div class="px-6 mb-6">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:26px" />
        </div>
        <div class="px-4 mb-5 space-y-2">
          ${stores.length > 1
            ? `<div class="relative">
                 <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] pointer-events-none">storefront</span>
                 <select id="store-switch" class="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-9 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#F95901] cursor-pointer hover:bg-gray-100 transition-colors">
                   ${stores.map((s) => `<option value="${esc(s.id)}" ${s.id === store!.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
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
          ${navItem("#/painel", "home", "Início", tab === "inicio")}
          ${navItem("#/painel/produtos", "inventory_2", "Produtos", tab === "produtos")}
          ${navItem("#/painel/logotipo", "auto_awesome", "Criar logótipo", tab === "logotipo")}
          ${navItem("#/painel/analises", "monitoring", "Análises", tab === "analises")}
          ${navItem("#/painel/pagamentos", "payments", "Pagamentos", tab === "pagamentos")}
          ${navItem("#/painel/plano", "workspace_premium", "Plano", tab === "plano")}
          ${navItem("#/painel/config", "settings", "Configurações", tab === "config")}
        </nav>
        <div class="mt-auto px-4 space-y-1">
          ${isAdmin ? `<a href="#/adminPainel" class="w-full inline-flex items-center gap-2 text-sm font-bold px-2 py-2 rounded-lg transition-colors" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">shield_person</span> Painel de Administração</a>` : ""}
          <button id="logout" class="w-full text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-semibold px-2 py-2 transition-colors"><span class="material-symbols-outlined">logout</span> Terminar sessão</button>
        </div>
      </aside>

      <div class="flex-1 min-w-0 flex flex-col">
        <header class="bg-white/90 backdrop-blur border-b border-gray-100 sticky top-0 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-3">
          <h2 class="text-xl font-black tracking-tight capitalize">${tab === "inicio" ? "Início" : tab === "config" ? "Configurações" : tab === "plano" ? "Plano" : tab === "analises" ? "Análises" : tab === "logotipo" ? "Criar logótipo" : esc(tab)}</h2>
          <div class="flex items-center gap-2 shrink-0">
            <a href="#/personalizar" class="text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span><span class="hidden sm:inline">Personalizar loja</span></a>
            <a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="text-gray-500 hover:text-gray-900 text-sm font-semibold flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"><span class="material-symbols-outlined text-[18px]">open_in_new</span><span class="hidden sm:inline">Ver loja</span></a>
          </div>
        </header>
        <main class="flex-1 min-w-0 p-margin-mobile md:p-margin-desktop">
          <div class="max-w-container-max mx-auto w-full">${content}</div>
        </main>
      </div>
    </div>`;
  }

  function bindShell(): void {
    $("#logout")?.addEventListener("click", async () => { await logout(); go("#/"); });
    const sw = $("#store-switch") as HTMLSelectElement | null;
    sw?.addEventListener("change", () => {
      appState.storeId = sw.value;
      void renderDashboard();
    });
  }

  if (tab === "produtos") { await renderProdutos(); return; }
  if (tab === "logotipo") { await renderLogotipo(); return; }
  if (tab === "analises") { await renderAnalises(); return; }
  if (tab === "plano") { await renderPlano(); return; }
  if (tab === "pagamentos") { await renderPagamentos(); return; }
  if (tab === "config") { await renderConfig(); return; }

  // --- Início ---
  await renderInicio();
  return;

  async function renderInicio(): Promise<void> {
    const products = await productRepository.listByStore(store!.id);
    const prodLimit = plan.limits.maxProductsPerStore;
    const payCfg = await getPaymentConfig(store!.id);
    const online = payCfg.onlineEnabled;
    const ownerName = (await getOwnerName(ownerId)) || store!.name;
    const stats = online ? await getOrderStats(store!.id) : null;
    const orders = online ? await listOrders(store!.id, 100) : [];
    const withdrawals = online ? await listWithdrawals(store!.id) : [];
    const committed = online ? await committedWithdrawals(store!.id) : 0;
    const available = stats ? Math.max(0, Math.round((stats.netReceived - committed) * 100) / 100) : 0;
    const published = store!.state === "Publicada";
    const suspended = billing.suspended;
    const statePill = suspended
      ? `<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style="background:#fef2f2;color:#b91c1c"><span class="material-symbols-outlined text-[16px]">cloud_off</span> Offline</span>`
      : `<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style="background:${published ? "#ecfdf5" : "#f3f4f6"};color:${published ? "#047857" : "#6b7280"}"><span class="w-2 h-2 rounded-full" style="background:currentColor"></span> ${published ? "Publicada" : "Não publicada"}</span>`;

    const greeting = `
      <section class="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-2xl md:text-3xl font-black tracking-tight break-words">Olá, ${esc(ownerName)}</h3>
          <p class="text-gray-500 mt-1 break-words">Endereço: <a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="font-semibold hover:underline" style="color:${ACCENT}">${esc(storeUrl.replace(/^https?:\/\//, ""))}</a></p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${statePill}
          ${suspended ? "" : `<button id="toggle-state" class="text-sm font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">${published ? "Despublicar" : "Publicar"}</button>`}
          <a href="#/painel/plano" class="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-full text-sm" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> ${esc(plan.name)}</a>
        </div>
      </section>

      ${planStatusCard(billing, plan.name)}`;

    function bindInicio(): void {
      $("#toggle-state")?.addEventListener("click", async () => {
        const next = published ? "Rascunho" : "Publicada";
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
        <section class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          ${metric("inventory_2", "Produtos", `${products.length}${Number.isFinite(prodLimit) ? ` / ${prodLimit}` : ""}`)}
          ${metric("storefront", "Estado", published ? "Publicada" : "Não publicada")}
        </section>
        <div class="rounded-3xl border border-gray-200 bg-white p-8 text-center">
          <span class="material-symbols-outlined" style="font-size:42px;color:${ACCENT}">payments</span>
          <h3 class="text-xl font-black text-gray-900 mt-2">Ative as vendas online</h3>
          <p class="text-gray-500 max-w-md mx-auto mt-1">Receba por Multicaixa Express e Referência Bancária e acompanhe aqui as suas vendas e levantamentos.</p>
          <a href="#/painel/pagamentos" class="inline-flex items-center gap-1.5 mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-bold" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">bolt</span> Ativar pagamentos</a>
        </div>`));
      bindShell();
      bindInicio();
      return;
    }

    const PAGE = 8;
    let page = 0;

    render(shell(`${greeting}
      <section class="rounded-3xl p-6 md:p-7 text-white mb-5" style="background:linear-gradient(135deg,#F95901,#ff7e33)">
        <div class="flex items-center justify-between gap-3 mb-5">
          <h3 class="text-lg font-black flex items-center gap-2"><span class="material-symbols-outlined">trending_up</span> Vendas online</h3>
          <span class="text-xs font-semibold bg-white/20 rounded-full px-3 py-1">${stats!.paidCount} venda(s)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div><p class="text-white/80 text-sm">Valor total vendido</p><p class="text-3xl md:text-4xl font-black tracking-tight mt-1">${esc(formatKz(stats!.totalSales))}</p></div>
          <div class="sm:text-right"><p class="text-white/80 text-sm">Disponível para levantar</p><p class="text-3xl md:text-4xl font-black tracking-tight mt-1">${esc(formatKz(available))}</p>
            <button id="request-withdraw" ${available > 0 ? "" : "disabled"} class="mt-3 inline-flex items-center gap-1.5 bg-white font-bold px-5 py-2.5 rounded-xl text-sm transition-transform active:scale-95 ${available > 0 ? "" : "opacity-60 cursor-not-allowed"}" style="color:#F95901"><span class="material-symbols-outlined text-[18px]">account_balance_wallet</span> Solicitar levantamento</button>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        ${metric("savings", "Recebido (líquido)", formatKz(stats!.netReceived))}
        ${metric("inventory_2", "Produtos", `${products.length}${Number.isFinite(prodLimit) ? ` / ${prodLimit}` : ""}`)}
        ${metric("schedule", "Referências pendentes", String(stats!.pendingCount))}
      </section>

      <section class="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-black text-gray-900">Vendas</h3>
          <span class="text-sm text-gray-400">${orders.length} registo(s)</span>
        </div>
        <div id="orders-body"></div>
        <div id="orders-pager" class="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm"></div>
      </section>

      <section class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-black text-gray-900">Levantamentos</h3></div>
        <div class="divide-y divide-gray-50">
          ${withdrawals.length ? withdrawals.map(withdrawalRow).join("") : `<p class="px-5 py-8 text-center text-gray-400 text-sm">Ainda não há pedidos de levantamento.</p>`}
        </div>
      </section>`));
    bindShell();
    bindInicio();
    drawOrders();

    function drawOrders(): void {
      const body = $("#orders-body");
      const pager = $("#orders-pager");
      if (!body || !pager) return;
      if (!orders.length) {
        body.innerHTML = `<p class="px-5 py-10 text-center text-gray-400 text-sm">Ainda não há vendas.</p>`;
        pager.innerHTML = "";
        return;
      }
      const pages = Math.ceil(orders.length / PAGE);
      page = Math.max(0, Math.min(page, pages - 1));
      const slice = orders.slice(page * PAGE, page * PAGE + PAGE);
      body.innerHTML = slice.map(orderRow).join("");
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
    }
  }

  async function renderProdutos(): Promise<void> {
    const list = await productRepository.listByStore(store!.id);
    const limit = plan.limits.maxProductsPerStore;
    const atLimit = !canAddProducts(plan, list.length);
    const usage = Number.isFinite(limit) ? `${list.length} / ${limit}` : `${list.length}`;
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
      ${atLimit ? `<div class="mb-5 rounded-xl px-4 py-3 text-sm flex items-center gap-2" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">info</span> Atingiu o limite de ${formatLimit(limit)} produtos do plano ${esc(plan.name)}. Faça upgrade para adicionar mais.</div>` : ""}
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
      if (!canAddProducts(plan, list.length)) { toast(`Limite de ${formatLimit(plan.limits.maxProductsPerStore)} produtos atingido no plano ${plan.name}.`, "error"); return; }
      openProductForm({ panel, ownerId, storeId: store!.id, categories: cats, onDone: renderProdutos });
    });
  }

  async function renderAnalises(): Promise<void> {
    render(shell(`<div class="flex items-center justify-center py-20"><span class="material-symbols-outlined animate-spin text-gray-300" style="font-size:40px">progress_activity</span></div>`));
    bindShell();

    const [a, products] = await Promise.all([
      getStoreAnalytics(store!.id),
      productRepository.listByStore(store!.id),
    ]);
    const names = new Map(products.map((p) => [p.id, p.name]));
    const maxV = Math.max(1, ...a.daily.map((d) => d.visits));
    const bars = a.daily.map((d) => {
      const h = Math.round((d.visits / maxV) * 100);
      const day = new Date(d.date).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
      return `<div class="flex-1 flex flex-col items-center gap-1 group">
        <div class="w-full flex items-end" style="height:120px"><div class="w-full rounded-t-md transition-all" style="height:${Math.max(2, h)}%;background:${ACCENT}" title="${d.visits} visita(s)"></div></div>
        <span class="text-[10px] text-gray-400">${esc(day)}</span>
      </div>`;
    }).join("");

    const top = a.topProducts.length
      ? a.topProducts.map((t) => `<div class="flex items-center gap-3 px-5 py-3">
          <span class="material-symbols-outlined text-gray-300">visibility</span>
          <span class="flex-1 min-w-0 font-semibold text-gray-800 truncate">${esc(names.get(t.productId) ?? "Produto")}</span>
          <span class="text-sm font-bold text-gray-900">${t.count}</span>
        </div>`).join("")
      : `<p class="px-5 py-8 text-center text-gray-400 text-sm">Ainda não há visualizações de produtos.</p>`;

    render(shell(`
      <section class="mb-6">
        <h3 class="text-2xl font-black tracking-tight">Análises</h3>
        <p class="text-gray-500 mt-1">Visitas e produtos mais vistos da sua loja.</p>
      </section>
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        ${metric("group", "Visitas (7 dias)", String(a.visits7))}
        ${metric("calendar_month", "Visitas (30 dias)", String(a.visits30))}
        ${metric("visibility", "Visualizações (7 dias)", String(a.views7))}
        ${metric("inventory_2", "Produtos", String(products.length))}
      </section>
      <section class="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <h3 class="font-black text-gray-900 mb-4">Visitas — últimos 14 dias</h3>
        <div class="flex items-end gap-1.5">${bars}</div>
      </section>
      <section class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-black text-gray-900">Produtos mais vistos (30 dias)</h3></div>
        <div class="divide-y divide-gray-50">${top}</div>
      </section>`));
    bindShell();
  }

  async function renderPagamentos(): Promise<void> {
    const cfg = await getPaymentConfig(store!.id);
    const custom = await getCustomization(store!.id);
    const waPhone = custom.whatsapp?.phone || resolveWaPhone(custom);
    const online = plan.features.multicaixaCheckout;

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
          <div><h3 class="font-black text-gray-900">WhatsApp</h3><p class="text-sm text-gray-500">Disponível em todos os planos.</p></div>
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
        <p class="text-sm text-gray-500 max-w-md mx-auto mt-1">Multicaixa Express e Referência Bancária estão disponíveis a partir do plano <b>Profissional</b>. Faça upgrade para os ativar.</p>
        <a href="#/painel/plano" class="inline-flex items-center gap-1.5 mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-bold" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> Ver planos</a>
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
      // Espelha o flag público (não sensível) na customização, para o storefront.
      const mirrored = { ...custom, payments: { ...(custom.payments ?? {}), onlineEnabled: enabled } };
      await saveCustomization(ownerId, store!.id, mirrored);
      if (okSave) { toast("Pagamentos online guardados."); await renderPagamentos(); }
      else toast("Não foi possível guardar.", "error");
    });
  }

  async function renderLogotipo(): Promise<void> {
    const custom = await getCustomization(store!.id);
    const logos = Array.isArray(custom.logos) ? custom.logos : [];
    // Fundo axadrezado para evidenciar a transparência do PNG.
    const checker = "background-image:linear-gradient(45deg,#eef1f4 25%,transparent 25%),linear-gradient(-45deg,#eef1f4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f4 75%),linear-gradient(-45deg,transparent 75%,#eef1f4 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;background-color:#fff;";

    render(shell(`
      <p class="text-gray-500 mb-5 max-w-2xl">Descreva o seu negócio e a IA cria <strong>duas variações</strong> de logótipo em PNG com fundo transparente. Escolha a que preferir — fica guardada em "Meus logótipos".</p>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8 items-start">
        <section class="lg:col-span-3 bg-white border border-gray-200 rounded-3xl p-5 md:p-6">
          <div class="relative">
            <textarea id="logo-desc" rows="4" maxlength="600" placeholder="Ex.: Loja de doces artesanais chamada 'Doce Mel', tons de rosa e dourado, com um símbolo delicado." class="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pb-7 text-sm outline-none focus:border-[#F95901] focus:bg-white transition-colors resize-none"></textarea>
            <span id="logo-count" class="absolute right-3 bottom-2.5 text-[11px] text-gray-400 pointer-events-none">0 / 600</span>
          </div>
          <div class="flex flex-col sm:flex-row gap-2.5 mt-3">
            <button id="logo-improve" class="sm:flex-1 px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 border transition-colors hover:bg-gray-50" style="border-color:${ACCENT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">auto_fix_high</span> Melhorar com IA</button>
            <button id="logo-gen" class="sm:flex-1 text-white px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">auto_awesome</span> Gerar 2 variações</button>
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

    // Contador de caracteres.
    const updateCount = (): void => { if (countEl && descEl) countEl.textContent = `${descEl.value.length} / 600`; };
    descEl?.addEventListener("input", updateCount);
    updateCount();

    // Melhorar/estruturar a descrição com IA.
    $("#logo-improve")?.addEventListener("click", async () => {
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          ${[0, 1].map(() => `
            <div class="rounded-2xl border border-gray-200 overflow-hidden">
              <div class="aspect-square bg-gray-100 animate-pulse flex items-center justify-center">
                <span class="material-symbols-outlined text-gray-300 animate-spin" style="font-size:32px">progress_activity</span>
              </div>
              <div class="h-11 bg-gray-100 animate-pulse border-t border-gray-100"></div>
            </div>`).join("")}
        </div>
        <p class="text-center text-sm text-gray-400 mt-4">A criar duas variações… isto pode demorar alguns segundos.</p>`;
      resultsWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function renderVariations(dataUrls: string[]): void {
      if (!resultsWrap || !resultsEl) return;
      resultsWrap.classList.remove("hidden");
      resultsEl.innerHTML = `
        <p class="text-sm text-gray-500 mb-4">Clique em <strong>Escolher esta</strong> para guardar a variação que prefere.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          ${dataUrls.map((src, i) => `
            <div class="rounded-2xl border border-gray-200 overflow-hidden bg-white transition-shadow hover:shadow-md">
              <div class="aspect-square flex items-center justify-center p-6" style="${checker}">
                <img src="${src}" alt="Variação ${i + 1}" class="max-w-full max-h-full object-contain" />
              </div>
              <button data-logo-pick="${i}" class="w-full py-3 text-sm font-bold text-white inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">check_circle</span> Escolher esta</button>
            </div>`).join("")}
        </div>`;
      resultsEl.querySelectorAll<HTMLButtonElement>("[data-logo-pick]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.logoPick);
          const src = dataUrls[idx];
          if (!src) return;
          await withButton(btn, async () => {
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
    }

    $("#logo-gen")?.addEventListener("click", async () => {
      const desc = (descEl?.value ?? "").trim();
      if (desc.length < 6) { toast("Escreva uma descrição do logótipo primeiro.", "error"); descEl?.focus(); return; }
      showGenerating();
      await withButton($("#logo-gen") as HTMLButtonElement, async () => {
        const images = await generateLogos(desc);
        if (!images.length) {
          resultsWrap?.classList.add("hidden");
          toast("Não foi possível gerar os logótipos. Tenta de novo dentro de instantes.", "error");
          return;
        }
        renderVariations(images);
      }, "A gerar…");
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
    const c = await getCustomization(store!.id);
    const canDomain = plan.features.customDomain;
    const smsCredits = await getSmsCredits(store!.id);
    const discounts = await listDiscounts(store!.id);
    const reviews = await listStoreReviews(store!.id);
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

    const smsBody = `
      <p class="text-sm text-gray-500 mb-3">Quando ativo, o seu cliente recebe um <b>SMS de confirmação</b> assim que a compra é concluída, com o resumo da encomenda. Isto transmite confiança, reduz dúvidas e diminui as desistências — o cliente sente que está a comprar numa loja séria.</p>
      <div class="rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" style="background:#fafafa">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Saldo de mensagens</p>
          <p class="text-2xl font-black text-gray-900 flex items-center gap-2"><span class="material-symbols-outlined" style="color:${ACCENT}">sms</span> ${smsCredits} SMS</p>
        </div>
        <p class="text-xs text-gray-500 max-w-[14rem]">Cada SMS custa <b style="color:${ACCENT}">${esc(formatKz(SMS_UNIT_PRICE))}</b>. Compre um pacote para ter saldo.</p>
      </div>
      <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Comprar pacote</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        ${SMS_PACKAGES.map((n) => `
          <button type="button" data-sms-pack="${n}" class="rounded-xl border-2 border-gray-200 hover:border-[#F95901] p-3 text-center transition-colors">
            <span class="block text-xl font-black text-gray-900">${n}</span>
            <span class="block text-[11px] text-gray-400 mb-1">mensagens</span>
            <span class="block text-xs font-bold" style="color:${ACCENT}">${esc(formatKz(n * SMS_UNIT_PRICE))}</span>
          </button>`).join("")}
      </div>
      <div class="mb-2">${toggle("sms-enabled", !!c.sms?.enabled, "Enviar SMS de confirmação ao cliente")}</div>
      <p class="text-xs text-gray-400">O número usado é o que o cliente indica no checkout. O envio consome 1 SMS do saldo.</p>
      <button id="save-sms" class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>`;

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

    const domainBody = canDomain ? `
      <p class="text-sm text-gray-500 mb-4">Ligue um domínio que já tenha (ex.: <b>www.minhaloja.co.ao</b>) à sua loja.</p>
      <label class="block"><span class="text-sm font-semibold text-gray-700">O seu domínio</span>
        <input id="domain" type="text" value="${esc(c.customDomain ?? "")}" placeholder="www.minhaloja.co.ao" class="${inp} mt-1.5" /></label>
      <div class="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600">
        <p class="font-semibold text-gray-800 mb-1 flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ACCENT}">dns</span> Como ligar</p>
        No painel do seu domínio, crie um registo <b>CNAME</b> a apontar para <code class="px-1.5 py-0.5 rounded bg-white border border-gray-200">cname.vercel-dns.com</code>. Depois de guardar aqui, a ligação fica ativa em minutos.
      </div>
      <button id="save-domain" class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar domínio</button>`
      : `
      <p class="text-sm text-gray-500">O domínio próprio está disponível a partir do plano <b>Profissional</b>.</p>
      <a href="#/painel/plano" class="inline-flex items-center gap-1.5 mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-bold" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> Ver planos</a>`;

    const dangerBody = `
      <p class="text-sm text-gray-600">Apagar a loja remove <b>permanentemente</b> todos os produtos, imagens, banners, personalização e configurações. <b class="text-red-600">Esta ação é irreversível.</b></p>
      <button id="delete-store" class="mt-4 inline-flex items-center gap-2 bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-red-700 transition-colors"><span class="material-symbols-outlined text-[18px]">delete_forever</span> Apagar esta loja</button>`;

    render(shell(`
      <style>details.mb-acc>summary{list-style:none}details.mb-acc>summary::-webkit-details-marker{display:none}details.mb-acc[open] .mb-acc-chev{transform:rotate(180deg)}</style>
      <section class="space-y-4">
        ${settingsAccordion({ icon: "local_shipping", title: "Entregas", desc: "Declare as taxas de entrega da sua loja por zona.", body: deliveryBody })}
        ${settingsAccordion({ icon: "sms", title: "SMS de confirmação", desc: "Ative o SMS de confirmação de compra que o seu cliente recebe.", body: smsBody })}
        ${settingsAccordion({ icon: "sell", title: "Código de desconto", desc: "Crie e gira códigos de desconto para os seus clientes.", body: discountBody })}
        ${settingsAccordion({ icon: "ads_click", title: "Marketing e Pixels", desc: "Meta Pixel e Google Analytics para medir e impulsionar vendas.", body: marketingBody })}
        ${settingsAccordion({ icon: "reviews", title: "Avaliações", desc: "Veja e modere as avaliações dos seus clientes.", body: reviewsBody })}
        ${settingsAccordion({ icon: "language", title: "Domínio", desc: "Ligue o seu próprio domínio à loja.", body: domainBody, lockedPlan: canDomain ? undefined : "Profissional" })}
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

    // SMS
    $("#save-sms")?.addEventListener("click", async () => {
      c.sms = { enabled: ($("#sms-enabled") as HTMLInputElement)?.checked ?? false };
      const ok = await withBusy(() => saveCustomization(ownerId, store!.id, c), "A guardar…");
      ok ? toast("Preferência de SMS guardada.") : toast("Não foi possível guardar.", "error");
    });
    document.querySelectorAll<HTMLElement>("[data-sms-pack]").forEach((b) =>
      b.addEventListener("click", () => {
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

    // Domínio
    $("#save-domain")?.addEventListener("click", async () => {
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

  async function renderPlano(): Promise<void> {
    const published = await countPublishedStores(ownerId);
    const productCount = (await productRepository.listByStore(store!.id)).length;
    const storeLimit = plan.limits.maxPublishedStores;
    const prodLimit = plan.limits.maxProductsPerStore;

    const usage = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        ${usageCard("storefront", "Lojas publicadas", `${published}${Number.isFinite(storeLimit) ? ` / ${storeLimit}` : ""}`, Number.isFinite(storeLimit) ? Math.min(1, published / storeLimit) : 0)}
        ${usageCard("inventory_2", "Produtos (loja atual)", `${productCount}${Number.isFinite(prodLimit) ? ` / ${prodLimit}` : ""}`, Number.isFinite(prodLimit) ? Math.min(1, productCount / prodLimit) : 0)}
      </div>`;

    const cards = listPlans().map((p) => planCard(p, plan)).join("");

    render(shell(`
      <section class="mb-6">
        <h3 class="text-2xl font-black tracking-tight">O seu plano</h3>
        <p class="text-gray-500 mt-1">Plano atual: <span class="font-semibold" style="color:${ACCENT}">${esc(plan.name)}</span>. Faça upgrade ou downgrade a qualquer momento.</p>
      </section>
      ${usage}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">${cards}</div>`));
    bindShell();

    document.querySelectorAll<HTMLElement>("[data-plan]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.plan;
        if (!isPlanId(id) || id === plan.id) return;
        openPlanCheckout({ ownerId, plan: getPlan(id), onPaid: () => { void renderDashboard(); } });
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

function metric(icon: string, label: string, value: string): string {
  return `<div class="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">${icon}</span></div>
    <div><p class="text-sm text-gray-500 mb-1">${label}</p><p class="text-2xl font-black text-gray-900">${esc(value)}</p></div>
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

/** Linha de venda (resumo clicável + detalhe expansível). */
function orderRow(o: OrderRow): string {
  const customer = o.customer?.name || o.customer?.phone || "Cliente";
  const detailItem = (label: string, value: string): string =>
    `<div><p class="text-xs text-gray-400">${esc(label)}</p><p class="font-medium text-gray-800">${value}</p></div>`;
  const ref = o.referenceNumber ? `${o.referenceEntity ? o.referenceEntity + " · " : ""}${o.referenceNumber}` : "—";
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
      ${o.invoiceUrl ? `<a href="${esc(o.invoiceUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold" style="color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">receipt_long</span> Ver fatura</a>` : ""}
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

function usageCard(icon: string, label: string, value: string, ratio: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `<div class="bg-white border border-gray-200 rounded-2xl p-5">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 rounded-full flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[20px]">${icon}</span></div>
      <div class="flex-1"><p class="text-sm text-gray-500">${label}</p><p class="text-lg font-black text-gray-900">${esc(value)}</p></div>
    </div>
    <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${ACCENT}"></div></div>
  </div>`;
}

function planCard(p: Plan, current: Plan): string {
  const isCurrent = p.id === current.id;
  const isUpgrade = planRank(p.id) > planRank(current.id);
  const featured = p.id === "profissional";
  const border = isCurrent ? `border-color:${ACCENT}` : "border-color:#e5e7eb";
  const ring = isCurrent ? `box-shadow:0 0 0 2px ${ACCENT}` : "";
  const btn = isCurrent
    ? `<div class="w-full mt-6 text-center font-bold rounded-xl py-3 text-sm" style="background:${ACCENT_TINT};color:${ACCENT}">Plano atual</div>`
    : `<button data-plan="${esc(p.id)}" class="w-full mt-6 text-center font-bold rounded-xl py-3 text-sm transition-opacity ${isUpgrade ? "text-white hover:opacity-95" : "bg-gray-100 text-gray-900 hover:bg-gray-200"}" ${isUpgrade ? `style="background:${ACCENT}"` : ""}>${isUpgrade ? "Fazer upgrade" : "Mudar para este"}</button>`;
  return `<div class="relative rounded-2xl border-2 bg-white p-6 flex flex-col text-left" style="${border};${ring}">
    ${featured && !isCurrent ? `<div class="absolute top-0 right-0 text-[11px] font-bold text-white px-3 py-1 rounded-bl-xl" style="background:${ACCENT}">POPULAR</div>` : ""}
    <h4 class="text-lg font-black text-gray-900">${esc(p.name)}</h4>
    <div class="flex items-baseline mt-2 mb-1">
      <span class="text-sm font-bold text-gray-900 mr-1">Kz</span>
      <span class="text-3xl font-black tracking-tight">${esc(p.priceKz.toLocaleString("pt-PT"))}</span>
      <span class="text-gray-400 ml-1 text-sm">/mês</span>
    </div>
    <ul class="mt-4 space-y-2.5 flex-grow">
      ${p.highlights.map((h) => `<li class="flex items-start gap-2 text-gray-700 text-sm"><span class="material-symbols-outlined text-[18px]" style="color:${ACCENT}">check_circle</span> ${esc(h)}</li>`).join("")}
    </ul>
    ${btn}
  </div>`;
}

/** Placar do estado do plano (teste / suspensão / renovação / agendamento). */
function planStatusCard(b: BillingState, planName: string): string {
  // Conta suspensa: teste terminou e sem plano pago → loja offline.
  if (b.suspended) {
    return `<section class="rounded-2xl border border-red-200 bg-red-50 p-5 mb-6 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-red-500 shrink-0">cloud_off</span>
        <div class="min-w-0"><p class="font-black text-red-700">A sua loja está offline</p><p class="text-sm text-red-600/80">O período de teste terminou. Subscreva um plano para a sua loja voltar a ficar online.</p></div>
      </div>
      <a href="#/painel/plano" class="text-sm font-bold text-white px-4 py-2 rounded-xl shrink-0" style="background:${ACCENT}">Subscrever plano</a>
    </section>`;
  }
  // Em teste grátis.
  if (b.inTrial) {
    const d = b.trialDaysRemaining ?? 0;
    return `<section class="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">schedule</span></div>
          <div class="min-w-0">
            <p class="font-black text-gray-900">Teste grátis — ${d} dia(s) restante(s)</p>
            <p class="text-sm text-gray-500">Subscreva um plano para manter a loja online quando o teste terminar.</p>
          </div>
        </div>
        <a href="#/painel/plano" class="text-sm font-bold text-white px-4 py-2 rounded-xl shrink-0" style="background:${ACCENT}">Ver planos</a>
      </div>
      <div class="h-2 rounded-full bg-gray-100 overflow-hidden mt-4"><div class="h-full rounded-full" style="width:${Math.max(0, Math.min(100, Math.round((d / 7) * 100)))}%;background:${ACCENT}"></div></div>
    </section>`;
  }
  // Plano pago ativo: placar de renovação.
  if (b.daysRemaining != null) {
    const pct = Math.max(0, Math.min(100, Math.round((b.daysRemaining / PLAN_PERIOD_DAYS) * 100)));
    const sched = b.nextPlan ? getPlan(b.nextPlan).name : null;
    return `<section class="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">event_repeat</span></div>
          <div class="min-w-0">
            <p class="font-black text-gray-900">Renovação do plano em ${b.daysRemaining} dia(s)</p>
            <p class="text-sm text-gray-500">${esc(planName)}${sched ? ` · muda para <b style="color:${ACCENT}">${esc(sched)}</b> quando terminar` : ""}</p>
          </div>
        </div>
        <a href="#/painel/plano" class="text-sm font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shrink-0">Gerir plano</a>
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
function settingsAccordion(o: { icon: string; title: string; desc: string; body: string; open?: boolean; danger?: boolean; lockedPlan?: string }): string {
  const danger = !!o.danger;
  const lock = o.lockedPlan
    ? `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[14px]">lock</span> ${esc(o.lockedPlan)}</span>`
    : "";
  return `<details ${o.open ? "open" : ""} class="mb-acc rounded-2xl border ${danger ? "border-red-200" : "border-gray-200"} bg-white overflow-hidden">
    <summary class="cursor-pointer flex items-center gap-4 p-5 hover:bg-gray-50/60 transition-colors">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="${danger ? "background:#fef2f2;color:#dc2626" : `background:${ACCENT_TINT};color:${ACCENT}`}"><span class="material-symbols-outlined">${o.icon}</span></div>
      <div class="flex-1 min-w-0"><h3 class="font-black ${danger ? "text-red-700" : "text-gray-900"} flex items-center gap-2">${esc(o.title)} ${lock}</h3><p class="text-sm text-gray-500">${esc(o.desc)}</p></div>
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
