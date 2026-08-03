/**
 * SEO partilhado pelas funções serverless (`prerender.js`, `sitemap.js`).
 *
 * Espelha `src/services/seo.ts` e `src/services/slug.ts` — que são a FONTE DE
 * VERDADE. As funções serverless correm em JavaScript puro (sem passo de
 * compilação), por isso a lógica é replicada aqui em vez de importada.
 * Ao alterar os títulos, descrições ou slugs, alterar NOS DOIS sítios.
 *
 * Além dos metadados, este módulo gera o **conteúdo HTML real** das páginas de
 * loja. Isso é o que torna o site indexável: os motores de busca recebem texto,
 * títulos e ligações no HTML da resposta, em vez de um `<div id="app">` vazio
 * que só ganha conteúdo depois de executar JavaScript.
 */

export const STORE_APEX = "sualoja.digital";
export const PLATFORM_APEX = "mobisno.store";
export const STORE_APEXES = [STORE_APEX, PLATFORM_APEX];
export const CURRENCY = "AOA";
export const LOCALE = "pt_AO";
export const LANGUAGE = "pt-AO";
export const COUNTRY = "Angola";
export const PLATFORM_NAME = "MôBisno";

/* ------------------------------- Utilitários ------------------------------ */

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function truncate(text, max = 160) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const i = cut.lastIndexOf(" ");
  return `${(i > max * 0.6 ? cut.slice(0, i) : cut).trim()}…`;
}

/** Espelha `src/services/slug.ts:slugify`. */
export function slugify(input) {
  const s = String(input ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "item";
}

export function productSlugPath(p) {
  const cat = slugify(p.category && String(p.category).trim() !== "" ? p.category : "geral");
  return `${cat}/${slugify(p.name)}`;
}

export const categorySlug = slugify;

/**
 * Formata um preço em Kwanza: "1.234,56 Kz".
 *
 * Espelha `web/lib/dom.ts:formatKz` — implementação manual, sem
 * `toLocaleString`, porque o separador de milhares do `pt-PT` no Node depende
 * dos dados ICU do runtime e produzia "1 234" (espaço) em vez de "1.234".
 * O preço tem de ser IDÊNTICO no HTML pré-renderizado e na SPA.
 */
export function formatKz(price) {
  const safe = Number.isFinite(Number(price)) ? Number(price) : 0;
  const cents = Math.round(Math.abs(safe) * 100);
  const whole = Math.floor(cents / 100).toString();
  const frac = (cents % 100).toString().padStart(2, "0");
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ".";
    grouped += whole[i];
  }
  return `${safe < 0 ? "-" : ""}${grouped},${frac} Kz`;
}

/** Identificador da loja a partir do host (ou null se for a plataforma). */
export function identifierFromHost(host) {
  const h = String(host || "").toLowerCase().split(":")[0];
  for (const apex of STORE_APEXES) {
    if (h.endsWith(`.${apex}`)) {
      const sub = h.slice(0, h.length - apex.length - 1);
      if (!sub || sub === "www" || sub === "app" || sub.includes(".")) return null;
      return sub;
    }
  }
  return null;
}

/* --------------------------- Títulos e descrições -------------------------- */

export function storeTitle(storeName) {
  return `${String(storeName).trim()} | Compras em Angola`;
}

export function storeDescription(storeName, custom) {
  const base = custom && String(custom).trim()
    ? String(custom).trim()
    : `Compre online na ${String(storeName).trim()} em Angola. Pagamento por Multicaixa Express, Referência Bancária e WhatsApp, com entrega em Luanda. Faça a sua encomenda de forma rápida e segura.`;
  return truncate(base, 160);
}

export function productTitle(productName, storeName) {
  return `${String(productName).trim()} — ${String(storeName).trim()}`;
}

export function productDescription({ name, description, priceLabel, storeName }) {
  const desc = String(description ?? "").trim();
  if (desc) return truncate(desc, 160);
  const price = priceLabel ? ` por ${priceLabel}` : "";
  return truncate(
    `Compre ${String(name).trim()}${price} na ${String(storeName).trim()}. Pagamento seguro por Multicaixa Express, Referência e WhatsApp, com entrega em Luanda (Angola).`,
    160,
  );
}

