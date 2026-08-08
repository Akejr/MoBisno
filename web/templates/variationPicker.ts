/**
 * Seletores de Variação da Pagina_De_Produto — HTML partilhado por todos os
 * Modelo_De_Loja (R4.9, R4.11, R4.17).
 *
 * ## Porque é um módulo partilhado com estilo injetado
 *
 * A §0.2 do `MODELO-GUIA.md` não é negociável: os seletores têm de ter a
 * tipografia, os cantos e as cores do **próprio** Modelo_De_Loja — um seletor
 * arredondado num modelo reto (o `lumiere`) é uma inconsistência visível ao
 * navegar. Duplicar o desenho por modelo resolveria isso e traria o problema
 * oposto: seis cópias da mesma regra de negócio (que valores existem, qual está
 * esgotado), que divergem na primeira correção.
 *
 * A separação escolhida é a mesma de `productGalleryHtml` e de `perksItemsHtml`:
 * **a estrutura e os ganchos vivem aqui, o desenho chega por parâmetro**
 * (`VariationPickerStyle`). Cada modelo passa as suas classes e estilos, os
 * mesmos que já usa no bloco «Quantidade» ao lado, e o resultado herda o desenho
 * do modelo sem que este saiba nada de Combinação nem de stock.
 *
 * ## Ganchos (o comportamento vive em `web/views/product.ts`)
 *
 * | Gancho | Onde | Para quê |
 * |---|---|---|
 * | `data-variations="<productId>"` | contentor | raiz dos seletores |
 * | `data-pick-style` | contentor | estilo inline do valor escolhido |
 * | `data-variation-axis="<i>"` | bloco de um eixo | agrupar os valores do eixo |
 * | `data-variation-pick="<i>"` | botão de valor | o índice do eixo a que pertence |
 * | `data-variation-value="<valor>"` | botão de valor | o valor escolhido |
 * | `data-pick-base` | botão de valor | estilo inline de repouso, para restaurar |
 * | `data-sold-out-badge` | dentro do botão | etiqueta «Esgotado» (R4.11) |
 * | `data-variation-note` | fim do contentor | mensagem de rejeição (R4.10, R4.11) |
 *
 * ## R4.16 é a regra mais importante
 *
 * `variationPickerHtml` devolve **cadeia vazia** quando `normalizeVariations`
 * devolve `null` — Produto sem Variação, com Variação desativadas, ou com JSON
 * inútil. Nesse caso o HTML do modelo é exactamente o de hoje: nem um nó a mais.
 *
 * ## Sem JavaScript
 *
 * Os botões não fazem nada no HTML pré-renderizado (o comportamento é montado
 * pela SPA), mas os **nomes das Variação e os respetivos valores ficam legíveis**
 * no HTML, que é o que interessa a um motor de busca. O texto corrido do R4.18 é
 * tarefa separada (`variationsPlainText` em `api/_seo.js`).
 */
import { esc } from "../lib/dom.js";
import {
  combinationAvailable,
  combinationsOf,
  findCombination,
  normalizeVariations,
} from "../../src/services/variations.js";
import type { ProductVariations } from "../../src/models/domain.js";
import type { StoreCustomization, StoreProductView } from "./types.js";

/**
 * Desenho dos seletores, fornecido pelo Modelo_De_Loja (`MODELO-GUIA.md` §0.2).
 *
 * Os campos são deliberadamente os mesmos que um modelo já tem à mão no bloco
 * «Quantidade»: classes do rótulo, classes do botão (é aqui que vivem os cantos)
 * e estilo inline (é aqui que vivem as cores e a moldura).
 */
export interface VariationPickerStyle {
  /** Classes do nome da Variação — a tipografia do rótulo do modelo. */
  labelClass: string;
  /** Estilo inline do nome da Variação (cor, tipografia serifada, etc.). */
  labelStyle?: string;
  /** Classes de cada botão de valor. **Os cantos do modelo vivem aqui.** */
  valueClass: string;
  /** Estilo inline de cada botão de valor em repouso (moldura e cores). */
  valueStyle?: string;
  /**
   * Estilo inline do valor escolhido. Numa loja pública é sempre de marca:
   * `background:var(--brand);color:var(--brand-ink)`. Nunca `#F95901`, que é
   * cor de interface de administração (`MODELO-GUIA.md` §0.6).
   */
  selectedStyle?: string;
  /** Classes da mensagem de rejeição (seleção incompleta ou Combinação esgotada). */
  noteClass?: string;
  /**
   * Classes do contentor. Serve para o espaçamento seguir o do modelo: o
   * `lumiere` separa os blocos com margem **inferior** (`mb-8`), os restantes
   * com margem superior (`mt-8`), e um bloco novo com o espaçamento errado
   * desalinha a coluna toda.
   */
  rootClass?: string;
}

/** Estilo do valor escolhido por omissão: botão de marca. */
const DEFAULT_SELECTED_STYLE = "background:var(--brand);color:var(--brand-ink)";

