/**
 * «Contas»: os Donos de loja e as suas subscrições.
 *
 * Uma linha por conta — nome, email, nº de lojas e o estado da subscrição — e as
 * duas ações que importam enquanto não há pagamentos online:
 *
 *  - **Ativar** (ou **Prolongar**, com a subscrição em vigor) 1, 3, 6 ou 12
 *    meses. A data sai de `activationPatch` (`src/services/adminMetrics.ts`), a
 *    regra de `planActivationPatch`: os meses somam-se ao fim do período em
 *    curso, ou contam a partir de hoje. O diálogo mostra o preço de cada duração
 *    e a data em que a subscrição fica a terminar, antes de confirmar;
 *  - **Desativar**, que termina o período agora — com confirmação, porque tira
 *    as lojas publicadas da conta do ar.
 *
 * As lojas da conta e a eliminação da conta ficam atrás de «Detalhes».
 */
import { esc, formatKz, toast, withBusy } from "../../lib/dom.js";
import {
  adminActivatePlan, adminDeactivatePlan, adminDeleteAccount, listAccounts, listStores,
  type AdminAccount, type AdminStore,
} from "../../supabase/admin.js";
import {
  ACTIVATION_MONTHS, accountStatus, activationPatch, activationQuote, storeStatus, type AccountStatus,
} from "../../../src/services/adminMetrics.js";
import { openDialog } from "./dialog.js";
import {
  announce, bindChips, btnClass, emptyState, endsIn, filterChips, fmtDate, fold, icon, initials, liveRegion,
  monthsLabel, pill, plural, searchField, storeLink, updateChipCounts, type AdminView,
} from "./ui.js";

/**
 * Filtros da lista. «Donos de loja» é o filtro de entrada e conta o mesmo que o
 * cartão «Contas» da Visão geral: as contas de administração ficam à parte.
 */
type AccountFilter = "donos" | "ativas" | "a-terminar" | "sem" | "admins";

/** Filtro inicial a partir do endereço (`#/adminPainel/contas/<filtro>`). */
const FILTER_FROM_SUB: Readonly<Record<string, AccountFilter>> = {
  ativas: "ativas",
  "a-terminar": "a-terminar",
  "sem-subscricao": "sem",
  administradores: "admins",
};

const LIVE = "acc-live";

interface AccountRow {
  account: AdminAccount;
  status: AccountStatus;
  stores: AdminStore[];
}

function statusPill(st: AccountStatus): string {
  switch (st.kind) {
    case "admin": return pill("Administrador", "blue", "shield_person");
    case "active": return pill(`Ativa até ${fmtDate(st.expiresAt)}`, "green");
    case "expiring": return pill(endsIn(st.expiresAt), "amber", "schedule");
    case "expired": return pill(`Expirou a ${fmtDate(st.expiredAt)}`, "gray");
    default: return pill("Sem subscrição", "gray");
  }
}

function isActive(st: AccountStatus): boolean {
  return st.kind === "active" || st.kind === "expiring";
}

function matches(row: AccountRow, filter: AccountFilter): boolean {
  const k = row.status.kind;
  if (filter === "ativas") return k === "active" || k === "expiring";
  if (filter === "a-terminar") return k === "expiring";
  if (filter === "sem") return k === "expired" || k === "none";
  if (filter === "admins") return k === "admin";
  return k !== "admin";
}

function storeLine(s: AdminStore): string {
  const st = storeStatus(s.state, s.ownerActive);
  const state = st === "online" ? pill("Publicada", "green") : st === "offline" ? pill("Publicada · fora do ar", "amber") : pill("Rascunho", "gray");
  return `<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
    <span class="min-w-0 font-semibold text-gray-900 break-words">${esc(s.name || "Loja sem nome")}</span>
    ${s.isModel ? pill("Loja-modelo", "orange") : ""}
    ${state}
    ${storeLink(s.identifier)}
    <button type="button" data-act="edit-store" data-store="${esc(s.id)}" data-owner="${esc(s.ownerId)}" aria-label="Editar a loja ${esc(s.name)}" class="${btnClass("ghost", "sm")} ml-auto">${icon("palette")} Editar</button>
  </li>`;
}

