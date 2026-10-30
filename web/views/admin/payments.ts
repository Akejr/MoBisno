/**
 * «Pagamentos»: três separadores, um por tipo de dinheiro.
 *
 *  - **Subscrições** — os pagamentos de subscrição (`plan_payments`): a receita
 *    da MôBisno. Um pagamento por concluir pode ser apagado (uma referência que
 *    ficou presa); um pago, nunca;
 *  - **Encomendas das lojas** — as vendas das lojas (`orders`). Este dinheiro é
 *    dos Donos, não da MôBisno, e o ecrã di-lo por extenso;
 *  - **Levantamentos** — os pedidos dos Donos para receber o saldo: aprovar,
 *    marcar como pago ou rejeitar, com confirmação nos dois últimos.
 *
 * Os separadores são endereços (`#/adminPainel/pagamentos/<separador>`), por
 * isso a Visão geral leva diretamente aos levantamentos pedidos.
 *
 * ## Só o que existe
 *
 * As encomendas das lojas e os levantamentos são as vendas por Multicaixa
 * Express e Referência Bancária. Enquanto nenhuma loja tiver os pagamentos
 * digitais ligados, não há nada para mostrar nesses dois separadores, e eles
 * não aparecem. A exceção são os levantamentos por tratar: é dinheiro devido a
 * um Dono, e não desaparece por os pagamentos terem sido desligados depois.
 */
import { esc, formatKz, toast, withBusy } from "../../lib/dom.js";
import {
  ADMIN_ORDERS_LIMIT, adminDeletePlanPayment, adminProcessWithdrawal, anyDigitalPaymentsStore, listAllWithdrawals, listPlanPayments,
  listStoreOrders, type AdminOrder, type AdminPlanPayment, type AdminWithdrawal, type PaymentStatusView,
} from "../../supabase/admin.js";
import { ADMIN_HREFS, businessHealth } from "../../../src/services/adminMetrics.js";
import { formatIban } from "../../../src/services/paymentVerification.js";
import { PAYMENTS_PROVIDER_READY } from "../../../src/services/payments.js";
import { openDialog } from "./dialog.js";
import {
  announce, bindChips, btnClass, emptyState, filterChips, fmtDate, fmtDateTime, fold, icon, liveRegion, noteBox,
  pill, plural, searchField, statCard, updateChipCounts, type AdminView, type Tone,
} from "./ui.js";

type Tab = "subscricoes" | "encomendas" | "levantamentos";

const TABS: readonly { id: Tab; label: string; href: string; icon: string }[] = [
  { id: "subscricoes", label: "Subscrições", href: ADMIN_HREFS.subscricoes, icon: "workspace_premium" },
  { id: "encomendas", label: "Encomendas das lojas", href: ADMIN_HREFS.encomendas, icon: "shopping_bag" },
  { id: "levantamentos", label: "Levantamentos", href: ADMIN_HREFS.levantamentos, icon: "account_balance_wallet" },
];

const LIVE = "pay-live";

const METHOD_LABEL: Readonly<Record<string, string>> = {
  mcx: "Multicaixa Express",
  reference: "Referência Bancária",
  whatsapp: "WhatsApp",
};

/** Nome do método de pagamento gravado (`mcx`, `reference`). Também o da Visão geral. */
export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? (method || "Método desconhecido");
}

const PAYMENT_STATUS: Readonly<Record<PaymentStatusView, { label: string; tone: Tone }>> = {
  paid: { label: "Paga", tone: "green" },
  open: { label: "Pendente", tone: "amber" },
  failed: { label: "Falhada", tone: "red" },
  cancelled: { label: "Cancelada", tone: "gray" },
  expired: { label: "Expirada", tone: "gray" },
};

function paymentPill(status: PaymentStatusView): string {
  const s = PAYMENT_STATUS[status];
  return pill(s.label, s.tone);
}

type PaymentFilter = "todas" | "pagas" | "pendentes" | "falhadas";

function paymentMatches(status: PaymentStatusView, filter: PaymentFilter): boolean {
  if (filter === "pagas") return status === "paid";
  if (filter === "pendentes") return status === "open";
  if (filter === "falhadas") return status === "failed" || status === "cancelled" || status === "expired";
  return true;
}

function paymentCounts(statuses: readonly PaymentStatusView[]): Record<PaymentFilter, number> {
  return {
    todas: statuses.length,
    pagas: statuses.filter((s) => paymentMatches(s, "pagas")).length,
    pendentes: statuses.filter((s) => paymentMatches(s, "pendentes")).length,
    falhadas: statuses.filter((s) => paymentMatches(s, "falhadas")).length,
  };
}

