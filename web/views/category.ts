/** Página de categoria — resolve a loja e mostra só os produtos dessa categoria. */
import { render, fadeInImages, formatKz } from "../lib/dom.js";
import { allProductsHref, filterForCategoryPage, ALL_LABEL } from "../templates/sectionsModel.js";
import type { StoreRenderView } from "../templates/types.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { publicStoreUrl } from "../composition.js";
import { storeBasePath } from "../lib/routing.js";
import { applySeo, updateCanonical } from "../lib/seo.js";
import { categoryTitle, categoryDescription, collectionJsonLd, breadcrumbJsonLd, isModelStore } from "../../src/services/seo.js";
import { categorySlug, productSlugPath } from "../lib/slug.js";
import { storeNotFoundHtml } from "../templates/notFound.js";
import {
  resolveCategory, categoryPageHtml, categoryCanonicalLabel, isAllListingLabel, storeBrand, storeSeoFacts,
} from "./storeHtml.js";

/**
 * Página de categoria. `slugOrLabel` vem da URL (`/categoria/tenis-de-corrida`)
 * e é resolvido para o rótulo real da loja. As ligações antigas com o rótulo
 * percent-encoded continuam a funcionar (o resolvedor compara por slug).
 */
export async function renderCategoryPage(identifier: string, slugOrLabel: string): Promise<void> {
  const { result, view, custom, draft } = await loadStorefront(identifier);

  if (view.kind !== "render" || result.kind !== "render") {
    render(storeNotFoundHtml(identifier));
    return;
  }

  // Slug da URL → rótulo real («Produtos», «Destaques» e «Todos» incluídos).
  // A mesma resolução que o servidor usa para decidir entre 200 e 404.
  const resolved = resolveCategory(view, slugOrLabel);
  const category = resolved.label;

  // O mesmo HTML que o servidor pré-renderiza, com o seletor de ordenação já no
  // sítio: no primeiro desenho a página que está no ecrã é adotada.
  const app = render(categoryPageHtml(view, category, custom));
  const { brand, ink } = storeBrand(view, custom);
  app.style.setProperty("--brand", brand);
  app.style.setProperty("--brand-ink", ink);
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  updateCartBadge(result.store.id);

  const storeUrl = publicStoreUrl(identifier);
  mountCategoryFilter(app, view, identifier, category, storeUrl);
  mountListingSort(app, view);

  // SEO da listagem: descrição ÚNICA por categoria (nunca a da loja repetida),
  // trilho de navegação e a coleção de produtos em dados estruturados.
  const canonicalLabel = categoryCanonicalLabel(category);
  const url = `${storeUrl}/categoria/${categorySlug(canonicalLabel)}`;
  const items = filterForCategoryPage(view, category);
  const prices = items.map((p) => p.price).filter((n) => Number.isFinite(n));
  const description = categoryDescription({
    category,
    storeName: view.storeName,
    count: items.length,
    sampleNames: items.slice(0, 3).map((p) => p.name),
    priceFrom: prices.length ? formatKz(Math.min(...prices)) : null,
    facts: storeSeoFacts(view, custom, result.store),
  });
  const modelo = isModelStore({ identifier: result.store.identifier, customization: custom });

  applySeo({
    title: categoryTitle(category, view.storeName),
    description,
    canonical: url,
    image: items.find((p) => p.imageUrl)?.imageUrl ?? result.logo?.url ?? null,
    type: "website",
    siteName: view.storeName,
    // Endereço que não corresponde a listagem nenhuma (o servidor responde 404),
    // listagem vazia, loja-modelo ou rascunho: fora do índice.
    noindex: !resolved.known || !resolved.hasItems || modelo || draft === true,
    follow: resolved.known,
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
  return isAllListingLabel(label);
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
 * À entrada, os cartões de fora da categoria são escondidos aqui — e o servidor
 * já os enviou escondidos (uma folha de estilo só para o primeiro ecrã, que
 * `render()` retira), para a grelha não aparecer inteira e depois encolher.
 *
 * O endereço acompanha a escolha com `history.replaceState` e nunca com
 * `navigate()`: `navigate()` é o que dispara o router e recarrega a vista, ou
 * seja, o defeito que esta barra existe para corrigir. O canónico acompanha o
 * endereço (`updateCanonical`).
 */
function mountCategoryFilter(
  app: HTMLElement,
  view: StoreRenderView,
  identifier: string,
  activeLabel: string,
  storeUrl: string,
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
    // O canónico segue o endereço — senão a página filtrada declarava-se cópia
    // da categoria com que abriu.
    updateCanonical(`${storeUrl}/categoria/${categorySlug(categoryCanonicalLabel(titulo))}`);
  }

  apply(activeLabel, true);
  bar.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-cat-filter]");
    if (!chip) return;
    apply(chip.dataset.catFilter ?? ALL_LABEL, false);
  });
}

/**
 * Ordenação da listagem: reordena os cartões que já estão no ecrã, sem voltar ao
 * servidor. O seletor (`[data-listing-sort]`) vem no HTML da página
 * (`withListingSort` de `storeHtml.ts`) — a vista criava-o depois de desenhar e
 * a grelha saltava.
 *
 * Cada grelha é ordenada **dentro de si**: quando a página tem várias (secções
 * por categoria), juntar todos os cartões na primeira esvaziava as outras.
 */
function mountListingSort(app: HTMLElement, view: StoreRenderView): void {
  const sortSel = app.querySelector<HTMLSelectElement>("[data-listing-sort]");
  if (!sortSel) return;

  const grids = new Map<HTMLElement, { el: HTMLElement; i: number }[]>();
  app.querySelectorAll<HTMLElement>("[data-edit-product]").forEach((el, i) => {
    const grid = el.parentElement;
    if (!grid) return;
    const list = grids.get(grid) ?? [];
    list.push({ el, i });
    grids.set(grid, list);
  });
  if (!grids.size) return;

  const priceById = new Map(view.products.map((p) => [p.id, p.price]));
  const nameById = new Map(view.products.map((p) => [p.id, (p.name ?? "").toLowerCase()]));

  sortSel.addEventListener("change", () => {
    const mode = sortSel.value;
    for (const [grid, original] of grids) {
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
    }
  });
}
