/**
 * Guardas de infraestrutura de SEO.
 *
 * Estes testes não verificam lógica de negócio — verificam duas invariantes que,
 * quando se quebram, tornam o site invisível no Google sem que nada falhe:
 *
 *  1. Nenhuma ligação interna pode usar o formato `#/...`. O Google descarta o
 *     fragmento de uma URL, por isso ligações com `#` não são seguidas: todos os
 *     produtos e categorias ficariam sem uma única ligação a apontar-lhes.
 *  2. `api/_seo.js` (JavaScript, corre nas funções serverless) tem de produzir
 *     exatamente o mesmo resultado que `src/services/seo.ts` e
 *     `src/services/slug.ts` (TypeScript, fonte de verdade). Se divergirem, o
 *     HTML pré-renderizado e a SPA mostram URLs ou preços diferentes — e o
 *     Google vê duas páginas onde só existe uma.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  storeTitle, productTitle, categoryTitle, storeDescription, productDescription,
  categoryDescription, truncate,
} from "../src/services/seo.js";
import { slugify, productSlugPath } from "../src/services/slug.js";
import { formatKz } from "../src/services/format.js";
import { resolveLocations, mapEmbedSrc, type StorePlace } from "../src/services/locations.js";

const ROOT = join(__dirname, "..");

/** Superfície de `api/_seo.js` exercitada por estes testes. */
interface ApiSeo {
  slugify(v: string): string;
  productSlugPath(p: { name: string; category?: string | null }): string;
  formatKz(v: number): string;
  truncate(v: string, max?: number): string;
  storeTitle(name: string): string;
  productTitle(product: string, store: string): string;
  categoryTitle(category: string, store: string): string;
  storeDescription(name: string, custom?: string | null): string;
  productDescription(i: { name: string; description?: string | null; priceLabel?: string | null; storeName: string }): string;
  categoryDescription(i: { category: string; storeName: string; count?: number; sampleNames?: string[]; priceFrom?: string | null }): string;
  identifierFromHost(host: string): string | null;
  metaTags(i: Record<string, unknown>): string;
  inject(shell: string, i: { title: string; tags: string; bodyHtml?: string; lang?: string }): string;
  storeHomeHtml(i: {
    storeName: string; description: string; logoUrl: string | null;
    products: { id: string; name: string; category: string | null; price: number; image_url: string | null }[];
    categories: string[]; base: string; brand: string; custom?: unknown;
  }): string;
  resolveLocations(block: unknown, footerLocation?: string): StorePlace[];
  mapEmbedSrc(place: StorePlace, fallbackAddress?: string): string;
  locationsHtml(custom: unknown): string;
}

// `api/_seo.js` é JavaScript puro: as funções serverless não passam pelo
// compilador, por isso o módulo está fora do `include` do tsconfig e não tem
// tipos. O import é suprimido e o resultado tipado pela interface acima.
// @ts-expect-error módulo JavaScript sem declarações de tipos
import * as apiSeoModule from "../api/_seo.js";

const apiSeo = apiSeoModule as unknown as ApiSeo;

function sourcesIn(dir: string): { file: string; text: string }[] {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(ROOT, dir, f), "utf8") }));
}

