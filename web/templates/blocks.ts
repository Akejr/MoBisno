/**
 * Blocos de conteúdo editáveis das lojas (secções adicionais abaixo dos
 * produtos). Renderização partilhada por todos os modelos, com hooks
 * `data-edit-block` / `data-edit` para o editor.
 */
import { esc } from "../lib/dom.js";
import type { ContentBlock, StoreCustomization } from "./types.js";

export const DEFAULT_INFO_IMG = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1000";

/** Verdadeiro se a cor (hex) é escura (luminância < 0.5) — para texto claro. */
export function isDarkColor(hex?: string): boolean {
  if (!hex) return false;
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Estilo + atributo de fundo de secção (opcional). */
function secBg(b: { bg?: string }): { style: string; dark: string } {
  if (!b.bg) return { style: "", dark: "" };
  return { style: ` style="background:${esc(b.bg)}"`, dark: isDarkColor(b.bg) ? " data-sec-dark" : "" };
}

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
  const sb = secBg(b);
  return `<section data-edit-block="${i}" data-block-type="info"${sb.style}${sb.dark} class="relative ${ctx.container} py-12 md:py-16">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
      ${left ? img + txt : txt + img}
    </div>
  </section>`;
}

function textBlock(b: Extract<ContentBlock, { type: "text" }>, i: number, ctx: BlockCtx): string {
  const sb = secBg(b);
  return `<section data-edit-block="${i}" data-block-type="text"${sb.style}${sb.dark} class="relative ${ctx.container} py-12 md:py-16">
    <div class="max-w-3xl mx-auto text-center">
      <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-4xl font-black tracking-tight text-gray-900">${esc(b.title ?? "")}</h2>
      <p data-edit="blocks.${i}.text" class="mt-4 text-gray-500 text-lg leading-relaxed whitespace-pre-line">${esc(b.text ?? "")}</p>
    </div>
  </section>`;
}

/** Tipo de avatar usado nos testemunhos. */
type TestiItem = { name?: string; role?: string; text?: string; avatarUrl?: string; avatarText?: string };

