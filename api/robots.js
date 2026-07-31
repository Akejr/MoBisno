/**
 * robots.txt dinâmico (por host).
 *
 * Permite a indexação das páginas públicas, bloqueia as áreas privadas e
 * transacionais e aponta para o sitemap do próprio host (loja ou plataforma).
 *
 * Notas:
 *  - `/criar` é uma página de captação pública (posiciona para "criar loja
 *    online angola") e por isso NÃO é bloqueada — só o eram por engano.
 *  - as URLs com parâmetros de ordenação/filtro são bloqueadas para não gerar
 *    variantes duplicadas da mesma listagem.
 */
import { identifierFromHost, PLATFORM_APEX } from "./_seo.js";

export default function handler(req, res) {
  const host = (req.headers.host || PLATFORM_APEX).split(":")[0];
  const isStore = !!identifierFromHost(host);

  const common = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /painel",
    "Disallow: /adminpainel",
    "Disallow: /adminPainel",
    "Disallow: /login",
    "Disallow: /personalizar",
    "Disallow: /carrinho",
    "Disallow: /checkout",
    "Disallow: /preview",
    "Disallow: /teste-modelos",
    "Disallow: /api/",
    // Variantes da mesma listagem (ordenação, paginação de filtros, QA).
    "Disallow: /*?ordenar=",
    "Disallow: /*?qa=",
  ];

  // Na plataforma, o wizard é público; nas lojas não existe.
  if (!isStore) common.push("Disallow: /modelos");

  const body = [
    ...common,
    "",
    // Rastreadores agressivos: atrasar sem bloquear (não afeta o Google/Bing).
    "User-agent: AhrefsBot",
    "Crawl-delay: 10",
    "",
    "User-agent: SemrushBot",
    "Crawl-delay: 10",
    "",
    `Sitemap: https://${host}/sitemap.xml`,
    "",
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.statusCode = 200;
  res.end(body);
}
