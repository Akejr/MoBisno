/**
 * SEO — geração de metadados (módulo de domínio puro e testável).
 *
 * Fonte única de verdade para títulos, descrições e dados estruturados
 * (JSON-LD) usados em:
 *  - cliente (`web/lib/seo.ts`) — aplica ao `<head>` em cada navegação;
 *  - servidor (`api/prerender.js`) — injeta no HTML, com o conteúdo já
 *    renderizado, para os motores de busca e os crawlers sociais.
 *
 * Mercado-alvo: Angola. Locale `pt_AO`, moeda `AOA` (Kwanza).
 *
 * REGRA: nunca declarar em JSON-LD algo que a loja não oferece de facto. O
 * Google penaliza dados estruturados que não correspondem à página (política
 * de devoluções, portes, avaliações). Por isso os campos opcionais só são
 * emitidos quando há dados reais para os preencher.
 *
 * A mesma regra vale para o texto: as descrições geradas dizem só o que a loja
 * tem. Durante muito tempo todas as lojas anunciavam «Pagamento por Multicaixa
 * Express, Referência Bancária e WhatsApp, com entrega em Luanda» — a mesma
 * frase em todas (conteúdo duplicado aos olhos do Google) e falsa em quase
 * todas: os pagamentos digitais só existem numa loja aprovada e com o
 * fornecedor ligado, e a entrega só quando o Dono a configurou. Ver
 * {@link StoreSeoFacts}.
 *
 * Espelhado em `api/_seo.js` (as funções serverless não importam de `src/`);
 * `tests/seoInfra.test.ts` compara os dois.
 */
import { PLAN_PRICE_KZ, PLAN_PERIOD_DAYS, PLAN_UNIT_LABEL } from "./plans.js";
import { comingSoonList, isComingSoon } from "./comingSoon.js";
import { PLATFORM_FEE_LABEL } from "./fees.js";
import { STORE_APEX, PLATFORM_APEX, isModelIdentifier } from "./domains.js";
import { formatKz } from "./format.js";
import { PAYMENTS_PROVIDER_READY } from "./payments.js";

export const SEO_COUNTRY = "Angola";
export const SEO_LOCALE = "pt_AO";
export const SEO_LANGUAGE = "pt-AO";
export const SEO_CURRENCY = "AOA";
export const PLATFORM_NAME = "MôBisno";

/**
 * Arte de partilha das páginas da PLATAFORMA (`og:image`).
 *
 * Era o `logo-header.png`: um logótipo estreito sobre branco, que o WhatsApp
 * mostrava numa miniatura ao lado do texto. A arte quadrada dá um cartão com
 * imagem grande.
 *
 * É a versão leve (`scripts/share-image.mjs`) e não o original, que pesa mais de
 * 1 MB: acima de poucas centenas de kB o WhatsApp desiste de descarregar a
 * imagem e o cartão sai sem ela — o defeito de volta, agora sem nada que o
 * denuncie.
 *
 * ## O número no nome não é decoração
 *
 * **O Facebook e o WhatsApp guardam a imagem pelo ENDEREÇO dela**, não pela
 * página. Quando a arte mudou e o ficheiro continuou a chamar-se `share.jpg`, o
 * «Scrape Again» do depurador do Facebook leu a página outra vez, respondeu 200
 * e mostrou **a arte antiga**: ele já tinha aquele URL em cache e não voltou a
 * buscá-lo. Não há botão que force; o que funciona é um endereço novo.
 *
 * Por isso: **arte nova, número novo**, aqui e no espelho. O conversor escreve
 * para onde esta constante aponta, e o ficheiro antigo fica onde está — os
 * cartões que alguém já partilhou continuam a ter imagem em vez de um 404.
 *
 * As medidas são declaradas porque é por elas que o WhatsApp e o Facebook
 * decidem entre cartão grande e miniatura, antes de terem a imagem.
 *
 * Espelhado em `api/_seo.js` com os mesmos nomes (as funções serverless não
 * podem importar de `src/`, `SEO.md` §5.2) e no `<head>` de `web/index.html`,
 * que é HTML estático. Ao mudar aqui, mudar nos dois.
 */
