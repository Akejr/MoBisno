/**
 * Aplicação de SEO no `<head>` (lado do cliente). Atualiza título, descrição,
 * canónico, robots, Open Graph, Twitter Card e JSON-LD em cada navegação.
 *
 * Para os crawlers sociais (WhatsApp/Facebook), que não executam JS, a injeção
 * acontece no servidor (`api/prerender.js`) — este módulo trata do Google
 * (que renderiza JS) e da experiência no navegador.
 */
import { SEO_LOCALE, platformTitle, platformDescription, platformKeywords, platformJsonLd } from "../../src/services/seo.js";

export interface SeoInput {
  title: string;
  description: string;
  /** URL canónica absoluta. Por omissão, a URL atual sem query/hash. */
  canonical?: string;
  /** Imagem de partilha (Open Graph/Twitter). */
  image?: string | null;
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

const OG_DEFAULT_IMAGE = "/logo-header.png";

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
  const image = abs(input.image || OG_DEFAULT_IMAGE);
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
  setMeta("property", "og:site_name", siteName);
  setMeta("property", "og:locale", SEO_LOCALE);

  // Twitter
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", input.title);
  setMeta("name", "twitter:description", input.description);
  setMeta("name", "twitter:image", image);

  applyJsonLd(input.jsonLd);
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
