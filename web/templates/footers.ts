/**
 * Rodapés por variantes — partilhados por todos os modelos. Mantêm os hooks de
 * edição: `data-edit-footer-logo`, `data-edit="footer.about/location/phone/email"`,
 * links do menu e a ligação à plataforma. Cor de marca via `var(--brand)`.
 */
import { esc } from "../lib/dom.js";
import { platformHomeUrl } from "../lib/routing.js";
import type { StoreRenderView, StoreCustomization } from "./types.js";

export type FooterVariant = "colunas" | "centrado" | "moderno";

export const FOOTER_VARIANTS: { id: FooterVariant; label: string }[] = [
  { id: "colunas", label: "Colunas" },
  { id: "centrado", label: "Centrado" },
  { id: "moderno", label: "Moderno" },
];

export interface FooterCtx { container: string; brand: string; }

function storeIdentifier(view: StoreRenderView): string { return view.subdomain.split(".")[0] ?? view.subdomain; }
function homeHref(view: StoreRenderView): string { return `#/loja/${encodeURIComponent(storeIdentifier(view))}`; }

function footerBrandHtml(view: StoreRenderView, custom: StoreCustomization | undefined, dark: boolean): string {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="text-xl font-black tracking-tight ${dark ? "text-white" : "text-gray-900"}">${esc(view.storeName)}</span>`;
}

interface FData { about: string; location: string; phone: string; email: string; menu: string[]; }
function readData(view: StoreRenderView, custom?: StoreCustomization): FData {
  return {
    about: custom?.footer?.about || "A sua loja online em Angola. Produtos selecionados e entrega rápida.",
    location: custom?.footer?.location || "Luanda, Angola",
    phone: custom?.footer?.phone || "+244 900 000 000",
    email: custom?.footer?.email || "geral@minhaloja.ao",
    menu: custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label),
  };
}

/** Renderiza o rodapé da variante escolhida. */
export function renderFooter(variant: FooterVariant | undefined, view: StoreRenderView, custom: StoreCustomization | undefined, ctx: FooterCtx): string {
  const d = readData(view, custom);
  const credit = `${esc(view.subdomain)} · Loja criada com <a href="${platformHomeUrl()}" style="color:${ctx.brand}">MôBisno</a>`;

  if (variant === "centrado") {
    return `<footer class="bg-white border-t border-gray-100 mt-auto">
      <div class="${ctx.container} py-14 text-center">
        <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom, false)}</div>
        <p data-edit="footer.about" class="mt-4 text-sm text-gray-500 max-w-md mx-auto leading-relaxed">${esc(d.about)}</p>
        <nav class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-gray-600">
          ${d.menu.map((l) => `<a href="${esc(homeHref(view))}" class="hover:text-gray-900 transition-colors">${esc(l)}</a>`).join("")}
        </nav>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-gray-500">
          <span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> <span data-edit="footer.location">${esc(d.location)}</span></span>
          <span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">call</span> <span data-edit="footer.phone">${esc(d.phone)}</span></span>
          <span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">mail</span> <span data-edit="footer.email">${esc(d.email)}</span></span>
        </div>
      </div>
      <div class="border-t border-gray-100"><div class="${ctx.container} py-5 text-xs text-gray-400 text-center">${credit}</div></div>
    </footer>`;
  }

  if (variant === "moderno") {
    return `<footer class="mt-auto bg-gray-50 border-t-4" style="border-color:${ctx.brand}">
      <div class="${ctx.container} py-14">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:items-center">
          <div class="space-y-3">
            <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom, false)}</div>
            <p data-edit="footer.about" class="text-sm text-gray-500 max-w-md leading-relaxed">${esc(d.about)}</p>
          </div>
          <div class="flex flex-col gap-2 md:items-end text-sm text-gray-600">
            <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> <span data-edit="footer.location">${esc(d.location)}</span></span>
            <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">call</span> <span data-edit="footer.phone">${esc(d.phone)}</span></span>
            <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">mail</span> <span data-edit="footer.email">${esc(d.email)}</span></span>
          </div>
        </div>
        <div class="mt-10 pt-6 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <nav class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-gray-600">
            ${d.menu.map((l) => `<a href="${esc(homeHref(view))}" class="hover:text-gray-900 transition-colors">${esc(l)}</a>`).join("")}
          </nav>
          <span class="text-xs text-gray-400">${credit}</span>
        </div>
      </div>
    </footer>`;
  }

  // "colunas" (omissão).
  return `<footer class="bg-gray-50 border-t border-gray-100 mt-auto">
    <div class="${ctx.container} py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="space-y-3">
        <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom, false)}</div>
        <p data-edit="footer.about" class="text-sm text-gray-500 max-w-xs leading-relaxed">${esc(d.about)}</p>
      </div>
      <div>
        <h3 class="text-sm font-bold text-gray-900 mb-4">Loja</h3>
        <ul class="space-y-2.5 text-sm">${d.menu.map((l) => `<li><a href="${esc(homeHref(view))}" class="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">${esc(l)}</a></li>`).join("")}</ul>
      </div>
      <div>
        <h3 class="text-sm font-bold text-gray-900 mb-4">Contacto</h3>
        <ul class="space-y-2.5 text-sm text-gray-500">
          <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(d.location)}</span></li>
          <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(d.phone)}</span></li>
          <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(d.email)}</span></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-gray-100"><div class="${ctx.container} py-5 text-xs text-gray-400 text-center">${credit}</div></div>
  </footer>`;
}
