/**
 * Cor global dos ícones da loja. Aplica uma cor a todos os ícones
 * (`.material-symbols-outlined`) quando o dono a define, mantendo as zonas
 * escuras (`.mb-dark`) por herança. Ativa-se apenas quando há cor definida.
 */
import type { StoreCustomization } from "../templates/types.js";

const ICON_CSS =
  "[data-icons] .material-symbols-outlined{color:var(--mb-icons) !important}" +
  "[data-icons] .mb-dark .material-symbols-outlined{color:inherit !important}";

function ensureIconStyle(): void {
  if (document.getElementById("mb-icons-style")) return;
  const st = document.createElement("style");
  st.id = "mb-icons-style";
  st.textContent = ICON_CSS;
  document.head.appendChild(st);
}

/** Aplica (ou remove) a cor global de ícones definida pelo dono ao `root`. */
export function applyIconColor(root: HTMLElement | null, custom: StoreCustomization | undefined): void {
  if (!root) return;
  ensureIconStyle();
  const c = custom?.colors?.icon;
  if (c && c.trim() !== "") {
    root.setAttribute("data-icons", "");
    root.style.setProperty("--mb-icons", c);
  } else {
    root.removeAttribute("data-icons");
    root.style.removeProperty("--mb-icons");
  }
}
