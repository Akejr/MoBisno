/** Loja publicada — resolve por subdomínio (com cache), aplica personalização e renderiza. */
import { render, fadeInImages, formatKz } from "../lib/dom.js";
import { loadStorefront } from "../lib/storeCache.js";
import { updateCartBadge } from "../lib/cart.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { mountParticlesHeroes } from "../lib/particlesHero.js";
import { mountTestimonials } from "../lib/testimonialsCarousel.js";
import { publicStoreUrl } from "../composition.js";
import { applySeo, addressFromCustom } from "../lib/seo.js";
import { storeTitle, storeDescription, storeJsonLd, storeWebsiteJsonLd, collectionJsonLd, isModelStore } from "../../src/services/seo.js";
import { productSlugPath } from "../lib/slug.js";
import { trackPixel } from "../lib/pixels.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { storeNotFoundHtml, STORE_NOT_FOUND_TITLE, STORE_NOT_FOUND_MESSAGE } from "../templates/notFound.js";
import { storeHomeHtml, storeBrand, storeSeoFacts } from "./storeHtml.js";

export async function renderStorefront(identifier: string): Promise<void> {
  const { result, view, custom, draft } = await loadStorefront(identifier);

  if (view.kind === "not_found" || result.kind !== "render") {
    applySeo({ title: `${STORE_NOT_FOUND_TITLE} | MôBisno`, description: STORE_NOT_FOUND_MESSAGE, noindex: true });
    render(storeNotFoundHtml(identifier));
    return;
  }

  // O HTML é o mesmo que o servidor pré-renderiza (`storeHomeHtml`): no primeiro
  // desenho a página que já está no ecrã é adotada, sem ser reescrita.
  const app = render(storeHomeHtml(view, custom));
  const { brand, ink } = storeBrand(view, custom);
  app.style.setProperty("--brand", brand);
  app.style.setProperty("--brand-ink", ink);
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  mountParticlesHeroes(app);
  mountTestimonials(app);
  updateCartBadge(result.store.id);

  // SEO da loja (foco na loja, não na MôBisno). Respeita o título/descrição que
  // o dono definiu (ou que a IA gerou) — caso contrário o cliente sobrescrevia
  // com o genérico aquilo que o servidor já tinha pré-renderizado bem.
  const url = publicStoreUrl(identifier);
  const logoUrl = result.logo?.url ?? null;
  const ownTitle = custom.seo?.title?.trim();
  const facts = storeSeoFacts(view, custom, result.store);
  const description = storeDescription(view.storeName, custom.seo?.description, facts);
  const prices = view.products.map((p) => p.price).filter((n) => Number.isFinite(n));
  // Loja-modelo (demonstração) ou rascunho do próprio Dono: fora do índice.
  const modelo = isModelStore({ identifier: result.store.identifier, customization: custom });

  applySeo({
    title: ownTitle || storeTitle(view.storeName),
    description,
    canonical: `${url}/`,
    image: logoUrl,
    type: "website",
    siteName: view.storeName,
    noindex: modelo || draft === true,
    follow: modelo,
    jsonLd: [
      storeJsonLd({
        storeName: view.storeName,
        url,
        logoUrl,
        description: custom.seo?.description,
        address: addressFromCustom(custom),
        telephone: custom.whatsapp?.phone ?? null,
        priceRange: prices.length ? `${formatKz(Math.min(...prices))} – ${formatKz(Math.max(...prices))}` : null,
        facts,
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
  // As visitas do Dono ao seu rascunho não são visitas da loja.
  if (draft) return;
  trackPixel(custom, { type: "PageView" });
  void trackStoreEvent(result.store.id, "visit");
}
