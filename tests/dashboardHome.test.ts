/**
 * Guardas do separador «Início» do Dashboard do Dono.
 *
 * O ecrã era o mais visitado e o mais parado: números a aparecer de repente, o
 * estado da loja num rótulo sem sinal visual, o endereço em texto morto quando a
 * loja não estava publicada, e «Ainda não há vendas.» — quatro palavras secas —
 * a quem acabou de ligar os pagamentos e não sabe o que falta. A reconstrução
 * trouxe entrada escalonada, contagem crescente dos valores, barra do dinheiro
 * já pedido em levantamentos, gráfico das vendas pagas por dia e um estado vazio
 * com os passos que faltam.
 *
 * Três propriedades que só um teste protege, porque nada falha sem elas:
 *
 * 1. **A animação respeita `prefers-reduced-motion`.** Sem a regra, quem pede
 *    menos movimento fica com a barra a zero e as colunas achatadas — ou seja,
 *    com números errados no ecrã, não só com movimento a mais.
 * 2. **A contagem crescente nunca deixa um zero para sempre.** O primeiro HTML
 *    só arranca de zero quando vai haver contagem; caso contrário pinta o valor
 *    final.
 * 3. **A cor é o `#F95901` da plataforma, nunca `var(--brand)`.** `var(--brand)`
 *    é a cor da loja do Dono, definida pelo tema do storefront; num ecrã de
 *    painel resolve para o que estiver no `:root` e o cartão sai de outra cor
 *    conforme a loja escolhida no seletor.
 *
 * As asserções são sobre o **texto-fonte**: `web/views/dashboard.ts` depende do
 * DOM e `tests/` compila com `lib: ["ES2022"]`, sem DOM, por isso o módulo não
 * pode ser importado. É o mesmo padrão `readFileSync` de
 * `tests/dashboardAnalytics.test.ts` e de `tests/comingSoon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canDeleteOrder, orderEffectiveStatus, type OrderLifecycle } from "../src/services/payments.js";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const DASHBOARD = ler("web/views/dashboard.ts");
const PAYMENTS = ler("web/supabase/payments.ts");
const WITHDRAWALS = ler("web/supabase/withdrawals.ts");
const CONTEXT = ler("web/lib/assistantContext.ts");
const MIGRACAO = ler("supabase/migrations/0021_orders_owner_delete.sql");

/** Corpo de `renderInicio`, do nome dela até ao `}` da mesma indentação. */
function inicio(): string {
  const marca = "async function renderInicio(): Promise<void> {";
  const i = DASHBOARD.indexOf(marca);
  expect(i, "renderInicio não encontrada em web/views/dashboard.ts").toBeGreaterThan(-1);
  // O fecho é o `}` a duas colunas (a função é aninhada em `renderDashboard`).
  // A busca é por expressão regular para o teste não depender de o ficheiro
  // estar gravado com LF ou com CRLF.
  const fim = /\r?\n {2}\}\r?\n/.exec(DASHBOARD.slice(i));
  expect(fim, "fim de renderInicio não encontrado").not.toBeNull();
  return DASHBOARD.slice(i, i + fim!.index);
}

const SECCAO = inicio();

/**
 * Os cartões do ecrã, na ordem em que aparecem, cada um com o texto do seu
 * bloco (da chamada até à do cartão seguinte).
 *
 * É por aqui que se verifica a **composição**: que cada informação tem um
 * cartão só seu, e que o que pertence a um valor (a barra, o botão) está no
 * cartão desse valor e não noutro.
 */
