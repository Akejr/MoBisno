/**
 * Documento HTML completo com a pré-visualização de uma loja, para `iframe`.
 *
 * Estava privado em `web/views/presetGallery.ts` (`buildStoreDoc`) e saiu para
 * aqui quando o diretório de lojas passou a precisar do mesmo: mostrar a loja
 * **como ela é**, e não uma foto de banner.
 *
 * ## Porque é que tem de ser um `iframe`
 *
 * Duas razões, e as duas doem se forem ignoradas:
 *
 *  1. **Estilos.** O HTML de um modelo traz blocos `<style>` próprios (lumiere,
 *     foodmart, heroes, gallery, menu mobile). Injetado diretamente na página, o
 *     CSS de cada loja escapa e passa a competir com o da página e com o das
 *     outras lojas. Numa grelha com várias, o resultado é imprevisível.
 *  2. **Pontos de quebra.** Dentro de um `iframe` as medias queries respondem à
 *     largura **dele**, não à da janela. É isso que permite pedir um desenho de
 *     computador (1280px) e encolhê-lo, em vez de apanhar o desenho de telemóvel
 *     esticado.
 *
 * Os estilos da página anfitriã são copiados para dentro do documento — Tailwind
 * compilado, fontes, `preconnect`. Sem isso o `iframe` abriria sem CSS nenhum.
 */
import type { StoreCustomization } from "../templates/types.js";

/** Laranja da plataforma, quando a loja não define cor de marca. */
const FALLBACK_BRAND = "#F95901";

/**
 * Variáveis de tema por estilo. Espelha `web/lib/theme.ts` — se lá mudarem,
 * mudar aqui. (Vinha assim de `presetGallery.ts`; o `editorial` não estava na
 * tabela original e continua a herdar o comportamento por omissão.)
 */
const THEME_VARS: Record<string, { radius: string; head: string }> = {
  moderno: { radius: "1rem", head: "Inter, sans-serif" },
  classico: { radius: "0.35rem", head: "'Noto Serif', serif" },
  minimal: { radius: "0px", head: "Inter, sans-serif" },
};

/**
 * Constrói o documento da pré-visualização.
 *
 * @param html HTML do modelo já renderizado (`getTemplate(id).render(view, custom)`).
 * @param custom Personalização da loja, para a cor de marca, a tinta e o tema.
 * @param emptyHtml O que mostrar quando `html` vem vazio.
 */
export function storePreviewDoc(
  html: string,
  custom: StoreCustomization,
  emptyHtml = `<div style="padding:3rem;text-align:center;color:#9ca3af;font-family:sans-serif">Esta loja ainda não tem conteúdo.</div>`,
): string {
  const heads = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style'))
    .map((el) => el.outerHTML).join("\n");
  const primary = custom.colors?.primary ?? FALLBACK_BRAND;
  const ink = custom.colors?.text ?? "";
  const style = custom.theme?.style;
  const tv = style ? THEME_VARS[style] : undefined;
  const vars = `--brand:${primary};`
    + (ink ? `--ink:${ink};` : "")
    + (tv ? `--mb-radius:${tv.radius};--mb-head-font:${tv.head};` : "");
  const attrs = `${ink ? " data-ink" : ""}${style ? ` data-theme="${style}"` : ""}`;
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">${heads}`
    + `<style>html,body{margin:0;padding:0;background:#fff}</style></head>`
    + `<body><div${attrs} style="${vars}">${html || emptyHtml}</div></body></html>`;
}
