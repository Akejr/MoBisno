/**
 * «Lojas»: todas as lojas da plataforma, com o estado que o público vê e a
 * subscrição de cada uma.
 *
 * Três estados, por extenso e com cor: **Publicada** (no ar), **Publicada · fora
 * do ar** (a loja está sem subscrição — `storeStatus` de
 * `src/services/adminMetrics.ts`) e **Rascunho**. O selo «Pagamentos digitais»
 * mostra as lojas com Multicaixa Express e Referência Bancária ligados, e as
 * lojas-modelo (demonstrações da galeria) levam o selo «Loja-modelo» — a
 * eliminação delas faz-se em «Modelos», que verifica primeiro quem as usa.
 *
 * A subscrição é de cada loja (migração 0025), e ativa-se aqui, loja a loja:
 *
 *  - **Ativar** (ou **Prolongar**, com a subscrição em vigor) 1, 3, 6 ou 12
 *    meses. A data sai de `activationPatch`, a regra de `planActivationPatch`:
 *    os meses somam-se ao fim do período em curso, ou contam a partir de hoje. O
 *    diálogo mostra o preço de cada duração e a data em que a subscrição fica a
 *    terminar, antes de confirmar;
 *  - **Desativar**, que termina o período agora, com confirmação, porque tira a
 *    loja do ar. As outras lojas do mesmo dono não mudam.
 */
import { esc, formatKz, toast, withBusy } from "../../lib/dom.js";
import {
  adminActivateStorePlan, adminDeactivateStorePlan, adminDeleteStore, adminSetStoreState, listStores,
  type AdminStore,
} from "../../supabase/admin.js";
import {
  ACTIVATION_MONTHS, ADMIN_HREFS, accountStatus, activationPatch, activationQuote, storeStatus,
  type AccountStatus, type StoreStatusKind,
} from "../../../src/services/adminMetrics.js";
import { resolveBilling } from "../../../src/services/billing.js";
import { openDialog } from "./dialog.js";
import {
  announce, bindChips, btnClass, emptyState, filterChips, fmtDate, fold, icon, iconButton, liveRegion, monthsLabel, pill,
  planPill, plural, searchField, storeLink, updateChipCounts, type AdminView,
} from "./ui.js";

type StoreFilter = "todas" | "publicadas" | "fora" | "rascunho" | "digitais" | "modelos";

/** Filtro inicial a partir do endereço (`#/adminPainel/lojas/<filtro>`). */
const FILTER_FROM_SUB: Readonly<Record<string, StoreFilter>> = {
  publicadas: "publicadas",
  "fora-do-ar": "fora",
  rascunho: "rascunho",
  "pagamentos-digitais": "digitais",
  modelos: "modelos",
};

const LIVE = "store-live";

function statusOf(s: AdminStore): StoreStatusKind {
  return storeStatus(s.state, s.planActive);
}

/** Estado da subscrição da loja, com os critérios das métricas. */
function planOf(s: AdminStore): AccountStatus {
  return accountStatus({ isAdmin: s.ownerIsAdmin, planExpiresAt: s.planExpiresAt });
}

function isActive(st: AccountStatus): boolean {
  return st.kind === "active" || st.kind === "expiring";
}

/**
 * Os filtros de estado são das lojas de clientes: «Publicadas» conta o mesmo que
 * o cartão «Lojas publicadas» da Visão geral (as no ar e as fora do ar), e as
 * lojas-modelo têm o filtro delas.
 */
function matches(s: AdminStore, filter: StoreFilter): boolean {
  if (filter === "todas") return true;
  if (filter === "modelos") return s.isModel;
  if (s.isModel) return false;
  const st = statusOf(s);
  if (filter === "publicadas") return st !== "draft";
  if (filter === "fora") return st === "offline";
  if (filter === "rascunho") return st === "draft";
  return s.digitalPayments;
}

function statePill(st: StoreStatusKind): string {
  if (st === "online") return pill("Publicada", "green");
  if (st === "offline") return pill("Publicada · fora do ar", "amber", "cloud_off");
  return pill("Rascunho", "gray");
}

