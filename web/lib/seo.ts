/**
 * Aplicação de SEO no `<head>` (lado do cliente). Atualiza título, descrição,
 * canónico, robots, Open Graph, Twitter Card e JSON-LD em cada navegação.
 *
 * Para os crawlers sociais (WhatsApp/Facebook), que não executam JS, a injeção
 * acontece no servidor (`api/prerender.js`) — este módulo trata do Google
 * (que renderiza JS) e da experiência no navegador.
 */
import {
  SEO_LOCALE, platformTitle, platformDescription, platformKeywords, platformJsonLd,
  PLATFORM_SHARE_IMAGE, PLATFORM_SHARE_IMAGE_WIDTH, PLATFORM_SHARE_IMAGE_HEIGHT, PLATFORM_SHARE_IMAGE_TYPE,
  type SeoShipping, type SeoAddress,
} from "../../src/services/seo.js";
import type { StoreCustomization, ContentBlock } from "../templates/types.js";

export interface SeoInput {
  title: string;
  description: string;
  /** URL canónica absoluta. Por omissão, a URL atual sem query/hash. */
  canonical?: string;
  /** Imagem de partilha (Open Graph/Twitter). */
  image?: string | null;
  /**
   * Medidas da imagem de partilha, quando são conhecidas. Só a arte da
   * plataforma as tem: do logótipo de uma loja e da fotografia de um produto não
   * se sabem sem as descarregar, e medidas erradas fazem o WhatsApp reservar o
   * cartão para uma imagem que não existe assim.
   */
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageType?: string | null;
  /** "website" | "product" | "article" … (Open Graph). */
  type?: string;
  /** Nome do site para Open Graph (a loja, ou MôBisno). */
  siteName?: string;
  keywords?: string;
  /** Não indexar (páginas privadas: painel, login, carrinho, checkout). */
  noindex?: boolean;
  /** Um ou mais objetos JSON-LD a injetar. */
  jsonLd?: object | object[];
}

/**
 * Imagem de partilha usada quando a página não indica outra: a arte da
 * plataforma. Era o `logo-header.png`, que o WhatsApp mostrava numa miniatura.
 */
const OG_DEFAULT_IMAGE = PLATFORM_SHARE_IMAGE;

function abs(url: string): string {
  try { return new URL(url, location.origin).href; } catch { return url; }
}

function setMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Escreve a meta ou remove-a quando não há valor.
 *
 * A remoção conta: numa SPA o `<head>` sobrevive à navegação, e as medidas da
 * arte da plataforma ficariam coladas à página de loja seguinte, a descrever uma
 * imagem que já não é aquela.
 */
function setOrRemoveMeta(attr: "name" | "property", key: string, content: string | null): void {
  if (content === null) {
    document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
    return;
  }
  setMeta(attr, key, content);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Aplica todos os metadados de SEO da página atual. */
export function applySeo(input: SeoInput): void {
  const url = input.canonical ?? (location.origin + location.pathname);
  const imagemPropria = Boolean(input.image);
  const image = abs(input.image || OG_DEFAULT_IMAGE);
  // Sem imagem própria, a página está a usar a arte da plataforma — e dessa as
  // medidas são conhecidas.
  const width = input.imageWidth ?? (imagemPropria ? null : PLATFORM_SHARE_IMAGE_WIDTH);
  const height = input.imageHeight ?? (imagemPropria ? null : PLATFORM_SHARE_IMAGE_HEIGHT);
  const mime = input.imageType ?? (imagemPropria ? null : PLATFORM_SHARE_IMAGE_TYPE);
  const type = input.type ?? "website";
  const siteName = input.siteName ?? "MôBisno";

  document.title = input.title;
  setMeta("name", "description", input.description);
  if (input.keywords) setMeta("name", "keywords", input.keywords);
  setMeta("name", "robots", input.noindex ? "noindex, nofollow" : "index, follow");
  setLink("canonical", url);

  // Open Graph
  setMeta("property", "og:title", input.title);
  setMeta("property", "og:description", input.description);
  setMeta("property", "og:type", type);
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", image);
  setMeta("property", "og:image:alt", input.title);
  setOrRemoveMeta("property", "og:image:width", width === null ? null : String(width));
  setOrRemoveMeta("property", "og:image:height", height === null ? null : String(height));
  setOrRemoveMeta("property", "og:image:type", mime);
  setMeta("property", "og:site_name", siteName);
  setMeta("property", "og:locale", SEO_LOCALE);

  // Twitter
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", input.title);
  setMeta("name", "twitter:description", input.description);
  setMeta("name", "twitter:image", image);

  applyJsonLd(input.jsonLd);
}

/**
 * Converte a configuração de entregas da loja em portes para o JSON-LD.
 *
 * Só devolve um valor quando o dono configurou mesmo uma taxa — declarar portes
 * inexistentes ao Google é motivo de penalização. Em modo "por área" usa a taxa
 * mais baixa (é o "a partir de" que o comprador vê).
 */
export function shippingFromCustom(custom?: StoreCustomization | null): SeoShipping | null {
  const d = custom?.delivery;
  if (!d) return null;
  if (d.mode === "perArea") {
    const fees = Object.values(d.fees ?? {}).filter((n): n is number => Number.isFinite(n));
    return fees.length ? { cost: Math.min(...fees) } : null;
  }
  return Number.isFinite(d.flatFee) ? { cost: Number(d.flatFee) } : null;
}

/** Morada da loja para SEO local, a partir dos blocos de localização do editor. */
export function addressFromCustom(custom?: StoreCustomization | null): SeoAddress | null {
  const block = custom?.blocks?.find((b): b is Extract<ContentBlock, { type: "location" }> => b.type === "location");
  if (block && (block.address || typeof block.lat === "number")) {
    return {
      street: block.address ?? null,
      latitude: typeof block.lat === "number" ? block.lat : null,
      longitude: typeof block.lng === "number" ? block.lng : null,
    };
  }
  const boutique = custom?.map?.boutiques?.find((b) => b.address || typeof b.lat === "number");
  if (!boutique) return null;
  return {
    street: boutique.address ?? null,
    latitude: typeof boutique.lat === "number" ? boutique.lat : null,
    longitude: typeof boutique.lng === "number" ? boutique.lng : null,
  };
}

/** Injeta (substituindo) os blocos JSON-LD geridos por este módulo. */
function applyJsonLd(jsonLd?: object | object[]): void {
  document.head.querySelectorAll('script[type="application/ld+json"][data-seo]').forEach((s) => s.remove());
  if (!jsonLd) return;
  const list = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  for (const node of list) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-seo", "");
    s.textContent = JSON.stringify(node);
    document.head.appendChild(s);
  }
}

/** SEO de páginas privadas/transacionais (painel, login, carrinho, checkout). */
export function applyNoindexSeo(title: string): void {
  applySeo({ title, description: "", noindex: true });
}

/** SEO por omissão da plataforma (landing e páginas públicas do MôBisno). */
export function applyPlatformSeo(): void {
  applySeo({
    title: platformTitle(),
    description: platformDescription(),
    keywords: platformKeywords(),
    type: "website",
    siteName: "MôBisno",
    canonical: location.origin + "/",
    jsonLd: platformJsonLd(location.origin),
  });
}
