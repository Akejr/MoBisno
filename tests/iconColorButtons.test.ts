/**
 * Guarda da cor dos ícones dentro dos botões (cor **global** de ícones).
 *
 * O problema: nos modelos, o ícone de um botão de marca não tem cor própria —
 * herda do botão (`<button style="background:var(--brand);color:#fff"><span
 * class="material-symbols-outlined">shopping_cart</span> Adicionar ao
 * carrinho</button>`). A cor global de ícones (`custom.colors.icon`) é
 * `!important`, por isso pintava também esses ícones: o rótulo branco e o glifo
 * de outra cor, em toda a loja (montra, produto, categoria, carrinho, checkout).
 *
 * A correção vive num só módulo (`web/lib/iconColor.ts`): uma travessia marca os
 * botões que têm ícone **e** texto e uma regra de folha de estilo faz os ícones
 * desses botões herdarem. Três distinções que estas asserções guardam:
 *   1. botão com texto vs. botão só com ícone (search/carrinho do cabeçalho,
 *      quantidade, setas de carrossel) — estes ficam na cor global;
 *   2. ícones com cor explícita própria (indicadores de estado do checkout) não
 *      são tocados;
 *   3. a cor por campo (`web/lib/fieldColors.ts`, inline `!important`) continua a
 *      ganhar — por isso a regra nova tem de ficar numa folha de estilo.
 *
 * Porque é que as asserções são sobre o **texto-fonte** e não sobre o DOM:
 * `vitest.config.ts` tem `environment: "node"` e não há jsdom nem happy-dom nas
 * dependências; `web/lib/iconColor.ts` usa `document`, `MutationObserver` e
 * `HTMLElement`, logo não pode ser importado daqui. É o mesmo padrão
 * `readFileSync` de `tests/fieldColorIcons.test.ts`, `tests/paymentsMirror.test.ts`
 * e `tests/comingSoon.test.ts`. Um teste de comportamento real (jsdom) fica
 * disponível como passo seguinte, mas acrescentar uma dependência é decisão do
 * dono do repositório.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const ICON_COLOR = ler("web/lib/iconColor.ts");
const FIELD_COLORS = ler("web/lib/fieldColors.ts");

/** Recorta o texto entre dois marcadores, falhando se algum desaparecer. */
function trecho(texto: string, inicio: string, fim: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `marcador inicial não encontrado: ${inicio}`).toBeGreaterThan(-1);
  const j = texto.indexOf(fim, i + inicio.length);
  expect(j, `marcador final não encontrado: ${fim}`).toBeGreaterThan(i);
  return texto.slice(i, j);
}

