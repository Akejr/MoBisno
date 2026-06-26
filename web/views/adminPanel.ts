/**
 * Painel de Administração da plataforma (/adminPainel). Apenas para contas com
 * `is_admin`. O admin vê e gere contas, lojas, levantamentos e pode abrir o
 * editor de qualquer loja. O acesso aos dados é garantido pelas políticas RLS
 * de admin (migração 0011).
 */
import { render, $, go, esc, toast, withBusy, formatKz, fadeInImages } from "../lib/dom.js";
import { appState, logout, publicStoreUrl } from "../composition.js";
import {
  isCurrentUserAdmin, adminOverview, listAccounts, listStores, listAllWithdrawals,
  adminSetStoreState, adminDeleteStore, adminSetAccountPlan, adminDeleteAccount, adminProcessWithdrawal,
  type AdminStore, type AdminAccount, type AdminWithdrawal,
} from "../supabase/admin.js";
import { getPlan, isPlanId, PLAN_ORDER } from "../../src/services/plans.js";

const ACCENT = "#F95901";
const ACCENT_TINT = "rgba(249,89,1,.1)";

function tabOf(): string {
  const m = location.pathname.match(/^\/adminPainel\/?([a-z]*)/i);
  return (m && m[1]) ? m[1].toLowerCase() : "overview";
}

function navItem(href: string, icon: string, label: string, active: boolean): string {
  const base = "rounded-xl px-4 py-3 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors";
  const style = active ? `style="background:${ACCENT_TINT};color:${ACCENT}"` : "";
  const cls = active ? "" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  return `<a href="${href}" class="${base} ${cls}" ${style}><span class="material-symbols-outlined">${icon}</span> ${label}</a>`;
}

function badge(text: string, bg: string, color: string): string {
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap" style="background:${bg};color:${color}">${esc(text)}</span>`;
}

function stateBadge(state: string): string {
  return state === "Publicada" ? badge("Publicada", "#ecfdf5", "#047857") : badge("Não publicada", "#f3f4f6", "#6b7280");
}

function planBadge(plan: string): string {
  return badge(getPlan(plan).name, ACCENT_TINT, ACCENT);
}

