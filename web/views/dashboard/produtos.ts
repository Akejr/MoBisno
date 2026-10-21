/**
 * Separador «Produtos» do Dashboard do Dono: o catálogo, com pesquisa, filtros
 * e duas vistas (grelha e lista). Criar e editar é no formulário de produto
 * (`web/lib/productForm.ts`), que também serve o editor.
 */
import { esc, fadeInImages, formatKz, toast, withBusy } from "../../lib/dom.js";
import { adminPanelFor, productRepository } from "../../composition.js";
import { openProductForm } from "../../lib/productForm.js";
import type { Product } from "../../../src/models/index.js";
import type { DashCtx } from "./context.js";
import {
  ACCENT_INK, BTN_GHOST, BTN_ICON, BTN_ICON_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT,
  card, emptyState, icon, pageIntro, pill, plural, segmented,
} from "./ui.js";

type Tipo = "all" | "physical" | "digital";
type Vista = "grid" | "list";

/** Etiquetas de estado do produto: destaque, indisponível, esgotado. */
function estadoProduto(p: Product): string {
  return [
    p.featured ? pill("Destaque", "accent", "star") : "",
    p.available ? "" : pill("Indisponível", "neutral", "visibility_off"),
    p.stock === 0 ? pill("Esgotado", "danger") : "",
  ].join("");
}

function tipoProduto(p: Product): string {
  return p.physical === false ? pill("Digital", "info") : pill("Físico", "success");
}

function fotoProduto(p: Product, grande: boolean): string {
  return p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex items-center justify-center text-gray-300">${icon("image", grande ? "text-[40px]" : "text-[22px]")}</div>`;
}

/** Cartão de produto (vista grelha). */
function productCard(p: Product): string {
  return `<li class="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
    <div class="relative bg-gray-50 aspect-square overflow-hidden">
      ${fotoProduto(p, true)}
      <div class="absolute top-2 left-2 flex flex-col items-start gap-1">${estadoProduto(p)}</div>
    </div>
    <div class="p-3 flex flex-col flex-1 min-w-0">
      <p class="font-semibold text-gray-900 text-sm line-clamp-2 break-words">${esc(p.name)}</p>
      <p class="font-black mt-0.5 tabular-nums" style="color:${ACCENT_INK}">${esc(formatKz(p.price))}</p>
      <div class="flex items-center gap-1.5 flex-wrap mt-2">${p.category ? pill(p.category, "neutral") : ""}${tipoProduto(p)}</div>
      <div class="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
        <button type="button" data-edit-prod="${esc(p.id)}" class="flex-1 ${BTN_GHOST}">${icon("edit", "text-[18px]")} Editar<span class="sr-only"> ${esc(p.name)}</span></button>
        <button type="button" data-del-prod="${esc(p.id)}" aria-label="Apagar ${esc(p.name)}" title="Apagar" class="${BTN_ICON_DANGER}">${icon("delete", "text-[18px]")}</button>
      </div>
    </div>
  </li>`;
}

/** Linha de produto (vista lista). */
function productRow(p: Product): string {
  return `<li class="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
    <div class="w-14 h-14 rounded-xl overflow-hidden bg-gray-50 shrink-0">${fotoProduto(p, false)}</div>
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-gray-900 truncate">${esc(p.name)}</p>
      <div class="flex items-center gap-1.5 flex-wrap mt-1">
        <span class="font-bold text-sm tabular-nums" style="color:${ACCENT_INK}">${esc(formatKz(p.price))}</span>
        ${estadoProduto(p)}
        ${p.category ? pill(p.category, "neutral") : ""}
        ${tipoProduto(p)}
      </div>
    </div>
    <button type="button" data-edit-prod="${esc(p.id)}" aria-label="Editar ${esc(p.name)}" title="Editar" class="${BTN_ICON}">${icon("edit")}</button>
    <button type="button" data-del-prod="${esc(p.id)}" aria-label="Apagar ${esc(p.name)}" title="Apagar" class="${BTN_ICON_DANGER}">${icon("delete")}</button>
  </li>`;
}

