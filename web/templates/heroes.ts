/**
 * Heros por variantes (Fase 2 do construtor por blocos). Cada hero é
 * independente, lê o Tema/marca e mantém os hooks de edição (`data-edit`
 * hero.title/subtitle/ctaLabel, `data-edit-hero` para imagem, `data-edit-arc`
 * para a galeria em arco). Qualquer modelo pode usar qualquer hero.
 */
import { esc } from "../lib/dom.js";
import type { StoreRenderView, StoreCustomization } from "./types.js";

export type HeroVariant = "imagem" | "split" | "arco" | "mosaico";

export const HERO_VARIANTS: { id: HeroVariant; label: string }[] = [
  { id: "imagem", label: "Imagem destaque" },
  { id: "split", label: "Dividido (foto + texto)" },
  { id: "arco", label: "Galeria em arco" },
  { id: "mosaico", label: "Mosaico 3D" },
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
  <section data-edit-hero class="mb-dark text-white relative h-[440px] md:h-[560px] overflow-hidden bg-neutral-900">
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

/* -------------------------------- Mosaico 3D ------------------------------- */

/** Pseudo-aleatório determinístico (estável entre renders) a partir de uma semente. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Hero "Mosaico 3D" — adaptação CSS (sem JS) de um hero com morph por scroll.
 * As imagens entram espalhadas, passam por um círculo e assentam num arco, com
 * flip 3D no hover e o título a surgir por cima. Reutiliza os hooks de edição de
 * imagens em arco (`data-edit-arc` / `data-edit-arc-item`).
 */
function heroMosaico(view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeroCtx): string {
  const { title, subtitle, cta } = texts(view, custom);
  const imgs = arcImages(view, custom);
  const n = Math.max(imgs.length, 1);
  const CARD_W = 64, CARD_H = 90;

  const cards = imgs.map((src, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    // Espalhado (início) — determinístico.
    const sx = ((rnd(i + 1) - 0.5) * 720).toFixed(0);
    const sy = ((rnd(i + 41) - 0.5) * 420).toFixed(0);
    const srot = ((rnd(i + 7) - 0.5) * 140).toFixed(0);
    // Círculo (meio).
    const ca = (i / n) * Math.PI * 2;
    const cx = (Math.cos(ca) * 175).toFixed(0);
    const cy = (Math.sin(ca) * 175).toFixed(0);
    const crot = ((ca * 180) / Math.PI).toFixed(0);
    // Arco final (arco-íris): x espalhado, y mais alto ao centro.
    const ax = ((t - 0.5) * 560).toFixed(0);
    const ay = (120 - Math.sin(t * Math.PI) * 150).toFixed(0);
    const arot = ((t - 0.5) * 36).toFixed(0);
    const kf = `@keyframes mbMc${i}{`
      + `0%{transform:translate(${sx}px,${sy}px) rotate(${srot}deg) scale(.6);opacity:0}`
      + `12%{opacity:1}`
      + `42%{transform:translate(${cx}px,${cy}px) rotate(${crot}deg) scale(1);opacity:1}`
      + `78%,100%{transform:translate(${ax}px,${ay}px) rotate(${arot}deg) scale(1.06);opacity:1}}`;
    const card = `<div class="mb-mc-card" data-edit-arc-item="${i}" style="animation:mbMc${i} 3.4s cubic-bezier(.2,.8,.2,1) ${i * 35}ms forwards">
      <div class="mb-mc-flip">
        <div class="mb-mc-face"><img src="${esc(src)}" alt="" class="w-full h-full object-cover" draggable="false" onerror="this.onerror=null;this.src='https://placehold.co/120x170/eef2ff/64748b?text=Foto'" /></div>
        <div class="mb-mc-face mb-mc-back"><span class="material-symbols-outlined" style="color:${ctx.brand}">visibility</span></div>
      </div>
    </div>`;
    return { kf, card };
  });

  return `
  <section class="relative overflow-hidden bg-white">
    <style>
      ${cards.map((c) => c.kf).join("\n")}
      @keyframes mbMcText{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      .mb-mc-stage{position:relative;height:480px}
      @media (min-width:768px){.mb-mc-stage{height:600px}}
      .mb-mc-card{position:absolute;left:50%;top:50%;width:${CARD_W}px;height:${CARD_H}px;margin-left:-${CARD_W / 2}px;margin-top:-${CARD_H / 2}px;opacity:0;transform-style:preserve-3d;perspective:1000px;cursor:pointer}
      .mb-mc-flip{position:relative;width:100%;height:100%;transition:transform .6s cubic-bezier(.2,.8,.2,1);transform-style:preserve-3d}
      .mb-mc-card:hover .mb-mc-flip{transform:rotateY(180deg)}
      .mb-mc-face{position:absolute;inset:0;border-radius:12px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:0 12px 26px -10px rgba(0,0,0,.45);background:#e5e7eb}
      .mb-mc-back{transform:rotateY(180deg);background:#0f172a;display:flex;align-items:center;justify-content:center}
      .mb-mc-text{opacity:0;animation:mbMcText .9s ease-out forwards;animation-delay:2.9s}
    </style>
    <div class="mb-mc-stage" data-edit-arc>
      ${cards.map((c) => c.card).join("")}
      <div class="absolute inset-x-0 top-0 z-10 flex flex-col items-center text-center px-4 pt-10 md:pt-14 pointer-events-none">
        <div class="mb-mc-text max-w-2xl">
          <h1 data-edit="hero.title" class="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 leading-[1.05]">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="mt-4 text-base md:text-lg text-gray-500 max-w-xl mx-auto">${esc(subtitle)}</p>
          <a href="#produtos" class="pointer-events-auto mt-7 inline-flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-full shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
        </div>
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
  if (v === "mosaico") return heroMosaico(view, custom, ctx);
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
