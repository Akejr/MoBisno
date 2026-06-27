/**
 * SEO — geração de metadados (módulo de domínio puro e testável).
 *
 * Fonte única de verdade para títulos, descrições e dados estruturados
 * (JSON-LD) usados em:
 *  - cliente (`web/lib/seo.ts`) — aplica ao `<head>` em cada navegação;
 *  - servidor (`api/prerender.js`) — injeta no HTML para os crawlers sociais
 *    (WhatsApp/Facebook) que não executam JavaScript.
 *
 * Mercado-alvo: Angola. Locale `pt_AO`, moeda `AOA` (Kwanza).
 */

export const SEO_COUNTRY = "Angola";
export const SEO_LOCALE = "pt_AO";
export const SEO_CURRENCY = "AOA";
export const PLATFORM_NAME = "MôBisno";

/** Trunca um texto para `max` caracteres, cortando em espaço e juntando "…". */
export function truncate(text: string, max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/* --------------------------------- Loja --------------------------------- */

/** Título da loja no Google: `Nome da Loja | Compras em Angola`. */
export function storeTitle(storeName: string): string {
  return `${storeName.trim()} | Compras em Angola`;
}

/** Descrição da loja, com palavras-chave de Angola e métodos de pagamento. */
export function storeDescription(storeName: string, custom?: string | null): string {
  const base = custom && custom.trim()
    ? custom.trim()
    : `Compre online na ${storeName.trim()} em Angola. Pagamento por Multicaixa Express, Referência Bancária e WhatsApp, com entrega em Luanda. Faça a sua encomenda de forma rápida e segura.`;
  return truncate(base, 160);
}

/* -------------------------------- Produto -------------------------------- */

/** Título do produto: `Nome do Produto — Nome da Loja` (foco na loja). */
export function productTitle(productName: string, storeName: string): string {
  return `${productName.trim()} — ${storeName.trim()}`;
}

/** Descrição do produto a partir dos seus dados (gerada automaticamente). */
export function productDescription(input: {
  name: string;
  description?: string | null;
  priceLabel?: string | null;
  storeName: string;
}): string {
  const desc = (input.description ?? "").trim();
  if (desc) return truncate(desc, 160);
  const price = input.priceLabel ? ` por ${input.priceLabel}` : "";
  return truncate(
    `Compre ${input.name.trim()}${price} na ${input.storeName.trim()}. Pagamento seguro por Multicaixa Express, Referência e WhatsApp, com entrega em Luanda (Angola).`,
    160,
  );
}

/* ------------------------------ Plataforma ------------------------------ */

export function platformTitle(): string {
  return "MôBisno — Criar Loja Online em Angola | Sites e Lojas Virtuais";
}

export function platformDescription(): string {
  return truncate(
    "Crie a sua loja online em Angola em minutos com a MôBisno. Editor visual ao vivo, pagamentos Multicaixa Express e Referência, vendas por WhatsApp, domínio próprio e SEO otimizado. A forma mais fácil de vender online em Luanda e em todo o país.",
    160,
  );
}

/** Palavras-chave da plataforma (Angola). */
export function platformKeywords(): string {
  return [
    "criar loja online angola", "loja virtual angola", "criar site angola",
    "vender online angola", "e-commerce angola", "loja online luanda",
    "multicaixa express online", "pagamentos online angola", "website angola",
    "criar loja whatsapp", "MôBisno",
  ].join(", ");
}

/* -------------------------------- JSON-LD -------------------------------- */

/** Dados estruturados da plataforma: WebSite + Organization. */
export function platformJsonLd(baseUrl: string): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: PLATFORM_NAME,
      url: baseUrl,
      logo: `${baseUrl}/logo-header.png`,
      description: platformDescription(),
      areaServed: { "@type": "Country", name: SEO_COUNTRY },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: PLATFORM_NAME,
      url: baseUrl,
      inLanguage: "pt-AO",
    },
  ];
}

/** Dados estruturados de uma loja (OnlineStore). */
export function storeJsonLd(input: {
  storeName: string;
  url: string;
  logoUrl?: string | null;
  description?: string | null;
}): object {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: input.storeName,
    url: input.url,
    description: storeDescription(input.storeName, input.description),
    currenciesAccepted: SEO_CURRENCY,
    paymentAccepted: "Multicaixa Express, Referência Bancária, WhatsApp",
    areaServed: { "@type": "Country", name: SEO_COUNTRY },
  };
  if (input.logoUrl) node.image = input.logoUrl;
  return node;
}

/** Dados estruturados de um produto (Product + Offer). */
export function productJsonLd(input: {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  url: string;
  storeName: string;
  available?: boolean;
  rating?: { average: number; count: number } | null;
}): object {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: productDescription({ name: input.name, description: input.description, storeName: input.storeName }),
    brand: { "@type": "Brand", name: input.storeName },
    offers: {
      "@type": "Offer",
      price: Number(input.price).toFixed(2),
      priceCurrency: SEO_CURRENCY,
      availability: input.available === false
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      url: input.url,
    },
  };
  if (input.image) node.image = input.image;
  if (input.rating && input.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.rating.average,
      reviewCount: input.rating.count,
    };
  }
  return node;
}
