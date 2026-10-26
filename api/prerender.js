/**
 * Pré-renderização (SSR) de todas as páginas públicas.
 *
 * O `vercel.json` encaminha para aqui qualquer pedido que não seja um ficheiro
 * nem `/api/*`. Esta função devolve HTML **com conteúdo real** — títulos,
 * descrições, preços e ligações — em vez do `<div id="app">` vazio.
 *
 * Porquê: o Google só executa o JavaScript de uma página numa segunda passagem,
 * que pode demorar dias e não é garantida para domínios novos; o Bing e os
 * crawlers sociais (WhatsApp, Facebook) não executam JavaScript de todo. Sem
 * conteúdo no HTML, as lojas e os produtos são invisíveis na pesquisa.
 *
 * Cobre:
 *  - lojas em subdomínio (`nomedaloja.sualoja.digital`) — início, produto,
 *    categoria, todos os produtos;
 *  - a plataforma (`mobisno.store`) — landing, diretório de lojas, legais;
 *  - as mesmas páginas de loja servidas em `mobisno.store/loja/<id>`.
 *
 * Regras de indexação:
 *  - loja inexistente/não publicada → 404 + `noindex` (evita soft-404, que faz
 *    o Google indexar centenas de URLs duplicadas da plataforma);
 *  - conta suspensa (teste terminou, sem plano) → 410 + `noindex`;
 *  - carrinho e checkout → `noindex` (páginas transacionais).
 *
 * É defensiva: perante qualquer erro devolve o shell inalterado (nunca 500).
 */

import { admin, storeActive } from "./_shared.js";
import {
  STORE_APEX, PLATFORM_APEX, LANGUAGE, PLATFORM_NAME,
  PLATFORM_SHARE_IMAGE, PLATFORM_SHARE_IMAGE_WIDTH, PLATFORM_SHARE_IMAGE_HEIGHT, PLATFORM_SHARE_IMAGE_TYPE,
  esc, truncate, slugify, productSlugPath, categorySlug, formatKz, identifierFromHost,
  storeTitle, storeDescription, productTitle, productDescription,
  categoryTitle, categoryDescription,
  metaTags, breadcrumbJsonLd, storeJsonLd, collectionJsonLd, productJsonLd,
  platformJsonLd, faqJsonLd,
  platformOrigin, isModelStore, platformFaq, platformPriceLabel, platformComingSoon,
  storeHomeHtml, categoryHtml, productHtml, platformHtml, inject,
} from "./_seo.js";
import { getPaymentProvider } from "./_provider.js";

/** Shell estático em cache por instância (evita um round-trip por pedido). */
let shellCache = null;
let shellCachedAt = 0;
const SHELL_TTL_MS = 5 * 60 * 1000;

/**
 * Caminhos do shell da SPA, por ordem de preferência.
 *
 * `app.html` é o nome usado desde que o `index.html` deixou de existir na raiz
 * do output (ver `scripts/rename-shell.mjs`): enquanto existia, a Vercel servia
 * esse ficheiro em `/` e o rewrite para esta função nunca disparava. O
 * `index.html` fica como alternativa para deployments antigos.
 */
const SHELL_PATHS = ["/app.html", "/index.html"];

