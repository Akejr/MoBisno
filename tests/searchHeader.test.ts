/**
 * Pesquisa no cabeçalho — o campo que aparecia como uma caixa larga e cinzenta.
 *
 * ## O defeito
 *
 * O `<input>` da pesquisa não tinha estilo próprio. O `tailwind.config.js` deste
 * projeto carrega o plugin `@tailwindcss/forms`, que aplica a **todos** os
 * inputs moldura de 1px, fundo, cantos retos e `padding`. O resultado era uma
 * caixa cinzenta de bordo a bordo dentro do cabeçalho — em todos os modelos,
 * porque a pesquisa é partilhada.
 *
 * Havia mais três coisas chumbadas no mesmo sítio: o fundo da barra era
 * `#ffffff`, que aparecia como um retângulo branco sobre o creme do Lumière; o
 * realce de cada resultado era `hover:bg-[#f6f3f2]`, o creme do Lumière aplicado
 * a todos os modelos; e o painel de resultados era centrado na página enquanto a
 * barra ocupava o cabeçalho, pelo que não se alinhavam.
 *
 * As asserções são sobre o texto-fonte: `web/lib/search.ts` depende do DOM e
 * `tests/` compila com `lib: ["ES2022"]`. É o padrão de `tests/comingSoon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SEARCH = readFileSync(join(ROOT, "web/lib/search.ts"), "utf8");
const CONFIG = readFileSync(join(ROOT, "tailwind.config.js"), "utf8");
const REGISTRY = readFileSync(join(ROOT, "web/templates/registry.ts"), "utf8");

/**
 * Os ficheiros dos modelos com desenho próprio, lidos dos imports do registo
 * (`import { xTemplate } from "./x.js"`). Lidos e não escritos à mão: a lista à
 * mão dizia «quatro» quando já eram cinco.
 */
const MODELOS = [...REGISTRY.matchAll(/import \{ \w+Template \} from "\.\/(\w+)\.js"/g)].map((m) => m[1]!);

describe("O campo de pesquisa não é uma caixa de formulário por omissão", () => {
  it("o plugin de formulários está activo — é ele que impõe o estilo a anular", () => {
    // Se o plugin sair, as anulações passam a ser inofensivas; enquanto cá
    // estiver, sem elas o campo volta a ficar com moldura e fundo.
    expect(CONFIG).toContain("@tailwindcss/forms");
  });

  it("o campo não tem largura fixa escrita à mão", () => {
    // A largura é a que sobra no cabeçalho, com um teto: um valor fixo estourava
    // num cabeçalho estreito e ficava perdido num largo.
    expect(SEARCH).toContain("larguraDisponivel");
    expect(SEARCH).toContain("--mb-search-max");
  });

  it("as anulações do plugin estão declaradas na folha da pesquisa", () => {
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    for (const regra of ["appearance:none", "border:0", "padding:0", "box-shadow:none", "background:transparent"]) {
      expect(folha, `anulação ausente: ${regra}`).toContain(regra);
    }
    // O «x» nativo do `type=search` no Chrome duplicava o botão de fechar.
    expect(folha).toContain("-webkit-search-cancel-button");
  });

  it("a folha é injetada uma só vez, com id próprio", () => {
    expect(SEARCH).toContain('document.getElementById("mb-search-style")');
    expect(SEARCH).toContain('st.id = "mb-search-style"');
  });

  it("o campo não impõe cantos próprios: o raio é o do modelo", () => {
    // `rounded-full` chumbado dava uma pílula dentro do Lumière, que é reto.
    expect(SEARCH).not.toContain("rounded-full\" ");
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    expect(folha).toContain("border-radius:var(--mb-search-radius");
  });
});