export function categoryTitle(category, storeName) {
  return `${String(category).trim()} — ${String(storeName).trim()} | Comprar em Angola`;
}

export function categoryDescription({ category, storeName, count = 0, sampleNames = [], priceFrom = null }) {
  const cat = String(category).trim();
  const quantos = count > 0 ? `${count} ${count === 1 ? "produto" : "produtos"} de ${cat}` : cat;
  const exemplos = sampleNames.length ? ` ${sampleNames.slice(0, 3).join(", ")} e mais.` : "";
  const desde = priceFrom ? ` Desde ${priceFrom}.` : "";
  return truncate(
    `${quantos} na ${String(storeName).trim()}.${desde}${exemplos} Entrega em Luanda e em Angola, com pagamento por Multicaixa Express, Referência Bancária ou WhatsApp.`,
    160,
  );
}

/* --------------------------------- Meta tags -------------------------------- */

/** Um ano a contar de hoje, em `YYYY-MM-DD`. */
function priceValidUntil() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function metaTags({ title, description, canonical, image, type, siteName, noindex, jsonLd }) {
  const t = esc(title);
  const d = esc(description);
  const img = image ? esc(image) : "";
  const tags = [
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1"}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:type" content="${esc(type || "website")}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="${esc(siteName || PLATFORM_NAME)}" />`,
    `<meta property="og:locale" content="${LOCALE}" />`,
    img ? `<meta property="og:image" content="${img}" />` : "",
    img ? `<meta property="og:image:alt" content="${t}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    img ? `<meta name="twitter:image" content="${img}" />` : "",
  ];
  if (jsonLd) {
    for (const node of (Array.isArray(jsonLd) ? jsonLd : [jsonLd])) {
      if (!node) continue;
      tags.push(`<script type="application/ld+json" data-seo>${JSON.stringify(node).replace(/</g, "\\u003c")}</script>`);
    }
  }
  return tags.filter(Boolean).join("\n    ");
}

/* --------------------------------- JSON-LD -------------------------------- */

export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem", position: i + 1, name: item.name, item: item.url,
    })),
  };
}

export function storeJsonLd({ storeName, url, logoUrl, description, address, telephone, priceRange }) {
  const base = String(url).replace(/\/+$/, "");
  const node = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${base}/#store`,
    name: storeName,
    url: `${base}/`,
    description: storeDescription(storeName, description),
    currenciesAccepted: CURRENCY,
    paymentAccepted: "Multicaixa Express, Referência Bancária, WhatsApp",
    areaServed: { "@type": "Country", name: COUNTRY },
  };
  if (logoUrl) { node.image = logoUrl; node.logo = logoUrl; }
  if (telephone) node.telephone = telephone;
  if (priceRange) node.priceRange = priceRange;
  if (address && (address.street || address.city)) {
    node.address = {
      "@type": "PostalAddress",
      ...(address.street ? { streetAddress: address.street } : {}),
      ...(address.city ? { addressLocality: address.city } : {}),
      addressCountry: "AO",
    };
  }
  if (address && typeof address.latitude === "number" && typeof address.longitude === "number") {
    node.geo = { "@type": "GeoCoordinates", latitude: address.latitude, longitude: address.longitude };
  }
  return node;
}

export function collectionJsonLd({ name, url, description, items }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name, url, description,
    inLanguage: LANGUAGE,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem", position: i + 1, url: it.url, name: it.name,
        ...(it.image ? { image: it.image } : {}),
      })),
    },
  };
}

export function productJsonLd({
  name, description, image, price, url, storeName, sku, category, available, rating, shipping,
}) {
  const offer = {
    "@type": "Offer",
    price: Number(price).toFixed(2),
    priceCurrency: CURRENCY,
    availability: available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url,
    priceValidUntil: priceValidUntil(),
    seller: { "@type": "Organization", name: storeName },
  };
  if (shipping && Number.isFinite(shipping.cost)) {
    offer.shippingDetails = {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: Number(shipping.cost).toFixed(2), currency: CURRENCY },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "AO" },
    };
  }
  const node = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: productDescription({ name, description, storeName }),
    brand: { "@type": "Brand", name: storeName },
    offers: offer,
  };
  if (image) node.image = image;
  if (sku) node.sku = sku;
  if (category) node.category = category;
  if (rating && rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.average, reviewCount: rating.count, bestRating: 5, worstRating: 1,
    };
  }
  return node;
}

