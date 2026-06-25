/**
 * Cor de texto/ícones da loja ("ink"). Aplica uma cor global aos textos e
 * ícones sem partir as zonas escuras (marcadas com `.mb-dark`, que mantêm a
 * cor original por herança). Ativa-se apenas quando o dono escolhe uma cor.
 */
import type { StoreCustomization } from "../templates/types.js";

const INK_CSS =
  "[data-ink] :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,figcaption,label){color:var(--ink)}" +
  "[data-ink] .material-symbols-outlined{color:var(--ink)}" +
  "[data-ink] .mb-dark,[data-ink] .mb-dark :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,span,figcaption,label),[data-ink] .mb-dark .material-symbols-outlined{color:inherit}";

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
  } else {
    root.removeAttribute("data-ink");
    root.style.removeProperty("--ink");
  }
}
