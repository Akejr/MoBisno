/**
 * Guardas do hero em ensaio (`/start`) e do fundo em WebGL.
 *
 * Três coisas que se perdem em silêncio se ninguém as verificar:
 *
 * 1. **Um caminho novo que o servidor não conhece devolve 404.** Já aconteceu: a
 *    pré-visualização privada da loja respondia «não encontrado» com a página lá
 *    dentro, porque só as páginas públicas estavam na lista de
 *    `api/prerender.js`. `/start` tem de estar lá — e com `noindex`, porque
 *    repete a proposta da homepage e competiria com ela na pesquisa.
 * 2. **Um ciclo de `requestAnimationFrame` que ninguém pára.** A vista é
 *    substituída ao navegar, o `canvas` sai do DOM e o sombreador continuaria a
 *    desenhar — cinco oitavas de ruído por pixel, para ninguém ver.
 * 3. **Sem WebGL2 ficava um retângulo preto** no topo da página, em vez do
 *    degradê de reserva.
 *
 * Asserções sobre o texto-fonte: `web/` não é verificado por tipos nem carregável
 * em `node` (usa DOM e WebGL), e `api/` está fora do programa do `tsc`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MAIN = read("web/main.ts");
const START = read("web/views/start.ts");
const SHADER = read("web/lib/shaderHero.ts");
const PRERENDER = read("api/prerender.js");

describe("Rota /start — existe, é um pedaço à parte e não é indexada", () => {
  it("o router trata /start e carrega a vista sob demanda", () => {
    expect(MAIN).toContain('path === "/start"');
    expect(MAIN).toMatch(/start:\s*\(\)\s*=>\s*import\("\.\/views\/start\.js"\)/);
  });

  it("leva noindex na SPA e no HTML do servidor", () => {
    // O título é o de uma página de campanha, não o de um ensaio.
    expect(MAIN).toMatch(/applyNoindexSeo\("MôBisno[^"]*"\)/);
    expect(MAIN).not.toContain("Hero em teste");
    // Sem esta entrada o servidor devolvia 404 num caminho que existe.
    const i = PRERENDER.indexOf("PLATFORM_APP_PREFIXES");
    const bloco = PRERENDER.slice(i, PRERENDER.indexOf("];", i));
    expect(bloco).toContain('"/start"');
  });

  it("o hero em ensaio não é anunciado em lado nenhum", () => {
    // Enquanto for ensaio, não pode haver ligações para ele: uma segunda página
    // com a mesma proposta da home divide o tráfego e a autoridade.
    for (const rel of ["web/views/landing.ts", "web/templates/platformChrome.ts", "web/views/directory.ts"]) {
      expect(read(rel), `${rel} liga para /start`).not.toMatch(/href="\/start"/);
    }
  });
});

describe("Fundo em WebGL — pára quando não é visto e degrada sem rebentar", () => {
  it("tem reserva em CSS quando não há WebGL2", () => {
    expect(SHADER).toContain("SHADER_FALLBACK_CSS");
    // O `getContext` pode devolver `null` **e** pode atirar: os dois caminhos têm
    // de acabar na reserva.
    expect(SHADER).toMatch(/catch\s*\{[\s\S]{0,40}gl = null/);
    expect(SHADER).toMatch(/if \(!gl\) return fallback\(\)/);
  });

  it("o ciclo pára quando o canvas sai da página", () => {
    expect(SHADER).toMatch(/if \(disposed \|\| !canvas\.isConnected\) \{ stop\(\); return; \}/);
  });

  it("pára com o separador em segundo plano e fora do ecrã", () => {
    expect(SHADER).toContain('document.addEventListener("visibilitychange"');
    expect(SHADER).toContain("IntersectionObserver");
    expect(SHADER).toMatch(/document\.hidden \|\| !visible/);
  });

  it("respeita quem pede menos movimento: desenha um frame e fica quieto", () => {
    expect(SHADER).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(SHADER).toMatch(/if \(reduceMotion\) draw\(0\);/);
  });

  it("limita a densidade de desenho", () => {
    // Sem limite, um telemóvel com `devicePixelRatio` 3 desenha nove vezes mais
    // pixels num sombreador que já é caro.
    expect(SHADER).toContain("MAX_SCALE");
    expect(SHADER).toMatch(/Math\.min\(MAX_SCALE/);
  });

  it("liberta o contexto ao desmontar", () => {
    expect(SHADER).toContain('getExtension("WEBGL_lose_context")');
  });

  it("mantém a atribuição do autor do sombreador", () => {
    expect(SHADER).toContain("Matthias Hurrle");
  });
});

describe("Página /start — página de anúncio: um só caminho", () => {
  it("não tem cabeçalho, rodapé nem assistente", () => {
    // Cada um deles é uma saída. Numa página de anúncio o caminho é o botão.
    for (const saida of ["platformNavHtml", "platformFooterHtml", "mountAiAgent", "mountSectionNav"]) {
      expect(START, `/start ainda inclui ${saida}`).not.toContain(saida);
    }
  });

  it("tem exactamente uma chamada para ação", () => {
    const ligacoes = [...START.matchAll(/<a\s/g)].length;
    expect(ligacoes).toBe(1);
    expect(START).toContain("Conhecer MôBisno");
  });

  it("ocupa o ecrã inteiro, com a unidade que o telemóvel respeita", () => {
    // `100vh` no telemóvel conta a barra do navegador; `100dvh` é a altura real.
    // Ficam os dois, nesta ordem, para quem não conhece `dvh` continuar servido.
    expect(START).toMatch(/min-height:100vh;min-height:100dvh/);
  });

  it("o emblema diz a marca, não é uma ligação, e o ícone não é lido em voz alta", () => {
    const badge = /badge:\s*"([^"]+)"/.exec(START)?.[1] ?? "";
    expect(badge).toContain("MôBisno");
    expect(START).toMatch(/<span aria-hidden="true">✨<\/span>/);
    // Nenhum logótipo solto por cima do título: competia com ele.
    expect(START).not.toContain("logo-header.png");
    expect(START).not.toContain("favicon.svg");
  });

  it("o botão tem estado de hover e de foco, numa classe (o inline não os suporta)", () => {
    expect(START).toContain("mb-start-cta");
    expect(START).toMatch(/\.mb-start-cta:hover,\.mb-start-cta:focus-visible\{/);
    // Quem pede menos movimento não leva o deslocamento.
    expect(START).toMatch(/prefers-reduced-motion:reduce\)\{[\s\S]{0,400}mb-start-cta/);
  });

  it("a descrição é curta — é um anúncio, não a homepage", () => {
    const sub = /subtitle:\s*"([^"]+)"/.exec(START)?.[1] ?? "";
    expect(sub.length).toBeGreaterThan(20);
    expect(sub.length).toBeLessThan(90);
  });
});

describe("Cor — o fundo lê como laranja da marca", () => {
  it("o tom das nuvens é uma constante nomeada, mais claro que o do original", () => {
    // O original trazia (.25,.137,.05), um marrom escuro.
    expect(SHADER).toMatch(/#define TINT vec3\(([\d.]+),/);
    expect(SHADER).toContain("col=mix(col,bg*TINT,d)");
    const r = Number(/#define TINT vec3\(([\d.]+),/.exec(SHADER)![1]);
    expect(r).toBeGreaterThan(0.25);
  });
});
