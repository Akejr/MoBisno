/**
 * Uma secção acrescentada sai **no desenho do modelo** onde foi acrescentada.
 *
 * ## O defeito que estas guardas impedem
 *
 * O Dono estava no Lumière — que já traz testemunhos (`data-lx-testi`) e mapa
 * («As nossas lojas») — e o menu «Adicionar secção» oferecia os dois outra vez.
 * Ao acrescentar, a secção vinha duplicada **e com outro desenho**: cartões
 * brancos de cantos arredondados e tipografia preta, no meio de um modelo
 * serifado, creme e de cantos retos.
 *
 * Duas causas, ambas com guarda aqui:
 *
 * 1. o menu decidia comparando `store.templateId` com identificadores escritos
 *    à mão (a mercearia e o modelo escuro), de modelos que já tinham saído do
 *    registo, e sem qualquer noção de «este modelo já tem esta secção»;
 * 2. `newBlock` criava o bloco **sem `variant`**, e o desenho caía num valor por
 *    omissão genérico de `blocks.ts`.
 *
 * O mesmo vício sobrevivia em mais três sítios do editor, todos com guarda aqui:
 * a omissão da variante de testemunhos (`=== "galeria"`), a materialização das
 * marcas (`=== "tech-essentials"`) e as cores de fundo (um mapa por
 * `templateId` onde o Tech Essentials não estava, e que lhe dava o creme de
 * outro modelo). Passaram a ser declarados pelo modelo.
 *
 * ## Como se prova
 *
 * Por **render real**: desenha-se a secção acrescentada em cada modelo e
 * verifica-se que traz a linguagem visual desse modelo e não a de outro. Um
 * teste que afirmasse «o HTML contém `rounded-xl`» estaria a afirmar o
 * mecanismo; o que interessa é a propriedade — a secção do Lumière não sai com o
 * desenho do Galeria, e nenhum modelo oferece o que já tem.
 *
 * Ver `MODELO-GUIA.md` §9.3 e `.kiro/steering/modelos-secoes.md`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { BlockType, StoreTemplate } from "../web/templates/types.js";

/**
 * `sectionRules.ts` chega por `import()` com o especificador **numa constante**.
 *
 * Não é preciosismo: ele importa `newBlock` de `blocks.ts`, que importa `esc` de
 * `web/lib/dom.ts`, que puxa `web/lib/routing.ts` — e essa lê `location`,
 * `history` e `window`. Com um import estático (ou com o especificador literal
 * num dinâmico) o `tsc` segue-o e compila esses ficheiros num programa declarado
 * sem DOM (`lib: ["ES2022"]`), partindo o `npm run build`.
 *
 * A forma é declarada aqui à mão, e não com `typeof import(…)`, pelo mesmo
 * motivo: qualquer referência ao módulo em posição de tipo volta a trazê-lo para
 * o programa.
 */
interface Rules {
  BLOCK_TYPES: readonly BlockType[];
  BLOCK_MENU: Record<BlockType, { icon: string; title: string; desc: string }>;
  BLOCK_LABELS: Record<BlockType, string>;
  DEFAULT_SECTION_BACKGROUNDS: readonly { label: string; value: string }[];
  addableSections(t: StoreTemplate | undefined): BlockType[];
  isNativeSection(t: StoreTemplate | undefined, type: BlockType): boolean;
  sectionVariant(t: StoreTemplate | undefined, type: BlockType): string | undefined;
  newBlockFor(t: StoreTemplate | undefined, type: BlockType): { type: string; variant?: string };
  sectionMenu(t: StoreTemplate | undefined, o: { structural: boolean }): { type: BlockType }[];
  sectionBackgrounds(t: StoreTemplate | undefined): { label: string; value: string }[];
  materializeForEditing(t: StoreTemplate | undefined, custom: Record<string, unknown>): void;
}

/** O que este ficheiro usa de `blocks.ts` (mesmo contorno do especificador em constante). */
interface Blocks {
  infoByVariant(variant: string, b: unknown, i: number, ctx: unknown): string;
}

let R: Rules;
let B: Blocks;

