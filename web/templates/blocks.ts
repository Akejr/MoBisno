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

export const INFO_VARIANTS: { id: "lado" | "sobreposto" | "cartao"; label: string }[] = [
  { id: "lado", label: "Lado a lado" },
  { id: "sobreposto", label: "Imagem de fundo" },
  { id: "cartao", label: "Cartão central" },
];

function infoBlock(b: Extract<ContentBlock, { type: "info" }>, i: number, ctx: BlockCtx): string {
  return infoByVariant(b.variant ?? "lado", b, i, ctx);
}

/** Renderiza o bloco "informação" numa variante específica. */
export function infoByVariant(variant: "lado" | "sobreposto" | "cartao", b: Extract<ContentBlock, { type: "info" }>, i: number, ctx: BlockCtx): string {
  const imgUrl = esc(b.imageUrl || DEFAULT_INFO_IMG);
  const fallback = "this.onerror=null;this.src='https://placehold.co/800x600/eef2ff/64748b?text=Imagem'";
  const title = esc(b.title ?? "");
  const text = esc(b.text ?? "");

  if (variant === "sobreposto") {
    return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="sobreposto" class="relative py-12 md:py-16">
      <div class="${ctx.container}">
        <div data-edit-block-image="${i}" class="relative rounded-3xl overflow-hidden min-h-[340px] md:min-h-[440px] flex items-end">
          <img src="${imgUrl}" alt="" class="absolute inset-0 w-full h-full object-cover" onerror="${fallback}" />
          <div class="absolute inset-0" style="background:linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.15) 60%, transparent)"></div>
          <div class="relative p-8 md:p-12 max-w-xl">
            <h2 data-edit="blocks.${i}.title" class="text-3xl md:text-4xl font-black tracking-tight text-white">${title}</h2>
            <p data-edit="blocks.${i}.text" class="mt-4 text-white/85 text-lg leading-relaxed">${text}</p>
          </div>
        </div>
      </div>
    </section>`;
  }

  if (variant === "cartao") {
    return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="cartao" class="relative py-12 md:py-16">
      <div class="${ctx.container}">
        <div class="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div data-edit-block-image="${i}" class="relative aspect-[16/9] bg-gray-100">
            <img src="${imgUrl}" alt="" class="w-full h-full object-cover" onerror="${fallback}" />
          </div>
          <div class="p-8 md:p-10 text-center">
            <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
            <p data-edit="blocks.${i}.text" class="mt-4 text-gray-500 text-lg leading-relaxed">${text}</p>
          </div>
        </div>
      </div>
    </section>`;
  }

  // "lado" (omissão): foto ao lado do texto.
  const img = `<div data-edit-block-image="${i}" class="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100">
    <img src="${imgUrl}" alt="" class="w-full h-full object-cover" onerror="${fallback}" />
  </div>`;
  const txt = `<div>
    <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
    <p data-edit="blocks.${i}.text" class="mt-4 text-gray-500 text-lg leading-relaxed">${text}</p>
  </div>`;
  const left = b.imageSide !== "right";
  return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="lado" class="relative py-12 md:py-16">
    <div class="${ctx.container}">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
        ${left ? img + txt : txt + img}
      </div>
    </div>
  </section>`;
}

export const TEXT_VARIANTS: { id: "centrado" | "destaque" | "linha"; label: string }[] = [
  { id: "centrado", label: "Centrado" },
  { id: "destaque", label: "Destaque" },
  { id: "linha", label: "Com linhas" },
];

function textBlock(b: Extract<ContentBlock, { type: "text" }>, i: number, ctx: BlockCtx): string {
  return textByVariant(b.variant ?? "centrado", b, i, ctx);
}

/** Renderiza o bloco "título e texto" numa variante específica. */
export function textByVariant(variant: "centrado" | "destaque" | "linha", b: Extract<ContentBlock, { type: "text" }>, i: number, ctx: BlockCtx): string {
  const title = esc(b.title ?? "");
  const text = esc(b.text ?? "");

  if (variant === "destaque") {
    return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="destaque" class="relative py-14 md:py-20">
      <div class="${ctx.container}">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 items-start">
          <div class="md:col-span-5 flex items-start gap-4">
            <span class="mt-2 inline-block w-1.5 h-12 rounded-full shrink-0" style="background:${ctx.brand}"></span>
            <h2 data-edit="blocks.${i}.title" class="text-3xl md:text-5xl font-black tracking-tight text-gray-900 leading-[1.05]">${title}</h2>
          </div>
          <p data-edit="blocks.${i}.text" class="md:col-span-7 text-gray-500 text-lg md:text-xl leading-relaxed whitespace-pre-line">${text}</p>
        </div>
      </div>
    </section>`;
  }

  if (variant === "linha") {
    return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="linha" class="relative py-14 md:py-20">
      <div class="${ctx.container}">
        <div class="max-w-3xl mx-auto text-center">
          <div class="flex items-center justify-center gap-4">
            <span class="h-px flex-1 max-w-[80px]" style="background:linear-gradient(90deg,transparent,#d1d5db)"></span>
            <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-4xl font-black tracking-tight text-gray-900">${title}</h2>
            <span class="h-px flex-1 max-w-[80px]" style="background:linear-gradient(90deg,#d1d5db,transparent)"></span>
          </div>
          <p data-edit="blocks.${i}.text" class="mt-5 text-gray-500 text-lg leading-relaxed whitespace-pre-line">${text}</p>
        </div>
      </div>
    </section>`;
  }

  // "centrado" (omissão).
  return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="centrado" class="relative py-12 md:py-16">
    <div class="${ctx.container}">
      <div class="max-w-3xl mx-auto text-center">
        <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-4xl font-black tracking-tight text-gray-900">${title}</h2>
        <p data-edit="blocks.${i}.text" class="mt-4 text-gray-500 text-lg leading-relaxed whitespace-pre-line">${text}</p>
      </div>
    </div>
  </section>`;
}

