/**
 * Pré-visualização de Modelos de loja com produtos de exemplo.
 *
 * Usa iframes (com viewport próprio) para que a pré-visualização seja
 * verdadeiramente responsiva (toggle Desktop/Telemóvel) e navegável (abrir a
 * página de produto / categoria), e para mostrar o site real como miniatura no
 * card de escolha do modelo.
 */
import { getTemplate } from "../templates/registry.js";
import { DEFAULT_LOGO, type StoreRenderView, type StoreProductView } from "../../src/storefront/storeRenderer.js";

const SAMPLE_IMG = (seed: string) => `https://images.unsplash.com/${seed}?q=80&w=600`;

const SAMPLE_PRODUCTS: StoreProductView[] = [
  { id: "s1", name: "Camisola Oficial", description: "Edição 2024/25", category: "Camisolas", price: 25000, imageUrl: SAMPLE_IMG("photo-1517466787929-bc90951d0974") },
  { id: "s2", name: "Ténis de Corrida", description: "Leves e respiráveis", category: "Calçado", price: 42000, imageUrl: SAMPLE_IMG("photo-1542291026-7eec264c27ff") },
  { id: "s3", name: "Bola de Futebol", description: "Tamanho 5", category: "Acessórios", price: 9000, imageUrl: SAMPLE_IMG("photo-1614632537190-23e4146777db") },
  { id: "s4", name: "Mochila Desportiva", description: "Resistente à água", category: "Acessórios", price: 18000, imageUrl: SAMPLE_IMG("photo-1553062407-98eeb64c6a62") },
  { id: "s5", name: "Calções de Treino", description: "Tecido elástico", category: "Vestuário", price: 12000, imageUrl: SAMPLE_IMG("photo-1556906781-9a412961c28c") },
  { id: "s6", name: "Garrafa Térmica", description: "750ml", category: "Acessórios", price: 6500, imageUrl: SAMPLE_IMG("photo-1602143407151-7111542de6e8") },
  { id: "s7", name: "Casaco Corta-Vento", description: "Unissexo", category: "Vestuário", price: 30000, imageUrl: SAMPLE_IMG("photo-1551028719-00167b16eac5") },
  { id: "s8", name: "Meias (3 pares)", description: "Algodão", category: "Vestuário", price: 4500, imageUrl: SAMPLE_IMG("photo-1586350977771-b3b0abd50c82") },
];

function sampleView(templateId: string): StoreRenderView {
  const brand = { kind: "fallback" as const, identity: DEFAULT_LOGO, alt: "A Sua Loja" };
  return {
    kind: "render",
    templateId,
    storeName: "A Sua Loja",
    subdomain: "exemplo.mobisno.store",
    header: { brand, storeName: "A Sua Loja" },
    menu: { brand, items: [{ label: "Início" }, { label: "Novidades" }, { label: "Promoções" }] },
    banners: [],
    products: SAMPLE_PRODUCTS,
  };
}

