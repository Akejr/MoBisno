/**
 * Guardas do separador «Análises» do Dashboard do Dono.
 *
 * O ecrã mostrava catorze barras nuas, sem eixo, sem valor ao passar o rato e
 * com quatro zeros quando a loja ainda não tinha tido uma única visita — quatro
 * zeros que quem acaba de criar a loja lê como avaria do painel, não como «não
 * há dados». A reconstrução trouxe eixo com rótulos, dica por dia, dia de maior
 * tráfego destacado, barras de proporção nos produtos mais vistos e um estado
 * vazio com os passos que faltam.
 *
 * Duas propriedades que só um teste protege, porque nada falha sem elas:
 *
 * 1. **A animação respeita `prefers-reduced-motion`.** Sem a regra, quem pede
 *    menos movimento fica com a linha a meio de ser desenhada e as barras a
 *    zero — ou seja, com um gráfico errado, não só com movimento a mais.
 * 2. **A cor é o `#F95901` da plataforma, nunca `var(--brand)`.** `var(--brand)`
 *    é a cor da loja do Dono, definida pelo tema do storefront; num ecrã de
 *    painel resolve para o que estiver no `:root` e o gráfico sai de outra cor
 *    conforme a loja escolhida no seletor.
 *
 * As asserções são sobre o **texto-fonte**: `web/views/dashboard.ts` depende do
 * DOM e `tests/` compila com `lib: ["ES2022"]`, sem DOM, por isso o módulo não
 * pode ser importado. É o mesmo padrão `readFileSync` de
 * `tests/platformChrome.test.ts` e de `tests/comingSoon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const DASHBOARD = ler("web/views/dashboard.ts");
const ANALYTICS = ler("web/supabase/analytics.ts");
const CONTEXT = ler("web/lib/assistantContext.ts");

/** Corpo de `renderAnalises`, do nome dela até ao `}` da mesma indentação. */
function analises(): string {
  const inicio = "async function renderAnalises(): Promise<void> {";
  const i = DASHBOARD.indexOf(inicio);
  expect(i, "renderAnalises não encontrada em web/views/dashboard.ts").toBeGreaterThan(-1);
  // O fecho é o `}` a duas colunas (a função é aninhada em `renderDashboard`).
  // A busca é por expressão regular para o teste não depender de o ficheiro
  // estar gravado com LF ou com CRLF.
  const fim = /\r?\n {2}\}\r?\n/.exec(DASHBOARD.slice(i));
  expect(fim, "fim de renderAnalises não encontrado").not.toBeNull();
  return DASHBOARD.slice(i, i + fim!.index);
}

const SECCAO = analises();

