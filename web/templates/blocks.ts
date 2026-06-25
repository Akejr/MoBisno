/**
 * Blocos de conteúdo editáveis das lojas (secções adicionais abaixo dos
 * produtos). Renderização partilhada por todos os modelos, com hooks
 * `data-edit-block` / `data-edit` para o editor.
 */
import { esc } from "../lib/dom.js";
import type { ContentBlock, StoreCustomization } from "./types.js";

export const DEFAULT_INFO_IMG = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1000";

/** Cria um bloco novo com conteúdo por omissão, pelo tipo. */
export function newBlock(type: ContentBlock["type"]): ContentBlock {
  switch (type) {
    case "info":
      return { type: "info", title: "O nosso compromisso", text: "Conte aqui a sua história, os seus valores ou o que torna a sua loja especial.", imageUrl: DEFAULT_INFO_IMG, imageSide: "left" };
    case "text":
      return { type: "text", title: "Um título de destaque", text: "Adicione aqui um texto informativo para os seus clientes." };
    case "testimonials":
      return {
        type: "testimonials",
        title: "O que dizem os nossos clientes",
        items: [
          { name: "Ana Sofia", role: "Cliente", text: "Excelente atendimento e entrega rápida. Recomendo!" },
          { name: "João Pedro", role: "Cliente", text: "Produtos de qualidade e tudo muito simples de comprar." },
          { name: "Maria L.", role: "Cliente", text: "Adorei a experiência. Voltarei a comprar com certeza." },
        ],
      };
    case "location":
      return { type: "location", title: "Onde estamos", address: "Luanda, Angola" };
  }
}

export interface BlockCtx {
  /** Classe do contentor (largura) do modelo. */
  container: string;
  /** Cor de destaque (ex.: "var(--brand,#4f46e5)"). */
  brand: string;
  /** Variante visual (ex.: "galeria" para um estilo de testemunhos próprio). */
  variant?: "default" | "galeria";
}

function infoBlock(b: Extract<ContentBlock, { type: "info" }>, i: number, ctx: BlockCtx): string {
  const img = `<div data-edit-block-image="${i}" class="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100">
    <img src="${esc(b.imageUrl || DEFAULT_INFO_IMG)}" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/800x600/eef2ff/64748b?text=Imagem'" />
  </div>`;
  const txt = `<div>
    <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${esc(b.title ?? "")}</h2>
    <p data-edit="blocks.${i}.text" class="mt-4 text-gray-500 text-lg leading-relaxed">${esc(b.text ?? "")}</p>
  </div>`;
  const left = b.imageSide !== "right";
  return `<section data-edit-block="${i}" data-block-type="info" class="relative ${ctx.container} py-12 md:py-16">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
      ${left ? img + txt : txt + img}
    </div>
  </section>`;
}

function textBlock(b: Extract<ContentBlock, { type: "text" }>, i: number, ctx: BlockCtx): string {
  return `<section data-edit-block="${i}" data-block-type="text" class="relative ${ctx.container} py-12 md:py-16">
    <div class="max-w-3xl mx-auto text-center">
      <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-4xl font-black tracking-tight text-gray-900">${esc(b.title ?? "")}</h2>
      <p data-edit="blocks.${i}.text" class="mt-4 text-gray-500 text-lg leading-relaxed whitespace-pre-line">${esc(b.text ?? "")}</p>
    </div>
  </section>`;
}

