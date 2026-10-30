/**
 * Guardas do cromo da plataforma e do diretório de lojas.
 *
 * Três defeitos reais, cada um com a sua asserção:
 *
 * 1. **«Criarminhaloja».** Num contentor `inline-flex` cada nó de texto vira um
 *    item de flex, e o espaço no início e no fim de cada item é descartado. O
 *    botão do cabeçalho escrevia o espaço no HTML (`<span> minha</span>`) e o
 *    navegador comia-o. O espaçamento tem de vir do `gap`.
 * 2. **Rodapé em duplicado.** A página inicial tinha uma cópia escrita à mão do
 *    rodapé, igual à de `platformChrome.ts` até ao dia em que uma das duas
 *    mudasse. Nada falharia.
 * 3. **Ligações relativas na página de «loja não encontrada».** Essa página é
 *    servida do subdomínio pedido (`naoexiste.sualoja.digital`), onde `/criar`
 *    resolve para um endereço que não existe — quem tentava sair do erro aterrava
 *    noutro erro.
 *
 * Mais a parede de importação: `api/` não pode importar de `web/`, por isso a
 * lista de lojas com domínio próprio existe duas vezes e tem de ficar igual (o
 * mesmo princípio de `api/_seo.js`, `SEO.md` §5.2).
 *
 * As asserções são sobre o **texto-fonte**: `web/` não é verificado por tipos nem
 * carregável em `node` (usa DOM), e `api/` está fora do programa do `tsc`. É o
 * padrão de `tests/seoInfra.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const CHROME = read("web/templates/platformChrome.ts");
/**
 * A página inicial em dois ficheiros: o HTML puro (`landingHtml.ts`), que o
 * servidor também pré-renderiza, e a vista (`landing.ts`), que o desenha e liga
 * os eventos. As asserções sobre markup leem os dois juntos — e o rodapé, que é
 * markup, é afirmado sobre o construtor.
 */
const LANDING_HTML = read("web/views/landingHtml.ts");
const LANDING = `${LANDING_HTML}\n${read("web/views/landing.ts")}`;
const DIRECTORY = read("web/views/directory.ts");
/** A vitrina: que lojas se mostram e como. Saiu de `directory.ts` quando a página inicial passou a mostrar as mesmas. */
const SHOWCASE = read("web/lib/storeShowcase.ts");
const SEO_API = read("api/_seo.js");
const PRERENDER = read("api/prerender.js");

/** Botões cujo rótulo tem uma parte escondida abaixo de `sm`. */
function botoesComRotuloEncurtado(src: string): string[] {
  return [...src.matchAll(/<(?:button|a)\b[^>]*class="([^"]*)"[^>]*>((?:(?!<\/(?:button|a)>).)*)<\/(?:button|a)>/gs)]
    .filter((m) => m[2]!.includes('class="hidden sm:inline"'))
    .map((m) => `${m[1]}|${m[2]}`);
}

