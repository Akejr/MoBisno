/**
 * A altura do hero é do Dono, e o botão do hero vai para onde ele escolheu.
 *
 * ## Os dois defeitos
 *
 * 1. **A altura era do modelo, e só dele.** Os heros são altos por omissão (420
 *    a 660px). Uma fotografia pequena esticada para essa altura fica desfocada,
 *    e o Dono não tinha como a encolher: ou trocava de modelo, ou ficava com a
 *    imagem má. Cada modelo decidia a altura à sua maneira (píxeis fixos, `vh`,
 *    proporção, só espaçamento), em oito sítios diferentes.
 * 2. **O destino do botão era ignorado por quase todos.** O editor oferecia o
 *    seletor «Destino» (que grava `hero.ctaTarget`), mas só o Lumière e o Tech
 *    Essentials o liam: no Desportivo o seletor nem aparecia, porque o botão não
 *    trazia o marcador `data-hero-cta`, e o `href` estava escrito à mão como
 *    `#produtos`. O Dono escolhia uma categoria e o botão ia para outro lado.
 *
 * ## O que estas guardas fixam
 *
 * A regra que resolve o primeiro: **a área de imagem do hero é o elemento com
 * `data-edit-hero`, e é a altura dele que `hero.height` define.** É o mesmo
 * elemento onde se troca a imagem, e é nele que o editor põe a alça de
 * arrastar. Um modelo novo que se esqueça do marcador fica sem as duas coisas
 * ao mesmo tempo, e é isso que este ficheiro apanha.
 *
 * E o segundo: o `href` sai de `heroCtaHref`, num sítio só, e **todo** o hero
 * registado traz o marcador.
 *
 * ## Por render real
 *
 * Os modelos são desenhados de verdade, com a altura gravada, e lê-se a etiqueta
 * que carrega `data-edit-hero`. Testar o CSS de `heroHeightCss` em separado não
 * provava nada sobre os modelos: era exactamente aí que eles divergiam.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { StoreTemplate, StoreCustomization } from "../web/templates/types.js";

/**
 * Os módulos de `web/templates` entram por `import()` com o especificador **numa
 * constante**: puxam `web/lib/dom.ts` → `web/lib/routing.ts`, que lê `location`.
 * Com um especificador literal o `tsc` segue-o e compila esses ficheiros num
 * programa declarado sem DOM, partindo o `npm run build`. Mesmo contorno de
 * `tests/sectionDesign.test.ts`.
 */
interface Heroes {
  HERO_MIN_HEIGHT: number;
  HERO_MAX_HEIGHT: number;
  heroHeightCss(custom?: unknown): string;
  heroHeightAttr(custom?: unknown): string;
  renderHero(variant: string | undefined, view: unknown, custom: unknown, ctx: unknown, fallback?: string): string;
}

interface Secoes {
  heroCtaHref(view: unknown, custom?: unknown): string;
}

let H: Heroes;
let S: Secoes;
let PRONTOS: StoreTemplate[];

const VIEW = {
  kind: "render",
  templateId: "galeria",
  storeName: "Loja Teste",
  subdomain: "lojateste.sualoja.digital",
  header: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, storeName: "Loja Teste" },
  menu: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, items: [] },
  banners: [],
  products: [
    { id: "a", name: "Camisola", description: "", category: "Camisolas", featured: true, physical: true, price: 12000, imageUrl: "https://cdn/a.jpg", stock: null },
  ],
};

const CTX = { container: "mx-auto", brand: "var(--brand,#DC2626)" };

beforeAll(async () => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  const espHeroes = "../web/templates/heroes.js";
  H = (await import(espHeroes)) as Heroes;
  const espSecoes = "../web/templates/sectionsModel.js";
  S = (await import(espSecoes)) as Secoes;
  const espRegisto = "../web/templates/registry.js";
  const reg = (await import(espRegisto)) as { TEMPLATE_REGISTRY: StoreTemplate[] };
  PRONTOS = reg.TEMPLATE_REGISTRY.filter((t) => t.ready);
  expect(PRONTOS.length, "nenhum modelo pronto no registo").toBeGreaterThan(0);
}, 120_000);

