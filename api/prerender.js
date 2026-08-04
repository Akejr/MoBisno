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

import { admin } from "./_shared.js";
import {
  STORE_APEX, PLATFORM_APEX, LANGUAGE, PLATFORM_NAME,
  esc, truncate, slugify, productSlugPath, categorySlug, formatKz, identifierFromHost,
  storeTitle, storeDescription, productTitle, productDescription,
  categoryTitle, categoryDescription,
  metaTags, breadcrumbJsonLd, storeJsonLd, collectionJsonLd, productJsonLd,
  platformJsonLd, faqJsonLd,
  storeHomeHtml, categoryHtml, productHtml, platformHtml, inject,
} from "./_seo.js";

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
const PLATFORM_FAQ = [
  {
    question: "Como crio uma loja online em Angola?",
    answer: "Registe-se na MôBisno, escolha um modelo, adicione os seus produtos e publique. A loja fica online num endereço próprio (nomedaloja.sualoja.digital), sem precisar de conhecimentos técnicos.",
  },
  {
    question: "Que métodos de pagamento posso aceitar?",
    answer: "Multicaixa Express, Referência Bancária e encomendas por WhatsApp. O checkout por WhatsApp está disponível em todos os planos; o Multicaixa Express e a referência bancária a partir do plano Profissional.",
  },
  {
    question: "Quanto custa?",
    answer: "O plano Básico custa 5.000 Kz por mês, o Profissional 11.000 Kz e o Empresarial 25.000 Kz. Todos começam com uma semana de teste grátis.",
  },
  {
    question: "Posso usar o meu próprio domínio?",
    answer: "Sim, a partir do plano Profissional pode ligar um domínio próprio à sua loja.",
  },
];

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
    if (!identifier && path === "/lojas") return send(await renderDirectory(shell, db));

    if (!identifier) return send(renderPlatform(shell, host, path), isKnownPlatformPath(path) ? 200 : 404);
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

    // Conta sem acesso (teste terminou e sem plano) → a loja sai da web.
    if (store.owner_id) {
      const { data: prof } = await db
        .from("profiles").select("is_admin, trial_ends_at, plan_expires_at")
        .eq("id", store.owner_id).maybeSingle();
      const now = Date.now();
      const active = !!prof && (
        prof.is_admin === true ||
        (prof.trial_ends_at && Date.parse(prof.trial_ends_at) > now) ||
        (prof.plan_expires_at && Date.parse(prof.plan_expires_at) > now)
      );
      if (!active) return send(notFoundHtml(shell, "Loja indisponível", canonicalBase), 410, false);
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
        jsonLd: [
          productJsonLd({
            name: product.name, description: product.description, image: product.image_url,
            price: product.price, url, storeName, sku: product.id, category: product.category,
            available: !outOfStock, shipping: shippingOf(custom),
          }),
          breadcrumbJsonLd(crumbs),
        ],
      });
      return send(inject(shell, {
        title, tags, lang: LANGUAGE,
        // `custom` traz `productVariations`: é daqui que sai o texto das
        // Variação no HTML servido sem JavaScript (R4.18).
        bodyHtml: productHtml({ storeName, product, description, logoUrl, base, brand, outOfStock, custom }),
        ssrData,
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
      return send(inject(shell, {
        title, tags, lang: LANGUAGE,
        bodyHtml: categoryHtml({ storeName, category: label, description, logoUrl, products: items, base, brand, custom }),
        ssrData,
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
    return send(inject(shell, {
      title, tags, lang: LANGUAGE,
      bodyHtml: storeHomeHtml({
        storeName, description: storeDesc, logoUrl, products, categories: cats, base, brand,
        // `custom` traz os blocos do editor: é daqui que saem as localizações e
        // os mapas no HTML servido sem JavaScript (R5.10).
        custom,
      }),
      ssrData,
    }));
  } catch (e) {
    console.error("prerender", e);
    return send(shell);
  }
}

/* ------------------------------- Plataforma ------------------------------- */

const PLATFORM_PAGES = {
  "/": {
    title: "MôBisno — Criar Loja Online em Angola | Sites e Lojas Virtuais",
    description: "Crie a sua loja online em Angola em minutos com a MôBisno. Editor visual ao vivo, pagamentos Multicaixa Express e Referência, vendas por WhatsApp, domínio próprio e SEO otimizado.",
    heading: "Crie a sua loja online em minutos",
    intro: "A MôBisno é a plataforma angolana que permite a qualquer empreendedor abrir uma loja online, sem conhecimentos técnicos. Escolha um modelo, adicione os seus produtos e comece a vender em Kwanzas, com entrega em Luanda e em todo o país.",
    sections: [
      { title: "Tudo o que precisa para vender", items: [
        "Editor visual ao vivo — muda cores, textos e imagens e vê o resultado na hora",
        "Pagamento por Multicaixa Express e Referência Bancária",
        "Encomendas por WhatsApp com mensagem pronta",
        "Endereço próprio em nomedaloja.sualoja.digital, ou domínio próprio",
        "SEO otimizado, códigos de desconto, gestão de stock e avaliações",
      ] },
      { title: "Planos", items: [
        "Básico — 5.000 Kz/mês: 1 loja publicada, 100 produtos, checkout por WhatsApp",
        "Profissional — 11.000 Kz/mês: 3 lojas, produtos ilimitados, Multicaixa Express e referência bancária, domínio próprio",
        "Empresarial — 25.000 Kz/mês: lojas ilimitadas, gestor dedicado, integrações à medida",
      ] },
      { title: "Perguntas frequentes", text: PLATFORM_FAQ.map((f) => `${f.question} ${f.answer}`).join(" ") },
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
  // o Google penaliza. A palavra-chave "criar loja online em Angola" é
  // trabalhada na página inicial, cujo título já é exatamente esse.
  "/termos": {
    title: "Termos de Utilização — MôBisno",
    description: "Termos de utilização da plataforma MôBisno: condições de uso, responsabilidades do titular da loja, pagamentos e cancelamento.",
    heading: "Termos de Utilização",
    intro: "Condições que regem a utilização da plataforma MôBisno pelos donos de loja e pelos seus clientes.",
  },
  "/privacidade": {
    title: "Política de Privacidade — MôBisno",
    description: "Como a MôBisno recolhe, usa e protege os dados pessoais dos donos de loja e dos seus clientes em Angola.",
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

function isKnownPlatformPath(path) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_PAGES, path) || path === "/lojas";
}

/** HTML de uma página da plataforma (`mobisno.store`). */
function renderPlatform(shell, host, path) {
  const baseUrl = `https://${PLATFORM_APEX}`;
  const page = PLATFORM_PAGES[path];

  if (!page) {
    // Caminho privado (/painel, /login…) ou inexistente: nunca indexar, e nunca
    // apresentar o canónico da homepage (era isso que criava duplicados).
    const title = `${PLATFORM_NAME}`;
    const tags = metaTags({
      title, description: PLATFORM_PAGES["/"].description,
      canonical: `${baseUrl}${path}`, image: `${baseUrl}/logo-header.png`,
      siteName: PLATFORM_NAME, noindex: true,
    });
    return inject(shell, { title, tags, lang: LANGUAGE });
  }

  const canonical = `${baseUrl}${path === "/" ? "/" : path}`;
  const jsonLd = [...platformJsonLd(baseUrl)];
  if (page.faq) jsonLd.push(faqJsonLd(PLATFORM_FAQ));
  if (path !== "/") {
    jsonLd.push(breadcrumbJsonLd([
      { name: PLATFORM_NAME, url: `${baseUrl}/` },
      { name: page.heading, url: canonical },
    ]));
  }

  const tags = metaTags({
    title: page.title, description: page.description, canonical,
    image: `${baseUrl}/logo-header.png`, type: "website", siteName: PLATFORM_NAME, jsonLd,
  });
  return inject(shell, {
    title: page.title, tags, lang: LANGUAGE,
    bodyHtml: platformHtml({
      heading: page.heading, intro: page.intro,
      sections: page.sections ?? [], links: page.links ?? [],
    }),
  });
}

/**
 * Diretório de lojas (`mobisno.store/lojas`).
 *
 * Cada entrada é uma ligação normal (seguida pelo Google) para o subdomínio da
 * loja. É o que transforma cada loja nova de página órfã em página descoberta.
 */
async function renderDirectory(shell, db) {
  const baseUrl = `https://${PLATFORM_APEX}`;
  const canonical = `${baseUrl}/lojas`;
  let stores = [];
  if (db) {
    const { data } = await db
      .from("stores").select("name, identifier, store_type, state")
      .eq("state", "Publicada").order("created_at", { ascending: false }).limit(500);
    stores = data || [];
  }

  const title = "Lojas Online em Angola — Diretório MôBisno";
  const description = truncate(
    `${stores.length} lojas online angolanas criadas com a MôBisno. Compre em Kwanzas com Multicaixa Express, Referência Bancária ou WhatsApp, com entrega em Luanda e em todo o país.`,
    160,
  );

  const items = stores.map((s) => ({
    name: s.name,
    url: `https://${s.identifier}.${STORE_APEX}/`,
    image: null,
  }));

  const tags = metaTags({
    title, description, canonical,
    image: `${baseUrl}/logo-header.png`, type: "website", siteName: PLATFORM_NAME,
    jsonLd: [
      collectionJsonLd({ name: "Lojas online em Angola", url: canonical, description, items }),
      breadcrumbJsonLd([
        { name: PLATFORM_NAME, url: `${baseUrl}/` },
        { name: "Lojas", url: canonical },
      ]),
    ],
  });

  const list = stores.length
    ? `<ul class="mb-ssr-grid">${stores.map((s) => {
      const url = `https://${esc(s.identifier)}.${STORE_APEX}/`;
      const tipo = s.store_type ? `<span class="p">${esc(s.store_type)}</span>` : "";
      return `<li><a href="${url}"><span class="n">${esc(s.name)}</span>${tipo}</a></li>`;
    }).join("")}</ul>`
    : `<p>Ainda não há lojas publicadas.</p>`;

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
  const addressHtml = address ? `<p><strong>${esc(address)}</strong></p>` : "";
  const actionsHtml = `<nav class="mb-ssr-nav">`
    + `<a href="${platform}/criar">${esc(STORE_NOT_FOUND_PRIMARY_LABEL)}</a>`
    + `<a href="${platform}/lojas">${esc(STORE_NOT_FOUND_SECONDARY_LABEL)}</a>`
    + `</nav>`;
  return inject(shell, {
    title,
    tags,
    lang: LANGUAGE,
    bodyHtml: platformHtml({
      heading,
      intro: STORE_NOT_FOUND_MESSAGE,
      // Ordem igual à da SPA: mensagem, endereço pedido, convite, duas ações.
      extraHtml: `${addressHtml}<p>${esc(STORE_NOT_FOUND_INVITE)}</p>${actionsHtml}`,
    }),
  });
}
