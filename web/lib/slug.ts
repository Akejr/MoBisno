/**
 * Slugs amigáveis para URLs de produto e categoria.
 *
 * A implementação vive em `src/services/slug.ts` (domínio puro, partilhado com
 * os testes e espelhado pelas funções serverless). Este ficheiro é apenas a
 * porta de entrada para o código do browser.
 */
export {
  slugify,
  productSlugPath,
  categorySlug,
  resolveCategoryLabel,
  DEFAULT_CATEGORY_SLUG,
} from "../../src/services/slug.js";