/**
 * A etiqueta de abertura que carrega um marcador, ou `null`.
 *
 * Procura o marcador **dentro de uma etiqueta** (`<(?!!)`, que exclui `<!--`):
 * um comentário do modelo que nomeie o atributo não é o atributo, e a primeira
 * versão disto leu exactamente esse comentário.
 */
function etiquetaCom(html: string, marcador: string): string | null {
  const re = new RegExp(`<(?!!)[^>]*\\b${marcador}\\b[^>]*>`);
  return re.exec(html)?.[0] ?? null;
}

const etiquetaDoHero = (html: string): string | null => etiquetaCom(html, "data-edit-hero");
const etiquetaDoBotao = (html: string): string | null => etiquetaCom(html, "data-hero-cta");

function desenha(t: StoreTemplate, custom: StoreCustomization): string {
  return t.render({ ...VIEW, templateId: t.id } as never, custom);
}

/* ============================== heroHeightCss ============================== */

describe("heroHeightCss — o que entra em CSS", () => {
  it("sem altura gravada não escreve nada", () => {
    for (const vazio of [undefined, {}, { hero: {} }, { hero: { height: undefined } }]) {
      expect(H.heroHeightCss(vazio), JSON.stringify(vazio)).toBe("");
      expect(H.heroHeightAttr(vazio)).toBe("");
    }
  });

  it("escreve a altura e desliga o mínimo do modelo", () => {
    // `min-height:0` vai junto porque há heros com `min-h-[60vh]` (o Beauty):
    // sem isso, encolher não encolhia nada num ecrã alto.
    expect(H.heroHeightCss({ hero: { height: 320 } })).toBe("height:320px;min-height:0");
    expect(H.heroHeightAttr({ hero: { height: 320 } })).toBe(' style="height:320px;min-height:0"');
  });

  it("limita entre o mínimo e o máximo, e arredonda", () => {
    expect(H.heroHeightCss({ hero: { height: 10 } })).toBe(`height:${H.HERO_MIN_HEIGHT}px;min-height:0`);
    expect(H.heroHeightCss({ hero: { height: 99999 } })).toBe(`height:${H.HERO_MAX_HEIGHT}px;min-height:0`);
    expect(H.heroHeightCss({ hero: { height: 320.6 } })).toBe("height:321px;min-height:0");
    expect(H.HERO_MIN_HEIGHT).toBeLessThan(H.HERO_MAX_HEIGHT);
  });

  it("o que não é número não entra em CSS", () => {
    // A Personalização é JSON editável à mão (o Administrador abre o editor das
    // lojas dos outros), e isto entra num atributo `style`.
    for (const lixo of ["320px", "320", NaN, Infinity, -Infinity, null, {}, [], true]) {
      expect(H.heroHeightCss({ hero: { height: lixo } }), String(lixo)).toBe("");
    }
  });
});

/* ========================== A altura em cada modelo ========================== */

/**
 * Modelos cujo hero tem uma **área de imagem** e por isso altura ajustável.
 *
 * A lista é escrita à mão de propósito: um modelo novo que se esqueça do
 * `data-edit-hero` aparece aqui como falha, e não em silêncio.
 */
const COM_IMAGEM = ["desportivo", "beauty", "lumiere", "tech-essentials"];

/**
 * O hero do Galeria é um arco com as fotografias dos **produtos**, não um
 * banner: não há imagem única a esticar, e por isso não há altura para encolher.
 */
const SEM_IMAGEM = ["galeria"];

