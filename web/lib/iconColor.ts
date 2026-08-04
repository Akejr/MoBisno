/**
 * Cor global dos ícones da loja. Aplica uma cor a todos os ícones
 * (`.material-symbols-outlined`) quando o dono a define, mantendo as zonas
 * escuras (`.mb-dark`) por herança. Ativa-se apenas quando há cor definida.
 *
 * ## Ícone dentro de um botão com texto
 *
 * Nos modelos, o ícone de um botão de marca **não tem cor própria**: herda do
 * botão (`<button style="background:var(--brand);color:#fff"><span
 * class="material-symbols-outlined">shopping_cart</span> Adicionar ao
 * carrinho</button>`). A cor global de ícones, sendo `!important`, pintava
 * também esses ícones: o rótulo ficava branco e o glifo de outra cor. A regra
 * nova faz o ícone de um botão **que também tem texto** voltar a herdar a cor
 * do botão, em toda a loja.
 *
 * O CSS não sabe testar «este botão tem texto» (os textos podem ser nós de
 * texto soltos, invisíveis a um seletor), por isso a decisão é tomada em
 * JavaScript — uma travessia que marca esses botões com `ICON_TEXT_ATTR` — e a
 * pintura fica numa **folha de estilo**. A marca é partilhada com a cor de texto
 * (`lib/ink.ts`), que tem exatamente a mesma divergência: a travessia é uma só e
 * vive aqui, exposta por `markIconTextButtonsForInk`. É de propósito: uma declaração inline
 * importante vence uma de folha de estilo com a mesma força, logo a cor por
 * campo (`web/lib/fieldColors.ts`, que pinta inline com `!important`) continua a
 * ganhar sem depender da ordem de execução.
 */
import type { StoreCustomization } from "../templates/types.js";
import { BUTTON_ANCESTOR_SELECTOR, ICON_SELECTOR } from "./fieldColors.js";

/** Atributo que marca um botão com ícone **e** texto. */
export const ICON_TEXT_ATTR = "data-mb-icon-text";

/** Classe dos ícones dos modelos — a mesma de `ICON_SELECTOR`, sem o ponto. */
const ICON_CLASS = ICON_SELECTOR.slice(1);

/**
 * Conteúdo que **não** é rótulo do botão: o emblema do carrinho
 * (`[data-cart-count]`), um contador sobreposto ao ícone que `updateCartBadge`
 * enche com um número. Sem esta exceção, o ícone do carrinho do cabeçalho — que
 * é um botão só-com-ícone — passava a contar como «botão com texto» à primeira
 * unidade no carrinho e perdia a cor global.
 */
const NON_LABEL_SELECTOR = "[data-cart-count]";

/**
 * As três regras da cor de ícones, numa só definição. Exportada porque há um
 * segundo documento a precisar delas: a gaveta de pré-visualização do editor
 * (`buildIframeDoc` em `web/views/editor.ts`) monta um documento próprio para o
 * `iframe`, onde esta folha de estilo não chega. Antes repetia as duas primeiras
 * regras à mão — e ficou logo a divergir quando a terceira apareceu.
 */
export const ICON_CSS =
  "[data-icons] .material-symbols-outlined{color:var(--mb-icons) !important}" +
  "[data-icons] .mb-dark .material-symbols-outlined{color:inherit !important}" +
  // Botão com ícone e texto: o ícone herda a cor do botão (o texto e o glifo
  // ficam da mesma cor). `:not([style*="color"])` deixa de fora os ícones com
  // cor explícita própria — indicadores de estado como o `check_circle` do
  // método escolhido no checkout —, que continuam exatamente como hoje.
  `[data-icons] [${ICON_TEXT_ATTR}] ${ICON_SELECTOR}:not([style*="color"]){color:inherit !important}`;

function ensureIconStyle(): void {
  if (document.getElementById("mb-icons-style")) return;
  const st = document.createElement("style");
  st.id = "mb-icons-style";
  st.textContent = ICON_CSS;
  document.head.appendChild(st);
}

/**
 * Percorre o botão **uma vez** e diz se tem ícone e se tem texto próprio.
 *
 * Os ícones não são descidos: o conteúdo textual de um
 * `.material-symbols-outlined` é o nome do glifo (`shopping_cart`), que aparece
 * em `textContent` — contá-lo daria «tem texto» a todos os botões, incluindo os
 * que só têm ícone. Sai à primeira vez que já sabe as duas respostas e nunca
 * chama `getComputedStyle` (que forçaria recálculo de layout).
 */
function scanButton(button: Element): { icon: boolean; text: boolean } {
  let icon = false;
  let text = false;
  const visit = (node: Element): void => {
    for (let child: ChildNode | null = node.firstChild; child; child = child.nextSibling) {
      if (icon && text) return;
      if (child.nodeType === 3) {
        // Nó de texto solto — é assim que aparece o «Adicionar ao carrinho».
        if ((child.nodeValue ?? "").trim() !== "") text = true;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.classList.contains(ICON_CLASS)) { icon = true; continue; }
      if (el.matches(NON_LABEL_SELECTOR)) continue;
      // Texto num `<span>` — é assim que aparece o `data-pay-label` do checkout.
      visit(el);
    }
  };
  visit(button);
  return { icon, text };
}

/**
 * Marca (ou desmarca) os botões de `scope` — o próprio incluído — que têm ícone
 * e texto. Desmarcar importa: o mesmo botão pode perder o rótulo ou o ícone numa
 * re-renderização (ex.: `withButton`, que troca o conteúdo por um indicador).
 */
