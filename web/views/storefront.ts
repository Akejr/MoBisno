/** Loja publicada — resolve por subdomínio (com cache), aplica personalização e renderiza. */
import { render, esc, fadeInImages } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { brandOf } from "../lib/brand.js";

export async function renderStorefront(identifier: string): Promise<void> {
  const host = `${identifier}.mobisno.store`;
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind === "not_found") {
    render(`
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">storefront</span>
      <h1 class="text-headline-lg text-on-surface">Loja não encontrada</h1>
      <p class="text-on-surface-variant">O endereço <span class="font-medium">${esc(host)}</span> não corresponde a nenhuma loja publicada.</p>
      <a href="#/" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar ao início</a>
    </div>`);
    return;
  }

  const template = getTemplate(view.templateId);
  const app = render(template.render(view, custom));
  app.style.setProperty("--brand", brandOf(custom, view.templateId));
  fadeInImages(app);
  if (result.kind === "render") updateCartBadge(result.store.id);
}
