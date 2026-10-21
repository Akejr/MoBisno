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
 *
 * Desde que o servidor desenha as lojas e a página inicial com os modelos
 * verdadeiros (`api/_ssr/render.mjs`, ver `api/prerender.js`), o conteúdo
 * `.mb-ssr` deste módulo é a **alternativa**: só sai quando o pacote não carrega,
 * lança ou não consegue desenhar a página.
 */

import { PLAN_PRICE_KZ, PLAN_PERIOD_MS, PLATFORM_FEE_RATE } from "./_shared.js";

export const STORE_APEX = "sualoja.digital";
export const PLATFORM_APEX = "mobisno.store";
export const STORE_APEXES = [STORE_APEX, PLATFORM_APEX];
export const CURRENCY = "AOA";
export const LOCALE = "pt_AO";
export const LANGUAGE = "pt-AO";
export const COUNTRY = "Angola";
export const PLATFORM_NAME = "MôBisno";
/** Cor da plataforma. As páginas da plataforma usam-na; as lojas usam a sua. */
const ACCENT_KZ = "#F95901";

/**
 * Arte de partilha das páginas da PLATAFORMA. Espelha `src/services/seo.ts`,
 * que é a FONTE DE VERDADE — ao mudar lá, mudar aqui.
 *
 * É aqui que interessa: o WhatsApp e o Facebook não executam JavaScript, leem
 * este HTML. A versão leve existe porque acima de poucas centenas de kB o
 * WhatsApp desiste da imagem e o cartão sai sem ela (`scripts/share-image.mjs`).
 *
 * Só as páginas da plataforma. As de LOJA usam o logótipo do dono e as de
 * PRODUTO a fotografia do produto — partilhar a nossa arte no lugar delas seria
 * o mesmo defeito ao contrário.
 */
export const PLATFORM_SHARE_IMAGE = "/images/share.jpg";
export const PLATFORM_SHARE_IMAGE_WIDTH = 1200;
export const PLATFORM_SHARE_IMAGE_HEIGHT = 1200;
export const PLATFORM_SHARE_IMAGE_TYPE = "image/jpeg";

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

/* --------------------------------- Origens -------------------------------- */

/** Host do pedido, normalizado: minúsculas, sem porta e sem ponto final. */
export function normalizeHost(host) {
  return (String(host ?? "").trim().toLowerCase().split(":")[0] ?? "").replace(/\.$/, "");
}

/**
 * Origem das páginas da PLATAFORMA para este pedido. Espelha
 * `src/services/seo.ts:platformOriginForHost`.
 *
 * `mobisno.store` redireciona (308) para `www.mobisno.store` na Vercel, e os
 * canónicos, o `og:url`, o sitemap e a linha `Sitemap:` do robots apontavam para
 * o apex — um redirecionamento em cada URL que o Google recebia. A origem passa
 * a ser a do pedido, mas só dentro da família do apex (o apex ou `www.`):
 * qualquer outro host (pré-visualização da Vercel, `Host` forjado, subdomínio de
 * loja) dá o apex.
 */
export function platformOrigin(host) {
  const h = normalizeHost(host);
  return h === PLATFORM_APEX || h === `www.${PLATFORM_APEX}` ? `https://${h}` : `https://${PLATFORM_APEX}`;
}

/** O mesmo para o domínio das lojas (`sualoja.digital` ou `www.sualoja.digital`). */
export function storeApexOrigin(host) {
  const h = normalizeHost(host);
  return h === STORE_APEX || h === `www.${STORE_APEX}` ? `https://${h}` : `https://${STORE_APEX}`;
}

/** O host é o apex (ou `www.`) do domínio das lojas? */
export function isStoreApexHost(host) {
  const h = normalizeHost(host);
  return h === STORE_APEX || h === `www.${STORE_APEX}`;
}

/* -------------------------------- Indexação -------------------------------- */

/** Espelha `src/services/seo.ts:ROBOTS_INDEX`. */
export const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1";

/**
 * Espelha `src/services/seo.ts:robotsContent`. `follow` só conta com `noindex`:
 * as lojas-modelo saem com `noindex, follow`.
 */
export function robotsContent({ noindex, follow } = {}) {
  if (!noindex) return ROBOTS_INDEX;
  return follow ? "noindex, follow" : "noindex, nofollow";
}

/** Espelha `MODEL_STORE_PREFIX` de `src/services/domains.ts`. */
export const MODEL_STORE_PREFIX = "modelo-";

/** Espelha `src/services/domains.ts:isModelIdentifier`. */
export function isModelIdentifier(identifier) {
  return typeof identifier === "string" && identifier.toLowerCase().startsWith(MODEL_STORE_PREFIX);
}