/** Modelos prontos do registo, lidos em execução (ver `beforeAll`). */
let PRONTOS: StoreTemplate[];

const MODELOS = ["galeria", "desportivo", "beauty", "lumiere", "tech-essentials"] as const;

/** Ficheiro de cada modelo (o id nem sempre é o nome do ficheiro). */
const FICHEIRO: Record<string, string> = { "tech-essentials": "techEssentials" };

const VIEW = {
  kind: "render",
  templateId: "galeria",
  storeName: "Loja Teste",
  subdomain: "lojateste.sualoja.digital",
  header: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, storeName: "Loja Teste" },
  menu: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, items: [] },
  banners: [],
  products: [
    { id: "a", name: "Camisola", description: "", category: "Camisolas", featured: false, physical: true, price: 12000, imageUrl: "https://cdn/a.jpg", stock: null },
  ],
};

beforeAll(async () => {
  // `location` mínimo antes de qualquer import de `web/`: `storeBasePath` lê
  // `location.hostname` para saber se está num subdomínio de loja.
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  const especificador = "../web/templates/sectionRules.js";
  R = (await import(especificador)) as Rules;
  const espBlocos = "../web/templates/blocks.js";
  B = (await import(espBlocos)) as Blocks;
  // O registo entra pelo mesmo contorno (especificador em constante), para as
  // guardas valerem para **qualquer** modelo registado e não só para a lista
  // escrita à mão em `MODELOS`.
  const espRegisto = "../web/templates/registry.js";
  const reg = (await import(espRegisto)) as { TEMPLATE_REGISTRY: StoreTemplate[] };
  PRONTOS = reg.TEMPLATE_REGISTRY.filter((t) => t.ready);
  expect(PRONTOS.length, "nenhum modelo pronto no registo").toBeGreaterThan(0);
  // O primeiro import transforma a árvore de módulos de `web/`; numa máquina
  // ocupada passa dos 10 s por omissão de um `beforeAll`.
}, 120_000);

/** O modelo registado, lido do próprio ficheiro do modelo. */
async function modeloDe(id: string): Promise<StoreTemplate> {
  const especificador = `../web/templates/${FICHEIRO[id] ?? id}.js`;
  const mod = (await import(especificador)) as Record<string, StoreTemplate>;
  const t = Object.values(mod).find((x) => x?.id === id);
  expect(t, `${id}: modelo não exportado`).toBeTruthy();
  return t!;
}

/**
 * Só a secção acrescentada, recortada do HTML da home.
 *
 * O recorte importa: `blocksHtml` é seguido pelas secções nativas do modelo e
 * pelo rodapé, e no Lumière essas trazem `rounded-xl` nos mapas das boutiques.
 * Sem cortar, uma asserção sobre os cantos da secção acrescentada estaria a ler
 * os cantos de outra secção.
 */
function soASeccao(html: string): string {
  const inicio = html.indexOf('data-edit-block="0"');
  expect(inicio, "secção acrescentada não encontrada no HTML").toBeGreaterThan(-1);
  const resto = html.slice(inicio);
  const fim = [resto.indexOf("data-lumiere-slot"), resto.indexOf("<footer"), resto.indexOf("<section class=\"py-24")]
    .filter((i) => i > -1);
  return fim.length ? resto.slice(0, Math.min(...fim)) : resto;
}

/** A secção acrescentada de um modelo, desenhada de verdade. */
async function comSeccao(id: string, tipo: BlockType): Promise<string> {
  const tpl = await modeloDe(id);
  const bloco = R.newBlockFor(tpl, tipo);
  return soASeccao(tpl.render(VIEW as never, { blocks: [bloco] } as never));
}