function paymentChips(group: string, label: string, counts: Record<PaymentFilter, number>, active: PaymentFilter): string {
  return filterChips(group, label, [
    { value: "todas", label: "Todas", count: counts.todas },
    { value: "pagas", label: "Pagas", count: counts.pagas },
    { value: "pendentes", label: "Pendentes", count: counts.pendentes },
    { value: "falhadas", label: "Falhadas", count: counts.falhadas },
  ], active);
}

/**
 * Separadores de «Pagamentos», como ligações (cada um é um endereço). Só os
 * `visiveis`; com um só, não há o que escolher e a barra não aparece.
 */
function tabsNav(active: Tab, requested: number, visiveis: readonly Tab[]): string {
  const tabs = TABS.filter((t) => visiveis.includes(t.id));
  if (tabs.length < 2) return "";
  return `<nav aria-label="Tipos de pagamento" class="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
    ${tabs.map((t) => {
      const on = t.id === active;
      // `data-nav-count`: o painel atualiza este contador com os da navegação.
      const badge = t.id === "levantamentos"
        ? `<span data-nav-count="withdrawals" class="${requested > 0 ? "" : "hidden"} rounded-full bg-orange-700 px-1.5 py-0.5 text-xs font-bold leading-none text-white">${requested > 0 ? `<span aria-hidden="true">${requested}</span><span class="sr-only">(${requested} por tratar)</span>` : ""}</span>`
        : "";
      return `<a href="${esc(t.href)}" ${on ? 'aria-current="page"' : ""} class="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] ${on ? "border-gray-300 bg-white text-gray-900 shadow-sm" : "border-transparent text-gray-600 hover:bg-white hover:text-gray-900"}">${icon(t.icon)}${esc(t.label)}${badge}</a>`;
    }).join("")}
  </nav>`;
}

/* ------------------------------- Subscrições ------------------------------- */

function planRow(p: AdminPlanPayment): string {
  const who = p.ownerEmail || p.ownerName || "Conta desconhecida";
  const when = p.status === "paid" ? `Paga a ${fmtDateTime(p.paidAt ?? p.createdAt)}` : `Criada a ${fmtDateTime(p.createdAt)}`;
  return `<li class="flex flex-wrap items-center gap-3 px-4 py-3">
    <div class="min-w-0 flex-1 basis-56">
      <p class="font-semibold text-gray-900">${esc(formatKz(p.amount))} <span class="font-normal text-gray-600">· ${esc(methodLabel(p.method))}</span></p>
      <p class="text-sm text-gray-600 break-all">${esc(who)} · ${esc(when)}</p>
    </div>
    ${paymentPill(p.status)}
    ${p.status === "paid" ? "" : `<button type="button" data-act="delete-plan" data-id="${esc(p.id)}" aria-label="Apagar o pagamento por concluir de ${esc(who)}" title="Apagar pagamento por concluir" class="${btnClass("ghost", "sm")}">${icon("delete")}</button>`}
  </li>`;
}

async function renderSubscriptions(view: AdminView, tabs: string): Promise<void> {
  const payments = await listPlanPayments();
  if (!view.isCurrent()) return;
  let filter: PaymentFilter = "todas";
  let query = "";

  const totals = (): { month: number; total: number } => ({
    month: businessHealth({ transactions: payments }).monthRevenue,
    total: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
  });
  const t = totals();
  const painted = view.paint(`
    ${liveRegion(LIVE)}
    ${tabs}
    ${PAYMENTS_PROVIDER_READY ? "" : `<div class="mb-4">${noteBox(`Ainda não há pagamentos online: as subscrições pagas por outro meio ativam-se à mão em <a href="${esc(ADMIN_HREFS.contas)}" class="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500">Contas</a>, e não aparecem aqui.`)}</div>`}
    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2" id="plan-totals">
      ${statCard("Recebido este mês", formatKz(t.month))}
      ${statCard("Recebido no total", formatKz(t.total))}
    </div>
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      ${searchField("plan-search", "Pesquisar subscrições", "Pesquisar por email ou nome…")}
      ${paymentChips("plan-filter", "Filtrar subscrições pelo estado", paymentCounts(payments.map((p) => p.status)), filter)}
    </div>
    <div id="plan-list"></div>`);
  if (!painted) return;

  function draw(): void {
    const q = fold(query.trim());
    const shown = payments.filter((p) => paymentMatches(p.status, filter)
      && (!q || fold(`${p.ownerEmail} ${p.ownerName}`).includes(q)));
    const list = document.getElementById("plan-list");
    if (list) {
      list.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">${shown.map(planRow).join("")}</ul>`
        : `<div class="rounded-xl border border-gray-200 bg-white shadow-sm">${emptyState("receipt_long", payments.length ? "Nenhum pagamento corresponde aos filtros." : "Ainda não há pagamentos de subscrição.")}</div>`;
    }
    updateChipCounts("plan-filter", paymentCounts(payments.map((p) => p.status)));
  }

  document.getElementById("plan-search")?.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    draw();
  });
  bindChips("plan-filter", (value) => { filter = value as PaymentFilter; draw(); });

  document.getElementById("plan-list")?.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act="delete-plan"]');
    if (!btn) return;
    const p = payments.find((x) => x.id === btn.dataset.id);
    if (!p) return;
    const confirmed = await openDialog({
      title: "Apagar este pagamento?",
      body: `<p>Pagamento de <strong>${esc(formatKz(p.amount))}</strong> de ${esc(p.ownerEmail || "conta desconhecida")}, ${esc(PAYMENT_STATUS[p.status].label.toLowerCase())}. Apagar não mexe na subscrição da conta e não é possível desfazer.</p>`,
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await withBusy(() => adminDeletePlanPayment(p.id), "A apagar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    payments.splice(payments.indexOf(p), 1);
    draw();
    toast("Pagamento apagado.");
    announce(LIVE, "Pagamento apagado.");
  });

  draw();
}