function testimonialsBlock(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  if (ctx.variant === "galeria") return testimonialsGaleria(b, i, ctx);
  const items = b.items ?? [];
  const cards = items.map((t, j) => {
    const initial = (t.name ?? "?").trim().charAt(0).toUpperCase() || "?";
    return `<div data-testi-item="${j}" class="relative bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <span class="material-symbols-outlined text-[28px]" style="color:${ctx.brand}">format_quote</span>
      <p data-edit="blocks.${i}.items.${j}.text" class="mt-2 text-gray-600 leading-relaxed">${esc(t.text ?? "")}</p>
      <div class="mt-5 flex items-center gap-3">
        <span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ctx.brand}">${esc(initial)}</span>
        <div>
          <p data-edit="blocks.${i}.items.${j}.name" class="font-semibold text-gray-900 text-sm">${esc(t.name ?? "")}</p>
          <p data-edit="blocks.${i}.items.${j}.role" class="text-gray-400 text-xs">${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  }).join("");
  return `<section data-edit-block="${i}" data-block-type="testimonials" class="relative bg-gray-50 border-y border-gray-100">
    <div class="${ctx.container} py-14 md:py-20">
      <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 text-center">${esc(b.title ?? "")}</h2>
      <div data-edit-testimonials="${i}" class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">${cards}</div>
    </div>
  </section>`;
}

function locationBlock(b: Extract<ContentBlock, { type: "location" }>, i: number, ctx: BlockCtx): string {
  const address = (b.address ?? "").trim() || "Luanda, Angola";
  let src: string;
  if (typeof b.lat === "number" && typeof b.lng === "number") {
    const d = 0.008;
    const bbox = `${b.lng - d},${b.lat - d},${b.lng + d},${b.lat + d}`;
    src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${b.lat},${b.lng}`;
  } else {
    src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  }
  return `<section data-edit-block="${i}" data-block-type="location" class="relative ${ctx.container} py-12 md:py-16">
    <div class="text-center max-w-2xl mx-auto mb-8">
      <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${esc(b.title ?? "")}</h2>
      <p class="mt-2 text-gray-500 inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> <span data-edit-loc-address data-edit="blocks.${i}.address">${esc(address)}</span></p>
    </div>
    <div class="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
      <iframe title="Mapa" class="w-full h-[320px] md:h-[400px] border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(src)}"></iframe>
    </div>
  </section>`;
}

/** Variante de testemunhos para o modelo Galeria (editorial, minimalista). */
function testimonialsGaleria(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  const items = b.items ?? [];
  const cards = items.map((t, j) => {
    const initial = (t.name ?? "?").trim().charAt(0).toUpperCase() || "?";
    return `<div data-testi-item="${j}" class="relative pt-6" style="border-top:2px solid ${ctx.brand}">
      <p data-edit="blocks.${i}.items.${j}.text" class="text-lg md:text-xl font-medium leading-relaxed tracking-tight text-gray-900">${esc(t.text ?? "")}</p>
      <div class="mt-6 flex items-center gap-3">
        <span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ctx.brand}">${esc(initial)}</span>
        <div class="leading-tight">
          <p data-edit="blocks.${i}.items.${j}.name" class="text-sm font-semibold text-gray-900">${esc(t.name ?? "")}</p>
          <p data-edit="blocks.${i}.items.${j}.role" class="text-[11px] uppercase tracking-widest text-gray-400 mt-0.5">${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  }).join("");
  return `<section data-edit-block="${i}" data-block-type="testimonials" class="relative ${ctx.container} py-16 md:py-24">
    <h2 data-edit="blocks.${i}.title" class="text-3xl md:text-5xl font-black tracking-tight text-gray-900 max-w-2xl">${esc(b.title ?? "")}</h2>
    <div data-edit-testimonials="${i}" class="grid grid-cols-1 md:grid-cols-3 gap-10 mt-12">${cards}</div>
  </section>`;
}

function blockHtml(b: ContentBlock, i: number, ctx: BlockCtx): string {
  switch (b.type) {
    case "info": return infoBlock(b, i, ctx);
    case "text": return textBlock(b, i, ctx);
    case "testimonials": return testimonialsBlock(b, i, ctx);
    case "location": return locationBlock(b, i, ctx);
    default: return "";
  }
}

/** Região de blocos (sempre presente, para o editor ancorar o botão "Adicionar"). */
export function blocksHtml(custom: StoreCustomization | undefined, ctx: BlockCtx): string {
  const blocks = custom?.blocks ?? [];
  return `<div data-edit-blocks>${blocks.map((b, i) => blockHtml(b, i, ctx)).join("")}</div>`;
}