/** Só o código: os comentários explicam as armadilhas e citam-nas pelo nome. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const CODIGO = semComentarios(ICON_COLOR);
const CSS = trecho(ICON_COLOR, "const ICON_CSS =", "\nfunction ensureIconStyle");
const SCAN = trecho(ICON_COLOR, "function scanButton", "\n/**");
const MARCAR = trecho(ICON_COLOR, "export function markIconTextButtons", "\n/** Observadores");
const APLICAR = trecho(ICON_COLOR, "export function applyIconColor", "\n}");

describe("cor global de ícones — o ícone de um botão com texto segue o texto", () => {
  it("a regra vive na folha de estilo da cor de ícones e faz os ícones herdarem", () => {
    expect(ICON_COLOR).toContain('export const ICON_TEXT_ATTR = "data-mb-icon-text"');
    expect(CSS).toContain("[${ICON_TEXT_ATTR}] ${ICON_SELECTOR}");
    expect(CSS).toContain("{color:inherit !important}");
    // Sob `[data-icons]`: sem cor global de ícones a regra é inerte e o botão
    // continua a pintar o ícone por herança, como já fazia.
    expect(CSS).toContain("[data-icons] [${ICON_TEXT_ATTR}]");
  });

  it("a regra nova vem depois da regra geral (e é mais específica)", () => {
    const geral = CSS.indexOf("[data-icons] .material-symbols-outlined{color:var(--mb-icons) !important}");
    const nova = CSS.indexOf("[data-icons] [${ICON_TEXT_ATTR}]");
    expect(geral).toBeGreaterThan(-1);
    expect(nova).toBeGreaterThan(geral);
  });

  it("reutiliza os seletores de botão e de ícone de fieldColors (uma só definição)", () => {
    expect(ICON_COLOR).toContain('import { BUTTON_ANCESTOR_SELECTOR, ICON_SELECTOR } from "./fieldColors.js"');
    expect(MARCAR).toContain("matches(BUTTON_ANCESTOR_SELECTOR)");
    expect(MARCAR).toContain("querySelectorAll<HTMLElement>(BUTTON_ANCESTOR_SELECTOR)");
    // O módulo das cores por campo é o dono da lista (decisão D8) e não muda.
    expect(FIELD_COLORS).toContain("export const BUTTON_ANCESTOR_SELECTOR");
    expect(FIELD_COLORS).toMatch(/ICON_SELECTOR\s*=\s*"\.material-symbols-outlined"/);
  });
});

describe("«tem texto» vs. «só ícone»", () => {
  it("não conta o nome do glifo como texto (o ícone não é descido)", () => {
    // `textContent` de um `.material-symbols-outlined` é `shopping_cart`: contá-lo
    // daria «tem texto» a todos os botões, incluindo os que só têm ícone.
    expect(SCAN).toContain("classList.contains(ICON_CLASS)");
    expect(SCAN).toMatch(/icon = true;\s*continue;/);
    expect(ICON_COLOR).toContain("const ICON_CLASS = ICON_SELECTOR.slice(1)");
    // E nunca pela via ingénua: `textContent` do botão inclui o nome do glifo.
    expect(semComentarios(SCAN), "leitura ingénua de textContent").not.toContain("textContent");
    expect(semComentarios(MARCAR), "leitura ingénua de textContent").not.toContain("textContent");
  });

  it("aceita nó de texto solto e texto dentro de um <span>", () => {
    // «Adicionar ao carrinho» é um nó de texto solto; `data-pay-label` é um span.
    expect(SCAN).toContain("child.nodeType === 3");
    expect(SCAN).toContain("nodeValue ?? \"\").trim() !== \"\"");
    expect(SCAN).toContain("visit(el)");
  });

  it("o emblema do carrinho não transforma um botão só-com-ícone em botão com texto", () => {
    expect(ICON_COLOR).toContain('const NON_LABEL_SELECTOR = "[data-cart-count]"');
    expect(SCAN).toContain("el.matches(NON_LABEL_SELECTOR)");
    // O emblema é preenchido com um número por `updateCartBadge`.
    expect(ler("web/lib/cart.ts")).toContain('querySelectorAll<HTMLElement>("[data-cart-count]")');
  });

  it("os botões só-com-ícone dos cabeçalhos continuam a ser só-com-ícone", () => {
    // Confirmado por grep: o único conteúdo textual destes botões é o glifo, e o
    // emblema (`data-cart-count`) está na exceção acima.
    const headers = ler("web/templates/headers.ts");
    expect(trecho(headers, "function searchBtn", "\n}")).toContain(
      '<button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>',
    );
    const carrinho = trecho(headers, "function cartBtn", "\n}");
    expect(carrinho).toContain('<span class="material-symbols-outlined">shopping_cart</span>');
    expect(carrinho).toContain("data-cart-count");
    // Quantidade na página de produto e setas do carrossel do Lumière.
    const qty = trecho(ler("web/templates/productPage.ts"), "function qtyHtml", "\n}");
    expect(qty).toContain('<span class="material-symbols-outlined text-[20px]">remove</span>');
    expect(qty).toContain('<span class="material-symbols-outlined text-[20px]">add</span>');
    const lumiere = ler("web/templates/lumiere.ts");
    expect(lumiere).toContain('<span class="material-symbols-outlined">chevron_left</span></button>');
    expect(lumiere).toContain('<span class="material-symbols-outlined">chevron_right</span></button>');
  });
});

describe("ícones com cor explícita própria ficam de fora", () => {
  it("a regra exclui os ícones com cor no atributo style", () => {
    expect(CSS).toContain(':not([style*="color"])');
  });

  it("os indicadores de estado do checkout têm cor própria (logo, não são tocados)", () => {
    const checkout = ler("web/templates/checkoutLayouts.ts");
    // `check_circle` do método escolhido (`methodTile`) e o radio de `methodRow`:
    // botões **com** texto, mas o ícone é indicador de estado, não rótulo.
    expect(checkout).toContain('style="color:var(--brand)">check_circle</span>');
    expect(checkout).toContain('style="color:${active ? "var(--brand)" : "#d4d4d8"}"');
  });

  it("os ícones de rótulo dos botões de marca não têm cor própria (herdam)", () => {
    // «Adicionar ao carrinho» (página de produto) e «Pagar…» (checkout).
    const acoes = trecho(ler("web/templates/productPage.ts"), "function actionsHtml", "\n}");
    expect(acoes).toContain('style="background:${ctx.brand};color:#fff"');
    expect(acoes).toContain('<span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho');
    expect(acoes).not.toMatch(/material-symbols-outlined[^>]*style="color/);
    const pagar = trecho(ler("web/templates/checkoutLayouts.ts"), "function payButton", "\n}");
    expect(pagar).toContain("<span class=\"material-symbols-outlined\">${icon}</span> <span data-pay-label>");
    expect(pagar).not.toMatch(/material-symbols-outlined[^>]*style="color/);
  });
});

describe("a cor por campo continua a ganhar", () => {
  it("iconColor nunca pinta cor inline nos ícones", () => {
    // Inline importante vence folha de estilo importante: se a regra nova fosse
    // inline, criava uma corrida com `applyFieldColors`.
    expect(ICON_COLOR).not.toContain('setProperty("color"');
    expect(ICON_COLOR).toContain("st.textContent = ICON_CSS");
    expect(ICON_COLOR).toContain('st.id = "mb-icons-style"');
  });

  it("fieldColors continua a pintar inline com !important (ficheiro intocado)", () => {
    expect(FIELD_COLORS).toContain('el.style.setProperty("color", color, "important")');
  });

  it("não mexe na exceção das zonas escuras (.mb-dark)", () => {
    expect(CSS).toContain("[data-icons] .mb-dark .material-symbols-outlined{color:inherit !important}");
  });
});

describe("cobertura de todos os pontos de montagem", () => {
  const VISTAS = [
    "web/views/storefront.ts",
    "web/views/product.ts",
    "web/views/category.ts",
    "web/views/cart.ts",
    "web/views/checkout.ts",
  ];

  it("as cinco vistas públicas, o editor e o carrinho lateral aplicam a cor de ícones", () => {
    for (const v of VISTAS) {
      const texto = ler(v);
      expect(texto, `${v} não importa applyIconColor`).toContain('from "../lib/iconColor.js"');
      expect(texto, `${v} não chama applyIconColor`).toContain("applyIconColor(app, custom)");
    }
    expect(ler("web/views/editor.ts")).toContain('applyIconColor($("#preview"), custom)');
    expect(ler("web/lib/cartDrawer.ts")).toContain("applyIconColor(host, custom)");
  });

  it("a travessia corre dentro de applyIconColor, quando há cor definida", () => {
    expect(APLICAR).toContain("markIconTextButtons(root)");
    expect(APLICAR.indexOf('root.setAttribute("data-icons", "")')).toBeLessThan(
      APLICAR.indexOf("markIconTextButtons(root)"),
    );
  });

  it("o HTML montado depois do render é re-marcado por um observador", () => {
    // Rodapé do carrinho lateral, passos do checkout «Etapas», troca do CTA da
    // página de produto, barra de pesquisa do cabeçalho, `withButton`.
    const obs = trecho(ICON_COLOR, "function observeLateMounts", "\n/** Aplica");
    expect(obs).toContain("new MutationObserver");
    expect(obs).toContain("obs.observe(root, { childList: true, subtree: true })");
    // Não observar atributos: a travessia escreve atributos e ficaria em ciclo.
    expect(obs).not.toContain("attributes: true");
    // Âmbito mínimo por mutação: o botão em volta, ou o elemento que mudou.
    expect(obs).toContain("target.closest(BUTTON_ANCESTOR_SELECTOR) ?? target");
    // Um observador por contentor, não um por render.
    expect(ICON_COLOR).toContain("const observers = new WeakMap<HTMLElement, MutationObserver>()");
  });

  it("desmarca os botões que deixam de ter ícone ou texto", () => {
    expect(MARCAR).toContain(`b.setAttribute(ICON_TEXT_ATTR, "")`);
    expect(MARCAR).toContain("b.removeAttribute(ICON_TEXT_ATTR)");
  });
});

describe("desempenho da travessia", () => {
  it("uma travessia por botão, com saída antecipada e sem getComputedStyle", () => {
    expect(CODIGO, "getComputedStyle força recálculo de layout").not.toContain("getComputedStyle");
    expect(SCAN).toContain("if (icon && text) return;");
    // Sem segunda passagem pelos ícones: a regra é resolvida pelo CSS.
    expect(MARCAR).not.toContain("ICON_SELECTOR");
  });

  it("descarta as mutações do render que a travessia já cobriu", () => {
    expect(APLICAR).toContain("observeLateMounts(root)?.takeRecords()");
  });

  it("nada corre quando o dono não definiu cor global de ícones", () => {
    const semCor = APLICAR.slice(APLICAR.indexOf("} else {"));
    expect(semCor).toContain('root.removeAttribute("data-icons")');
    expect(semCor).not.toContain("markIconTextButtons");
  });
});

/**
 * A gaveta de pré-visualização do editor (`buildIframeDoc`) é a **quarta**
 * superfície: monta um documento completo para um `iframe` servido por `srcdoc`.
 * Dois problemas próprios dela:
 *   1. repetia à mão duas das três regras da cor de ícones — e ficou a divergir
 *      no momento em que a terceira (ícone de botão com texto) apareceu;
 *   2. ali **não corre JavaScript** da loja, logo nenhum botão ficava marcado
 *      com `data-mb-icon-text` e o ícone voltava a divergir do rótulo.
 * A correção não duplica a regra de deteção: a folha vem inteira de `ICON_CSS` e
 * a marcação de `markIconTextButtonsInHtml`, que reutiliza a mesma travessia
 * num documento inerte antes de serializar.
 */