function storeRow(s: AdminStore): string {
  const st = statusOf(s);
  const name = s.name || "Loja sem nome";
  const published = s.state === "Publicada";
  const owner = s.isModel ? "Demonstração da galeria de modelos" : `Dono: ${s.ownerEmail || s.ownerName || "desconhecido"}`;
  const plano = planOf(s);
  const ativa = isActive(plano);
  // As lojas de um administrador publicam sem subscrição: não há nada para ativar.
  /*
   * Uma ação com nome (a da subscrição, que é a que mais se usa) e as outras
   * em botões só com ícone. Eram cinco botões com texto em cada linha, e a
   * linha parecia uma barra de ferramentas.
   */
  const subscricao = s.isModel || s.ownerIsAdmin ? "" : `
        <button type="button" data-act="activate" data-id="${esc(s.id)}" aria-label="${ativa ? "Prolongar" : "Ativar"} a subscrição da loja ${esc(name)}" class="${btnClass(ativa ? "secondary" : "primary", "sm")}">${icon(ativa ? "more_time" : "check_circle", "text-[17px]")} ${ativa ? "Prolongar" : "Ativar"}</button>
        ${ativa ? iconButton({ act: "deactivate", id: s.id, label: `Desativar a subscrição da loja ${name}`, icon: "event_busy", danger: true }) : ""}`;
  /*
   * Dois blocos, e não três colunas lado a lado. Em três colunas, os selos e os
   * seis botões ficavam com a largura que queriam e a coluna do nome encolhia
   * até ao mínimo: «dotangola.sualoja.digital» partia letra a letra numa coluna
   * de quatro caracteres, e o email do Dono também. Agora o nome, o endereço e
   * o Dono ocupam a linha toda e cortam com reticências quando não cabem (o
   * texto inteiro fica no `title`); os selos vão por baixo deles, e as ações só
   * passam para o lado em ecrãs largos, onde há espaço para as duas coisas.
   */
  return `<li class="px-4 py-3.5">
    <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate font-semibold text-gray-900" title="${esc(name)}">${esc(name)}</span>
          ${s.isModel ? pill("Loja-modelo", "orange", "dashboard_customize") : ""}
        </div>
        <div class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          ${storeLink(s.identifier)}
          <span class="min-w-0 max-w-full truncate text-sm text-gray-600" title="${esc(owner)}">${esc(owner)}</span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          ${statePill(st)}
          ${s.isModel ? "" : planPill(plano)}
          ${s.digitalPayments ? pill("Pagamentos digitais", "blue", "bolt") : ""}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end">${subscricao}
        ${iconButton({ act: "edit", id: s.id, label: `Editar a loja ${name}`, icon: "palette" })}
        ${iconButton({ act: "state", id: s.id, label: `${published ? "Despublicar" : "Publicar"} a loja ${name}`, icon: published ? "visibility_off" : "public" })}
        ${s.isModel
          ? `<a href="${esc(ADMIN_HREFS.modelos)}" class="${btnClass("ghost", "sm")}">Gerir em Modelos</a>`
          : iconButton({ act: "delete", id: s.id, label: `Eliminar a loja ${name}`, icon: "delete", danger: true })}
      </div>
    </div>
  </li>`;
}

