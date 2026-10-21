/**
 * A pré-renderização desenha a loja **com o modelo verdadeiro** — e a SPA adota
 * esse HTML em vez de o reescrever.
 *
 * ## O defeito que isto corrige
 *
 * Abrir uma loja mostrava primeiro uma página em bruto e depois a loja. A causa
 * não era lentidão: o servidor escrevia dentro de `#app` uma versão
 * simplificada (`.mb-ssr`, em `api/_seo.js`) e a SPA substituía-a pelo HTML do
 * modelo assim que arrancava. Duas páginas diferentes, uma depois da outra.
 *
 * A correção tem duas metades, e as duas são verificadas aqui:
 *
 *  1. o servidor produz **exatamente** o HTML que a SPA produziria, porque
 *     chama a mesma função (`storeHomeHtml`, `productPageHtml`,
 *     `categoryPageHtml`) sobre os mesmos dados (`storefrontFromRows`);
 *  2. a SPA reconhece-o pela impressão digital (`fnv1a`) que vem no atributo
 *     `data-ssr` e mantém o DOM que já está no ecrã (`web/lib/dom.ts`).
 *
 * ## Como os módulos entram no teste
 *
 * O pacote (`api/_ssr/render.mjs`) é JavaScript já empacotado: entra por
 * `import()` com o especificador numa constante, como o resto dos testes que
 * tocam em `api/` e em `web/`. Os módulos de `web/` que servem de oráculo
 * precisam de um `location` mínimo — definido antes de qualquer import.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoreTemplate } from "../web/templates/types.js";

const ROOT = join(__dirname, "..");
const PRERENDER = readFileSync(join(ROOT, "api/prerender.js"), "utf8");
const DOM = readFileSync(join(ROOT, "web/lib/dom.ts"), "utf8");

/* ------------------------------ Dados de exemplo ------------------------------ */

const STORE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ekolo Sports",
  identifier: "ekolosports",
  state: "Publicada",
  owner_id: "22222222-2222-4222-8222-222222222222",
  store_type: "Desporto",
  template_id: "desportivo",
  subdomain: "ekolosports.mobisno.store",
  created_at: "2026-01-02T10:00:00.000Z",
  digital_payments: false,
  customization: {
    colors: { primary: "#0F766E" },
    hero: { title: "Equipamento para treinar a sério" },
  },
};

const PRODUCTS = [
  {
    id: "aaaaaaa1-0000-4000-8000-000000000001",
    store_id: STORE.id, name: "Camisola de treino", description: "Tecido respirável.",
    category: "Vestuário", price: 12500, image_url: "https://exemplo.ao/camisola.jpg",
    available: true, stock: 4, featured: true, physical: true, created_at: "2026-01-03T10:00:00.000Z",
  },
  {
    id: "aaaaaaa2-0000-4000-8000-000000000002",
    store_id: STORE.id, name: "Bola de futebol", description: "Tamanho 5.",
    category: "Equipamento", price: 9000, image_url: null,
    available: true, stock: null, featured: false, physical: true, created_at: "2026-01-04T10:00:00.000Z",
  },
  {
    id: "aaaaaaa3-0000-4000-8000-000000000003",
    store_id: STORE.id, name: "Produto escondido", description: "",
    category: "Equipamento", price: 1000, image_url: null,
    available: false, stock: 0, featured: false, physical: true, created_at: "2026-01-05T10:00:00.000Z",
  },
];

const BANNERS = [
  { id: "bbbbbbb1-0000-4000-8000-000000000001", store_id: STORE.id, image_url: "https://exemplo.ao/b1.jpg", position: 0, created_at: "" },
];

const LOGO = {
  id: "ccccccc1-0000-4000-8000-000000000001", store_id: STORE.id, kind: "logo",
  url: "https://exemplo.ao/logo.png", format: "png", size_bytes: 1234,
};

const ROWS = { store: STORE, logo: LOGO, banners: BANNERS, products: PRODUCTS };
const HOST = "ekolosports.sualoja.digital";

/* --------------------------- Módulos sob verificação --------------------------- */

interface SsrPage { html: string; hash: string; appAttrs: string; headHtml: string }
type SsrResult =
  | ({ kind: "home" } & SsrPage)
  | ({ kind: "product"; productId: string; canonicalPath: string } & SsrPage)
  | ({ kind: "category"; label: string; canonicalPath: string; itemIds: string[]; indexable: boolean } & SsrPage)
  | { kind: "product_not_found" }
  | { kind: "category_not_found" };

interface Pacote {
  renderStorePage(req: { host: string; path: string; search?: string; identifier: string; rest: string; rows: unknown }): SsrResult | null;
  renderLandingPage(req: { host: string; path: string }): SsrPage;
  fnv1a(s: string): string;
  platformFaq(providerReady?: boolean): { question: string; answer: string }[];
}