describe("O menu não oferece o que o modelo já tem", () => {
  it("o Lumière não oferece testemunhos nem mapa: já os traz", async () => {
    const tpl = await modeloDe("lumiere");
    // Era este o pedido: «se já tiver mapa e testemunhos, no botão de adicionar
    // secção já não aparece».
    expect(R.isNativeSection(tpl, "testimonials")).toBe(true);
    expect(R.isNativeSection(tpl, "location")).toBe(true);
    const oferecidas = R.addableSections(tpl);
    expect(oferecidas).not.toContain("testimonials");
    expect(oferecidas).not.toContain("location");
    // E continua a oferecer o que não tem, senão a correção teria fechado o menu.
    expect(oferecidas).toContain("info");
    expect(oferecidas).toContain("text");
  });

  it("as secções nativas de um modelo estão de facto no HTML que ele desenha", async () => {
    // A declaração tem de corresponder ao ecrã: declarar «nativo» o que não está
    // desenhado esconderia a secção do menu sem o Dono a ter em lado nenhum.
    const tpl = await modeloDe("lumiere");
    const html = tpl.render(VIEW as never, {} as never);
    expect(html).toContain("data-lx-testi");
    expect(html).toContain("data-lx-boutiques");
  });

  it("nenhum modelo oferece uma secção que declara como nativa", async () => {
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      for (const t of tpl.sections?.native ?? []) {
        expect(R.addableSections(tpl), `${id} oferece a secção nativa ${t}`).not.toContain(t);
      }
    }
  });

  it("um modelo pronto (locked) não oferece secções estruturais", async () => {
    const tpl = await modeloDe("desportivo");
    const tipos = R.sectionMenu(tpl, { structural: false }).map((s) => s.type);
    expect(tipos).not.toContain("testimonials");
    expect(tipos).not.toContain("location");
    expect(tipos).toContain("info");
  });

  it("a decisão não vem de comparar identificadores de modelo escritos à mão", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const editor = readFileSync(join(__dirname, "..", "web/views/editor.ts"), "utf8");
    // Só o código conta: os comentários explicam precisamente o que já não se faz.
    const codigo = editor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Nenhuma comparação com o identificador do modelo, nem um mapa indexado por
    // ele: cada uma destas era uma regra por modelo escondida no editor, que
    // deixava de disparar em silêncio quando o modelo mudava de nome ou saía.
    expect(codigo).not.toMatch(/templateId\s*[!=]==?/);
    expect(codigo).not.toMatch(/[!=]==?\s*store!?\.templateId/);
    expect(codigo).not.toMatch(/\[\s*store!?\.templateId\s*\]/);
    expect(codigo).not.toContain("productsOnly");
    // O menu, as variantes e a materialização saem da declaração do modelo.
    expect(codigo).toContain("sectionMenu(tpl");
    expect(codigo).toContain("newBlockFor(tpl");
    expect(codigo).toContain("sectionBackgrounds(tpl)");
    expect(codigo).toContain("materializeForEditing(tpl, custom)");
  });
});

describe("Cores de fundo das secções — declaradas pelo modelo", () => {
  it("cada modelo pronto declara as suas, e o seletor oferece-as a seguir a «Padrão» e «Branco»", () => {
    for (const tpl of PRONTOS) {
      const proprias = tpl.sections?.backgrounds ?? [];
      // Sem declaração o modelo recebia a cor de outro — foi o que aconteceu ao
      // Tech Essentials, que não estava no mapa do editor e herdava o creme.
      expect(proprias.length, `${tpl.id}: sem cores de fundo declaradas`).toBeGreaterThan(0);
      const oferecidas = R.sectionBackgrounds(tpl);
      expect(oferecidas.slice(0, 2).map((c) => c.value), tpl.id).toEqual(["", "#ffffff"]);
      expect(oferecidas.slice(2), tpl.id).toEqual([...proprias]);
    }
  });

  it("um modelo que não declara cores recebe a omissão genérica, não a de outro modelo", () => {
    const semRegras = { sections: undefined } as unknown as StoreTemplate;
    expect(R.sectionBackgrounds(semRegras).slice(2)).toEqual([...R.DEFAULT_SECTION_BACKGROUNDS]);
    expect(R.sectionBackgrounds(undefined).slice(2)).toEqual([...R.DEFAULT_SECTION_BACKGROUNDS]);
  });

  it("os modelos com paletas diferentes não oferecem as mesmas cores", async () => {
    // A propriedade, não a lista: o Tech Essentials (azul-gelo) não pode
    // oferecer o creme do Lumière, e o Desportivo (neutral) não o do Galeria.
    const valores = async (id: string): Promise<string[]> =>
      ((await modeloDe(id)).sections?.backgrounds ?? []).map((c) => c.value.toLowerCase());
    const tech = await valores("tech-essentials");
    for (const outro of ["lumiere", "galeria", "desportivo"]) {
      const deOutro = await valores(outro);
      expect(tech.filter((v) => deOutro.includes(v)), `tech-essentials partilha cores com ${outro}`).toEqual([]);
    }
  });

  it("cada cor oferecida chega mesmo à secção desenhada", async () => {
    // Uma cor que o desenho recusasse (`safeCssColor`) dava uma amostra no
    // seletor que, clicada, não fazia nada.
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      for (const cor of R.sectionBackgrounds(tpl).filter((c) => c.value)) {
        const bloco = { ...R.newBlockFor(tpl, "text"), bg: cor.value };
        const html = soASeccao(tpl.render(VIEW as never, { blocks: [bloco] } as never));
        expect(html, `${id}: a cor «${cor.label}» não chegou à secção`).toContain(`style="background:${cor.value}"`);
      }
    }
  });
});