function accountRow(row: AccountRow, open: boolean): string {
  const a = row.account;
  const active = isActive(row.status);
  const clientStores = row.stores.filter((s) => !s.isModel).length;
  const models = row.stores.length - clientStores;
  const storesText = `${plural(clientStores, "loja", "lojas")}${models ? ` · ${plural(models, "loja-modelo", "lojas-modelo")}` : ""}`;
  const panelId = `acc-${a.id}-details`;
  const who = a.name || a.email || "Conta sem nome";

  const actions = a.isAdmin ? "" : `
    <button type="button" data-act="activate" data-id="${esc(a.id)}" aria-label="${active ? "Prolongar" : "Ativar"} a subscrição de ${esc(who)}" class="${btnClass(active ? "secondary" : "primary", "sm")}">${icon(active ? "more_time" : "check_circle")} ${active ? "Prolongar" : "Ativar"}</button>
    ${active ? `<button type="button" data-act="deactivate" data-id="${esc(a.id)}" aria-label="Desativar a subscrição de ${esc(who)}" class="${btnClass("dangerOutline", "sm")}">Desativar</button>` : ""}`;

  return `<li class="px-4 py-3">
    <div class="flex flex-wrap items-center gap-3">
      <span aria-hidden="true" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-700">${esc(initials(who))}</span>
      <div class="min-w-0 flex-1 basis-48">
        <p class="font-semibold text-gray-900 break-words">${esc(who)}</p>
        <p class="text-sm text-gray-600 break-all">${a.name ? `${esc(a.email)} · ` : ""}${esc(storesText)}</p>
      </div>
      <div class="shrink-0">${statusPill(row.status)}</div>
      <div class="flex flex-wrap items-center gap-2">
        ${actions}
        <button type="button" data-act="toggle" data-id="${esc(a.id)}" aria-expanded="${open}" aria-controls="${esc(panelId)}" aria-label="Detalhes de ${esc(who)}" class="${btnClass("ghost", "sm")}">${icon(open ? "expand_less" : "expand_more")}<span>Detalhes</span></button>
      </div>
    </div>
    <div id="${esc(panelId)}" class="mt-3 rounded-xl bg-gray-50 px-4 py-3" ${open ? "" : "hidden"}>
      <p class="text-xs text-gray-600">Conta criada a ${esc(fmtDate(a.createdAt))}</p>
      ${row.stores.length
        ? `<ul role="list" class="mt-1 divide-y divide-gray-200">${row.stores.map(storeLine).join("")}</ul>`
        : `<p class="mt-2 text-sm text-gray-600">Esta conta ainda não tem lojas.</p>`}
      ${a.isAdmin ? "" : `<div class="mt-3 border-t border-gray-200 pt-3">
        <button type="button" data-act="delete" data-id="${esc(a.id)}" class="${btnClass("dangerOutline", "sm")}">${icon("person_remove")} Eliminar conta</button>
      </div>`}
    </div>
  </li>`;
}

