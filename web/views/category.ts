/** Página de categoria — resolve a loja e mostra só os produtos dessa categoria. */
import { render, fadeInImages } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";

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
  fadeInImages(app);
  updateCartBadge(result.store.id);
}
