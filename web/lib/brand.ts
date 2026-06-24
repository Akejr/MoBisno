/** Resolve a cor de marca de uma loja (escolha do dono → default do modelo → fallback). */
import { getTemplate } from "../templates/registry.js";
import type { StoreCustomization } from "../templates/types.js";

export const FALLBACK_BRAND = "#DC2626";

/** Cor de marca a aplicar (`--brand`) para uma loja com um dado modelo. */
export function brandOf(custom: StoreCustomization | undefined, templateId: string): string {
  return custom?.colors?.primary || getTemplate(templateId).defaultBrand || FALLBACK_BRAND;
}