describe("A altura do hero é a do elemento com data-edit-hero", () => {
  it("a lista de modelos com área de imagem é a que o registo mostra", () => {
    const todos = PRONTOS.map((t) => t.id).sort();
    expect([...COM_IMAGEM, ...SEM_IMAGEM].sort()).toEqual(todos);
  });

  it("em cada modelo com área de imagem, a altura gravada entra NESSE elemento", () => {
    for (const t of PRONTOS.filter((x) => COM_IMAGEM.includes(x.id))) {
      const etiqueta = etiquetaDoHero(desenha(t, { hero: { height: 300 } }));
      expect(etiqueta, `${t.id}: sem data-edit-hero no hero`).toBeTruthy();
      expect(etiqueta, `${t.id}: a altura não entrou na área de imagem`).toContain("height:300px");
      expect(etiqueta, `${t.id}: o mínimo do modelo continua a ganhar`).toContain("min-height:0");
    }
  });

  it("sem altura gravada, o modelo desenha como desenhava", () => {
    for (const t of PRONTOS) {
      const etiqueta = etiquetaDoHero(desenha(t, {}));
      if (etiqueta === null) continue;
      expect(etiqueta, `${t.id}: escreveu uma altura que ninguém pediu`).not.toContain("min-height:0");
    }
  });

  it("os heros partilhados com imagem também a respeitam", () => {
    for (const variante of ["imagem", "split"]) {
      const etiqueta = etiquetaDoHero(H.renderHero(variante, VIEW, { hero: { height: 240 } }, CTX));
      expect(etiqueta, `${variante}: sem data-edit-hero`).toBeTruthy();
      expect(etiqueta, variante).toContain("height:240px");
    }
  });

  it("o hero sem banner não finge ter área de imagem", () => {
    // Sem isto, a alça de arrastar apareceria num hero que não tem imagem para
    // encolher, e o Dono arrastava sem nada acontecer.
    for (const variante of ["arco", "particulas"]) {
      expect(etiquetaDoHero(H.renderHero(variante, VIEW, {}, CTX)), variante).toBeNull();
    }
    for (const t of PRONTOS.filter((x) => SEM_IMAGEM.includes(x.id))) {
      expect(etiquetaDoHero(desenha(t, {})), `${t.id}: tem data-edit-hero e não devia`).toBeNull();
    }
  });
});

/* ========================= O destino do botão do hero ========================= */

describe("heroCtaHref — o botão do hero vai para onde o Dono escolheu", () => {
  it("sem destino escolhido, fica na secção de produtos da própria página", () => {
    for (const vazio of [undefined, {}, { hero: {} }, { hero: { ctaTarget: "" } }, { hero: { ctaTarget: "   " } }]) {
      expect(S.heroCtaHref(VIEW, vazio), JSON.stringify(vazio)).toBe("#produtos");
    }
  });

  it("com uma categoria escolhida, leva à página dessa categoria", () => {
    expect(S.heroCtaHref(VIEW, { hero: { ctaTarget: "Camisolas" } })).toBe("/loja/lojateste/categoria/camisolas");
  });
});

describe("Todo o hero registado deixa mudar o destino", () => {
  it("cada modelo marca o botão com data-hero-cta", () => {
    // É o marcador que faz aparecer o seletor «Destino» no editor. Faltava no
    // Desportivo, no Beauty e nos quatro heros partilhados.
    for (const t of PRONTOS) {
      expect(etiquetaDoBotao(desenha(t, {})), `${t.id}: botão do hero sem data-hero-cta`).toBeTruthy();
    }
    for (const variante of ["imagem", "split", "arco", "particulas"]) {
      expect(etiquetaDoBotao(H.renderHero(variante, VIEW, {}, CTX)), `${variante}: sem data-hero-cta`).toBeTruthy();
    }
  });

  it("e o destino escolhido chega ao href, em todos", () => {
    for (const t of PRONTOS) {
      const etiqueta = etiquetaDoBotao(desenha(t, { hero: { ctaTarget: "Camisolas" } }));
      expect(etiqueta, `${t.id}: o destino escolhido não chegou ao botão`).toContain("/categoria/camisolas");
    }
    for (const variante of ["imagem", "split", "arco", "particulas"]) {
      const etiqueta = etiquetaDoBotao(H.renderHero(variante, VIEW, { hero: { ctaTarget: "Camisolas" } }, CTX));
      expect(etiqueta, `${variante}: o destino escolhido não chegou ao botão`).toContain("/categoria/camisolas");
    }
  });

  it("o href é montado num sítio só", () => {
    // Estava escrito modelo a modelo, e foi assim que metade deles o ignorou.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    for (const f of ["heroes", "desportivo", "beauty", "lumiere", "techEssentials"]) {
      const src = readFileSync(join(__dirname, "..", `web/templates/${f}.ts`), "utf8");
      expect(src, `${f}: destino do hero escrito à mão`).not.toMatch(/ctaTarget \? categoryHref/);
    }
  });
});

/* ============================ A alça, no editor ============================ */