/**
 * Espelha `src/services/seo.ts:isModelStore`: identificador `modelo-…` ou a marca
 * `customization.__template`. As lojas-modelo saem com `noindex, follow` e ficam
 * fora dos sitemaps e do diretório `/lojas`.
 *
 * Nas consultas que extraem só `tpl:customization->__template`, passar
 * `{ identifier, customization: { __template: tpl } }`.
 */
export function isModelStore(store) {
  if (!store) return false;
  if (isModelIdentifier(store.identifier)) return true;
  const c = store.customization;
  const tpl = c && typeof c === "object" && !Array.isArray(c) ? c.__template : undefined;
  return !(tpl === undefined || tpl === null || tpl === false);
}

/* --------------------------- Factos de uma loja --------------------------- */

/**
 * Espelha `shippingFromCustom` de `web/lib/seo.ts`: a taxa de entrega que o Dono
 * configurou, ou `null`. Nunca inventar portes.
 */
export function shippingFromCustom(custom) {
  const d = custom && custom.delivery;
  if (!d) return null;
  if (d.mode === "perArea") {
    const fees = Object.values(d.fees ?? {}).filter((n) => Number.isFinite(n));
    return fees.length ? { cost: Math.min(...fees) } : null;
  }
  return Number.isFinite(d.flatFee) ? { cost: Number(d.flatFee) } : null;
}

/** Rótulo dos destacados no menu (`FEATURED_LABEL` de `web/templates/sectionsModel.ts`). */
const FEATURED_LABEL = "Destaques";

/**
 * O que é verdade nesta loja, para as descrições geradas. Espelha
 * `storeSeoFacts` de `web/views/storeHtml.ts`, a partir das LINHAS:
 *
 *  - só contam os produtos com `available === true`, como em
 *    `storefrontFromRows` (`web/ssr/storefrontRows.ts`);
 *  - `categories`: as categorias dos produtos, pela ordem em que aparecem e sem
 *    «Destaques» (o mesmo que `headerCategories(view)` sem esse rótulo);
 *  - `delivery`: o Dono configurou taxas de entrega;
 *  - `digitalPayments`: decidido por quem chama. No servidor é
 *    `store.digital_payments === true` **e** `getPaymentProvider() !== null`
 *    (`api/_provider.js`) — a mesma regra de `digitalPaymentsVisible` no
 *    navegador.
 */
export function storeSeoFactsOf({ products, custom, digitalPayments } = {}) {
  const list = Array.isArray(products) ? products.filter((p) => p && p.available === true) : [];
  const categories = [];
  for (const p of list) {
    const c = p.category;
    if (c && !categories.includes(c)) categories.push(c);
  }
  return {
    categories: categories.filter((c) => c !== FEATURED_LABEL),
    productNames: list.map((p) => p.name),
    delivery: shippingFromCustom(custom) !== null,
    digitalPayments: digitalPayments === true,
  };
}