describe("O cabeçalho não desaparece ao pesquisar", () => {
  it("o campo entra no cabeçalho, não uma barra a tapá-lo", () => {
    /*
     * Era `absolute inset-0` sobre o cabeçalho: ao pesquisar desaparecia o
     * logótipo, os ícones e as ligações. Agora o campo entra ao lado do botão e
     * o cabeçalho fica todo lá.
     */
    expect(SEARCH).not.toContain("absolute inset-0 z-[70]");
    expect(SEARCH).toContain("host.insertBefore(field, btn)");
    expect(SEARCH).toContain("[data-search-host]");
  });

  it("o campo abre-se animado, de largura zero até à largura possível", () => {
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    expect(folha).toContain("max-width:0");
    expect(folha).toMatch(/data-open=\\"1\\"[^}]*max-width:var\(--mb-search-max/);
    expect(folha).toContain("cubic-bezier");
    // Abre no fotograma seguinte, senão a transição não tem de onde partir.
    expect(SEARCH).toContain("requestAnimationFrame");
  });

  it("as ligações do cabeçalho deslizam para o lado em vez de sumirem", () => {
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    expect(folha).toContain("[data-search-collapse]");
    expect(folha).toContain("translateX(-14px)");
    expect(SEARCH).toContain('el.dataset.collapsed = "1"');
  });

  it("fechar reverte a animação e só depois remove o campo", () => {
    // Remover de imediato dava um salto.
    expect(SEARCH).toContain('field.dataset.open = "0"');
    expect(SEARCH).toContain("delete el.dataset.collapsed");
    expect(SEARCH).toContain('addEventListener("transitionend"');
    // `transitionend` pode não chegar: o temporizador impede o campo de ficar preso.
    expect(SEARCH).toMatch(/setTimeout\(sair, \d+\)/);
  });

  it("quem pede menos movimento não fica à espera de animações", () => {
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    expect(folha).toContain("prefers-reduced-motion");
    expect(SEARCH).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
  });

  it("um modelo sem marcas continua a funcionar", () => {
    // O campo cresce ao lado do próprio botão; nada desliza. Um modelo novo não
    // fica com a pesquisa partida por ainda não ter declarado nada.
    expect(SEARCH).toContain("?? btn.parentElement");
  });
});

