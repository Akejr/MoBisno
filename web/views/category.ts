/** Página de categoria — resolve a loja e mostra só os produtos dessa categoria. */
import { render, fadeInImages, formatKz } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { headerCategories, allProductsHref, filterForCategoryPage, ALL_LABEL, FEATURED_LABEL } from "../templates/sectionsModel.js";
import type { StoreRenderView } from "../templates/types.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { publicStoreUrl } from "../composition.js";
import { storeBasePath } from "../lib/routing.js";
import { applySeo } from "../lib/seo.js";
import { categoryTitle, categoryDescription, collectionJsonLd, breadcrumbJsonLd } from "../../src/services/seo.js";
import { categorySlug, resolveCategoryLabel, productSlugPath } from "../lib/slug.js";
import { storeNotFoundHtml } from "../templates/notFound.js";

/**
 * Página de categoria. `slugOrLabel` vem da URL (`/categoria/tenis-de-corrida`)
 * e é resolvido para o rótulo real da loja. As ligações antigas com o rótulo
 * percent-encoded continuam a funcionar (o resolvedor compara por slug).
 */
export async function renderCategoryPage(identifier: string, slugOrLabel: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind !== "render" || result.kind !== "render") {
    render(storeNotFoundHtml(identifier));
    return;
  }

  // Slug da URL → rótulo real. Inclui os rótulos especiais ("Produtos",
  // "Destaques", "Todos") para que /categoria/produtos e /categoria/destaques
  // continuem a resolver.
  const known = [ALL_LABEL, FEATURED_LABEL, "Todos", ...headerCategories(view)];
  const category = resolveCategoryLabel(slugOrLabel, known) ?? slugOrLabel;

  const template = getTemplate(view.templateId);

  const html = template.renderCategory
    ? template.renderCategory(view, category, custom)
    : template.render(view, custom);

  const app = render(html);
  app.style.setProperty("--brand", brandOf(custom, view.templateId));
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  updateCartBadge(result.store.id);
  mountCategoryFilter(app, view, identifier, category);
  mountListingSort(app, view);

  // SEO da listagem: descrição ÚNICA por categoria (nunca a da loja repetida),
  // trilho de navegação e a coleção de produtos em dados estruturados.
  const storeUrl = publicStoreUrl(identifier);
  const url = `${storeUrl}/categoria/${categorySlug(category)}`;
  const items = filterForCategoryPage(view, category);
  const prices = items.map((p) => p.price).filter((n) => Number.isFinite(n));
  const description = categoryDescription({
    category,
    storeName: view.storeName,
    count: items.length,
    sampleNames: items.slice(0, 3).map((p) => p.name),
    priceFrom: prices.length ? formatKz(Math.min(...prices)) : null,
  });

  applySeo({
    title: categoryTitle(category, view.storeName),
    description,
    canonical: url,
    image: items.find((p) => p.imageUrl)?.imageUrl ?? result.logo?.url ?? null,
    type: "website",
    siteName: view.storeName,
    jsonLd: [
      collectionJsonLd({
        name: category,
        url,
        description,
        items: items.map((p) => ({
          name: p.name,
          url: `${storeUrl}/produto/${productSlugPath(p)}`,
          image: p.imageUrl ?? null,
          price: p.price,
        })),
      }),
      breadcrumbJsonLd([
        { name: view.storeName, url: `${storeUrl}/` },
        { name: category, url },
      ]),
    ],
  });
}

/** Um rótulo que significa «todos os produtos» (o do menu ou o das ligações antigas). */
function isAllLabel(label: string): boolean {
  return label === ALL_LABEL || label === "Todos";
}

/**
 * Liga a barra de filtros do modelo (`categoryFilterHtml`): trocar de categoria
 * passa a acontecer **nesta página**.
 *
 * O menu «Categorias» do cabeçalho navega para outra vista — o ecrã é
 * substituído, salta para o topo e, nas palavras do Dono, «somem todos os
 * botões». Aqui os cartões de **todos** os produtos já vieram no HTML do modelo
 * (`listingProducts`), pelo que filtrar é esconder e mostrar: não há pedido ao
 * servidor, não há vista nova.
 *
 * O endereço acompanha a escolha com `history.replaceState` e nunca com
 * `navigate()`: `navigate()` é o que dispara o router e recarrega a vista, ou
 * seja, o defeito que esta barra existe para corrigir.
 */
