/**
 * Garantias/benefícios da página de produto (ícone + texto). Lista editável e
 * partilhada pelos modelos. Hooks `data-edit-perks` / `data-edit-perk-item` /
 * `data-perk-text` usados pelo editor.
 *
 * A resolução da lista vive em `src/services/storeCustom.ts` (domínio puro,
 * dentro do programa do `tsc` e testável). Aqui fica apenas o desenho do HTML,
 * porque depende de `esc` de `web/lib/dom.ts` — uma dependência do DOM que não
 * é para subir para `src/`.
 */
import { esc } from "../lib/dom.js";
import { normalizePerks } from "../../src/services/storeCustom.js";
import type { StoreCustomization } from "./types.js";

export { DEFAULT_PERKS } from "../../src/services/storeCustom.js";

/**
 * Lista resolvida de garantias (personalizadas ou as por omissão).
 *
 * Delega em `normalizePerks`, que é total: para qualquer forma de
 * Personalização devolve pelo menos um item, todos com `icon` e `text` do tipo
 * cadeia de caracteres. É isso que corrige a Pagina_De_Produto em branco — a
 * versão anterior fazia `(p?.text ?? "").trim()` e um `text` numérico lançava
 * `TypeError` (R11.1, R11.4, R11.5).
 *
 * **Uma diferença deliberada face à versão anterior, verificada antes de ser
 * aceite.** Um item só passa quando `icon` **e** `text` são strings usáveis; a
 * versão anterior filtrava só por `text` e aplicava o fallback
 * `p.icon || "check_circle"`, pelo que um item `{ text: "x" }` sem `icon`
 * renderizava com `check_circle` e agora é omitido (R11.4). Nenhuma Loja perde
 * garantias por causa disto: o único sítio da Plataforma que escreve
 * `productPerks` é `web/views/editor.ts`, e os três caminhos que lá existem
 * gravam sempre `icon` como string não vazia — a materialização inicial usa
 * `… || "check_circle"`, o botão «Adicionar garantia» grava o literal
 * `check_circle`, e a paleta grava um valor de `PERK_ICON_CHOICES`. Nem os
 * Preset, nem o Semeador_De_Modelos, nem `api/` escrevem `productPerks`, e o
 * histórico confirma que o campo nasceu (`0dc11f7`) já com estas garantias,
 * pelo que também não há dados antigos sem `icon`.
 */
export function perksList(custom?: StoreCustomization): { icon: string; text: string }[] {
  return normalizePerks(custom);
}

/** Itens `<li>` da lista de garantias (a embrulhar num `<ul data-edit-perks>`). */
export function perksItemsHtml(custom: StoreCustomization | undefined, brandVar: string): string {
  return perksList(custom)
    .map((p, i) =>
      `<li data-edit-perk-item="${i}" class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${brandVar}">${esc(p.icon)}</span> <span data-perk-text>${esc(p.text)}</span></li>`,
    )
    .join("");
}