export const PLATFORM_SHARE_IMAGE = "/images/share-2.jpg";
export const PLATFORM_SHARE_IMAGE_WIDTH = 1200;
export const PLATFORM_SHARE_IMAGE_HEIGHT = 1200;
export const PLATFORM_SHARE_IMAGE_TYPE = "image/jpeg";

/** Trunca um texto para `max` caracteres, cortando em espaço e juntando "…". */
export function truncate(text: string, max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Corta um título para o limite prático do Google (~60 caracteres antes de
 * truncar com "…" no resultado de pesquisa). Preserva a parte antes do
 * separador, que é a mais importante.
 */
export function clampTitle(title: string, max = 60): string {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return truncate(clean, max);
}

/* ------------------------------ Origens ------------------------------ */

/**
 * Origem das páginas da PLATAFORMA para um pedido feito a `host`.
 *
 * `mobisno.store` redireciona (308) para `www.mobisno.store` na Vercel, e os
 * canónicos, o `og:url`, o `sitemap.xml` e a linha `Sitemap:` do `robots.txt`
 * apontavam para o apex: cada URL que o Google recebia levava a um
 * redirecionamento. A origem passa a ser a do pedido — mas só dentro da família
 * do apex (o apex ou `www.`). Qualquer outro host (pré-visualizações da Vercel,
 * um `Host` forjado, o subdomínio de uma loja) dá o apex: um canónico nunca
 * aponta para fora da plataforma.
 *
 * Espelhada em `api/_seo.js` (`platformOrigin`); `tests/seoInfra.test.ts`
 * compara as duas.
 */
export function platformOriginForHost(host: string | null | undefined): string {
  const h = (String(host ?? "").trim().toLowerCase().split(":")[0] ?? "").replace(/\.$/, "");
  return h === PLATFORM_APEX || h === `www.${PLATFORM_APEX}` ? `https://${h}` : `https://${PLATFORM_APEX}`;
}

/* ------------------------------ Indexação ------------------------------ */

/** Diretiva de uma página indexável (a mesma no servidor e na SPA). */
export const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1";

/**
 * Conteúdo do `<meta name="robots">`.
 *
 * `follow` só conta com `noindex`: as lojas-modelo saem com `noindex, follow` —
 * a página não entra no índice (é uma demonstração, quase igual às outras), mas
 * as ligações continuam a ser seguidas.
 */
export function robotsContent(opts: { noindex?: boolean; follow?: boolean } = {}): string {
  if (!opts.noindex) return ROBOTS_INDEX;
  return opts.follow ? "noindex, follow" : "noindex, nofollow";
}

/**
 * A loja é uma Loja_Modelo (demonstração de um modelo da Plataforma)?
 *
 * Duas marcas, qualquer uma basta: o identificador reservado (`modelo-…`) ou a
 * marca interna `customization.__template`. As lojas-modelo são conteúdo quase
 * duplicado entre si e de cada loja criada a partir delas — não se indexam, não
 * entram nos sitemaps nem no diretório `/lojas`.
 */
export function isModelStore(store: { identifier?: unknown; customization?: unknown } | null | undefined): boolean {
  if (!store) return false;
  if (isModelIdentifier(store.identifier)) return true;
  const c = store.customization;
  const tpl = c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>).__template : undefined;
  return !(tpl === undefined || tpl === null || tpl === false);
}

/* --------------------------------- Loja --------------------------------- */

/**
 * O que é verdade numa loja, para as descrições geradas.
 *
 * Nenhum campo é obrigatório e a ausência significa «não»: sem `delivery` a
 * descrição não fala de entregas; sem `digitalPayments` não fala de Multicaixa
 * Express nem de Referência Bancária. No navegador, `digitalPayments` vem de
 * `digitalPaymentsVisible(store)`; no servidor, de `store.digital_payments` com
 * o fornecedor de pagamentos ligado.
 */