/** Documento HTML completo (srcdoc) com Tailwind + fontes + a marca aplicada. */
function buildSrcdoc(body: string, brand: string, interactive: boolean): string {
  const navScript = interactive
    ? `<script>
        document.addEventListener('click', function (e) {
          var prod = e.target.closest('[data-edit-product]');
          if (prod) { e.preventDefault(); parent.postMessage({ mbNav: 'product', id: prod.getAttribute('data-edit-product') }, '*'); return; }
          var a = e.target.closest('a'); if (!a) return; e.preventDefault();
          var href = a.getAttribute('href') || '';
          var cat = href.match(/\\/categoria\\/([^/]+)/);
          if (cat) { parent.postMessage({ mbNav: 'category', value: decodeURIComponent(cat[1]) }, '*'); return; }
          if (/\\/carrinho/.test(href)) return;
          parent.postMessage({ mbNav: 'home' }, '*');
        });
      <\/script>`
    : `<style>*{cursor:default!important}</style>`;
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" rel="stylesheet" />
    <style>.material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400;vertical-align:middle}body{font-family:Inter,sans-serif}:root{--brand:${brand}}</style>
    ${navScript}
    </head><body>${body}</body></html>`;
}

function pageBody(templateId: string, page: { type: "home" | "product" | "category"; id?: string; value?: string }): string {
  const template = getTemplate(templateId);
  const view = sampleView(templateId);
  if (page.type === "product" && template.renderProduct) {
    const p = SAMPLE_PRODUCTS.find((x) => x.id === page.id) ?? SAMPLE_PRODUCTS[0]!;
    return template.renderProduct(view, p, {});
  }
  if (page.type === "category" && template.renderCategory) {
    return template.renderCategory(view, page.value ?? "", {});
  }
  return template.render(view, {});
}

/* --------------------------- Miniatura no card --------------------------- */

/** Monta uma miniatura (iframe à escala) do site dentro de um contentor. */
export function mountTemplateThumb(container: HTMLElement, templateId: string, fit: "width" | "cover" = "width"): void {
  const brand = getTemplate(templateId).defaultBrand ?? "#DC2626";
  const iframe = document.createElement("iframe");
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.cssText = "border:0;width:1280px;height:900px;transform-origin:top left;pointer-events:none;background:#fff";
  iframe.srcdoc = buildSrcdoc(pageBody(templateId, { type: "home" }), brand, false);
  container.innerHTML = "";
  container.appendChild(iframe);

  const fitFn = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0) return;
    const scale = fit === "cover" ? Math.max(w / 1280, h / 900) : w / 1280;
    iframe.style.transform = `scale(${scale})`;
  };
  iframe.addEventListener("load", fitFn);
  fitFn();
  if ("ResizeObserver" in window) new ResizeObserver(fitFn).observe(container);
}

/**
 * Miniatura "leve" (sem iframe): renderiza o modelo no próprio documento e
 * escala via transform. Ideal para mostrar muitas cópias (ex.: marquee).
 */
export function mountTemplateThumbLite(container: HTMLElement, templateId: string): void {
  const inner = document.createElement("div");
  inner.style.cssText = "width:1280px;transform-origin:top left;pointer-events:none";
  inner.style.setProperty("--brand", getTemplate(templateId).defaultBrand ?? "#DC2626");
  inner.innerHTML = pageBody(templateId, { type: "home" });
  container.innerHTML = "";
  container.appendChild(inner);
  const fit = () => {
    const w = container.clientWidth;
    if (w > 0) inner.style.transform = `scale(${w / 1280})`;
  };
  fit();
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(container);
}

/* ----------------------- Pré-visualização completa ----------------------- */

/** Abre um modal com a pré-visualização navegável e responsiva do modelo. */
export function openTemplatePreview(templateId: string): void {
  const template = getTemplate(templateId);
  const brand = template.defaultBrand ?? "#DC2626";
  let device: "desktop" | "mobile" = "desktop";

  const host = document.createElement("div");
  host.className = "fixed inset-0 z-[200] bg-black/60 flex flex-col animate-entrance";
  host.innerHTML = `
    <div class="shrink-0 bg-neutral-900 text-white flex items-center justify-between gap-3 px-3 sm:px-5 py-3">
      <div class="flex items-center gap-2 min-w-0">
        <span class="material-symbols-outlined">visibility</span>
        <span class="font-bold truncate">${esc(template.name)}</span>
        <span class="hidden sm:inline text-xs bg-white/15 rounded-full px-2 py-0.5">Exemplo</span>
      </div>
      <div class="inline-flex bg-white/10 rounded-full p-1 text-sm">
        <button data-dev="desktop" class="px-3 py-1 rounded-full flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">computer</span><span class="hidden sm:inline">Desktop</span></button>
        <button data-dev="mobile" class="px-3 py-1 rounded-full flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">smartphone</span><span class="hidden sm:inline">Telemóvel</span></button>
      </div>
      <button data-close class="inline-flex items-center gap-1 hover:bg-white/10 rounded-full px-3 py-1.5"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div data-stage class="flex-1 overflow-auto bg-neutral-200 flex justify-center">
      <iframe data-frame title="Pré-visualização" class="bg-white border-0"></iframe>
    </div>`;
  document.body.appendChild(host);

  const frame = host.querySelector<HTMLIFrameElement>("[data-frame]")!;
  const stage = host.querySelector<HTMLElement>("[data-stage]")!;

  function show(page: { type: "home" | "product" | "category"; id?: string; value?: string }): void {
    frame.srcdoc = buildSrcdoc(pageBody(templateId, page), brand, true);
  }

  function applyDevice(): void {
    host.querySelectorAll<HTMLElement>("[data-dev]").forEach((b) => {
      const active = b.dataset.dev === device;
      b.className = "px-3 py-1 rounded-full flex items-center gap-1 " + (active ? "bg-white text-neutral-900 font-bold" : "text-white/80");
    });
    if (device === "mobile") {
      stage.style.padding = "16px";
      frame.style.cssText = "width:390px;height:100%;max-height:100%;border-radius:28px;box-shadow:0 10px 40px rgba(0,0,0,.4);background:#fff;border:0";
    } else {
      stage.style.padding = "0";
      frame.style.cssText = "width:100%;height:100%;background:#fff;border:0";
    }
  }

  const onMsg = (e: MessageEvent) => {
    const d = e.data as { mbNav?: string; id?: string; value?: string };
    if (!d || !d.mbNav) return;
    if (d.mbNav === "product") show({ type: "product", id: d.id });
    else if (d.mbNav === "category") show({ type: "category", value: d.value });
    else show({ type: "home" });
  };
  window.addEventListener("message", onMsg);

  host.querySelectorAll<HTMLElement>("[data-dev]").forEach((b) =>
    b.addEventListener("click", () => { device = b.dataset.dev === "mobile" ? "mobile" : "desktop"; applyDevice(); }));

  const close = () => { window.removeEventListener("message", onMsg); host.remove(); };
  host.querySelector("[data-close]")!.addEventListener("click", close);

  applyDevice();
  show({ type: "home" });
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
