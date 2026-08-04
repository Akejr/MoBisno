/**
 * Cor de texto/ícones da loja ("ink"). Aplica uma cor global aos textos e
 * ícones sem partir as zonas escuras (marcadas com `.mb-dark`, que mantêm a
 * cor original por herança). Ativa-se apenas quando o dono escolhe uma cor.
 *
 * ## Ícone dentro de um botão com texto
 *
 * A regra `[data-ink] .material-symbols-outlined{color:var(--ink)}` acerta
 * **directamente** no ícone; a cor do botão (`<button
 * style="background:var(--brand);color:#fff">`) só lhe chega por **herança**, e
 * um valor herdado perde sempre para uma regra que acerte no próprio elemento.
 * Resultado: rótulo branco e glifo com a cor de texto — a mesma divergência que
 * a cor global de ícones já tinha. A exceção é a mesma de `lib/iconColor.ts`: um
 * botão que tem ícone **e** texto é marcado com `ICON_TEXT_ATTR` e os ícones
 * desse botão voltam a herdar.
 *
 * A marca é partilhada pelas duas portas, por isso a travessia que a escreve
 * vive num só módulo (`lib/iconColor.ts`) e é chamada aqui por
 * `markIconTextButtonsForInk`, que não repete o trabalho quando a cor global de
 * ícones também está definida.
 */
import type { StoreCustomization } from "../templates/types.js";
import { ICON_TEXT_ATTR, markIconTextButtonsForInk } from "./iconColor.js";
import { ICON_SELECTOR } from "./fieldColors.js";

/**
 * As regras da cor de texto, numa só definição. Exportada porque há um segundo
 * documento a precisar delas: a gaveta de pré-visualização do editor
 * (`buildIframeDoc` em `web/views/editor.ts`) monta um documento próprio para o
 * `iframe`, onde esta folha de estilo não chega. Antes repetia-as à mão — a
 * mesma armadilha que o `ICON_CSS` já tinha apanhado.
 */
export const INK_CSS =
  "[data-ink] :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,figcaption,label){color:var(--ink)}" +
  "[data-ink] .material-symbols-outlined{color:var(--ink)}" +
  "[data-ink] .mb-dark,[data-ink] .mb-dark :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,span,figcaption,label),[data-ink] .mb-dark .material-symbols-outlined{color:inherit}" +
  // Botão com ícone e texto: o ícone herda a cor do botão. Vem depois da regra
  // geral e é mais específica (mais um atributo), logo ganha-lhe.
  //
  // Sem o `:not([style*="color"])` de `lib/iconColor.ts`, de propósito: aqui
  // nenhuma regra é `!important`, por isso um ícone com cor **inline** própria
  // (o `check_circle` do método escolhido no checkout) já vence qualquer destas
  // regras por si. Lá o filtro é indispensável — a regra é `!important` e sem
  // ele passaria à frente do inline. Copiá-lo para cá seria letra morta a
  // sugerir que faz algo.
  `[data-ink] [${ICON_TEXT_ATTR}] ${ICON_SELECTOR}{color:inherit}`;

function ensureInkStyle(): void {
  if (document.getElementById("mb-ink-style")) return;
  const st = document.createElement("style");
  st.id = "mb-ink-style";
  st.textContent = INK_CSS;
  document.head.appendChild(st);
}

/** Aplica (ou remove) a cor de texto definida pelo dono ao contentor `root`. */
export function applyInk(root: HTMLElement | null, custom: StoreCustomization | undefined): void {
  if (!root) return;
  ensureInkStyle();
  const ink = custom?.colors?.text;
  if (ink && ink.trim() !== "") {
    root.setAttribute("data-ink", "");
    root.style.setProperty("--ink", ink);
    // Sem cor de texto a exceção é inerte (vive sob `[data-ink]`), por isso a
    // travessia só corre quando há cor definida.
    markIconTextButtonsForInk(root, custom);
  } else {
    root.removeAttribute("data-ink");
    root.style.removeProperty("--ink");
  }
}
