/**
 * Blocos de conteúdo editáveis das lojas (secções adicionais abaixo dos
 * produtos). Renderização partilhada por todos os modelos, com hooks
 * `data-edit-block` / `data-edit` para o editor.
 */
import { esc } from "../lib/dom.js";
import { resolveLocations, mapEmbedSrc, type StorePlace } from "../../src/services/locations.js";
import type { ContentBlock, StoreCustomization } from "./types.js";

export const DEFAULT_INFO_IMG = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1000";

/** Morada apresentada quando nem a localização nem o rodapé têm morada. */
const DEFAULT_LOCATION_ADDRESS = "Luanda, Angola";

/** Estilo de cor de fundo de uma secção (vazio = fundo padrão/transparente). */
function bgStyle(bg?: string): string {
  return bg && bg.trim() ? ` style="background:${esc(bg)}"` : "";
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
  /**
   * Morada do rodapé da loja (`footer.location`). Último recurso do bloco de
   * mapa quando nem `places` nem `address`/`lat`/`lng` estão preenchidos (R5.8).
   * `blocksHtml` preenche-a a partir da Personalização, pelo que nenhum modelo
   * precisa de a passar.
   */
  footerLocation?: string;
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
    return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="sobreposto" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
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
    return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="cartao" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
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
  return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="lado" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
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
    return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="destaque" class="relative py-14 md:py-20"${bgStyle(b.bg)}>
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
    return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="linha" class="relative py-14 md:py-20"${bgStyle(b.bg)}>
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
  return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="centrado" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
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

/** Morada a apresentar numa localização (a sua, ou a predefinida). */
function placeAddress(p: StorePlace): string {
  return (p.address ?? "").trim() || DEFAULT_LOCATION_ADDRESS;
}

/**
 * `iframe` do mapa de uma localização. O `src` vem sempre de `mapEmbedSrc`
 * (decisão D4: uma só função de mapa em toda a Plataforma), pelo que o HTML
 * pré-renderizado já traz o mapa — não há JavaScript a carregá-lo (R5.10).
 */
function placeMap(p: StorePlace, ctx: BlockCtx, extra: string): string {
  const label = (p.name ?? "").trim() || placeAddress(p);
  return `<iframe title="Mapa ${esc(label)}" class="w-full border-0" style="${extra}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapEmbedSrc(p, ctx.footerLocation))}"></iframe>`;
}

/**
 * Nome da localização, editável (`MODELO-GUIA.md` §6.1). Só é emitido quando
 * existe: um nó vazio não seria clicável no editor e acrescentaria espaço em
 * branco às lojas gravadas no formato de localização única, que nunca teve nome.
 */
function placeName(p: StorePlace, i: number, j: number, cls: string): string {
  const name = (p.name ?? "").trim();
  return name ? `<p data-edit="blocks.${i}.places.${j}.name" class="${cls}">${esc(name)}</p>` : "";
}

/** Morada da localização, editável (`MODELO-GUIA.md` §6.1). */
function placeAddressHtml(p: StorePlace, i: number, j: number): string {
  return `<span data-edit-loc-address data-edit="blocks.${i}.places.${j}.address">${esc(placeAddress(p))}</span>`;
}

/** Linha "ícone + morada" usada nos cabeçalhos e nas legendas dos mapas. */
function placeAddressLine(p: StorePlace, i: number, j: number, ctx: BlockCtx, cls: string): string {
  return `<p class="${cls}"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> ${placeAddressHtml(p, i, j)}</p>`;
}

function locationBlockSection(variant: string, i: number, inner: string, ctx: BlockCtx): string {
  return `<section data-edit-block="${i}" data-block-type="location" data-block-variant="${variant}" class="relative py-12 md:py-16">
    <div class="${ctx.container}">${inner}</div>
  </section>`;
}

/** Cabeçalho centrado com o título da secção (usado quando há vários mapas). */
function locationHeading(title: string, i: number): string {
  return `<div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
      </div>`;
}

/** Grelha dos mapas: uma coluna a 360 px, duas a partir de `md` (sem scroll horizontal). */
function locationGrid(i: number, cards: string, cols = " md:grid-cols-2"): string {
  return `<div data-edit-places="${i}" class="grid grid-cols-1${cols} gap-6 md:gap-8">${cards}</div>`;
}

/** Mapa "estilizado" (cinza + tinta da marca + selo), reutilizado nas duas formas. */
function stylizedMap(p: StorePlace, ctx: BlockCtx, height: string): string {
  return `<div class="relative rounded-3xl overflow-hidden border border-gray-100 shadow-md">
          <div style="filter:grayscale(1) contrast(1.05) brightness(1.02)">${placeMap(p, ctx, `height:${height}`)}</div>
          <div class="pointer-events-none absolute inset-0" style="background:${ctx.brand};mix-blend-mode:multiply;opacity:.28"></div>
          <div class="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5 rounded-3xl"></div>
          <div class="pointer-events-none absolute top-4 left-4 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full shadow text-sm font-semibold text-gray-800">
            <span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">pin_drop</span> Estamos aqui
          </div>
        </div>`;
}

/**
 * Renderiza o bloco "localização" numa variante específica.
 *
 * As localizações vêm de `resolveLocations` (`src/services/locations.ts`), que
 * cobre os dois formatos gravados: `places[]` (várias localizações, R5.5) e
 * `address`/`lat`/`lng` no próprio bloco (localização única, R5.9), caindo para
 * a morada do rodapé quando nenhum está preenchido (R5.8). Devolve sempre pelo
 * menos uma entrada, pelo que uma loja com o formato antigo continua a mostrar
 * **exatamente um mapa**, com a mesma disposição de sempre.
 *
 * Cada localização leva o seu mapa, o seu nome e a sua morada, todos marcados
 * com `data-edit="blocks.<i>.places.<j>.…"` (R5.11, `MODELO-GUIA.md` §6.1).
 */
export function locationByVariant(variant: "classico" | "cartao" | "estilizado", b: Extract<ContentBlock, { type: "location" }>, i: number, ctx: BlockCtx): string {
  const places = resolveLocations(b, ctx.footerLocation);
  const title = esc(b.title ?? "");
  const single = places.length === 1;
  const first = places[0] as StorePlace;

  if (variant === "cartao") {
    // Um cartão por localização: coluna de texto à esquerda, mapa à direita.
    const card = (p: StorePlace, j: number, withTitle: boolean): string =>
      `<div data-edit-place="${j}" class="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
          <div class="md:col-span-1 p-8 md:p-10 flex flex-col justify-center bg-white">
            <span class="material-symbols-outlined" style="font-size:32px;color:${ctx.brand}">location_on</span>
            ${withTitle ? `<h2 data-edit="blocks.${i}.title" class="mt-3 text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>` : ""}
            ${placeName(p, i, j, "mt-3 text-xl font-black tracking-tight text-gray-900")}
            <p class="mt-3 text-gray-500 leading-relaxed">${placeAddressHtml(p, i, j)}</p>
          </div>
          <div class="md:col-span-2 min-h-[300px]">${placeMap(p, ctx, "height:100%;min-height:300px")}</div>
        </div>`;
    if (single) return locationBlockSection("cartao", i, card(first, 0, true), ctx);
    const cards = places.map((p, j) => card(p, j, false)).join("");
    return locationBlockSection("cartao", i, `${locationHeading(title, i)}${locationGrid(i, cards, "")}`, ctx);
  }

  if (variant === "estilizado") {
    if (single) {
      return locationBlockSection("estilizado", i, `<div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
        ${placeName(first, i, 0, "mt-2 font-semibold text-gray-900")}
        ${placeAddressLine(first, i, 0, ctx, "mt-2 text-gray-500 inline-flex items-center gap-1.5")}
      </div>
      <div data-edit-place="0">${stylizedMap(first, ctx, "420px")}</div>`, ctx);
    }
    const cards = places.map((p, j) => `<div data-edit-place="${j}" class="flex flex-col">
        ${stylizedMap(p, ctx, "320px")}
        <div class="mt-4 text-center">
          ${placeName(p, i, j, "font-semibold text-gray-900")}
          ${placeAddressLine(p, i, j, ctx, "mt-1 text-gray-500 text-sm inline-flex items-center gap-1.5")}
        </div>
      </div>`).join("");
    return locationBlockSection("estilizado", i, `${locationHeading(title, i)}${locationGrid(i, cards)}`, ctx);
  }

  // "classico" (omissão).
  if (single) {
    return locationBlockSection("classico", i, `<div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900">${title}</h2>
        ${placeName(first, i, 0, "mt-2 font-semibold text-gray-900")}
        ${placeAddressLine(first, i, 0, ctx, "mt-2 text-gray-500 inline-flex items-center gap-1.5")}
      </div>
      <div data-edit-place="0" class="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">${placeMap(first, ctx, "height:400px")}</div>`, ctx);
  }
  const cards = places.map((p, j) => `<div data-edit-place="${j}" class="flex flex-col">
        <div class="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">${placeMap(p, ctx, "height:300px")}</div>
        <div class="mt-4 text-center">
          ${placeName(p, i, j, "font-semibold text-gray-900")}
          ${placeAddressLine(p, i, j, ctx, "mt-1 text-gray-500 text-sm inline-flex items-center gap-1.5")}
        </div>
      </div>`).join("");
  return locationBlockSection("classico", i, `${locationHeading(title, i)}${locationGrid(i, cards)}`, ctx);
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
  // A morada do rodapé é o último recurso do bloco de mapa (R5.8). É injetada
  // aqui para nenhum modelo ter de a passar no seu `BlockCtx`.
  const footer = typeof custom?.footer?.location === "string" ? custom.footer.location : undefined;
  const full: BlockCtx = ctx.footerLocation === undefined && footer !== undefined ? { ...ctx, footerLocation: footer } : ctx;
  return `<div data-edit-blocks>${blocks.map((b, i) => blockHtml(b, i, full)).join("")}</div>`;
}
