/**
 * Painel de Administração da plataforma (/adminPainel). Apenas para contas com
 * `is_admin`. O admin vê e gere contas, lojas, levantamentos e pode abrir o
 * editor de qualquer loja. O acesso aos dados é garantido pelas políticas RLS
 * de admin (migração 0011).
 */
import { render, $, go, esc, toast, withBusy, formatKz } from "../lib/dom.js";
import { appState, logout, publicStoreUrl } from "../composition.js";
import {
  isCurrentUserAdmin, adminOverview, listAccounts, listStores, listAllWithdrawals,
  adminSetStoreState, adminDeleteStore, adminSetAccountPlan, adminDeleteAccount, adminProcessWithdrawal,
  type AdminStore, type AdminAccount, type AdminWithdrawal,
} from "../supabase/admin.js";
import { getPlan, isPlanId, PLAN_ORDER, type PlanId } from "../../src/services/plans.js";

const ACCENT = "#F95901";
const ACCENT_TINT = "rgba(249,89,1,.1)";

/* --------------------------------- Utils --------------------------------- */

function tabOf(): string {
  const m = location.pathname.match(/^\/adminPainel\/?([a-z]*)/i);
  return (m && m[1]) ? m[1].toLowerCase() : "overview";
}

function badge(text: string, bg: string, color: string): string {
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap" style="background:${bg};color:${color}">${esc(text)}</span>`;
}

function stateBadge(state: string): string {
  return state === "Publicada"
    ? badge("Publicada", "#ecfdf5", "#047857")
    : badge("Rascunho", "#f3f4f6", "#6b7280");
}

function planBadge(plan: string): string {
  return badge(getPlan(plan).name, ACCENT_TINT, ACCENT);
}

function activeBadge(active: boolean): string {
  return active ? badge("Ativa", "#ecfdf5", "#047857") : badge("Inativa", "#f3f4f6", "#9ca3af");
}