describe("Botões do cabeçalho — o espaço vem do gap, não do HTML", () => {
  it("todo o botão com rótulo encurtado declara um gap", () => {
    const encontrados = [...botoesComRotuloEncurtado(CHROME), ...botoesComRotuloEncurtado(LANDING)];
    // Se este número for zero, a asserção não está a proteger nada.
    expect(encontrados.length).toBeGreaterThan(0);
    for (const b of encontrados) {
      const classes = b.split("|")[0]!;
      expect(classes, `botão sem gap: ${b.slice(0, 120)}`).toMatch(/\bgap-\d/);
    }
  });

  it("nenhum rótulo tenta espaçar com um espaço dentro do span escondido", () => {
    // `<span class="hidden sm:inline"> minha</span>` era exactamente o defeito.
    for (const src of [CHROME, LANDING]) {
      expect(src).not.toMatch(/class="hidden sm:inline">\s/);
      expect(src).not.toMatch(/\s<\/span>(?=[A-Za-zÀ-ÿ])/);
    }
  });

  it("cada palavra do rótulo é um elemento seu: «Criarloja» no telemóvel", () => {
    /*
     * Nós de texto seguidos formam um só item de flex, e um `display:none` entre
     * eles não os separa. Com «minha» escondido abaixo de `sm`, «Criar» e «loja»
     * juntavam-se sem o `gap`. Nenhum texto solto pode ficar encostado ao span
     * escondido.
     */
    for (const src of [CHROME, LANDING]) {
      expect(src, "texto solto antes do span escondido").not.toMatch(/[A-Za-zÀ-ÿ]<span class="hidden sm:inline">/);
      expect(src, "texto solto depois do span escondido").not.toMatch(/<span class="hidden sm:inline">[^<]*<\/span>[A-Za-zÀ-ÿ]/);
    }
    expect(CHROME).toContain('<span>Criar</span><span class="hidden sm:inline">minha</span><span>loja</span>');
  });

  it("o «Login» aparece também no telemóvel", () => {
    const login = /<a href="\/login" id="cta-login" class="([^"]+)"/.exec(CHROME);
    expect(login, "o Login saiu do cabeçalho").not.toBeNull();
    expect(login![1], "o Login voltou a esconder-se abaixo de sm").not.toMatch(/(^|\s)hidden(\s|$)/);
    // A página inicial usa a mesma definição: as duas cópias tinham o defeito.
    expect(LANDING_HTML).toContain("return platformNavActions(loggedIn);");
  });

  it("o rótulo do Dashboard não voltou a chamar-se Painel", () => {
    expect(CHROME).toContain('"Dashboard"');
    expect(LANDING).toContain("Abrir Dashboard");
    expect(LANDING).not.toMatch(/>Painel</);
  });
});

describe("Rodapé — uma só definição", () => {
  it("a página inicial usa o rodapé partilhado e não tem um <footer> próprio", () => {
    expect(LANDING_HTML).toContain("${platformFooterHtml()}");
    expect(LANDING).not.toContain("<footer");
  });

  it("o rodapé partilhado não tem «Integrações» nem «Centro de ajuda»", () => {
    // Removidos a pedido; estavam só na cópia da landing e voltariam com ela.
    expect(CHROME).not.toContain("Centro de ajuda");
    expect(CHROME).not.toMatch(/link\([^)]*"Integrações"\)/);
  });
});

describe("Cromo servido pelo servidor — ligações absolutas à plataforma", () => {
  it("o cabeçalho e o rodapé do platformHtml apontam para a plataforma, não para o host pedido", () => {
    const inicio = SEO_API.indexOf("export function platformHtml(");
    expect(inicio).toBeGreaterThanOrEqual(0);
    const fn = SEO_API.slice(inicio, SEO_API.indexOf("\n}", inicio));
    // A origem é a do pedido quando ele é da plataforma, e o apex em qualquer
    // outro caso: numa loja (`naoexiste.sualoja.digital`), um `/criar` relativo
    // levava quem tentava sair da página de erro para outro erro. Na plataforma,
    // usar o host pedido evita o redirecionamento apex → www.
    expect(fn).toContain("platformOrigin(host)");
    for (const caminho of ["/", "/criar", "/termos", "/privacidade"]) {
      expect(fn, `ligação relativa a ${caminho}`).toContain(`href="\${platform}${caminho}"`);
    }
    // Nenhuma ligação do cromo pode voltar a ser relativa.
    expect(fn).not.toMatch(/href="\/(criar|termos|privacidade)"/);
  });

  it("platformOrigin só aceita a família do apex da plataforma", () => {
    const inicio = SEO_API.indexOf("export function platformOrigin(");
    expect(inicio, "platformOrigin não encontrada em api/_seo.js").toBeGreaterThanOrEqual(0);
    const fn = SEO_API.slice(inicio, SEO_API.indexOf("\n}", inicio));
    // Um `Host` arbitrário não pode passar a canónico da plataforma: seria o
    // Google a indexar o nosso conteúdo noutro domínio.
    expect(fn).toContain("PLATFORM_APEX");
    expect(fn).toMatch(/www\./);
  });
});