function mountCategoryFilter(
  app: HTMLElement,
  view: StoreRenderView,
  identifier: string,
  activeLabel: string,
): void {
  const bar = app.querySelector<HTMLElement>("[data-cat-filter-bar]");
  if (!bar) return;

  const chips = Array.from(bar.querySelectorAll<HTMLElement>("[data-cat-filter]"));
  const cards = Array.from(app.querySelectorAll<HTMLElement>("[data-product-category]"));
  const activeStyle = bar.dataset.catActiveStyle ?? "";
  const titleEl = app.querySelector<HTMLElement>("[data-cat-title]");
  const countEl = app.querySelector<HTMLElement>("[data-cat-count]");

  /**
   * @param label Categoria escolhida (o primeiro chip mostra tudo).
   * @param inicial À entrada, o título, a contagem e o endereço já são os certos
   *   — só os cartões de fora da categoria precisam de ser escondidos.
   */
  function apply(label: string, inicial: boolean): void {
    const todos = isAllLabel(label);
    let visiveis = 0;
    for (const card of cards) {
      const match = todos || (card.dataset.productCategory ?? "") === label;
      card.style.display = match ? "" : "none";
      if (match) visiveis += 1;
    }

    for (const chip of chips) {
      const on = chip.dataset.catFilter === label || (todos && isAllLabel(chip.dataset.catFilter ?? ""));
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      chip.setAttribute("style", on ? activeStyle : (chip.dataset.catBase ?? ""));
    }
    if (inicial) return;

    const titulo = todos ? ALL_LABEL : label;
    if (titleEl) titleEl.textContent = titulo;
    if (countEl) countEl.textContent = `${visiveis} produto(s)`;
    document.title = categoryTitle(titulo, view.storeName);

    // Endereço partilhável sem tocar no router: o caminho da categoria escolhida.
    const href = todos
      ? allProductsHref(view)
      : `${storeBasePath(identifier)}/categoria/${categorySlug(label)}`;
    history.replaceState(history.state, "", href + location.search);
  }

  apply(activeLabel, true);
  bar.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-cat-filter]");
    if (!chip) return;
    apply(chip.dataset.catFilter ?? ALL_LABEL, false);
  });
}

/**
 * Ordenação da listagem, injetada em qualquer modelo: reordena os cartões que já
 * estão no ecrã, sem voltar ao servidor. Entra dentro da barra de filtros do
 * modelo quando existe (uma linha só, à direita), senão fica acima da grelha.
 */
function mountListingSort(app: HTMLElement, view: StoreRenderView): void {
  const cards = Array.from(app.querySelectorAll<HTMLElement>("[data-edit-product]"));
  if (cards.length < 2) return; // sem produtos suficientes para ordenar
  const grid = cards[0].parentElement;
  if (!grid) return;

  const box = document.createElement("div");
  box.className = "ml-auto relative";
  box.innerHTML = `
    <select data-listing-sort class="text-sm rounded-full pl-4 pr-9 py-2 appearance-none cursor-pointer outline-none" style="border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit">
      <option value="rel">Ordenar: Relevância</option>
      <option value="preco-asc">Preço: mais baixo</option>
      <option value="preco-desc">Preço: mais alto</option>
      <option value="nome">Nome (A–Z)</option>
    </select>
    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[18px]" style="opacity:.6">expand_more</span>`;

  const bar = app.querySelector<HTMLElement>("[data-cat-filter-bar]");
  if (bar) {
    bar.appendChild(box);
  } else {
    // Sem barra (listagem de Destaques, loja sem categorias): linha própria, à
    // direita, para não ficar um selecionador solto encostado ao título.
    box.className = "relative";
    const row = document.createElement("div");
    row.className = "flex justify-end mb-6";
    row.appendChild(box);
    grid.parentElement?.insertBefore(row, grid);
  }

  const priceById = new Map(view.products.map((p) => [p.id, p.price]));
  const nameById = new Map(view.products.map((p) => [p.id, (p.name ?? "").toLowerCase()]));
  const original = cards.map((el, i) => ({ el, i }));

  const sortSel = box.querySelector<HTMLSelectElement>("[data-listing-sort]");
  sortSel?.addEventListener("change", () => {
    const mode = sortSel.value;
    const arr = [...original];
    arr.sort((a, b) => {
      const ia = a.el.dataset.editProduct ?? "";
      const ib = b.el.dataset.editProduct ?? "";
      if (mode === "preco-asc") return (priceById.get(ia) ?? 0) - (priceById.get(ib) ?? 0);
      if (mode === "preco-desc") return (priceById.get(ib) ?? 0) - (priceById.get(ia) ?? 0);
      if (mode === "nome") return (nameById.get(ia) ?? "").localeCompare(nameById.get(ib) ?? "");
      return a.i - b.i; // relevância = ordem original
    });
    arr.forEach((o) => grid.appendChild(o.el));
  });
}
