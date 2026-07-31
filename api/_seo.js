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

/* ----------------------------- Conteúdo (SSR) ----------------------------- */

/**
 * Folha de estilo mínima do conteúdo pré-renderizado.
 *
 * Este HTML é substituído pela SPA assim que ela tem os dados prontos
 * (`render()` troca o `innerHTML` de `#app` de uma só vez). Até lá funciona
 * como ecrã de carregamento com conteúdo real — o que também melhora o LCP em
 * ligações móveis lentas, em vez de mostrar uma página em branco.
 */
function ssrStyle(brand) {
  return `<style id="mb-ssr-style">
    .mb-ssr{max-width:1120px;margin:0 auto;padding:24px 20px 64px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c1b1b;line-height:1.55}
    .mb-ssr a{color:inherit;text-decoration:none}
    .mb-ssr-top{display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:1px solid #ececec;margin-bottom:28px}
    .mb-ssr-top img{height:40px;width:auto}
    .mb-ssr-top strong{font-size:19px;letter-spacing:-.01em}
    .mb-ssr h1{font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:0 0 10px}
    .mb-ssr h2{font-size:20px;font-weight:700;margin:36px 0 14px}
    .mb-ssr p{margin:0 0 14px;color:#524345;max-width:70ch}
    .mb-ssr-nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 6px}
    .mb-ssr-nav a{border:1px solid #e3e0e0;border-radius:999px;padding:7px 15px;font-size:14px}
    .mb-ssr-grid{list-style:none;padding:0;margin:0;display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
    .mb-ssr-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#f4f2f2}
    .mb-ssr-grid .n{display:block;margin-top:9px;font-size:14px;font-weight:600}
    .mb-ssr-grid .p{display:block;font-size:14px;color:${brand}}
    .mb-ssr-prod{display:grid;gap:28px;grid-template-columns:minmax(0,1fr)}
    @media(min-width:760px){.mb-ssr-prod{grid-template-columns:minmax(0,440px) minmax(0,1fr)}}
    .mb-ssr-prod img{width:100%;border-radius:14px;background:#f4f2f2}
    .mb-ssr-price{font-size:26px;font-weight:800;color:${brand};margin:6px 0 16px}
    .mb-ssr-crumb{font-size:13px;color:#7a6f70;margin-bottom:14px}
    .mb-ssr-foot{margin-top:56px;padding-top:20px;border-top:1px solid #ececec;font-size:13px;color:#7a6f70}
  </style>`;
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

/** Conteúdo da página inicial de uma loja. */
export function storeHomeHtml({ storeName, description, logoUrl, products, categories, base, brand }) {
  const nav = categories.length
    ? `<nav class="mb-ssr-nav">${categories.map((c) => `<a href="${esc(base)}/categoria/${esc(categorySlug(c))}">${esc(c)}</a>`).join("")}</nav>`
    : "";
  const grid = products.length
    ? `<h2>Produtos</h2><ul class="mb-ssr-grid">${productCards(products, base)}</ul>`
    : "";
  return `${ssrStyle(brand)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <h1>${esc(storeName)}</h1>
    <p>${esc(description)}</p>
    ${nav}
    ${grid}
    ${footer(storeName)}
  </div>`;
}

/** Conteúdo de uma página de listagem (categoria ou todos os produtos). */
export function categoryHtml({ storeName, category, description, logoUrl, products, base, brand }) {
  const grid = products.length
    ? `<ul class="mb-ssr-grid">${productCards(products, base)}</ul>`
    : `<p>Ainda não há produtos nesta categoria.</p>`;
  return `${ssrStyle(brand)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <p class="mb-ssr-crumb"><a href="${esc(base || "/")}">${esc(storeName)}</a> › ${esc(category)}</p>
    <h1>${esc(category)}</h1>
    <p>${esc(description)}</p>
    ${grid}
    ${footer(storeName)}
  </div>`;
}

/** Conteúdo de uma página de produto. */
export function productHtml({ storeName, product, description, logoUrl, base, brand, outOfStock }) {
  const img = product.image_url
    ? `<img src="${esc(product.image_url)}" alt="${esc(product.name)}" />`
    : "";
  const crumbCat = product.category
    ? ` › <a href="${esc(base)}/categoria/${esc(categorySlug(product.category))}">${esc(product.category)}</a>`
    : "";
  const stock = outOfStock ? `<p><strong>Esgotado</strong></p>` : "";
  const full = String(product.description ?? "").trim();
  return `${ssrStyle(brand)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <p class="mb-ssr-crumb"><a href="${esc(base || "/")}">${esc(storeName)}</a>${crumbCat} › ${esc(product.name)}</p>
    <div class="mb-ssr-prod">
      <div>${img}</div>
      <div>
        <h1>${esc(product.name)}</h1>
        <p class="mb-ssr-price">${esc(formatKz(product.price))}</p>
        ${stock}
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
  return `${ssrStyle("#F95901")}<div class="mb-ssr">
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