function metric(icon: string, label: string, value: string): string {
  return `<div class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">${icon}</span></div>
    <div><p class="text-sm text-gray-500 mb-0.5">${esc(label)}</p><p class="text-2xl font-black text-gray-900">${esc(value)}</p></div>
  </div>`;
}

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
          <h2 class="text-xl font-black tracking-tight">${tab === "overview" ? "Visão geral" : tab === "contas" ? "Contas" : tab === "lojas" ? "Lojas" : "Levantamentos"}</h2>
          <span class="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full" style="background:${ACCENT_TINT};color:${ACCENT}">Administração</span>
        </header>
        <main class="flex-1 min-w-0 p-4 md:p-8"><div class="max-w-6xl mx-auto w-full">${content}</div></main>
      </div>
    </div>`;
  }

  function bindShell(): void {
    $("#logout")?.addEventListener("click", async () => { await logout(); go("#/"); });
  }

  if (tab === "contas") { await renderContas(); return; }
  if (tab === "lojas") { await renderLojas(); return; }
  if (tab === "levantamentos") { await renderLevantamentos(); return; }

  // Visão geral
  const o = await adminOverview();
  render(shell(`
    <section class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      ${metric("group", "Contas", String(o.accounts))}
      ${metric("storefront", "Lojas", String(o.stores))}
      ${metric("public", "Lojas publicadas", String(o.published))}
      ${metric("trending_up", "Vendas (total)", formatKz(o.salesTotal))}
      ${metric("account_balance_wallet", "Levantamentos pendentes", String(o.pendingWithdrawals))}
    </section>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <a href="#/adminPainel/contas" class="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#F95901] transition-colors flex items-center gap-3"><span class="material-symbols-outlined" style="color:${ACCENT}">group</span> <span class="font-semibold">Gerir contas</span></a>
      <a href="#/adminPainel/lojas" class="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#F95901] transition-colors flex items-center gap-3"><span class="material-symbols-outlined" style="color:${ACCENT}">storefront</span> <span class="font-semibold">Gerir lojas</span></a>
      <a href="#/adminPainel/levantamentos" class="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#F95901] transition-colors flex items-center gap-3"><span class="material-symbols-outlined" style="color:${ACCENT}">account_balance_wallet</span> <span class="font-semibold">Levantamentos</span></a>
    </div>`));
  bindShell();

  /* --------------------------------- Contas --------------------------------- */
  async function renderContas(): Promise<void> {
    const accounts = await listAccounts();
    render(shell(`
      <div class="relative mb-4 max-w-md">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
        <input id="acc-search" type="search" placeholder="Pesquisar por nome ou email…" class="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]" />
      </div>
      <div id="acc-list"></div>`));
    bindShell();

    let q = "";
    function draw(): void {
      const el = $("#acc-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = accounts.filter((a) => !ql || `${a.name} ${a.email}`.toLowerCase().includes(ql));
      el.innerHTML = rows.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">${rows.map(accountRow).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma conta encontrada.</div>`;
      bindAccountRows(el, draw);
    }
    draw();
    ($("#acc-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
  }

  function bindAccountRows(scope: HTMLElement, refresh: () => void): void {
    scope.querySelectorAll<HTMLSelectElement>("[data-plan-for]").forEach((sel) =>
      sel.addEventListener("change", async () => {
        const id = sel.dataset.planFor!;
        if (!isPlanId(sel.value)) return;
        const ok = await withBusy(() => adminSetAccountPlan(id, sel.value as never), "A atualizar plano…");
        ok ? toast("Plano atualizado.") : toast("Não foi possível atualizar.", "error");
      }));
    scope.querySelectorAll<HTMLElement>("[data-del-acc]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.delAcc!;
        const email = b.dataset.email ?? "";
        const typed = prompt(`Cancelar esta conta remove TODAS as lojas e dados.\nEscreva o email para confirmar:\n\n${email}`);
        if (typed === null) return;
        if (typed.trim() !== email) { toast("Email não corresponde.", "error"); return; }
        const ok = await withBusy(() => adminDeleteAccount(id), "A cancelar conta…");
        if (ok) { toast("Conta cancelada."); refresh(); } else toast("Não foi possível cancelar.", "error");
      }));
  }

  /* --------------------------------- Lojas --------------------------------- */
  async function renderLojas(): Promise<void> {
    const stores = await listStores();
    render(shell(`
      <div class="relative mb-4 max-w-md">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
        <input id="store-search" type="search" placeholder="Pesquisar por loja, dono ou endereço…" class="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]" />
      </div>
      <div id="store-list"></div>`));
    bindShell();

    let q = "";
    function draw(): void {
      const el = $("#store-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = stores.filter((s) => !ql || `${s.name} ${s.ownerEmail} ${s.subdomain}`.toLowerCase().includes(ql));
      el.innerHTML = rows.length
        ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${rows.map(storeCard).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma loja encontrada.</div>`;
      bindStoreCards(el, stores, draw);
    }
    draw();
    ($("#store-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
  }

  function bindStoreCards(scope: HTMLElement, stores: AdminStore[], refresh: () => void): void {
    scope.querySelectorAll<HTMLElement>("[data-edit-store]").forEach((b) =>
      b.addEventListener("click", () => {
        const s = stores.find((x) => x.id === b.dataset.editStore);
        if (!s) return;
        appState.storeId = s.id;
        appState.editOwnerId = s.ownerId;
        go("#/personalizar");
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

  /* ------------------------------ Levantamentos ------------------------------ */
  async function renderLevantamentos(): Promise<void> {
    const items = await listAllWithdrawals();
    render(shell(`
      <div id="wd-list"></div>`));
    bindShell();

    function draw(): void {
      const el = $("#wd-list");
      if (!el) return;
      el.innerHTML = items.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">${items.map(withdrawalRow).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Sem pedidos de levantamento.</div>`;
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
    draw();
  }

  /* --------------------------------- Linhas --------------------------------- */
  function accountRow(a: AdminAccount): string {
    const planOptions = PLAN_ORDER.map((id) => `<option value="${id}" ${a.plan === id ? "selected" : ""}>${esc(getPlan(id).name)}</option>`).join("");
    return `<div class="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors flex-wrap">
      <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ACCENT}">${esc((a.name || a.email || "?").charAt(0).toUpperCase())}</div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-900 truncate">${esc(a.name || "—")} ${a.isAdmin ? badge("Admin", "#eff6ff", "#1d4ed8") : ""}</p>
        <p class="text-xs text-gray-400 truncate">${esc(a.email)} · ${a.storeCount} loja(s)</p>
      </div>
      <select data-plan-for="${esc(a.id)}" ${a.isAdmin ? "disabled" : ""} class="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#F95901] disabled:bg-gray-50 disabled:text-gray-400">${planOptions}</select>
      ${a.isAdmin ? "" : `<button data-del-acc="${esc(a.id)}" data-email="${esc(a.email)}" class="text-red-600 hover:bg-red-50 rounded-lg p-2 shrink-0 transition-colors" title="Cancelar conta"><span class="material-symbols-outlined text-[20px]">person_remove</span></button>`}
    </div>`;
  }

  function storeCard(s: AdminStore): string {
    return `<div class="bg-white border border-gray-200 rounded-2xl p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-black text-gray-900 truncate">${esc(s.name)}</p>
          <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="text-xs font-semibold hover:underline" style="color:${ACCENT}">${esc(s.subdomain)}</a>
          <p class="text-xs text-gray-400 mt-1 truncate">${esc(s.ownerName || "—")} · ${esc(s.ownerEmail)}</p>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0">${stateBadge(s.state)}${planBadge(s.plan)}</div>
      </div>
      <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
        <button data-edit-store="${esc(s.id)}" class="inline-flex items-center gap-1 text-sm font-semibold text-white px-3 py-1.5 rounded-lg transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span> Editar</button>
        <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">open_in_new</span> Ver</a>
        <button data-toggle-store="${esc(s.id)}" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">${s.state === "Publicada" ? "visibility_off" : "public"}</span> ${s.state === "Publicada" ? "Despublicar" : "Publicar"}</button>
        <button data-del-store="${esc(s.id)}" class="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>
    </div>`;
  }

  function wStatusBadge(s: string): string {
    switch (s) {
      case "requested": return badge("Pendente", "#fff7ed", "#c2410c");
      case "approved": return badge("Aprovado", "#eff6ff", "#1d4ed8");
      case "paid": return badge("Pago", "#ecfdf5", "#047857");
      case "rejected": return badge("Rejeitado", "#fef2f2", "#b91c1c");
      default: return badge(s, "#f3f4f6", "#6b7280");
    }
  }

  function withdrawalRow(w: AdminWithdrawal): string {
    const date = new Date(w.createdAt);
    const dateStr = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-PT");
    const actions = w.status === "requested" || w.status === "approved"
      ? `<div class="flex gap-1.5">
          ${w.status === "requested" ? `<button data-wd="${esc(w.id)}" data-action="approved" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Aprovar</button>` : ""}
          <button data-wd="${esc(w.id)}" data-action="paid" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white" style="background:#047857">Marcar pago</button>
          <button data-wd="${esc(w.id)}" data-action="rejected" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Rejeitar</button>
        </div>`
      : "";
    return `<div class="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors flex-wrap">
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-900">${esc(formatKz(w.amount))}</p>
        <p class="text-xs text-gray-400 truncate">${esc(w.storeName)} · ${esc(w.ownerEmail)} · ${esc(dateStr)}</p>
        ${w.iban ? `<p class="text-xs text-gray-400 truncate">${esc(w.beneficiaryName || "")} · ${esc(w.bankName || "")} · ${esc(w.iban)}</p>` : ""}
      </div>
      ${wStatusBadge(w.status)}
      ${actions}
    </div>`;
  }
}
