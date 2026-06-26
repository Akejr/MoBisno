/**
 * Painel de Administração — Início, Produtos, Pagamentos, Configurações.
 * Identidade visual MôBisno (branco + #F95901). Logótipo, banners e aparência
 * vivem no ecrã "Personalizar".
 */
import { render, $, go, esc, toast, formatKz, withBusy, fadeInImages } from "../lib/dom.js";
import { appState, currentOwnerId, logout, storeRepository, productRepository, adminPanelFor, getOwnerPlan, countPublishedStores, publicStoreUrl, deleteStore, setStoreState, getOwnerName } from "../composition.js";
import { openProductForm } from "../lib/productForm.js";
import { getPlan, listPlans, planRank, canAddProducts, remainingProducts, formatLimit, isPlanId, type Plan } from "../../src/services/plans.js";
import type { Store, Product } from "../../src/models/index.js";
import { getPaymentConfig, savePaymentConfig, getOrderStats, listOrders, type PaymentConfig, type OrderRow } from "../supabase/payments.js";
import { listWithdrawals, committedWithdrawals, requestWithdrawal, type WithdrawalRow } from "../supabase/withdrawals.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { resolveWaPhone } from "../lib/whatsapp.js";
import { openPlanCheckout } from "../lib/planCheckout.js";
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
  const ownerId = appState.ownerId ?? (await currentOwnerId());
  if (!ownerId) {
    render(emptyState("lock", "Inicie sessão para aceder ao painel.",
      `<a href="#/login" class="text-white px-6 py-3 rounded-xl font-semibold" style="background:${ACCENT}">Iniciar sessão</a>
       <a href="#/criar" class="border border-gray-200 text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50">Criar loja</a>`));
    return;
  }
  const stores = await storeRepository.listByOwner(ownerId);
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
  const plan = getPlan(await getOwnerPlan(ownerId));
  const tab = currentTab();
  const storeUrl = publicStoreUrl(store.identifier);

  function shell(content: string): string {
    return `
    <div class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
      <aside class="hidden md:flex flex-col py-6 bg-white border-r border-gray-100 w-64 shrink-0 sticky top-0 h-screen">
        <div class="px-6 mb-6">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
          <span class="text-xs text-gray-400 uppercase tracking-wider mt-2 block">Administrador</span>
        </div>
        <div class="px-4 mb-4">
          <label class="text-xs text-gray-400 block mb-1.5 font-medium">Loja atual</label>
          ${stores.length > 1
            ? `<select id="store-switch" class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#F95901]">
                 ${stores.map((s) => `<option value="${esc(s.id)}" ${s.id === store!.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
               </select>`
            : `<div class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 truncate">${esc(store!.name)}</div>`}
          <a href="#/criar" class="mt-2 text-sm flex items-center gap-1 hover:underline" style="color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add_business</span> Nova loja</a>
        </div>
        <nav class="flex flex-col gap-1 px-2">
          ${navItem("#/painel", "home", "Início", tab === "inicio")}
          ${navItem("#/painel/produtos", "inventory_2", "Produtos", tab === "produtos")}
          ${navItem("#/painel/pagamentos", "payments", "Pagamentos", tab === "pagamentos")}
          ${navItem("#/painel/plano", "workspace_premium", "Plano", tab === "plano")}
          ${navItem("#/painel/config", "settings", "Configurações", tab === "config")}
        </nav>
        <div class="mt-auto px-4">
          <button id="logout" class="w-full text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-semibold px-2 py-2 transition-colors"><span class="material-symbols-outlined">logout</span> Terminar sessão</button>
        </div>
      </aside>

      <div class="flex-1 min-w-0 flex flex-col">
        <header class="bg-white/90 backdrop-blur border-b border-gray-100 sticky top-0 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-3">
          <h2 class="text-xl font-black tracking-tight capitalize">${tab === "inicio" ? "Início" : tab === "config" ? "Configurações" : tab === "plano" ? "Plano" : esc(tab)}</h2>
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

    const greeting = `
      <section class="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-2xl md:text-3xl font-black tracking-tight break-words">Olá, ${esc(ownerName)}</h3>
          <p class="text-gray-500 mt-1 break-words">Endereço: <a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="font-semibold hover:underline" style="color:${ACCENT}">${esc(store!.subdomain)}</a></p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style="background:${published ? "#ecfdf5" : "#f3f4f6"};color:${published ? "#047857" : "#6b7280"}"><span class="w-2 h-2 rounded-full" style="background:currentColor"></span> ${published ? "Publicada" : "Não publicada"}</span>
          <button id="toggle-state" class="text-sm font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">${published ? "Despublicar" : "Publicar"}</button>
          <a href="#/painel/plano" class="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-full text-sm" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> ${esc(plan.name)}</a>
        </div>
      </section>`;

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
    const usage = Number.isFinite(limit) ? `${list.length} / ${limit} produto(s)` : `${list.length} produto(s)`;
    const addBtn = atLimit
      ? `<a href="#/painel/plano" class="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">lock</span> Limite atingido — fazer upgrade</a>`
      : `<button id="add" class="text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add</span> Adicionar produto</button>`;
    render(shell(`
      <div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p class="text-gray-500">${usage}</p>
        ${addBtn}
      </div>
      ${atLimit ? `<div class="mb-5 rounded-xl px-4 py-3 text-sm flex items-center gap-2" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">info</span> Atingiu o limite de ${formatLimit(limit)} produtos do plano ${esc(plan.name)}. Faça upgrade para adicionar mais.</div>` : ""}
      <div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
        ${list.length === 0
          ? `<p class="text-gray-500 p-6 text-center">Ainda não há produtos. Adicione o primeiro.</p>`
          : list.map((p) => productRow(p)).join("")}
      </div>`));

    fadeInImages(document.querySelector("main") ?? document);
    bindShell();

    const cats = [...new Set(list.map((p) => p.category).filter((c): c is string => !!c))];

    $("#add")?.addEventListener("click", () => {
      if (!canAddProducts(plan, list.length)) { toast(`Limite de ${formatLimit(plan.limits.maxProductsPerStore)} produtos atingido no plano ${plan.name}.`, "error"); return; }
      openProductForm({ panel, ownerId, storeId: store!.id, categories: cats, onDone: renderProdutos });
    });

    document.querySelectorAll<HTMLElement>("[data-edit-prod]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = list.find((x) => x.id === b.dataset.editProd);
        if (p) openProductForm({ panel, ownerId, storeId: store!.id, product: p, categories: cats, onDone: renderProdutos });
      }));

    document.querySelectorAll<HTMLElement>("[data-del-prod]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.delProd!;
        const req = await panel.controllers.products.requestRemoval(ownerId, store!.id, id);
        if (req.status !== "confirmation_required") { toast(req.message, "error"); return; }
        if (!confirm(req.prompt.message)) return;
        const done = await withBusy(
          () => panel.controllers.products.confirmRemoval(ownerId, store!.id, id),
          "A remover produto…",
        );
        if (done.status === "removed") { toast(done.message); await renderProdutos(); }
        else toast(done.message, "error");
      }));
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

  async function renderConfig(): Promise<void> {
    const c = await getCustomization(store!.id);
    const canDomain = plan.features.customDomain;
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
      <p class="text-sm text-gray-500 mb-4">Ative para que o seu cliente receba um <b>SMS de confirmação</b> assim que a compra for concluída, com os detalhes da encomenda.</p>
      <div class="mb-2">${toggle("sms-enabled", !!c.sms?.enabled, "Enviar SMS de confirmação ao cliente")}</div>
      <p class="text-xs text-gray-400">O número usado é o que o cliente indica no checkout.</p>
      <button id="save-sms" class="mt-5 text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>`;

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
        ${settingsAccordion({ icon: "local_shipping", title: "Entregas", desc: "Declare as taxas de entrega da sua loja por zona.", body: deliveryBody, open: true })}
        ${settingsAccordion({ icon: "sms", title: "SMS de confirmação", desc: "Ative o SMS de confirmação de compra que o seu cliente recebe.", body: smsBody })}
        ${settingsAccordion({ icon: "language", title: "Domínio", desc: "Ligue o seu próprio domínio à loja.", body: domainBody })}
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

function productRow(p: Product): string {
  const thumb = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" class="w-12 h-12 rounded-xl object-cover border border-gray-200" />`
    : `<div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><span class="material-symbols-outlined text-gray-400">image</span></div>`;
  return `<div class="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
    ${thumb}
    <div class="flex flex-col min-w-0 flex-1">
      <span class="font-semibold text-gray-900 truncate">${esc(p.name)} ${p.available ? "" : '<span class="text-xs text-gray-400">(indisponível)</span>'}</span>
      <span class="text-xs text-gray-500 truncate">${esc(formatKz(p.price))}${p.description ? " · " + esc(p.description) : ""}</span>
    </div>
    <button data-edit-prod="${esc(p.id)}" class="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg p-2 transition-colors"><span class="material-symbols-outlined text-[20px]">edit</span></button>
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
      ${orderStatusBadge(o.status)}
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

/** Secção em acordeão (Configurações). */
function settingsAccordion(o: { icon: string; title: string; desc: string; body: string; open?: boolean; danger?: boolean }): string {
  const danger = !!o.danger;
  return `<details ${o.open ? "open" : ""} class="mb-acc rounded-2xl border ${danger ? "border-red-200" : "border-gray-200"} bg-white overflow-hidden">
    <summary class="cursor-pointer flex items-center gap-4 p-5 hover:bg-gray-50/60 transition-colors">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="${danger ? "background:#fef2f2;color:#dc2626" : `background:${ACCENT_TINT};color:${ACCENT}`}"><span class="material-symbols-outlined">${o.icon}</span></div>
      <div class="flex-1 min-w-0"><h3 class="font-black ${danger ? "text-red-700" : "text-gray-900"}">${esc(o.title)}</h3><p class="text-sm text-gray-500">${esc(o.desc)}</p></div>
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
