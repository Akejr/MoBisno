/** Loja publicada — resolve por subdomínio (com cache), aplica personalização e renderiza. */
import { render, fadeInImages, formatKz } from "../lib/dom.js";
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
import { applySeo, addressFromCustom } from "../lib/seo.js";
import { storeTitle, storeDescription, storeJsonLd, storeWebsiteJsonLd, collectionJsonLd } from "../../src/services/seo.js";
import { productSlugPath } from "../lib/slug.js";
import { trackPixel } from "../lib/pixels.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { storeNotFoundHtml, STORE_NOT_FOUND_TITLE, STORE_NOT_FOUND_MESSAGE } from "../templates/notFound.js";

export async function renderStorefront(identifier: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind === "not_found") {
    applySeo({ title: `${STORE_NOT_FOUND_TITLE} | MôBisno`, description: STORE_NOT_FOUND_MESSAGE, noindex: true });
    render(storeNotFoundHtml(identifier));
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

  // SEO da loja (foco na loja, não na MôBisno). Respeita o título/descrição que
  // o dono definiu (ou que a IA gerou) — caso contrário o cliente sobrescrevia
  // com o genérico aquilo que o servidor já tinha pré-renderizado bem.
  const url = publicStoreUrl(identifier);
  const logoUrl = result.kind === "render" ? (result.logo?.url ?? null) : null;
  const ownTitle = custom.seo?.title?.trim();
  const description = storeDescription(view.storeName, custom.seo?.description);
  const prices = view.products.map((p) => p.price).filter((n) => Number.isFinite(n));

  applySeo({
    title: ownTitle || storeTitle(view.storeName),
    description,
    canonical: `${url}/`,
    image: logoUrl,
    type: "website",
    siteName: view.storeName,
    jsonLd: [
      storeJsonLd({
        storeName: view.storeName,
        url,
        logoUrl,
        description: custom.seo?.description,
        address: addressFromCustom(custom),
        telephone: custom.whatsapp?.phone ?? null,
        priceRange: prices.length ? `${formatKz(Math.min(...prices))} – ${formatKz(Math.max(...prices))}` : null,
      }),
      storeWebsiteJsonLd({ storeName: view.storeName, url }),
      collectionJsonLd({
        name: view.storeName,
        url: `${url}/`,
        description,
        items: view.products.map((p) => ({
          name: p.name,
          url: `${url}/produto/${productSlugPath(p)}`,
          image: p.imageUrl ?? null,
          price: p.price,
        })),
      }),
    ],
  });
  trackPixel(custom, { type: "PageView" });
  if (result.kind === "render") void trackStoreEvent(result.store.id, "visit");
}