describe("A pesquisa respeita o cromo de cada modelo", () => {
  it("o aspeto do campo vem de variáveis que o modelo declara", () => {
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    for (const v of ["--mb-search-radius", "--mb-search-bg", "--mb-search-border", "--mb-search-ink", "--mb-search-ph", "--mb-search-font", "--mb-search-h"]) {
      expect(folha, `variável ausente: ${v}`).toContain(v);
    }
  });

  it("cada modelo declara o seu, e não são todos iguais", () => {
    /*
     * A propriedade que faltava: o Lumière é de cantos retos, o Galeria é uma
     * pílula, o Beauty é tonal sem moldura. Um só desenho de pesquisa para
     * todos contradizia a regra 2 do `MODELO-GUIA.md` — nada pode «mudar de
     * cara» dentro do mesmo site.
     */
    expect(MODELOS).toContain("lumiere");
    expect(MODELOS).toContain("galeria");
    const raios = new Map<string, string>();
    for (const f of MODELOS) {
      const src = readFileSync(join(ROOT, "web/templates", `${f}.ts`), "utf8");
      expect(src, `${f}: não declara o aspeto da pesquisa`).toContain("--mb-search-radius");
      const raio = /--mb-search-radius:([^;"']+)/.exec(src)?.[1]?.trim();
      expect(raio, `${f}: raio da pesquisa não legível`).toBeTruthy();
      raios.set(f, raio!);
    }
    // Cantos retos no Lumière, pílula no Galeria: se estes dois forem iguais, o
    // aspeto voltou a ser único.
    expect(raios.get("lumiere")).not.toBe(raios.get("galeria"));
    expect(raios.get("galeria")).toBe("9999px");
    expect(new Set(raios.values()).size).toBeGreaterThanOrEqual(3);
  });

  it("cada modelo marca o que desliza e onde o campo cresce", () => {
    for (const f of MODELOS) {
      const src = readFileSync(join(ROOT, "web/templates", `${f}.ts`), "utf8");
      expect(src, `${f}: sem data-search-host`).toContain("data-search-host");
      expect(src, `${f}: sem data-search-collapse`).toContain("data-search-collapse");
    }
  });

  it("o realce de um resultado usa a cor da loja, não o creme de um modelo", () => {
    expect(SEARCH).not.toContain("#f6f3f2");
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    expect(folha).toContain("var(--brand");
  });

  it("o foco do campo é a cor da loja", () => {
    const folha = SEARCH.slice(SEARCH.indexOf("const SEARCH_CSS"), SEARCH.indexOf("function ensureSearchStyle"));
    expect(folha).toMatch(/focus-within[^}]*var\(--brand/);
  });

  it("o painel de resultados alinha-se ao campo", () => {
    // Estava centrado na página (`max-w-2xl mx-auto`) enquanto a barra ocupava o
    // cabeçalho: em ecrã largo apareciam desencontrados.
    expect(SEARCH).not.toContain("mx-auto max-w-2xl");
    expect(SEARCH).toContain("field.getBoundingClientRect()");
    expect(SEARCH).toContain("panel.style.left");
    expect(SEARCH).toContain("panel.style.width");
  });
});

describe("Nada de resultados antes de haver pesquisa", () => {
  it("o painel nasce escondido e só aparece com pesquisa escrita", () => {
    /*
     * Mostrava os primeiros oito produtos assim que o campo abria. Isso não é
     * uma pesquisa: é um catálogo por cima da loja, a tapá-la sem ninguém ter
     * pedido nada.
     */
    expect(SEARCH).toContain('panel.style.display = "none"');
    expect(SEARCH).toMatch(/if \(nq === ""\)[^\n]*mostrarPainel\(false\)/);
    // E não há um `draw("")` a povoar a lista à abertura.
    expect(SEARCH).not.toMatch(/^\s*draw\(""\);/m);
    expect(SEARCH).not.toContain("products.slice(0, 8)");
  });

  it("o véu escuro acompanha o painel, não a abertura do campo", () => {
    // Escurecer a loja só porque o campo abriu, sem nada para mostrar, é peso
    // sem função.
    expect(SEARCH).toContain('backdrop.style.display = "none"');
    expect(SEARCH).toContain('backdrop.style.display = mostrar ? "block" : "none"');
  });

  it("o estado de expansão é anunciado a um leitor de ecrã", () => {
    expect(SEARCH).toContain('aria-expanded="false"');
    expect(SEARCH).toContain('input.setAttribute("aria-expanded", mostrar ? "true" : "false")');
  });
});

describe("O painel alinha-se ao campo e usa os cantos dele", () => {
  it("a posição é lida do campo já desenhado, e volta a ser lida enquanto ele cresce", () => {
    /*
     * Era aqui o defeito da posição: o retângulo do campo era lido **uma vez**,
     * antes da animação, quando o campo tem largura zero encostado ao botão à
     * direita. Depois crescia para a esquerda e o painel ficava para trás.
     */
    expect(SEARCH).toContain("field.getBoundingClientRect()");
    expect(SEARCH).toContain("new ResizeObserver(positionPanel).observe(field)");
    expect(SEARCH).toContain('field.addEventListener("transitionend", positionPanel)');
    // Ancorado ao fundo do campo, não ao fundo do cabeçalho.
    expect(SEARCH).toMatch(/panel\.style\.top = `\$\{Math\.round\(f\.bottom/);
  });

  it("o painel não sai do ecrã do lado direito", () => {
    expect(SEARCH).toContain("window.innerWidth - largura - 12");
  });

  it("os cantos do painel são copiados do campo, não escritos à mão", () => {
    /*
     * O painel vive no `body`, logo **não herda** as variáveis do modelo. Tinha
     * `rounded-2xl` chumbado, e dava um painel redondo debaixo de um campo reto —
     * exactamente o contrário da regra 2 do `MODELO-GUIA.md`.
     */
    expect(SEARCH).not.toContain("rounded-2xl");
    expect(SEARCH).toContain("getComputedStyle(field).borderRadius");
    expect(SEARCH).toContain("borderBottomLeftRadius");
  });
});

describe("Teclado e leitores de ecrã", () => {
  it("as setas percorrem os resultados e o Enter abre o que está em foco", () => {
    // Num campo de pesquisa a expectativa é escrever, descer e carregar em
    // Enter. Sem isto a pesquisa só servia a rato.
    expect(SEARCH).toContain('e.key === "ArrowDown"');
    expect(SEARCH).toContain('e.key === "ArrowUp"');
    expect(SEARCH).toContain('e.key === "Enter"');
    expect(SEARCH).toContain("scrollIntoView");
  });

  it("o Escape fecha, e o ouvinte sai ao fechar", () => {
    expect(SEARCH).toContain('e.key === "Escape"');
    // Um ouvinte de teclado que não sai fica preso à vista anterior.
    expect(SEARCH).toContain('document.removeEventListener("keydown", onKey)');
  });

  it("a caixa e a lista anunciam-se a um leitor de ecrã", () => {
    expect(SEARCH).toContain('setAttribute("role", "search")');
    for (const attr of ['role="combobox"', 'role="listbox"', 'role="option"', "aria-selected", "aria-controls", "aria-expanded"]) {
      expect(SEARCH, `atributo ausente: ${attr}`).toContain(attr);
    }
    // O campo tem rótulo, mesmo que só visível a leitores de ecrã.
    expect(SEARCH).toContain('<label class="sr-only"');
    expect(SEARCH).toContain("Pesquisar produtos");
    // Os ícones decorativos não são lidos.
    expect(SEARCH).toContain('aria-hidden="true"');
    // `sr-only` é do Tailwind e a barra é construída em JavaScript: a classe
    // pode não ter sobrevivido ao purge, por isso a folha declara-a.
    expect(SEARCH).toContain(".mb-search-host .sr-only");
  });

  it("o botão de fechar diz o que faz", () => {
    expect(SEARCH).toContain('aria-label="Fechar pesquisa"');
  });
});

describe("A pesquisa continua a abrir dentro do cabeçalho de qualquer modelo", () => {
  it("é ancorada ao cabeçalho que contém o botão", () => {
    // A regra do `MODELO-GUIA.md` §6: a pesquisa abre DENTRO do header e mantém
    // a UI do modelo. Não é um overlay à parte.
    expect(SEARCH).toContain('btn.closest("header, nav")');
    // O campo entra no grupo de ícones do cabeçalho, não no `body` nem num
    // overlay: é a regra do `MODELO-GUIA.md` §6.
    expect(SEARCH).toContain("host.insertBefore(field, btn)");
  });

  it("abrir duas vezes não empilha barras", () => {
    expect(SEARCH).toContain("[data-mb-search-bar] [data-q]");
    expect(SEARCH).toMatch(/existing\.focus\(\)/);
  });

  it("no editor a pesquisa não abre", () => {
    // No ecrã de personalização o clique é para editar, não para pesquisar.
    expect(SEARCH).toContain('location.pathname.startsWith("/personalizar")');
  });

  it("os modelos registados — cinco — ligam o botão pelo mesmo hook", () => {
    // A contagem no título é a real e é verificada: um modelo novo no registo
    // obriga a actualizá-la, em vez de o título ficar a dizer outra coisa.
    expect(MODELOS).toEqual(["desportivo", "beauty", "galeria", "lumiere", "techEssentials"]);
    for (const f of MODELOS) {
      const src = readFileSync(join(ROOT, "web/templates", `${f}.ts`), "utf8");
      expect(src, `${f}: sem data-search-btn`).toContain("data-search-btn");
    }
  });
});
