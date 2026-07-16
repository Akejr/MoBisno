/** Loja publicada — resolve por subdomínio (com cache), aplica personalização e renderiza. */
import { render, esc, fadeInImages } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { mountParticlesHeroes } from "../lib/particlesHero.js";
import { mountTestimonials } from "../lib/testimonialsCarousel.js";
import { mountFoodmartCarousels, mountFoodmartSearch } from "../lib/foodmartCarousel.js";
import { publicStoreUrl } from "../composition.js";
import { applySeo } from "../lib/seo.js";
import { storeTitle, storeDescription, storeJsonLd } from "../../src/services/seo.js";
import { trackPixel } from "../lib/pixels.js";
import { trackStoreEvent } from "../supabase/analytics.js";

export async function renderStorefront(identifier: string): Promise<void> {
  const host = `${identifier}.mobisno.store`;
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind === "not_found") {
    applySeo({ title: "Loja não encontrada | MôBisno", description: "Esta loja não existe ou não está publicada.", noindex: true });
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
  app.style.setProperty("--brand-ink", readableInk(brandOf(custom, view.templateId)));
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  mountParticlesHeroes(app);
  mountTestimonials(app);
  mountFoodmartCarousels(app);
  mountFoodmartSearch(app);
  if (result.kind === "render") updateCartBadge(result.store.id);

  // SEO da loja (foco na loja, não na MôBisno).
  const url = publicStoreUrl(identifier);
  const logoUrl = result.kind === "render" ? (result.logo?.url ?? null) : null;
  applySeo({
    title: storeTitle(view.storeName),
    description: storeDescription(view.storeName),
    canonical: url,
    image: logoUrl,
    type: "website",
    siteName: view.storeName,
    jsonLd: storeJsonLd({ storeName: view.storeName, url, logoUrl }),
  });
  trackPixel(custom, { type: "PageView" });
  if (result.kind === "render") void trackStoreEvent(result.store.id, "visit");
}
