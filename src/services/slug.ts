/**
 * Slugs de URL — fonte única de verdade (domínio puro, sem DOM).
 *
 * As mesmas funções são usadas para:
 *  - construir as ligações internas nos modelos de loja (`web/templates/*`);
 *  - resolver a rota no router (`web/main.ts`);
 *  - gerar o `sitemap.xml` e o HTML pré-renderizado (`api/*.js`, que espelha
 *    estas regras em JavaScript).
 *
 * Regra de ouro: uma página = uma URL. Nunca usar `encodeURIComponent` sobre o
 * rótulo original numa URL pública (acentos e espaços percent-encoded criam
 * URLs feias e duplicados no Google).
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

/** Slug de uma categoria para a URL `/categoria/<slug>`. */
export function categorySlug(label: string): string {
  return slugify(label);
}

/**
 * Resolve o rótulo real de uma categoria a partir do slug que veio na URL.
 *
 * Aceita também o rótulo por extenso (retrocompatibilidade com as ligações
 * antigas `#/loja/x/categoria/T%C3%A9nis`), para que as URLs já partilhadas
 * continuem a funcionar.
 */
export function resolveCategoryLabel(slugOrLabel: string, labels: readonly string[]): string | null {
  const wanted = slugify(slugOrLabel);
  for (const label of labels) {
    if (slugify(label) === wanted) return label;
  }
  return null;
}