export interface StoreSeoFacts {
  /** Categorias da loja, pela ordem em que aparecem. */
  categories?: readonly string[];
  /** Nomes de produtos — usados quando a loja não tem categorias. */
  productNames?: readonly string[];
  /** O Dono configurou taxas de entrega. */
  delivery?: boolean;
  /** Multicaixa Express e Referência Bancária estão disponíveis nesta loja. */
  digitalPayments?: boolean;
}

/** Junta uma lista em português: «a», «a e b», «a, b e c». */
function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Até três exemplos, com «e mais» quando há mais. */
function examplesPt(items: readonly string[]): string {
  const clean = items.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (clean.length > 3) return `${clean.slice(0, 3).join(", ")} e mais`;
  return joinPt(clean);
}

/**
 * Como se compra nesta loja — só o que é verdade. O WhatsApp existe em todas
 * as lojas; o resto depende de `facts`.
 */
export function howToBuy(facts?: StoreSeoFacts | null): string {
  const pay = facts?.digitalPayments
    ? "Encomendas por WhatsApp e pagamento por Multicaixa Express ou Referência Bancária"
    : "Encomendas por WhatsApp";
  return `${pay}${facts?.delivery ? ", com entrega" : ""}.`;
}

/** Título da loja no Google: `Nome da Loja | Compras em Angola`. */
export function storeTitle(storeName: string): string {
  return `${storeName.trim()} | Compras em Angola`;
}

/**
 * Descrição da loja. A do Dono (`custom`) ganha sempre; sem ela, uma frase
 * própria desta loja — o nome, o que vende e como se compra.
 */
export function storeDescription(storeName: string, custom?: string | null, facts?: StoreSeoFacts | null): string {
  if (custom && custom.trim()) return truncate(custom.trim(), 160);
  const what = examplesPt(facts?.categories?.length ? facts.categories : (facts?.productNames ?? []));
  return truncate(`Compre online na ${storeName.trim()}, em Angola${what ? `: ${what}` : ""}. ${howToBuy(facts)}`, 160);
}

/* ------------------------------- Categoria ------------------------------- */

/** Título de uma página de categoria: `Categoria em Nome da Loja | Angola`. */
export function categoryTitle(category: string, storeName: string): string {
  return `${category.trim()} | ${storeName.trim()} | Comprar em Angola`;
}

/**
 * Descrição ÚNICA por categoria. Evita o erro comum de repetir a descrição da
 * loja em todas as categorias (conteúdo duplicado aos olhos do Google): usa o
 * número de produtos e os nomes de alguns deles para a tornar distinta.
 */
export function categoryDescription(input: {
  category: string;
  storeName: string;
  count?: number;
  sampleNames?: readonly string[];
  priceFrom?: string | null;
  facts?: StoreSeoFacts | null;
}): string {
  const cat = input.category.trim();
  const store = input.storeName.trim();
  const n = input.count ?? 0;
  const quantos = n > 0 ? `${n} ${n === 1 ? "produto" : "produtos"} de ${cat}` : cat;
  const exemplos = input.sampleNames && input.sampleNames.length
    ? ` ${input.sampleNames.slice(0, 3).join(", ")} e mais.`
    : "";
  const desde = input.priceFrom ? ` Desde ${input.priceFrom}.` : "";
  return truncate(`${quantos} na ${store}.${desde}${exemplos} ${howToBuy(input.facts)}`, 160);
}

/* -------------------------------- Produto -------------------------------- */

/** Título do produto: `Nome do Produto — Nome da Loja` (foco na loja). */
export function productTitle(productName: string, storeName: string): string {
  return `${productName.trim()} | ${storeName.trim()}`;
}

/** Descrição do produto a partir dos seus dados (gerada automaticamente). */
export function productDescription(input: {
  name: string;
  description?: string | null;
  priceLabel?: string | null;
  storeName: string;
  facts?: StoreSeoFacts | null;
}): string {
  const desc = (input.description ?? "").trim();
  if (desc) return truncate(desc, 160);
  const price = input.priceLabel ? ` por ${input.priceLabel}` : "";
  return truncate(`Compre ${input.name.trim()}${price} na ${input.storeName.trim()}, em Angola. ${howToBuy(input.facts)}`, 160);
}

/* ------------------------------ Plataforma ------------------------------ */

