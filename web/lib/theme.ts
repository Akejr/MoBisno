/**
 * Tema global da loja (Fase 1 do construtor por blocos). Aplica um "estilo"
 * coerente a toda a loja via variáveis CSS, para que qualquer combinação de
 * blocos fique harmoniosa. Ativa-se apenas quando o dono escolhe um estilo.
 */
import type { StoreCustomization } from "../templates/types.js";

const THEME_CSS =
  "[data-theme]{font-family:var(--mb-body-font,inherit)}" +
  "[data-theme] :is(.rounded,.rounded-lg,.rounded-xl,.rounded-2xl,.rounded-3xl){border-radius:var(--mb-radius)}" +
  "[data-theme] :is(h1,h2,h3,h4){font-family:var(--mb-head-font)}";

export type ThemeStyle = "moderno" | "classico" | "minimal" | "editorial";

export const THEME_STYLES: { id: ThemeStyle; label: string }[] = [
  { id: "moderno", label: "Moderno" },
  { id: "classico", label: "Clássico" },
  { id: "minimal", label: "Minimal" },
  { id: "editorial", label: "Editorial (luxo)" },
];

const VARS: Record<ThemeStyle, { radius: string; headFont: string; bodyFont?: string }> = {
  moderno: { radius: "1rem", headFont: "Inter, sans-serif" },
  classico: { radius: "0.35rem", headFont: "'Noto Serif', serif" },
  minimal: { radius: "0px", headFont: "Inter, sans-serif" },
  editorial: { radius: "0.125rem", headFont: "'Playfair Display', serif", bodyFont: "'Montserrat', sans-serif" },
};

function ensureThemeStyle(): void {
  if (document.getElementById("mb-theme-style")) return;
  const st = document.createElement("style");
  st.id = "mb-theme-style";
  st.textContent = THEME_CSS;
  document.head.appendChild(st);
}

/** Aplica (ou remove) o tema global ao contentor `root`. */
export function applyTheme(root: HTMLElement | null, custom: StoreCustomization | undefined): void {
  if (!root) return;
  ensureThemeStyle();
  const style = custom?.theme?.style;
  if (style && VARS[style]) {
    root.setAttribute("data-theme", style);
    root.style.setProperty("--mb-radius", VARS[style].radius);
    root.style.setProperty("--mb-head-font", VARS[style].headFont);
    const body = VARS[style].bodyFont;
    if (body) root.style.setProperty("--mb-body-font", body);
    else root.style.removeProperty("--mb-body-font");
  } else {
    root.removeAttribute("data-theme");
    root.style.removeProperty("--mb-radius");
    root.style.removeProperty("--mb-head-font");
    root.style.removeProperty("--mb-body-font");
  }
}