describe("SEO — ligações internas indexáveis", () => {
  it("nenhum modelo de loja gera ligações com fragmento (#/)", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourcesIn("web/templates")) {
      text.split("\n").forEach((line, i) => {
        // Ignora comentários — a documentação refere o formato antigo.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (code.includes("`#/loja/") || code.includes('href="#/')) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("as vistas públicas também não geram ligações com fragmento", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourcesIn("web/views")) {
      text.split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (code.includes("`#/loja/")) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("SEO — paridade entre as funções serverless e o domínio", () => {
  const nomes = ["Ténis de Corrida", "Beleza & Saúde", "  Vários   espaços  ", "Ação", "123", "!!!"];

  it("slugify produz o mesmo resultado nos dois módulos", () => {
    for (const n of nomes) {
      expect(apiSeo.slugify(n), `slugify(${JSON.stringify(n)})`).toBe(slugify(n));
    }
  });

  it("productSlugPath produz o mesmo caminho nos dois módulos", () => {
    const produtos = [
      { name: "Ténis Runner", category: "Calçado" },
      { name: "X", category: null },
      { name: "Camisola Térmica", category: "  " },
    ];
    for (const p of produtos) {
      expect(apiSeo.productSlugPath(p), `productSlugPath(${p.name})`).toBe(productSlugPath(p));
    }
  });

  it("formatKz produz o mesmo preço no servidor e no browser", () => {
    // Divergiu no passado: o servidor usava toLocaleString("pt-PT"), cujo
    // separador de milhares depende dos dados ICU do Node ("1 234" vs "1.234").
    for (const v of [0, 1, 999, 1000, 1234.5, 45000, 1234567.89]) {
      expect(apiSeo.formatKz(v), `formatKz(${v})`).toBe(formatKz(v));
    }
  });

  it("títulos e descrições são idênticos nos dois módulos", () => {
    expect(apiSeo.storeTitle("Sport AO")).toBe(storeTitle("Sport AO"));
    expect(apiSeo.productTitle("Nimbus", "Sport AO")).toBe(productTitle("Nimbus", "Sport AO"));
    expect(apiSeo.categoryTitle("Ténis", "Sport AO")).toBe(categoryTitle("Ténis", "Sport AO"));
    expect(apiSeo.storeDescription("Sport AO")).toBe(storeDescription("Sport AO"));
    expect(apiSeo.storeDescription("Sport AO", "À medida")).toBe(storeDescription("Sport AO", "À medida"));
    expect(apiSeo.productDescription({ name: "P", storeName: "L", priceLabel: "1,00 Kz" }))
      .toBe(productDescription({ name: "P", storeName: "L", priceLabel: "1,00 Kz" }));
    expect(apiSeo.categoryDescription({ category: "Ténis", storeName: "L", count: 3, sampleNames: ["A"] }))
      .toBe(categoryDescription({ category: "Ténis", storeName: "L", count: 3, sampleNames: ["A"] }));
    expect(apiSeo.truncate("a".repeat(300), 160)).toBe(truncate("a".repeat(300), 160));
  });

  it("identifierFromHost distingue lojas da plataforma", () => {
    expect(apiSeo.identifierFromHost("minhaloja.sualoja.digital")).toBe("minhaloja");
    expect(apiSeo.identifierFromHost("antiga.mobisno.store")).toBe("antiga");
    expect(apiSeo.identifierFromHost("mobisno.store")).toBeNull();
    expect(apiSeo.identifierFromHost("www.sualoja.digital")).toBeNull();
    expect(apiSeo.identifierFromHost("sualoja.digital")).toBeNull();
  });
});

describe("SEO — injeção no HTML servido", () => {
  const SHELL = `<!DOCTYPE html>
<html lang="pt-AO">
  <head>
    <title>MôBisno — Criar Loja Online em Angola</title>
    <meta name="description" content="plataforma" />
    <meta name="keywords" content="a, b" />
    <link rel="canonical" href="https://mobisno.store/" />
    <meta property="og:title" content="MôBisno" />
    <meta name="twitter:title" content="MôBisno" />
    <script type="application/ld+json">{"velho":true}</script>
  </head>
  <body><div id="app" class="w-full"></div></body>
</html>`;

  const tags = apiSeo.metaTags({
    title: "Nimbus — Sport AO",
    description: "Ténis leve.",
    canonical: "https://sportao.sualoja.digital/produto/tenis/nimbus",
    image: "https://cdn/x.webp",
    type: "product",
    siteName: "Sport AO",
  });
  const out = apiSeo.inject(SHELL, {
    title: "Nimbus — Sport AO",
    tags,
    lang: "pt-AO",
    bodyHtml: "<h1>Nimbus</h1><p>45.000,00 Kz</p>",
  });

  it("substitui o título em vez de acrescentar um segundo", () => {
    expect((out.match(/<title>/g) ?? [])).toHaveLength(1);
    expect(out).toContain("<title>Nimbus — Sport AO</title>");
  });

  it("remove o canónico da plataforma (senão toda a loja apontava para mobisno.store)", () => {
    expect(out).not.toContain('rel="canonical" href="https://mobisno.store/"');
    expect(out).toContain('rel="canonical" href="https://sportao.sualoja.digital/produto/tenis/nimbus"');
  });

  it("não deixa meta duplicadas da plataforma", () => {
    expect((out.match(/name="description"/g) ?? [])).toHaveLength(1);
    expect((out.match(/property="og:title"/g) ?? [])).toHaveLength(1);
    expect(out).not.toContain('name="keywords"');
    expect(out).not.toContain('{"velho":true}');
  });

  it("põe conteúdo real dentro de #app (é isto que torna a página indexável)", () => {
    expect(out).not.toMatch(/<div id="app"[^>]*>\s*<\/div>/);
    expect(out).toContain("<h1>Nimbus</h1>");
    expect(out).toContain("45.000,00 Kz");
  });

  it("páginas privadas saem com noindex", () => {
    const priv = apiSeo.metaTags({
      title: "Carrinho", description: "", canonical: "https://l.x/carrinho", noindex: true,
    });
    expect(priv).toContain('content="noindex, nofollow"');
  });

  it("páginas públicas permitem imagem grande no resultado", () => {
    expect(tags).toContain("max-image-preview:large");
  });
});

describe("SEO — conteudo presente no HTML mas invisivel ao visitante", () => {
  const html = apiSeo.storeHomeHtml({
    storeName: "Juddy Cosmetics",
    description: "Compre online na Juddy Cosmetics em Angola.",
    logoUrl: "https://cdn/logo.webp",
    products: [
      { id: "1", name: "Perfume Capilar Bee Bee", category: "Cabelos", price: 30000, image_url: null },
      { id: "2", name: "Lip Oil", category: "Labios", price: 15000, image_url: null },
    ],
    categories: ["Cabelos", "Labios"],
    base: "",
    brand: "#C2185B",
  });

  it("o texto que posiciona a loja continua no HTML servido", () => {
    // Se isto falhar, os rastreadores que nao executam JavaScript deixam de ver
    // qualquer conteudo e as lojas voltam a ser invisiveis na pesquisa.
    expect(html).toContain("<h1>Juddy Cosmetics</h1>");
    expect(html).toContain("Perfume Capilar Bee Bee");
    expect(html).toContain("30.000,00 Kz");
    expect(html.match(/href="\/produto\//g) ?? []).toHaveLength(2);
  });

  it("o visitante ve o ecra de carregamento, nao a pagina de texto", () => {
    expect(html).toContain('class="mb-boot"');
    // Recorte em vez de display:none — conteudo escondido com display:none e
    // desvalorizado pelo Google.
    expect(html).toMatch(/\.mb-ssr\{position:absolute;width:1px/);
    expect(html).not.toMatch(/\.mb-ssr\{[^}]*display:none/);
  });

  it("o ecra de carregamento nao entra na arvore de acessibilidade", () => {
    expect(html).toContain('class="mb-boot" aria-hidden="true"');
  });
});

describe("SEO — paridade das localizações entre api/_seo.js e src/services/locations.ts", () => {
  // Casos escolhidos para percorrer os quatro degraus da cascata de
  // `resolveLocations` e as duas saídas de `mapEmbedSrc`, mais as entradas
  // malformadas que já existem gravadas em produção (JSON editável à mão).
  const casos: { nome: string; block: unknown; footer?: string }[] = [
    { nome: "lista com coordenadas e sem coordenadas", block: { type: "location", title: "Onde estamos", places: [
      { name: "Talatona", address: "Via S8, Talatona", lat: -8.918, lng: 13.184 },
      { name: "Baixa", address: "Rua Rainha Ginga 12" },
      { address: "Benfica" },
    ] } },
    { nome: "lista com uma única localização", block: { places: [{ name: "Loja", lat: 0, lng: 0 }] } },
    { nome: "localização única legada (morada e coordenadas)", block: { type: "location", address: "Luanda Sul", lat: -8.9, lng: 13.2 } },
    { nome: "localização única legada (só morada)", block: { type: "location", address: "Cacuaco" } },
    { nome: "places vazio com morada legada no bloco", block: { places: [], address: "Viana" } },
    { nome: "places só com entradas inúteis e morada legada", block: { places: [null, 3, "x", []], address: "Viana" } },
    { nome: "sem nada, com morada de rodapé", block: { type: "location" }, footer: "Morro Bento" },
    { nome: "sem nada e sem rodapé", block: { type: "location" } },
    { nome: "rodapé só com espaços", block: {}, footer: "   " },
    { nome: "places não é array", block: { places: { address: "x" } }, footer: "Kilamba" },
    { nome: "coordenadas de tipo errado", block: { places: [{ address: "A", lat: "-8.9", lng: 13.2 }] } },
    { nome: "coordenadas não finitas", block: { places: [{ address: "A", lat: Number.NaN, lng: Infinity }] } },
    { nome: "morada só com espaços na entrada", block: { places: [{ name: "  ", address: "  " }] }, footer: "Cazenga" },
    { nome: "bloco nulo", block: null, footer: "Talatona" },
    { nome: "bloco que é número", block: 7 },
    { nome: "bloco que é array", block: [{ address: "A" }], footer: "Cazenga" },
    { nome: "bloco que é cadeia", block: "location" },
  ];

  it("resolveLocations devolve as mesmas localizações nos dois módulos", () => {
    for (const { nome, block, footer } of casos) {
      const esperado = resolveLocations(block, footer);
      expect(apiSeo.resolveLocations(block, footer), `resolveLocations — ${nome}`).toEqual(esperado);
      // A garantia de que quem desenha pode iterar sem casos especiais.
      expect(apiSeo.resolveLocations(block, footer).length, `≥ 1 localização — ${nome}`).toBeGreaterThan(0);
    }
  });

  it("mapEmbedSrc produz o mesmo URL de mapa nos dois módulos", () => {
    for (const { nome, block, footer } of casos) {
      const places = resolveLocations(block, footer);
      places.forEach((p, j) => {
        expect(apiSeo.mapEmbedSrc(p, footer), `mapEmbedSrc — ${nome} [${j}]`).toBe(mapEmbedSrc(p, footer));
      });
    }
  });

  it("o HTML pré-renderizado traz todos os mapas e as respetivas moradas", () => {
    // R5.10: sem JavaScript, o rastreador tem de ver o mesmo que a SPA mostra.
    const custom = {
      footer: { location: "Morro Bento" },
      blocks: [
        { type: "text", title: "Sobre" },
        { type: "location", title: "As nossas lojas", places: [
          { name: "Talatona", address: "Via S8, Talatona", lat: -8.918, lng: 13.184 },
          { name: "Baixa", address: "Rua Rainha Ginga 12" },
          { address: "Benfica" },
        ] },
        { type: "location", address: "Cacuaco" },
      ],
    };
    const html = apiSeo.locationsHtml(custom);

    expect(html).toContain("As nossas lojas");
    for (const morada of ["Via S8, Talatona", "Rua Rainha Ginga 12", "Benfica", "Cacuaco"]) {
      expect(html, `morada no HTML: ${morada}`).toContain(morada);
    }
    for (const nome of ["Talatona", "Baixa"]) {
      expect(html, `nome no HTML: ${nome}`).toContain(nome);
    }
    // Um mapa por localização: três do primeiro bloco, um do segundo.
    expect(html.match(/<iframe /g) ?? []).toHaveLength(4);
    for (const block of custom.blocks.filter((b) => b.type === "location")) {
      for (const place of resolveLocations(block, "Morro Bento")) {
        const src = mapEmbedSrc(place, "Morro Bento").replace(/&/g, "&amp;");
        expect(html, `src do mapa: ${src}`).toContain(src);
      }
    }
  });

  it("locationsHtml é total: qualquer personalização malformada não lança nem inventa mapas", () => {
    for (const custom of [null, undefined, 5, "x", [], { blocks: null }, { blocks: [null, 3, "y"] },
      { blocks: [{ type: "location" }], footer: 7 }, { blocks: [{ type: "text" }] }]) {
      expect(() => apiSeo.locationsHtml(custom), `locationsHtml(${JSON.stringify(custom)})`).not.toThrow();
    }
    // Sem bloco `location` não sai HTML de localizações.
    expect(apiSeo.locationsHtml({ blocks: [{ type: "text", title: "Sobre" }] })).toBe("");
    // Bloco `location` sem morada nenhuma cai na morada predefinida, tal como a SPA.
    const vazio = apiSeo.locationsHtml({ blocks: [{ type: "location" }] });
    expect(vazio).toContain("Luanda, Angola");
    expect(vazio).toContain(mapEmbedSrc({}).replace(/&/g, "&amp;"));
  });

  it("a página inicial servida inclui as localizações da loja", () => {
    const custom = { blocks: [{ type: "location", title: "Onde estamos", places: [{ name: "Talatona", address: "Via S8" }] }] };
    const html = apiSeo.storeHomeHtml({
      storeName: "Juddy Cosmetics",
      description: "Compre online na Juddy Cosmetics em Angola.",
      logoUrl: null,
      products: [],
      categories: [],
      base: "",
      brand: "#C2185B",
      custom,
    });
    expect(html).toContain("Onde estamos");
    expect(html).toContain("Via S8");
    expect(html).toContain("<iframe ");
  });
});
