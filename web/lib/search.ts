/**
 * Pesquisa de produtos da loja — abre um campo de escrita DENTRO do próprio
 * cabeçalho (consistente com a UI de cada modelo) e mostra os resultados num
 * painel logo abaixo. Ligada ao ícone de pesquisa (`[data-search-btn]`).
 */
import { esc, formatKz } from "./dom.js";
import { loadStorefront } from "./storeCache.js";
import { brandOf } from "./brand.js";
import { currentStoreIdentifier, storeSubdomain } from "./routing.js";
import { appState } from "../composition.js";
import { productSlugPath } from "./slug.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

let mounted = false;

/** Identificador da loja ativa (subdomínio, `/loja/<id>` ou estado da app). */
function currentIdentifier(): string | null {
  return currentStoreIdentifier()
    ?? storeSubdomain()
    ?? appState.storeIdentifier
    ?? null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function openSearch(identifier: string, btn: HTMLElement): Promise<void> {
  const header = btn.closest("header, nav") as HTMLElement | null;
  if (!header) return;
  // Já aberto neste cabeçalho? Foca o campo.
  const existing = header.querySelector<HTMLInputElement>("[data-mb-search-bar] [data-q]");
  if (existing) { existing.focus(); return; }

  header.style.position = header.style.position || "relative";

  // Campo de pesquisa que ocupa o cabeçalho (mantém o cromo do modelo).
  const bar = document.createElement("div");
  bar.setAttribute("data-mb-search-bar", "");
  bar.className = "absolute inset-0 z-[70] flex items-center gap-3 px-4 md:px-8";
  bar.style.background = "#ffffff";
  bar.innerHTML = `
    <span class="material-symbols-outlined shrink-0" style="color:var(--brand,#1c1b1b)">search</span>
    <input data-q autofocus placeholder="Pesquisar produtos…" class="flex-1 bg-transparent outline-none text-base md:text-lg" style="color:#1c1b1b" />
    <button data-close class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-black/5 transition-colors"><span class="material-symbols-outlined">close</span></button>`;
  header.appendChild(bar);

  // Painel de resultados logo abaixo do cabeçalho.
  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 z-[64]";
  backdrop.style.background = "rgba(0,0,0,.18)";
  const panel = document.createElement("div");
  panel.className = "fixed left-0 right-0 z-[65]";
  const positionPanel = (): void => { panel.style.top = `${Math.round(header.getBoundingClientRect().bottom)}px`; };
  positionPanel();
  panel.innerHTML = `<div class="mx-auto max-w-2xl px-4"><div data-results class="bg-white rounded-b-2xl overflow-y-auto" style="max-height:70vh;box-shadow:0 24px 50px -20px rgba(0,0,0,.28)"></div></div>`;
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const input = bar.querySelector<HTMLInputElement>("[data-q]")!;
  const results = panel.querySelector<HTMLElement>("[data-results]")!;

  const close = (): void => {
    bar.remove(); panel.remove(); backdrop.remove();
    window.removeEventListener("scroll", positionPanel, true);
    window.removeEventListener("resize", positionPanel);
    document.removeEventListener("keydown", onKey);
  };
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }

  bar.querySelector("[data-close]")!.addEventListener("click", (e) => { e.preventDefault(); close(); });
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", positionPanel, true);
  window.addEventListener("resize", positionPanel);

  results.innerHTML = `<div class="py-10 text-center text-neutral-400"><span class="material-symbols-outlined animate-pulse">search</span></div>`;
  setTimeout(() => input.focus(), 30);

  // Carrega os produtos da loja (cache) e liga o filtro.
  const loaded = await loadStorefront(identifier);
  if (!header.isConnected || !bar.isConnected) return; // fechou entretanto
  if (loaded.result.kind !== "render") { close(); return; }
  const products = loaded.view.kind === "render" ? loaded.view.products : [];
  const brand = brandOf(loaded.custom, loaded.result.store.templateId);
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;
  bar.style.setProperty("--brand", brand);

  function row(p: StoreProductView): string {
    const thumb = p.imageUrl
      ? `<img src="${esc(p.imageUrl)}" class="w-12 h-12 rounded-lg object-cover" />`
      : `<div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400">image</span></div>`;
    return `<a href="${esc(homeHref)}/produto/${productSlugPath(p)}" data-result class="flex items-center gap-3 py-3 px-3 hover:bg-[#f6f3f2] transition-colors">
      ${thumb}
      <div class="min-w-0 flex-1"><p class="font-medium text-neutral-900 truncate">${esc(p.name)}</p><p class="text-sm text-neutral-500">${p.category ? esc(p.category) + " · " : ""}${esc(formatKz(p.price))}</p></div>
      <span class="material-symbols-outlined text-neutral-400">arrow_forward</span>
    </a>`;
  }

  function draw(q: string): void {
    const nq = normalize(q.trim());
    const list = nq === ""
      ? products.slice(0, 8)
      : products.filter((p) => normalize(p.name).includes(nq) || normalize(p.category ?? "").includes(nq) || normalize(p.description).includes(nq));
    results.innerHTML = list.length
      ? `<div class="py-1 divide-y divide-black/5">${list.map(row).join("")}</div>`
      : `<div class="text-center text-neutral-400 py-14"><span class="material-symbols-outlined" style="font-size:40px;">search_off</span><p class="mt-2">Nenhum produto encontrado.</p></div>`;
    results.querySelectorAll("[data-result]").forEach((a) => a.addEventListener("click", close));
  }

  input.addEventListener("input", () => draw(input.value));
  draw("");
}

/** Liga o ícone de pesquisa do cabeçalho ([data-search-btn]). */
export function mountSearchUI(): void {
  if (mounted) return;
  mounted = true;
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-search-btn]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (location.pathname.startsWith("/personalizar")) return; // no editor, só preview
    const identifier = currentIdentifier();
    if (identifier) void openSearch(identifier, btn);
  }, true);
}
