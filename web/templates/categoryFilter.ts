/**
 * Barra de filtros por categoria da página de listagem — HTML partilhado por
 * todos os Modelo_De_Loja.
 *
 * ## Porque existe
 *
 * Para trocar de categoria, o cliente só tinha o menu «Categorias» do
 * cabeçalho, que **navega** para outra página: a vista é substituída, o ecrã
 * salta para o topo e o Dono vê «somem todos os botões». A barra resolve isso na
 * própria página — os cartões já estão no ecrã, o filtro apenas os mostra ou
 * esconde (o comportamento vive em `web/views/category.ts`).
 *
 * ## Porque é um módulo partilhado com estilo injetado
 *
 * Mesma razão de `variationPickerHtml` e de `productGalleryHtml`
 * (`MODELO-GUIA.md` §0.2): a barra tem de herdar a tipografia e os cantos do
 * **próprio** modelo — um chip arredondado num modelo reto (o `lumiere`) é uma
 * inconsistência visível ao navegar — mas a estrutura e os ganchos só podem
 * existir num sítio, senão divergem na primeira correção.
 *
 * ## Ganchos (ligados por `web/views/category.ts`)
 *
 * | Gancho | Onde | Para quê |
 * |---|---|---|
 * | `data-cat-filter-bar` | contentor | raiz da barra |
 * | `data-cat-active-style` | contentor | estilo inline do chip escolhido |
 * | `data-cat-filter="<rótulo>"` | chip | a categoria que o chip filtra |
 * | `data-cat-base` | chip | estilo inline de repouso, para restaurar |
 *
 * Os chips são **`<button type="button">`** de propósito: `web/main.ts` interceta
 * o clique em qualquer `<a href="/...">` e navega pelo History API, que é
 * exactamente o que esta barra existe para evitar.
 */
import { esc } from "../lib/dom.js";
import { ALL_LABEL } from "./sectionsModel.js";

/**
 * Desenho da barra, fornecido pelo Modelo_De_Loja (`MODELO-GUIA.md` §0.2).
 *
 * Os campos são os que um modelo já tem à mão: classes do chip (é aqui que
 * vivem os cantos) e estilo inline (é aqui que vivem a moldura e as cores).
 */
export interface CategoryFilterStyle {
  /** Classes de cada chip. **Os cantos do modelo vivem aqui.** */
  chipClass: string;
  /** Estilo inline de cada chip em repouso (moldura e cores). */
  chipStyle?: string;
  /**
   * Estilo inline do chip escolhido. Numa loja pública é sempre de marca —
   * `var(--brand)`/`var(--brand-ink)`, nunca `#F95901`, que é cor de interface
   * de administração (`MODELO-GUIA.md` §0.6).
   */
  activeStyle?: string;
  /**
   * Classes do contentor. Serve para o espaçamento até à grelha seguir o do
   * modelo (o `beauty` e o `lumiere` respiram mais que o `galeria`).
   */
  rootClass?: string;
}

/** Estilo do chip escolhido por omissão: botão de marca com a mesma moldura. */
const DEFAULT_ACTIVE_STYLE =
  "background:var(--brand);color:var(--brand-ink,#fff);border:1px solid var(--brand)";

/**
 * Dois rótulos designam a mesma listagem quando ambos significam «todos os
 * produtos»: as ligações antigas gravadas nas lojas usam `/categoria/todos` e o
 * rótulo do menu é `ALL_LABEL` (o mesmo par que `filterForCategoryPage` aceita).
 */
function sameLabel(a: string, b: string): boolean {
  const all = (s: string): boolean => s === ALL_LABEL || s === "Todos";
  return a === b || (all(a) && all(b));
}

/**
 * HTML da barra de filtros: um chip por rótulo, o primeiro dos quais mostra
 * todos os produtos.
 *
 * Devolve **cadeia vazia** com menos de dois rótulos — uma barra com um só chip
 * não filtra nada e só rouba espaço acima da grelha.
 *
 * @param labels Rótulos da barra (ver `categoryFilterLabels`).
 * @param active Rótulo da listagem que está no ecrã.
 * @param style Desenho do Modelo_De_Loja.
 * @returns HTML da barra, ou `""`.
 */
export function categoryFilterHtml(
  labels: readonly string[],
  active: string,
  style: CategoryFilterStyle,
): string {
  if (labels.length < 2) return "";

  const activeStyle = style.activeStyle ?? DEFAULT_ACTIVE_STYLE;
  const base = style.chipStyle ?? "";
  const chips = labels.map((label) => {
    const on = sameLabel(label, active);
    const inline = on ? activeStyle : base;
    return `<button type="button" data-cat-filter="${esc(label)}" data-cat-base="${esc(base)}" aria-pressed="${on ? "true" : "false"}" class="${style.chipClass}"${inline ? ` style="${esc(inline)}"` : ""}>${esc(label)}</button>`;
  }).join("");

  return `<div data-cat-filter-bar data-cat-active-style="${esc(activeStyle)}" class="${style.rootClass ?? "flex flex-wrap items-center gap-2 mb-8 min-w-0"}" role="group" aria-label="Filtrar por categoria">${chips}</div>`;
}