describe("Arrastar a altura do hero, no editor", () => {
  /**
   * O gesto corre num navegador (mede elementos, captura o ponteiro), por isso
   * o que se fixa aqui é o que o código **não pode voltar a ser**. O arrasto foi
   * verificado com uma captura de ecrã: 520px a 340px no Desportivo.
   */
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const EDITOR = readFileSync(join(__dirname, "..", "web/views/editor.ts"), "utf8");
  const ALCA = (() => {
    const i = EDITOR.indexOf("function mountHeroResize(");
    expect(i, "mountHeroResize não encontrada").toBeGreaterThan(0);
    return EDITOR.slice(i, EDITOR.indexOf("\n  function bind(", i));
  })();

  it("a alça vive no mesmo elemento onde se troca a imagem", () => {
    const hero = EDITOR.slice(EDITOR.indexOf('const hero = preview.querySelector<HTMLElement>("[data-edit-hero]")'));
    const bloco = hero.slice(0, hero.indexOf("\n    }"));
    expect(bloco).toContain("mountHeroResize(hero)");
    expect(bloco).toContain('[data-hero-act="img"]');
  });

  it("durante o arrasto escreve no elemento, e grava uma vez só no fim", () => {
    // `rebuild()` troca o innerHTML do preview: chamá-lo a cada movimento
    // destruía o elemento que está a ser arrastado.
    expect(ALCA).toContain("hero.style.height = `${altura}px`");
    const mover = ALCA.slice(ALCA.indexOf("const mover ="), ALCA.indexOf("const largar ="));
    expect(mover, "rebuild() a cada movimento do ponteiro").not.toContain("rebuild");
    expect(mover, "gravação a cada movimento do ponteiro").not.toContain("setPath");
    const largar = ALCA.slice(ALCA.indexOf("const largar ="));
    expect(largar).toContain("if (altura !== partidaH) grava(altura)");
    // E o «Desfazer» apanha a mudança inteira, não trinta pedaços dela.
    const grava = ALCA.slice(ALCA.indexOf("const grava ="));
    expect(grava.slice(0, grava.indexOf("};"))).toContain("snapshot()");
  });

  it("funciona com o dedo e com o teclado", () => {
    expect(ALCA).toContain("setPointerCapture");
    expect(ALCA).toContain('grip.addEventListener("pointermove"');
    expect(ALCA).toContain('grip.addEventListener("pointercancel"');
    // Sem `touch-action:none` o telemóvel rolava a página em vez de arrastar.
    expect(EDITOR).toContain("touch-action:none");
    // Há quem não consiga arrastar.
    expect(ALCA).toContain('e.key === "ArrowUp"');
    expect(ALCA).toContain('role", "slider"');
    expect(ALCA).toContain("aria-valuenow");
  });

  it("a alça está sempre visível: num telemóvel não há rato", () => {
    // As outras camadas de edição aparecem no `:hover`, e no telemóvel nunca.
    const css = EDITOR.slice(EDITOR.indexOf(".mb-hero-grip{"), EDITOR.indexOf(".mb-hero-px{"));
    expect(css).not.toContain("opacity:0");
    expect(EDITOR).not.toMatch(/\[data-edit-hero\]:hover \.mb-hero-grip/);
    // E recebe toques: `.mb-ov` desliga-os nas camadas de edição.
    expect(ALCA).toContain('grip.className = "mb-ov-btn mb-hero-grip"');
  });

  it("os limites são os do domínio, não números escritos no editor", () => {
    expect(EDITOR).toContain("HERO_MAX_HEIGHT, HERO_MIN_HEIGHT");
    expect(ALCA).toContain("Math.min(HERO_MAX_HEIGHT, Math.max(HERO_MIN_HEIGHT, n))");
  });

  it("«Altura original» só aparece quando há uma altura escolhida", () => {
    expect(EDITOR).toContain('typeof custom.hero?.height === "number" ? btn("reset"');
    expect(EDITOR).toContain("delete custom.hero?.height");
  });

  it("o rótulo editável dentro de um botão não promete um clique que não há", () => {
    // O cursor saltava entre a mão (na margem do botão) e o cursor de texto (no
    // rótulo), e no preview as ligações não navegam: clicar é escrever.
    expect(EDITOR).toContain('const botao = el.closest("a,button")');
    expect(EDITOR).toContain('botao.style.cursor = "text"');
  });
});
