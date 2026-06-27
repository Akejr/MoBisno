/**
 * Pixels de marketing por loja: Meta Pixel (Facebook/Instagram) e Google
 * Analytics 4. Os IDs vivem em `custom.marketing`. Como a loja é renderizada
 * via innerHTML (os `<script>` não correm), os pixels são injetados
 * programaticamente. Cada pixel é carregado uma única vez por sessão de página.
 */
import type { StoreCustomization } from "../templates/types.js";

interface FbqWindow extends Window { fbq?: (...args: unknown[]) => void; _fbqLoaded?: string; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; _gaLoaded?: string; }
const w = window as unknown as FbqWindow;

/** Carrega o Meta Pixel uma vez para o `id` dado. */
function ensureMetaPixel(id: string): void {
  if (!id || w._fbqLoaded === id) return;
  w._fbqLoaded = id;
  /* eslint-disable */
  (function (f: any, b, e, v) {
    if (f.fbq) return; const n: any = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const t = b.createElement(e); t.async = true; t.src = v;
    const s = b.getElementsByTagName(e)[0]; s.parentNode!.insertBefore(t, s);
  })(w, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  w.fbq && w.fbq("init", id);
}

/** Carrega o Google Analytics 4 uma vez para o `id` dado. */
function ensureGa(id: string): void {
  if (!id || w._gaLoaded === id) return;
  w._gaLoaded = id;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer!.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", id);
}

export type PixelEvent =
  | { type: "PageView" }
  | { type: "ViewContent"; name: string; id: string; value?: number }
  | { type: "AddToCart"; name: string; id: string; value?: number }
  | { type: "Purchase"; value: number };

/** Garante os pixels da loja carregados e dispara um evento. */
export function trackPixel(custom: StoreCustomization | undefined, ev: PixelEvent): void {
  const m = custom?.marketing;
  if (!m) return;
  const metaId = (m.metaPixelId || "").trim();
  const gaId = (m.gaId || "").trim();
  if (!metaId && !gaId) return;

  try {
    if (metaId) ensureMetaPixel(metaId);
    if (gaId) ensureGa(gaId);

    const currency = "AOA";
    if (ev.type === "PageView") {
      metaId && w.fbq && w.fbq("track", "PageView");
      gaId && w.gtag && w.gtag("event", "page_view");
    } else if (ev.type === "ViewContent") {
      metaId && w.fbq && w.fbq("track", "ViewContent", { content_name: ev.name, content_ids: [ev.id], value: ev.value, currency });
      gaId && w.gtag && w.gtag("event", "view_item", { items: [{ item_id: ev.id, item_name: ev.name, price: ev.value }], currency });
    } else if (ev.type === "AddToCart") {
      metaId && w.fbq && w.fbq("track", "AddToCart", { content_name: ev.name, content_ids: [ev.id], value: ev.value, currency });
      gaId && w.gtag && w.gtag("event", "add_to_cart", { items: [{ item_id: ev.id, item_name: ev.name, price: ev.value }], currency });
    } else if (ev.type === "Purchase") {
      metaId && w.fbq && w.fbq("track", "Purchase", { value: ev.value, currency });
      gaId && w.gtag && w.gtag("event", "purchase", { value: ev.value, currency });
    }
  } catch {
    /* nunca quebra a loja por causa de um pixel */
  }
}
