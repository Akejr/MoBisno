/**
 * Galeria de fotos do produto — partilhada por todos os modelos.
 *
 * As fotos extra são guardadas na personalização (`custom.productImages[id]`),
 * sem alterar a base de dados. Quando há mais do que uma foto, a galeria usa um
 * mecanismo 100% CSS (radios + labels) para trocar a imagem principal ao clicar
 * nas miniaturas — funciona tanto na loja publicada (SPA) como no HTML
 * pré-renderizado (sem JavaScript), mantendo a consistência de UI.
 */
import { esc } from "../lib/dom.js";
import type { StoreCustomization, StoreProductView } from "./types.js";

/** Lista de fotos do produto: foto principal + extras (sem duplicados/vazios). */
export function productImages(product: StoreProductView, custom?: StoreCustomization): string[] {
  const extra = custom?.productImages?.[product.id] ?? [];
  const all = [product.imageUrl ?? "", ...extra].map((u) => (u ?? "").trim()).filter(Boolean);
  return [...new Set(all)];
}

/** Id CSS estável e seguro a partir do id do produto. */
function galleryUid(productId: string): string {
  return "g" + productId.replace(/[^a-zA-Z0-9]/g, "");
}

export interface GalleryOpts {
  /** Classes do "palco" (proporção/fundo/cantos/borda). */
  stageClass: string;
  /** Estilo inline do palco (ex.: fundo/cantos do modelo). */
  stageStyle?: string;
  /** Classes das imagens (ex.: object-cover + transições). */
  imgClass?: string;
  /** Cor de destaque para a miniatura ativa. */
  brand?: string;
  /** Marcador de edição (abre o formulário do produto no editor). Por omissão, sim. */
  editProduct?: boolean;
  /** Classes das miniaturas (grelha). */
  thumbsClass?: string;
}

function placeholder(): string {
  return `<div class="absolute inset-0 flex items-center justify-center" style="background:#f4f4f4"><span class="material-symbols-outlined text-5xl" style="color:#c7c7bf">image</span></div>`;
}

/**
 * Devolve o HTML da galeria (palco + miniaturas). Com 0/1 foto devolve só o
 * palco — idêntico ao comportamento anterior, sem miniaturas.
 */
export function productGalleryHtml(product: StoreProductView, custom: StoreCustomization | undefined, opts: GalleryOpts): string {
  const imgs = productImages(product, custom);
  const editAttr = opts.editProduct === false ? "" : ` data-edit-product="${esc(product.id)}"`;
  const imgCls = opts.imgClass ?? "w-full h-full object-cover";
  const style = opts.stageStyle ? ` style="${opts.stageStyle}"` : "";

  // 0 ou 1 foto — palco simples (mostra só uma imagem, como antes).
  if (imgs.length <= 1) {
    const inner = imgs[0]
      ? `<img src="${esc(imgs[0])}" alt="${esc(product.name)}" class="${imgCls}" />`
      : placeholder();
    return `<div class="relative ${opts.stageClass}"${editAttr}${style}>${inner}</div>`;
  }

  // 2+ fotos — galeria CSS (sem JS).
  const uid = galleryUid(product.id);
  const brand = opts.brand ?? "#1c1b1b";
  const radios = imgs.map((_, i) => `<input type="radio" name="${uid}" id="${uid}-${i}" class="${uid}-r"${i === 0 ? " checked" : ""} aria-hidden="true" />`).join("");
  const slides = imgs.map((src, i) =>
    `<img src="${esc(src)}" alt="${esc(product.name)}" class="${uid}-img ${uid}-img-${i} absolute inset-0 ${imgCls}" style="opacity:${i === 0 ? 1 : 0};transition:opacity .35s ease" />`).join("");
  const thumbs = imgs.map((src, i) =>
    `<label for="${uid}-${i}" class="${uid}-th ${uid}-th-${i} relative block aspect-square overflow-hidden rounded-lg cursor-pointer" style="box-shadow:inset 0 0 0 2px transparent">
      <img src="${esc(src)}" alt="" class="w-full h-full object-cover" />
    </label>`).join("");

  const activeRules = imgs.map((_, i) =>
    `#${uid}-${i}:checked~.${uid}-stage .${uid}-img-${i}{opacity:1;z-index:2}` +
    `#${uid}-${i}:checked~.${uid}-thumbs .${uid}-th-${i}{box-shadow:inset 0 0 0 2px ${brand}}`).join("");

  const css = `<style>.${uid}-r{position:absolute;width:0;height:0;opacity:0;pointer-events:none}.${uid}-img{opacity:0}${activeRules}</style>`;
  const thumbsCls = opts.thumbsClass ?? "mt-3 grid grid-cols-5 gap-2";

  return `<div${editAttr}>
    ${css}${radios}
    <div class="${uid}-stage relative ${opts.stageClass}"${style}>${slides}</div>
    <div class="${uid}-thumbs ${thumbsCls}">${thumbs}</div>
  </div>`;
}
