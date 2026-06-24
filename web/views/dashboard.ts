/**
 * Painel de Administração — Início, Produtos, Pagamentos, Configurações.
 * Identidade visual MôBisno (branco + #F95901). Logótipo, banners e aparência
 * vivem no ecrã "Personalizar".
 */
import { render, $, go, esc, toast, formatKz, withBusy, fadeInImages } from "../lib/dom.js";
import { appState, currentOwnerId, logout, storeRepository, productRepository, adminPanelFor, getOwnerPlan, setOwnerPlan, countPublishedStores, publicStoreUrl } from "../composition.js";
import { openProductForm } from "../lib/productForm.js";
import { getPlan, listPlans, planRank, canAddProducts, remainingProducts, formatLimit, isPlanId, type Plan } from "../../src/services/plans.js";
import type { Store, Product } from "../../src/models/index.js";

const ACCENT = "#F95901";
const ACCENT_TINT = "rgba(249,89,1,.1)";

function navItem(href: string, icon: string, label: string, active: boolean): string {
  const base = "rounded-xl px-4 py-3 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors";
  const style = active ? `style="background:${ACCENT_TINT};color:${ACCENT}"` : "";
  const cls = active ? "" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  return `<a href="${href}" class="${base} ${cls}" ${style}><span class="material-symbols-outlined">${icon}</span> ${label}</a>`;
}

function currentTab(): string {
  const m = location.hash.match(/^#\/painel\/?([a-z]*)/i);
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
  if (tab === "pagamentos") {
    const methods = plan.features.multicaixaCheckout
      ? "WhatsApp, Multicaixa Express e referência bancária"
      : "Checkout via WhatsApp";
    const extra = plan.features.multicaixaCheckout
      ? "O seu plano inclui pagamentos Multicaixa Express e referência bancária."
      : "O plano Básico inclui checkout via WhatsApp. Faça upgrade para Profissional para desbloquear Multicaixa Express e referência bancária.";
    render(shell(stub("payments", "Pagamentos", `Métodos ativos: ${methods}. ${extra}`))); bindShell(); return;
  }
  if (tab === "config") { render(shell(stub("settings", "Configurações gerais", "Nome da loja, subdomínio, idioma e preferências. Em breve."))); bindShell(); return; }

  // --- Início ---
  const products = await productRepository.listByStore(store.id);
  const prodLimit = plan.limits.maxProductsPerStore;
  render(shell(`
    <section class="mb-8 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-2xl md:text-3xl font-black tracking-tight break-words">Olá, ${esc(store.name)} 👋</h3>
        <p class="text-gray-500 mt-1 break-words">Endereço: <span class="font-semibold" style="color:${ACCENT}">${esc(store.subdomain)}</span></p>
      </div>
      <a href="#/painel/plano" class="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-full text-sm" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> Plano ${esc(plan.name)}</a>
    </section>
    <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      ${metric("inventory_2", "Produtos", `${products.length}${Number.isFinite(prodLimit) ? ` / ${prodLimit}` : ""}`)}
      ${metric("payments", "Vendas (mês)", "Kz 0,00")}
      ${metric("storefront", "Estado", store.state)}
    </section>
    <section class="text-white rounded-3xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-4" style="background:linear-gradient(135deg,#F95901,#ff7e33)">
      <div>
        <h4 class="text-xl font-black">Construa a sua loja</h4>
        <p class="opacity-90 mt-1">Edite logótipo, cores, textos, banners e produtos diretamente na loja.</p>
      </div>
      <a href="#/personalizar" class="bg-white font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 w-fit transition-transform active:scale-95" style="color:${ACCENT}"><span class="material-symbols-outlined">palette</span> Personalizar agora</a>
    </section>`));
  bindShell();

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
      b.addEventListener("click", async () => {
        const id = b.dataset.plan;
        if (!isPlanId(id) || id === plan.id) return;
        const ok = await withBusy(() => setOwnerPlan(id), "A atualizar plano…");
        if (ok) { toast(`Plano atualizado para ${getPlan(id).name}.`); await renderDashboard(); }
        else toast("Não foi possível atualizar o plano. Tente novamente.", "error");
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

function stub(icon: string, title: string, desc: string): string {
  return `<div class="bg-white border border-gray-200 rounded-3xl p-12 flex flex-col items-center text-center gap-3">
    <span class="material-symbols-outlined" style="font-size:48px;color:${ACCENT}">${icon}</span>
    <h3 class="text-xl font-black text-gray-900">${esc(title)}</h3>
    <p class="text-gray-500 max-w-md">${esc(desc)}</p>
    <span class="mt-2 text-xs bg-gray-100 px-3 py-1 rounded-full text-gray-500">Em breve</span>
  </div>`;
}
