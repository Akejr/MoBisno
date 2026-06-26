/**
 * Heros por variantes (Fase 2 do construtor por blocos). Cada hero é
 * independente, lê o Tema/marca e mantém os hooks de edição (`data-edit`
 * hero.title/subtitle/ctaLabel, `data-edit-hero` para imagem, `data-edit-arc`
 * para a galeria em arco). Qualquer modelo pode usar qualquer hero.
 */
import { esc } from "../lib/dom.js";
import type { StoreRenderView, StoreCustomization } from "./types.js";

export type HeroVariant = "imagem" | "split" | "arco" | "particulas";

export const HERO_VARIANTS: { id: HeroVariant; label: string }[] = [
  { id: "imagem", label: "Imagem destaque" },
  { id: "split", label: "Dividido (foto + texto)" },
  { id: "arco", label: "Galeria em arco" },
  { id: "particulas", label: "Partículas (rede)" },
];

export const HERO_FALLBACK = "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1600";
const ARC_FALLBACK = [
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=400",
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400",
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=400",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?q=80&w=400",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=400",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=400",
];

export interface HeroCtx {
  /** Classe do contentor (largura) do modelo. */
  container: string;
  /** Cor de destaque (ex.: "var(--brand,#4f46e5)"). */
  brand: string;
}

function texts(view: StoreRenderView, custom?: StoreCustomization): { title: string; subtitle: string; cta: string } {
  return {
    title: custom?.hero?.title || view.storeName,
    subtitle: custom?.hero?.subtitle || "Produtos selecionados, entrega em toda Angola e checkout simples.",
    cta: custom?.hero?.ctaLabel || "Ver produtos",
  };
}

/* ------------------------------- Imagem ------------------------------- */

function heroImagem(view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeroCtx): string {
  const { title, subtitle, cta } = texts(view, custom);
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  return `
  <section data-edit-hero class="mb-dark text-white relative h-[520px] md:h-[660px] overflow-hidden bg-neutral-900">
    <img src="${esc(img)}" alt="" class="absolute inset-0 w-full h-full object-cover" />
    <div class="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-transparent"></div>
    <div class="relative h-full ${ctx.container} flex items-center">
      <div class="max-w-xl">
        <h1 data-edit="hero.title" class="text-4xl md:text-6xl font-black leading-[1.04] tracking-tight">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-5 text-base md:text-lg text-white/85 max-w-md">${esc(subtitle)}</p>
        <a href="#produtos" class="mt-8 inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
      </div>
    </div>
  </section>`;
}

/* -------------------------------- Split ------------------------------- */

function heroSplit(view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeroCtx): string {
  const { title, subtitle, cta } = texts(view, custom);
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  return `
  <section data-edit-hero class="relative overflow-hidden">
    <div class="${ctx.container} py-10 md:py-16">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
        <div>
          <h1 data-edit="hero.title" class="text-4xl md:text-6xl font-black leading-[1.04] tracking-tight text-gray-900">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="mt-5 text-lg text-gray-500 max-w-md">${esc(subtitle)}</p>
          <a href="#produtos" class="mt-8 inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
        </div>
        <div class="relative aspect-[4/5] md:aspect-square rounded-3xl overflow-hidden bg-gray-100">
          <img src="${esc(img)}" alt="" class="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  </section>`;
}

/* --------------------------------- Arco ------------------------------- */

function arcImages(view: StoreRenderView, custom?: StoreCustomization): string[] {
  const fromCustom = (custom?.heroImages ?? []).filter((u): u is string => !!u);
  if (fromCustom.length) return fromCustom.slice(0, 13);
  const fromProducts = view.products.map((p) => p.imageUrl).filter((u): u is string => !!u);
  const fromBanners = view.banners.map((b) => b.imageUrl);
  const base = [...fromProducts, ...fromBanners];
  return (base.length ? base : ARC_FALLBACK).slice(0, 13);
}

