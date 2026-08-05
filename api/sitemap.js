/**
 * sitemap.xml dinâmico e host-aware. Respeita a regra do Google de que um
 * sitemap só pode listar URLs do MESMO host/domínio:
 *
 *  - `nomedaloja.sualoja.digital/sitemap.xml` → páginas dessa loja (início,
 *    categorias, produtos), com `lastmod` e a imagem de cada produto;
 *  - `sualoja.digital/sitemap.xml` → ÍNDICE de sitemaps das lojas (subdomínios
 *    do mesmo domínio); submeter este numa propriedade de Domínio no Search
 *    Console;
 *  - `mobisno.store/sitemap.xml` → páginas da plataforma, incluindo o diretório
 *    de lojas.
 *
 * A extensão de imagem (`image:image`) faz os produtos entrarem no separador
 * Imagens do Google — em comércio, é uma fonte de tráfego relevante.
 *
 * Defensivo: perante erro devolve um sitemap mínimo (nunca 500).
 */
import { admin } from "./_shared.js";
import { STORE_APEX, PLATFORM_APEX, STORE_APEXES, productSlugPath, categorySlug, identifierFromHost } from "./_seo.js";

/** Limite do protocolo: 50.000 URLs por sitemap. */
const MAX_URLS = 45000;

function xmlEsc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** É o apex (ou www) do domínio das lojas? */
function isStoreApex(host) {
  const h = String(host || "").toLowerCase().split(":")[0];
  return h === STORE_APEX || h === `www.${STORE_APEX}`;
}

function urlset(urls) {
  const body = urls.slice(0, MAX_URLS).map((u) => {
    const lm = u.lastmod ? `<lastmod>${xmlEsc(u.lastmod)}</lastmod>` : "";
    const cf = u.changefreq ? `<changefreq>${xmlEsc(u.changefreq)}</changefreq>` : "";
    const pr = u.priority ? `<priority>${xmlEsc(u.priority)}</priority>` : "";
    const img = u.image
      ? `<image:image><image:loc>${xmlEsc(u.image)}</image:loc>${u.title ? `<image:title>${xmlEsc(u.title)}</image:title>` : ""}</image:image>`
      : "";
    return `  <url><loc>${xmlEsc(u.loc)}</loc>${lm}${cf}${pr}${img}</url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
}

function sitemapIndex(locs) {
  const body = locs.map((loc) => `  <sitemap><loc>${xmlEsc(loc)}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

const iso = (v) => (v ? new Date(v).toISOString() : undefined);

export default async function handler(req, res) {
  const host = (req.headers.host || PLATFORM_APEX).split(":")[0];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  const db = admin();
  try {
    const identifier = identifierFromHost(host);

    /* ------------ 1) Host de loja → páginas dessa loja (mesmo host) ------------ */
    if (identifier && db) {
      const base = `https://${host}`;
      const { data: store } = await db
        .from("stores").select("id, state, owner_id")
        .eq("identifier", identifier).eq("state", "Publicada").maybeSingle();
      if (!store) { res.statusCode = 200; return res.end(urlset([{ loc: `${base}/` }])); }

      const { data: products } = await db
        .from("products").select("name, category, price, image_url, available, created_at")
        .eq("store_id", store.id).eq("available", true);
      const items = products || [];

      // A data do produto mais recente serve de `lastmod` da loja e das listagens.
      const newest = items.reduce((acc, p) => {
        const t = p.created_at ? Date.parse(p.created_at) : 0;
        return t > acc ? t : acc;
      }, 0);
      const storeLastmod = newest ? new Date(newest).toISOString() : undefined;

      const urls = [
        { loc: `${base}/`, lastmod: storeLastmod, changefreq: "daily", priority: "1.0" },
      ];

      // Página com todos os produtos.
      if (items.length) {
        urls.push({ loc: `${base}/categoria/produtos`, lastmod: storeLastmod, changefreq: "daily", priority: "0.8" });
      }

      // Uma entrada por categoria (faltavam por completo no sitemap anterior).
      const cats = [];
      for (const p of items) {
        const c = (p.category ?? "").trim();
        if (c && !cats.includes(c)) cats.push(c);
      }
      for (const c of cats) {
        urls.push({ loc: `${base}/categoria/${categorySlug(c)}`, lastmod: storeLastmod, changefreq: "weekly", priority: "0.7" });
      }

      // Produtos, com a respetiva imagem.
      for (const p of items) {
        urls.push({
          loc: `${base}/produto/${productSlugPath(p)}`,
          lastmod: iso(p.created_at),
          changefreq: "weekly",
          priority: "0.9",
          image: p.image_url || undefined,
          title: p.name,
        });
      }

      res.statusCode = 200;
      return res.end(urlset(urls));
    }

    /* ------- 2) Apex das lojas → índice com o sitemap de cada loja ------- */
    if (isStoreApex(host)) {
      const locs = [];
      if (db) {
        // Mesma exclusão do diretório `/lojas`: `tpl` é `customization.__template`,
        // presente ⇒ Loja_Modelo. Anunciar as demonstrações dos modelos ao Google
        // é o mesmo defeito por outra porta (`SEO.md` §7.2).
        const { data: stores } = await db
          .from("stores").select("identifier, state, tpl:customization->__template")
          .eq("state", "Publicada");
        for (const s of stores || []) {
          if (!(s.tpl === undefined || s.tpl === null || s.tpl === false)) continue;
          locs.push(`https://${s.identifier}.${STORE_APEX}/sitemap.xml`);
        }
      }
      res.statusCode = 200;
      return res.end(locs.length ? sitemapIndex(locs) : urlset([{ loc: `https://${STORE_APEX}/` }]));
    }

    /* ---------------- 3) Plataforma (mobisno.store) ---------------- */
    const urls = [
      { loc: `https://${PLATFORM_APEX}/`, changefreq: "weekly", priority: "1.0" },
      { loc: `https://${PLATFORM_APEX}/lojas`, changefreq: "daily", priority: "0.9" },
      // `/criar` é o assistente (noindex na SPA) — não entra no sitemap.
      { loc: `https://${PLATFORM_APEX}/termos`, changefreq: "yearly", priority: "0.3" },
      { loc: `https://${PLATFORM_APEX}/privacidade`, changefreq: "yearly", priority: "0.3" },
      { loc: `https://${PLATFORM_APEX}/politica`, changefreq: "yearly", priority: "0.3" },
    ];
    res.statusCode = 200;
    return res.end(urlset(urls));
  } catch (e) {
    console.error("sitemap", e);
    res.statusCode = 200;
    return res.end(urlset([{ loc: `https://${host}/` }]));
  }
}
