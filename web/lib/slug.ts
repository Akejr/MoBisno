/**
 * Slugs amigáveis para URLs de produto: `/produto/<categoria>/<nome>`.
 * A mesma função é usada para gerar o link e para o resolver no router,
 * garantindo coerência.
 */

/** Converte texto em slug (minúsculas, sem acentos, só [a-z0-9-]). */
export function slugify(input: string | null | undefined): string {
  const s = (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

/** Categoria por omissão quando o produto não tem categoria definida. */
export const DEFAULT_CATEGORY_SLUG = "geral";

/** Caminho do produto: `<categoria>/<nome>` (ambos em slug). */
export function productSlugPath(p: { name: string; category?: string | null }): string {
  const cat = slugify(p.category && p.category.trim() !== "" ? p.category : DEFAULT_CATEGORY_SLUG);
  return `${cat}/${slugify(p.name)}`;
}