/** Desenha a secção «Contas». */
export async function renderAccounts(view: AdminView): Promise<void> {
  view.loading();
  const [accounts, stores] = await Promise.all([listAccounts(), listStores()]);
  if (!view.isCurrent()) return;

  const byOwner = new Map<string, AdminStore[]>();
  for (const s of stores) {
    const list = byOwner.get(s.ownerId) ?? [];
    list.push(s);
    byOwner.set(s.ownerId, list);
  }
  const rows: AccountRow[] = accounts.map((account) => ({
    account,
    status: accountStatus(account),
    stores: byOwner.get(account.id) ?? [],
  }));

  let filter: AccountFilter = FILTER_FROM_SUB[view.sub] ?? "donos";
  let query = "";
  const open = new Set<string>();

  const counts = (): Record<AccountFilter, number> => ({
    donos: rows.filter((r) => matches(r, "donos")).length,
    ativas: rows.filter((r) => matches(r, "ativas")).length,
    "a-terminar": rows.filter((r) => matches(r, "a-terminar")).length,
    sem: rows.filter((r) => matches(r, "sem")).length,
    admins: rows.filter((r) => matches(r, "admins")).length,
  });
  const c = counts();

  const painted = view.paint(`
    ${liveRegion(LIVE)}
    <div class="mb-3">${searchField("acc-search", "Pesquisar contas", "Pesquisar por nome ou email…")}</div>
    <div class="mb-4">${filterChips("acc-filter", "Filtrar contas", [
      { value: "donos", label: "Donos de loja", count: c.donos },
      { value: "ativas", label: "Com subscrição", count: c.ativas },
      { value: "a-terminar", label: "A terminar", count: c["a-terminar"] },
      { value: "sem", label: "Sem subscrição", count: c.sem },
      { value: "admins", label: "Administradores", count: c.admins },
    ], filter)}</div>
    <p id="acc-count" class="mb-2 text-sm text-gray-600"></p>
    <div id="acc-list"></div>`);
  if (!painted) return;

  function draw(): void {
    const q = fold(query.trim());
    const inFilter = rows.filter((r) => matches(r, filter));
    const shown = inFilter.filter((r) => !q || fold(`${r.account.name} ${r.account.email}`).includes(q));
    const countEl = document.getElementById("acc-count");
    if (countEl) countEl.textContent = `${plural(shown.length, "conta", "contas")}${shown.length !== inFilter.length ? ` de ${inFilter.length}` : ""}`;
    const list = document.getElementById("acc-list");
    if (list) {
      list.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">${shown.map((r) => accountRow(r, open.has(r.account.id))).join("")}</ul>`
        : `<div class="rounded-2xl border border-gray-200 bg-white">${emptyState("person_search", inFilter.length ? "Nenhuma conta corresponde à pesquisa." : "Nenhuma conta neste filtro.")}</div>`;
    }
    updateChipCounts("acc-filter", counts());
  }

  const rowOf = (id: string): AccountRow | undefined => rows.find((r) => r.account.id === id);

  /** Atualiza o estado de uma conta depois de gravar e redesenha. */
  function setPlan(row: AccountRow, planExpiresAt: string): void {
    row.account.planExpiresAt = planExpiresAt;
    row.status = accountStatus(row.account);
    const active = isActive(row.status);
    for (const s of row.stores) s.ownerActive = active;
    draw();
  }

  async function activate(row: AccountRow): Promise<void> {
    const a = row.account;
    const extending = isActive(row.status);
    const options = ACTIVATION_MONTHS.map((m) => {
      const q = activationQuote(m);
      return { value: String(m), label: monthsLabel(m), detail: `${q.days} dias · ${formatKz(q.amountKz)}` };
    });
    const answer = await openDialog({
      title: extending ? "Prolongar a subscrição" : "Ativar a subscrição",
      body: `<p class="font-semibold text-gray-900 break-all">${esc(a.email || a.name)}</p>
        <p>${extending
          ? `Ativa até ${esc(fmtDate(row.status.expiresAt))}. Os meses somam-se ao fim do período atual.`
          : "Os meses contam a partir de hoje."} Ative depois de confirmar o pagamento do Dono.</p>`,
      confirmLabel: extending ? "Prolongar" : "Ativar",
      tone: "primary",
      choice: {
        legend: "Duração",
        options,
        value: String(ACTIVATION_MONTHS[0]),
        describe: (value) => {
          const p = activationPatch(a, Number(value));
          return p.ok ? `Fica ativa até <strong>${esc(fmtDate(p.patch.plan_expires_at))}</strong>.` : esc(p.message);
        },
      },
    });
    if (!answer?.choice) return;
    const months = Number(answer.choice);
    const result = await withBusy(() => adminActivatePlan(a.id, months), "A ativar a subscrição…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    setPlan(row, result.planExpiresAt);
    const msg = `Subscrição de ${a.email || a.name} ativa até ${fmtDate(result.planExpiresAt)}.`;
    toast(msg);
    announce(LIVE, msg);
  }

  async function deactivate(row: AccountRow): Promise<void> {
    const a = row.account;
    const confirmed = await openDialog({
      title: "Desativar a subscrição?",
      body: `<p>A conta <strong class="break-all">${esc(a.email || a.name)}</strong> fica sem subscrição a partir de agora.</p>
        <p>As lojas publicadas desta conta saem do ar até a subscrição voltar a ser ativada. Nada é apagado.</p>`,
      confirmLabel: "Desativar",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await withBusy(() => adminDeactivatePlan(a.id), "A desativar a subscrição…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    setPlan(row, result.planExpiresAt);
    const msg = `Subscrição de ${a.email || a.name} desativada.`;
    toast(msg);
    announce(LIVE, msg);
  }

  async function remove(row: AccountRow): Promise<void> {
    const a = row.account;
    // Sem email gravado, a confirmação pede uma palavra fixa.
    const expected = a.email || "ELIMINAR";
    const answer = await openDialog({
      title: "Eliminar a conta?",
      body: `<p>Apaga a conta <strong class="break-all">${esc(a.email || a.name)}</strong> e todas as lojas dela — produtos, imagens, encomendas e pedidos de levantamento. Não é possível desfazer.</p>`,
      confirmLabel: "Eliminar conta",
      tone: "danger",
      fields: [{
        id: "confirm",
        label: a.email ? "Escreva o email da conta para confirmar" : "Escreva ELIMINAR para confirmar",
        validate: (value) => (value.trim() === expected ? null : a.email ? "O email não corresponde." : "Escreva ELIMINAR."),
      }],
    });
    if (!answer) return;
    const result = await withBusy(() => adminDeleteAccount(a.id), "A eliminar a conta…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    const i = rows.indexOf(row);
    if (i >= 0) rows.splice(i, 1);
    open.delete(a.id);
    draw();
    const msg = "Conta eliminada.";
    toast(msg);
    announce(LIVE, msg);
  }

  document.getElementById("acc-search")?.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    draw();
  });
  bindChips("acc-filter", (value) => { filter = value as AccountFilter; draw(); });

  document.getElementById("acc-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "edit-store") {
      view.openStoreEditor(btn.dataset.store ?? "", btn.dataset.owner ?? "");
      return;
    }
    const row = rowOf(btn.dataset.id ?? "");
    if (!row) return;
    if (act === "activate") void activate(row);
    else if (act === "deactivate") void deactivate(row);
    else if (act === "delete") void remove(row);
    else if (act === "toggle") {
      if (open.has(row.account.id)) open.delete(row.account.id);
      else open.add(row.account.id);
      draw();
      document.querySelector<HTMLButtonElement>(`button[data-act="toggle"][data-id="${CSS.escape(row.account.id)}"]`)?.focus();
    }
  });

  draw();
}