/** Tipo de avatar usado nos testemunhos. */
type TestiItem = { name?: string; role?: string; text?: string; avatarUrl?: string; avatarText?: string };

export const TESTIMONIAL_VARIANTS: { id: "cards" | "editorial" | "marquee"; label: string }[] = [
  { id: "cards", label: "Cartões" },
  { id: "editorial", label: "Editorial" },
  { id: "marquee", label: "Carrossel" },
];

/**
 * Avatar do testemunho: foto (avatarUrl) ou letra editável (avatarText / inicial
 * do nome). `clone` omite os hooks de edição (usado nas cópias do carrossel).
 */
function testiAvatar(t: TestiItem, i: number, j: number, ctx: BlockCtx, sizeCls = "w-10 h-10", clone = false): string {
  if (t.avatarUrl) {
    return `<span ${clone ? "" : `data-testi-avatar="${j}"`} class="relative ${sizeCls} rounded-full overflow-hidden shrink-0 bg-gray-100">
      <img src="${esc(t.avatarUrl)}" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/80x80/eee/999?text=%20'" />
    </span>`;
  }
  const letter = esc((((t.avatarText && t.avatarText.trim()) || (t.name ?? "?").trim().charAt(0) || "?").slice(0, 2)).toUpperCase());
  const edit = clone ? "" : `data-edit="blocks.${i}.items.${j}.avatarText"`;
  return `<span ${clone ? "" : `data-testi-avatar="${j}"`} class="relative ${sizeCls} rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ctx.brand}"><span ${edit}>${letter}</span></span>`;
}

function testimonialsBlock(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  // Modelo escolhido no bloco; se ausente, usa o padrão do template (galeria = editorial).
  const variant = b.variant ?? (ctx.variant === "galeria" ? "editorial" : "cards");
  return testimonialsByVariant(variant, b, i, ctx);
}

/** Renderiza os testemunhos numa variante específica (usado também nas miniaturas). */
export function testimonialsByVariant(
  variant: "cards" | "editorial" | "marquee",
  b: Extract<ContentBlock, { type: "testimonials" }>,
  i: number,
  ctx: BlockCtx,
): string {
  if (variant === "editorial") return testimonialsGaleria(b, i, ctx);
  if (variant === "marquee") return testimonialsMarquee(b, i, ctx);
  return testimonialsCards(b, i, ctx);
}

