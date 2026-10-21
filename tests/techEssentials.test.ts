/**
 * Modelo «Tech Essentials» — a faixa de marcas, o hover e a cor dos ícones.
 *
 * Três propriedades que só um teste protege, porque nada falha sem elas:
 *
 * 1. **A faixa tem sempre quatro marcas.** Mínimo e máximo quatro: o desenho é
 *    uma fila de quatro e menos do que isso deixa-a desequilibrada. O número
 *    vive num só sítio — o modelo desenha a faixa e materializa o array para o
 *    editor (`sections.materialize`), com a mesma função.
 * 2. **A faixa é uma secção removível** (`MODELO-GUIA.md` §7), com o slot no
 *    lugar onde estava, para o editor a poder repor.
 * 3. **O hover e os ícones usam a cor de acção da loja** (`var(--brand)`), não
 *    uma cor escrita à mão. O Dono troca a cor da loja e o modelo acompanha.
 *
 * As asserções sobre o HTML correm em **render real**; as que dependem do editor
 * (que toca DOM e não pode ser importado com `lib: ["ES2022"]`) são sobre o
 * texto-fonte, o padrão de `tests/comingSoon.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoreTemplate, StoreCustomization } from "../web/templates/types.js";

const ROOT = join(__dirname, "..");
const TEMPLATE = readFileSync(join(ROOT, "web/templates/techEssentials.ts"), "utf8");
const EDITOR = readFileSync(join(ROOT, "web/views/editor.ts"), "utf8");
const MODELS = readFileSync(join(ROOT, "web/supabase/models.ts"), "utf8");

const VIEW = {
  kind: "render",
  templateId: "tech-essentials",
  storeName: "Loja Teste",
  subdomain: "lojateste.sualoja.digital",
  header: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, storeName: "Loja Teste" },
  menu: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, items: [{ label: "Início" }] },
  banners: [],
  products: [
    { id: "a", name: "Portátil", description: "", category: "Portáteis", featured: true, physical: true, price: 1250000, imageUrl: "https://cdn/a.jpg", stock: null },
    { id: "b", name: "Auscultadores", description: "", category: "Áudio", featured: false, physical: true, price: 285000, imageUrl: "https://cdn/b.jpg", stock: null },
  ],
};

let tpl: StoreTemplate;

beforeAll(async () => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  // Especificador em constante: o modelo importa `esc` de `web/lib/dom.ts`, que
  // puxa `web/lib/routing.ts` (lê `location`), e o `tsc` compila `tests/` sem DOM.
  const especificador = "../web/templates/techEssentials.js";
  const mod = (await import(especificador)) as { techEssentialsTemplate: StoreTemplate };
  tpl = mod.techEssentialsTemplate;
  // O primeiro import transforma a árvore de módulos de `web/`; numa máquina
  // ocupada passa dos 10 s por omissão de um `beforeAll`.
}, 120_000);

/** Home do modelo com uma personalização qualquer. */
function home(custom: StoreCustomization = {}): string {
  return tpl.render(VIEW as never, custom as never);
}

/** Só a faixa de marcas, recortada do HTML da home. */
function faixa(html: string): string {
  const i = html.indexOf('data-tx-slot="brands"');
  expect(i, "slot da faixa de marcas não encontrado").toBeGreaterThan(-1);
  const resto = html.slice(i);
  const fim = resto.indexOf("<main");
  return fim > -1 ? resto.slice(0, fim) : resto;
}

