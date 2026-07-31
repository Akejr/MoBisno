/**
 * SEO — geração de metadados (módulo de domínio puro e testável).
 *
 * Fonte única de verdade para títulos, descrições e dados estruturados
 * (JSON-LD) usados em:
 *  - cliente (`web/lib/seo.ts`) — aplica ao `<head>` em cada navegação;
 *  - servidor (`api/prerender.js`) — injeta no HTML, com o conteúdo já
 *    renderizado, para os motores de busca e os crawlers sociais.
 *
 * Mercado-alvo: Angola. Locale `pt_AO`, moeda `AOA` (Kwanza).
 *
 * REGRA: nunca declarar em JSON-LD algo que a loja não oferece de facto. O
 * Google penaliza dados estruturados que não correspondem à página (política
 * de devoluções, portes, avaliações). Por isso os campos opcionais só são
 * emitidos quando há dados reais para os preencher.
 */

export const SEO_COUNTRY = "Angola";
export const SEO_LOCALE = "pt_AO";
export const SEO_LANGUAGE = "pt-AO";
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

/**
 * Corta um título para o limite prático do Google (~60 caracteres antes de
 * truncar com "…" no resultado de pesquisa). Preserva a parte antes do
 * separador, que é a mais importante.
 */
export function clampTitle(title: string, max = 60): string {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return truncate(clean, max);
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

/* ------------------------------- Categoria ------------------------------- */

/** Título de uma página de categoria: `Categoria em Nome da Loja | Angola`. */
export function categoryTitle(category: string, storeName: string): string {
  return `${category.trim()} — ${storeName.trim()} | Comprar em Angola`;
}

/**
 * Descrição ÚNICA por categoria. Evita o erro comum de repetir a descrição da
 * loja em todas as categorias (conteúdo duplicado aos olhos do Google): usa o
 * número de produtos e os nomes de alguns deles para a tornar distinta.
 */
export function categoryDescription(input: {
  category: string;
  storeName: string;
  count?: number;
  sampleNames?: readonly string[];
  priceFrom?: string | null;
}): string {
  const cat = input.category.trim();
  const store = input.storeName.trim();
  const n = input.count ?? 0;
  const quantos = n > 0 ? `${n} ${n === 1 ? "produto" : "produtos"} de ${cat}` : cat;
  const exemplos = input.sampleNames && input.sampleNames.length
    ? ` ${input.sampleNames.slice(0, 3).join(", ")} e mais.`
    : "";
  const desde = input.priceFrom ? ` Desde ${input.priceFrom}.` : "";
  return truncate(
    `${quantos} na ${store}.${desde}${exemplos} Entrega em Luanda e em Angola, com pagamento por Multicaixa Express, Referência Bancária ou WhatsApp.`,
    160,
  );
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

/** Dados estruturados da plataforma: Organization + WebSite (com pesquisa). */
export function platformJsonLd(baseUrl: string): object[] {
  const base = baseUrl.replace(/\/+$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: PLATFORM_NAME,
      url: `${base}/`,
      logo: `${base}/logo-header.png`,
      description: platformDescription(),
      areaServed: { "@type": "Country", name: SEO_COUNTRY },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: PLATFORM_NAME,
      url: `${base}/`,
      inLanguage: SEO_LANGUAGE,
      publisher: { "@id": `${base}/#organization` },
    },
  ];
}

/**
 * Trilho de navegação (`BreadcrumbList`). O Google apresenta-o por baixo do
 * título no resultado de pesquisa, em vez da URL crua.
 */
export function breadcrumbJsonLd(items: readonly { name: string; url: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Morada da loja, quando o dono a preencheu (habilita SEO local). */
export interface SeoAddress {
  street?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Dados estruturados de uma loja.
 *
 * Emite `OnlineStore` e, quando existe morada/coordenadas, acrescenta os campos
 * de negócio local (`address`/`geo`/`telephone`) — o que a torna elegível para
 * resultados locais em Angola.
 */
export function storeJsonLd(input: {
  storeName: string;
  url: string;
  logoUrl?: string | null;
  description?: string | null;
  address?: SeoAddress | null;
  telephone?: string | null;
  priceRange?: string | null;
  sameAs?: readonly string[] | null;
}): object {
  const url = input.url.replace(/\/+$/, "");
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${url}/#store`,
    name: input.storeName,
    url: `${url}/`,
    description: storeDescription(input.storeName, input.description),
    currenciesAccepted: SEO_CURRENCY,
    paymentAccepted: "Multicaixa Express, Referência Bancária, WhatsApp",
    areaServed: { "@type": "Country", name: SEO_COUNTRY },
  };
  if (input.logoUrl) {
    node.image = input.logoUrl;
    node.logo = input.logoUrl;
  }
  if (input.telephone) node.telephone = input.telephone;
  if (input.priceRange) node.priceRange = input.priceRange;
  if (input.sameAs && input.sameAs.length) node.sameAs = [...input.sameAs];

  const a = input.address;
  if (a && (a.street || a.city)) {
    node.address = {
      "@type": "PostalAddress",
      ...(a.street ? { streetAddress: a.street } : {}),
      ...(a.city ? { addressLocality: a.city } : {}),
      addressCountry: "AO",
    };
  }
  if (a && typeof a.latitude === "number" && typeof a.longitude === "number") {
    node.geo = { "@type": "GeoCoordinates", latitude: a.latitude, longitude: a.longitude };
  }
  return node;
}

/**
 * Caixa de pesquisa nos resultados do Google (sitelinks searchbox) para a loja.
 * Só faz sentido se a loja tiver mesmo uma página de resultados de pesquisa.
 */
export function storeWebsiteJsonLd(input: { storeName: string; url: string; searchPath?: string }): object {
  const url = input.url.replace(/\/+$/, "");
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name: input.storeName,
    url: `${url}/`,
    inLanguage: SEO_LANGUAGE,
  };
  if (input.searchPath) {
    node.potentialAction = {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${url}${input.searchPath}` },
      "query-input": "required name=search_term_string",
    };
  }
  return node;
}

/** Um item de listagem (grelha de produtos) para `ItemList`. */
export interface SeoListItem {
  name: string;
  url: string;
  image?: string | null;
  price?: number | null;
}

/**
 * Página de listagem (categoria ou "todos os produtos") como `CollectionPage`
 * com um `ItemList` dos produtos. Dá ao Google a estrutura da coleção em vez de
 * uma página de texto solto.
 */
export function collectionJsonLd(input: {
  name: string;
  url: string;
  description: string;
  items: readonly SeoListItem[];
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: input.url,
    description: input.description,
    inLanguage: SEO_LANGUAGE,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url,
        name: it.name,
        ...(it.image ? { image: it.image } : {}),
      })),
    },
  };
}

/** Portes de envio reais da loja (só emitidos quando configurados). */
export interface SeoShipping {
  /** Custo de entrega em Kwanzas. */
  cost: number;
  /** Dias úteis mínimos/máximos até à entrega, se conhecidos. */
  minDays?: number | null;
  maxDays?: number | null;
}

/** Política de devolução real da loja (só emitida quando configurada). */
export interface SeoReturnPolicy {
  /** Dias para devolver. `0` significa "não aceita devoluções". */
  days: number;
}

/**
 * Dados estruturados de um produto (`Product` + `Offer`).
 *
 * Campos que o Google usa para mostrar preço, disponibilidade e estrelas no
 * resultado de pesquisa. `shippingDetails` e `hasMerchantReturnPolicy` só são
 * incluídos quando a loja os tem mesmo configurados — declarar portes ou
 * devoluções inexistentes é motivo de penalização.
 */
export function productJsonLd(input: {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  url: string;
  storeName: string;
  storeUrl?: string | null;
  sku?: string | null;
  category?: string | null;
  available?: boolean;
  rating?: { average: number; count: number } | null;
  shipping?: SeoShipping | null;
  returnPolicy?: SeoReturnPolicy | null;
  /** Validade do preço (ISO). Por omissão, um ano a contar de `now`. */
  priceValidUntil?: string | null;
  now?: Date;
}): object {
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: Number(input.price).toFixed(2),
    priceCurrency: SEO_CURRENCY,
    availability: input.available === false
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url: input.url,
    priceValidUntil: input.priceValidUntil ?? defaultPriceValidUntil(input.now),
    seller: { "@type": "Organization", name: input.storeName },
  };

  if (input.shipping) {
    const s = input.shipping;
    const shipping: Record<string, unknown> = {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: Number(s.cost).toFixed(2),
        currency: SEO_CURRENCY,
      },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "AO" },
    };
    if (typeof s.minDays === "number" && typeof s.maxDays === "number") {
      shipping.deliveryTime = {
        "@type": "ShippingDeliveryTime",
        transitTime: { "@type": "QuantitativeValue", minValue: s.minDays, maxValue: s.maxDays, unitCode: "DAY" },
      };
    }
    offer.shippingDetails = shipping;
  }

  if (input.returnPolicy) {
    const days = input.returnPolicy.days;
    offer.hasMerchantReturnPolicy = days > 0
      ? {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AO",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: days,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      }
      : {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AO",
        returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      };
  }

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: productDescription({ name: input.name, description: input.description, storeName: input.storeName }),
    brand: { "@type": "Brand", name: input.storeName },
    offers: offer,
  };
  if (input.image) node.image = input.image;
  if (input.sku) node.sku = input.sku;
  if (input.category) node.category = input.category;
  if (input.rating && input.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.rating.average,
      reviewCount: input.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return node;
}

/** Um ano a contar de agora, em `YYYY-MM-DD` (formato aceite pelo Google). */
function defaultPriceValidUntil(now?: Date): string {
  const d = new Date((now ?? new Date()).getTime());
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Perguntas frequentes (elegível para o bloco de FAQ no Google). */
export function faqJsonLd(items: readonly { question: string; answer: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}