function cartoes(): { rotulo: string; bloco: string }[] {
  return DASHBOARD.split(/home(?=Metric\(|Card\()/)
    .slice(1)
    .map((p) => {
      const m = /^(?:Metric|Card)\(\s*\d+,\s*"[a-z_0-9]+",\s*"([^"]+)"/.exec(p);
      return { rotulo: m ? m[1]! : "", bloco: p };
    })
    .filter((c) => c.rotulo !== "");
}

/** O cartão com um dado rótulo (falha com mensagem útil se não existir). */
function cartao(rotulo: string): { rotulo: string; bloco: string } {
  const encontrados = cartoes().filter((c) => c.rotulo === rotulo);
  expect(encontrados.length, `cartão «${rotulo}» não encontrado`).toBeGreaterThan(0);
  return encontrados[0]!;
}

describe("Animação — folha injetada com id próprio e menos movimento respeitado", () => {
  it("as animações vivem numa folha com id, injetada uma só vez", () => {
    // `@keyframes` não saem do Tailwind, e uma classe inventada morre no purge.
    // O `id` é o que impede a folha de ser injetada outra vez a cada troca de
    // separador.
    expect(SECCAO).toContain('document.getElementById("mb-home-style")');
    expect(SECCAO).toContain('st.id = "mb-home-style"');
    expect(SECCAO).toContain("@keyframes mbHomeRise");
    expect(SECCAO).toContain("@keyframes mbHomeBar");
    expect(SECCAO).toContain("@keyframes mbHomeCol");
  });

  it("a folha do Início não reutiliza o id da folha das Análises", () => {
    // Dois `style` com o mesmo `id` fazem o segundo ser descartado em silêncio:
    // o separador que abrisse a seguir ficava sem animação nenhuma.
    expect(SECCAO).not.toContain("mb-analytics-style");
    expect(DASHBOARD.match(/st\.id = "mb-home-style"/g)).toHaveLength(1);
  });

  it("as secções e os cartões entram escalonados, e não todos ao mesmo tempo", () => {
    expect(SECCAO).toContain("animation-delay:calc(var(--mb-i,0)*70ms)");
    /*
     * A sequência dos índices não pode ter saltos: um salto é um cartão que
     * entra fora da ordem em que se lê o ecrã, ou um cartão que ficou sem
     * índice. Os índices chegam de duas formas — escritos no `style` das
     * secções, ou passados como primeiro argumento a `homeMetric`/`homeCard`.
     */
    const literais = [...SECCAO.matchAll(/--mb-i:(\d+)/g)].map((m) => Number(m[1]));
    const emCartoes = [...SECCAO.matchAll(/home(?:Metric|Card)\((\d+),/g)].map((m) => Number(m[1]));
    const usados = [...new Set([...literais, ...emCartoes])].sort((a, b) => a - b);
    usados.forEach((n, i) => expect(n, `salto na sequência de --mb-i em ${n}`).toBe(i));
    // Saudação, placar do plano, seis cartões de número, o gráfico e as duas listas.
    expect(usados.length).toBeGreaterThanOrEqual(11);
  });

  it("quem pede menos movimento vê o estado final, não um ecrã a meio", () => {
    const bloco = /@media\(prefers-reduced-motion:reduce\)\{([\s\S]*?)\}`/.exec(SECCAO);
    expect(bloco, "bloco de prefers-reduced-motion não encontrado").not.toBeNull();
    const regras = bloco![1]!;
    // Cartões visíveis, barra na largura certa, colunas na altura certa.
    expect(regras).toContain(".mb-home-rise,.mb-home-row{animation:none;opacity:1;transform:none}");
    expect(regras).toContain(".mb-home-bar{animation:none;width:var(--mb-w,0%)}");
    expect(regras).toContain(".mb-home-col{animation:none;transform:none}");
    // O ponto do estado deixa de pulsar; a cor e o rótulo ficam.
    expect(regras).toContain(".mb-home-beat{animation:none}");
  });
});

describe("Contagem dos números — sem deixar zeros no ecrã", () => {
  it("a decisão é lida em JavaScript, porque o CSS não conta números", () => {
    expect(SECCAO).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(SECCAO).toContain("function animarNumeros(");
    expect(SECCAO).toContain("if (reduceMotion) return;");
    expect(SECCAO).toContain("requestAnimationFrame(passo)");
  });

  it("o valor pintado no primeiro HTML só é zero quando vai haver contagem", () => {
    // Sem isto, quem pede menos movimento (ou quem tem o JavaScript a meio)
    // ficava com um zero permanente em vez do número real.
    expect(SECCAO).toContain("const kzInicial = (v: number): string => formatKz(reduceMotion || v <= 0 ? v : 0)");
    expect(SECCAO).toContain("const numInicial = (v: number): string => String(reduceMotion || v <= 0 ? v : 0)");
  });

  it("o dinheiro conta no formato da plataforma e a contagem acaba no valor exacto", () => {
    // `formatKz` é a única formatação de Kwanza do projeto: contar com
    // `toLocaleString` dava um separador de milhares diferente a meio da animação.
    expect(SECCAO).toContain("el.textContent = dinheiro ? formatKz(v) : String(Math.round(v))");
    expect(SECCAO).toContain("else escrever(alvo);");
  });

  it("os valores monetários e as contagens do ecrã levam o atributo da contagem", () => {
    // Há um molde só: é ele que decide se o número é dinheiro (`data-count-kz`)
    // ou uma contagem (`data-count-to`) e que pinta o valor inicial certo. Um
    // número escrito fora do molde ficava sem contagem e ninguém notava.
    expect(SECCAO).toMatch(/data-count-kz="\$\{valor\}"/);
    expect(SECCAO).toMatch(/data-count-to="\$\{valor\}"/);
    const numericos: readonly [string, string][] = [
      ["Valor total vendido", "stats!.totalSales"],
      ["Recebido (líquido)", "stats!.netReceived"],
      ["Disponível para levantar", "available"],
      ["Vendas pagas", "stats!.paidCount"],
      ["Referências pendentes", "stats!.pendingCount"],
      ["Produtos", "products.length"],
    ];
    for (const [rotulo, valor] of numericos) {
      expect(cartao(rotulo).bloco, `${rotulo} não mostra ${valor}`).toContain(valor);
    }
    // Dinheiro é dinheiro; contagens são contagens.
    for (const rotulo of ["Valor total vendido", "Recebido (líquido)", "Disponível para levantar"]) {
      expect(cartao(rotulo).bloco, `${rotulo} devia contar em Kwanzas`).toContain("kz: true");
    }
    for (const rotulo of ["Vendas pagas", "Referências pendentes"]) {
      expect(cartao(rotulo).bloco, `${rotulo} não é dinheiro`).not.toContain("kz: true");
    }
  });
});

describe("Composição — uma informação por cartão", () => {
  /*
   * O ecrã tinha um bloco laranja único que juntava o total vendido, o
   * disponível para levantar, o botão do levantamento, a barra do dinheiro e o
   * gráfico dos 14 dias, com dois números a `text-4xl` a dominar tudo — e as
   * métricas pequenas em cartões arrumados logo abaixo. Estas asserções são
   * sobre a composição, não sobre classes: cada informação no seu cartão, e o
   * que pertence a um valor no cartão desse valor.
   */
  it("cada informação do ecrã tem um cartão só seu", () => {
    const rotulos = cartoes().map((c) => c.rotulo);
    for (const r of ["Valor total vendido", "Recebido (líquido)", "Disponível para levantar",
      "Vendas pagas", "Produtos", "Referências pendentes", "Vendas pagas por dia"]) {
      expect(rotulos, `sem cartão próprio: ${r}`).toContain(r);
    }
  });

  it("nenhum cartão junta duas grandezas: o molde mostra um valor só", () => {
    // O molde recebe **um** `valor`. Um cartão com dois números seria outra vez
    // o bloco gigante, em pequeno.
    expect(SECCAO).toMatch(/function homeMetric\(i: number, icon: string, label: string, valor: number \| string,/);
    const molde = /function homeMetric\([\s\S]*?\n    \}/.exec(SECCAO);
    expect(molde, "molde do cartão de número não encontrado").not.toBeNull();
    // Duas ocorrências: o ramo do dinheiro e o ramo da contagem do mesmo valor.
    expect(molde![0].match(/data-count-(?:kz|to)="/g)).toHaveLength(2);
  });

  it("a hierarquia está no tamanho da letra, e não há nada a `text-4xl`", () => {
    // O que se queixava não era a cor: era um número a 36 px ao lado de outro a
    // 36 px, num bloco que ocupava o ecrã.
    expect(SECCAO).not.toContain("text-4xl");
    expect(SECCAO).toContain("destaque");
  });

  it("a barra mostra o que já foi pedido em levantamentos sobre o líquido recebido", () => {
    expect(SECCAO).toContain("const pctPedido = stats!.netReceived > 0");
    expect(SECCAO).toContain("Math.round((committed / stats!.netReceived) * 100)");
    // Sem líquido recebido não há proporção nenhuma para desenhar.
    expect(SECCAO).toContain("const barraDinheiro = stats!.netReceived > 0 ?");
    expect(SECCAO).toContain('class="mb-home-bar');
  });

  it("a barra vive no cartão do valor sobre o qual é calculada", () => {
    // A percentagem é do líquido recebido: numa caixa à parte não se lê.
    expect(cartao("Recebido (líquido)").bloco).toContain("barraDinheiro");
    for (const c of cartoes()) {
      if (c.rotulo === "Recebido (líquido)") continue;
      expect(c.bloco, `a barra não pertence ao cartão «${c.rotulo}»`).not.toContain("extra: barraDinheiro");
    }
    // E a frase que diz qual é a base da percentagem continua com ela.
    expect(SECCAO).toContain("recebidos (líquido, já sem a taxa)");
  });

  it("o botão do levantamento fica ao lado do valor a que se aplica", () => {
    const disponivel = cartao("Disponível para levantar").bloco;
    expect(disponivel).toContain("botaoLevantar");
    expect(SECCAO).toContain('id="request-withdraw"');
    expect(SECCAO).toContain("Solicitar levantamento");
    for (const c of cartoes()) {
      if (c.rotulo === "Disponível para levantar") continue;
      expect(c.bloco, `o botão não pertence ao cartão «${c.rotulo}»`).not.toContain("extra: botaoLevantar");
    }
  });

  it("o gráfico tem cartão próprio, com título próprio", () => {
    // Um gráfico não é um número: colado por baixo de dois valores, competia com
    // eles pela atenção.
    expect(cartao("Vendas pagas por dia").bloco).toContain("corpoGrafico");
    expect(SECCAO).toContain("function homeCard(");
    for (const c of cartoes()) {
      if (c.rotulo === "Vendas pagas por dia") continue;
      expect(c.bloco, `o gráfico não pertence ao cartão «${c.rotulo}»`).not.toContain("corpoGrafico)");
    }
  });

  it("o rótulo diz «pedido» e não «recebido», que é o que os dados suportam", () => {
    // `committedWithdrawals` soma pedidos, aprovados e pagos: chamar-lhe dinheiro
    // já no banco era mentira enquanto o pedido não fosse processado.
    expect(WITHDRAWALS).toContain('filter((r) => r.status !== "rejected")');
    expect(SECCAO).toContain('legenda(ACCENT, "Já pedido", formatKz(committed))');
    expect(SECCAO).toContain('"Disponível", formatKz(available)');
  });

  it("o gráfico é desenhado à mão, sem biblioteca, a partir das vendas já carregadas", () => {
    // Sem bibliotecas novas (restrição do projeto) e sem segunda ida ao servidor:
    // as encomendas já vêm para a tabela de vendas.
    expect(SECCAO).toContain("const serie = dias.map(");
    expect(SECCAO).toContain('class="mb-home-col');
    expect(SECCAO).toMatch(/height:\$\{altura\}%/);
    expect(SECCAO).not.toMatch(/from "chart|import\("chart/i);
  });

  it("a série cobre 14 dias, agrupados em UTC", () => {
    expect(SECCAO).toContain("for (let i = 13; i >= 0; i--) janela.push(");
    // O mesmo pagamento não pode mudar de dia conforme o fuso de quem consulta.
    expect(SECCAO).toContain('new Date(t).toISOString().slice(0, 10)');
    expect(SECCAO).toContain('timeZone: "UTC"');
  });

  it("só as vendas pagas entram no gráfico, e pela data do pagamento", () => {
    expect(SECCAO).toContain('if (o.status !== "paid") continue;');
    expect(SECCAO).toContain("chaveDia(o.paidAt ?? o.createdAt)");
  });

  it("a lista de vendas tem teto, e a série encolhe em vez de mentir", () => {
    // `listOrders` traz no máximo `ORDERS_LIMIT`: o dia mais antigo que veio pode
    // estar cortado ao meio, e um dia meio contado desenha uma queda inventada.
    expect(SECCAO).toContain("const ORDERS_LIMIT = 100;");
    expect(SECCAO).toContain("listOrders(store!.id, ORDERS_LIMIT)");
    expect(SECCAO).toContain("const truncado = orders.length >= ORDERS_LIMIT;");
    expect(SECCAO).toContain("const dias = cortadoEm ? janela.filter((d) => d > cortadoEm) : janela;");
    expect(PAYMENTS).toContain("export async function listOrders(storeId: string, limit = 50)");
  });

  it("sem vendas pagas não se desenha um gráfico vazio: diz-se quando ele aparece", () => {
    expect(SECCAO).toContain("const temGrafico = stats!.paidCount > 0 && serie.length >= 2;");
    expect(SECCAO).toContain("const corpoGrafico = temGrafico ?");
    expect(SECCAO).toContain("O gráfico das vendas por dia aparece com a primeira venda paga.");
  });

  it("cada dia do gráfico diz a data, o valor e o número de vendas", () => {
    expect(SECCAO).toMatch(/data-venda-dia="\$\{i\}"/);
    // O `title` cobre o intervalo até o JavaScript ligar, e é o que um leitor de
    // ecrã anuncia.
    expect(SECCAO).toMatch(/title="\$\{esc\(rotulo\)\}"/);
    expect(SECCAO).toMatch(/aria-label="\$\{esc\(rotulo\)\}"/);
    expect(SECCAO).toContain('id="home-tip"');
    expect(SECCAO).toContain('addEventListener("pointerenter", mostrar)');
    expect(SECCAO).toContain('addEventListener("focus", mostrar)');
  });
});

describe("Estado da loja — sinal visual claro e endereço clicável", () => {
  it("os três estados têm rótulo, cor e uma frase que os explica", () => {
    for (const rotulo of ["Publicada", "Não publicada", "Fora do ar"]) {
      expect(SECCAO, `rótulo ausente: ${rotulo}`).toContain(`rotulo: "${rotulo}"`);
    }
    // A cor sozinha não chega: cada estado traz nota escrita.
    expect(SECCAO).toMatch(/nota: "A loja está no ar/);
    expect(SECCAO).toMatch(/nota: "Ainda só você a vê/);
    expect(SECCAO).toContain("${esc(estado.nota)}");
  });

  it("«no ar» é publicada **e** com subscrição, e é isso que o ponto verde diz", () => {
    expect(SECCAO).toContain("const visivel = published && !suspended;");
    // O ponto só pulsa no estado que está no ar; nos outros fica quieto.
    expect(SECCAO).toContain('${estado.pulsa ? "mb-home-beat" : ""}');
    expect(SECCAO).toContain("pulsa: true");
    expect(SECCAO.match(/pulsa: false/g)).toHaveLength(2);
  });

  it("o endereço é sempre clicável, sem apontar para uma página que não existe", () => {
    expect(SECCAO).toContain("const enderecoLink = visivel");
    expect(SECCAO).toContain('href="${esc(storeUrl)}"');
    expect(SECCAO).toContain('href="/previsualizar/${esc(store!.identifier)}"');
    // Copiar o endereço é o que o Dono faz com ele: mandá-lo a alguém.
    expect(SECCAO).toContain('id="copy-url"');
    expect(SECCAO).toContain("navigator.clipboard.writeText(storeUrl)");
    // `navigator.clipboard` não existe em contexto não seguro: falha com saída.
    expect(SECCAO).toContain("Copie o endereço à mão:");
  });
});

describe("Tabela de vendas — entrada suave e estado evidente", () => {
  it("cada linha entra escalonada, sem invólucro que estrague o último separador", () => {
    expect(SECCAO).toContain('linha.classList.add("mb-home-row")');
    expect(SECCAO).toContain('linha.style.setProperty("--mb-i", String(i))');
    expect(SECCAO).toContain("animation-delay:calc(var(--mb-i,0)*45ms)");
  });

  it("o estado da venda ganha faixa lateral, pelo estado efetivo da encomenda", () => {
    // `orderEffectiveStatus` transforma uma referência fora de prazo em
    // «expirada»: pintá-la de pendente era prometer dinheiro que não vem.
    expect(SECCAO).toContain("corEstado(orderEffectiveStatus(o))");
    expect(SECCAO).toContain('if (status === "paid") return "#10b981"');
    expect(SECCAO).toContain('if (status === "open") return "#f59e0b"');
    /*
     * A propriedade é que uma referência fora de prazo **não** ganha a faixa de
     * pendente — não o ficheiro onde a regra está declarada. A asserção era
     * `export function orderEffectiveStatus(` num módulo, e quebrou quando a
     * regra mudou de sítio sem que nada do que importa tivesse mudado. A regra é
     * pura: corre aqui a sério, com um prazo passado e outro por vir.
     */
    const vencida: OrderLifecycle = { status: "open", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" };
    const noPrazo: OrderLifecycle = { status: "open", method: "reference", dueDate: "2999-01-01T00:00:00.000Z" };
    expect(orderEffectiveStatus(vencida)).toBe("expired");
    expect(orderEffectiveStatus(noPrazo)).toBe("open");
    // O módulo do Supabase reexporta a regra, que é de onde a vista a importa
    // (`web/supabase/client.ts` exige as variáveis do browser e não pode ser
    // importado num teste).
    expect(PAYMENTS).toContain("orderEffectiveStatus");
    expect(DASHBOARD).toMatch(/import \{[^}]*orderEffectiveStatus[^}]*\} from "\.\.\/supabase\/payments\.js"/);
  });
});

describe("Estado vazio — uma loja sem vendas não mostra uma lista vazia", () => {
  it("o «Ainda não há vendas.» seco deu lugar aos passos que faltam", () => {
    expect(SECCAO).not.toContain("Ainda não há vendas.</p>");
    expect(SECCAO).toContain("function vendasVazias(): string");
    expect(SECCAO).toContain("body.innerHTML = vendasVazias();");
    expect(SECCAO).toContain("Ainda não há vendas");
    expect(SECCAO).toContain("Ter produtos no catálogo");
    expect(SECCAO).toContain("Ter a loja publicada");
    expect(SECCAO).toContain("Partilhar o endereço com os seus clientes");
  });

  it("os passos já feitos vêm do estado real da Loja, não de uma lista fixa", () => {
    expect(SECCAO).toContain("passo(2, products.length > 0,");
    expect(SECCAO).toContain("passo(3, visivel,");
    // Este ramo só corre com os pagamentos online ligados: marcar esse passo como
    // pendente era mandar o Dono ativar o que já está ativo.
    expect(SECCAO).toContain('passo(1, true, "Pagamentos online ativos")');
  });

  it("a lista de levantamentos vazia também explica, em vez de ficar muda", () => {
    expect(SECCAO).toContain("Ainda não pediu nenhum levantamento.");
  });

  it("sem pagamentos online o ecrã convida a ativá-los, com os dois números que tem", () => {
    expect(SECCAO).toContain("Ative as vendas online");
    expect(SECCAO).toContain('homeMetric(2, "inventory_2", "Produtos", products.length');
    expect(SECCAO).toContain('homeMetric(3, "storefront", "Estado", estado.rotulo');
  });
});

describe("Cor da plataforma — nunca a cor da loja", () => {
  it("o separador Início usa o ACCENT e não var(--brand)", () => {
    expect(SECCAO).not.toContain("var(--brand");
    expect(SECCAO).toContain("${ACCENT}");
  });

  it("nenhum ecrã de painel usa var(--brand)", () => {
    // `var(--brand)` é a cor do tema da loja publicada (`web/lib/theme.ts`); num
    // ecrã de painel resolve para o que estiver no `:root` do momento.
    expect(DASHBOARD).not.toContain("var(--brand");
  });

  it("o cartão das vendas já não tem o laranja escrito à mão", () => {
    // Escrito duas vezes, divergia à primeira mudança de cor da plataforma.
    expect(SECCAO).toContain("background:linear-gradient(135deg,${ACCENT},#ff7e33)");
    expect(SECCAO).not.toContain("#F95901");
  });
});

describe("Menu de secções em telemóvel — o Dono tinha de poder sair da secção", () => {
  /*
   * Defeito, não estilo: o `aside` da navegação é `hidden md:flex` e não havia
   * alternativa nenhuma no telefone. Quem entrasse em «Início» ficava em
   * «Início». `web/views/adminPanel.ts` já tinha resolvido o mesmo com chips
   * numa faixa deslizante; aqui faltava.
   */
  it("a navegação lateral continua escondida em telemóvel", () => {
    expect(DASHBOARD).toContain('<aside class="hidden md:flex');
  });

  it("existe navegação de secções própria para telemóvel", () => {
    expect(DASHBOARD).toMatch(/<nav[^>]*class="md:hidden flex gap-1 overflow-x-auto/);
    expect(DASHBOARD).toContain("function navChip(");
  });

  it("as sete secções do Dono estão lá, e as duas navegações leem a mesma lista", () => {
    // Uma lista só: é o que impede o menu de telemóvel de nascer com seis
    // secções enquanto o `aside` tem sete.
    const lista = DASHBOARD.slice(DASHBOARD.indexOf("const DASH_SECTIONS"), DASHBOARD.indexOf("function navChip("));
    for (const label of ["Início", "Produtos", "Criar logótipo", "Análises", "Pagamentos", "Plano", "Configurações"]) {
      expect(lista, `secção ausente: ${label}`).toContain(`label: "${label}"`);
    }
    expect(lista.match(/\{ tab: "/g)).toHaveLength(7);
    expect(DASHBOARD).toContain("DASH_SECTIONS.map((s) => navItem(s.href, s.icon, s.label, tab === s.tab))");
    expect(DASHBOARD).toContain("DASH_SECTIONS.map((s) => navChip(s.href, s.icon, s.label, tab === s.tab))");
  });

  it("as secções da navegação são as mesmas que têm orientação de assistente", () => {
    // `DASH_SCREEN` mapeia separador → ecrã do assistente. Uma secção na
    // navegação sem entrada aqui ficava com a orientação do painel genérico.
    const ecrãs = DASHBOARD.slice(DASHBOARD.indexOf("const DASH_SCREEN"), DASHBOARD.indexOf("function currentTab("));
    const lista = DASHBOARD.slice(DASHBOARD.indexOf("const DASH_SECTIONS"), DASHBOARD.indexOf("function navChip("));
    for (const m of lista.matchAll(/\{ tab: "([a-z]+)"/g)) {
      expect(ecrãs, `separador sem ecrã de assistente: ${m[1]}`).toContain(`${m[1]}:`);
    }
  });

  it("o menu não se sobrepõe ao cabeçalho nem deixa passar conteúdo por baixo", () => {
    // O admin usa `sticky top-[57px]`, afinado à altura do cabeçalho dele. Este
    // cabeçalho tem outra altura, e um número chumbado erra sempre: cabeçalho e
    // atalhos ficam num invólucro pegajoso só, sem medida escrita à mão.
    expect(DASHBOARD).toContain('<div class="sticky top-0 z-40">');
    expect(DASHBOARD).not.toMatch(/top-\[\d+px\]/);
  });

  it("em telemóvel o Dono também troca de loja, sem duplicar o id do seletor", () => {
    // Dois elementos com o mesmo `id` deixariam o segundo sem ligação nenhuma.
    expect(DASHBOARD.match(/id="store-switch"/g)).toHaveLength(1);
    expect(DASHBOARD.match(/id="store-switch-mobile"/g)).toHaveLength(1);
    // A ligação é por atributo, e por isso serve os dois seletores.
    expect(DASHBOARD).toContain('document.querySelectorAll<HTMLSelectElement>("[data-store-switch]")');
    expect(DASHBOARD).not.toContain('$("#store-switch")');
    // As opções são escritas uma vez: dois seletores com listas diferentes seriam
    // duas verdades sobre as lojas do Dono.
    expect(DASHBOARD.match(/\$\{storeOptions\}/g)).toHaveLength(2);
  });

  it("terminar sessão, «Nova loja» e a Administração também existem em telemóvel", () => {
    expect(DASHBOARD.match(/data-logout/g)!.length).toBeGreaterThanOrEqual(2);
    expect(DASHBOARD).toContain('document.querySelectorAll<HTMLElement>("[data-logout]")');
    expect(DASHBOARD).not.toContain('$("#logout")?.addEventListener("click", async () => { await logout(); go("#/"); });\n    const sw');
    const barra = DASHBOARD.slice(DASHBOARD.indexOf('<div class="md:hidden flex items-center gap-2'));
    expect(barra).toContain('aria-label="Nova loja"');
    expect(barra).toContain('aria-label="Terminar sessão"');
    expect(barra).toContain('aria-label="Dashboard de Administração"');
  });
});

describe("Apagar transações expiradas — a lista deixa de crescer para sempre", () => {
  /*
   * Uma referência fora de prazo é um cliente que tentou comprar e não pagou:
   * nunca vira dinheiro e nunca saía da lista. A decisão de quem pode ser
   * apagado é uma função pura, testada com exemplos em `tests/payments.test.ts`;
   * aqui verifica-se que a interface só oferece o que essa função autoriza e que
   * a guarda de verdade existe na base de dados.
   */
  it("a decisão é uma função pura: só a referência expirada é apagável", () => {
    // A propriedade, e não a declaração: expirada sim, tudo o resto não.
    const expirada: OrderLifecycle = { status: "open", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" };
    expect(canDeleteOrder(expirada)).toBe(true);
    for (const row of [
      { status: "open", method: "reference", dueDate: "2999-01-01T00:00:00.000Z" }, // ainda pagável
      { status: "paid", method: "reference", dueDate: "2020-01-01T00:00:00.000Z", paidAt: "2020-01-01T00:00:00.000Z" },
      { status: "failed", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" },
      { status: "cancelled", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" },
      { status: "open", method: "mcx", dueDate: null },
    ] as OrderLifecycle[]) {
      expect(canDeleteOrder(row), `${row.status}/${row.method} não devia ser apagável`).toBe(false);
    }
    expect(PAYMENTS).toContain("canDeleteOrder");
  });

  it("a acção de apagar aparece só nas linhas expiradas", () => {
    const linha = DASHBOARD.slice(DASHBOARD.indexOf("function orderRow(o: OrderRow)"));
    const fim = linha.indexOf("\n}");
    const corpo = linha.slice(0, fim);
    expect(corpo).toContain("const apagavel = canDeleteOrder(o);");
    // O botão existe dentro do ramo de `apagavel` e em nenhum outro sítio.
    expect(corpo).toMatch(/apagavel \?[^:]*data-order-del/);
    expect(DASHBOARD.match(/data-order-del="/g)).toHaveLength(1);
  });

  it("a confirmação diz que é definitivo, porque é", () => {
    // Não há lixeira nem histórico de tentativas de compra a que voltar.
    expect(SECCAO).toContain("confirm(");
    expect(SECCAO).toMatch(/para sempre/);
    expect(SECCAO).toContain("não é possível recuperá-la");
  });

  it("«apagado» só se diz quando a linha desapareceu mesmo", () => {
    // Sem política que cubra a linha, o Supabase devolve zero linhas afetadas e
    // nenhum erro: `!error` dizia «apagado» a um `delete` que não apagou nada.
    expect(PAYMENTS).toContain("export async function deleteOrder(");
    expect(PAYMENTS).toContain('.delete().eq("id", orderId).select("id")');
    expect(PAYMENTS).toContain("return (data ?? []).length > 0;");
  });

  it("a lista, a contagem e a paginação ficam coerentes sem recarregar o ecrã", () => {
    expect(SECCAO).toContain("orders.splice(i, 1)");
    expect(SECCAO).toContain('const contador = $("#orders-count");');
    expect(SECCAO).toContain("`${orders.length} registo(s)`");
    expect(SECCAO).toContain('id="orders-count"');
    // Redesenha a lista (que recalcula as páginas) em vez de recarregar tudo.
    const handler = SECCAO.slice(SECCAO.indexOf("async function apagarVenda("));
    expect(handler).toContain("drawOrders();");
    expect(handler).not.toContain("renderDashboard()");
  });

  it("o gráfico não muda, porque só as vendas pagas o alimentam", () => {
    // Uma paga nunca é apagável (`canDeleteOrder`), por isso a série dos 14 dias
    // não pode ficar errada por causa de uma eliminação.
    expect(SECCAO).toContain('if (o.status !== "paid") continue;');
    // Uma venda paga nunca é apagável, e a garantia é o comportamento — não a
    // linha de código que o implementa.
    expect(canDeleteOrder({ status: "paid", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" })).toBe(false);
    expect(canDeleteOrder({ status: "open", method: "reference", dueDate: "2020-01-01T00:00:00.000Z", paidAt: "2020-02-01T00:00:00.000Z" })).toBe(false);
  });

  it("a guarda de verdade é a política de `delete`, e exclui as pagas duas vezes", () => {
    // A interface é conveniência; a base de dados é a regra. Uma encomenda paga
    // apagada é dinheiro sem rasto e é irreversível.
    expect(MIGRACAO).toContain("drop policy if exists orders_owner_delete on public.orders;");
    expect(MIGRACAO).toContain("create policy orders_owner_delete on public.orders");
    expect(MIGRACAO).toContain("for delete using (");
    expect(MIGRACAO).toContain("public.owns_store(store_id)");
    expect(MIGRACAO).toContain("status <> 'paid'");
    expect(MIGRACAO).toContain("paid_at is null");
    expect(MIGRACAO).toContain("public.order_reference_expired(status, method, reference_due_date)");
  });

  it("a política espelha a regra do ecrã: `open`, referência e prazo passado", () => {
    expect(MIGRACAO).toContain("p_status <> 'open' or p_method <> 'reference'");
    expect(MIGRACAO).toContain("p_due::timestamptz < now()");
    // `reference_due_date` é texto: um cast que levantasse exceção dentro da
    // política fazia falhar a operação inteira.
    expect(MIGRACAO).toContain("exception when others then");
  });
});

describe("Armadilha do template literal — acento grave em comentário HTML", () => {
  it("não há acento grave dentro de comentários HTML no ecrã", () => {
    // Um acento grave dentro de `<!-- -->` fecha a cadeia do template literal e o
    // build parte com um erro que não aponta para a linha certa.
    expect(SECCAO).not.toMatch(/<!--[^>]*`/);
  });
});

describe("Orientação do assistente — acompanha o que o ecrã mostra", () => {
  const guia = (() => {
    const i = CONTEXT.indexOf("painel: `ECRÃ");
    expect(i, "orientação do ecrã painel não encontrada").toBeGreaterThan(-1);
    return CONTEXT.slice(i, CONTEXT.indexOf("`,", i));
  })();

  it("nomeia os estados da loja pelos rótulos que o Dono vê", () => {
    for (const rotulo of ["Publicada", "Não publicada", "Fora do ar"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(SECCAO, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // O rótulo antigo desapareceu do ecrã; não pode sobreviver na orientação.
    expect(guia).not.toContain("«Offline»");
  });

  it("nomeia os números e os botões pelos rótulos do ecrã", () => {
    for (const rotulo of ["Valor total vendido", "Disponível para levantar", "Solicitar levantamento",
      "Recebido (líquido)", "Referências pendentes", "Vendas pagas por dia", "Copiar"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(SECCAO, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
  });

  it("descreve a barra do dinheiro e o estado vazio das vendas", () => {
    expect(guia).toContain("Já pedido");
    expect(guia).toContain("Ainda não há vendas");
  });

  it("diz o que o ecrã não faz, para o assistente não inventar", () => {
    expect(guia).toContain("Não há filtro de datas nem exportação");
    expect(guia).toContain("conta apenas vendas pagas");
  });
});