describe("Gráfico de visitas — eixo com rótulos e valor ao passar o rato", () => {
  it("desenha linha e área em SVG, sem biblioteca de gráficos", () => {
    // Sem bibliotecas novas (restrição do projeto): o desenho é `path` à mão,
    // no espírito de `evolutionChart` de `web/views/adminPanel.ts`.
    expect(SECCAO).toContain("<svg");
    expect(SECCAO).toMatch(/<path class="mb-ana-line"/);
    expect(SECCAO).toMatch(/<path class="mb-ana-area"/);
    expect(SECCAO).toContain('preserveAspectRatio="none"');
    // Esticar o sistema de coordenadas engordaria o traço com a largura.
    expect(SECCAO).toContain('vector-effect="non-scaling-stroke"');
  });

  it("o eixo vertical tem valores e o horizontal tem datas legíveis", () => {
    // Antes não havia eixo nenhum: uma barra de 40% de altura não dizia 40% de quê.
    expect(SECCAO).toContain("const ticks =");
    expect(SECCAO).toContain("const grade =");
    expect(SECCAO).toContain("const rotulosX =");
    expect(SECCAO).toMatch(/toLocaleDateString\("pt-PT", \{ day: "2-digit", month: "2-digit"/);
    // Catorze datas seguidas não cabem: mostra-se dia sim, dia não.
    expect(SECCAO).toContain("(dias - 1 - i) % 2 === 0");
  });

  it("cada dia tem uma dica com a data e o número de visitas", () => {
    expect(SECCAO).toContain('id="ana-tip"');
    expect(SECCAO).toMatch(/data-day="\$\{i\}"/);
    expect(SECCAO).toContain('addEventListener("pointerenter", mostrar)');
    expect(SECCAO).toMatch(/\$\{d\.visits\} visita\(s\)/);
    // O `title` cobre o intervalo entre o primeiro pixel e o JavaScript ligar,
    // e é o que um leitor de ecrã anuncia.
    expect(SECCAO).toMatch(/title="\$\{esc\(rotulo\)\}"/);
    expect(SECCAO).toMatch(/aria-label="\$\{esc\(rotulo\)\}"/);
  });

  it("o dia de maior tráfego é destacado no gráfico e escrito por palavras", () => {
    expect(SECCAO).toContain("const peak =");
    expect(SECCAO).toContain("const destaque = i === peak");
    expect(SECCAO).toContain("Dia de maior tráfego:");
    // Sem visitas nos 14 dias não se anuncia um pico de zero.
    expect(SECCAO).toContain("Sem visitas registadas nos últimos 14 dias.");
  });
});

describe("Números com contexto — variação só onde os dados a permitem", () => {
  it("a variação de 7 dias sai da série diária, e o valor em destaque também", () => {
    // `visits7` é uma janela deslizante de 168 horas; a série é por dia. Misturar
    // as duas bases dava «12 visitas, +40%» com o 40% calculado sobre outra conta.
    expect(SECCAO).toContain("const last7 = a.daily.slice(-7)");
    expect(SECCAO).toContain("const prev7 = a.daily.slice(0, Math.max(0, dias - 7))");
    expect(SECCAO).toContain('statCard(0, "group", "Visitas (7 dias)", last7, deltaPill(last7, prev7)');
  });

  it("a série tem 14 dias, o que é o que permite comparar 7 com 7", () => {
    // Se a série encurtar, `prev7` deixa de ser um período comparável.
    expect(ANALYTICS).toContain("for (let i = 13; i >= 0; i--)");
  });

  it("a seta e a cor seguem o sinal, e o zero não vira percentagem", () => {
    expect(SECCAO).toContain('"arrow_upward"');
    expect(SECCAO).toContain('"arrow_downward"');
    expect(SECCAO).toContain('wrap("#ecfdf5", "#047857"');
    expect(SECCAO).toContain('wrap("#fef2f2", "#b91c1c"');
    // Dividir por zero dá infinito e «+100%» sobre zero é uma invenção.
    expect(SECCAO).toContain("if (prev === 0) return");
  });

  it("as visualizações de produtos não levam variação inventada", () => {
    // `getStoreAnalytics` não devolve série diária de `product_view`, por isso não
    // há período anterior com que comparar.
    expect(ANALYTICS).not.toMatch(/dailyViews|viewsDaily/);
    expect(SECCAO).toMatch(/statCard\(2, "visibility", "Produtos vistos \(7 dias\)", a\.views7, ""/);
  });
});

describe("Produtos mais vistos — proporção relativa e fotografia", () => {
  it("cada linha tem barra proporcional ao mais visto", () => {
    expect(SECCAO).toContain("const topMax = Math.max(1, ...a.topProducts.map((t) => t.count))");
    expect(SECCAO).toMatch(/const quota = Math\.max\(4, Math\.round\(\(t\.count \/ topMax\) \* 100\)\)/);
    expect(SECCAO).toContain('class="mb-ana-bar');
  });

  it("mostra a foto do produto quando existe e um substituto quando não", () => {
    expect(SECCAO).toContain("p?.imageUrl");
    expect(SECCAO).toContain('loading="lazy"');
    expect(SECCAO).toContain("fadeInImages(app)");
  });
});

describe("Estado vazio — uma loja sem visitas não mostra zeros", () => {
  it("sem eventos em 30 dias o ecrã explica o que falta em vez de mostrar zeros", () => {
    expect(SECCAO).toContain("if (a.visits30 === 0 && a.views30 === 0)");
    expect(SECCAO).toContain("Ainda não há visitas para mostrar");
    // Os passos que faltam, com o estado real da Loja a marcar os já feitos.
    expect(SECCAO).toContain("Publicar a loja");
    expect(SECCAO).toContain("Partilhar o endereço com os seus clientes");
    expect(SECCAO).toContain('store!.state === "Publicada" && billing.accessActive');
  });

  it("sem visualizações de produto a lista diz-o, em vez de ficar vazia", () => {
    expect(SECCAO).toContain("Ainda ninguém abriu a página de um produto.");
  });
});

describe("Animação — folha injetada com id próprio e menos movimento respeitado", () => {
  it("as animações vivem numa folha com id, injetada uma só vez", () => {
    // `@keyframes` não saem do Tailwind, e uma classe inventada morre no purge.
    expect(SECCAO).toContain('document.getElementById("mb-analytics-style")');
    expect(SECCAO).toContain('st.id = "mb-analytics-style"');
    expect(SECCAO).toContain("@keyframes mbAnaDraw");
    expect(SECCAO).toContain("@keyframes mbAnaBar");
  });

  it("quem pede menos movimento vê o estado final, não um gráfico a meio", () => {
    const bloco = /@media\(prefers-reduced-motion:reduce\)\{([\s\S]*?)\}`/.exec(SECCAO);
    expect(bloco, "bloco de prefers-reduced-motion não encontrado").not.toBeNull();
    const regras = bloco![1]!;
    // A linha desenhada por completo, a barra na largura certa, os pontos visíveis.
    expect(regras).toContain("stroke-dashoffset:0");
    expect(regras).toContain("width:var(--mb-w,0%)");
    expect(regras).toMatch(/\.mb-ana-dot\{animation:none;opacity:1/);
    expect(regras).toContain(".mb-ana-halo{animation:none;opacity:0}");
  });

  it("a contagem dos números também obedece, sem passar pelo CSS", () => {
    // O CSS não conta números: a decisão tem de ser lida em JavaScript.
    expect(SECCAO).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(SECCAO).toContain("if (!reduceMotion) {");
    // E o valor pintado no primeiro HTML já é o final, não um zero que fica.
    expect(SECCAO).toContain("${reduceMotion ? value : 0}");
  });
});

describe("Cor da plataforma — nunca a cor da loja", () => {
  it("o separador Análises usa o ACCENT e não var(--brand)", () => {
    expect(SECCAO).not.toContain("var(--brand");
    expect(SECCAO).toContain("${ACCENT}");
  });

  it("nenhum ecrã de painel usa var(--brand)", () => {
    // `var(--brand)` é a cor do tema da loja publicada (`web/lib/theme.ts`); num
    // ecrã de painel resolve para o que estiver no `:root` do momento.
    expect(DASHBOARD).not.toContain("var(--brand");
  });

  it("a folha injetada usa o laranja da plataforma no realce das colunas", () => {
    expect(SECCAO).toContain("rgba(249,89,1,.06)");
  });
});

describe("Orientação do assistente — acompanha o que o ecrã mostra", () => {
  const guia = (() => {
    const i = CONTEXT.indexOf("analises: `ECRÃ");
    expect(i, "orientação do ecrã analises não encontrada").toBeGreaterThan(-1);
    return CONTEXT.slice(i, CONTEXT.indexOf("`,", i));
  })();

  it("nomeia os números pelos rótulos que o Dono vê", () => {
    for (const rotulo of ["Visitas (7 dias)", "Visitas (30 dias)", "Produtos vistos (7 dias)"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(SECCAO, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
  });

  it("diz o que o ecrã não faz, para o assistente não inventar", () => {
    expect(guia).toContain("não têm comparação entre períodos");
    expect(guia).toContain("Não há filtro de datas");
  });

  it("descreve a dica do gráfico e o estado vazio", () => {
    expect(guia).toContain("número de visitas desse dia");
    expect(guia).toContain("Ainda não há visitas para mostrar");
  });
});
