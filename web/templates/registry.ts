/**
 * Registo de Modelos de loja. Cada Modelo é plugável: tem id/nome/preview e uma
 * função render(view) que liga o desenho aos dados reais (logótipo, banners,
 * produtos disponíveis). Para já há um Modelo "default" funcional; à medida que
 * forem chegando os teus desenhos, criamos um módulo por Modelo e substituímos
 * aqui o `render`.
 */
import { esc } from "../lib/dom.js";
import { STORE_APEX } from "../lib/routing.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import { brandMarkHtml, bannersHtml, productsGridHtml, menuItemsHtml } from "./shared.js";
import { desportivoTemplate } from "./desportivo.js";
import { beautyTemplate } from "./beauty.js";
import { galeriaTemplate } from "./galeria.js";
import { lumiereTemplate } from "./lumiere.js";

/** Render genérico (usado por enquanto pelos modelos não-desportivos). */
function renderDefault(view: StoreRenderView, _custom?: StoreCustomization): string {
  const brand = brandMarkHtml(view.header.brand);
  const banners = bannersHtml(view.banners, "w-full h-48 md:h-64 object-cover rounded-xl border border-outline-variant");
  return `
  <div class="min-h-screen flex flex-col">
    <header class="bg-surface border-b border-outline-variant sticky top-0 z-40">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">${brand}<span class="text-headline-md text-on-surface truncate">${esc(view.storeName)}</span></div>
        <nav class="hidden md:flex items-center gap-6 text-on-surface-variant text-label-md">${menuItemsHtml(view.menu.items)}</nav>
      </div>
    </header>
    ${banners ? `<section class="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop mt-6 flex flex-col gap-4">${banners}</section>` : ""}
    <main class="flex-grow w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-10">
      <h2 class="text-headline-lg text-on-surface mb-6">Produtos</h2>
      ${productsGridHtml(view.products)}
    </main>
    <footer class="bg-surface-container-low border-t border-outline-variant mt-auto">
      <div class="max-w-container-max mx-auto px-margin-mobile py-8 text-center text-on-surface-variant">
        <p class="break-words">${esc((view.subdomain.split(".")[0] ?? view.subdomain) + "." + STORE_APEX)}</p>
        <p class="text-label-sm mt-1">Loja criada com MôBisno · <a href="#/" class="text-primary">criar a minha</a></p>
      </div>
    </footer>
  </div>`;
}

/** Lista de Modelos registados. (render = renderDefault até chegarem os desenhos.) */
export const TEMPLATE_REGISTRY: StoreTemplate[] = [
  desportivoTemplate,
  beautyTemplate,
  galeriaTemplate,
  lumiereTemplate,
  { id: "boutique-elegante", name: "Boutique Elegante", previewUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&q=70", render: renderDefault },
  { id: "tech-dinamico", name: "Tech Dinâmico", previewUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=70", render: renderDefault },
  { id: "sabor-artesanal", name: "Sabor Artesanal", previewUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=70", render: renderDefault },
];

/** Devolve o Modelo pelo id (ou o primeiro como fallback). */
export function getTemplate(id: string): StoreTemplate {
  return TEMPLATE_REGISTRY.find((t) => t.id === id) ?? TEMPLATE_REGISTRY[0]!;
}

/** Opções de Modelo para o assistente (apenas modelos prontos para uso). */
export function templateOptions(): { id: string; name: string; previewUrl: string }[] {
  return TEMPLATE_REGISTRY.filter((t) => t.ready).map((t) => ({ id: t.id, name: t.name, previewUrl: t.previewUrl }));
}