describe("Faixa de marcas — sempre quatro, nem mais nem menos", () => {
  it("sem nada configurado, a faixa mostra quatro lugares", () => {
    const marcas = [...faixa(home()).matchAll(/data-tx-brand="(\d+)"/g)].map((m) => Number(m[1]));
    expect(marcas).toEqual([0, 1, 2, 3]);
  });

  it("com menos de quatro gravadas, os lugares que faltam continuam lá", () => {
    // O contrário deixava a fila desequilibrada e sem sítio para o Dono carregar
    // o quarto logótipo.
    const html = home({ techEssentials: { brands: [{ name: "Nexa" }, { name: "Aura" }] } });
    expect([...faixa(html).matchAll(/data-tx-brand=/g)]).toHaveLength(4);
    expect(faixa(html)).toContain("Nexa");
  });

  it("com mais de quatro gravadas, só quatro são desenhadas", () => {
    const brands = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }];
    const f = faixa(home({ techEssentials: { brands } }));
    expect([...f.matchAll(/data-tx-brand=/g)]).toHaveLength(4);
    expect(f).not.toContain(">E<");
  });

  it("o número de lugares vive só no modelo", () => {
    // Estava também numa constante do editor (`TECH_BRAND_SLOTS`). Dois números
    // diferentes davam uma faixa de quatro com um array de três: o quarto lugar
    // nunca gravava. A materialização passou para o modelo, e o editor deixou de
    // saber quantos lugares há.
    expect(/const BRAND_SLOTS = (\d+)/.exec(TEMPLATE)?.[1]).toBe("4");
    expect(EDITOR).not.toContain("TECH_BRAND_SLOTS");
    expect(EDITOR).not.toMatch(/brands\.length !== \d/);
  });

  it("a materialização deixa sempre quatro lugares, e só toca no que não está na forma certa", () => {
    const materializa = (custom: StoreCustomization): StoreCustomization => {
      const copia = JSON.parse(JSON.stringify(custom)) as StoreCustomization;
      tpl.sections!.materialize!(copia);
      return copia;
    };
    // Sem nada gravado: os quatro logótipos por omissão do modelo.
    const vazia = materializa({});
    expect(vazia.techEssentials?.brands).toHaveLength(4);
    expect(vazia.techEssentials!.brands!.every((b) => (b.imageUrl ?? "").startsWith("data:image/svg+xml"))).toBe(true);
    // Lista curta: os lugares que faltam ficam vazios, como na loja publicada.
    const curta = materializa({ techEssentials: { brands: [{ name: "Nexa" }, { name: "Aura" }], hideBrands: false } });
    expect(curta.techEssentials!.brands).toEqual([{ name: "Nexa" }, { name: "Aura" }, {}, {}]);
    expect(curta.techEssentials!.hideBrands).toBe(false);
    // Lista longa: fica com as quatro primeiras.
    const longa = materializa({ techEssentials: { brands: ["A", "B", "C", "D", "E"].map((name) => ({ name })) } });
    expect(longa.techEssentials!.brands!.map((b) => b.name)).toEqual(["A", "B", "C", "D"]);
    // Já com quatro: o mesmo array, intocado — o JSON gravado não muda.
    const quatro = { techEssentials: { brands: [{ name: "A" }, {}, { imageUrl: "https://cdn/x.png" }, { name: "D" }] } };
    const antes = quatro.techEssentials.brands;
    tpl.sections!.materialize!(quatro);
    expect(quatro.techEssentials.brands).toBe(antes);
  });

  it("materializar não muda nada no ecrã: a faixa é a mesma antes e depois", () => {
    // É a regra do `MODELO-GUIA.md` §6.1: escreve-se o que a loja já mostra,
    // senão abrir o editor mudava a loja (e o Dono gravava sem saber).
    const casos: StoreCustomization[] = [
      {},
      { techEssentials: { brands: [] } },
      { techEssentials: { brands: [{ name: "Nexa" }] } },
      { techEssentials: { brands: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }] } },
      { techEssentials: { hideBrands: true } },
    ];
    for (const custom of casos) {
      const antes = home(custom);
      const copia = JSON.parse(JSON.stringify(custom)) as StoreCustomization;
      tpl.sections!.materialize!(copia);
      expect(home(copia), JSON.stringify(custom)).toBe(antes);
    }
  });

  it("sem nada configurado, aparecem os quatro logótipos por omissão do modelo", () => {
    /*
     * Era este o defeito: os logótipos viviam só na base de fábrica do semeador,
     * e a galeria de modelos e a pré-visualização desenham o modelo com uma
     * personalização **vazia** — tal como uma loja acabada de criar. Resultado:
     * quatro «A sua marca» em vez de logótipos.
     */
    const f = faixa(home());
    expect([...f.matchAll(/<img /g)]).toHaveLength(4);
    expect(f).toContain("data:image/svg+xml");
    expect(f).not.toContain("A sua marca");
  });

  it("uma marca com logótipo mostra a imagem; um lugar esvaziado mostra o convite", () => {
    const comImagem = faixa(home({ techEssentials: { brands: [{ imageUrl: "https://cdn/nexa.png", name: "Nexa" }] } }));
    expect(comImagem).toContain("https://cdn/nexa.png");
    /*
     * Com lista gravada vale o que está lá: um lugar que o Dono esvaziou fica com
     * «A sua marca» e o nome editável por clique — o logótipo de demonstração
     * não reaparece contra a vontade dele.
     */
    const esvaziado = faixa(home({ techEssentials: { brands: [{ name: "Nexa" }, {}, {}, {}] } }));
    expect(esvaziado).toContain('data-edit="techEssentials.brands.1.name"');
    expect(esvaziado).toContain("A sua marca");
  });

  it("o editor pede a materialização ao modelo antes da baseline, sem comparar identificadores", () => {
    // Sem materialização, editar um nome com `setPath` criava `{0:…}` sem
    // `.length`, o template voltava aos valores por omissão e a edição sumia
    // (`MODELO-GUIA.md` §6.1). E a decisão é do modelo, não de um `if` no editor
    // (`.kiro/steering/modelos-secoes.md`).
    const antesDaBaseline = EDITOR.slice(0, EDITOR.indexOf("let savedJson = JSON.stringify(custom)"));
    expect(antesDaBaseline).toContain("materializeForEditing(tpl, custom)");
    expect(EDITOR).not.toContain('"tech-essentials"');
    expect(tpl.sections?.materialize, "o modelo não declara a materialização").toBeTypeOf("function");
  });

  it("cada marca tem carregamento de logótipo próprio, com a política de logótipo", () => {
    expect(EDITOR).toContain('id="tech-brand-input"');
    expect(EDITOR).toContain("techBrandTarget");
    // Uma marca é um logótipo (aceita SVG, é pequena), não um banner.
    // Uma marca é um logótipo (aceita SVG, é pequena), não um banner: a política
    // de validação tem de ser a do logótipo.
    const handler = EDITOR.slice(EDITOR.indexOf('$("#tech-brand-input")?.addEventListener'));
    expect(handler.slice(0, 1400)).toContain("LOGO_POLICY");
  });
});