/* ------------------------------- Encomendas ------------------------------- */

function orderRow(o: AdminOrder): string {
  const parts: string[] = [];
  if (o.subtotal !== null && (o.deliveryFee > 0 || o.discountAmount > 0)) parts.push(`Produtos ${formatKz(o.subtotal)}`);
  if (o.deliveryFee > 0) parts.push(`Entrega ${formatKz(o.deliveryFee)}`);
  if (o.discountAmount > 0) parts.push(`Desconto −${formatKz(o.discountAmount)}`);
  return `<li class="flex flex-wrap items-center gap-3 px-4 py-3">
    <div class="min-w-0 flex-1 basis-56">
      <p class="font-semibold text-gray-900">${esc(formatKz(o.amount))} <span class="font-normal text-gray-600">· ${esc(methodLabel(o.method))}</span></p>
      <p class="text-sm text-gray-600 break-words">${esc(o.storeName || "Loja sem nome")}${o.customerName ? ` · ${esc(o.customerName)}` : ""} · ${esc(fmtDateTime(o.paidAt ?? o.createdAt))}</p>
      ${parts.length ? `<p class="text-xs text-gray-600">${esc(parts.join(" · "))}</p>` : ""}
    </div>
    ${paymentPill(o.status)}
  </li>`;
}

async function renderOrders(view: AdminView, tabs: string): Promise<void> {
  const { orders, truncated } = await listStoreOrders();
  if (!view.isCurrent()) return;
  let filter: PaymentFilter = "todas";
  let query = "";

  const paid = orders.filter((o) => o.status === "paid");
  const sold = paid.reduce((sum, o) => sum + o.amount, 0);
  const painted = view.paint(`
    ${tabs}
    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      ${statCard("Vendido nas lojas", formatKz(sold), `${plural(paid.length, "encomenda paga", "encomendas pagas")}${truncated ? " (das mais recentes)" : ""}`)}
      <div class="flex items-center">${noteBox("Este dinheiro é dos Donos das lojas, não é receita da MôBisno.")}</div>
    </div>
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      ${searchField("order-search", "Pesquisar encomendas", "Pesquisar por loja ou cliente…")}
      ${paymentChips("order-filter", "Filtrar encomendas pelo estado", paymentCounts(orders.map((o) => o.status)), filter)}
    </div>
    <div id="order-list"></div>
    ${truncated ? `<p class="mt-3 text-sm text-gray-600">A mostrar as ${ADMIN_ORDERS_LIMIT} encomendas mais recentes.</p>` : ""}`);
  if (!painted) return;

  function draw(): void {
    const q = fold(query.trim());
    const shown = orders.filter((o) => paymentMatches(o.status, filter)
      && (!q || fold(`${o.storeName} ${o.customerName}`).includes(q)));
    const list = document.getElementById("order-list");
    if (list) {
      list.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">${shown.map(orderRow).join("")}</ul>`
        : `<div class="rounded-xl border border-gray-200 bg-white shadow-sm">${emptyState("shopping_bag", orders.length ? "Nenhuma encomenda corresponde aos filtros." : "Ainda não há encomendas nas lojas.")}</div>`;
    }
  }

  document.getElementById("order-search")?.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    draw();
  });
  bindChips("order-filter", (value) => { filter = value as PaymentFilter; draw(); });
  draw();
}

