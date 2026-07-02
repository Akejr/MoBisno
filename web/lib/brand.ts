/** Resolve a cor de marca de uma loja (escolha do dono → default do modelo → fallback). */
import { getTemplate } from "../templates/registry.js";
import type { StoreCustomization } from "../templates/types.js";

export const FALLBACK_BRAND = "#DC2626";

/** Cor de marca a aplicar (`--brand`) para uma loja com um dado modelo. */
export function brandOf(custom: StoreCustomization | undefined, templateId: string): string {
  return custom?.colors?.primary || getTemplate(templateId).defaultBrand || FALLBACK_BRAND;
}

/**
 * Cor de texto legível sobre uma cor de fundo (hex). Fundo escuro → texto
 * branco; fundo claro → texto escuro. Usa a luminância relativa (WCAG).
 */
export function readableInk(hex: string | undefined): string {
  const h = (hex ?? "").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.55 ? "#111827" : "#ffffff";
}
