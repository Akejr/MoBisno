/**
 * «Contas»: os Donos de loja e as suas lojas.
 *
 * Uma linha por conta: nome, email, nº de lojas, o estado da subscrição e se o
 * telemóvel está confirmado. A subscrição é de cada loja (migração 0025), por
 * isso a conta está «com subscrição» enquanto alguma loja dela estiver
 * (`latestExpiry`, a mesma regra da Visão geral). Ativar, prolongar e desativar
 * fazem-se loja a loja, em «Lojas».
 *
 * O filtro «Telefone por confirmar» mostra quem criou conta e saltou a SMS: são
 * contas que existem mas não conseguem pôr nenhuma loja no ar (migração 0026).
 * «Confirmar telefone» é a saída para quando o serviço de SMS falha ou o Dono
 * fala com a equipa — a mesma ideia da ativação manual da subscrição.
 *
 * As lojas da conta, com o estado de cada uma, e a eliminação da conta ficam
 * atrás de «Detalhes».
 *
 * ## Os emails presos
 *
 * No topo, só quando existem: contas que foram eliminadas sem a identidade ser
 * apagada e continuam a ocupar o email em `auth.users`. É o rasto do defeito que
 * `api/admin-account.js` corrigiu — eliminar apagava as lojas e o perfil, e o
 * email ficava ocupado para sempre. Estas não aparecem na lista de contas (não
 * têm perfil para listar), e por isso precisam de um sítio só delas.
 */
import { esc, toast, withBusy } from "../../lib/dom.js";
import {
  adminDeleteAccount, adminVerifyPhone, listAccounts, listOrphanAccounts, listStores,
  type AdminAccount, type AdminStore, type OrphanResult,
} from "../../supabase/admin.js";
import { ADMIN_HREFS, accountStatus, latestExpiry, storeStatus, type AccountStatus } from "../../../src/services/adminMetrics.js";
import { formatPhoneForDisplay } from "../../../src/services/phoneVerification.js";
import { openDialog } from "./dialog.js";
import {
  announce, bindChips, btnClass, emptyState, filterChips, fmtDate, fold, icon, initials, liveRegion,
  pill, planPill, plural, searchField, storeLink, updateChipCounts, type AdminView,
} from "./ui.js";

/**
 * Filtros da lista. «Donos de loja» é o filtro de entrada e conta o mesmo que o
 * cartão «Contas» da Visão geral: as contas de administração ficam à parte.
 */
type AccountFilter = "donos" | "ativas" | "a-terminar" | "sem" | "sem-telefone" | "admins";

/** Filtro inicial a partir do endereço (`#/adminPainel/contas/<filtro>`). */
const FILTER_FROM_SUB: Readonly<Record<string, AccountFilter>> = {
  ativas: "ativas",
  "a-terminar": "a-terminar",
  "sem-subscricao": "sem",
  "sem-telefone": "sem-telefone",
  administradores: "admins",
};

const LIVE = "acc-live";

interface AccountRow {
  account: AdminAccount;
  status: AccountStatus;
  stores: AdminStore[];
}

function matches(row: AccountRow, filter: AccountFilter): boolean {
  const k = row.status.kind;
  if (filter === "ativas") return k === "active" || k === "expiring";
  if (filter === "a-terminar") return k === "expiring";
  if (filter === "sem") return k === "expired" || k === "none";
  // Um administrador publica sem confirmar nada: não entra neste filtro.
  if (filter === "sem-telefone") return k !== "admin" && !row.account.phoneVerified;
  if (filter === "admins") return k === "admin";
  return k !== "admin";
}

/**
 * Estado da subscrição de uma conta: o fim mais tardio entre o da conta (de
 * antes da migração 0025) e os das lojas dela.
 */
function statusOf(account: AdminAccount, stores: readonly AdminStore[]): AccountStatus {
  return accountStatus({
    isAdmin: account.isAdmin,
    planExpiresAt: latestExpiry([account.planExpiresAt, ...stores.map((s) => s.planExpiresAt)]),
  });
}

function storeLine(s: AdminStore): string {
  const st = storeStatus(s.state, s.planActive);
  const state = st === "online" ? pill("Publicada", "green") : st === "offline" ? pill("Publicada · fora do ar", "amber") : pill("Rascunho", "gray");
  return `<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
    <span class="min-w-0 font-semibold text-gray-900 break-words">${esc(s.name || "Loja sem nome")}</span>
    ${s.isModel ? pill("Loja-modelo", "orange") : ""}
    ${state}
    ${s.isModel || s.ownerIsAdmin ? "" : planPill(accountStatus({ isAdmin: false, planExpiresAt: s.planExpiresAt }))}
    ${storeLink(s.identifier)}
    <button type="button" data-act="edit-store" data-store="${esc(s.id)}" data-owner="${esc(s.ownerId)}" aria-label="Editar a loja ${esc(s.name)}" class="${btnClass("ghost", "sm")} ml-auto">${icon("palette")} Editar</button>
  </li>`;
}