/** Desenha a secção «Lojas». */
export async function renderStores(view: AdminView): Promise<void> {
  view.loading();
  const stores = await listStores();
  if (!view.isCurrent()) return;

  let filter: StoreFilter = FILTER_FROM_SUB[view.sub] ?? "todas";
  let query = "";

  const counts = (): Record<StoreFilter, number> => ({
    todas: stores.length,
    publicadas: stores.filter((s) => matches(s, "publicadas")).length,
    fora: stores.filter((s) => matches(s, "fora")).length,
    rascunho: stores.filter((s) => matches(s, "rascunho")).length,
    digitais: stores.filter((s) => matches(s, "digitais")).length,
    modelos: stores.filter((s) => matches(s, "modelos")).length,
  });
  const c = counts();

  const painted = view.paint(`
    ${liveRegion(LIVE)}
    <div class="mb-3">${searchField("store-search", "Pesquisar lojas", "Pesquisar por loja, endereço ou dono…")}</div>
    <div class="mb-4">${filterChips("store-filter", "Filtrar lojas", [
      { value: "todas", label: "Todas", count: c.todas },
      { value: "publicadas", label: "Publicadas", count: c.publicadas },
      { value: "fora", label: "Fora do ar", count: c.fora },
      { value: "rascunho", label: "Rascunho", count: c.rascunho },
      { value: "digitais", label: "Pagamentos digitais", count: c.digitais },
      { value: "modelos", label: "Lojas-modelo", count: c.modelos },
    ], filter)}</div>
    <p id="store-count" class="mb-2 text-sm text-gray-600"></p>
    <div id="store-list"></div>`);
  if (!painted) return;

  function draw(): void {
    const q = fold(query.trim());
    const inFilter = stores.filter((s) => matches(s, filter));
    const shown = inFilter.filter((s) => !q || fold(`${s.name} ${s.identifier} ${s.ownerEmail} ${s.ownerName}`).includes(q));
    const countEl = document.getElementById("store-count");
    if (countEl) countEl.textContent = `${plural(shown.length, "loja", "lojas")}${shown.length !== inFilter.length ? ` de ${inFilter.length}` : ""}`;
    const list = document.getElementById("store-list");
    if (list) {
      list.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">${shown.map(storeRow).join("")}</ul>`
        : `<div class="rounded-xl border border-gray-200 bg-white shadow-sm">${emptyState("storefront", inFilter.length ? "Nenhuma loja corresponde à pesquisa." : stores.length ? "Nenhuma loja neste filtro." : "Ainda não há lojas.")}</div>`;
    }
    updateChipCounts("store-filter", counts());
  }

  /** Atualiza a subscrição de uma loja depois de gravar, e redesenha. */
  function setPlan(s: AdminStore, planExpiresAt: string): void {
    s.planExpiresAt = planExpiresAt;
    s.planActive = s.ownerIsAdmin || resolveBilling({ planExpiresAt }).accessActive;
    draw();
  }

  async function activate(s: AdminStore): Promise<void> {
    const plano = planOf(s);
    const extending = isActive(plano);
    const name = s.name || "Loja sem nome";
    const options = ACTIVATION_MONTHS.map((m) => {
      const q = activationQuote(m);
      return { value: String(m), label: monthsLabel(m), detail: `${q.days} dias · ${formatKz(q.amountKz)}` };
    });
    const answer = await openDialog({
      title: extending ? "Prolongar a subscrição" : "Ativar a subscrição",
      body: `<p class="font-semibold text-gray-900 break-words">${esc(name)}</p>
        <p class="text-sm text-gray-600 break-all">Dono: ${esc(s.ownerEmail || s.ownerName || "desconhecido")}</p>
        <p>${extending
          ? `Ativa até ${esc(fmtDate(plano.expiresAt))}. Os meses somam-se ao fim do período atual.`
          : "Os meses contam a partir de hoje."} A subscrição é só desta loja. Ative depois de confirmar o pagamento do Dono.</p>`,
      confirmLabel: extending ? "Prolongar" : "Ativar",
      tone: "primary",
      choice: {
        legend: "Duração",
        options,
        value: String(ACTIVATION_MONTHS[0]),
        describe: (value) => {
          const p = activationPatch(s, Number(value));
          return p.ok ? `Fica ativa até <strong>${esc(fmtDate(p.patch.plan_expires_at))}</strong>.` : esc(p.message);
        },
      },
    });
    if (!answer?.choice) return;
    const months = Number(answer.choice);
    const result = await withBusy(() => adminActivateStorePlan(s.id, months), "A ativar a subscrição…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    setPlan(s, result.planExpiresAt);
    const msg = `Subscrição da loja «${name}» ativa até ${fmtDate(result.planExpiresAt)}.`;
    toast(msg);
    announce(LIVE, msg);
  }

  async function deactivate(s: AdminStore): Promise<void> {
    const name = s.name || "Loja sem nome";
    const confirmed = await openDialog({
      title: "Desativar a subscrição?",
      body: `<p>A loja <strong>${esc(name)}</strong> fica sem subscrição a partir de agora.</p>
        <p>${s.state === "Publicada" ? "Sai do ar até a subscrição voltar a ser ativada." : "Não pode ser publicada até a subscrição voltar a ser ativada."} As outras lojas do mesmo dono não mudam. Nada é apagado.</p>`,
      confirmLabel: "Desativar",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await withBusy(() => adminDeactivateStorePlan(s.id), "A desativar a subscrição…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    setPlan(s, result.planExpiresAt);
    const msg = `Subscrição da loja «${name}» desativada.`;
    toast(msg);
    announce(LIVE, msg);
  }

  async function toggleState(s: AdminStore): Promise<void> {
    const next = s.state === "Publicada" ? "Rascunho" : "Publicada";
    if (next === "Rascunho") {
      const confirmed = await openDialog({
        title: "Despublicar a loja?",
        body: `<p>A loja <strong>${esc(s.name || "sem nome")}</strong> deixa de estar visível ao público. Pode voltar a publicá-la quando quiser; nada é apagado.</p>`,
        confirmLabel: "Despublicar",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    const result = await withBusy(() => adminSetStoreState(s.id, next), next === "Publicada" ? "A publicar…" : "A despublicar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    s.state = next;
    draw();
    const msg = next === "Publicada" ? `Loja «${s.name}» publicada.` : `Loja «${s.name}» despublicada.`;
    toast(msg);
    announce(LIVE, msg);
  }

  async function remove(s: AdminStore): Promise<void> {
    const name = s.name.trim();
    const answer = await openDialog({
      title: "Eliminar a loja?",
      body: `<p>Apaga a loja <strong>${esc(name || "sem nome")}</strong> com os produtos, imagens, encomendas e pedidos de levantamento. Não é possível desfazer.</p>`,
      confirmLabel: "Eliminar loja",
      tone: "danger",
      fields: [{
        id: "confirm",
        label: name ? "Escreva o nome da loja para confirmar" : "Escreva ELIMINAR para confirmar",
        validate: (value) => (value.trim() === (name || "ELIMINAR") ? null : name ? "O nome não corresponde." : "Escreva ELIMINAR."),
      }],
    });
    if (!answer) return;
    const result = await withBusy(() => adminDeleteStore(s.id), "A eliminar a loja…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    const i = stores.indexOf(s);
    if (i >= 0) stores.splice(i, 1);
    draw();
    const msg = `Loja «${name}» eliminada.`;
    toast(msg);
    announce(LIVE, msg);
  }

  document.getElementById("store-search")?.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    draw();
  });
  bindChips("store-filter", (value) => { filter = value as StoreFilter; draw(); });

  document.getElementById("store-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn) return;
    const s = stores.find((x) => x.id === btn.dataset.id);
    if (!s) return;
    const act = btn.dataset.act;
    if (act === "edit") view.openStoreEditor(s.id, s.ownerId);
    else if (act === "state") void toggleState(s);
    else if (act === "activate") void activate(s);
    else if (act === "deactivate") void deactivate(s);
    else if (act === "delete") void remove(s);
  });

  draw();
}