export function platformJsonLd(baseUrl) {
  const base = String(baseUrl).replace(/\/+$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: PLATFORM_NAME,
      url: `${base}/`,
      logo: `${base}/logo-header.png`,
      areaServed: { "@type": "Country", name: COUNTRY },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: PLATFORM_NAME,
      url: `${base}/`,
      inLanguage: LANGUAGE,
      publisher: { "@id": `${base}/#organization` },
    },
  ];
}

export function faqJsonLd(items) {
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

/* ------------------------------ Localizações ------------------------------ */

/**
 * Espelho de `src/services/locations.ts` — que é a FONTE DE VERDADE.
 *
 * Existe porque o HTML pré-renderizado tem de apresentar **as mesmas
 * localizações** que a SPA mostra (R5.10): se o rastreador vê um mapa e uma
 * morada e o visitante vê outros, o Google vê duas páginas onde só existe uma
 * (`SEO.md` §5.2). É a única regra de localizações duplicada aqui; ao alterar a
 * cascata, a caixa de enquadramento ou a morada predefinida, **alterar nos dois
 * sítios**. `tests/seoInfra.test.ts` compara os dois módulos e falha se
 * divergirem.
 */

/** Morada usada quando não há nenhuma outra. Igual ao módulo de origem. */
const DEFAULT_LOCATION_ADDRESS = "Luanda, Angola";

/** Meio-lado da caixa de enquadramento do mapa de OpenStreetMap, em graus. */
const BBOX_HALF_SIDE = 0.008;

/** Objeto onde faça sentido ler campos, ou `null`. Arrays contam como não-objeto. */
function asLocationRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}

/** Cadeia usável, ou `undefined`. Uma morada só de espaços não é usável. */
function asLocationText(value) {
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value;
}

/** Coordenada finita, ou `undefined` (`NaN` e `Infinity` dariam um mapa em branco). */
function asLocationCoord(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Converte um valor desconhecido numa localização, ou `null` se não for objeto. */
function asStorePlace(value) {
  const record = asLocationRecord(value);
  if (!record) return null;
  return {
    name: asLocationText(record.name),
    address: asLocationText(record.address),
    lat: asLocationCoord(record.lat),
    lng: asLocationCoord(record.lng),
  };
}

/** Verdadeiro quando a localização tem com que desenhar um mapa. */
function hasMapData(place) {
  return place.address !== undefined || (place.lat !== undefined && place.lng !== undefined);
}

/**
 * Espelha `src/services/locations.ts:resolveLocations`.
 *
 * Cascata: `block.places` com pelo menos uma entrada aproveitável → campos
 * `address`/`lat`/`lng` do próprio bloco (formato de localização única) →
 * morada do rodapé → entrada vazia. Devolve sempre pelo menos uma entrada e
 * nunca lança, para qualquer `block`.
 */
export function resolveLocations(block, footerLocation) {
  const record = asLocationRecord(block);

  const rawPlaces = record ? record.places : undefined;
  if (Array.isArray(rawPlaces)) {
    const places = [];
    for (const entry of rawPlaces) {
      const place = asStorePlace(entry);
      if (place) places.push(place);
    }
    if (places.length > 0) return places;
  }

  const legacy = asStorePlace(record);
  if (legacy && hasMapData(legacy)) {
    // O `title` do bloco é o título da secção, não o nome de um ponto de venda.
    return [{ address: legacy.address, lat: legacy.lat, lng: legacy.lng }];
  }

  const footer = asLocationText(footerLocation);
  if (footer !== undefined) return [{ address: footer }];

  return [{}];
}

/**
 * Espelha `src/services/locations.ts:mapEmbedSrc`. Sem chave de API: com
 * coordenadas usa OpenStreetMap com marcador, só com morada usa o embed da
 * Google.
 */
export function mapEmbedSrc(place, fallbackAddress) {
  const lat = asLocationCoord(place && place.lat);
  const lng = asLocationCoord(place && place.lng);
  if (lat !== undefined && lng !== undefined) {
    const d = BBOX_HALF_SIDE;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  }
  const addr = asLocationText(place && place.address) ?? asLocationText(fallbackAddress) ?? DEFAULT_LOCATION_ADDRESS;
  return `https://maps.google.com/maps?q=${encodeURIComponent(addr.trim())}&z=15&output=embed`;
}

/* -------------------------------- Variação -------------------------------- */

/**
 * Espelho de `src/services/variations.ts` — que é a FONTE DE VERDADE.
 *
 * Existe porque o HTML pré-renderizado, servido **sem JavaScript**, tem de
 * apresentar o nome de cada Variação e os respetivos valores como texto legível
 * (R4.18): os seletores são montados pela SPA, e sem esta linha de texto um
 * rastreador não veria que o Produto existe em várias versões.
 *
 * **Só é espelhado o mínimo que o texto precisa** (decisão **D9**): a
 * normalização dos eixos e a função `variationsPlainText`. O produto cartesiano
 * das Combinação, o modo de preço, o preço efetivo, o stock e a chave de linha
 * de Carrinho **não** aparecem no HTML pré-renderizado e por isso não são
 * duplicados aqui. Ao alterar a forma do texto ou a normalização dos eixos,
 * **alterar nos dois sítios**. `tests/seoInfra.test.ts` compara os dois módulos
 * e falha se divergirem.
 *
 * As guardas repetem-se em vez de reaproveitarem as das Localizações de
 * propósito: cada espelho tem de ser lido lado a lado com o seu módulo de
 * origem, e `asLabel` das Variação **apara** o valor devolvido, ao contrário de
 * `asLocationText`.
 */

/** Objeto onde faça sentido ler campos, ou `null`. Espelha `asRecord`. */
function asVariationRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}