/**
 * Os emails presos, com a saída. «Libertar o email» apaga a identidade que
 * ficou atrás: não há conta, não há lojas, não há nada para recuperar — o que há
 * é um email que ninguém consegue usar.
 */
function orphansCard(estado: OrphanResult): string {
  const caixa = (tom: "amber" | "gray" | "red", corpo: string): string => {
    const cores = { amber: "border-amber-200 bg-amber-50", gray: "border-gray-200 bg-white", red: "border-red-200 bg-red-50" } as const;
    return `<div class="mb-4 rounded-xl border ${cores[tom]} p-4">${corpo}</div>`;
  };
  const recheck = `<button type="button" data-act="recheck" class="${btnClass("ghost", "sm")}">${icon("refresh")} Verificar de novo</button>`;

  /*
   * Os três estados aparecem **todos**. Havia dois, e um deles era o vazio:
   * «nenhum email preso» e «a verificação falhou» desenhavam a mesma coisa, que
   * era nada. Quem está a procurar um email ocupado ficava sem saber se a
   * resposta era «não há» ou «não consegui ver» — e foi exactamente isso que
   * aconteceu da primeira vez que isto correu em produção.
   */
  if (!estado.ok) {
    return caixa("red", `<div class="flex flex-wrap items-start gap-2">
      <span class="material-symbols-outlined mb-ico text-[20px] text-red-700" aria-hidden="true">error</span>
      <div class="min-w-0 flex-1">
        <h3 class="font-bold text-gray-900">Não foi possível verificar os emails presos</h3>
        <p class="mt-0.5 text-sm text-gray-700 break-words">${esc(estado.message)}</p>
      </div>
      ${recheck}
    </div>`);
  }

  if (estado.list.length === 0) {
    // «Está tudo bem» numa linha discreta, e não numa caixa do tamanho de um
    // aviso: é informação, não um pedido de atenção.
    // O botão vai dentro da frase: no telemóvel, solto, ficava numa linha só
    // dele, e o ícone noutra.
    return `<p class="mb-3 flex items-start gap-1.5 text-[13px] text-gray-500">
      <span class="material-symbols-outlined shrink-0 text-emerald-600" style="font-size:16px;margin-top:1px" aria-hidden="true">mark_email_read</span>
      <span class="min-w-0">Nenhum email preso: as ${esc(plural(estado.checked, "identidade verificada", "identidades verificadas"))} têm conta. <button type="button" data-act="recheck" class="font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900">Verificar de novo</button></span>
    </p>`;
  }

  return caixa("amber", `<div class="flex items-start gap-2">
      <span class="material-symbols-outlined mb-ico text-[20px] text-amber-700" aria-hidden="true">mail_lock</span>
      <div class="min-w-0">
        <h3 class="font-bold text-gray-900">${esc(plural(estado.list.length, "email preso", "emails presos"))}</h3>
        <p class="mt-0.5 text-sm text-gray-700">Contas eliminadas sem a identidade ter sido apagada: o email continua ocupado e ninguém consegue criar conta com ele. Libertar apaga só essa identidade.</p>
      </div>
    </div>
    <ul role="list" class="mt-3 divide-y divide-amber-200">${estado.list.map((o) => `
      <li class="flex flex-wrap items-center gap-2 py-2">
        <span class="min-w-0 flex-1 break-all font-semibold text-gray-900">${esc(o.email || o.id)}</span>
        ${o.createdAt ? `<span class="text-xs text-gray-600">criada a ${esc(fmtDate(o.createdAt))}</span>` : ""}
        <button type="button" data-act="free" data-id="${esc(o.id)}" aria-label="Libertar o email ${esc(o.email || o.id)}" class="${btnClass("dangerOutline", "sm")}">${icon("lock_open")} Libertar o email</button>
      </li>`).join("")}
    </ul>
    <div class="mt-2 flex justify-end">${recheck}</div>`);
}

