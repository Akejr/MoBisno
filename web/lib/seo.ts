/**
 * Aplicação de SEO no `<head>` (lado do cliente). Atualiza título, descrição,
 * canónico, robots, Open Graph, Twitter Card e JSON-LD em cada navegação.
 *
 * Para os crawlers sociais (WhatsApp/Facebook), que não executam JS, a injeção
 * acontece no servidor (`api/prerender.js`) — este módulo trata do Google
 * (que renderiza JS) e da experiência no navegador.
 */
import {
  SEO_LOCALE, platformTitle, platformDescription, platformKeywords, platformJsonLd, platformFaq, faqJsonLd,
  robotsContent,
  PLATFORM_SHARE_IMAGE, PLATFORM_SHARE_IMAGE_WIDTH, PLATFORM_SHARE_IMAGE_HEIGHT, PLATFORM_SHARE_IMAGE_TYPE,
  type SeoShipping, type SeoAddress,
} from "../../src/services/seo.js";
import { PLATFORM_APEX } from "../../src/services/domains.js";
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
  /**
   * Com `noindex`: seguir as ligações na mesma (`noindex, follow`). É o caso das
   * lojas-modelo — fora do índice, mas não becos sem saída.
   */
  follow?: boolean;
  /** Um ou mais objetos JSON-LD a injetar. */
  jsonLd?: object | object[];
}

/** O host é o da plataforma (apex ou `www.`)? */
function isPlatformFamily(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === PLATFORM_APEX || h === `www.${PLATFORM_APEX}`;
}

/**
 * Canónico de uma página da plataforma, com a origem do pedido.
 *
 * `mobisno.store` redireciona (308) para `www.mobisno.store`, e as páginas
 * declaravam o apex como canónico: cada URL que o Google via apontava para um
 * redirecionamento. Quando a página está a ser vista num host da plataforma e o
 * canónico é desse mesmo domínio, a origem passa a ser `location.origin` — a
 * que o Vercel serve de facto. Os endereços das lojas (`*.sualoja.digital`) não
 * são tocados.
 */
function platformCanonical(url: string): string {
  if (typeof location === "undefined" || !isPlatformFamily(location.hostname)) return url;
  try {
    const u = new URL(url, location.origin);
    if (!isPlatformFamily(u.hostname)) return url;
    return `${location.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
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
  const url = platformCanonical(input.canonical ?? (location.origin + location.pathname));
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
  // A mesma diretiva que o servidor escreve (`robotsContent`): antes a SPA
  // trocava-a por um `index, follow` sem `max-image-preview`.
  setMeta("name", "robots", robotsContent({ noindex: input.noindex, follow: input.follow }));
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
  // As lojas do Lumière vivem em `custom.lumiere.boutiques`. Isto lia
  // `custom.map.boutiques`, um campo que não existe na Personalização: a morada
  // de uma loja Lumière nunca chegava ao JSON-LD, e o `tsc` não o apanhava
  // porque o `web/` não é verificado no portão (`scripts/check-web.mjs` só
  // falha nos códigos que rebentam em execução).
  const boutique = custom?.lumiere?.boutiques?.find((b) => b.address || typeof b.lat === "number");
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

/**
 * Atualiza só o canónico e o `og:url` — para as páginas que mudam de endereço
 * sem mudar de vista (a barra de filtros da listagem troca de categoria com
 * `history.replaceState`).
 */
export function updateCanonical(url: string): void {
  const u = platformCanonical(url);
  setLink("canonical", u);
  setMeta("property", "og:url", u);
}

/**
 * SEO por omissão da plataforma (página inicial).
 *
 * O `FAQPage` acompanha a secção «Perguntas frequentes», que está visível na
 * página (`platformFaq()` alimenta as duas). Sem ele aqui, o servidor declarava
 * as perguntas e a SPA apagava-as ao arrancar.
 */
export function applyPlatformSeo(): void {
  applySeo({
    title: platformTitle(),
    description: platformDescription(),
    keywords: platformKeywords(),
    type: "website",
    siteName: "MôBisno",
    canonical: location.origin + "/",
    jsonLd: [...platformJsonLd(location.origin), faqJsonLd(platformFaq())],
  });
}