/**
 * Etiqueta aparada, ou `undefined` quando não é texto com conteúdo. Espelha
 * `asLabel`: o `trim` é aplicado ao valor devolvido, porque `"M"` e `"M "` não
 * podem ser duas versões distintas do mesmo Produto.
 */
function asVariationLabel(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Eixos utilizáveis de uma lista de forma desconhecida. Espelha `normalizeAxes`.
 *
 * Descarta, por eixo: entradas que não são objetos, nomes vazios ou de tipo
 * errado, valores que não são texto utilizável e eixos que ficam sem nenhum
 * valor. Dentro de cada eixo os valores duplicados são descartados, ficando a
 * primeira ocorrência.
 */
function normalizeVariationAxes(value) {
  const axes = [];
  if (!Array.isArray(value)) return axes;
  for (const entry of value) {
    const record = asVariationRecord(entry);
    if (!record) continue;
    const name = asVariationLabel(record.name);
    if (name === undefined) continue;
    const values = [];
    for (const rawValue of (Array.isArray(record.values) ? record.values : [])) {
      const label = asVariationLabel(rawValue);
      if (label === undefined) continue;
      if (values.includes(label)) continue;
      values.push(label);
    }
    if (values.length === 0) continue;
    axes.push({ name, values });
  }
  return axes;
}

/**
 * Eixos de Variação de um Produto, lidos da Personalização, ou `null`.
 *
 * Espelha os casos de `null` de `normalizeVariations` — e é esse `null` que
 * mantém o comportamento atual inalterado (R4.16): `custom` não é objeto,
 * `productVariations` não é objeto, a entrada do Produto não é objeto,
 * `enabled !== true` (comparação estrita, sem coerção), `axes` não é array, ou
 * não sobra nenhum eixo com valores.
 *
 * Devolve **apenas** `enabled` e `axes`, que é o que o texto do R4.18 lê; o
 * `priceMode` e as `combinations` ficam do lado do domínio (decisão D9).
 *
 * Total: nunca lança, para qualquer `custom` e qualquer `productId`.
 */
export function productVariationsOf(custom, productId) {
  const map = asVariationRecord(asVariationRecord(custom)?.productVariations);
  if (!map) return null;
  if (typeof productId !== "string" || productId === "") return null;
  const entry = asVariationRecord(map[productId]);
  if (!entry) return null;
  if (entry.enabled !== true) return null;
  if (!Array.isArray(entry.axes)) return null;
  const axes = normalizeVariationAxes(entry.axes);
  if (axes.length === 0) return null;
  return { enabled: true, axes };
}

/**
 * Espelha `src/services/variations.ts:variationsPlainText`.
 *
 * Uma linha por eixo, `nome + ": " + valores unidos por ", "`, as linhas unidas
 * por `"\n"`, sem linha em branco no fim. Para os eixos `Cor = [Preto, Branco]`
 * e `Tamanho = [S, M]`:
 *
 * ```text
 * Cor: Preto, Branco
 * Tamanho: S, M
 * ```
 *
 * Devolve `""` quando não há nenhum eixo utilizável (incluindo `v` a `null`), e
 * quem desenha o HTML omite a secção nesse caso.
 *
 * Total: nunca lança, para qualquer entrada.
 */
export function variationsPlainText(v) {
  return normalizeVariationAxes(asVariationRecord(v)?.axes)
    .map((axis) => `${axis.name}: ${axis.values.join(", ")}`)
    .join("\n");
}

/* ----------------------------- Conteúdo (SSR) ----------------------------- */

/**
 * Folha de estilo do conteúdo pré-renderizado.
 *
 * O bloco `.mb-ssr` está no HTML mas é INVISÍVEL para quem visita o site. Isso
 * é deliberado: enquanto era visível, o visitante via primeiro uma página de
 * texto simples e só depois a loja real — parecia outro site a carregar.
 *
 * Não perde SEO nenhum. Os rastreadores que não executam JavaScript (Bing,
 * crawlers sociais, primeira passagem do Google) leem o HTML em bruto, onde o
 * texto continua todo presente — o CSS não é aplicado nessa leitura. O Google,
 * quando executa o JavaScript, vê a loja verdadeira renderizada pela SPA, com
 * a mesma informação. Não é cloaking: o conteúdo é o mesmo, muda a
 * apresentação.
 *
 * O que o visitante vê é `.mb-boot` — um ecrã de carregamento com o logótipo e
 * a cor da loja. Ambos desaparecem de uma vez quando a SPA substitui `#app`.
 */
function ssrStyle(brand) {
  return `<style id="mb-ssr-style">
    .mb-ssr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
    .mb-boot{min-height:78vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:40px 20px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    .mb-boot img{height:56px;width:auto;max-width:70vw;object-fit:contain}
    .mb-boot-name{font-size:20px;font-weight:800;letter-spacing:-.01em;color:#1c1b1b;text-align:center}
    .mb-boot-bar{width:132px;height:3px;border-radius:99px;background:rgba(128,128,128,.18);overflow:hidden}
    .mb-boot-bar span{display:block;width:40%;height:100%;border-radius:99px;background:${brand};animation:mb-boot-slide 1.1s ease-in-out infinite}
    @keyframes mb-boot-slide{0%{transform:translateX(-100%)}100%{transform:translateX(330%)}}
    @media(prefers-reduced-motion:reduce){.mb-boot-bar span{animation:none;width:100%}}
  </style>`;
}

/**
 * Ecrã de carregamento com a marca da loja — é isto que o visitante vê até a
 * SPA ter os dados prontos. Substitui a antiga página de texto, que parecia
 * outro site a abrir antes da loja verdadeira.
 */
function bootScreen(name, logoUrl) {
  const mark = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(name)}" />`
    : `<p class="mb-boot-name">${esc(name)}</p>`;
  return `<div class="mb-boot" aria-hidden="true">${mark}<div class="mb-boot-bar"><span></span></div></div>`;
}