describe("Faixa de marcas — secção removível", () => {
  it("esconder a faixa deixa o slot vazio, não apaga o lugar", () => {
    // O slot vazio é o que permite ao editor oferecer «Adicionar faixa de
    // marcas» no sítio onde ela estava.
    const html = home({ techEssentials: { hideBrands: true } });
    expect(html).toContain('data-tx-slot="brands"');
    expect(html).not.toContain("data-tx-brands");
  });

  it("o editor remove e repõe a faixa pelo mesmo campo", () => {
    expect(EDITOR).toContain("mountTechEssentialsSections");
    expect(EDITOR).toContain('techEssentials.hideBrands');
    expect(EDITOR).toContain("Adicionar faixa de marcas");
  });

  it("os dois modelos com secções removíveis partilham o mesmo botão", () => {
    /*
     * A propriedade é a partilha, não a contagem de uma cadeia: `addRemoveBtn` é
     * declarado uma vez e usado pelo Lumière e pelo Tech Essentials. Estava
     * fechado dentro de `mountLumiereSections`, e o segundo modelo teria de o
     * copiar — duas cópias divergem no rótulo à primeira alteração.
     */
    expect(EDITOR.match(/function addRemoveBtn\(/g) ?? []).toHaveLength(1);
    const usos = EDITOR.match(/addRemoveBtn\(/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(3); // a declaração + os dois modelos
    const techMount = EDITOR.slice(EDITOR.indexOf("function mountTechEssentialsSections"), EDITOR.indexOf("function mountLumiereSections"));
    expect(techMount).toContain("addRemoveBtn(");
    expect(techMount).toContain("addSlotAddBtn(");
  });
});

describe("Cor de acção — hover e ícones seguem a marca da loja", () => {
  it("o hover das ligações usa a cor de acção, não uma cor escrita à mão", () => {
    const html = home();
    // A regra é CSS porque `var(--brand)` não se interpola num modificador de
    // estado do Tailwind.
    expect(html).toMatch(/\.tx-link:hover\{color:var\(--brand/);
    expect(html).toContain('class="tx-link');
  });

  it("a cor dos ícones vai no próprio glifo, não no botão que o contém", () => {
    /*
     * A propriedade, e a razão de ela existir: `web/lib/ink.ts` tem a regra
     * `[data-ink] .material-symbols-outlined{color:var(--ink)}`, que acerta
     * **directamente** no glifo. Uma cor posta no botão só lhe chega por
     * herança, e um valor herdado perde sempre para uma regra que acerta no
     * elemento. Como a loja-modelo define `colors.text`, os ícones saíam
     * escuros — e foi isso que se viu duas vezes.
     */
    const html = home();
    const cabecalho = html.slice(0, html.indexOf("</nav>"));
    for (const marca of ["data-search-btn", "data-cart-link"]) {
      const i = cabecalho.indexOf(marca);
      expect(i, `${marca} ausente do cabeçalho`).toBeGreaterThan(-1);
      // O glifo que se segue ao hook tem de trazer a cor no seu próprio `style`.
      const depois = cabecalho.slice(i, i + 400);
      const glifo = /<span class="material-symbols-outlined"([^>]*)>/.exec(depois);
      expect(glifo, `${marca}: glifo não encontrado`).not.toBeNull();
      expect(glifo![1], `${marca}: a cor não está no glifo`).toContain("var(--brand");
    }
  });

  it("nenhuma cor de acção fica chumbada: o azul do modelo é só a omissão", () => {
    // `var(--brand,#0058be)` está certo; `color:#0058be` sozinho ignorava a cor
    // que o Dono escolheu.
    const html = home();
    const chumbadas = [...html.matchAll(/(?:color|background):\s*#0058be/g)];
    expect(chumbadas, "há azul escrito à mão fora do fallback de var(--brand)").toHaveLength(0);
  });

  it("a cor de marca por omissão do modelo é o azul eléctrico do desenho", () => {
    expect(tpl.defaultBrand).toBe("#0058be");
  });
});

describe("Loja-modelo — em português e com as quatro marcas", () => {
  it("os quatro logótipos por omissão vivem no modelo, não no semeador", () => {
    // Um valor por omissão do modelo é do modelo — como o título do hero e o
    // texto do rodapé. No semeador, não chegava à pré-visualização.
    expect(TEMPLATE).toContain("export function defaultTechBrands()");
    const gerador = TEMPLATE.slice(TEMPLATE.indexOf("function brandLogo("), TEMPLATE.indexOf("export function defaultTechBrands"));
    expect(gerador).toContain("data:image/svg+xml");
    expect(gerador).toContain("encodeURIComponent");
    expect(MODELS).not.toContain("const TECH_BRANDS");
  });

  it("a faixa é cinzenta neutra e as marcas mais escuras do que ela", () => {
    const f = faixa(home());
    expect(f).toContain("#f1f2f6");            // faixa
    expect(f).toContain(encodeURIComponent("#4b5563"));  // tinta dos logótipos
    // A palavra-marca de um lugar esvaziado usa o mesmo cinzento.
    expect(faixa(home({ techEssentials: { brands: [{}, {}, {}, {}] } }))).toContain("#4b5563");
  });

  it("o modelo de fábrica existe e aponta para este modelo", () => {
    expect(MODELS).toContain('name: "Tech Essentials"');
    expect(MODELS).toContain('templateId: "tech-essentials"');
  });

  it("não há texto em inglês no que o visitante lê", () => {
    // A pré-visualização mostra a loja-modelo: um texto em inglês aqui aparecia
    // na loja do Dono.
    const html = home();
    for (const palavra of ["Shop Now", "View Specs", "Latest Arrivals", "View All", "Add to cart", "Search"]) {
      expect(html, `inglês no HTML: ${palavra}`).not.toContain(palavra);
    }
    expect(html).toContain("Ver produtos");
    expect(html).toContain("Ver catálogo");
  });
});