export const TESTIMONIAL_VARIANTS: { id: "cards" | "editorial" | "marquee" | "destaque"; label: string }[] = [
  { id: "cards", label: "Cartões" },
  { id: "editorial", label: "Editorial" },
  { id: "marquee", label: "Carrossel" },
  { id: "destaque", label: "Destaque" },
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
  variant: "cards" | "editorial" | "marquee" | "destaque",
  b: Extract<ContentBlock, { type: "testimonials" }>,
  i: number,
  ctx: BlockCtx,
): string {
  if (variant === "editorial") return testimonialsGaleria(b, i, ctx);
  if (variant === "marquee") return testimonialsMarquee(b, i, ctx);
  if (variant === "destaque") return testimonialsDestaque(b, i, ctx);
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
  const sb = secBg(b);
  return `<section data-edit-block="${i}" data-block-type="testimonials"${sb.style}${sb.dark} class="relative ${b.bg ? "" : "bg-gray-50 border-y border-gray-100"}">
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
  const sb = secBg(b);
  return `<section data-edit-block="${i}" data-block-type="location"${sb.style}${sb.dark} class="relative ${ctx.container} py-12 md:py-16">
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
  const sb = secBg(b);
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
  return `<section data-edit-block="${i}" data-block-type="testimonials"${sb.style}${sb.dark} class="relative ${ctx.container} py-16 md:py-24">
    <h2 data-edit="blocks.${i}.title" class="text-3xl md:text-5xl font-black tracking-tight text-gray-900 max-w-2xl">${esc(b.title ?? "")}</h2>
    <div data-edit-testimonials="${i}" class="grid grid-cols-1 md:grid-cols-3 gap-10 mt-12">${cards}</div>
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
  const sb = secBg(b);
  return `<section data-edit-block="${i}" data-block-type="testimonials"${sb.style}${sb.dark} class="relative overflow-hidden ${b.bg ? "" : "bg-gray-50 border-y border-gray-100"}">
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

/** Variante "Destaque" — carrossel de um testemunho centrado, com auto-rotação (CSS), ícone de aspas, avatar, fades laterais e indicadores. */
function testimonialsDestaque(b: Extract<ContentBlock, { type: "testimonials" }>, i: number, ctx: BlockCtx): string {
  const items = b.items ?? [];
  const n = items.length;
  const per = 4.5;            // segundos por testemunho
  const total = (n * per).toFixed(2);
  const v = 100 / Math.max(n, 1);
  const f1 = (v * 0.06).toFixed(3);
  const f2 = (v * 0.94).toFixed(3);
  const f3 = v.toFixed(3);
  const anim = n > 1;
  const kf = anim
    ? `@keyframes mbHl${i}{0%{opacity:0;transform:translateY(12px)}${f1}%{opacity:1;transform:translateY(0)}${f2}%{opacity:1;transform:translateY(0)}${f3}%{opacity:0;transform:translateY(-12px)}100%{opacity:0}}
       @keyframes mbHlDot${i}{0%{opacity:.35;transform:scale(1)}${f1}%{opacity:1;transform:scale(1.35)}${f2}%{opacity:1;transform:scale(1.35)}${f3}%{opacity:.35;transform:scale(1)}100%{opacity:.35}}`
    : "";

  const slides = items.map((t, j) => {
    const style = anim ? `position:absolute;inset:0;opacity:0;animation:mbHl${i} ${total}s ${(j * per).toFixed(2)}s infinite` : "";
    return `<figure data-testi-item="${j}" class="mb-hl-slide flex flex-col items-center justify-center text-center px-6" style="${style}">
      <span class="material-symbols-outlined" style="font-size:42px;color:${ctx.brand}">format_quote</span>
      <p data-edit="blocks.${i}.items.${j}.text" class="mt-3 text-xl md:text-2xl font-semibold leading-relaxed text-gray-900 max-w-xl">${esc(t.text ?? "")}</p>
      <div class="mt-7">${testiAvatar(t, i, j, ctx, "w-14 h-14")}</div>
      <p data-edit="blocks.${i}.items.${j}.name" class="mt-3 text-base font-semibold text-gray-900">${esc(t.name ?? "")}</p>
      <p data-edit="blocks.${i}.items.${j}.role" class="text-sm text-gray-400">${esc(t.role ?? "")}</p>
    </figure>`;
  }).join("");

  const dots = anim
    ? `<div class="flex items-center justify-center gap-2 mt-6">${items.map((_, j) =>
        `<span style="width:8px;height:8px;border-radius:9999px;background:${ctx.brand};opacity:.35;animation:mbHlDot${i} ${total}s ${(j * per).toFixed(2)}s infinite"></span>`).join("")}</div>`
    : "";

  return `<section data-edit-block="${i}" data-block-type="testimonials" data-block-variant="destaque"${secBg(b).style}${secBg(b).dark} class="relative ${ctx.container} py-16 md:py-24">
    <style>${kf}</style>
    <div class="text-center mb-10">
      <h2 data-edit="blocks.${i}.title" class="text-3xl md:text-4xl font-black tracking-tight text-gray-900">${esc(b.title ?? "")}</h2>
    </div>
    <div class="relative mx-auto max-w-2xl">
      <div class="mb-hl-stage relative" data-edit-testimonials="${i}" style="min-height:300px">${slides || `<p class="text-center text-gray-400 py-10">Sem testemunhos.</p>`}</div>
      ${dots}
      <div class="pointer-events-none absolute inset-y-0 left-0 w-2/12 bg-gradient-to-r from-white"></div>
      <div class="pointer-events-none absolute inset-y-0 right-0 w-2/12 bg-gradient-to-l from-white"></div>
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
  const style = `<style>
    [data-sec-dark]{color:#e5e7eb}
    [data-sec-dark] h1,[data-sec-dark] h2,[data-sec-dark] h3,[data-sec-dark] h4{color:#fff !important}
    [data-sec-dark] p,[data-sec-dark] .text-gray-900,[data-sec-dark] .text-gray-700,[data-sec-dark] .text-gray-600,[data-sec-dark] .text-gray-500,[data-sec-dark] .text-gray-400,[data-sec-dark] .text-neutral-900,[data-sec-dark] .text-neutral-700,[data-sec-dark] .text-neutral-600,[data-sec-dark] .text-neutral-500,[data-sec-dark] .text-\\[\\#524345\\],[data-sec-dark] .text-\\[\\#685b5f\\]{color:#d1d5db !important}
  </style>`;
  return `${style}<div data-edit-blocks>${blocks.map((b, i) => blockHtml(b, i, ctx)).join("")}</div>`;
}