function topBar(storeName, logoUrl, homeHref) {
  const logo = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(storeName)}" width="40" height="40" />`
    : "";
  return `<div class="mb-ssr-top"><a href="${esc(homeHref)}">${logo}<strong>${esc(storeName)}</strong></a></div>`;
}

function footer(storeName) {
  return `<div class="mb-ssr-foot">${esc(storeName)} · Loja online em Angola · Pagamento por Multicaixa Express, Referência Bancária e WhatsApp · Criada com <a href="https://${PLATFORM_APEX}/">MôBisno</a></div>`;
}

function productCards(products, base) {
  return products.map((p) => {
    const href = `${base}/produto/${productSlugPath(p)}`;
    const img = p.image_url
      ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" />`
      : `<span class="n"></span>`;
    return `<li><a href="${esc(href)}">${img}<span class="n">${esc(p.name)}</span><span class="p">${esc(formatKz(p.price))}</span></a></li>`;
  }).join("");
}

/** Morada a apresentar numa localização. Espelha `placeAddress` de `web/templates/blocks.ts`. */
function placeAddressText(place) {
  return String((place && place.address) ?? "").trim() || DEFAULT_LOCATION_ADDRESS;
}

/** Nome da localização, sem espaços em volta. Espelha `placeName` de `web/templates/blocks.ts`. */
function placeNameText(place) {
  return String((place && place.name) ?? "").trim();
}

