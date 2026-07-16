/** Página de categoria — resolve a loja e mostra só os produtos dessa categoria. */
import { render, fadeInImages, esc } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { headerCategories, allProductsHref, ALL_LABEL } from "../templates/sectionsModel.js";
import type { StoreRenderView } from "../templates/types.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { publicStoreUrl } from "../composition.js";
import { applySeo } from "../lib/seo.js";
import { storeTitle, storeDescription, truncate } from "../../src/services/seo.js";

export async function renderCategoryPage(identifier: string, category: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind !== "render" || result.kind !== "render") {
    render(`
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">storefront</span>
      <h1 class="text-headline-lg text-on-surface">Loja não encontrada</h1>
      <a href="#/" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar ao início</a>
    </div>`);
    return;
  }

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
  mountListingToolbar(app, view, identifier, category);

  const url = `${publicStoreUrl(identifier)}/categoria/${encodeURIComponent(category)}`;
  applySeo({
    title: `${category} — ${storeTitle(view.storeName)}`,
    description: truncate(`${category} na ${view.storeName}. ${storeDescription(view.storeName)}`, 160),
    canonical: url,
    image: result.logo?.url ?? null,
    type: "website",
    siteName: view.storeName,
  });
}

/**
 * Barra de filtros/ordenação injetada acima da grelha de produtos, em qualquer
 * modelo. Herda a tipografia do modelo (é inserida no DOM da loja) e usa a cor
 * de marca (`var(--brand)`) nos elementos ativos. Os filtros por categoria são
 * ligações (navegação); a ordenação é feita no cliente, reordenando os cartões.
 */
function mountListingToolbar(
  app: HTMLElement,
  view: StoreRenderView,
  identifier: string,
  activeLabel: string,
): void {
  const cards = Array.from(app.querySelectorAll<HTMLElement>("[data-edit-product]"));
  if (cards.length < 2) return; // sem produtos suficientes para filtrar/ordenar
  const grid = cards[0].parentElement;
  if (!grid) return;

  const catHref = (label: string): string => `#/loja/${encodeURIComponent(identifier)}/categoria/${encodeURIComponent(label)}`;
  const cats = headerCategories(view);
  const isAll = activeLabel === ALL_LABEL || activeLabel === "Todos";

  const chip = (label: string, href: string, active: boolean): string =>
    `<a href="${esc(href)}" class="text-sm px-4 py-2 rounded-full whitespace-nowrap transition-colors" ` +
    (active
      ? `style="background:var(--brand);color:#fff;border:1px solid var(--brand)"`
      : `style="border:1px solid rgba(128,128,128,.32);color:inherit;opacity:.8"`) +
    `>${esc(label)}</a>`;

  const chips = [
    chip("Todos", allProductsHref(view), isAll),
    ...cats.map((c) => chip(c, catHref(c), !isAll && c === activeLabel)),
  ].join("");

  const bar = document.createElement("div");
  bar.className = "flex flex-wrap items-center gap-2 mb-8";
  bar.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 min-w-0">${chips}</div>
    <div class="ml-auto flex items-center gap-2">
      <span class="text-sm" style="opacity:.6">${cards.length} produto(s)</span>
      <div class="relative">
        <select data-listing-sort class="text-sm rounded-full pl-4 pr-9 py-2 appearance-none cursor-pointer outline-none" style="border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit">
          <option value="rel">Ordenar: Relevância</option>
          <option value="preco-asc">Preço: mais baixo</option>
          <option value="preco-desc">Preço: mais alto</option>
          <option value="nome">Nome (A–Z)</option>
        </select>
        <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[18px]" style="opacity:.6">expand_more</span>
      </div>
    </div>`;
  grid.parentElement?.insertBefore(bar, grid);

  const priceById = new Map(view.products.map((p) => [p.id, p.price]));
  const nameById = new Map(view.products.map((p) => [p.id, (p.name ?? "").toLowerCase()]));
  const original = cards.map((el, i) => ({ el, i }));

  const sortSel = bar.querySelector<HTMLSelectElement>("[data-listing-sort]");
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