describe("Materialização para o editor — declarada pelo modelo", () => {
  /** Personalizações por onde abrir o editor: vazia, parcial e já completa. */
  const CASOS: Record<string, unknown>[] = [
    {},
    { techEssentials: { brands: [{ name: "Nexa" }] } },
    { techEssentials: { brands: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }] } },
    { hero: { title: "Olá" }, blocks: [{ type: "text", title: "T", text: "x" }] },
  ];

  it("abrir o editor não muda nada no ecrã, em nenhum modelo", () => {
    // `MODELO-GUIA.md` §6.1: materializa-se o que a loja já mostra. Se o HTML
    // mudasse, abrir o editor mudava a loja — e o Dono gravava sem saber.
    for (const tpl of PRONTOS) {
      for (const caso of CASOS) {
        const antes = tpl.render(VIEW as never, JSON.parse(JSON.stringify(caso)) as never);
        const copia = JSON.parse(JSON.stringify(caso)) as Record<string, unknown>;
        R.materializeForEditing(tpl, copia);
        expect(tpl.render(VIEW as never, copia as never), `${tpl.id}: ${JSON.stringify(caso)}`).toBe(antes);
      }
    }
  });

  it("materializar duas vezes é o mesmo que materializar uma", () => {
    for (const tpl of PRONTOS) {
      for (const caso of CASOS) {
        const uma = JSON.parse(JSON.stringify(caso)) as Record<string, unknown>;
        R.materializeForEditing(tpl, uma);
        const duas = JSON.parse(JSON.stringify(uma)) as Record<string, unknown>;
        R.materializeForEditing(tpl, duas);
        expect(duas, `${tpl.id}: não é idempotente`).toEqual(uma);
      }
    }
  });

  it("um modelo sem materialização própria não toca na Personalização", () => {
    const semRegras = { sections: { variants: {} } } as unknown as StoreTemplate;
    const custom = { techEssentials: { brands: [{ name: "x" }] } };
    R.materializeForEditing(semRegras, custom);
    expect(custom).toEqual({ techEssentials: { brands: [{ name: "x" }] } });
  });
});

describe("A variante desenhada vem no HTML — o editor não a deduz", () => {
  it("cada secção acrescentada declara a variante com que foi desenhada, em todos os modelos", async () => {
    // O seletor «Modelo: …» do editor lê `data-block-variant`; deduzir a variante
    // do identificador do modelo era o `=== "galeria"` que saiu do editor.
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      for (const t of R.addableSections(tpl)) {
        const html = await comSeccao(id, t);
        expect(html, `${id}/${t}`).toContain(`data-block-type="${t}" data-block-variant="${R.sectionVariant(tpl, t)}"`);
      }
    }
  });

  it("um bloco gravado sem variante também diz qual desenhou", async () => {
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      const html = tpl.render(VIEW as never, { blocks: [{ type: "testimonials", title: "T", items: [] }] } as never);
      expect(html, id).toMatch(/data-block-type="testimonials" data-block-variant="(cards|editorial|marquee)"/);
    }
  });
});