/**
 * Localizações da loja no HTML pré-renderizado (R5.10).
 *
 * Espelha o que `locationByVariant` de `web/templates/blocks.ts` apresenta em
 * cada bloco `location`: o título da secção, o nome de cada localização (só
 * quando existe), a respetiva morada e um `iframe` por mapa, com o mesmo `src`
 * de `mapEmbedSrc` e o mesmo `title="Mapa …"`.
 *
 * **O que não é espelhado, de propósito: os atributos `data-edit`.** São hooks
 * do Editor, que só os lê dentro de `#preview` (`web/views/editor.ts`) — nunca
 * neste HTML, que a SPA substitui no arranque. Não são conteúdo: nem o visitante
 * sem JavaScript nem o rastreador lhes dão uso. O que o R5.10 exige é o
 * conteúdo visível — moradas, nomes e mapas — e é isso que sai daqui.
 *
 * As classes de apresentação (Tailwind) também ficam de fora: o bloco `.mb-ssr`
 * é invisível por recorte, a disposição em grelha é da SPA.
 *
 * Total: aceita qualquer `customization`, incluindo `null` e blocos malformados.
 */
export function locationsHtml(custom) {
  const record = asLocationRecord(custom);
  const blocks = Array.isArray(record && record.blocks) ? record.blocks : [];
  const footerLocation = asLocationText(asLocationRecord(record && record.footer)?.location);

  const sections = [];
  for (const block of blocks) {
    const b = asLocationRecord(block);
    if (!b || b.type !== "location") continue;

    const title = String(b.title ?? "").trim();
    const items = resolveLocations(b, footerLocation).map((p) => {
      const name = placeNameText(p);
      const address = placeAddressText(p);
      const label = name || address;
      return `<li>${name ? `<strong>${esc(name)}</strong> ` : ""}<span>${esc(address)}</span>`
        + `<iframe title="Mapa ${esc(label)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapEmbedSrc(p, footerLocation))}"></iframe></li>`;
    }).join("");

    sections.push(`${title ? `<h2>${esc(title)}</h2>` : ""}<ul class="mb-ssr-places">${items}</ul>`);
  }
  return sections.join("");
}

/**
 * Conteúdo da página inicial de uma loja.
 *
 * `custom` é a `customization` da Loja e é opcional: sem ela a página sai como
 * antes, apenas sem as localizações.
 */
export function storeHomeHtml({ storeName, description, logoUrl, products, categories, base, brand, custom }) {
  const nav = categories.length
    ? `<nav class="mb-ssr-nav">${categories.map((c) => `<a href="${esc(base)}/categoria/${esc(categorySlug(c))}">${esc(c)}</a>`).join("")}</nav>`
    : "";
  const grid = products.length
    ? `<h2>Produtos</h2><ul class="mb-ssr-grid">${productCards(products, base)}</ul>`
    : "";
  return `${ssrStyle(brand)}${bootScreen(storeName, logoUrl)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <h1>${esc(storeName)}</h1>
    <p>${esc(description)}</p>
    ${nav}
    ${grid}
    ${locationsHtml(custom)}
    ${footer(storeName)}
  </div>`;
}

/** Conteúdo de uma página de listagem (categoria ou todos os produtos). */
export function categoryHtml({ storeName, category, description, logoUrl, products, base, brand }) {
  const grid = products.length
    ? `<ul class="mb-ssr-grid">${productCards(products, base)}</ul>`
    : `<p>Ainda não há produtos nesta categoria.</p>`;
  return `${ssrStyle(brand)}${bootScreen(storeName, logoUrl)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <p class="mb-ssr-crumb"><a href="${esc(base || "/")}">${esc(storeName)}</a> › ${esc(category)}</p>
    <h1>${esc(category)}</h1>
    <p>${esc(description)}</p>
    ${grid}
    ${footer(storeName)}
  </div>`;
}

/**
 * Conteúdo de uma página de produto.
 *
 * `custom` é a `customization` da Loja e é opcional: sem ela a página sai como
 * antes, apenas sem o texto das Variação (R4.18).
 */
