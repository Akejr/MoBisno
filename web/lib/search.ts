/** Pesquisa de produtos da loja (overlay), ligada ao ícone de pesquisa do cabeçalho. */
import { esc, formatKz } from "./dom.js";
import { loadStorefront } from "./storeCache.js";
import { brandOf } from "./brand.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

let mounted = false;

/** Identificador da loja a partir do hash atual (`#/loja/<id>...`). */
function currentIdentifier(): string | null {
  const m = location.hash.match(/#\/loja\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function openSearch(identifier: string): Promise<void> {
  const loaded = await loadStorefront(identifier);
  if (loaded.result.kind !== "render") return;
  const products = loaded.view.kind === "render" ? loaded.view.products : [];
  const brand = brandOf(loaded.custom, loaded.result.store.templateId);
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;

  document.getElementById("mb-search")?.remove();
  const host = document.createElement("div");
  host.id = "mb-search";
  host.className = "fixed inset-0 z-[190] bg-black/40 flex flex-col items-center animate-entrance";
  host.style.setProperty("--brand", brand);
  host.innerHTML = `
    <div class="w-full bg-white shadow-lg">
      <div class="w-full max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
        <span class="material-symbols-outlined text-[#685b5f]">search</span>
        <input data-q autofocus placeholder="Pesquisar produtos…" class="flex-1 bg-transparent outline-none text-lg text-on-surface" />
        <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
      </div>
    </div>
    <div class="w-full max-w-2xl mx-auto px-4 flex-1 overflow-y-auto" data-results></div>`;
  document.body.appendChild(host);

  const input = host.querySelector<HTMLInputElement>("[data-q]")!;
  const results = host.querySelector<HTMLElement>("[data-results]")!;

  function row(p: StoreProductView): string {
    const thumb = p.imageUrl
      ? `<img src="${esc(p.imageUrl)}" class="w-12 h-12 rounded-lg object-cover" />`
      : `<div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400">image</span></div>`;
    return `<a href="${esc(homeHref)}/produto/${encodeURIComponent(p.id)}" data-result class="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-[#f6f3f2]">
      ${thumb}
      <div class="min-w-0 flex-1"><p class="font-medium text-on-surface truncate">${esc(p.name)}</p><p class="text-sm text-on-surface-variant">${p.category ? esc(p.category) + " · " : ""}${esc(formatKz(p.price))}</p></div>
      <span class="material-symbols-outlined text-[#685b5f]">arrow_forward</span>
    </a>`;
  }

  function draw(q: string): void {
    const nq = normalize(q.trim());
    const list = nq === ""
      ? products.slice(0, 8)
      : products.filter((p) => normalize(p.name).includes(nq) || normalize(p.category ?? "").includes(nq) || normalize(p.description).includes(nq));
    results.innerHTML = list.length
      ? `<div class="bg-white rounded-xl my-3 p-2" style="box-shadow:0 10px 40px rgba(0,0,0,.08)">${list.map(row).join("")}</div>`
      : `<div class="text-center text-on-surface-variant py-16 bg-white rounded-xl my-3"><span class="material-symbols-outlined" style="font-size:40px;">search_off</span><p class="mt-2">Nenhum produto encontrado.</p></div>`;
    results.querySelectorAll("[data-result]").forEach((a) => a.addEventListener("click", close));
  }

  const close = () => host.remove();
  host.querySelector("[data-close]")!.addEventListener("click", close);
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  input.addEventListener("input", () => draw(input.value));
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
  });

  draw("");
  setTimeout(() => input.focus(), 50);
}

/** Liga o ícone de pesquisa do cabeçalho ([data-search-btn]). */
export function mountSearchUI(): void {
  if (mounted) return;
  mounted = true;
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-search-btn]");
    if (!btn) return;
    e.preventDefault();
    if (location.hash.startsWith("#/personalizar")) return; // no editor, só preview
    const identifier = currentIdentifier();
    if (identifier) void openSearch(identifier);
  });
}
