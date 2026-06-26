/**
 * robots.txt dinâmico (por host). Permite a indexação das páginas públicas,
 * bloqueia as áreas privadas/transacionais e aponta para o sitemap do próprio
 * host (loja ou plataforma).
 */
export default function handler(req, res) {
  const host = (req.headers.host || "mobisno.store").split(":")[0];
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /painel",
    "Disallow: /adminpainel",
    "Disallow: /login",
    "Disallow: /criar",
    "Disallow: /personalizar",
    "Disallow: /carrinho",
    "Disallow: /checkout",
    "",
    `Sitemap: https://${host}/sitemap.xml`,
    "",
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.statusCode = 200;
  res.end(body);
}
