/**
 * «Lojas»: todas as lojas da plataforma, com o estado que o público vê.
 *
 * Três estados, por extenso e com cor: **Publicada** (no ar), **Publicada · fora
 * do ar** (o dono está sem subscrição — `storeStatus` de
 * `src/services/adminMetrics.ts`) e **Rascunho**. O selo «Pagamentos digitais»
 * mostra as lojas com Multicaixa Express e Referência Bancária ligados, e as
 * lojas-modelo (demonstrações da galeria) levam o selo «Loja-modelo» — a
 * eliminação delas faz-se em «Modelos», que verifica primeiro quem as usa.
 */
import { esc, toast, withBusy } from "../../lib/dom.js";
import { adminDeleteStore, adminSetStoreState, listStores, type AdminStore } from "../../supabase/admin.js";
import { ADMIN_HREFS, storeStatus, type StoreStatusKind } from "../../../src/services/adminMetrics.js";
import { openDialog } from "./dialog.js";
import {
  announce, bindChips, btnClass, emptyState, filterChips, fold, icon, liveRegion, pill, plural, searchField,
  storeLink, updateChipCounts, type AdminView,
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
  return storeStatus(s.state, s.ownerActive);
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
  const owner = s.isModel
    ? "Demonstração da galeria de modelos"
    : `Dono: ${s.ownerEmail || s.ownerName || "desconhecido"}${st === "offline" ? " · sem subscrição ativa" : ""}`;
  return `<li class="px-4 py-3">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-gray-900 break-words">${esc(name)}</span>
          ${s.isModel ? pill("Loja-modelo", "orange", "dashboard_customize") : ""}
        </p>
        ${storeLink(s.identifier)}
        <p class="text-sm text-gray-600 break-all">${esc(owner)}</p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        ${statePill(st)}
        ${s.digitalPayments ? pill("Pagamentos digitais", "blue", "bolt") : ""}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-act="edit" data-id="${esc(s.id)}" aria-label="Editar a loja ${esc(name)}" class="${btnClass("secondary", "sm")}">${icon("palette")} Editar</button>
        <button type="button" data-act="state" data-id="${esc(s.id)}" aria-label="${published ? "Despublicar" : "Publicar"} a loja ${esc(name)}" class="${btnClass("secondary", "sm")}">${icon(published ? "visibility_off" : "public")} ${published ? "Despublicar" : "Publicar"}</button>
        ${s.isModel
          ? `<a href="${esc(ADMIN_HREFS.modelos)}" class="${btnClass("ghost", "sm")}">Gerir em Modelos</a>`
          : `<button type="button" data-act="delete" data-id="${esc(s.id)}" aria-label="Eliminar a loja ${esc(name)}" class="${btnClass("dangerOutline", "sm")}">${icon("delete")}<span class="hidden sm:inline">Eliminar</span></button>`}
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
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">${shown.map(storeRow).join("")}</ul>`
        : `<div class="rounded-2xl border border-gray-200 bg-white">${emptyState("storefront", inFilter.length ? "Nenhuma loja corresponde à pesquisa." : stores.length ? "Nenhuma loja neste filtro." : "Ainda não há lojas.")}</div>`;
    }
    updateChipCounts("store-filter", counts());
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
    else if (act === "delete") void remove(s);
  });

  draw();
}