/** Chips das funcionalidades ativas de uma loja. `compact` mostra só as ativas. */
function featureChips(f: AdminStore["features"], compact = false): string {
  const defs: { on: boolean; icon: string; label: string }[] = [
    { on: f.online, icon: "credit_card", label: "Express + Ref." },
    { on: f.sms, icon: "sms", label: "SMS" },
    { on: f.whatsapp, icon: "chat", label: "WhatsApp" },
    { on: f.delivery, icon: "local_shipping", label: "Entregas" },
  ];
  const list = compact ? defs.filter((d) => d.on) : defs;
  if (compact && list.length === 0) return `<span class="text-xs text-gray-300">Sem funcionalidades ativas</span>`;
  return `<div class="flex flex-wrap gap-1.5">${list.map((d) => {
    const style = d.on ? `background:${ACCENT_TINT};color:${ACCENT}` : "background:#f3f4f6;color:#9ca3af";
    return `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style="${style}" title="${esc(d.label)}${d.on ? " (ativo)" : " (inativo)"}"><span class="material-symbols-outlined text-[14px]">${d.icon}</span>${esc(d.label)}</span>`;
  }).join("")}</div>`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(s: string): string {
  return (s || "?").trim().charAt(0).toUpperCase() || "?";
}

function metric(icon: string, label: string, value: string, accent = false): string {
  const ic = accent ? `background:${ACCENT};color:#fff` : `background:${ACCENT_TINT};color:${ACCENT}`;
  return `<div class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="${ic}"><span class="material-symbols-outlined">${icon}</span></div>
    <div><p class="text-sm text-gray-500 mb-0.5">${esc(label)}</p><p class="text-2xl font-black text-gray-900">${esc(value)}</p></div>
  </div>`;
}

const WD_STATUS = {
  requested: { label: "Pendente", bg: "#fff7ed", color: "#c2410c" },
  approved: { label: "Aprovado", bg: "#eff6ff", color: "#1d4ed8" },
  paid: { label: "Pago", bg: "#ecfdf5", color: "#047857" },
  rejected: { label: "Rejeitado", bg: "#fef2f2", color: "#b91c1c" },
} as const;

function wdStatusBadge(s: string): string {
  const cfg = (WD_STATUS as Record<string, { label: string; bg: string; color: string }>)[s];
  return cfg ? badge(cfg.label, cfg.bg, cfg.color) : badge(s, "#f3f4f6", "#6b7280");
}

/* -------------------------- View-model agregado -------------------------- */

interface AccountVM extends AdminAccount {
  stores: AdminStore[];
  publishedCount: number;
  active: boolean;
}

function buildAccountVMs(accounts: AdminAccount[], stores: AdminStore[]): AccountVM[] {
  const byOwner = new Map<string, AdminStore[]>();
  for (const s of stores) {
    const arr = byOwner.get(s.ownerId) ?? [];
    arr.push(s);
    byOwner.set(s.ownerId, arr);
  }
  return accounts.map((a) => {
    const own = byOwner.get(a.id) ?? [];
    const publishedCount = own.filter((s) => s.state === "Publicada").length;
    return { ...a, stores: own, publishedCount, active: publishedCount > 0 };
  });
}

/* ================================ Render ================================= */

export async function renderAdminPanel(): Promise<void> {
  appState.editOwnerId = null;

  const admin = await isCurrentUserAdmin();
  if (!admin) {
    render(`<div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 bg-gray-50">
      <span class="material-symbols-outlined text-gray-400" style="font-size:56px;">shield_lock</span>
      <h1 class="text-2xl font-black text-gray-900">Acesso restrito</h1>
      <p class="text-gray-500">Esta área é exclusiva para administradores da plataforma.</p>
      <a href="#/painel" class="text-white px-6 py-3 rounded-xl font-semibold" style="background:${ACCENT}">Ir para o meu painel</a>
    </div>`);
    return;
  }

  const tab = tabOf();
  const title = tab === "contas" ? "Contas" : tab === "lojas" ? "Lojas" : tab === "levantamentos" ? "Levantamentos" : "Visão geral";

  function navItem(href: string, icon: string, label: string, active: boolean): string {
    const base = "rounded-xl px-4 py-3 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors";
    const style = active ? `style="background:${ACCENT_TINT};color:${ACCENT}"` : "";
    const cls = active ? "" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
    return `<a href="${href}" class="${base} ${cls}" ${style}><span class="material-symbols-outlined">${icon}</span> ${label}</a>`;
  }

  function shell(content: string): string {
    return `
    <div class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
      <aside class="hidden md:flex flex-col py-6 bg-white border-r border-gray-100 w-64 shrink-0 sticky top-0 h-screen">
        <div class="px-6 mb-1 flex items-center gap-2">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </div>
        <span class="px-6 text-xs font-bold uppercase tracking-wider mb-6" style="color:${ACCENT}">Admin</span>
        <nav class="flex flex-col gap-1 px-2">
          ${navItem("#/adminPainel", "monitoring", "Visão geral", tab === "overview")}
          ${navItem("#/adminPainel/contas", "group", "Contas", tab === "contas")}
          ${navItem("#/adminPainel/lojas", "storefront", "Lojas", tab === "lojas")}
          ${navItem("#/adminPainel/levantamentos", "account_balance_wallet", "Levantamentos", tab === "levantamentos")}
        </nav>
        <div class="mt-auto px-2 flex flex-col gap-1">
          <a href="#/painel" class="rounded-xl px-4 py-3 mx-0 flex items-center gap-3 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined">dashboard</span> O meu painel</a>
          <button id="logout" class="rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined">logout</span> Terminar sessão</button>
        </div>
      </aside>
      <div class="flex-1 min-w-0 flex flex-col">
        <header class="bg-white/90 backdrop-blur border-b border-gray-100 sticky top-0 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-3.5">
          <div class="flex items-center gap-3 min-w-0">
            <h2 class="text-xl font-black tracking-tight">${esc(title)}</h2>
          </div>
          <div class="flex items-center gap-2">
            <button id="refresh" class="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full p-2 transition-colors" title="Atualizar"><span class="material-symbols-outlined text-[20px]">refresh</span></button>
            <span class="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full" style="background:${ACCENT_TINT};color:${ACCENT}">Administração</span>
          </div>
        </header>
        <nav class="md:hidden flex gap-1 overflow-x-auto px-3 py-2 bg-white border-b border-gray-100 sticky top-[57px] z-30">
          ${["", "contas", "lojas", "levantamentos"].map((t) => {
            const active = (t === "" ? "overview" : t) === tab;
            const label = t === "" ? "Visão geral" : t === "contas" ? "Contas" : t === "lojas" ? "Lojas" : "Levantamentos";
            return `<a href="#/adminPainel${t ? "/" + t : ""}" class="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors" style="${active ? `background:${ACCENT_TINT};color:${ACCENT}` : "color:#6b7280"}">${label}</a>`;
          }).join("")}
        </nav>
        <main class="flex-1 min-w-0 p-4 md:p-8"><div class="max-w-6xl mx-auto w-full">${content}</div></main>
      </div>
    </div>`;
  }

  function bindShell(): void {
    $("#logout")?.addEventListener("click", async () => { await logout(); go("#/"); });
    $("#refresh")?.addEventListener("click", () => { void renderAdminPanel(); });
  }

  function openStoreEditor(storeId: string, ownerId: string): void {
    appState.storeId = storeId;
    appState.editOwnerId = ownerId;
    go("#/personalizar");
  }

  if (tab === "contas") { await renderContas(); return; }
  if (tab === "lojas") { await renderLojas(); return; }
  if (tab === "levantamentos") { await renderLevantamentos(); return; }
  await renderOverview();

  /* ------------------------------- Visão geral ------------------------------ */
  async function renderOverview(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const [o, accounts, stores, withdrawals] = await Promise.all([
      adminOverview(), listAccounts(), listStores(), listAllWithdrawals(),
    ]);
    const vms = buildAccountVMs(accounts, stores);
    const activeCount = vms.filter((v) => v.active).length;

    const planDist = PLAN_ORDER.map((id) => ({ id, n: accounts.filter((a) => a.plan === id).length }));
    const planMax = Math.max(1, ...planDist.map((p) => p.n));
    const pendingWd = withdrawals.filter((w) => w.status === "requested");
    const recentAccounts = vms.slice(0, 6);
    const recentStores = stores.slice(0, 6);

    render(shell(`
      <section class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        ${metric("group", "Contas", String(o.accounts), true)}
        ${metric("verified_user", "Contas ativas", String(activeCount))}
        ${metric("storefront", "Lojas", String(o.stores))}
        ${metric("public", "Lojas publicadas", String(o.published))}
        ${metric("trending_up", "Vendas (total)", formatKz(o.salesTotal))}
        ${metric("account_balance_wallet", "Levant. pendentes", String(o.pendingWithdrawals))}
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-gray-200 rounded-2xl p-5 lg:col-span-1">
          <h3 class="font-black text-gray-900 mb-4">Distribuição por plano</h3>
          <div class="space-y-3">
            ${planDist.map((p) => `
              <div>
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="font-semibold text-gray-700">${esc(getPlan(p.id).name)}</span>
                  <span class="text-gray-400">${p.n}</span>
                </div>
                <div class="h-2 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.round((p.n / planMax) * 100)}%;background:${ACCENT}"></div></div>
              </div>`).join("")}
          </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden lg:col-span-2">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="font-black text-gray-900">Pedidos de levantamento pendentes</h3>
            <a href="#/adminPainel/levantamentos" class="text-sm font-semibold hover:underline" style="color:${ACCENT}">Ver todos</a>
          </div>
          ${pendingWd.length
            ? `<div class="divide-y divide-gray-50">${pendingWd.slice(0, 5).map((w) => `
                <div class="flex items-center gap-3 px-5 py-3">
                  <div class="flex-1 min-w-0"><p class="font-bold text-gray-900">${esc(formatKz(w.amount))}</p><p class="text-xs text-gray-400 truncate">${esc(w.storeName)} · ${esc(w.ownerEmail)}</p></div>
                  ${wdStatusBadge(w.status)}
                </div>`).join("")}</div>`
            : `<p class="px-5 py-10 text-center text-gray-400 text-sm">Sem pedidos pendentes.</p>`}
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="font-black text-gray-900">Contas recentes</h3>
            <a href="#/adminPainel/contas" class="text-sm font-semibold hover:underline" style="color:${ACCENT}">Gerir</a>
          </div>
          <div class="divide-y divide-gray-50">
            ${recentAccounts.map((a) => `
              <div class="flex items-center gap-3 px-5 py-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ACCENT}">${esc(initials(a.name || a.email))}</div>
                <div class="flex-1 min-w-0"><p class="font-semibold text-gray-900 truncate">${esc(a.name || "—")}</p><p class="text-xs text-gray-400 truncate">${esc(a.email)}</p></div>
                ${planBadge(a.plan)}
              </div>`).join("") || `<p class="px-5 py-10 text-center text-gray-400 text-sm">Sem contas.</p>`}
          </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="font-black text-gray-900">Lojas recentes</h3>
            <a href="#/adminPainel/lojas" class="text-sm font-semibold hover:underline" style="color:${ACCENT}">Gerir</a>
          </div>
          <div class="divide-y divide-gray-50">
            ${recentStores.map((s) => `
              <div class="flex items-center gap-3 px-5 py-3">
                <span class="material-symbols-outlined text-gray-300">storefront</span>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-gray-900 truncate">${esc(s.name)}</p>
                  <div class="mt-1">${featureChips(s.features, true)}</div>
                </div>
                ${stateBadge(s.state)}
              </div>`).join("") || `<p class="px-5 py-10 text-center text-gray-400 text-sm">Sem lojas.</p>`}
          </div>
        </div>
      </div>`));
    bindShell();
  }

  /* --------------------------------- Contas --------------------------------- */
  async function renderContas(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const [accounts, stores] = await Promise.all([listAccounts(), listStores()]);
    const vms = buildAccountVMs(accounts, stores);

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 class="text-xl font-black text-gray-900">Contas</h3>
          <p class="text-sm text-gray-400" id="acc-count">${vms.length} conta(s)</p>
        </div>
      </div>
      <div class="flex flex-col lg:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="acc-search" type="search" placeholder="Pesquisar por nome ou email…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0 overflow-x-auto">
          <button data-fil="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Todas</button>
          <button data-fil="active" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Ativas</button>
          <button data-fil="inactive" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Inativas</button>
          <button data-fil="admin" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Admins</button>
        </div>
        <select id="acc-plan" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-44 shrink-0">
          <option value="">Todos os planos</option>
          ${PLAN_ORDER.map((id) => `<option value="${id}">${esc(getPlan(id).name)}</option>`).join("")}
        </select>
        <select id="acc-sort" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-44 shrink-0">
          <option value="recent">Mais recentes</option>
          <option value="name">Nome (A–Z)</option>
          <option value="stores">Mais lojas</option>
        </select>
      </div>
      <div id="acc-list"></div>`));
    bindShell();

    let q = "";
    let fil: "all" | "active" | "inactive" | "admin" = "all";
    let planF = "";
    let sort: "recent" | "name" | "stores" = "recent";

    const applyFil = (): void => {
      document.querySelectorAll<HTMLElement>("[data-fil]").forEach((b) => {
        const active = b.dataset.fil === fil;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#acc-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      let rows = vms.filter((a) => {
        if (fil === "active" && !a.active) return false;
        if (fil === "inactive" && a.active) return false;
        if (fil === "admin" && !a.isAdmin) return false;
        if (planF && a.plan !== planF) return false;
        if (ql && !`${a.name} ${a.email}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      rows = rows.slice().sort((a, b) => {
        if (sort === "name") return (a.name || a.email).localeCompare(b.name || b.email, "pt");
        if (sort === "stores") return b.stores.length - a.stores.length;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const count = $("#acc-count");
      if (count) count.textContent = `${rows.length} de ${vms.length} conta(s)`;

      el.innerHTML = rows.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
             <div class="hidden md:grid grid-cols-[1fr_120px_90px_110px_120px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400">
               <span>Conta</span><span>Plano</span><span>Lojas</span><span>Estado</span><span class="text-right">Ações</span>
             </div>
             <div class="divide-y divide-gray-100">${rows.map(accountRow).join("")}</div>
           </div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma conta corresponde aos filtros.</div>`;
      bindAccountRows(el, draw);
    }

    applyFil();
    draw();
    ($("#acc-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    ($("#acc-plan") as HTMLSelectElement | null)?.addEventListener("change", (e) => { planF = (e.target as HTMLSelectElement).value; draw(); });
    ($("#acc-sort") as HTMLSelectElement | null)?.addEventListener("change", (e) => { sort = (e.target as HTMLSelectElement).value as typeof sort; draw(); });
    document.querySelectorAll<HTMLElement>("[data-fil]").forEach((b) =>
      b.addEventListener("click", () => { fil = b.dataset.fil as typeof fil; applyFil(); draw(); }));

    function accountRow(a: AccountVM): string {
      const planOptions = PLAN_ORDER.map((id) => `<option value="${id}" ${a.plan === id ? "selected" : ""}>${esc(getPlan(id).name)}</option>`).join("");
      const storesList = a.stores.length
        ? a.stores.map((s) => `
            <div class="flex items-center gap-2 py-2 flex-wrap">
              <span class="material-symbols-outlined text-gray-300 text-[20px]">storefront</span>
              <span class="font-semibold text-gray-800 text-sm truncate min-w-0">${esc(s.name)}</span>
              ${stateBadge(s.state)}
              <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="text-xs font-semibold hover:underline" style="color:${ACCENT}">${esc(s.subdomain)}</a>
              <div class="ml-auto flex items-center gap-1.5">
                <button data-edit-store="${esc(s.id)}" data-owner="${esc(a.id)}" class="inline-flex items-center gap-1 text-xs font-semibold text-white px-2.5 py-1 rounded-lg hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[16px]">palette</span> Editar</button>
                <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">open_in_new</span> Ver</a>
              </div>
              <div class="w-full pl-7">${featureChips(s.features)}</div>
            </div>`).join("")
        : `<p class="text-sm text-gray-400 py-2">Esta conta ainda não tem lojas.</p>`;

      return `<div data-acc-block="${esc(a.id)}">
        <div class="md:grid md:grid-cols-[1fr_120px_90px_110px_120px] md:items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors flex flex-wrap">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ACCENT}">${esc(initials(a.name || a.email))}</div>
            <div class="min-w-0">
              <p class="font-semibold text-gray-900 truncate flex items-center gap-1.5">${esc(a.name || "—")} ${a.isAdmin ? badge("Admin", "#eff6ff", "#1d4ed8") : ""}</p>
              <p class="text-xs text-gray-400 truncate">${esc(a.email)} · desde ${esc(fmtDate(a.createdAt))}</p>
            </div>
          </div>
          <div class="hidden md:block">${planBadge(a.plan)}</div>
          <div class="hidden md:block text-sm text-gray-600">${a.stores.length} ${a.publishedCount ? `<span class="text-gray-400">(${a.publishedCount} pub.)</span>` : ""}</div>
          <div class="hidden md:block">${activeBadge(a.active)}</div>
          <div class="flex md:justify-end items-center gap-1 mt-2 md:mt-0 w-full md:w-auto">
            <button data-expand="${esc(a.id)}" class="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">expand_more</span> Lojas</button>
            ${a.isAdmin ? "" : `<button data-del-acc="${esc(a.id)}" data-email="${esc(a.email)}" class="text-red-600 hover:bg-red-50 rounded-lg p-1.5 transition-colors" title="Cancelar conta"><span class="material-symbols-outlined text-[18px]">person_remove</span></button>`}
          </div>
        </div>
        <div data-detail="${esc(a.id)}" class="hidden bg-gray-50 border-t border-gray-100 px-5 py-4">
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <label class="text-sm font-semibold text-gray-700 flex items-center gap-2">Plano:
              <select data-plan-for="${esc(a.id)}" ${a.isAdmin ? "disabled" : ""} class="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#F95901] disabled:bg-gray-100 disabled:text-gray-400">${planOptions}</select>
            </label>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl px-4 py-2 divide-y divide-gray-50">${storesList}</div>
        </div>
      </div>`;
    }

    function bindAccountRows(scope: HTMLElement, refresh: () => void): void {
      scope.querySelectorAll<HTMLElement>("[data-expand]").forEach((b) =>
        b.addEventListener("click", () => {
          const id = b.dataset.expand!;
          const det = scope.querySelector<HTMLElement>(`[data-detail="${id}"]`);
          if (!det) return;
          det.classList.toggle("hidden");
          const ic = b.querySelector(".material-symbols-outlined");
          if (ic) ic.textContent = det.classList.contains("hidden") ? "expand_more" : "expand_less";
        }));
      scope.querySelectorAll<HTMLElement>("[data-edit-store]").forEach((b) =>
        b.addEventListener("click", () => openStoreEditor(b.dataset.editStore!, b.dataset.owner!)));
      scope.querySelectorAll<HTMLSelectElement>("[data-plan-for]").forEach((sel) =>
        sel.addEventListener("change", async () => {
          const id = sel.dataset.planFor!;
          if (!isPlanId(sel.value)) return;
          const ok = await withBusy(() => adminSetAccountPlan(id, sel.value as PlanId), "A atualizar plano…");
          if (ok) {
            const vm = vms.find((v) => v.id === id);
            if (vm) (vm as AccountVM).plan = sel.value;
            toast("Plano atualizado.");
            draw();
          } else toast("Não foi possível atualizar.", "error");
        }));
      scope.querySelectorAll<HTMLElement>("[data-del-acc]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.delAcc!;
          const email = b.dataset.email ?? "";
          const typed = prompt(`Cancelar esta conta remove TODAS as lojas e dados.\nEscreva o email para confirmar:\n\n${email}`);
          if (typed === null) return;
          if (typed.trim() !== email) { toast("Email não corresponde.", "error"); return; }
          const ok = await withBusy(() => adminDeleteAccount(id), "A cancelar conta…");
          if (ok) {
            const i = vms.findIndex((v) => v.id === id);
            if (i >= 0) vms.splice(i, 1);
            toast("Conta cancelada.");
            refresh();
          } else toast("Não foi possível cancelar.", "error");
        }));
    }
  }

  /* --------------------------------- Lojas --------------------------------- */
  async function renderLojas(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const stores = await listStores();

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 class="text-xl font-black text-gray-900">Lojas</h3>
          <p class="text-sm text-gray-400" id="store-count">${stores.length} loja(s)</p>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="store-search" type="search" placeholder="Pesquisar por loja, dono ou endereço…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0">
          <button data-st="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Todas</button>
          <button data-st="published" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Publicadas</button>
          <button data-st="draft" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Rascunho</button>
        </div>
        <select id="store-feat" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-52 shrink-0">
          <option value="">Todas as funcionalidades</option>
          <option value="online">Com Express + Referência</option>
          <option value="sms">Com SMS de confirmação</option>
          <option value="whatsapp">Com WhatsApp</option>
          <option value="delivery">Com entregas</option>
        </select>
      </div>
      <div id="store-list"></div>`));
    bindShell();

    let q = "";
    let st: "all" | "published" | "draft" = "all";
    let feat: "" | "online" | "sms" | "whatsapp" | "delivery" = "";
    const applySt = (): void => {
      document.querySelectorAll<HTMLElement>("[data-st]").forEach((b) => {
        const active = b.dataset.st === st;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#store-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = stores.filter((s) => {
        if (st === "published" && s.state !== "Publicada") return false;
        if (st === "draft" && s.state === "Publicada") return false;
        if (feat && !s.features[feat]) return false;
        if (ql && !`${s.name} ${s.ownerEmail} ${s.ownerName} ${s.subdomain}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      const count = $("#store-count");
      if (count) count.textContent = `${rows.length} de ${stores.length} loja(s)`;
      el.innerHTML = rows.length
        ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${rows.map(storeCard).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma loja corresponde aos filtros.</div>`;
      bindStoreCards(el, draw);
    }

    applySt();
    draw();
    ($("#store-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    ($("#store-feat") as HTMLSelectElement | null)?.addEventListener("change", (e) => { feat = (e.target as HTMLSelectElement).value as typeof feat; draw(); });
    document.querySelectorAll<HTMLElement>("[data-st]").forEach((b) =>
      b.addEventListener("click", () => { st = b.dataset.st as typeof st; applySt(); draw(); }));

    function bindStoreCards(scope: HTMLElement, refresh: () => void): void {
      scope.querySelectorAll<HTMLElement>("[data-edit-store]").forEach((b) =>
        b.addEventListener("click", () => {
          const s = stores.find((x) => x.id === b.dataset.editStore);
          if (s) openStoreEditor(s.id, s.ownerId);
        }));
      scope.querySelectorAll<HTMLElement>("[data-toggle-store]").forEach((b) =>
        b.addEventListener("click", async () => {
          const s = stores.find((x) => x.id === b.dataset.toggleStore);
          if (!s) return;
          const next = s.state === "Publicada" ? "Rascunho" : "Publicada";
          const ok = await withBusy(() => adminSetStoreState(s.id, next), "A atualizar…");
          if (ok) { s.state = next; toast("Estado atualizado."); refresh(); } else toast("Falhou.", "error");
        }));
      scope.querySelectorAll<HTMLElement>("[data-del-store]").forEach((b) =>
        b.addEventListener("click", async () => {
          const s = stores.find((x) => x.id === b.dataset.delStore);
          if (!s) return;
          const typed = prompt(`Apagar a loja "${s.name}" remove tudo permanentemente.\nEscreva o nome para confirmar:`);
          if (typed === null) return;
          if (typed.trim() !== s.name.trim()) { toast("Nome não corresponde.", "error"); return; }
          const ok = await withBusy(() => adminDeleteStore(s.id), "A apagar loja…");
          if (ok) { const i = stores.indexOf(s); if (i >= 0) stores.splice(i, 1); toast("Loja apagada."); refresh(); } else toast("Falhou.", "error");
        }));
    }
  }

  function storeCard(s: AdminStore): string {
    return `<div class="bg-white border border-gray-200 rounded-2xl p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-black text-gray-900 truncate">${esc(s.name)}</p>
          <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="text-xs font-semibold hover:underline" style="color:${ACCENT}">${esc(s.subdomain)}</a>
          <p class="text-xs text-gray-400 mt-1 truncate">${esc(s.ownerName || "—")} · ${esc(s.ownerEmail)}</p>
          <p class="text-xs text-gray-300 mt-0.5">Criada ${esc(fmtDate(s.createdAt))}</p>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0">${stateBadge(s.state)}${planBadge(s.plan)}</div>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-100">
        <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Funcionalidades</p>
        ${featureChips(s.features)}
      </div>
      <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
        <button data-edit-store="${esc(s.id)}" class="inline-flex items-center gap-1 text-sm font-semibold text-white px-3 py-1.5 rounded-lg transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span> Editar</button>
        <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">open_in_new</span> Ver</a>
        <button data-toggle-store="${esc(s.id)}" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">${s.state === "Publicada" ? "visibility_off" : "public"}</span> ${s.state === "Publicada" ? "Despublicar" : "Publicar"}</button>
        <button data-del-store="${esc(s.id)}" class="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>
    </div>`;
  }

  /* ------------------------------ Levantamentos ------------------------------ */
  async function renderLevantamentos(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const items = await listAllWithdrawals();
    const sum = (st: string): number => items.filter((w) => w.status === st).reduce((s, w) => s + w.amount, 0);
    const totalPending = sum("requested") + sum("approved");
    const totalPaid = sum("paid");

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        ${metric("hourglass_top", "Por pagar", formatKz(totalPending), true)}
        ${metric("check_circle", "Já pago", formatKz(totalPaid))}
        ${metric("receipt_long", "Pedidos", String(items.length))}
        ${metric("schedule", "Pendentes", String(items.filter((w) => w.status === "requested").length))}
      </section>
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="wd-search" type="search" placeholder="Pesquisar por loja ou email…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0 overflow-x-auto">
          <button data-wf="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Todos</button>
          <button data-wf="requested" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Pendentes</button>
          <button data-wf="approved" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Aprovados</button>
          <button data-wf="paid" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Pagos</button>
          <button data-wf="rejected" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Rejeitados</button>
        </div>
      </div>
      <div id="wd-list"></div>`));
    bindShell();

    let q = "";
    let wf: "all" | "requested" | "approved" | "paid" | "rejected" = "all";
    const applyWf = (): void => {
      document.querySelectorAll<HTMLElement>("[data-wf]").forEach((b) => {
        const active = b.dataset.wf === wf;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#wd-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = items.filter((w) => {
        if (wf !== "all" && w.status !== wf) return false;
        if (ql && !`${w.storeName} ${w.ownerEmail}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      el.innerHTML = rows.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">${rows.map(withdrawalRow).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhum pedido corresponde aos filtros.</div>`;
      el.querySelectorAll<HTMLElement>("[data-wd]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.wd!;
          const action = b.dataset.action as "approved" | "paid" | "rejected";
          const w = items.find((x) => x.id === id);
          if (!w) return;
          const ok = await withBusy(() => adminProcessWithdrawal(id, action), "A atualizar…");
          if (ok) { w.status = action; w.processedAt = new Date().toISOString(); toast("Levantamento atualizado."); draw(); }
          else toast("Falhou.", "error");
        }));
    }

    applyWf();
    draw();
    ($("#wd-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    document.querySelectorAll<HTMLElement>("[data-wf]").forEach((b) =>
      b.addEventListener("click", () => { wf = b.dataset.wf as typeof wf; applyWf(); draw(); }));
  }

  function withdrawalRow(w: AdminWithdrawal): string {
    const actions = w.status === "requested" || w.status === "approved"
      ? `<div class="flex gap-1.5 flex-wrap">
          ${w.status === "requested" ? `<button data-wd="${esc(w.id)}" data-action="approved" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Aprovar</button>` : ""}
          <button data-wd="${esc(w.id)}" data-action="paid" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white" style="background:#047857">Marcar pago</button>
          <button data-wd="${esc(w.id)}" data-action="rejected" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Rejeitar</button>
        </div>`
      : "";
    return `<div class="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors flex-wrap">
      <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">payments</span></div>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-900">${esc(formatKz(w.amount))}</p>
        <p class="text-xs text-gray-400 truncate">${esc(w.storeName)} · ${esc(w.ownerEmail)} · ${esc(fmtDate(w.createdAt))}</p>
        ${w.iban ? `<p class="text-xs text-gray-400 truncate">${esc(w.beneficiaryName || "")} · ${esc(w.bankName || "")} · ${esc(w.iban)}</p>` : ""}
      </div>
      ${wdStatusBadge(w.status)}
      ${actions}
    </div>`;
  }

  function loadingBlock(): string {
    return `<div class="flex items-center justify-center py-20"><span class="material-symbols-outlined animate-spin text-gray-300" style="font-size:40px">progress_activity</span></div>`;
  }
}