/* ------------------------------ Levantamentos ------------------------------ */

type WithdrawalFilter = "tratar" | "pagos" | "rejeitados" | "todos";

const WITHDRAWAL_STATUS: Readonly<Record<AdminWithdrawal["status"], { label: string; tone: Tone }>> = {
  requested: { label: "Por aprovar", tone: "amber" },
  approved: { label: "Aprovado · por pagar", tone: "blue" },
  paid: { label: "Pago", tone: "green" },
  rejected: { label: "Rejeitado", tone: "red" },
};

function withdrawalPill(status: AdminWithdrawal["status"]): string {
  const s = WITHDRAWAL_STATUS[status] ?? { label: status, tone: "gray" as Tone };
  return pill(s.label, s.tone);
}

function withdrawalMatches(w: AdminWithdrawal, filter: WithdrawalFilter): boolean {
  if (filter === "tratar") return w.status === "requested" || w.status === "approved";
  if (filter === "pagos") return w.status === "paid";
  if (filter === "rejeitados") return w.status === "rejected";
  return true;
}

function withdrawalCounts(items: readonly AdminWithdrawal[]): Record<WithdrawalFilter, number> {
  return {
    tratar: items.filter((w) => withdrawalMatches(w, "tratar")).length,
    pagos: items.filter((w) => withdrawalMatches(w, "pagos")).length,
    rejeitados: items.filter((w) => withdrawalMatches(w, "rejeitados")).length,
    todos: items.length,
  };
}

function withdrawalRow(w: AdminWithdrawal): string {
  const store = w.storeName || "Loja sem nome";
  const open = w.status === "requested" || w.status === "approved";
  const bank = [w.beneficiaryName, w.bankName].filter(Boolean).join(" · ");
  return `<li class="px-4 py-3">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1 basis-56">
        <p class="flex flex-wrap items-center gap-2"><span class="text-base font-semibold tabular-nums text-gray-900">${esc(formatKz(w.amount))}</span>${withdrawalPill(w.status)}</p>
        <p class="text-sm text-gray-700 break-words">${esc(store)} · <span class="break-all">${esc(w.ownerEmail || "dono desconhecido")}</span></p>
        <p class="text-xs text-gray-600">Pedido a ${esc(fmtDateTime(w.createdAt))}${w.processedAt && !open ? ` · tratado a ${esc(fmtDate(w.processedAt))}` : ""}</p>
        ${w.iban || bank ? `<p class="mt-1 text-sm text-gray-800 break-words">${bank ? `${esc(bank)} · ` : ""}<span class="font-mono tracking-wide">${esc(w.iban ? formatIban(w.iban) : "IBAN não indicado")}</span></p>` : ""}
      </div>
      ${open ? `<div class="flex flex-wrap items-center gap-2">
        ${w.status === "requested" ? `<button type="button" data-act="approved" data-id="${esc(w.id)}" aria-label="Aprovar o levantamento de ${esc(store)}" class="${btnClass("secondary", "sm")}">Aprovar</button>` : ""}
        <button type="button" data-act="paid" data-id="${esc(w.id)}" aria-label="Marcar como pago o levantamento de ${esc(store)}" class="${btnClass("success", "sm")}">${icon("check_circle")} Marcar como pago</button>
        <button type="button" data-act="rejected" data-id="${esc(w.id)}" aria-label="Rejeitar o levantamento de ${esc(store)}" class="${btnClass("dangerOutline", "sm")}">Rejeitar</button>
      </div>` : ""}
    </div>
  </li>`;
}

