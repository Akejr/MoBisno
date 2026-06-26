/**
 * sitemap.xml dinâmico e host-aware:
 *  - num host de loja (`nomedaloja.sualoja.digital`): lista a home + os produtos
 *    dessa loja;
 *  - no host da plataforma (`mobisno.store`): lista as páginas públicas + a home
 *    de todas as lojas publicadas (em `sualoja.digital`).
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

function urlset(urls) {
  const body = urls.map((u) => {
    const loc = `<loc>${xmlEsc(u.loc)}</loc>`;
    const lm = u.lastmod ? `<lastmod>${xmlEsc(u.lastmod)}</lastmod>` : "";
    return `  <url>${loc}${lm}</url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export default async function handler(req, res) {
  const host = (req.headers.host || PLATFORM_APEX).split(":")[0];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  const db = admin();
  try {
    const identifier = identifierFromHost(host);

    if (identifier && db) {
      // Sitemap de uma loja.
      const { data: store } = await db.from("stores").select("id, identifier, state").eq("identifier", identifier).eq("state", "Publicada").maybeSingle();
      if (!store) { res.statusCode = 200; return res.end(urlset([{ loc: `https://${identifier}.${STORE_APEX}/` }])); }
      const base = `https://${identifier}.${STORE_APEX}`;
      const { data: products } = await db.from("products").select("name, category, available, created_at").eq("store_id", store.id).eq("available", true);
      const urls = [{ loc: `${base}/` }];
      for (const p of products || []) {
        urls.push({ loc: `${base}/produto/${productSlugPath(p)}`, lastmod: p.created_at ? new Date(p.created_at).toISOString() : undefined });
      }
      res.statusCode = 200;
      return res.end(urlset(urls));
    }

    // Sitemap da plataforma.
    const urls = [{ loc: `https://${PLATFORM_APEX}/` }];
    if (db) {
      const { data: stores } = await db.from("stores").select("identifier, state").eq("state", "Publicada");
      for (const s of stores || []) urls.push({ loc: `https://${s.identifier}.${STORE_APEX}/` });
    }
    res.statusCode = 200;
    return res.end(urlset(urls));
  } catch (e) {
    console.error("sitemap", e);
    res.statusCode = 200;
    return res.end(urlset([{ loc: `https://${PLATFORM_APEX}/` }]));
  }
}