export async function renderProdutos(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store, ownerId } = ctx;
  const panel = adminPanelFor(store.id);
  const list = await productRepository.listByStore(store.id);
  const cats = [...new Set(list.map((p) => p.category).filter((c): c is string => !!c))]
    .sort((a, b) => a.localeCompare(b, "pt"));
  const visiveis = list.filter((p) => p.available).length;
  const recarregar = (): Promise<void> => renderProdutos(ctx);

  const abrirFormulario = (product?: Product): void =>
    openProductForm({ panel, ownerId, storeId: store.id, product: product ?? null, categories: cats, onDone: recarregar });

  let q = "";
  let cat = "";
  let tipo: Tipo = "all";
  let vista: Vista = localStorage.getItem("mb-prod-view") === "list" ? "list" : "grid";

  const filtros = list.length ? `
    <div class="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-0">
        <label for="prod-search" class="sr-only">Pesquisar produtos</label>
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">${icon("search")}</span>
        <input id="prod-search" type="search" placeholder="Pesquisar produtos…" autocomplete="off" class="${INPUT} pl-10" />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <label for="prod-cat" class="sr-only">Categoria</label>
        <select id="prod-cat" class="${INPUT} sm:w-52">
          <option value="">Todas as categorias</option>
          ${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
        </select>
        ${segmented("type", [{ value: "all", label: "Todos" }, { value: "physical", label: "Físicos" }, { value: "digital", label: "Digitais" }], tipo, "Tipo de produto")}
        <div role="group" aria-label="Vista" class="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
          <button type="button" data-view="grid" aria-pressed="${vista === "grid"}" aria-label="Ver em grelha" title="Grelha" class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 aria-pressed:bg-white aria-pressed:text-[#C2410C] aria-pressed:shadow-sm">${icon("grid_view")}</button>
          <button type="button" data-view="list" aria-pressed="${vista === "list"}" aria-label="Ver em lista" title="Lista" class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 aria-pressed:bg-white aria-pressed:text-[#C2410C] aria-pressed:shadow-sm">${icon("view_list")}</button>
        </div>
      </div>
    </div>` : "";

  const pintado = ctx.paint(`
    ${pageIntro(
      list.length
        ? `${plural(list.length, "produto", "produtos")} no catálogo, ${visiveis} ${visiveis === 1 ? "visível" : "visíveis"} na loja.`
        : "Os produtos que vende, com foto, preço, stock e variações.",
      `<button type="button" id="add" class="${BTN_PRIMARY}">${icon("add", "text-[18px]")} Adicionar produto</button>`,
    )}
    ${filtros}
    <div id="prod-grid"></div>
    <p id="prod-count" class="sr-only" role="status"></p>`);
  if (!pintado) return;

  const grid = document.getElementById("prod-grid");
  const contador = document.getElementById("prod-count");

  function desenhar(): void {
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = card(emptyState({
        icon: "inventory_2", title: "Ainda não há produtos",
        text: "Adicione o primeiro produto: uma foto, o nome e o preço chegam para começar.",
        actions: `<button type="button" data-add-first class="${BTN_PRIMARY}">${icon("add", "text-[18px]")} Adicionar o primeiro produto</button>`,
      }));
      return;
    }
    const ql = q.trim().toLowerCase();
    const filtrados = list.filter((p) => {
      if (cat && (p.category ?? "") !== cat) return false;
      if (tipo === "physical" && p.physical === false) return false;
      if (tipo === "digital" && p.physical !== false) return false;
      if (ql && !`${p.name} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    if (contador) contador.textContent = `${plural(filtrados.length, "produto", "produtos")} encontrados.`;
    if (!filtrados.length) {
      grid.innerHTML = card(emptyState({
        icon: "search_off", title: "Nenhum produto corresponde aos filtros",
        text: "Experimente outra pesquisa ou mostre todas as categorias.",
        actions: `<button type="button" data-clear-filters class="${BTN_SECONDARY}">Limpar filtros</button>`,
      }));
      return;
    }
    grid.innerHTML = vista === "list"
      ? `<ul class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-sm">${filtrados.map(productRow).join("")}</ul>`
      : `<ul class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">${filtrados.map(productCard).join("")}</ul>`;
    fadeInImages(grid);
  }

  async function apagar(id: string): Promise<void> {
    const req = await panel.controllers.products.requestRemoval(ownerId, store.id, id);
    if (req.status !== "confirmation_required") { toast(req.message, "error"); return; }
    if (!confirm(req.prompt.message)) return;
    const done = await withBusy(() => panel.controllers.products.confirmRemoval(ownerId, store.id, id), "A remover o produto…");
    if (done.status === "removed") { toast(done.message); await recarregar(); }
    else toast(done.message, "error");
  }

  // Um ouvinte só para a grelha inteira: redesenhar não deixa botões sem ligação.
  grid?.addEventListener("click", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-edit-prod],[data-del-prod],[data-add-first],[data-clear-filters]");
    if (!alvo) return;
    if (alvo.dataset.editProd) {
      const p = list.find((x) => x.id === alvo.dataset.editProd);
      if (p) abrirFormulario(p);
    } else if (alvo.dataset.delProd) {
      void apagar(alvo.dataset.delProd);
    } else if (alvo.hasAttribute("data-add-first")) {
      abrirFormulario();
    } else {
      q = ""; cat = ""; tipo = "all";
      const pesquisa = document.getElementById("prod-search") as HTMLInputElement | null;
      const categoria = document.getElementById("prod-cat") as HTMLSelectElement | null;
      if (pesquisa) pesquisa.value = "";
      if (categoria) categoria.value = "";
      document.querySelectorAll<HTMLElement>("[data-type]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === tipo)));
      desenhar();
    }
  });

  document.getElementById("add")?.addEventListener("click", () => abrirFormulario());
  (document.getElementById("prod-search") as HTMLInputElement | null)?.addEventListener("input", (e) => {
    q = (e.target as HTMLInputElement).value;
    desenhar();
  });
  (document.getElementById("prod-cat") as HTMLSelectElement | null)?.addEventListener("change", (e) => {
    cat = (e.target as HTMLSelectElement).value;
    desenhar();
  });
  document.querySelectorAll<HTMLElement>("[data-type]").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.type;
      tipo = v === "physical" || v === "digital" ? v : "all";
      document.querySelectorAll<HTMLElement>("[data-type]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.type === tipo)));
      desenhar();
    }));
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      vista = b.dataset.view === "list" ? "list" : "grid";
      localStorage.setItem("mb-prod-view", vista);
      document.querySelectorAll<HTMLElement>("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === vista)));
      desenhar();
    }));

  desenhar();
}