describe("gaveta em iframe do editor — a mesma folha e a mesma marcação", () => {
  const EDITOR = ler("web/views/editor.ts");
  const INK = ler("web/lib/ink.ts");
  const IFRAME = trecho(EDITOR, "function buildIframeDoc", "\n  /* ------");

  it("a folha da cor de ícones é exportada e consumida, não repetida", () => {
    expect(ICON_COLOR).toContain("export const ICON_CSS =");
    expect(EDITOR).toContain('import { applyIconColor, ICON_CSS, markIconTextButtonsInHtml } from "../lib/iconColor.js"');
    expect(IFRAME).toContain("${ICON_CSS}");
    // Nenhuma das três regras pode voltar a ser escrita à mão no editor.
    expect(EDITOR, "o editor volta a repetir a regra geral").not.toContain(
      "[data-icons] .material-symbols-outlined",
    );
    expect(EDITOR, "o editor volta a repetir a exceção .mb-dark").not.toContain(
      "[data-icons] .mb-dark",
    );
    expect(EDITOR, "o editor volta a repetir a regra do botão com texto").not.toContain(
      "[data-mb-icon-text]",
    );
  });

  it("o HTML do modelo é marcado antes de ser serializado", () => {
    // A condição cobre as **duas** cores globais: a exceção do ícone de botão
    // com texto existe agora em `ICON_CSS` e em `INK_CSS`, logo a gaveta precisa
    // da marca quando qualquer uma delas está definida (antes só com `iconC`, e
    // com cor de texto sozinha o ícone voltava a divergir do rótulo).
    expect(IFRAME).toContain("const bodyHtml = iconC || ink ? markIconTextButtonsInHtml(innerHtml) : innerHtml;");
    // O corpo do documento passa a sair do HTML marcado.
    expect(IFRAME).toContain("style=\"${bodyStyle}\">${bodyHtml}</body>");
    expect(IFRAME, "o corpo ainda usa o HTML sem marcas").not.toContain(">${innerHtml}</body>");
    // A marcação antes da serialização, não depois.
    expect(IFRAME.indexOf("const bodyHtml =")).toBeLessThan(IFRAME.indexOf("<!DOCTYPE html>"));
  });

  it("não há um segundo sítio a decidir «este botão tem texto»", () => {
    // Um `<script>` inline no documento do iframe corria (ao contrário do
    // `innerHTML`), mas repetiria a travessia de `scanButton`. O editor não pode
    // ter lógica de deteção própria.
    expect(EDITOR, "deteção de texto duplicada no editor").not.toContain("ICON_TEXT_ATTR");
    expect(EDITOR, "deteção de texto duplicada no editor").not.toContain("nodeValue");
    const marcar = trecho(ICON_COLOR, "export function markIconTextButtonsInHtml", "\n}");
    expect(marcar).toContain("markIconTextButtons(inert.body)");
    // Documento inerte: sem contexto de navegação não repete os pedidos das
    // imagens do modelo nem corre scripts — a gaveta não fica mais lenta.
    expect(marcar).toContain("document.implementation.createHTMLDocument");
  });

  it("a gaveta continua a par das cores por-campo", () => {
    // A regra dos ícones de `fieldColorCss` (`:is(botões):has([data-edit=…])
    // .material-symbols-outlined`) é mais específica do que a do botão com
    // texto, logo a cor do campo continua a ganhar dentro do iframe — o mesmo
    // resultado que o preview vivo obtém com o `!important` inline.
    expect(IFRAME).toContain("const fieldCss = fieldColorCss(custom.fieldColors);");
    expect(IFRAME).toContain("${fieldCss}");
  });

  it("as regras de ink da gaveta não divergiram de lib/ink.ts", () => {
    // Mesma armadilha, outro módulo — e a cópia à mão divergiu, como esta
    // asserção previa: a exceção do ícone de botão com texto foi para `INK_CSS`
    // e a gaveta ficou sem ela. A guarda deixou de comparar duas cópias e passou
    // a garantir que **só existe uma**: as regras vivem em lib/ink.ts e a gaveta
    // interpola-as.
    for (const regra of [
      "[data-ink] :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,figcaption,label){color:var(--ink)}",
      "[data-ink] .material-symbols-outlined{color:var(--ink)}",
      "[data-ink] .mb-dark,[data-ink] .mb-dark :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,span,figcaption,label),[data-ink] .mb-dark .material-symbols-outlined{color:inherit}",
    ]) {
      expect(INK, `regra de ink fora de lib/ink.ts: ${regra}`).toContain(regra);
    }
    expect(INK).toContain("export const INK_CSS =");
    expect(EDITOR).toContain('import { applyInk, INK_CSS } from "../lib/ink.js"');
    expect(IFRAME).toContain("${INK_CSS}");
    // Nenhuma regra de ink pode voltar a ser escrita à mão no editor.
    expect(EDITOR, "o editor volta a repetir uma regra de ink").not.toContain("[data-ink] ");
    expect(EDITOR, "o editor volta a ter uma folha de ink própria").not.toContain("const inkCss =");
  });

  it("a exceção do ícone de botão com texto existe nas duas folhas", () => {
    // A porta que faltava: `[data-ink] .material-symbols-outlined` acerta
    // directamente no ícone e a cor do botão só lhe chega por herança, que perde
    // sempre para uma regra sobre o próprio elemento. Sem `!important` em ink.ts,
    // basta ser mais específica e vir depois da regra geral.
    const inkCss = trecho(INK, "export const INK_CSS =", "\nfunction ensureInkStyle");
    expect(inkCss).toContain("[${ICON_TEXT_ATTR}] ${ICON_SELECTOR}{color:inherit}");
    expect(inkCss).toContain("[data-ink] [${ICON_TEXT_ATTR}]");
    expect(inkCss.indexOf("[data-ink] [${ICON_TEXT_ATTR}]")).toBeGreaterThan(
      inkCss.indexOf("[data-ink] .material-symbols-outlined{color:var(--ink)}"),
    );
    // Uma só definição da marca e do seletor do ícone, importadas.
    expect(INK).toContain('from "./iconColor.js"');
    expect(INK).toContain('import { ICON_SELECTOR } from "./fieldColors.js"');
    // Sem `!important` em lado nenhum de ink.ts: a cor por campo (inline
    // `!important`) e os ícones com cor inline própria continuam a ganhar.
    expect(semComentarios(INK), "ink.ts não pode passar a usar !important").not.toContain("!important");
    // E as zonas escuras continuam a herdar.
    expect(inkCss).toContain("[data-ink] .mb-dark .material-symbols-outlined{color:inherit}");
  });

  it("a marcação corre com qualquer das cores globais, sem duas travessias", () => {
    // A cor de texto tem a mesma marca, por isso a travessia continua a viver num
    // só módulo. As duas guardas excluem-se: com as duas cores definidas marca
    // `applyIconColor`; com só a de texto marca esta função. Uma travessia.
    const paraInk = trecho(ICON_COLOR, "export function markIconTextButtonsForInk", "\n/** Aplica");
    expect(paraInk).toContain("markIconTextButtons(root)");
    expect(paraInk).toContain("observeLateMounts(root)?.takeRecords()");
    expect(paraInk).toMatch(/icon\.trim\(\) !== ""\) return;/);
    const aplicarInk = trecho(INK, "export function applyInk", "\n}");
    expect(aplicarInk).toContain("markIconTextButtonsForInk(root, custom)");
    // Só com cor de texto definida: sem ela a exceção é inerte.
    const semInk = aplicarInk.slice(aplicarInk.indexOf("} else {"));
    expect(semInk).toContain('root.removeAttribute("data-ink")');
    expect(semInk).not.toContain("markIconTextButtons");
    // O ink não pode ter travessia própria — seria o segundo sítio a decidir.
    expect(INK, "deteção de texto duplicada em ink.ts").not.toContain("nodeValue");
    expect(INK, "deteção de texto duplicada em ink.ts").not.toContain("querySelectorAll");
  });
});