async function renderWithdrawals(view: AdminView, tabsFor: (requested: number) => string): Promise<void> {
  const items = await listAllWithdrawals();
  if (!view.isCurrent()) return;
  let filter: WithdrawalFilter = "tratar";
  let query = "";

  const requested = (): number => items.filter((w) => w.status === "requested").length;
  const sum = (keep: (w: AdminWithdrawal) => boolean): number => items.filter(keep).reduce((s, w) => s + w.amount, 0);
  const totalsHtml = (): string => {
    const open = withdrawalCounts(items).tratar;
    return `${statCard("Por pagar", formatKz(sum((w) => withdrawalMatches(w, "tratar"))), plural(open, "pedido por tratar", "pedidos por tratar"))}
      ${statCard("Pago aos Donos", formatKz(sum((w) => w.status === "paid")))}`;
  };
  view.setNavCounts({ withdrawals: requested() });

  const c = withdrawalCounts(items);
  const painted = view.paint(`
    ${liveRegion(LIVE)}
    ${tabsFor(requested())}
    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2" id="wd-totals">${totalsHtml()}</div>
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      ${searchField("wd-search", "Pesquisar levantamentos", "Pesquisar por loja ou email…")}
      ${filterChips("wd-filter", "Filtrar levantamentos", [
        { value: "tratar", label: "Por tratar", count: c.tratar },
        { value: "pagos", label: "Pagos", count: c.pagos },
        { value: "rejeitados", label: "Rejeitados", count: c.rejeitados },
        { value: "todos", label: "Todos", count: c.todos },
      ], filter)}
    </div>
    <div id="wd-list"></div>`);
  if (!painted) return;

  function draw(): void {
    const q = fold(query.trim());
    const shown = items.filter((w) => withdrawalMatches(w, filter)
      && (!q || fold(`${w.storeName} ${w.ownerEmail}`).includes(q)));
    const list = document.getElementById("wd-list");
    if (list) {
      list.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">${shown.map(withdrawalRow).join("")}</ul>`
        : `<div class="rounded-xl border border-gray-200 bg-white shadow-sm">${emptyState("account_balance_wallet", filter === "tratar" ? "Não há levantamentos por tratar." : "Nenhum pedido corresponde aos filtros.")}</div>`;
    }
    updateChipCounts("wd-filter", withdrawalCounts(items));
    const totals = document.getElementById("wd-totals");
    if (totals) totals.innerHTML = totalsHtml();
  }

  async function process(w: AdminWithdrawal, status: "approved" | "paid" | "rejected"): Promise<void> {
    const store = w.storeName || "sem nome";
    if (status === "paid") {
      const confirmed = await openDialog({
        title: "Marcar como pago?",
        body: `<p>Confirme que transferiu <strong>${esc(formatKz(w.amount))}</strong> para a loja <strong>${esc(store)}</strong>:</p>
          <p class="rounded-xl bg-gray-50 px-4 py-3">${esc(w.beneficiaryName || "Titular não indicado")}<br /><span class="font-mono tracking-wide">${esc(w.iban ? formatIban(w.iban) : "IBAN não indicado")}</span></p>`,
        confirmLabel: "Marcar como pago",
        tone: "success",
      });
      if (!confirmed) return;
    } else if (status === "rejected") {
      const confirmed = await openDialog({
        title: "Rejeitar o levantamento?",
        body: `<p>O pedido de <strong>${esc(formatKz(w.amount))}</strong> da loja <strong>${esc(store)}</strong> é rejeitado e o valor volta a ficar disponível para o Dono pedir de novo.</p>`,
        confirmLabel: "Rejeitar",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    const result = await withBusy(() => adminProcessWithdrawal(w.id, status), "A atualizar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    w.status = status;
    w.processedAt = new Date().toISOString();
    view.setNavCounts({ withdrawals: requested() });
    draw();
    const msg = status === "paid" ? "Levantamento marcado como pago." : status === "approved" ? "Levantamento aprovado." : "Levantamento rejeitado.";
    toast(msg);
    announce(LIVE, msg);
  }

  document.getElementById("wd-search")?.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    draw();
  });
  bindChips("wd-filter", (value) => { filter = value as WithdrawalFilter; draw(); });

  document.getElementById("wd-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn) return;
    const w = items.find((x) => x.id === btn.dataset.id);
    const act = btn.dataset.act;
    if (!w || (act !== "approved" && act !== "paid" && act !== "rejected")) return;
    void process(w, act);
  });

  draw();
}

/* --------------------------------- Secção --------------------------------- */

/** Desenha a secção «Pagamentos» no separador do endereço (Subscrições por omissão). */
export async function renderPayments(view: AdminView): Promise<void> {
  view.loading();
  const requested = view.navCounts()?.withdrawals ?? 0;
  const digitais = PAYMENTS_PROVIDER_READY && (await anyDigitalPaymentsStore());
  if (!view.isCurrent()) return;
  const visiveis: Tab[] = ["subscricoes"];
  if (digitais) visiveis.push("encomendas");
  if (digitais || requested > 0) visiveis.push("levantamentos");
  // Um endereço para um separador escondido abre as subscrições.
  const tab: Tab = visiveis.includes(view.sub as Tab) ? (view.sub as Tab) : "subscricoes";
  if (tab === "encomendas") await renderOrders(view, tabsNav(tab, requested, visiveis));
  else if (tab === "levantamentos") await renderWithdrawals(view, (n) => tabsNav(tab, n, visiveis));
  else await renderSubscriptions(view, tabsNav(tab, requested, visiveis));
}