/**
 * Kwanzas sem cêntimos («10.000 Kz»), a partir de `formatKz` — os preços da
 * subscrição são inteiros e «10.000,00 Kz» num texto corrido lê-se mal.
 */
export function kzWhole(value: number): string {
  return formatKz(value).replace(/,00 Kz$/, " Kz");
}

/** Período da subscrição como se escreve a seguir ao preço: «/mês» (30 dias). */
export function planPeriodLabel(): string {
  return PLAN_PERIOD_DAYS === 30 ? "/mês" : ` por ${PLAN_PERIOD_DAYS} dias`;
}

/** Preço da subscrição como se escreve nos textos: «10.000 Kz/mês». */
export function platformPriceLabel(): string {
  return `${kzWhole(PLAN_PRICE_KZ)}${planPeriodLabel()}`;
}

export function platformTitle(): string {
  return "MôBisno | Criar Loja Online em Angola | Sites e Lojas Virtuais";
}

/**
 * Descrição da plataforma. Diz só o que existe: um plano, tudo incluído,
 * WhatsApp em todas as lojas. O domínio próprio, o SMS e os pixels estão «Em
 * breve» e por isso não aparecem aqui (`src/services/comingSoon.ts`).
 */
export function platformDescription(): string {
  return truncate(
    `Crie a sua loja online em Angola: modelos prontos, editor visual e encomendas por WhatsApp. ${platformPriceLabel()} ${PLAN_UNIT_LABEL}, tudo incluído.`,
    160,
  );
}

/** Os dois pagamentos digitais, pelo nome que o Dono e o cliente conhecem. */
export const DIGITAL_PAYMENTS_LABEL = "Multicaixa Express e Referência Bancária";

/**
 * Frase curta sobre os pagamentos digitais nos textos da plataforma (página
 * inicial, versão do servidor, perguntas frequentes).
 *
 * **Enquanto o fornecedor de pagamentos não estiver ligado**
 * (`PAYMENTS_PROVIDER_READY` a `false`; no servidor, `getPaymentProvider()`
 * devolve `null`), os pagamentos digitais são «em breve» e nunca aparecem como
 * disponíveis: nenhuma loja os consegue mostrar, aprovada ou não. Anunciá-los era
 * prometer ao Dono o que ele não consegue ligar — o mesmo erro dos escalões que o
 * assistente continuou a descrever depois de terem saído.
 *
 * @param providerReady Para testes e para o servidor; por omissão, o estado real.
 */
export function digitalPaymentsNote(providerReady: boolean = PAYMENTS_PROVIDER_READY): string {
  return providerReady === true
    ? `${DIGITAL_PAYMENTS_LABEL} para empresas registadas, depois de a MôBisno aprovar os documentos da empresa.`
    : `${DIGITAL_PAYMENTS_LABEL} em breve, para empresas registadas, depois de a MôBisno aprovar os documentos da empresa.`;
}

/**
 * A comissão da Plataforma como se escreve num texto: quanto é, sobre o quê, e
 * o que **não** é cobrado.
 *
 * Existe aqui — e não escrita à mão na página inicial e na FAQ — pela razão de
 * sempre: a percentagem vive em `src/services/fees.ts` e qualquer texto que a
 * repita à mão fica errado no dia em que ela mudar. É a mesma regra do preço do
 * plano (`platformPriceLabel`).
 */
export function platformFeeNote(): string {
  return `As vendas por WhatsApp não têm comissão nenhuma. Nas vendas recebidas por ${DIGITAL_PAYMENTS_LABEL}, a MôBisno fica com ${PLATFORM_FEE_LABEL} do valor da encomenda; o resto é levantado para a conta bancária da sua empresa.`;
}

/**
 * O endereço da loja, e o que acontece a um domínio próprio.
 *
 * O subdomínio existe desde o primeiro dia; o domínio próprio está «Em breve»
 * (`src/services/comingSoon.ts`) e por isso nunca é prometido como incluído. A
 * frase é lida pela FAQ e pela página inicial — era escrita à mão nos dois.
 */
