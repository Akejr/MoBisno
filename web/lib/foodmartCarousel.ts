/**
 * Carrosséis do modelo "FoodMart" (mercearia). Sem dependências externas:
 *  - Banner principal: slides em fade com pontos + setas + autoplay.
 *  - Carrosséis horizontais (categorias, marcas, produtos): scroll com setas.
 *  - Pesquisa inline no cabeçalho (dropdown de resultados).
 *
 * Corre na loja publicada (SPA) e no preview do editor. É idempotente: pode ser
 * chamado a cada render sem duplicar temporizadores.
 */
import { esc, formatKz } from "./dom.js";
import { loadStorefront } from "./storeCache.js";
import { productSlugPath } from "./slug.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

/** Pesquisa inline do cabeçalho FoodMart (dropdown ancorado ao campo). */
export function mountFoodmartSearch(root: HTMLElement): void {
  if (location.pathname.startsWith("/personalizar")) return; // no editor, campo só visual
  const hosts = Array.from(root.querySelectorAll<HTMLElement>("[data-fm-search-host]"));
  if (!hosts.length) return;
  const cart = root.querySelector<HTMLAnchorElement>("[data-cart-link]");
  const m = cart?.getAttribute("href")?.match(/#\/loja\/([^/]+)\/carrinho/);
  const identifier = m ? decodeURIComponent(m[1]) : null;
  if (!identifier) return;
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;
  const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let products: StoreProductView[] = [];
  let loaded = false;
  const ensure = async (): Promise<void> => {
    if (loaded) return;
    try { const l = await loadStorefront(identifier); if (l.view.kind === "render") products = l.view.products; } catch { /* ignora */ }
    loaded = true;
  };

  hosts.forEach((host) => {
    const input = host.querySelector<HTMLInputElement>("[data-fm-search]");
    const results = host.querySelector<HTMLElement>("[data-fm-search-results]");
    if (!input || !results) return;
    const draw = (q: string): void => {
      const nq = norm(q.trim());
      if (!nq) { results.classList.add("hidden"); results.innerHTML = ""; return; }
      const list = products.filter((p) => norm(p.name).includes(nq) || norm(p.category ?? "").includes(nq) || norm(p.description).includes(nq)).slice(0, 8);
      results.innerHTML = list.length
        ? list.map((p) => `<a href="${esc(homeHref)}/produto/${productSlugPath(p)}" class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
            ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" class="w-11 h-11 rounded-lg object-cover" />` : `<div class="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center"><span class="material-symbols-outlined text-gray-400">grocery</span></div>`}
            <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-gray-800 truncate">${esc(p.name)}</span><span class="block text-xs text-gray-400">${p.category ? esc(p.category) + " · " : ""}${esc(formatKz(p.price))}</span></span>
          </a>`).join("")
        : `<div class="px-4 py-6 text-center text-sm text-gray-400">Nenhum produto encontrado.</div>`;
      results.classList.remove("hidden");
    };
    input.addEventListener("focus", () => { void ensure(); });
    input.addEventListener("input", async () => { await ensure(); draw(input.value); });
    input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") results.classList.add("hidden"); });
    host.querySelector("[data-fm-search-go]")?.addEventListener("click", async (e) => { e.preventDefault(); await ensure(); input.focus(); draw(input.value); });
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-fm-search-host]")) {
      hosts.forEach((h) => h.querySelector("[data-fm-search-results]")?.classList.add("hidden"));
    }
  });
}

/** Liga todos os carrosséis FoodMart dentro de `root`. */
export function mountFoodmartCarousels(root: HTMLElement): void {
  // --- Banner principal (fade + autoplay) ---
  root.querySelectorAll<HTMLElement>("[data-fm-banner]").forEach((banner) => {
    const slides = Array.from(banner.querySelectorAll<HTMLElement>("[data-fm-slide]"));
    const dots = Array.from(banner.querySelectorAll<HTMLElement>("[data-fm-dot]"));
    if (slides.length <= 1) return;
    let idx = 0;
    let timer: number | undefined;

    const show = (i: number): void => {
      idx = (i + slides.length) % slides.length;
      slides.forEach((s, k) => {
        s.style.opacity = k === idx ? "1" : "0";
        s.style.pointerEvents = k === idx ? "auto" : "none";
      });
      dots.forEach((d, k) => { d.style.opacity = k === idx ? "1" : ".45"; });
    };
    const restart = (): void => {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => show(idx + 1), 5500);
    };

    dots.forEach((d, k) => d.addEventListener("click", () => { show(k); restart(); }));
    banner.querySelector("[data-fm-prev]")?.addEventListener("click", (e) => { e.preventDefault(); show(idx - 1); restart(); });
    banner.querySelector("[data-fm-next]")?.addEventListener("click", (e) => { e.preventDefault(); show(idx + 1); restart(); });
    banner.addEventListener("mouseenter", () => { if (timer) window.clearInterval(timer); });
    banner.addEventListener("mouseleave", restart);
    show(0);
    restart();
  });

  // --- Carrosséis horizontais (setas) ---
  root.querySelectorAll<HTMLElement>("[data-fm-carousel]").forEach((c) => {
    const track = c.querySelector<HTMLElement>("[data-fm-track]");
    if (!track) return;
    const amount = (): number => Math.max(240, Math.round(track.clientWidth * 0.8));
    c.querySelector("[data-fm-cprev]")?.addEventListener("click", (e) => { e.preventDefault(); track.scrollBy({ left: -amount(), behavior: "smooth" }); });
    c.querySelector("[data-fm-cnext]")?.addEventListener("click", (e) => { e.preventDefault(); track.scrollBy({ left: amount(), behavior: "smooth" }); });
  });
}