function accountRow(row: AccountRow, open: boolean): string {
  const a = row.account;
  const clientStores = row.stores.filter((s) => !s.isModel).length;
  const models = row.stores.length - clientStores;
  const storesText = `${plural(clientStores, "loja", "lojas")}${models ? ` · ${plural(models, "loja-modelo", "lojas-modelo")}` : ""}`;
  const panelId = `acc-${a.id}-details`;
  const who = a.name || a.email || "Conta sem nome";

  /*
   * O nome e o email cortam com reticências (o texto inteiro fica no `title`),
   * e os selos vão por baixo deles, como nas «Lojas». O email tinha `break-all`
   * e, no telemóvel, partia a meio («…@gmail.c» numa linha, «om» na seguinte),
   * com «Detalhes» a cair para uma linha sozinha.
   */
  return `<li class="px-4 py-3.5">
    <div class="flex items-center gap-3">
      <span aria-hidden="true" class="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full bg-gray-100 text-sm font-semibold text-gray-700">${esc(initials(who))}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold text-gray-900" title="${esc(who)}">${esc(who)}</p>
        <p class="truncate text-[13px] text-gray-500" title="${esc(a.email)}">${a.name ? `${esc(a.email)} · ` : ""}${esc(storesText)}</p>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          ${planPill(row.status)}
          ${a.isAdmin || a.phoneVerified ? "" : pill("Telefone por confirmar", "amber", "phone_iphone")}
        </div>
      </div>
      <button type="button" data-act="toggle" data-id="${esc(a.id)}" aria-expanded="${open}" aria-controls="${esc(panelId)}" aria-label="Detalhes de ${esc(who)}" class="${btnClass("ghost", "sm")} shrink-0">${icon(open ? "expand_less" : "expand_more")}<span>Detalhes</span></button>
    </div>
    <div id="${esc(panelId)}" class="mt-3 rounded-xl bg-gray-50 px-4 py-3" ${open ? "" : "hidden"}>
      <p class="text-xs text-gray-600">Conta criada a ${esc(fmtDate(a.createdAt))}${a.phone ? ` · ${esc(formatPhoneForDisplay(a.phone))}${a.phoneVerified ? " (confirmado)" : " (por confirmar)"}` : " · sem telemóvel"}</p>
      ${a.isAdmin || a.phoneVerified ? "" : `<p class="mt-2 text-sm text-gray-700">O telemóvel não está confirmado: nenhuma loja desta conta pode ser publicada.</p>
      <button type="button" data-act="verify-phone" data-id="${esc(a.id)}" class="${btnClass("primary", "sm")} mt-2">${icon("verified")} Confirmar telefone</button>`}
      ${row.stores.length
        ? `<ul role="list" class="mt-1 divide-y divide-gray-200">${row.stores.map(storeLine).join("")}</ul>`
        : `<p class="mt-2 text-sm text-gray-600">Esta conta ainda não tem lojas.</p>`}
      ${a.isAdmin ? "" : `<p class="mt-2 text-xs text-gray-600">Cada loja tem a sua subscrição: ativa-se, prolonga-se e desativa-se em <a href="${esc(ADMIN_HREFS.lojas)}" class="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500">Lojas</a>.</p>
      <div class="mt-3 border-t border-gray-200 pt-3">
        <button type="button" data-act="delete" data-id="${esc(a.id)}" class="${btnClass("dangerOutline", "sm")}">${icon("person_remove")} Eliminar conta</button>
      </div>`}
    </div>
  </li>`;
}

