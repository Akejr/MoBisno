/**
 * Pré-renderização de SEO para páginas de LOJA (server-side).
 *
 * Os crawlers sociais (WhatsApp, Facebook, etc.) não executam JavaScript, por
 * isso as meta tags têm de existir no HTML servido. Esta função:
 *   1. resolve a loja a partir do host (`nomedaloja.sualoja.digital`);
 *   2. resolve o produto/categoria a partir do caminho;
 *   3. obtém o shell estático (`/index.html`) e injeta no `<head>` o título,
 *      a descrição, Open Graph/Twitter (com a IMAGEM do produto e foco na loja)
 *      e o JSON-LD;
 *   4. devolve o HTML. A SPA continua a arrancar normalmente para os humanos.
 *
 * É defensiva: perante qualquer erro devolve o shell inalterado (nunca 500).
 *
 * NB: os templates de texto espelham `src/services/seo.ts` (fonte de verdade).
 */

import { admin } from "./_shared.js";

const STORE_APEX = "sualoja.digital";
const STORE_APEXES = [STORE_APEX, "mobisno.store"];
const CURRENCY = "AOA";
const LOCALE = "pt_AO";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function truncate(text, max = 160) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const i = cut.lastIndexOf(" ");
  return `${(i > max * 0.6 ? cut.slice(0, i) : cut).trim()}…`;
}

function slugify(input) {
  const s = String(input ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "item";
}
function productSlugPath(p) {
  const cat = slugify(p.category && String(p.category).trim() !== "" ? p.category : "geral");
  return `${cat}/${slugify(p.name)}`;
}

/** Identificador da loja a partir do host (ou null). */
function identifierFromHost(host) {
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

function formatKz(price) {
  const n = Number.isFinite(price) ? Number(price) : 0;
  return `${n.toLocaleString("pt-PT")} Kz`;
}

async function fetchShell(host) {
  const r = await fetch(`https://${host}/index.html`, { headers: { "x-prerender": "1" } });
  return await r.text();
}

function metaTags({ title, description, canonical, image, type, siteName, noindex, jsonLd }) {
  const t = esc(title);
  const d = esc(description);
  const img = image ? esc(image) : "";
  const tags = [
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow"}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:type" content="${esc(type || "website")}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="${esc(siteName || "MôBisno")}" />`,
    `<meta property="og:locale" content="${LOCALE}" />`,
    img ? `<meta property="og:image" content="${img}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    img ? `<meta name="twitter:image" content="${img}" />` : "",
  ];
  if (jsonLd) {
    const list = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    for (const node of list) {
      tags.push(`<script type="application/ld+json" data-seo>${JSON.stringify(node).replace(/</g, "\\u003c")}</script>`);
    }
  }
  return tags.filter(Boolean).join("\n    ");
}

/** Injeta as meta no shell: substitui o <title> e acrescenta tags antes de </head>. */
function inject(shell, title, tagsHtml) {
  let out = shell.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  if (!/<title>/i.test(out)) out = out.replace(/<head>/i, `<head>\n    <title>${esc(title)}</title>`);
  return out.replace(/<\/head>/i, `    ${tagsHtml}\n  </head>`);
}

export default async function handler(req, res) {
  const host = req.headers.host || "";
  let shell = "";
  try {
    shell = await fetchShell(host);
  } catch {
    // Sem shell não há nada a fazer; deixa a CDN servir o estático.
    res.statusCode = 302;
    res.setHeader("Location", "/index.html");
    return res.end();
  }

  const sendHtml = (html) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.statusCode = 200;
    res.end(html);
  };

  try {
    const identifier = identifierFromHost(host);
    const db = admin();
    if (!identifier || !db) return sendHtml(shell);

    const path = (req.url || "/").split("?")[0];
    const canonicalBase = `https://${identifier}.${STORE_APEX}`;

    const { data: store } = await db
      .from("stores")
      .select("id, name, identifier, state")
      .eq("identifier", identifier)
      .eq("state", "Publicada")
      .maybeSingle();

    if (!store) return sendHtml(shell); // loja inexistente/não publicada → shell

    const storeName = store.name;
    const { data: logo } = await db.from("assets").select("url").eq("store_id", store.id).eq("kind", "logo").maybeSingle();
    const logoUrl = logo?.url || null;

    // Página de produto?
    const prodMatch = path.match(/^\/produto\/(.+)$/);
    if (prodMatch) {
      const wanted = decodeURIComponent(prodMatch[1]).replace(/^\/+|\/+$/g, "").toLowerCase();
      const { data: products } = await db
        .from("products")
        .select("id, name, description, category, price, image_url, available")
        .eq("store_id", store.id)
        .eq("available", true);
      const product = (products || []).find((p) => productSlugPath(p).toLowerCase() === wanted);
      if (product) {
        const url = `${canonicalBase}/produto/${productSlugPath(product)}`;
        const description = (product.description && String(product.description).trim())
          ? truncate(product.description, 160)
          : truncate(`Compre ${product.name} por ${formatKz(product.price)} na ${storeName}. Pagamento seguro por Multicaixa Express, Referência e WhatsApp, com entrega em Luanda (Angola).`, 160);
        const title = `${product.name} — ${storeName}`;
        const image = product.image_url || logoUrl;
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description,
          brand: { "@type": "Brand", name: storeName },
          ...(image ? { image } : {}),
          offers: {
            "@type": "Offer",
            price: Number(product.price).toFixed(2),
            priceCurrency: CURRENCY,
            availability: product.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            url,
          },
        };
        const tags = metaTags({ title, description, canonical: url, image, type: "product", siteName: storeName, jsonLd });
        return sendHtml(inject(shell, title, tags));
      }
    }

    // Página de categoria?
    const catMatch = path.match(/^\/categoria\/(.+)$/);
    const storeDesc = truncate(`Compre online na ${storeName} em Angola. Pagamento por Multicaixa Express, Referência Bancária e WhatsApp, com entrega em Luanda.`, 160);
    if (catMatch) {
      const cat = decodeURIComponent(catMatch[1]);
      const url = `${canonicalBase}/categoria/${encodeURIComponent(cat)}`;
      const title = `${cat} — ${storeName} | Compras em Angola`;
      const tags = metaTags({ title, description: storeDesc, canonical: url, image: logoUrl, type: "website", siteName: storeName });
      return sendHtml(inject(shell, title, tags));
    }

    // Página inicial da loja.
    const title = `${storeName} | Compras em Angola`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      name: storeName,
      url: canonicalBase,
      description: storeDesc,
      currenciesAccepted: CURRENCY,
      paymentAccepted: "Multicaixa Express, Referência Bancária, WhatsApp",
      areaServed: { "@type": "Country", name: "Angola" },
      ...(logoUrl ? { image: logoUrl } : {}),
    };
    const tags = metaTags({ title, description: storeDesc, canonical: canonicalBase, image: logoUrl, type: "website", siteName: storeName, jsonLd });
    return sendHtml(inject(shell, title, tags));
  } catch (e) {
    console.error("prerender", e);
    return sendHtml(shell);
  }
}