export function markIconTextButtons(scope: Element | null): void {
  if (!scope) return;
  const buttons: Element[] = [];
  if (scope.matches(BUTTON_ANCESTOR_SELECTOR)) buttons.push(scope);
  scope.querySelectorAll<HTMLElement>(BUTTON_ANCESTOR_SELECTOR).forEach((b) => buttons.push(b));
  for (const b of buttons) {
    const { icon, text } = scanButton(b);
    if (icon && text) b.setAttribute(ICON_TEXT_ATTR, "");
    else b.removeAttribute(ICON_TEXT_ATTR);
  }
}

/**
 * A mesma marcação, para HTML que ainda é **texto**: devolve-o com os botões com
 * ícone e texto já marcados. Serve a gaveta de pré-visualização do editor, que
 * serializa um documento para um `iframe` onde não corre JavaScript nenhum —
 * sem esta passagem, ali nenhum botão ficaria marcado e o ícone voltava a
 * divergir do rótulo.
 *
 * Reutiliza a travessia acima em vez de repetir a regra de «tem texto» num
 * script à parte — a duplicação foi precisamente o que fez os sítios divergirem.
 *
 * O documento de trabalho vem de `createHTMLDocument`, que **não tem contexto de
 * navegação**: as imagens do modelo não são pedidas outra vez, nada é
 * apresentado e nenhum `<script>` corre. Os blocos `<style>` dos modelos
 * (lumiere, foodmart, heroes, blocks, gallery, o menu mobile dos cabeçalhos)
 * sobrevivem intactos: o conteúdo de um `<style>` é texto cru, que o analisador
 * guarda e a serialização devolve sem escapar.
 */
export function markIconTextButtonsInHtml(html: string): string {
  const inert = document.implementation.createHTMLDocument("");
  inert.body.innerHTML = html;
  markIconTextButtons(inert.body);
  return inert.body.innerHTML;
}

/** Observadores já ligados, um por contentor (não duplicar em cada render). */
const observers = new WeakMap<HTMLElement, MutationObserver>();

/**
 * Muito HTML da loja é montado **depois** do render inicial: o rodapé do
 * carrinho lateral (`web/lib/cartDrawer.ts`), os passos do checkout «Etapas»
 * (`gotoStep`/`refreshStep2`), o CTA da página de produto quando fica esgotado
 * ou sem pagamentos online, a barra de pesquisa do cabeçalho e o indicador de
 * `withButton`. Em vez de acrescentar uma chamada em cada um desses sítios (e
 * ficar sempre a faltar o próximo), um observador re-marca só o que mudou.
 *
 * Observa apenas `childList` — as marcas são atributos, logo a travessia não se
 * pode auto-alimentar. O âmbito de cada re-marcação é o botão que envolve a
 * mudança (quando há um) ou o elemento onde ela ocorreu, nunca a loja toda.
 */
function observeLateMounts(root: HTMLElement): MutationObserver | null {
  const existing = observers.get(root);
  if (existing) return existing;
  if (typeof MutationObserver === "undefined") return null;
  const obs = new MutationObserver((records) => {
    const scopes = new Set<Element>();
    for (const r of records) {
      const target = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (!target) continue;
      scopes.add(target.closest(BUTTON_ANCESTOR_SELECTOR) ?? target);
    }
    for (const s of scopes) markIconTextButtons(s);
  });
  obs.observe(root, { childList: true, subtree: true });
  observers.set(root, obs);
  return obs;
}

/**
 * Ponto de entrada da **cor de texto** (`lib/ink.ts`), que tem a mesma
 * divergência entre o rótulo e o glifo e reaproveita a mesma marca. A travessia
 * vive aqui — um só sítio a decidir «este botão tem texto» — e a chamada é
 * guardada pela ausência de cor global de ícones: com as duas cores definidas é
 * `applyIconColor` que marca, com só a de texto é esta função. As duas guardas
 * excluem-se, logo continua a haver **uma** travessia por render, e nenhuma das
 * cores fica com a marcação órfã.
 *
 * Depende da ordem em que as vistas chamam as duas funções? Não: a marca é a
 * mesma e o resultado da travessia não depende de nenhuma cor, só do DOM. Quem
 * marca primeiro marca igual.
 */
export function markIconTextButtonsForInk(
  root: HTMLElement | null,
  custom: StoreCustomization | undefined,
): void {
  if (!root) return;
  const icon = custom?.colors?.icon;
  if (icon && icon.trim() !== "") return; // `applyIconColor` marca este caso.
  markIconTextButtons(root);
  observeLateMounts(root)?.takeRecords();
}

/** Aplica (ou remove) a cor global de ícones definida pelo dono ao `root`. */
export function applyIconColor(root: HTMLElement | null, custom: StoreCustomization | undefined): void {
  if (!root) return;
  ensureIconStyle();
  const c = custom?.colors?.icon;
  if (c && c.trim() !== "") {
    root.setAttribute("data-icons", "");
    root.style.setProperty("--mb-icons", c);
    // Com cor global de ícones é aqui que a marcação corre — e só aqui: a porta
    // da cor de texto (`markIconTextButtonsForInk`) devolve sem travessia neste
    // caso, para as duas juntas não pagarem duas passagens por render. Sem
    // nenhuma das cores nada disto corre: as duas exceções são inertes (vivem
    // sob `[data-icons]` e `[data-ink]`).
    markIconTextButtons(root);
    // Descarta as mutações do render que acabou de acontecer: já foram cobertas
    // pela travessia acima e uma segunda passagem seria trabalho repetido.
    observeLateMounts(root)?.takeRecords();
  } else {
    root.removeAttribute("data-icons");
    root.style.removeProperty("--mb-icons");
  }
}
