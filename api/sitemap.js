/**
 * sitemap.xml dinâmico e host-aware. Respeita a regra do Google de que um
 * sitemap só pode listar URLs do MESMO host/domínio:
 *
 *  - `nomedaloja.sualoja.digital/sitemap.xml` → páginas dessa loja (mesmo host);
 *  - `sualoja.digital/sitemap.xml` → ÍNDICE de sitemaps das lojas (subdomínios
 *    do mesmo domínio); submeter este numa propriedade de Domínio no Search
 *    Console;
 *  - `mobisno.store/sitemap.xml` → apenas as páginas da plataforma.
 *
 * Defensivo: perante erro devolve um sitemap mínimo (nunca 500).
 */
import { admin } from "./_shared.js";

const STORE_APEX = "sualoja.digital";
const STORE_APEXES = [STORE_APEX, "mobisno.store"];
const PLATFORM_APEX = "mobisno.store";

function xmlEsc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
/** Identificador da loja a partir do host (subdomínio de um apex de loja), ou null. */
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
/** É o apex (ou www) do domínio das lojas? */
function isStoreApex(host) {
  const h = String(host || "").toLowerCase().split(":")[0];
  return h === STORE_APEX || h === `www.${STORE_APEX}`;
}

function urlset(urls) {
  const body = urls.map((u) => {
    const lm = u.lastmod ? `<lastmod>${xmlEsc(u.lastmod)}</lastmod>` : "";
    return `  <url><loc>${xmlEsc(u.loc)}</loc>${lm}</url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
function sitemapIndex(locs) {
  const body = locs.map((loc) => `  <sitemap><loc>${xmlEsc(loc)}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export default async function handler(req, res) {
  const host = (req.headers.host || PLATFORM_APEX).split(":")[0];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  const db = admin();
  try {
    const identifier = identifierFromHost(host);

    // 1) Host de loja → páginas dessa loja, usando o MESMO host do pedido.
    if (identifier && db) {
      const { data: store } = await db.from("stores").select("id, state").eq("identifier", identifier).eq("state", "Publicada").maybeSingle();
      const base = `https://${host}`;
      if (!store) { res.statusCode = 200; return res.end(urlset([{ loc: `${base}/` }])); }
      const { data: products } = await db.from("products").select("name, category, available, created_at").eq("store_id", store.id).eq("available", true);
      const urls = [{ loc: `${base}/` }];
      for (const p of products || []) {
        urls.push({ loc: `${base}/produto/${productSlugPath(p)}`, lastmod: p.created_at ? new Date(p.created_at).toISOString() : undefined });
      }
      res.statusCode = 200;
      return res.end(urlset(urls));
    }

    // 2) Apex do domínio das lojas → ÍNDICE com o sitemap de cada loja (mesmo domínio).
    if (isStoreApex(host)) {
      const locs = [];
      if (db) {
        const { data: stores } = await db.from("stores").select("identifier, state").eq("state", "Publicada");
        for (const s of stores || []) locs.push(`https://${s.identifier}.${STORE_APEX}/sitemap.xml`);
      }
      res.statusCode = 200;
      return res.end(locs.length ? sitemapIndex(locs) : urlset([{ loc: `https://${STORE_APEX}/` }]));
    }

    // 3) Plataforma (mobisno.store) → apenas páginas da plataforma (mesmo host).
    const urls = [
      { loc: `https://${PLATFORM_APEX}/` },
      { loc: `https://${PLATFORM_APEX}/termos` },
      { loc: `https://${PLATFORM_APEX}/privacidade` },
      { loc: `https://${PLATFORM_APEX}/politica` },
    ];
    res.statusCode = 200;
    return res.end(urlset(urls));
  } catch (e) {
    console.error("sitemap", e);
    res.statusCode = 200;
    return res.end(urlset([{ loc: `https://${host}/` }]));
  }
}