describe("A secção acrescentada nasce com o desenho do modelo", () => {
  it("cada modelo declara a variante de cada secção que aceita", async () => {
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      for (const t of R.addableSections(tpl)) {
        expect(R.sectionVariant(tpl, t), `${id}: secção ${t} sem variante declarada`).toBeTruthy();
      }
    }
  });

  it("a variante fica gravada no bloco, não deixada ao valor por omissão", async () => {
    // Gravar à criação é o que impede o desenho de mudar por baixo dos pés do
    // Dono quando o valor por omissão de `blocks.ts` mudar.
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      for (const t of R.addableSections(tpl)) {
        const bloco = R.newBlockFor(tpl, t) as { type: string; variant?: string };
        expect(bloco.type).toBe(t);
        expect(bloco.variant, `${id}/${t}: bloco criado sem variante`).toBe(R.sectionVariant(tpl, t));
      }
    }
  });

  it("no Lumière a secção acrescentada é serifada, creme e de cantos retos", async () => {
    for (const tipo of ["info", "text"] as BlockType[]) {
      const bloco = await comSeccao("lumiere", tipo);
      // A tipografia é a do modelo, não a genérica.
      expect(bloco, `${tipo}: sem a serifada do modelo`).toContain("lx-serif");
      expect(bloco, `${tipo}: ficou com a tipografia genérica`).not.toContain("font-black tracking-tight text-gray-900");
      // Cantos retos: no Lumière nem os chips de categoria levam `rounded`.
      expect(bloco, `${tipo}: ganhou cantos arredondados`).not.toMatch(/rounded-(?:xl|2xl|3xl)/);
      // A cor do corpo é a do modelo.
      expect(bloco).toContain("#464742");
    }
  });

  it("no Beauty a secção acrescentada usa a serifada e as camadas tonais", async () => {
    const bloco = await comSeccao("beauty", "info");
    expect(bloco).toContain("Noto Serif");
    expect(bloco).toContain("#f6f3f2");
    expect(bloco).not.toContain("font-black tracking-tight text-gray-900");
  });

  it("no Desportivo a secção acrescentada usa a paleta neutral do modelo", async () => {
    const bloco = await comSeccao("desportivo", "info");
    expect(bloco).toContain("text-neutral-900");
    // `gray` é a paleta do desenho genérico; este modelo é todo em `neutral`.
    expect(bloco).not.toContain("text-gray-900");
  });

  it("no Tech Essentials a secção acrescentada usa a tinta e os cantos do modelo", async () => {
    for (const tipo of ["info", "text", "testimonials", "location"] as BlockType[]) {
      const bloco = await comSeccao("tech-essentials", tipo);
      // Tinta de ardósia e tinta secundária do modelo, não o cinzento genérico.
      expect(bloco, `${tipo}: sem a tinta do modelo`).toContain("#0b1c30");
      expect(bloco, `${tipo}: ficou com a tipografia genérica`).not.toContain("font-black tracking-tight text-gray-900");
      // Cantos de 8px, como os cartões de produto da home — nunca 24px.
      expect(bloco, `${tipo}: ganhou cantos de outro modelo`).not.toMatch(/rounded-(?:2xl|3xl)/);
    }
  });

  it("dois modelos diferentes não desenham a mesma secção da mesma maneira", async () => {
    // É esta a propriedade que faltava: o desenho segue o modelo. Se os dois
    // HTML forem iguais, a secção não é «100% desse modelo» em nenhum dos dois.
    expect(await comSeccao("lumiere", "info")).not.toBe(await comSeccao("desportivo", "info"));
  });

  it("o desenho declarado em `sections.style` é exactamente o que o modelo desenha", async () => {
    /*
     * Prova as duas metades de uma vez: o modelo passa o seu desenho a
     * `blocksHtml` — o Galeria declarava variantes mas não passava desenho
     * nenhum, e as suas secções saíam no genérico —, e o desenho que declara ao
     * editor (para as miniaturas do seletor de variantes) é esse mesmo.
     *
     * A comparação é com `blocks.ts` a desenhar o mesmo bloco com o desenho
     * declarado: nada aqui afirma classes. «Informação» não usa a cor de marca
     * nem a morada do rodapé, por isso só o contentor tem de vir do HTML.
     */
    for (const id of MODELOS) {
      const tpl = await modeloDe(id);
      expect(tpl.sections?.style, `${id}: modelo pronto sem desenho declarado`).toBeTruthy();
      const bloco = R.newBlockFor(tpl, "info");
      const home = tpl.render(VIEW as never, { blocks: [bloco] } as never);
      const i = home.indexOf('<section data-edit-block="0"');
      const seccao = home.slice(i, home.indexOf("</section>", i) + "</section>".length);
      const container = /^<section[^>]*>\s*<div class="([^"]+)">/.exec(seccao)?.[1];
      expect(container, `${id}: contentor não encontrado`).toBeTruthy();
      const esperado = B.infoByVariant(R.sectionVariant(tpl, "info") ?? "lado", bloco, 0, {
        container, brand: "var(--brand)", style: tpl.sections?.style,
      });
      expect(seccao, id).toBe(esperado);
    }
  });

  it("um modelo que não declara nada mantém o desenho de sempre", async () => {
    // Compatibilidade: as lojas em produção têm blocos gravados sem `variant`, e
    // nenhuma pode mudar de aspeto por causa desta alteração.
    const semRegras = { sections: undefined } as unknown as StoreTemplate;
    expect(R.addableSections(semRegras)).toEqual([...R.BLOCK_TYPES]);
    for (const t of R.BLOCK_TYPES) {
      expect(R.sectionVariant(semRegras, t)).toBeUndefined();
      expect((R.newBlockFor(semRegras, t) as { variant?: string }).variant).toBeUndefined();
    }
  });
});