interface Oraculo {
  storeHomeHtml(view: unknown, custom: unknown): string;
  productPageHtml(view: unknown, product: unknown, custom: unknown, identifier: string): string;
  categoryPageHtml(view: unknown, label: string, custom: unknown): string;
  findProduct(view: unknown, slug: string): { id: string; name: string } | null;
}

interface Linhas {
  storefrontFromRows(rows: unknown): { view: { kind: string; products: { id: string; name: string }[] }; custom: unknown } | null;
}

/** Especificadores em constante — ver o comentário em `beforeAll`. */
const ESP_PACOTE = "../api/_ssr/render.mjs";
const ESP_STORE_HTML = "../web/views/storeHtml.js";
const ESP_ROWS = "../web/ssr/storefrontRows.js";
const ESP_REGISTRY = "../web/templates/registry.js";

let pack: Pacote;
let oraculo: Oraculo;
let linhas: Linhas;
let registo: StoreTemplate | undefined;

beforeAll(async () => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) {
    g.location = {
      protocol: "https:", host: HOST, hostname: HOST, port: "", origin: `https://${HOST}`,
      pathname: "/", search: "", hash: "", href: `https://${HOST}/`,
    };
  }
  // Os especificadores ficam em constantes de propósito: com eles literais, o
  // `tsc` segue-os e compila `web/lib/seo.ts` e `web/lib/routing.ts` (que leem
  // `document` e `location`) dentro de um programa sem DOM — e o `npm run build`
  // passa a falhar com erros que não existem em execução.
  pack = (await import(ESP_PACOTE)) as unknown as Pacote;
  oraculo = (await import(ESP_STORE_HTML)) as unknown as Oraculo;
  linhas = (await import(ESP_ROWS)) as unknown as Linhas;
  const reg = (await import(ESP_REGISTRY)) as { getTemplate(id: string): StoreTemplate };
  registo = reg.getTemplate(STORE.template_id);
});

/** Pede uma página ao pacote, como `api/prerender.js` o faz. */
function desenhar(rest: string, rows: unknown = ROWS, host = HOST): SsrResult | null {
  return pack.renderStorePage({ host, path: rest, identifier: String(STORE.identifier), rest, rows });
}

