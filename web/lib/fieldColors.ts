/**
 * Cores de texto por-campo. Permite ao dono pintar um texto específico
 * (ex.: só o título do hero) de uma cor diferente da cor global (ink).
 * Aplica-se pelo atributo `data-edit="<caminho>"` presente nos textos editáveis
 * dos modelos, tanto no editor como na loja publicada.
 */
import type { StoreCustomization } from "../templates/types.js";

/** Aplica as cores por-campo definidas em `custom.fieldColors` ao contentor. */
export function applyFieldColors(root: HTMLElement | null, custom: StoreCustomization | undefined): void {
  if (!root) return;
  const map = custom?.fieldColors;
  if (!map) return;
  for (const [path, color] of Object.entries(map)) {
    if (!color) continue;
    root.querySelectorAll<HTMLElement>(`[data-edit="${CSS.escape(path)}"]`).forEach((el) => {
      el.style.setProperty("color", color, "important");
    });
  }
}