function heroArco(view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeroCtx): string {
  const { title, subtitle, cta } = texts(view, custom);
  const imgs = arcImages(view, custom);
  const startAngle = 18, endAngle = 162;
  const count = Math.max(imgs.length, 2);
  const step = (endAngle - startAngle) / (count - 1);
  const cards = imgs.map((src, i) => {
    const angle = startAngle + step * i;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad).toFixed(4);
    const sin = Math.sin(rad).toFixed(4);
    const rot = (angle / 4 - 22).toFixed(2);
    return `<div class="mb-arc-card" data-edit-arc-item="${i}" style="left:calc(50% + (${cos} * var(--arc-r)));bottom:calc(${sin} * var(--arc-r));z-index:${count - i};animation-delay:${i * 80}ms">
      <div class="mb-arc-inner" style="transform:rotate(${rot}deg)"><img src="${esc(src)}" alt="" class="block w-full h-full object-cover" draggable="false" onerror="this.onerror=null;this.src='https://placehold.co/300x300/eef2ff/64748b?text=Foto'" /></div>
    </div>`;
  }).join("");
  return `
  <section class="relative overflow-hidden bg-white">
    <style>
      @keyframes mbArcIn{from{opacity:0;transform:translate(-50%,62%)}to{opacity:1;transform:translate(-50%,50%)}}
      @keyframes mbHeroIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      .mb-arc{position:relative;width:100%;height:calc(var(--arc-r) + var(--arc-card));--arc-r:clamp(170px,40vw,440px);--arc-card:clamp(60px,10vw,112px)}
      .mb-arc-pivot{position:absolute;left:50%;bottom:0;transform:translateX(-50%)}
      .mb-arc-card{position:absolute;width:var(--arc-card);height:var(--arc-card);transform:translate(-50%,50%);opacity:0;animation:mbArcIn .8s ease-out forwards}
      .mb-arc-inner{width:100%;height:100%;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 14px 30px -12px rgba(0,0,0,.3);outline:1px solid rgba(0,0,0,.05);transition:transform .3s ease}
      .mb-arc-inner:hover{transform:scale(1.06) !important}
      .mb-hero-text{opacity:0;animation:mbHeroIn .8s ease-out forwards;animation-delay:.7s}
    </style>
    <div class="mb-arc" data-edit-arc><div class="mb-arc-pivot">${cards}</div></div>
    <div class="relative z-10 ${ctx.container} text-center -mt-28 sm:-mt-36 lg:-mt-44 pb-14">
      <div class="mb-hero-text max-w-2xl mx-auto">
        <h1 data-edit="hero.title" class="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 leading-[1.05]">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-4 text-base md:text-lg text-gray-500 max-w-xl mx-auto">${esc(subtitle)}</p>
        <a href="#produtos" class="mt-8 inline-flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-full shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
      </div>
    </div>
  </section>`;
}

/* ----------------------------- Partículas (rede) --------------------------- */

/**
 * Hero "Partículas" — fundo escuro com rede de partículas animadas (canvas) que
 * reage ao rato, com título/subtítulo/CTA por cima. A animação é inicializada
 * por `mountParticlesHeroes` (a loja corre JS após o render); sem JS mostra um
 * hero escuro limpo. Partículas na cor da marca.
 */
function heroParticulas(view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeroCtx): string {
  const { title, subtitle, cta } = texts(view, custom);
  return `
  <section class="mb-dark relative overflow-hidden bg-[#0a0a12] text-white">
    <div class="relative h-[520px] md:h-[640px]">
      <canvas data-particles-hero class="absolute inset-0 block w-full h-full"></canvas>
      <div class="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
        <h1 data-edit="hero.title" class="text-4xl md:text-7xl font-black tracking-tight leading-[1.03] bg-clip-text text-transparent" style="background-image:linear-gradient(to bottom,#ffffff,#9ca3af)">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-5 max-w-2xl text-base md:text-lg text-gray-300">${esc(subtitle)}</p>
        <a href="#produtos" class="mt-9 inline-flex items-center gap-2 font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-opacity text-white" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
      </div>
    </div>
  </section>`;
}

/** Renderiza o hero da variante escolhida (ou `fallback`). */
export function renderHero(
  variant: HeroVariant | undefined,
  view: StoreRenderView,
  custom: StoreCustomization | undefined,
  ctx: HeroCtx,
  fallback: HeroVariant = "imagem",
): string {
  const v = variant ?? fallback;
  if (v === "arco") return heroArco(view, custom, ctx);
  if (v === "split") return heroSplit(view, custom, ctx);
  if (v === "particulas") return heroParticulas(view, custom, ctx);
  return heroImagem(view, custom, ctx);
}

/** Mini pré-visualização esquemática de cada variante (para o seletor). */
export function heroPreview(variant: HeroVariant): string {
  if (variant === "arco") {
    return `<div class="w-full h-full bg-white flex flex-col items-center justify-end p-2 gap-1">
      <div class="flex gap-0.5 -mb-1">${[0,1,2,3,4].map((i)=>`<div class="w-3 h-4 rounded-sm bg-gray-300" style="transform:rotate(${(i-2)*12}deg)"></div>`).join("")}</div>
      <div class="w-10 h-1.5 rounded bg-gray-800"></div><div class="w-8 h-1 rounded bg-gray-300"></div>
    </div>`;
  }
  if (variant === "split") {
    return `<div class="w-full h-full bg-white grid grid-cols-2 gap-1 p-2 items-center">
      <div class="space-y-1"><div class="w-8 h-1.5 rounded bg-gray-800"></div><div class="w-6 h-1 rounded bg-gray-300"></div><div class="w-5 h-2 rounded bg-gray-800 mt-1"></div></div>
      <div class="h-full rounded bg-gray-300"></div>
    </div>`;
  }
  return `<div class="w-full h-full bg-gray-700 flex flex-col justify-center p-2 gap-1">
    <div class="w-10 h-1.5 rounded bg-white"></div><div class="w-7 h-1 rounded bg-white/60"></div><div class="w-6 h-2 rounded bg-white mt-1"></div>
  </div>`;
}