export function platformAddressNote(): string {
  return isComingSoon("customDomain")
    ? `A loja fica em nomedaloja.${STORE_APEX} desde o primeiro dia. O domínio próprio está «Em breve» e ainda não está incluído na subscrição.`
    : `A loja fica em nomedaloja.${STORE_APEX} desde o primeiro dia, e pode também ligar um domínio próprio.`;
}

/**
 * O que a plataforma ainda não tem, pela ordem em que se mostra: os pagamentos
 * digitais enquanto o fornecedor não estiver ligado, e as funcionalidades «Em
 * breve» de `src/services/comingSoon.ts` (SMS, domínio próprio, pixels).
 */
export function platformComingSoon(providerReady: boolean = PAYMENTS_PROVIDER_READY): string[] {
  const pagamentos = providerReady === true ? [] : [`${DIGITAL_PAYMENTS_LABEL} para empresas registadas`];
  return [...pagamentos, ...comingSoonList()];
}

/**
 * Perguntas frequentes da plataforma — as **mesmas** na secção visível da
 * página inicial (`web/views/landingHtml.ts`) e no `FAQPage` que o Google lê
 * (`api/prerender.js`, através do pacote SSR, e `applyPlatformSeo`). O Google
 * só aceita FAQ em dados estruturados quando as perguntas estão na página.
 *
 * Os números e as funcionalidades «Em breve» saem das constantes, nunca de
 * texto escrito à mão.
 *
 * **O texto da pergunta não pode depender de `providerReady`** — só o da
 * resposta. `tests/ssrRender.test.ts` compara as perguntas de `platformFaq(false)`
 * com o HTML da página inicial, que é desenhado com o estado real: duas versões
 * do mesmo título fariam o `FAQPage` declarar uma pergunta que não está na
 * página, que é precisamente o que o Google recusa.
 *
 * São perguntas de objeção, não de catálogo: quem já vende por WhatsApp e por
 * Instagram pergunta se precisa de programar, para que serve um site se já tem
 * perfil, quanto é a comissão e o que acontece sem empresa registada. É aqui que
 * essas respostas vivem.
 *
 * **Espelho do servidor.** `api/_seo.js` tem a sua cópia desta lista (as funções
 * serverless não importam de `src/`) e é dela que sai o `FAQPage` em
 * `api/prerender.js`. A invariante que importa é de inclusão, não de igualdade:
 * **toda a pergunta declarada em dados estruturados tem de estar visível na
 * página**. Esta lista é a visível, por isso pode ser maior; o espelho é que não
 * pode conter nada que não esteja aqui. Acrescentar as perguntas novas ao
 * espelho é o que lhes dá direito ao bloco de FAQ do Google.
 *
 * @param providerReady Para testes e para o servidor; por omissão, o estado real
 *        do fornecedor de pagamentos (`PAYMENTS_PROVIDER_READY`).
 */
export function platformFaq(providerReady: boolean = PAYMENTS_PROVIDER_READY): { question: string; answer: string }[] {
  const breve = platformComingSoon(providerReady);
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
      answer: `${platformPriceLabel()} ${PLAN_UNIT_LABEL}, com tudo incluído. Cada loja tem a sua subscrição: quem tem duas lojas online paga duas. Produtos ilimitados e sem escalões. Criar a loja e vê-la é grátis; a subscrição serve para a publicar.`,
    },
    {
      question: "A MôBisno fica com uma parte das minhas vendas?",
      answer: `${platformFeeNote()} A fatura da venda é emitida pela sua empresa, não pela MôBisno.`,
    },
    {
      question: "Que pagamentos posso receber?",
      answer: providerReady === true
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

/** Palavras-chave da plataforma (Angola). */
export function platformKeywords(): string {
  return [
    "criar loja online angola", "loja virtual angola", "criar site angola",
    "vender online angola", "e-commerce angola", "loja online luanda",
    "multicaixa express online", "pagamentos online angola", "website angola",
    "criar loja whatsapp", "MôBisno",
  ].join(", ");
}

/**
 * Descrição do diretório de lojas (`/lojas`). Dizia «Compre em Kwanzas com
 * Multicaixa Express, Referência Bancária ou WhatsApp, com entrega em Luanda e
 * em todo o país» — falso para quase todas as lojas listadas: o WhatsApp é o
 * único meio comum a todas, e a entrega depende de cada Dono.
 */
export function directoryDescription(total: number): string {
  const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const quantas = n === 1 ? "1 loja online angolana criada" : `${n} lojas online angolanas criadas`;
  return truncate(`${quantas} com a MôBisno. Compre em Kwanzas, com encomendas por WhatsApp em todas as lojas.`, 160);
}

/* -------------------------------- JSON-LD -------------------------------- */

/** Dados estruturados da plataforma: Organization + WebSite (com pesquisa). */
export function platformJsonLd(baseUrl: string): object[] {
  const base = baseUrl.replace(/\/+$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: PLATFORM_NAME,
      url: `${base}/`,
      logo: `${base}/logo-header.png`,
      description: platformDescription(),
      areaServed: { "@type": "Country", name: SEO_COUNTRY },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: PLATFORM_NAME,
      url: `${base}/`,
      inLanguage: SEO_LANGUAGE,
      publisher: { "@id": `${base}/#organization` },
    },
  ];
}