describe("Vitrina de lojas — destaques com domínio próprio", () => {
  /** Endereços declarados em `FEATURED_STORES` de `web/lib/storeShowcase.ts`. */
  function destaquesDaSpa(): string[] {
    const i = SHOWCASE.indexOf("const FEATURED_STORES");
    expect(i).toBeGreaterThanOrEqual(0);
    const bloco = SHOWCASE.slice(i, SHOWCASE.indexOf("];", i));
    return [...bloco.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]!);
  }

  it("há pelo menos um destaque e a DOT Angola está lá", () => {
    const urls = destaquesDaSpa();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => u.includes("dotangola.com"))).toBe(true);
  });

  it("o HTML pré-renderizado lista os mesmos destaques (parede api/ ↔ web/)", () => {
    // Sem isto, quem rastreia a página sem JavaScript não vê a ligação — que é
    // metade da razão de o diretório existir.
    for (const url of destaquesDaSpa()) {
      expect(PRERENDER, `destaque ausente de api/prerender.js: ${url}`).toContain(url);
    }
  });

  it("a ordem da vitrina é a mesma na SPA e no servidor", () => {
    // A primeira entrada é a loja que ocupa a janela da frente do hero. As duas
    // listas vivem em ficheiros que não se podem importar um ao outro (parede
    // `api/` ↔ `web/`), por isso a igualdade é verificada aqui.
    const daSpa = (src: string): string[] => {
      // O literal, não a declaração: `readonly string[]` traz um `]` pelo caminho.
      const m = /PRIORITY_HOSTS[^=]*=\s*\[([\s\S]*?)\]\s*;/.exec(src);
      expect(m, "PRIORITY_HOSTS não encontrada").not.toBeNull();
      return [...m![1]!.matchAll(/`([^`]+)`|"([^"]+)"/g)].map((x) => (x[1] ?? x[2]!).trim());
    };
    const spa = daSpa(SHOWCASE);
    expect(spa.length).toBeGreaterThan(0);
    expect(daSpa(PRERENDER)).toEqual(spa);
    // A vitrina abre com uma loja da plataforma: essa não custa nada a desenhar,
    // ao contrário de uma loja de domínio próprio, que precisa de fotografia.
    expect(spa[0]).toContain("${STORE_APEX}");
    expect(spa[0]).toContain("juddycosmetics");
  });

  it("as duas listas ordenam pela vitrina, não pela origem dos dados", () => {
    expect(SHOWCASE).toContain(".sort(byPriority)");
    expect(PRERENDER).toMatch(/\.sort\(\(a, b\) => rank\(a\.host\) - rank\(b\.host\)\)/);
  });

  it("a contagem saiu do topo do hero", () => {
    expect(DIRECTORY).not.toContain("countChip");
    expect(DIRECTORY).not.toContain("lojas publicadas</span>");
  });

  it("uma loja de domínio próprio usa fotografia estática, nunca o site embutido", () => {
    // Embutir a página verdadeira carregava-a inteira (JavaScript, tipos de letra,
    // o carrossel do topo a animar) a cada visita, e duas vezes quando a loja
    // também aparecia no hero. A fotografia é um pedido que fica em cache.
    expect(SHOWCASE).not.toContain("data-preview-url");
    expect(SHOWCASE).toMatch(/kind: "image"/);
    expect(SHOWCASE).toContain('loading="lazy"');
    // Nenhum `iframe` pode apontar para fora: os da plataforma usam `srcdoc`.
    expect(SHOWCASE).not.toMatch(/frame\.src\s*=/);
  });

  it("a fotografia declarada existe no repositório", () => {
    const i = SHOWCASE.indexOf("const FEATURED_STORES");
    const bloco = SHOWCASE.slice(i, SHOWCASE.indexOf("];", i));
    const imagens = [...bloco.matchAll(/image:\s*"([^"]+)"/g)].map((m) => m[1]!);
    for (const img of imagens) {
      // Sem o ficheiro, o `onerror` deixa a capa com a inicial e ninguém repara.
      expect(existsSync(join(ROOT, "web/public", img)), `falta web/public${img}`).toBe(true);
    }
  });
});