describe("Um modelo novo não entra sem declarar as suas secções", () => {
  /*
   * As guardas de cima percorrem `MODELOS`, uma lista escrita à mão. Um modelo
   * registado a seguir não estaria em lado nenhum: passava a oferecer tudo, com
   * o desenho genérico, e nada falhava — que é exactamente como o `if` por
   * `templateId` no editor envelheceu até deixar de disparar.
   */
  it("todos os modelos prontos do registo declaram as suas secções", () => {
    for (const tpl of PRONTOS) {
      expect(tpl.sections, `${tpl.id}: modelo pronto sem declaração de secções`).toBeTruthy();
    }
  });

  it("cada secção que um modelo pronto oferece tem variante declarada", () => {
    for (const tpl of PRONTOS) {
      const oferecidas = R.addableSections(tpl);
      for (const t of oferecidas) {
        expect(R.sectionVariant(tpl, t), `${tpl.id}: oferece ${t} sem variante declarada`).toBeTruthy();
      }
    }
  });

  it("cada modelo pronto tem asserção de desenho neste ficheiro", () => {
    // O que torna a guarda útil: quem registar um modelo tem de vir aqui provar
    // que a secção acrescentada sai no desenho dele.
    for (const tpl of PRONTOS) {
      expect(MODELOS as readonly string[], `${tpl.id}: sem asserção de desenho em sectionDesign.test.ts`).toContain(tpl.id);
    }
  });
});

describe("Rótulos das secções — uma só fonte", () => {
  it("todos os tipos têm rótulo e entrada de menu", () => {
    for (const t of R.BLOCK_TYPES) {
      expect(R.BLOCK_LABELS[t], `sem rótulo: ${t}`).toBeTruthy();
      expect(R.BLOCK_MENU[t]?.title, `sem entrada de menu: ${t}`).toBeTruthy();
      expect(R.BLOCK_MENU[t]?.icon).toBeTruthy();
    }
  });

  it("o editor lê os rótulos daqui em vez de os repetir", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const editor = readFileSync(join(__dirname, "..", "web/views/editor.ts"), "utf8");
    expect(editor).toContain("BLOCK_LABELS");
    // O mapa que estava escrito à mão no editor divergia à primeira renomeação.
    expect(editor).not.toMatch(/info: "Informação", text: "Texto"/);
  });
});