/** Desenha a secção «Contas». */
export async function renderAccounts(view: AdminView): Promise<void> {
  view.loading();
  const [accounts, stores, orfas] = await Promise.all([listAccounts(), listStores(), listOrphanAccounts()]);
  if (!view.isCurrent()) return;
  let presos: OrphanResult = orfas;

  const byOwner = new Map<string, AdminStore[]>();
  for (const s of stores) {
    const list = byOwner.get(s.ownerId) ?? [];
    list.push(s);
    byOwner.set(s.ownerId, list);
  }
  const rows: AccountRow[] = accounts.map((account) => {
    const own = byOwner.get(account.id) ?? [];
    return { account, status: statusOf(account, own), stores: own };
  });

  let filter: AccountFilter = FILTER_FROM_SUB[view.sub] ?? "donos";
  let query = "";
  const open = new Set<string>();

  const counts = (): Record<AccountFilter, number> => ({
    donos: rows.filter((r) => matches(r, "donos")).length,
    ativas: rows.filter((r) => matches(r, "ativas")).length,
    "a-terminar": rows.filter((r) => matches(r, "a-terminar")).length,
    sem: rows.filter((r) => matches(r, "sem")).length,
    "sem-telefone": rows.filter((r) => matches(r, "sem-telefone")).length,
    admins: rows.filter((r) => matches(r, "admins")).length,
  });
  const c = counts();

  const painted = view.paint(`
    ${liveRegion(LIVE)}
    <div id="acc-orphans"></div>
    <div class="mb-3">${searchField("acc-search", "Pesquisar contas", "Pesquisar por nome ou email…")}</div>
    <div class="mb-4">${filterChips("acc-filter", "Filtrar contas", [
      { value: "donos", label: "Donos de loja", count: c.donos },
      { value: "ativas", label: "Com subscrição", count: c.ativas },
      { value: "a-terminar", label: "A terminar", count: c["a-terminar"] },
      { value: "sem", label: "Sem subscrição", count: c.sem },
      { value: "sem-telefone", label: "Telefone por confirmar", count: c["sem-telefone"] },
      { value: "admins", label: "Administradores", count: c.admins },
    ], filter)}</div>
    <p id="acc-count" class="mb-2 text-sm text-gray-600"></p>
    <div id="acc-list"></div>`);
  if (!painted) return;

  function draw(): void {
    const presosEl = document.getElementById("acc-orphans");
    if (presosEl) presosEl.innerHTML = orphansCard(presos);
    const q = fold(query.trim());
    const inFilter = rows.filter((r) => matches(r, filter));
    const shown = inFilter.filter((r) => !q || fold(`${r.account.name} ${r.account.email}`).includes(q));
    const countEl = document.getElementById("acc-count");
    if (countEl) countEl.textContent = `${plural(shown.length, "conta", "contas")}${shown.length !== inFilter.length ? ` de ${inFilter.length}` : ""}`;
    const list = document.getElementById("acc-list");
    if (list) {
      list.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">${shown.map((r) => accountRow(r, open.has(r.account.id))).join("")}</ul>`
        : `<div class="rounded-xl border border-gray-200 bg-white shadow-sm">${emptyState("person_search", inFilter.length ? "Nenhuma conta corresponde à pesquisa." : "Nenhuma conta neste filtro.")}</div>`;
    }
    updateChipCounts("acc-filter", counts());
  }

  const rowOf = (id: string): AccountRow | undefined => rows.find((r) => r.account.id === id);

  /** Confirma o telemóvel à mão, quando a SMS não é caminho. */
  async function verifyPhone(row: AccountRow): Promise<void> {
    const a = row.account;
    const confirmed = await openDialog({
      title: "Confirmar o telemóvel?",
      body: `<p>Marca o telemóvel da conta <strong class="break-all">${esc(a.email || a.name)}</strong> como confirmado${a.phone ? ` (${esc(formatPhoneForDisplay(a.phone))})` : ""}.</p>
        <p>A partir daí, as lojas desta conta podem ser publicadas, desde que tenham subscrição ativa. Faça isto só depois de falar com o Dono: é a confirmação de que o número é dele.</p>`,
      confirmLabel: "Confirmar telefone",
      tone: "primary",
    });
    if (!confirmed) return;
    const result = await withBusy(() => adminVerifyPhone(a.id), "A confirmar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    a.phoneVerified = true;
    draw();
    const msg = `Telemóvel de ${a.email || a.name} confirmado.`;
    toast(msg);
    announce(LIVE, msg);
  }

  async function remove(row: AccountRow): Promise<void> {
    const a = row.account;
    // Sem email gravado, a confirmação pede uma palavra fixa.
    const expected = a.email || "ELIMINAR";
    const answer = await openDialog({
      title: "Eliminar a conta?",
      body: `<p>Apaga a conta <strong class="break-all">${esc(a.email || a.name)}</strong> e todas as lojas dela: produtos, imagens, encomendas e pedidos de levantamento. Não é possível desfazer.</p>`,
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

  /** Liberta um email preso: apaga a identidade que ficou sem conta. */
  async function free(id: string): Promise<void> {
    const o = presos.ok ? presos.list.find((x) => x.id === id) : undefined;
    if (!o) return;
    const confirmed = await openDialog({
      title: "Libertar o email?",
      body: `<p>Apaga a identidade de <strong class="break-all">${esc(o.email || o.id)}</strong>, que ficou atrás de uma conta eliminada. A partir daí o email volta a estar livre e a pessoa pode criar conta de novo.</p>
        <p>Não há lojas nem dados por apagar: esta conta já não tem perfil.</p>`,
      confirmLabel: "Libertar o email",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await withBusy(() => adminDeleteAccount(o.id), "A libertar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    if (presos.ok) presos = { ...presos, list: presos.list.filter((x) => x.id !== o.id) };
    draw();
    const msg = `Email ${o.email || o.id} libertado.`;
    toast(msg);
    announce(LIVE, msg);
  }

  document.getElementById("acc-orphans")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "free") { void free(btn.dataset.id ?? ""); return; }
    if (btn.dataset.act === "recheck") {
      void (async () => {
        presos = await withBusy(() => listOrphanAccounts(), "A verificar…");
        draw();
        if (!presos.ok) announce(LIVE, presos.message);
      })();
    }
  });

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
    if (act === "delete") void remove(row);
    else if (act === "verify-phone") void verifyPhone(row);
    else if (act === "toggle") {
      if (open.has(row.account.id)) open.delete(row.account.id);
      else open.add(row.account.id);
      draw();
      document.querySelector<HTMLButtonElement>(`button[data-act="toggle"][data-id="${CSS.escape(row.account.id)}"]`)?.focus();
    }
  });

  draw();
}