/**
 * Trilho de navegação (`BreadcrumbList`). O Google apresenta-o por baixo do
 * título no resultado de pesquisa, em vez da URL crua.
 */
export function breadcrumbJsonLd(items: readonly { name: string; url: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Morada da loja, quando o dono a preencheu (habilita SEO local). */
export interface SeoAddress {
  street?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Dados estruturados de uma loja.
 *
 * Emite `OnlineStore` e, quando existe morada/coordenadas, acrescenta os campos
 * de negócio local (`address`/`geo`/`telephone`) — o que a torna elegível para
 * resultados locais em Angola.
 */
export function storeJsonLd(input: {
  storeName: string;
  url: string;
  logoUrl?: string | null;
  description?: string | null;
  address?: SeoAddress | null;
  telephone?: string | null;
  priceRange?: string | null;
  sameAs?: readonly string[] | null;
  /** Factos da loja para a descrição gerada e para `paymentAccepted`. */
  facts?: StoreSeoFacts | null;
}): object {
  const url = input.url.replace(/\/+$/, "");
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${url}/#store`,
    name: input.storeName,
    url: `${url}/`,
    description: storeDescription(input.storeName, input.description, input.facts),
    currenciesAccepted: SEO_CURRENCY,
    // Só o que a loja aceita de facto: os digitais exigem aprovação e fornecedor.
    paymentAccepted: input.facts?.digitalPayments ? "Multicaixa Express, Referência Bancária, WhatsApp" : "WhatsApp",
    areaServed: { "@type": "Country", name: SEO_COUNTRY },
  };
  if (input.logoUrl) {
    node.image = input.logoUrl;
    node.logo = input.logoUrl;
  }
  if (input.telephone) node.telephone = input.telephone;
  if (input.priceRange) node.priceRange = input.priceRange;
  if (input.sameAs && input.sameAs.length) node.sameAs = [...input.sameAs];

  const a = input.address;
  if (a && (a.street || a.city)) {
    node.address = {
      "@type": "PostalAddress",
      ...(a.street ? { streetAddress: a.street } : {}),
      ...(a.city ? { addressLocality: a.city } : {}),
      addressCountry: "AO",
    };
  }
  if (a && typeof a.latitude === "number" && typeof a.longitude === "number") {
    node.geo = { "@type": "GeoCoordinates", latitude: a.latitude, longitude: a.longitude };
  }
  return node;
}

/**
 * Caixa de pesquisa nos resultados do Google (sitelinks searchbox) para a loja.
 * Só faz sentido se a loja tiver mesmo uma página de resultados de pesquisa.
 */
export function storeWebsiteJsonLd(input: { storeName: string; url: string; searchPath?: string }): object {
  const url = input.url.replace(/\/+$/, "");
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name: input.storeName,
    url: `${url}/`,
    inLanguage: SEO_LANGUAGE,
  };
  if (input.searchPath) {
    node.potentialAction = {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${url}${input.searchPath}` },
      "query-input": "required name=search_term_string",
    };
  }
  return node;
}

/** Um item de listagem (grelha de produtos) para `ItemList`. */
export interface SeoListItem {
  name: string;
  url: string;
  image?: string | null;
  price?: number | null;
}

/**
 * Página de listagem (categoria ou "todos os produtos") como `CollectionPage`
 * com um `ItemList` dos produtos. Dá ao Google a estrutura da coleção em vez de
 * uma página de texto solto.
 */
export function collectionJsonLd(input: {
  name: string;
  url: string;
  description: string;
  items: readonly SeoListItem[];
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: input.url,
    description: input.description,
    inLanguage: SEO_LANGUAGE,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url,
        name: it.name,
        ...(it.image ? { image: it.image } : {}),
      })),
    },
  };
}

/** Portes de envio reais da loja (só emitidos quando configurados). */
export interface SeoShipping {
  /** Custo de entrega em Kwanzas. */
  cost: number;
  /** Dias úteis mínimos/máximos até à entrega, se conhecidos. */
  minDays?: number | null;
  maxDays?: number | null;
}

/** Política de devolução real da loja (só emitida quando configurada). */
export interface SeoReturnPolicy {
  /** Dias para devolver. `0` significa "não aceita devoluções". */
  days: number;
}

/**
 * Dados estruturados de um produto (`Product` + `Offer`).
 *
 * Campos que o Google usa para mostrar preço, disponibilidade e estrelas no
 * resultado de pesquisa. `shippingDetails` e `hasMerchantReturnPolicy` só são
 * incluídos quando a loja os tem mesmo configurados — declarar portes ou
 * devoluções inexistentes é motivo de penalização.
 */
export function productJsonLd(input: {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  url: string;
  storeName: string;
  storeUrl?: string | null;
  sku?: string | null;
  category?: string | null;
  available?: boolean;
  rating?: { average: number; count: number } | null;
  shipping?: SeoShipping | null;
  returnPolicy?: SeoReturnPolicy | null;
  /** Validade do preço (ISO). Por omissão, um ano a contar de `now`. */
  priceValidUntil?: string | null;
  now?: Date;
  /** Factos da loja, para a descrição gerada quando o produto não tem. */
  facts?: StoreSeoFacts | null;
}): object {
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: Number(input.price).toFixed(2),
    priceCurrency: SEO_CURRENCY,
    availability: input.available === false
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url: input.url,
    priceValidUntil: input.priceValidUntil ?? defaultPriceValidUntil(input.now),
    seller: { "@type": "Organization", name: input.storeName },
  };

  if (input.shipping) {
    const s = input.shipping;
    const shipping: Record<string, unknown> = {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: Number(s.cost).toFixed(2),
        currency: SEO_CURRENCY,
      },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "AO" },
    };
    if (typeof s.minDays === "number" && typeof s.maxDays === "number") {
      shipping.deliveryTime = {
        "@type": "ShippingDeliveryTime",
        transitTime: { "@type": "QuantitativeValue", minValue: s.minDays, maxValue: s.maxDays, unitCode: "DAY" },
      };
    }
    offer.shippingDetails = shipping;
  }

  if (input.returnPolicy) {
    const days = input.returnPolicy.days;
    offer.hasMerchantReturnPolicy = days > 0
      ? {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AO",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: days,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      }
      : {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AO",
        returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      };
  }

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: productDescription({ name: input.name, description: input.description, storeName: input.storeName, facts: input.facts }),
    brand: { "@type": "Brand", name: input.storeName },
    offers: offer,
  };
  if (input.image) node.image = input.image;
  if (input.sku) node.sku = input.sku;
  if (input.category) node.category = input.category;
  if (input.rating && input.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.rating.average,
      reviewCount: input.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return node;
}

/** Um ano a contar de agora, em `YYYY-MM-DD` (formato aceite pelo Google). */
function defaultPriceValidUntil(now?: Date): string {
  const d = new Date((now ?? new Date()).getTime());
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Perguntas frequentes (elegível para o bloco de FAQ no Google). */
export function faqJsonLd(items: readonly { question: string; answer: string }[]): object {
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