describe("Pré-renderização com o modelo verdadeiro — é a loja, não uma versão simplificada", () => {
  it("o modelo da loja de exemplo existe no registo (senão o teste não prova nada)", () => {
    expect(registo, `modelo ${STORE.template_id} não está registado`).toBeDefined();
  });

  it("a página inicial traz o nome da loja, os produtos disponíveis e os preços", () => {
    const page = desenhar("/");
    expect(page?.kind).toBe("home");
    const html = (page as SsrPage).html;
    expect(html).toContain("Ekolo Sports");
    expect(html).toContain("Camisola de treino");
    expect(html).toContain("Bola de futebol");
    // Um produto indisponível não é servido a ninguém — nem ao rastreador.
    expect(html).not.toContain("Produto escondido");
    // O preço sai formatado em Kwanzas (é o que o cliente lê e o que o Google indexa).
    expect(html).toMatch(/12[.\s]?500/);
  });

  it("as ligações para os produtos são `<a href>` normais, que o Google segue", () => {
    const html = (desenhar("/") as SsrPage).html;
    // Sem fragmento (`#/`): uma ligação por hash não é rastreada.
    expect(html).toMatch(/href="\/produto\/vestuario\/camisola-de-treino"/);
    expect(html).not.toMatch(/href="#\//);
  });

  it("no domínio da plataforma as ligações levam o prefixo /loja/<id>", () => {
    // O mesmo modelo, servido em `mobisno.store/loja/ekolosports`: os caminhos
    // internos têm de mudar com o pedido, senão apontam para fora da loja.
    const page = pack.renderStorePage({
      host: "www.mobisno.store", path: "/loja/ekolosports", identifier: "ekolosports", rest: "/", rows: ROWS,
    });
    expect(page?.kind).toBe("home");
    expect((page as SsrPage).html).toContain('href="/loja/ekolosports/produto/');
  });

  it("a página de produto e a de categoria saem com o canónico certo", () => {
    const produto = desenhar("/produto/vestuario/camisola-de-treino");
    expect(produto?.kind).toBe("product");
    if (produto?.kind === "product") {
      expect(produto.productId).toBe(PRODUCTS[0]!.id);
      expect(produto.canonicalPath).toBe("/produto/vestuario/camisola-de-treino");
      expect(produto.html).toContain("Tecido respirável");
    }
    const categoria = desenhar("/categoria/vestuario");
    expect(categoria?.kind).toBe("category");
    if (categoria?.kind === "category") {
      expect(categoria.label).toBe("Vestuário");
      expect(categoria.itemIds).toEqual([PRODUCTS[0]!.id]);
      expect(categoria.indexable).toBe(true);
    }
  });

  it("um produto ou uma categoria que não existem são recusados, não inventados", () => {
    expect(desenhar("/produto/nao/existe")?.kind).toBe("product_not_found");
    expect(desenhar("/categoria/inexistente")?.kind).toBe("category_not_found");
  });

  it("sem loja nas linhas devolve null — e quem chama usa a versão simplificada", () => {
    expect(desenhar("/", { store: null })).toBeNull();
    expect(desenhar("/", {})).toBeNull();
  });
});

describe("O HTML do servidor é o MESMO que a SPA produz", () => {
  it("a página inicial coincide à letra com `storeHomeHtml`", () => {
    const carregada = linhas.storefrontFromRows(ROWS);
    expect(carregada).not.toBeNull();
    const esperado = oraculo.storeHomeHtml(carregada!.view, carregada!.custom);
    const page = desenhar("/") as SsrPage;
    expect(page.html).toBe(esperado);
    // E a impressão digital é a desse HTML: é por ela que a SPA decide adotar.
    expect(page.hash).toBe(pack.fnv1a(esperado));
  });

  it("a página de produto coincide à letra com `productPageHtml`", () => {
    const carregada = linhas.storefrontFromRows(ROWS)!;
    const produto = oraculo.findProduct(carregada.view, "vestuario/camisola-de-treino");
    expect(produto).not.toBeNull();
    const esperado = oraculo.productPageHtml(carregada.view, produto, carregada.custom, String(STORE.identifier));
    const page = desenhar("/produto/vestuario/camisola-de-treino") as SsrPage;
    expect(page.html).toBe(esperado);
    expect(page.hash).toBe(pack.fnv1a(esperado));
  });

  it("a listagem de categoria coincide à letra com `categoryPageHtml`", () => {
    const carregada = linhas.storefrontFromRows(ROWS)!;
    const esperado = oraculo.categoryPageHtml(carregada.view, "Vestuário", carregada.custom);
    const page = desenhar("/categoria/vestuario") as SsrPage;
    expect(page.html).toBe(esperado);
  });

  it("desenhar duas vezes dá exatamente o mesmo HTML", () => {
    // Um id aleatório ou uma data dentro de um modelo fariam a impressão digital
    // mudar a cada pedido, e a adoção nunca aconteceria.
    expect((desenhar("/") as SsrPage).html).toBe((desenhar("/") as SsrPage).html);
    expect((desenhar("/produto/vestuario/camisola-de-treino") as SsrPage).hash)
      .toBe((desenhar("/produto/vestuario/camisola-de-treino") as SsrPage).hash);
  });

  it("o `location` do pedido não fica a sujar o processo", () => {
    // O render é síncrono e repõe o `location` anterior: duas lojas servidas pela
    // mesma instância não se misturam.
    const antes = JSON.stringify((globalThis as unknown as { location: { hostname: string } }).location.hostname);
    desenhar("/", ROWS, "outraloja.sualoja.digital");
    const depois = JSON.stringify((globalThis as unknown as { location: { hostname: string } }).location.hostname);
    expect(depois).toBe(antes);
  });
});

describe("O aspeto do primeiro ecrã já é o final", () => {
  it("as cores da marca vão nos atributos de `#app`, não só no JavaScript", () => {
    const page = desenhar("/") as SsrPage;
    // Sem isto, a página aparecia com a cor por omissão e mudava de cor quando a
    // SPA arrancava — o mesmo salto, noutra forma.
    expect(page.appAttrs).toContain("--brand:#0F766E");
    expect(page.appAttrs).toContain("--brand-ink:");
  });

  it("a folha do primeiro ecrã da listagem esconde o que o filtro esconderia", () => {
    const page = desenhar("/categoria/vestuario") as SsrPage;
    if (page.headHtml) {
      expect(page.headHtml).toMatch(/<style[^>]*data-mb-ssr-only/);
      expect(page.headHtml).toContain("data-product-category");
    }
    // «Todos os produtos» não esconde nada.
    const todos = desenhar("/categoria/produtos") as SsrPage;
    expect(todos.headHtml).not.toContain("display:none");
  });

  it("nenhum atributo nem folha sai com aspas ou `<` por escapar", () => {
    const perigoso = {
      ...ROWS,
      store: { ...STORE, customization: { colors: { primary: 'red;}</style><script>alert(1)</script>' } } },
    };
    const page = desenhar("/", perigoso) as SsrPage;
    expect(page.appAttrs).not.toContain("<script");
    expect(page.appAttrs).not.toMatch(/style="[^"]*"[^ ]/);
    expect(page.headHtml).not.toContain("<script");
  });
});

describe("A SPA adota o HTML do servidor", () => {
  it("`render()` compara a impressão digital e mantém o DOM quando ela coincide", () => {
    expect(DOM).toContain('const SSR_ATTR = "data-ssr"');
    expect(DOM).toMatch(/if \(ssr && ssr === fnv1a\(html\)\)/);
    // O atributo sai sempre no primeiro desenho: só vale para o HTML do servidor.
    expect(DOM).toContain("app.removeAttribute(SSR_ATTR)");
  });

  it("uma imagem já pintada não é escondida para voltar a aparecer", () => {
    // `fadeInImages` punha opacidade 0 em imagens que o visitante já estava a
    // ver — um piscar por cima de uma página pronta.
    expect(DOM).toMatch(/if \(img\.complete && img\.naturalWidth > 0\) return;/);
  });

  it("o servidor escreve `data-ssr` com a impressão digital e as folhas no `<head>`", () => {
    expect(PRERENDER).toContain('appAttrs: ` data-ssr="${page.hash}"');
    expect(PRERENDER).toContain("headHtml: page.headHtml");
  });

  it("se o pacote falhar, a página continua a ser servida com a versão simplificada", () => {
    // O pacote é um ficheiro gerado: não pode haver um caminho em que a sua
    // ausência devolva 500 numa loja que funcionava.
    expect(PRERENDER).toMatch(/await import\("\.\/_ssr\/render\.mjs"\)/);
    expect(PRERENDER).toMatch(/catch \(e\) \{[\s\S]{0,200}ssrPack = null;/);
    expect(PRERENDER).toContain("bodyHtml: page ? page.html : productHtml(");
    expect(PRERENDER).toContain("bodyHtml: homePage ? homePage.html : storeHomeHtml(");
  });
});

describe("Indexação — o que o servidor diz ao Google", () => {
  it("as lojas-modelo saem com noindex, follow", () => {
    // São demonstrações quase idênticas entre si: indexadas, competiam com as
    // lojas dos clientes pelas mesmas palavras.
    expect(PRERENDER).toContain("const modelo = isModelStore(store);");
    expect(PRERENDER).toMatch(/noindex: modelo, follow: true/);
    expect(PRERENDER).toMatch(/noindex: modelo \|\| items\.length === 0, follow: true/);
  });

  it("os URL da plataforma saem do host do pedido, não de um apex fixo", () => {
    // O apex redireciona (308) para `www.`: canónicos no apex eram um
    // redirecionamento em cada URL que o Google recebia.
    expect(PRERENDER).toContain("const baseUrl = platformOrigin(host);");
    expect(PRERENDER).not.toMatch(/const baseUrl = `https:\/\/\$\{PLATFORM_APEX\}`/);
  });

  it("os factos das páginas da plataforma vêm das constantes, não de texto escrito à mão", () => {
    // Estas páginas anunciaram ao Google «11.000 Kz por mês, ou 120.000 Kz por
    // ano» e «domínio próprio incluído» meses depois de ambos terem deixado de
    // ser verdade. A asserção é sobre o corpo da função — o comentário que conta
    // esta história pode (e deve) nomear os valores antigos.
    const inicio = PRERENDER.indexOf("function platformPages()");
    expect(inicio).toBeGreaterThan(0);
    const pagina = PRERENDER.slice(inicio, PRERENDER.indexOf("\n}", PRERENDER.indexOf("  };", inicio)));
    expect(pagina).toContain("platformPriceLabel()");
    expect(pagina).toContain("platformFaq(pronto)");
    expect(pagina).toContain("platformComingSoon(pronto)");
    expect(pagina).not.toMatch(/\d[\d .]*Kz/);
    expect(pagina).not.toMatch(/domínio próprio/i);
  });

  it("o FAQPage usa as mesmas perguntas que a página inicial mostra", () => {
    // O Google só aceita FAQ em dados estruturados quando as perguntas estão
    // visíveis na página.
    const faq = pack.platformFaq(false);
    expect(faq.length).toBeGreaterThan(2);
    const landing = pack.renderLandingPage({ host: "www.mobisno.store", path: "/" });
    for (const q of faq) expect(landing.html, `pergunta ausente da página: ${q.question}`).toContain(q.question);
    expect(PRERENDER).toContain("faqJsonLd(platformFaq(paymentsReady()))");
  });

  it("enquanto não há serviço de pagamentos, a FAQ não promete Multicaixa como disponível", () => {
    const resposta = pack.platformFaq(false).map((f) => f.answer).join(" ");
    expect(resposta).toMatch(/em breve/i);
    expect(resposta).toContain("WhatsApp");
  });
});