export function productHtml({ storeName, product, description, logoUrl, base, brand, outOfStock, custom }) {
  const img = product.image_url
    ? `<img src="${esc(product.image_url)}" alt="${esc(product.name)}" />`
    : "";
  const crumbCat = product.category
    ? ` › <a href="${esc(base)}/categoria/${esc(categorySlug(product.category))}">${esc(product.category)}</a>`
    : "";
  const stock = outOfStock ? `<p><strong>Esgotado</strong></p>` : "";
  // Variação como texto legível, sem JavaScript (R4.18). O texto sai numa única
  // linha por eixo, tal como o domínio o produz; os seletores são da SPA.
  const variations = variationsPlainText(productVariationsOf(custom, product.id));
  const variationsText = variations ? `<p class="mb-ssr-vars">${esc(variations)}</p>` : "";
  const full = String(product.description ?? "").trim();
  return `${ssrStyle(brand)}${bootScreen(storeName, logoUrl)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <p class="mb-ssr-crumb"><a href="${esc(base || "/")}">${esc(storeName)}</a>${crumbCat} › ${esc(product.name)}</p>
    <div class="mb-ssr-prod">
      <div>${img}</div>
      <div>
        <h1>${esc(product.name)}</h1>
        <p class="mb-ssr-price">${esc(formatKz(product.price))}</p>
        ${stock}
        ${variationsText}
        <p>${esc(full || description)}</p>
        <p>Entrega em Luanda e em todo o Angola. Pagamento por Multicaixa Express, Referência Bancária ou WhatsApp.</p>
      </div>
    </div>
    ${footer(storeName)}
  </div>`;
}

/**
 * Conteúdo genérico para uma página da plataforma (mobisno.store).
 * `extraHtml` é HTML já construído (e já escapado) a acrescentar no fim — usado
 * pelo diretório de lojas para a grelha de ligações.
 */
export function platformHtml({ heading, intro, sections = [], links = [], extraHtml = "" }) {
  const body = sections.map((s) => `<h2>${esc(s.title)}</h2>${s.items
    ? `<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : `<p>${esc(s.text ?? "")}</p>`}`).join("");
  const nav = links.length
    ? `<nav class="mb-ssr-nav">${links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")}</nav>`
    : "";
  return `${ssrStyle("#F95901")}${bootScreen("MôBisno", "/logo-header.png")}<div class="mb-ssr">
    <div class="mb-ssr-top"><a href="/"><img src="/logo-header.png" alt="MôBisno" width="40" height="40" /><strong>MôBisno</strong></a></div>
    <h1>${esc(heading)}</h1>
    <p>${esc(intro)}</p>
    ${nav}
    ${body}
    ${extraHtml}
    <div class="mb-ssr-foot">MôBisno · Plataforma angolana para criar lojas online · <a href="/termos">Termos</a> · <a href="/privacidade">Privacidade</a></div>
  </div>`;
}

/* -------------------------- Injeção no shell HTML -------------------------- */

/**
 * Substitui o `<title>`, limpa as meta por omissão da plataforma (para não
 * duplicar), acrescenta as tags desta página e injeta o conteúdo dentro de
 * `#app`. A SPA substitui esse conteúdo quando arranca.
 */
export function inject(shell, { title, tags, bodyHtml, lang }) {
  let out = shell
    .replace(/\s*<meta\s+name="description"[^>]*>/gi, "")
    .replace(/\s*<meta\s+name="keywords"[^>]*>/gi, "")
    .replace(/\s*<meta\s+name="robots"[^>]*>/gi, "")
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(/\s*<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/\s*<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
    .replace(/\s*<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  if (!/<title>/i.test(out)) out = out.replace(/<head>/i, `<head>\n    <title>${esc(title)}</title>`);
  if (lang) out = out.replace(/<html[^>]*lang="[^"]*"/i, `<html lang="${esc(lang)}"`);
  out = out.replace(/<\/head>/i, `    ${tags}\n  </head>`);

  if (bodyHtml) {
    out = out.replace(/<div id="app"[^>]*>\s*<\/div>/i, (m) =>
      m.replace(/>\s*<\/div>$/, `>${bodyHtml}</div>`));
  }
  return out;
}