async function fetchShell(host) {
  const now = Date.now();
  if (shellCache && now - shellCachedAt < SHELL_TTL_MS) return shellCache;

  let lastError = null;
  for (const path of SHELL_PATHS) {
    try {
      const r = await fetch(`https://${host}${path}`, { headers: { "x-prerender": "1" } });
      if (!r.ok) { lastError = new Error(`${path} devolveu ${r.status}`); continue; }
      const text = await r.text();
      // Validar: sem isto, a página 404 da Vercel passava a servir de shell.
      if (!text || !text.includes("<head>") || !text.includes('id="app"')) {
        lastError = new Error(`${path} não é um shell válido`);
        continue;
      }
      shellCache = text;
      shellCachedAt = now;
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("shell indisponível");
}

/** Rótulos de categoria de uma loja, pela ordem em que aparecem. */
function categoriesOf(products) {
  const seen = [];
  for (const p of products) {
    const c = (p.category ?? "").trim();
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen;
}

/** Taxa de entrega configurada pelo dono (ou null). Nunca inventar portes. */
function shippingOf(custom) {
  const d = custom && custom.delivery;
  if (!d) return null;
  if (d.mode === "perArea") {
    const fees = Object.values(d.fees ?? {}).filter((n) => Number.isFinite(n));
    return fees.length ? { cost: Math.min(...fees) } : null;
  }
  return Number.isFinite(d.flatFee) ? { cost: Number(d.flatFee) } : null;
}

/** Morada da loja para SEO local, a partir dos blocos do editor. */
function addressOf(custom) {
  const block = (custom?.blocks ?? []).find((b) => b && b.type === "location");
  const src = block ?? (custom?.map?.boutiques ?? []).find((b) => b && (b.address || typeof b.lat === "number"));
  if (!src) return null;
  if (!src.address && typeof src.lat !== "number") return null;
  return {
    street: src.address ?? null,
    latitude: typeof src.lat === "number" ? src.lat : null,
    longitude: typeof src.lng === "number" ? src.lng : null,
  };
}

/** Perguntas frequentes da plataforma (respostas verdadeiras sobre o produto). */
/* ---------------------- Modelos verdadeiros (pacote SSR) ---------------------- */

/**
 * Pacote com os MODELOS verdadeiros da loja (`api/_ssr/render.mjs`, gerado por
 * `scripts/build-ssr.mjs` a partir de `web/ssr/entry.ts`).
 *
 * PORQUÊ: durante muito tempo o servidor escrevia uma versão simplificada da
 * loja dentro de `#app` e a SPA substituía-a pelo modelo verdadeiro assim que
 * arrancava — o visitante via primeiro uma página em bruto e depois a loja. Com
 * o pacote, o primeiro ecrã **é** a loja: o HTML é o mesmo que a SPA produziria,
 * e por isso ela adota o DOM que já está no ecrã em vez de o reescrever
 * (`data-ssr` + `web/lib/dom.ts`).
 *
 * Importado uma vez por instância, com `import()` dinâmico: se o ficheiro não
 * existir no deploy (ou tiver um erro), a pré-renderização continua a servir a
 * versão simplificada em vez de responder 500.
 */
let ssrPack = null;
let ssrTentado = false;
async function ssrPackage() {
  if (ssrTentado) return ssrPack;
  ssrTentado = true;
  try {
    ssrPack = await import("./_ssr/render.mjs");
  } catch (e) {
    console.error("prerender: pacote SSR indisponível", e);
    ssrPack = null;
  }
  return ssrPack;
}

/** Página de loja desenhada com o modelo verdadeiro, ou `null` em qualquer falha. */
async function realStorePage(pedido) {
  const pack = await ssrPackage();
  if (!pack || typeof pack.renderStorePage !== "function") return null;
  try {
    return pack.renderStorePage(pedido);
  } catch (e) {
    console.error("prerender: render do modelo falhou", e);
    return null;
  }
}

/** Página inicial da plataforma desenhada com o código verdadeiro, ou `null`. */
async function realLandingPage(pedido) {
  const pack = await ssrPackage();
  if (!pack || typeof pack.renderLandingPage !== "function") return null;
  try {
    return pack.renderLandingPage(pedido);
  } catch (e) {
    console.error("prerender: render da página inicial falhou", e);
    return null;
  }
}

/**
 * O que `inject` precisa para a SPA poder adotar o HTML: a impressão digital
 * (`data-ssr`), as cores e os atributos de `#app`, e as folhas do primeiro ecrã.
 */
function ssrInject(page) {
  if (!page || !page.hash) return {};
  return { appAttrs: ` data-ssr="${page.hash}"${page.appAttrs || ""}`, headHtml: page.headHtml || "" };
}

/** O serviço de pagamentos está ligado? Decide o que os textos públicos prometem. */
function paymentsReady() {
  return getPaymentProvider() !== null;
}

export default async function handler(req, res) {
  const host = (req.headers.host || PLATFORM_APEX).split(":")[0];
  let shell = "";
  try {
    shell = await fetchShell(host);
  } catch (e) {
    // Sem shell não há SPA para servir. Redirecionar seria pior (mudava a URL
    // da loja); devolve-se 503 para a Vercel/CDN não guardar o erro em cache.
    console.error("prerender: shell indisponível", e);
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end("<!doctype html><meta charset=\"utf-8\"><title>Indisponível</title><p>Serviço temporariamente indisponível. Tente novamente dentro de instantes.</p>");
  }

  const send = (html, status = 200, cacheable = true) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cacheable
      ? "public, s-maxage=600, stale-while-revalidate=86400"
      : "public, s-maxage=60, stale-while-revalidate=600");
    res.statusCode = status;
    res.end(html);
  };

  try {
    const path = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";
    const db = admin();

    // A loja pode vir do subdomínio OU do caminho /loja/<id> no domínio principal.
    let identifier = identifierFromHost(host);
    let rest = path;
    let base = ""; // prefixo das ligações internas geradas no SSR
    if (!identifier) {
      const m = path.match(/^\/loja\/([^/]+)(\/.*)?$/);
      if (m) {
        identifier = decodeURIComponent(m[1]);
        rest = m[2] || "/";
        base = `/loja/${encodeURIComponent(identifier)}`;
      }
    }

    // Diretório público de lojas: dá a cada loja uma ligação seguida a partir de
    // um domínio já indexado. Sem isto, cada loja nasce órfã num subdomínio novo
    // sem uma única ligação a apontar-lhe — e não é descoberta nem posicionada.
    if (!identifier && path === "/lojas") return send(await renderDirectory(shell, db, host));

    if (!identifier) return send(await renderPlatform(shell, host, path), isKnownPlatformPath(path) ? 200 : 404);
    if (!db) return send(shell);

    const canonicalBase = `https://${identifier}.${STORE_APEX}`;

    // As colunas extra (`store_type`, `template_id`, `subdomain`, `created_at`)
    // não entram no HTML: são para os dados embutidos que a SPA usa para
    // desenhar sem ir à rede. O `template_id` é o que decide o modelo da loja,
    // por isso sem ele os dados embutidos não serviam para nada.
    const { data: store } = await db
      .from("stores")
      .select("id, name, identifier, state, owner_id, customization, store_type, template_id, subdomain, created_at")
      .eq("identifier", identifier)
      .eq("state", "Publicada")
      .maybeSingle();

    // Loja inexistente ou não publicada → 404 real, nunca o shell da plataforma.
    if (!store) return send(notFoundHtml(shell, "Loja não encontrada", canonicalBase), 404, false);

    // Loja sem subscrição em vigor → sai da web. A subscrição é de cada loja
    // (migração 0025). A data lê-se à parte para não ir nos dados embutidos.
    if (store.owner_id) {
      const [{ data: prof }, { data: plano }] = await Promise.all([
        db.from("profiles").select("is_admin").eq("id", store.owner_id).maybeSingle(),
        db.from("stores").select("plan_expires_at").eq("id", store.id).maybeSingle(),
      ]);
      if (!storeActive(plano, prof)) return send(notFoundHtml(shell, "Loja indisponível", canonicalBase), 410, false);
    }

    const storeName = store.name;
    const custom = (store.customization && typeof store.customization === "object") ? store.customization : {};
    const brand = (custom.colors && custom.colors.primary) || "#F95901";

    // Em paralelo: as três dependem apenas de `store.id`. Os banners não eram
    // lidos aqui — passam a ser, porque a SPA precisa deles para desenhar a
    // partir dos dados embutidos.
    const [{ data: logo }, { data: allProducts }, { data: banners }] = await Promise.all([
      db.from("assets").select("id, store_id, kind, url, format, size_bytes")
        .eq("store_id", store.id).eq("kind", "logo").maybeSingle(),
      db.from("products")
        .select("id, store_id, name, description, category, price, image_url, available, stock, featured, physical, created_at")
        .eq("store_id", store.id).eq("available", true),
      db.from("banners").select("id, store_id, image_url, position, created_at")
        .eq("store_id", store.id).order("position", { ascending: true }),
    ]);
    const logoUrl = logo?.url || null;
    const products = allProducts || [];

    // Dados embutidos no HTML: poupam à SPA três idas ao Supabase (~1s).
    const ssrData = { store, logo: logo || null, banners: banners || [], products };

    // A loja desenhada com o modelo verdadeiro. Quando sai, o HTML servido é o
    // mesmo que a SPA produziria e ela adota-o; quando não sai (pacote em falta,
    // erro no render), fica a versão simplificada — a página continua indexável.
    const real = await realStorePage({ host, path, identifier, rest, rows: ssrData });
    const realDe = (kind) => (real && real.kind === kind ? real : null);

    // Uma loja-modelo é uma demonstração da galeria: o conteúdo é quase igual
    // entre elas e duplicaria as lojas dos clientes nos resultados.
    const modelo = isModelStore(store);

    const seoDesc = custom.seo && custom.seo.description;
    const storeDesc = storeDescription(storeName, seoDesc);
    const cats = categoriesOf(products);
    const prices = products.map((p) => Number(p.price)).filter((n) => Number.isFinite(n));
    const priceRange = prices.length ? `${formatKz(Math.min(...prices))} – ${formatKz(Math.max(...prices))}` : null;

    /* ------------------------------- Produto ------------------------------- */
    const prodMatch = rest.match(/^\/produto\/(.+)$/);
    if (prodMatch) {
      const wanted = decodeURIComponent(prodMatch[1]).replace(/^\/+|\/+$/g, "").toLowerCase();
      const product = products.find((p) => productSlugPath(p).toLowerCase() === wanted);
      if (!product) return send(notFoundHtml(shell, "Produto não encontrado", canonicalBase), 404, false);

      const url = `${canonicalBase}/produto/${productSlugPath(product)}`;
      const description = productDescription({
        name: product.name, description: product.description,
        priceLabel: formatKz(product.price), storeName,
      });
      const title = productTitle(product.name, storeName);
      const outOfStock = product.stock === 0;

      const crumbs = [{ name: storeName, url: `${canonicalBase}/` }];
      if (product.category) {
        crumbs.push({ name: product.category, url: `${canonicalBase}/categoria/${categorySlug(product.category)}` });
      }
      crumbs.push({ name: product.name, url });

      const tags = metaTags({
        title, description, canonical: url,
        image: product.image_url || logoUrl,
        type: "product", siteName: storeName,
        noindex: modelo, follow: true,
        jsonLd: [
          productJsonLd({
            name: product.name, description: product.description, image: product.image_url,
            price: product.price, url, storeName, sku: product.id, category: product.category,
            available: !outOfStock, shipping: shippingOf(custom),
          }),
          breadcrumbJsonLd(crumbs),
        ],
      });
      const page = realDe("product");
      return send(inject(shell, {
        title, tags, lang: LANGUAGE,
        // `custom` traz `productVariations`: é daqui que sai o texto das
        // Variação no HTML servido sem JavaScript (R4.18).
        bodyHtml: page ? page.html : productHtml({ storeName, product, description, logoUrl, base, brand, outOfStock, custom }),
        ssrData,
        ...ssrInject(page),
      }));
    }

    /* ------------------------------ Categoria ------------------------------ */
    const catMatch = rest.match(/^\/categoria\/(.+)$/);
    if (catMatch) {
      const wanted = slugify(decodeURIComponent(catMatch[1]));
      const isAll = wanted === "produtos" || wanted === "todos";
      const label = isAll ? "Produtos" : cats.find((c) => categorySlug(c) === wanted);
      if (!label) return send(notFoundHtml(shell, "Categoria não encontrada", canonicalBase), 404, false);

      const items = isAll ? products : products.filter((p) => (p.category ?? "") === label);
      const url = `${canonicalBase}/categoria/${categorySlug(label)}`;
      const itemPrices = items.map((p) => Number(p.price)).filter((n) => Number.isFinite(n));
      const description = categoryDescription({
        category: label, storeName, count: items.length,
        sampleNames: items.slice(0, 3).map((p) => p.name),
        priceFrom: itemPrices.length ? formatKz(Math.min(...itemPrices)) : null,
      });
      const title = categoryTitle(label, storeName);

      const tags = metaTags({
        title, description, canonical: url,
        image: (items.find((p) => p.image_url) || {}).image_url || logoUrl,
        type: "website", siteName: storeName,
        // Uma listagem vazia não tem nada para posicionar.
        noindex: modelo || items.length === 0, follow: true,
        jsonLd: [
          collectionJsonLd({
            name: label, url, description,
            items: items.map((p) => ({
              name: p.name, url: `${canonicalBase}/produto/${productSlugPath(p)}`, image: p.image_url || null,
            })),
          }),
          breadcrumbJsonLd([
            { name: storeName, url: `${canonicalBase}/` },
            { name: label, url },
          ]),
        ],
      });
      const page = realDe("category");
      return send(inject(shell, {
        title, tags, lang: LANGUAGE,
        bodyHtml: page ? page.html : categoryHtml({ storeName, category: label, description, logoUrl, products: items, base, brand, custom }),
        ssrData,
        ...ssrInject(page),
      }));
    }

    /* ------------------ Páginas transacionais → não indexar ------------------ */
    if (rest === "/carrinho" || rest === "/checkout") {
      const title = `${rest === "/carrinho" ? "Carrinho" : "Finalizar compra"} — ${storeName}`;
      const tags = metaTags({
        title, description: storeDesc, canonical: `${canonicalBase}${rest}`,
        image: logoUrl, siteName: storeName, noindex: true,
      });
      return send(inject(shell, { title, tags, lang: LANGUAGE }), 200, false);
    }

    /* ---------------------------- Início da loja ---------------------------- */
    const seoTitle = custom.seo && custom.seo.title;
    const title = seoTitle && String(seoTitle).trim() ? String(seoTitle).trim() : storeTitle(storeName);
    const tags = metaTags({
      title, description: storeDesc, canonical: `${canonicalBase}/`,
      image: logoUrl, type: "website", siteName: storeName,
      noindex: modelo, follow: true,
      jsonLd: [
        storeJsonLd({
          storeName, url: canonicalBase, logoUrl, description: seoDesc,
          address: addressOf(custom),
          telephone: (custom.whatsapp && custom.whatsapp.phone) || null,
          priceRange,
        }),
        collectionJsonLd({
          name: storeName, url: `${canonicalBase}/`, description: storeDesc,
          items: products.map((p) => ({
            name: p.name, url: `${canonicalBase}/produto/${productSlugPath(p)}`, image: p.image_url || null,
          })),
        }),
      ],
    });
    const homePage = realDe("home");
    return send(inject(shell, {
      title, tags, lang: LANGUAGE,
      bodyHtml: homePage ? homePage.html : storeHomeHtml({
        storeName, description: storeDesc, logoUrl, products, categories: cats, base, brand,
        // `custom` traz os blocos do editor: é daqui que saem as localizações e
        // os mapas no HTML servido sem JavaScript (R5.10).
        custom,
      }),
      ssrData,
      ...ssrInject(homePage),
    }));
  } catch (e) {
    console.error("prerender", e);
    return send(shell);
  }
}

/* ------------------------------- Plataforma ------------------------------- */

/**
 * Páginas da plataforma servidas pela pré-renderização.
 *
 * É uma **função** e não uma constante porque o texto depende de factos que
 * mudam: o preço (`PLAN_PRICE_KZ`), o que está «Em breve» e se o serviço de
 * pagamentos já está ligado. Enquanto foi uma constante escrita à mão, estas
 * páginas anunciaram ao Google «11.000 Kz por mês, ou 120.000 Kz por ano» e
 * «domínio próprio incluído» — um preço que já não existia e uma funcionalidade
 * que o Dono não conseguia ligar.
 *
 * As perguntas frequentes vêm de `platformFaq`, a mesma lista que a página
 * inicial mostra: o Google só aceita `FAQPage` quando as perguntas estão
 * visíveis na página.
 */
function platformPages() {
  const pronto = paymentsReady();
  const faq = platformFaq(pronto);
  const breve = platformComingSoon(pronto);
  const preco = platformPriceLabel();
  const pagamentos = pronto
    ? "Pagamento por Multicaixa Express e Referência Bancária, para empresas registadas depois de aprovadas pela MôBisno"
    : "Multicaixa Express e Referência Bancária em breve, para empresas registadas depois de aprovadas pela MôBisno";
  return {
    "/": {
      title: "MôBisno — Criar Loja Online em Angola | Sites e Lojas Virtuais",
      description: `Crie a sua loja online em Angola em minutos com a MôBisno. Editor visual ao vivo, encomendas por WhatsApp, endereço próprio e SEO otimizado. ${preco} por loja, com produtos ilimitados.`,
      heading: "Crie a sua loja online em minutos",
      intro: "A MôBisno é a plataforma angolana que permite a qualquer empreendedor abrir uma loja online, sem conhecimentos técnicos. Escolha um modelo pronto, personalize os textos, as fotografias e as cores, adicione os seus produtos e comece a vender em Kwanzas, com entrega em Luanda e em todo o país.",
      sections: [
        { title: "Tudo o que o WhatsApp não faz sozinho", items: [
          "Editor visual ao vivo: muda cores, textos e imagens e vê o resultado na hora",
          "Encomendas por WhatsApp com mensagem pronta, em todas as lojas",
          pagamentos,
          `Endereço próprio em nomedaloja.${STORE_APEX}`,
          "SEO otimizado, códigos de desconto, gestão de stock, variações e avaliações",
        ] },
        { title: "Preço", items: [
          `${preco} por loja, com tudo incluído`,
          "Cada loja tem a sua subscrição: quem tem duas lojas online paga duas",
          "Produtos ilimitados e sem escalões",
          "Criar a loja, personalizá-la e vê-la é grátis; a subscrição serve para a publicar",
          ...(breve.length ? [`Em breve, ainda não incluído: ${breve.join(", ")}`] : []),
        ] },
        { title: "Perguntas frequentes", text: faq.map((f) => `${f.question} ${f.answer}`).join(" ") },
      ],
      links: [
        { href: "/lojas", label: "Lojas criadas na MôBisno" },
        { href: "/termos", label: "Termos" },
        { href: "/privacidade", label: "Privacidade" },
      ],
      faq: true,
    },
    // NOTA: `/criar` não está aqui de propósito. É o assistente de criação (um
    // ecrã da aplicação), e a SPA marca-o `noindex`. Servir texto de marketing ao
    // rastreador e o formulário ao utilizador seria divergência de conteúdo, que
    // o Google penaliza. A palavra-chave «criar loja online em Angola» é
    // trabalhada na página inicial, cujo título já é exatamente esse.
    "/termos": {
      title: "Termos de Utilização — MôBisno",
      description: "Termos de utilização da plataforma MôBisno: condições de uso, responsabilidades do titular da loja, subscrição, vendas e cancelamento.",
      heading: "Termos de Utilização",
      intro: "Condições que regem a utilização da plataforma MôBisno pelos donos de loja e pelos seus clientes.",
    },
    "/privacidade": {
      title: "Política de Privacidade — MôBisno",
      description: "Como a MôBisno recolhe, usa e protege os dados pessoais dos donos de loja, os dados da empresa enviados para a verificação e os dados dos clientes das lojas.",
      heading: "Política de Privacidade",
      intro: "Como tratamos os dados pessoais recolhidos na plataforma e nas lojas criadas com a MôBisno.",
    },
    "/politica": {
      title: "Políticas da Plataforma — MôBisno",
      description: "Políticas gerais da MôBisno: utilização aceitável, conteúdos proibidos, reembolsos e suspensão de contas.",
      heading: "Políticas da Plataforma",
      intro: "Regras de utilização aceitável, conteúdos proibidos e condições de suspensão.",
    },
  };
}

/**
 * Caminhos da aplicação que existem mas não são para indexar: painel, login,
 * assistente, editor, administração e pré-visualização privada.
 *
 * Existem para o estado da resposta ser honesto. Sem isto devolviam **404**,
 * porque só as páginas públicas estavam na lista — o dono abria a
 * pré-visualização da sua loja e recebia um «não encontrado» com a página lá
 * dentro. O `noindex` continua a ser posto por `renderPlatform`, por isso não
 * há risco de passarem a ser indexadas.
 */
const PLATFORM_APP_PREFIXES = [
  "/login", "/criar", "/painel", "/personalizar", "/adminpainel",
  "/previsualizar", "/modelos", "/teste-modelos", "/preview",
  // `/start` é o ensaio do hero novo: existe (responde 200) e não é para
  // indexar, porque repete a proposta da homepage.
  "/start",
];

function isKnownPlatformPath(path) {
  if (Object.prototype.hasOwnProperty.call(platformPages(), path) || path === "/lojas") return true;
  const p = path.toLowerCase();
  return PLATFORM_APP_PREFIXES.some((prefixo) => p === prefixo || p.startsWith(`${prefixo}/`));
}

/**
 * Campos de imagem de `metaTags` para as páginas da plataforma.
 *
 * Numa função só porque as três páginas da plataforma têm de partilhar a MESMA
 * arte: quando era escrita à mão em cada chamada, mudá-la significava lembrar-se
 * de três sítios. As páginas de loja e de produto não passam por aqui — usam o
 * logótipo do dono e a fotografia do produto.
 */
function platformShareImage(baseUrl) {
  return {
    image: `${baseUrl}${PLATFORM_SHARE_IMAGE}`,
    imageWidth: PLATFORM_SHARE_IMAGE_WIDTH,
    imageHeight: PLATFORM_SHARE_IMAGE_HEIGHT,
    imageType: PLATFORM_SHARE_IMAGE_TYPE,
  };
}

/** HTML de uma página da plataforma (`mobisno.store`). */
async function renderPlatform(shell, host, path) {
  // A origem é a do pedido quando ele vem da família do apex: o canónico e o
  // `og:url` deixam de apontar para um URL que redireciona (apex → www.).
  const baseUrl = platformOrigin(host);
  const pages = platformPages();
  const page = pages[path];

  if (!page) {
    // Caminho privado (/painel, /login…) ou inexistente: nunca indexar, e nunca
    // apresentar o canónico da homepage (era isso que criava duplicados).
    const title = `${PLATFORM_NAME}`;
    const tags = metaTags({
      title, description: pages["/"].description,
      canonical: `${baseUrl}${path}`, ...platformShareImage(baseUrl),
      siteName: PLATFORM_NAME, noindex: true,
    });
    return inject(shell, { title, tags, lang: LANGUAGE });
  }

  const canonical = `${baseUrl}${path === "/" ? "/" : path}`;
  const jsonLd = [...platformJsonLd(baseUrl)];
  if (page.faq) jsonLd.push(faqJsonLd(platformFaq(paymentsReady())));
  if (path !== "/") {
    jsonLd.push(breadcrumbJsonLd([
      { name: PLATFORM_NAME, url: `${baseUrl}/` },
      { name: page.heading, url: canonical },
    ]));
  }

  const tags = metaTags({
    title: page.title, description: page.description, canonical,
    ...platformShareImage(baseUrl), type: "website", siteName: PLATFORM_NAME, jsonLd,
  });
  // A página inicial sai com o código verdadeiro da landing (o mesmo que a SPA
  // desenha), para a SPA a poder adotar. As outras páginas da plataforma são
  // texto: a versão simplificada serve-as bem.
  const real = path === "/" ? await realLandingPage({ host, path }) : null;
  return inject(shell, {
    title: page.title, tags, lang: LANGUAGE,
    bodyHtml: real ? real.html : platformHtml({
      heading: page.heading, intro: page.intro,
      sections: page.sections ?? [], links: page.links ?? [], host,
    }),
    ...ssrInject(real),
  });
}

/**
 * Diretório de lojas (`mobisno.store/lojas`).
 *
 * Cada entrada é uma ligação normal (seguida pelo Google) para o subdomínio da
 * loja. É o que transforma cada loja nova de página órfã em página descoberta.
 */
async function renderDirectory(shell, db, host) {
  const baseUrl = platformOrigin(host);
  const canonical = `${baseUrl}/lojas`;
  let stores = [];
  if (db) {
    // `tpl` é `customization.__template`, extraído na consulta: presente ⇒
    // Loja_Modelo. As demonstrações dos modelos ficam **fora** do diretório —
    // são conteúdo fino e quase duplicado entre si, e diluíam a página que
    // existe para dar autoridade às lojas dos clientes (`SEO.md` §7.2). Extrair
    // só a chave evita trazer a Personalização inteira de até 500 lojas.
    const { data } = await db
      .from("stores").select("name, identifier, store_type, state, tpl:customization->__template")
      .eq("state", "Publicada").order("created_at", { ascending: false }).limit(500);
    stores = (data || []).filter((s) => s.tpl === undefined || s.tpl === null || s.tpl === false);
  }

  // Lojas feitas com a MôBisno que têm **domínio próprio**, por isso não estão em
  // `stores`. Espelho manual de `FEATURED_STORES` em `web/views/directory.ts`:
  // `api/` não pode importar de `web/` (a mesma parede de `api/_seo.js` —
  // `SEO.md` §5.2). Ao acrescentar uma loja lá, acrescentar aqui: sem isto, quem
  // rastreia a página sem JavaScript não vê a ligação, que é metade da razão de a
  // página existir.
  const featured = [
    { name: "DOT Angola", type: "Gift cards e subscrições", host: "www.dotangola.com", url: "https://www.dotangola.com/" },
  ];

  // Ordem da vitrina, espelho de `PRIORITY_HOSTS` em `web/views/directory.ts`. A
  // primeira entrada é a loja que a página põe à frente; aqui, sem JavaScript, é a
  // primeira da grelha e a primeira do `ItemList` que o Google lê.
  const PRIORITY_HOSTS = [`juddycosmetics.${STORE_APEX}`, "www.dotangola.com"];
  const rank = (host) => {
    const i = PRIORITY_HOSTS.indexOf(host);
    return i === -1 ? PRIORITY_HOSTS.length : i;
  };

  const all = [
    ...stores.map((s) => ({
      name: s.name,
      type: s.store_type,
      host: `${s.identifier}.${STORE_APEX}`,
      url: `https://${s.identifier}.${STORE_APEX}/`,
    })),
    ...featured,
  ].sort((a, b) => rank(a.host) - rank(b.host));
  const total = all.length;

  const title = "Lojas Online em Angola — Diretório MôBisno";
  const description = truncate(
    `${total} lojas online angolanas criadas com a MôBisno. Compre em Kwanzas com Multicaixa Express, Referência Bancária ou WhatsApp, com entrega em Luanda e em todo o país.`,
    160,
  );

  const items = all.map((s) => ({ name: s.name, url: s.url, image: null }));

  const tags = metaTags({
    title, description, canonical,
    ...platformShareImage(baseUrl), type: "website", siteName: PLATFORM_NAME,
    jsonLd: [
      collectionJsonLd({ name: "Lojas online em Angola", url: canonical, description, items }),
      breadcrumbJsonLd([
        { name: PLATFORM_NAME, url: `${baseUrl}/` },
        { name: "Lojas", url: canonical },
      ]),
    ],
  });

  const cardHtml = (name, type, url) => {
    const tipo = type ? `<span class="block text-sm text-gray-500 mt-1">${esc(type)}</span>` : "";
    return `<li><a href="${esc(url)}" class="block rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-lg hover:-translate-y-1 transition-all"><span class="block font-bold text-gray-900">${esc(name)}</span>${tipo}</a></li>`;
  };

  const list = total
    ? `<section class="w-full border-t border-gray-100 py-14"><div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
        <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${
          all.map((s) => cardHtml(s.name, s.type, s.url)).join("")
        }</ul>
      </div></section>`
    : `<section class="w-full border-t border-gray-100 py-14"><div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop text-center"><p class="text-gray-600">Ainda não há lojas publicadas.</p></div></section>`;

  const body = platformHtml({
    heading: "Lojas online em Angola",
    intro: description,
    links: [{ href: "/criar", label: "Criar a minha loja" }],
    extraHtml: list,
  });

  return inject(shell, { title, tags, lang: LANGUAGE, bodyHtml: body });
}

/* ------------------------ Loja não encontrada (R10) ------------------------ */

/**
 * Texto da Pagina_Loja_Nao_Encontrada servida sem JavaScript.
 *
 * É a **paridade** exigida pelo R10.7: um visitante sem JavaScript tem de ler a
 * mesma mensagem e o mesmo convite que a SPA mostra. A fonte do texto é
 * `web/templates/notFound.ts` — **ao alterar os literais lá, alterar aqui**
 * (`SEO.md` §5.2, o mesmo princípio de `api/_seo.js` vs `src/services/`).
 */
const STORE_NOT_FOUND_MESSAGE = "Não encontrámos nenhuma loja publicada neste endereço.";
const STORE_NOT_FOUND_INVITE = "Aproveite para criar a sua: escolha um modelo pronto, personalize os textos, as fotografias e as cores, e comece a vender online em Angola.";
const STORE_NOT_FOUND_PRIMARY_LABEL = "Criar a minha loja";
const STORE_NOT_FOUND_SECONDARY_LABEL = "Ver lojas criadas na MôBisno";

/**
 * Página 404/410: `noindex` para não poluir o índice, e um convite a criar loja
 * em vez de um beco sem saída.
 *
 * As duas ações são **absolutas para o apex da plataforma**, porque `/criar` e
 * `/lojas` vivem em `mobisno.store` e esta página é servida sobretudo no
 * subdomínio de uma loja — é o equivalente servidor do `platformHomeUrl()` que
 * a SPA usa. Caminhos reais, nunca um fragmento `#` (`SEO.md` §5.1).
 *
 * O endereço pedido sai do canónico (o endereço da loja procurada), o que
 * dispensa passar `host`/`path` a cada um dos quatro pontos de chamada.
 */
function notFoundHtml(shell, heading, canonical) {
  const title = `${heading} — ${PLATFORM_NAME}`;
  const platform = `https://${PLATFORM_APEX}`;
  const address = String(canonical || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const tags = metaTags({
    title,
    description: "",
    canonical,
    siteName: PLATFORM_NAME,
    noindex: true,
  });
  const addressHtml = address
    ? `<p class="text-gray-900 font-bold break-all">${esc(address)}</p>`
    : "";
  const actionsHtml = `<div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">`
    + `<a href="${platform}/criar" class="inline-flex items-center justify-center text-white font-semibold px-8 py-3 rounded-lg transition-colors" style="background:#F95901">${esc(STORE_NOT_FOUND_PRIMARY_LABEL)}</a>`
    + `<a href="${platform}/lojas" class="inline-flex items-center justify-center border border-gray-300 text-gray-800 font-semibold px-8 py-3 rounded-lg hover:bg-gray-50 transition-colors">${esc(STORE_NOT_FOUND_SECONDARY_LABEL)}</a>`
    + `</div>`;
  return inject(shell, {
    title,
    tags,
    lang: LANGUAGE,
    bodyHtml: platformHtml({
      heading,
      intro: STORE_NOT_FOUND_MESSAGE,
      // Ordem igual à da SPA: mensagem, endereço pedido, convite, duas ações.
      extraHtml: `<section class="w-full py-4"><div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop text-center">
        ${addressHtml}<p class="text-gray-600 mt-2">${esc(STORE_NOT_FOUND_INVITE)}</p>${actionsHtml}
      </div></section>`,
    }),
  });
}