/** Classes da mensagem de rejeição por omissão. */
const DEFAULT_NOTE_CLASS = "text-sm";

/**
 * Um valor está esgotado **independentemente do resto da seleção** quando todas
 * as Combinação que o contêm estão gravadas com `stock === 0` (R4.11).
 *
 * Uma Combinação **não gravada** conta como disponível — é a regra de stock não
 * controlado (R4.12) — pelo que basta uma para o valor não ficar marcado. É por
 * isso que a marcação estática é conservadora: nunca esconde uma venda possível.
 * A marcação que depende da seleção em curso é refinada em execução por
 * `web/views/product.ts`.
 */
/**
 * Foto associada a um valor de um eixo, ou `""`.
 *
 * A foto está gravada na **Combinação**, não no valor: com um só eixo — que é o
 * caso normal, e o único que o Formulario_De_Produto edita — há uma Combinação
 * por valor e a correspondência é directa. Com dois eixos, o mesmo valor aparece
 * em várias Combinação; fica a **primeira** foto encontrada, que é a leitura
 * previsível («a foto do azul») e nunca uma escolha que mude entre renderizações,
 * porque a ordem das Combinação é determinista.
 */
function imageOfValue(v: ProductVariations, axisIndex: number, value: string): string {
  for (const comb of v.combinations) {
    if (comb.values[axisIndex] !== value) continue;
    if (typeof comb.image === "string" && comb.image !== "") return comb.image;
  }
  return "";
}

function valueSoldOut(v: ProductVariations, axisIndex: number, value: string): boolean {
  const free = v.axes.filter((_, i) => i !== axisIndex);
  const tuples = free.length ? combinationsOf(free) : [[]];
  for (const tuple of tuples) {
    const values: string[] = [];
    let k = 0;
    for (let i = 0; i < v.axes.length; i += 1) {
      values.push(i === axisIndex ? value : (tuple[k++] ?? ""));
    }
    if (combinationAvailable(findCombination(v, values))) return false;
  }
  return true;
}

/**
 * HTML dos seletores de Variação de um Produto: **um seletor por eixo**, com os
 * valores definidos pelo Dono (R4.9).
 *
 * Devolve `""` quando o Produto não tem Variação utilizáveis — e é esse `""` que
 * mantém o comportamento atual inalterado (R4.16).
 *
 * @param product Produto da Pagina_De_Produto.
 * @param custom Personalização da Loja, de onde vêm as Variação.
 * @param style Desenho do Modelo_De_Loja.
 * @returns HTML dos seletores, ou `""`.
 */
export function variationPickerHtml(
  product: StoreProductView,
  custom: StoreCustomization | undefined,
  style: VariationPickerStyle,
): string {
  const v = normalizeVariations(custom, product.id);
  if (!v) return "";

  const selected = style.selectedStyle ?? DEFAULT_SELECTED_STYLE;
  const base = style.valueStyle ?? "";
  const axesHtml = v.axes.map((axis, i) => {
    const values = axis.values.map((value) => {
      const out = valueSoldOut(v, i, value);
      // Foto da versão, quando o Dono a definiu. Vai em `data-variation-image`
      // porque é `web/views/product.ts` que troca a imagem principal ao escolher,
      // e vai também como miniatura dentro do botão: um quadrado com a cor ou o
      // padrão real diz mais do que a palavra «Azul».
      const image = imageOfValue(v, i, value);
      const thumb = image
        ? `<img src="${esc(image)}" alt="" aria-hidden="true" class="w-6 h-6 rounded object-cover shrink-0" />`
        : "";
      return `<button type="button" data-variation-pick="${i}" data-variation-value="${esc(value)}" data-pick-base="${esc(base)}"${image ? ` data-variation-image="${esc(image)}"` : ""}${out ? ' data-sold-out="1" disabled' : ""} aria-pressed="false" class="${style.valueClass}"${base ? ` style="${esc(base)}"` : ""}>
            ${thumb}<span>${esc(value)}</span><span data-sold-out-badge class="${out ? "" : "hidden "}text-[10px] uppercase opacity-60">Esgotado</span>
          </button>`;
    }).join("");
    return `<div data-variation-axis="${i}" class="flex flex-col gap-2 min-w-0">
        <span class="${style.labelClass}"${style.labelStyle ? ` style="${esc(style.labelStyle)}"` : ""}>${esc(axis.name)}</span>
        <div class="flex flex-wrap gap-2 min-w-0">${values}</div>
      </div>`;
  }).join("");

  return `<div data-variations="${esc(product.id)}" data-pick-style="${esc(selected)}" class="${style.rootClass ?? "mt-8 flex flex-col gap-4 min-w-0"}">
      ${axesHtml}
      <p data-variation-note class="hidden ${style.noteClass ?? DEFAULT_NOTE_CLASS}" style="color:#b91c1c" role="status"></p>
    </div>`;
}