/** Junta uma lista em português: «a», «a e b», «a, b e c». */
function joinPt(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Até três exemplos, com «e mais» quando há mais. */
function examplesPt(items) {
  const clean = (items || []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (clean.length > 3) return `${clean.slice(0, 3).join(", ")} e mais`;
  return joinPt(clean);
}

/**
 * Espelha `src/services/seo.ts:howToBuy` — como se compra nesta loja, só o que é
 * verdade. O WhatsApp existe em todas as lojas; o resto depende de `facts`.
 */
export function howToBuy(facts) {
  const pay = facts && facts.digitalPayments
    ? "Encomendas por WhatsApp e pagamento por Multicaixa Express ou Referência Bancária"
    : "Encomendas por WhatsApp";
  return `${pay}${facts && facts.delivery ? ", com entrega" : ""}.`;
}

/* --------------------------- Títulos e descrições -------------------------- */

export function storeTitle(storeName) {
  return `${String(storeName).trim()} | Compras em Angola`;
}

/** Espelha `src/services/seo.ts:storeDescription`. */
export function storeDescription(storeName, custom, facts) {
  if (custom && String(custom).trim()) return truncate(String(custom).trim(), 160);
  const what = examplesPt(facts && facts.categories && facts.categories.length ? facts.categories : ((facts && facts.productNames) || []));
  return truncate(`Compre online na ${String(storeName).trim()}, em Angola${what ? `: ${what}` : ""}. ${howToBuy(facts)}`, 160);
}

export function productTitle(productName, storeName) {
  return `${String(productName).trim()} — ${String(storeName).trim()}`;
}

/** Espelha `src/services/seo.ts:productDescription`. */
export function productDescription({ name, description, priceLabel, storeName, facts }) {
  const desc = String(description ?? "").trim();
  if (desc) return truncate(desc, 160);
  const price = priceLabel ? ` por ${priceLabel}` : "";
  return truncate(`Compre ${String(name).trim()}${price} na ${String(storeName).trim()}, em Angola. ${howToBuy(facts)}`, 160);
}

export function categoryTitle(category, storeName) {
  return `${String(category).trim()} — ${String(storeName).trim()} | Comprar em Angola`;
}

/** Espelha `src/services/seo.ts:categoryDescription`. */
export function categoryDescription({ category, storeName, count, sampleNames, priceFrom, facts }) {
  const cat = String(category).trim();
  const store = String(storeName).trim();
  const n = count ?? 0;
  const quantos = n > 0 ? `${n} ${n === 1 ? "produto" : "produtos"} de ${cat}` : cat;
  const exemplos = sampleNames && sampleNames.length ? ` ${sampleNames.slice(0, 3).join(", ")} e mais.` : "";
  const desde = priceFrom ? ` Desde ${priceFrom}.` : "";
  return truncate(`${quantos} na ${store}.${desde}${exemplos} ${howToBuy(facts)}`, 160);
}

/* ------------------------------- Plataforma ------------------------------- */

/** Dias de um período pago, a partir de `PLAN_PERIOD_MS` de `api/_shared.js`. */
const PLAN_PERIOD_DAYS = Math.round(PLAN_PERIOD_MS / (24 * 3600 * 1000));

/** Espelha `src/services/seo.ts:kzWhole` — «10.000 Kz», sem cêntimos. */
export function kzWhole(value) {
  return formatKz(value).replace(/,00 Kz$/, " Kz");
}

/** Espelha `src/services/seo.ts:planPeriodLabel` — «/mês» (30 dias). */
export function planPeriodLabel() {
  return PLAN_PERIOD_DAYS === 30 ? "/mês" : ` por ${PLAN_PERIOD_DAYS} dias`;
}

/**
 * Espelha `src/services/seo.ts:platformPriceLabel` — «10.000 Kz/mês». O preço é
 * `PLAN_PRICE_KZ` de `api/_shared.js`, o mesmo que o servidor cobra; nunca
 * escrito à mão num texto.
 */
export function platformPriceLabel() {
  return `${kzWhole(PLAN_PRICE_KZ)}${planPeriodLabel()}`;
}

/** Espelha `src/services/seo.ts:platformTitle`. */
export function platformTitle() {
  return "MôBisno — Criar Loja Online em Angola | Sites e Lojas Virtuais";
}

/**
 * Espelha `src/services/seo.ts:platformDescription`: um plano, tudo incluído,
 * WhatsApp em todas as lojas. Nada do que está «Em breve».
 */
export function platformDescription() {
  return truncate(
    `Crie a sua loja online em Angola: modelos prontos, editor visual e encomendas por WhatsApp. Lojas e produtos ilimitados por ${platformPriceLabel()}, tudo incluído.`,
    160,
  );
}

/**
 * Espelha `comingSoonList()` de `src/services/comingSoon.ts`: os nomes das
 * funcionalidades «Em breve», pela mesma ordem. Ao ligar uma lá (bandeira a
 * `false`), tirá-la daqui — `tests/seoInfra.test.ts` compara as duas listas.
 */
export const COMING_SOON_LIST = [
  "SMS de confirmação de compra",
  "Domínio próprio",
  "Marketing e pixels (Meta Pixel e Google Analytics)",
];

/** Espelha `src/services/seo.ts:DIGITAL_PAYMENTS_LABEL`. */
export const DIGITAL_PAYMENTS_LABEL = "Multicaixa Express e Referência Bancária";

/**
 * Espelha `src/services/seo.ts:digitalPaymentsNote`. No servidor,
 * `paymentsReady` é `getPaymentProvider() !== null` (`api/_provider.js`): sem
 * fornecedor ligado, os pagamentos digitais são «em breve» e nunca aparecem
 * como disponíveis.
 */
export function digitalPaymentsNote(paymentsReady) {
  return paymentsReady === true
    ? `${DIGITAL_PAYMENTS_LABEL} para empresas registadas, depois de a MôBisno aprovar os documentos da empresa.`
    : `${DIGITAL_PAYMENTS_LABEL} em breve, para empresas registadas, depois de a MôBisno aprovar os documentos da empresa.`;
}

/** Espelha `src/services/seo.ts:platformComingSoon`. */
export function platformComingSoon(paymentsReady) {
  const pagamentos = paymentsReady === true ? [] : [`${DIGITAL_PAYMENTS_LABEL} para empresas registadas`];
  return [...pagamentos, ...COMING_SOON_LIST];
}

/**
 * Espelha `PLATFORM_FEE_LABEL` de `src/services/fees.ts`: a comissão por
 * extenso, a partir da taxa que o servidor usa para a calcular.
 */
export const PLATFORM_FEE_LABEL = `${Number((PLATFORM_FEE_RATE * 100).toFixed(2))}%`;

/** Espelha `platformFeeNote` de `src/services/seo.ts`. */
export function platformFeeNote() {
  return `As vendas por WhatsApp não têm comissão nenhuma. Nas vendas recebidas por ${DIGITAL_PAYMENTS_LABEL}, a MôBisno fica com ${PLATFORM_FEE_LABEL} do valor da encomenda; o resto é levantado para a conta bancária da sua empresa.`;
}

/**
 * Espelha `platformAddressNote` de `src/services/seo.ts`.
 *
 * O domínio próprio está «Em breve» enquanto estiver na lista espelhada
 * (`COMING_SOON_LIST`) — é a mesma fonte que a página de preços usa.
 */
export function platformAddressNote() {
  const porLigar = COMING_SOON_LIST.some((x) => /dom[íi]nio pr[óo]prio/i.test(x));
  return porLigar
    ? `A loja fica em nomedaloja.${STORE_APEX} desde o primeiro dia. O domínio próprio está «Em breve» e ainda não está incluído na subscrição.`
    : `A loja fica em nomedaloja.${STORE_APEX} desde o primeiro dia, e pode também ligar um domínio próprio.`;
}

/**
 * Espelha `src/services/seo.ts:platformFaq` — é a alternativa do servidor para
 * quando o pacote SSR não está disponível. Com o pacote, a pré-renderização usa
 * o `platformFaq` dele, o mesmo que desenhou a secção visível.
 */
export function platformFaq(paymentsReady) {
  const breve = platformComingSoon(paymentsReady);
  const faq = [
    {
      question: "Preciso de saber programar?",
      answer: "Não. A loja é personalizada num editor visual, por cima da própria página: logótipo, cores, textos, secções, categorias e produtos. Não há código para escrever nem nada para instalar.",
    },
    {
      question: "Como crio uma loja online em Angola?",
      answer: `Registe-se na MôBisno, escolha um modelo pronto, personalize os textos, as fotografias e as cores e adicione os seus produtos. A loja fica no endereço nomedaloja.${STORE_APEX}, sem precisar de conhecimentos técnicos.`,
    },
    {
      question: "Já vendo pelo Instagram e pelo WhatsApp. Para que preciso de uma loja?",
      answer: "Para o cliente escolher sozinho. Em vez de enviar fotografias uma a uma e repetir preços, envia um link com o catálogo inteiro, com preço, stock e variações. A encomenda chega-lhe ao WhatsApp escrita, a qualquer hora, mesmo quando não está a responder: produtos, variações, zona de entrega, desconto e total. E a loja é uma página que o Google indexa, o que um perfil de rede social não é.",
    },
    {
      question: "Quanto custa?",
      answer: `${platformPriceLabel()}, com tudo incluído. Há um só plano, sem escalões: lojas e produtos ilimitados. Criar a loja e vê-la é grátis; a subscrição serve para a publicar.`,
    },
    {
      question: "A MôBisno fica com uma parte das minhas vendas?",
      answer: `${platformFeeNote()} A fatura da venda é emitida pela sua empresa, não pela MôBisno.`,
    },
    {
      question: "Que pagamentos posso receber?",
      answer: paymentsReady === true
        ? "Todas as lojas recebem encomendas por WhatsApp. O Multicaixa Express e a Referência Bancária ficam disponíveis para empresas registadas, depois de a MôBisno aprovar os documentos da empresa."
        : "Todas as lojas recebem encomendas por WhatsApp. O Multicaixa Express e a Referência Bancária chegam em breve, para empresas registadas, depois de a MôBisno aprovar os documentos da empresa; até lá, as encomendas são feitas por WhatsApp.",
    },
    {
      question: "E se eu não tiver empresa registada?",
      answer: "Pode criar a loja, publicá-la e receber encomendas por WhatsApp, sem comissão nenhuma. São os pagamentos digitais que exigem empresa registada: a MôBisno pede a Matrícula e a Certidão e só liga o Multicaixa Express e a Referência Bancária depois de as aprovar.",
    },
    {
      question: "Posso usar o meu domínio próprio?",
      answer: platformAddressNote(),
    },
  ];
  if (breve.length) {
    faq.push({
      question: "O que ainda não está disponível?",
      answer: `Em breve: ${joinPt(breve.map((b) => `«${b}»`))}. Ainda não estão incluídos na subscrição.`,
    });
  }
  return faq;
}

/** Espelha `src/services/seo.ts:directoryDescription`. */
export function directoryDescription(total) {
  const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const quantas = n === 1 ? "1 loja online angolana criada" : `${n} lojas online angolanas criadas`;
  return truncate(`${quantas} com a MôBisno. Compre em Kwanzas, com encomendas por WhatsApp em todas as lojas.`, 160);
}

/* ------------------------- Verificação do Search Console ------------------------- */

/**
 * `<meta name="google-site-verification">` a partir da variável de ambiente
 * `GOOGLE_SITE_VERIFICATION` (opcional, separada por vírgulas — uma por
 * propriedade de prefixo de URL). Sai em todas as páginas pré-renderizadas. A
 * verificação por DNS (propriedade de Domínio) dispensa isto.
 */
export function siteVerificationTags(raw) {
  const tokens = [];
  for (const t of String(raw ?? "").split(",")) {
    const v = t.trim();
    if (v && v.length <= 200 && !tokens.includes(v)) tokens.push(v);
  }
  return tokens.map((v) => `<meta name="google-site-verification" content="${esc(v)}" />`).join("\n    ");
}

/* --------------------------------- Meta tags -------------------------------- */

/** Um ano a contar de hoje, em `YYYY-MM-DD`. */
function priceValidUntil() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * `imageWidth`/`imageHeight`/`imageType` são opcionais e só saem quando são
 * conhecidos: valem para a arte da plataforma, que está no repositório com
 * medidas fixas, e não para o logótipo de uma loja ou a fotografia de um
 * produto, cujas medidas o servidor não conhece. Anunciar medidas erradas é pior
 * do que não as anunciar — o WhatsApp reserva o espaço do cartão por elas.
 */
export function metaTags({
  title, description, canonical, image, imageWidth, imageHeight, imageType,
  type, siteName, noindex, follow, jsonLd,
}) {
  const t = esc(title);
  const d = esc(description);
  const img = image ? esc(image) : "";
  const tags = [
    `<meta name="description" content="${d}" />`,
    // A mesma diretiva que a SPA escreve (`robotsContent` dos dois lados).
    `<meta name="robots" content="${robotsContent({ noindex, follow })}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:type" content="${esc(type || "website")}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="${esc(siteName || PLATFORM_NAME)}" />`,
    `<meta property="og:locale" content="${LOCALE}" />`,
    img ? `<meta property="og:image" content="${img}" />` : "",
    img ? `<meta property="og:image:alt" content="${t}" />` : "",
    img && imageWidth ? `<meta property="og:image:width" content="${esc(imageWidth)}" />` : "",
    img && imageHeight ? `<meta property="og:image:height" content="${esc(imageHeight)}" />` : "",
    img && imageType ? `<meta property="og:image:type" content="${esc(imageType)}" />` : "",
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

/** Espelha `src/services/seo.ts:storeJsonLd`. */
export function storeJsonLd({ storeName, url, logoUrl, description, address, telephone, priceRange, sameAs, facts }) {
  const base = String(url).replace(/\/+$/, "");
  const node = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${base}/#store`,
    name: storeName,
    url: `${base}/`,
    description: storeDescription(storeName, description, facts),
    currenciesAccepted: CURRENCY,
    // Só o que a loja aceita de facto: os digitais exigem aprovação e fornecedor.
    paymentAccepted: facts && facts.digitalPayments ? "Multicaixa Express, Referência Bancária, WhatsApp" : "WhatsApp",
    areaServed: { "@type": "Country", name: COUNTRY },
  };
  if (logoUrl) { node.image = logoUrl; node.logo = logoUrl; }
  if (telephone) node.telephone = telephone;
  if (priceRange) node.priceRange = priceRange;
  if (sameAs && sameAs.length) node.sameAs = [...sameAs];
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

/**
 * Espelha `src/services/seo.ts:productJsonLd` nos campos que o servidor emite
 * (os portes só com o custo; sem política de devoluções, que o servidor não lê).
 */
export function productJsonLd({
  name, description, image, price, url, storeName, sku, category, available, rating, shipping, facts,
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
    description: productDescription({ name, description, storeName, facts }),
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

/** Espelha `src/services/seo.ts:platformJsonLd`. */
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
      description: platformDescription(),
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
 * O bloco `.mb-ssr` é a PÁGINA que o visitante vê até a SPA arrancar. Isto foi
 * ao contrário durante algum tempo e custou a indexação de todas as lojas.
 *
 * A versão anterior recortava o `.mb-ssr` para 1×1 píxel (`clip-path`) e punha
 * no lugar um ecrã de carregamento. O raciocínio registado dizia que não custava
 * SEO, apoiado em duas premissas — ambas falsas:
 *
 *  1. «os rastreadores leem o HTML em bruto, onde o CSS não é aplicado». O
 *     Googlebot APLICA CSS e faz layout. Isso vale para rastreadores primitivos,
 *     não para quem decide a indexação.
 *  2. «usa-se recorte e não `display:none` porque `display:none` é
 *     desvalorizado». A distinção não existe do lado do Google: recorte,
 *     1×1 píxel com `overflow:hidden` e `display:none` são todos texto
 *     escondido, e levam o mesmo desconto.
 *
 * O resultado era o pior possível: o Google via uma página de carregamento sem
 * conteúdo, classificava o URL como sem valor e nunca o indexava — em TODAS as
 * lojas, porque o bloco é o mesmo. Depender da segunda passagem (a que executa
 * JavaScript) é precisamente aquilo que a pré-renderização existe para evitar.
 *
 * O custo que o esconderijo evitava era real: por instantes vê-se uma versão
 * mais simples da loja antes da SPA assumir. A resposta certa é esta folha de
 * estilo — fazer com que essa versão tenha bom aspeto —, não escondê-la.
 */
/**
 * Tema da loja aplicado ao bloco pré-renderizado. Espelha os valores de
 * `web/lib/theme.ts` — se lá mudarem, mudar aqui.
 *
 * Serve para a transição: quando a SPA assume, a letra, os cantos e a cor já
 * são os mesmos, e o salto entre as duas versões deixa de se notar. Sem isto, a
 * página pré-renderizada era sempre Inter com cantos de 12px, mesmo numa loja
 * com serifas e cantos retos.
 */
const SSR_THEMES = {
  moderno: { head: "Inter,system-ui,sans-serif", body: "Inter,system-ui,sans-serif", radius: "16px" },
  classico: { head: "'Noto Serif',Georgia,serif", body: "Inter,system-ui,sans-serif", radius: "6px" },
  minimal: { head: "Inter,system-ui,sans-serif", body: "Inter,system-ui,sans-serif", radius: "0px" },
  editorial: { head: "'Playfair Display',Georgia,serif", body: "Montserrat,Inter,system-ui,sans-serif", radius: "2px" },
};
const SSR_THEME_DEFAULT = { head: "Inter,system-ui,-apple-system,\"Segoe UI\",sans-serif", body: "Inter,system-ui,-apple-system,\"Segoe UI\",sans-serif", radius: "12px" };

function ssrStyle(brand, custom) {
  const estilo = custom && custom.theme && custom.theme.style;
  const t = SSR_THEMES[estilo] || SSR_THEME_DEFAULT;
  return `<style id="mb-ssr-style">
    .mb-ssr{max-width:1080px;margin:0 auto;padding:22px 20px 60px;font-family:${t.body};color:#1c1b1b;-webkit-font-smoothing:antialiased}
    .mb-ssr h1,.mb-ssr h2,.mb-ssr-top strong{font-family:${t.head}}
    .mb-ssr-grid img,.mb-ssr-ph,.mb-ssr-prod img{border-radius:${t.radius}}
    .mb-ssr a{color:inherit;text-decoration:none}
    .mb-ssr img{max-width:100%}
    .mb-ssr-top{display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid #eceaea;margin-bottom:26px}
    .mb-ssr-top a{display:flex;align-items:center;gap:10px}
    .mb-ssr-top img{height:40px;width:auto;object-fit:contain}
    .mb-ssr-top strong{font-size:17px;font-weight:800;letter-spacing:-.01em}
    .mb-ssr h1{font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:0 0 10px}
    .mb-ssr h2{font-size:19px;font-weight:700;letter-spacing:-.01em;margin:34px 0 14px}
    .mb-ssr p{margin:0 0 14px;font-size:15px;line-height:1.6;color:#5b5757}
    .mb-ssr-crumb{font-size:13px;color:#8b8686;margin-bottom:6px}
    .mb-ssr-nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
    .mb-ssr-nav a{border:1px solid #e6e3e3;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600}
    .mb-ssr-grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:18px}
    .mb-ssr-grid a{display:flex;flex-direction:column;gap:7px}
    .mb-ssr-grid img,.mb-ssr-ph{width:100%;aspect-ratio:1/1;object-fit:cover;background:#f5f3f3;display:block}
    .mb-ssr-grid .n{font-size:14px;font-weight:600;line-height:1.35}
    .mb-ssr-grid .p{font-size:14px;font-weight:800;color:${brand}}
    .mb-ssr-prod{display:grid;grid-template-columns:1fr;gap:24px;margin-top:8px}
    .mb-ssr-prod img{width:100%;object-fit:cover;background:#f5f3f3}
    .mb-ssr-price{font-size:23px;font-weight:800;color:${brand};margin:0 0 12px}
    .mb-ssr-vars{font-size:14px}
    .mb-ssr-places{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:8px;font-size:14px}
    .mb-ssr-foot{margin-top:46px;padding-top:18px;border-top:1px solid #eceaea;font-size:12px;line-height:1.6;color:#8b8686}
    @media(min-width:720px){.mb-ssr-prod{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
  </style>`;
}

function topBar(storeName, logoUrl, homeHref) {
  const logo = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(storeName)}" width="40" height="40" />`
    : "";
  return `<div class="mb-ssr-top"><a href="${esc(homeHref)}">${logo}<strong>${esc(storeName)}</strong></a></div>`;
}

/** Rodapé do conteúdo `.mb-ssr`: diz só como se compra nesta loja (`howToBuy`). */
function footer(storeName, facts) {
  return `<div class="mb-ssr-foot">${esc(storeName)} · Loja online em Angola · ${esc(howToBuy(facts).replace(/\.$/, ""))} · Criada com <a href="https://${PLATFORM_APEX}/">MôBisno</a></div>`;
}

function productCards(products, base) {
  return products.map((p) => {
    const href = `${base}/produto/${productSlugPath(p)}`;
    const img = p.image_url
      ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" />`
      : `<span class="mb-ssr-ph"></span>`;
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
export function storeHomeHtml({ storeName, description, logoUrl, products, categories, base, brand, custom, facts }) {
  const nav = categories.length
    ? `<nav class="mb-ssr-nav">${categories.map((c) => `<a href="${esc(base)}/categoria/${esc(categorySlug(c))}">${esc(c)}</a>`).join("")}</nav>`
    : "";
  const grid = products.length
    ? `<h2>Produtos</h2><ul class="mb-ssr-grid">${productCards(products, base)}</ul>`
    : "";
  return `${ssrStyle(brand, custom)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <h1>${esc(storeName)}</h1>
    <p>${esc(description)}</p>
    ${nav}
    ${grid}
    ${locationsHtml(custom)}
    ${footer(storeName, facts)}
  </div>`;
}

/** Conteúdo de uma página de listagem (categoria ou todos os produtos). */
export function categoryHtml({ storeName, category, description, logoUrl, products, base, brand, custom, facts }) {
  const grid = products.length
    ? `<ul class="mb-ssr-grid">${productCards(products, base)}</ul>`
    : `<p>Ainda não há produtos nesta categoria.</p>`;
  return `${ssrStyle(brand, custom)}<div class="mb-ssr">
    ${topBar(storeName, logoUrl, base || "/")}
    <p class="mb-ssr-crumb"><a href="${esc(base || "/")}">${esc(storeName)}</a> › ${esc(category)}</p>
    <h1>${esc(category)}</h1>
    <p>${esc(description)}</p>
    ${grid}
    ${footer(storeName, facts)}
  </div>`;
}

/**
 * Conteúdo de uma página de produto.
 *
 * `custom` é a `customization` da Loja e é opcional: sem ela a página sai como
 * antes, apenas sem o texto das Variação (R4.18).
 */
export function productHtml({ storeName, product, description, logoUrl, base, brand, outOfStock, custom, facts }) {
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
  return `${ssrStyle(brand, custom)}<div class="mb-ssr">
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
        <p>${esc(howToBuy(facts))}</p>
      </div>
    </div>
    ${footer(storeName, facts)}
  </div>`;
}

/**
 * Conteúdo genérico para uma página da plataforma (mobisno.store).
 * `extraHtml` é HTML já construído (e já escapado) a acrescentar no fim — usado
 * pelo diretório de lojas para a grelha de ligações.
 *
 * Cada secção tem `items` (lista), `faq` (perguntas e respostas visíveis — as
 * mesmas que o `FAQPage` declara) ou `text`.
 */
export function platformHtml({ heading, intro, sections = [], links = [], extraHtml = "", host }) {
  /**
   * O cromo desta página aponta para a plataforma **em absoluto**, e não com
   * caminhos relativos.
   *
   * Não é preferência: esta função também desenha a página de «loja não
   * encontrada», que é servida a partir do subdomínio pedido
   * (`naoexiste.sualoja.digital`). Ali um `/criar` resolvia para
   * `naoexiste.sualoja.digital/criar`, que não existe — quem tentava sair da
   * página de erro aterrava noutro erro. É o mesmo raciocínio de
   * `platformHomeUrl()` na SPA.
   *
   * A origem é a do pedido quando este é da plataforma (`www.` ou o apex) e o
   * apex em qualquer outro caso (`platformOrigin`): numa loja, as ligações vão
   * para a plataforma; na plataforma, não passam por um redirecionamento.
   */
  const platform = platformOrigin(host);
  const secoes = sections.map((s) => {
    const corpo = s.faq
      ? `<div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto text-left">${s.faq.map((f) =>
          `<div class="rounded-2xl border border-gray-200 bg-white p-6"><h3 class="text-base font-bold text-gray-900">${esc(f.question)}</h3><p class="mt-2 text-sm text-gray-600 leading-relaxed">${esc(f.answer)}</p></div>`).join("")}</div>`
      : s.items
      ? `<ul class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto text-left">${s.items.map((i) =>
          `<li class="flex items-start gap-2.5 text-gray-700 text-sm"><span class="material-symbols-outlined text-[20px] shrink-0" style="color:${ACCENT_KZ}" aria-hidden="true">check_circle</span> ${esc(i)}</li>`).join("")}</ul>`
      : `<p class="mt-4 text-gray-600 max-w-3xl mx-auto">${esc(s.text ?? "")}</p>`;
    return `<section class="w-full border-t border-gray-100 py-14">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop text-center">
        <h2 class="text-2xl md:text-3xl font-black tracking-tight">${esc(s.title)}</h2>
        ${corpo}
      </div>
    </section>`;
  }).join("");

  const nav = links.length
    ? `<div class="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">${links.map((l) =>
        `<a href="${esc(l.href)}" class="inline-flex items-center justify-center border border-gray-300 text-gray-800 font-semibold px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors">${esc(l.label)}</a>`).join("")}</div>`
    : "";

  return `<div class="min-h-screen flex flex-col bg-white font-sans text-gray-900">
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <a href="${platform}/" class="flex items-center gap-2"><img src="/logo-header.png" alt="${esc(PLATFORM_NAME)}" class="w-auto object-contain" style="height:24px" /></a>
        <a href="${platform}/criar" class="inline-flex items-center gap-2 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors" style="background:${ACCENT_KZ}">Criar minha loja</a>
      </div>
    </nav>
    <main class="flex-grow flex flex-col">
      <section class="max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-12 md:py-20">
        <div class="w-full lg:w-2/3 text-center lg:text-left">
          <h1 class="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight">${esc(heading)}</h1>
          <p class="mt-6 text-lg text-gray-600 max-w-xl mx-auto lg:mx-0">${esc(intro)}</p>
          ${nav}
        </div>
      </section>
      ${secoes}
      ${extraHtml}
    </main>
    <footer class="bg-white border-t border-gray-100">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-10 text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span>${esc(PLATFORM_NAME)} · Plataforma angolana para criar lojas online</span>
        <a href="${platform}/termos" class="hover:text-gray-900 transition-colors">Termos</a>
        <a href="${platform}/privacidade" class="hover:text-gray-900 transition-colors">Privacidade</a>
      </div>
    </footer>
  </div>`;
}

/* -------------------------- Injeção no shell HTML -------------------------- */

/**
 * Substitui o `<title>`, limpa as meta por omissão da plataforma (para não
 * duplicar), acrescenta as tags desta página e injeta o conteúdo dentro de
 * `#app`. A SPA substitui esse conteúdo quando arranca.
 */
/**
 * Identificador do bloco com os dados da loja embutidos no HTML.
 *
 * O servidor já leu a loja, o logótipo, os banners e os produtos para escrever
 * a página. Sem isto, deitava-os fora e a SPA ia buscá-los outra vez ao
 * Supabase — três idas encadeadas que mediam cerca de um segundo, durante o
 * qual o visitante ficava a olhar para a página pré-renderizada. Com os dados
 * embutidos, a SPA desenha assim que o JavaScript acaba de carregar.
 *
 * O nome é partilhado com `web/lib/storeCache.ts`, que os lê.
 */
export const SSR_DATA_ID = "mb-ssr-data";

/**
 * Bloco `<script type="application/json">` com as LINHAS cruas do Supabase.
 *
 * Cruas de propósito: a conversão para os modelos de domínio já existe em
 * `web/supabase/repositories.ts` e é reutilizada no cliente. Duplicá-la aqui
 * criaria mais um espelho a manter, como o que já existe entre este ficheiro e
 * `src/services/` — e esse já custa caro.
 *
 * Os dados são exatamente os que a página mostra a quem a visita: a mesma
 * leitura que a chave anónima faz com as políticas de RLS em vigor. Não vai
 * aqui nada que o visitante não pudesse ler por si.
 */
export function ssrDataScript(data) {
  // `<` escapado: sem isto, uma descrição de produto com "</script>" fechava o
  // bloco e injetava HTML na página.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/json" id="${SSR_DATA_ID}">${json}</script>`;
}

/**
 * Injeta o SEO e o conteúdo no shell da SPA.
 *
 * `bodyHtml` vai para dentro de `#app`. Quando vem do pacote dos modelos
 * verdadeiros (`api/_ssr/render.mjs`), vem acompanhado de `appAttrs` — que leva
 * `data-ssr`, a impressão digital do HTML — e de `headHtml`, as folhas de estilo
 * do primeiro ecrã. É por `data-ssr` que a SPA reconhece o seu próprio HTML e
 * **adota** o DOM que já está no ecrã em vez de o reescrever (`web/lib/dom.ts`).
 */
export function inject(shell, { title, tags, bodyHtml, lang, ssrData, appAttrs = "", headHtml = "" }) {
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
  const verificacao = siteVerificationTags(process.env.GOOGLE_SITE_VERIFICATION);
  out = out.replace(/<\/head>/i, `    ${tags}${verificacao ? `\n    ${verificacao}` : ""}\n${headHtml ? `    ${headHtml}\n` : ""}  </head>`);

  const dentro = `${bodyHtml || ""}${ssrData ? ssrDataScript(ssrData) : ""}`;
  if (dentro || appAttrs) {
    out = out.replace(/<div id="app"([^>]*)>\s*<\/div>/i, (_m, attrs) =>
      `<div id="app"${attrs}${appAttrs}>${dentro}</div>`);
  }
  return out;
}