function testimonialsCards(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  const items = b.items ?? [];
  const cards = items.map((t, j) => {
    return `<div data-testi-item="${j}" class="relative bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <span class="material-symbols-outlined text-[28px]" style="color:${ctx.brand}">format_quote</span>
      <p data-edit="blocks.${i}.items.${j}.text" class="mt-2 text-gray-600 leading-relaxed">${esc(t.text ?? "")}</p>
      <div class="mt-5 flex items-center gap-3">
        ${testiAvatar(t, i, j, ctx)}
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

export const LOCATION_VARIANTS: { id: "classico" | "cartao" | "estilizado"; label: string }[] = [
  { id: "classico", label: "Clássico" },
  { id: "cartao", label: "Com cartão" },
  { id: "estilizado", label: "Estilizado" },
];

function locationBlock(b: Extract<ContentBlock, { type: "location" }>, i: number, ctx: BlockCtx): string {
  return locationByVariant(b.variant ?? "classico", b, i, ctx);
}

/** Renderiza o bloco "localização" numa variante específica. */
export function locationByVariant(variant: "classico" | "cartao" | "estilizado", b: Extract<ContentBlock, { type: "location" }>, i: number, ctx: BlockCtx): string {
  const address = (b.address ?? "").trim() || "Luanda, Angola";
  let src: string;
  if (typeof b.lat === "number" && typeof b.lng === "number") {
    const d = 0.008;
    const bbox = `${b.lng - d},${b.lat - d},${b.lng + d},${b.lat + d}`;
    src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${b.lat},${b.lng}`;
  } else {
    src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  }
  const title = esc(b.title ?? "");
  const addrLine = `<span data-edit-loc-address data-edit="blocks.${i}.address">${esc(address)}</span>`;
  const iframe = (extra: string): string =>
    `<iframe title="Mapa" class="w-full border-0" style="${extra}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(src)}"></iframe>`;

  if (variant === "cartao") {
    return `<section data-edit-block="${i}" data-block-type="location" data-block-variant="cartao" class="relative py-12 md:py-16">
      <div class="${ctx.container}">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
          <div class="md:col-span-1 p-8 md:p-10 flex flex-col justify-center bg-white">
            <span class="material-symbols-outlined" style="font-size:32px;color:${ctx.brand}">location_on</span>
            <h2 data-edit="blocks.${i}.title" class="mt-3 text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
            <p class="mt-3 text-gray-500 leading-relaxed">${addrLine}</p>
          </div>
          <div class="md:col-span-2 min-h-[300px]">${iframe("height:100%;min-height:300px")}</div>
        </div>
      </div>
    </section>`;
  }

  if (variant === "estilizado") {
    return `<section data-edit-block="${i}" data-block-type="location" data-block-variant="estilizado" class="relative py-12 md:py-16">
      <div class="${ctx.container}">
        <div class="text-center max-w-2xl mx-auto mb-8">
          <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
          <p class="mt-2 text-gray-500 inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> ${addrLine}</p>
        </div>
        <div class="relative rounded-3xl overflow-hidden border border-gray-100 shadow-md">
          <div style="filter:grayscale(1) contrast(1.05) brightness(1.02)">${iframe("height:420px")}</div>
          <div class="pointer-events-none absolute inset-0" style="background:${ctx.brand};mix-blend-mode:multiply;opacity:.28"></div>
          <div class="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5 rounded-3xl"></div>
          <div class="pointer-events-none absolute top-4 left-4 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full shadow text-sm font-semibold text-gray-800">
            <span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">pin_drop</span> Estamos aqui
          </div>
        </div>
      </div>
    </section>`;
  }

  // "classico" (omissão).
  return `<section data-edit-block="${i}" data-block-type="location" data-block-variant="classico" class="relative py-12 md:py-16">
    <div class="${ctx.container}">
      <div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
        <p class="mt-2 text-gray-500 inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> ${addrLine}</p>
      </div>
      <div class="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">${iframe("height:400px")}</div>
    </div>
  </section>`;
}

/** Variante de testemunhos para o modelo Galeria (editorial, minimalista). */
function testimonialsGaleria(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  const items = b.items ?? [];
  const cards = items.map((t, j) => {
    return `<div data-testi-item="${j}" class="relative pt-6" style="border-top:2px solid ${ctx.brand}">
      <p data-edit="blocks.${i}.items.${j}.text" class="text-lg md:text-xl font-medium leading-relaxed tracking-tight text-gray-900">${esc(t.text ?? "")}</p>
      <div class="mt-6 flex items-center gap-3">
        ${testiAvatar(t, i, j, ctx)}
        <div class="leading-tight">
          <p data-edit="blocks.${i}.items.${j}.name" class="text-sm font-semibold text-gray-900">${esc(t.name ?? "")}</p>
          <p data-edit="blocks.${i}.items.${j}.role" class="text-[11px] uppercase tracking-widest text-gray-400 mt-0.5">${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  }).join("");
  return `<section data-edit-block="${i}" data-block-type="testimonials" class="relative py-16 md:py-24">
    <div class="${ctx.container}">
      <h2 data-edit="blocks.${i}.title" class="text-3xl md:text-5xl font-black tracking-tight text-gray-900 max-w-2xl">${esc(b.title ?? "")}</h2>
      <div data-edit-testimonials="${i}" class="grid grid-cols-1 md:grid-cols-3 gap-10 mt-12">${cards}</div>
    </div>
  </section>`;
}

/** Variante "Carrossel" — faixa horizontal com scroll infinito (pausa ao passar o rato). */
function testimonialsMarquee(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  const items = b.items ?? [];
  const card = (t: TestiItem, j: number, clone: boolean): string => {
    const attrs = clone ? `aria-hidden="true"` : `data-testi-item="${j}"`;
    const te = clone ? "" : `data-edit="blocks.${i}.items.${j}.text"`;
    const ne = clone ? "" : `data-edit="blocks.${i}.items.${j}.name"`;
    const re = clone ? "" : `data-edit="blocks.${i}.items.${j}.role"`;
    return `<div ${attrs} class="mb-mq-card relative shrink-0 w-[300px] bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <span class="material-symbols-outlined text-[26px]" style="color:${ctx.brand}">format_quote</span>
      <p ${te} class="mt-1 text-gray-600 leading-relaxed text-[15px] line-clamp-5">${esc(t.text ?? "")}</p>
      <div class="mt-5 flex items-center gap-3">
        ${testiAvatar(t, i, j, ctx, "w-10 h-10", clone)}
        <div>
          <p ${ne} class="font-semibold text-gray-900 text-sm">${esc(t.name ?? "")}</p>
          <p ${re} class="text-gray-400 text-xs">${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  };
  const originals = items.map((t, j) => card(t, j, false)).join("");
  const clones = items.map((t, j) => card(t, j, true)).join("");
  return `<section data-edit-block="${i}" data-block-type="testimonials" class="relative overflow-hidden bg-gray-50 border-y border-gray-100">
    <style>
      @keyframes mbMqScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      .mb-mq-mask{position:relative;-webkit-mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
      .mb-mq-track{display:flex;gap:20px;width:max-content;padding:0 10px;animation:mbMqScroll 36s linear infinite}
      .mb-mq-mask:hover .mb-mq-track{animation-play-state:paused}
      .mb-mq-card{transition:transform .25s ease, box-shadow .25s ease}
      .mb-mq-card:hover{transform:translateY(-4px);box-shadow:0 16px 36px -16px rgba(0,0,0,.3)}
    </style>
    <div class="${ctx.container} pt-14 md:pt-20 pb-8">
      <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 text-center">${esc(b.title ?? "")}</h2>
    </div>
    <div class="mb-mq-mask pb-16 md:pb-20">
      <div data-edit-testimonials="${i}" class="mb-mq-track">${originals}${clones}</div>
    </div>
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
