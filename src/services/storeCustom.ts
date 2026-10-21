/**
 * Leitura defensiva da Personalização de uma Loja (domínio puro, sem DOM).
 *
 * A Personalização (`stores.customization`) chega em JSON da base de dados e
 * pode ter **qualquer** forma: há Lojas gravadas por versões antigas da
 * Plataforma, com campos de tipo diferente do que os tipos de
 * `web/templates/types.ts` declaram. É por isso que todas as funções deste
 * módulo aceitam `unknown` em vez de um tipo concreto — o tipo concreto mentia.
 *
 * ## A avaria que este módulo corrige
 *
 * Antes, a leitura destes campos estava espalhada por duas vistas e sem defesa
 * contra tipos errados:
 *
 *  - `resolveWaPhone` (`web/lib/whatsapp.ts`) devolvia `footer.phone` tal como
 *    estava; se fosse um objeto, o `waLink` seguinte chamava `.replace` nesse
 *    objeto → `TypeError`.
 *  - `perksList` (`web/templates/perks.ts`) fazia `(p?.text ?? "").trim()`; se
 *    `text` fosse um número, chamava `.trim` num número → `TypeError`.
 *
 * Em ambos os casos o `TypeError` propaga-se e a Pagina_De_Produto **abre em
 * branco**: uma Loja antiga com `footer.phone` a apontar para um objeto perde a
 * página de produto inteira. Daí a garantia central deste módulo: todas as
 * funções são **totais** — terminam sem lançar para qualquer entrada, incluindo
 * `null`, `undefined`, números, cadeias, arrays, objetos com campos de tipo
 * errado e objetos com ciclos (nenhuma função percorre o objeto em
 * profundidade, pelo que um ciclo é apenas mais um objeto).
 */

/**
 * Devolve o valor como registo de propriedades, ou `null` quando não é um
 * objeto onde faça sentido ler campos. Arrays contam como não-objeto: nem a
 * Personalização nem `footer`/`whatsapp` são listas.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Devolve a cadeia de caracteres, ou `undefined` se o valor não for uma string
 * usável.
 *
 * «Usável» é aqui **exatamente** o que o `||` de `resolveWaPhone` já
 * considerava usável antes deste módulo existir: qualquer string diferente de
 * `""`. Ou seja:
 *
 *  - tudo o que não seja `typeof v === "string"` → `undefined` (é isto que
 *    trava o `TypeError`);
 *  - `""` → `undefined`, para que a cadeia de fallback continue a descer;
 *  - **uma string só com espaços conta como usável** e é devolvida tal e qual,
 *    sem `trim`. Decisão deliberada: `"   "` era truthy no `||` antigo e
 *    portanto vencia o fallback; mudá-la aqui mudaria o número que uma Loja já
 *    gravada apresenta hoje. Quem precisar de rejeitar espaços em branco
 *    aplica o seu próprio `trim` sobre o resultado — é o que `normalizePerks`
 *    faz, porque a lista de garantias sempre filtrou o texto em branco.
 *
 * @param v Valor de origem desconhecida (JSON da base de dados).
 * @returns A própria string quando é usável; `undefined` caso contrário.
 */
export function asText(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Número de telefone predefinido, usado quando a Loja não tem nenhum usável. */
export const WA_DEFAULT_PHONE = "+244 900 000 000";

/**
 * Número de WhatsApp da Loja: `whatsapp.phone` → `footer.phone` →
 * `WA_DEFAULT_PHONE`.
 *
 * `asText` é aplicado em **cada** passo da cadeia, e não só no fim: um
 * `whatsapp.phone` de tipo errado é ignorado (R11.3) e deixa a decisão passar
 * ao `footer.phone`, e um `footer.phone` de tipo errado cai no número
 * predefinido (R11.2). O resultado é **sempre** uma string não vazia, pelo que
 * o `waLink` que o consome pode chamar `.replace` sem se defender.
 *
 * @param custom Personalização da Loja, de forma desconhecida.
 * @returns Número de WhatsApp a usar. Nunca vazio, nunca `undefined`.
 */
export function resolveWaPhone(custom: unknown): string {
  const record = asRecord(custom);
  const fromWhatsApp = asText(asRecord(record?.["whatsapp"])?.["phone"]);
  if (fromWhatsApp !== undefined) return fromWhatsApp;
  const fromFooter = asText(asRecord(record?.["footer"])?.["phone"]);
  if (fromFooter !== undefined) return fromFooter;
  return WA_DEFAULT_PHONE;
}

/**
 * Garantias apresentadas quando a Loja não tem nenhuma própria utilizável.
 *
 * Os três valores são os que `web/templates/perks.ts` já apresentava; mudá-los
 * mudaria o que as Lojas sem garantias personalizadas mostram hoje.
 */
export const DEFAULT_PERKS: readonly { readonly icon: string; readonly text: string }[] = [
  { icon: "local_shipping", text: "Entrega em toda Angola" },
  { icon: "verified", text: "Produto original garantido" },
  { icon: "payments", text: "Pagamento na entrega ou Multicaixa" },
];

/**
 * Garantias da Pagina_De_Produto, lidas de `custom.productPerks`.
 *
 * Um item só é aceite quando **tanto `icon` como `text` são strings usáveis**
 * (R11.4) — é a forma esperada de uma garantia, e é o que o Editor grava. O
 * `text` é ainda rejeitado quando fica vazio depois de `trim`, preservando o
 * filtro `(p?.text ?? "").trim() !== ""` que a lista sempre teve; o valor
 * devolvido é o original, sem `trim`, também como antes. Quando não sobra
 * nenhum item — lista ausente, vazia, de tipo errado, ou toda ela malformada —
 * devolve `DEFAULT_PERKS` (R11.5).
 *
 * O resultado é portanto **sempre** uma lista com pelo menos um item, e em
 * todos os itens `icon` e `text` são strings: quem desenha o HTML não precisa
 * de defesas nem de fallbacks.
 *
 * @param custom Personalização da Loja, de forma desconhecida.
 * @returns Lista de garantias a apresentar, com pelo menos um item. Objetos
 *          novos, seguros de mutar, nunca os de `DEFAULT_PERKS`.
 */
export function normalizePerks(custom: unknown): { icon: string; text: string }[] {
  const raw = asRecord(custom)?.["productPerks"];
  const list: { icon: string; text: string }[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const item = asRecord(entry);
      if (!item) continue;
      const icon = asText(item["icon"]);
      const text = asText(item["text"]);
      if (icon === undefined || text === undefined || text.trim() === "") continue;
      list.push({ icon, text });
    }
  }
  if (list.length > 0) return list;
  return DEFAULT_PERKS.map((p) => ({ icon: p.icon, text: p.text }));
}

/* ----------------------------- Cores em CSS ----------------------------- */

/**
 * Os 148 nomes de cor do CSS (CSS Color 4), mais `transparent`. Sem
 * `currentcolor` nem palavras-chave globais (`inherit`, `initial`…): nada disso
 * é uma cor que o Dono escolha, e cada exceção é mais uma porta.
 */
const CSS_NAMED_COLORS: ReadonlySet<string> = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta",
  "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink",
  "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen",
  "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow",
  "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
  "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
  "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
  "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple",
  "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell",
  "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen",
  "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white",
  "whitesmoke", "yellow", "yellowgreen", "transparent",
]);

/** `#rgb`, `#rgba`, `#rrggbb` e `#rrggbbaa`. */
const CSS_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Um argumento numérico: número, com percentagem ou unidade de ângulo opcionais. */
const CSS_NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg|grad|rad|turn)?`;

/**
 * `rgb()`/`rgba()`/`hsl()`/`hsla()` com argumentos **só numéricos**, na sintaxe
 * de vírgulas (3 ou 4 argumentos) ou na de espaços (3, com `/ alfa` opcional).
 * Nada de `var()`, `calc()` ou funções aninhadas.
 */
const CSS_FUNCTION_COLOR = new RegExp(
  String.raw`^(?:rgba?|hsla?)\(\s*${CSS_NUMBER}(?:\s*,\s*${CSS_NUMBER}\s*,\s*${CSS_NUMBER}(?:\s*,\s*${CSS_NUMBER})?|\s+${CSS_NUMBER}\s+${CSS_NUMBER}(?:\s*\/\s*${CSS_NUMBER})?)\s*\)$`,
  "i",
);

/**
 * Uma cor escolhida pelo Dono, pronta a entrar em CSS — ou `fallback`.
 *
 * ## Porque é que existe
 *
 * As cores da Personalização (`colors.primary`, `colors.text`, `colors.icon`,
 * `fieldColors`, `blocks[i].bg`) são texto livre gravado em JSON, e o JSON é
 * editável por qualquer Dono (e à mão no Painel_Admin). Interpoladas em CSS sem
 * validação, uma «cor» como `red;}</style><script>…` sai do bloco `<style>` e
 * passa a ser HTML; `url(https://…)` faz o navegador de quem vê a página pedir
 * um endereço à escolha do Dono. E quem vê a página não é só o Dono: o
 * diretório `/lojas` desenha as lojas de toda a gente, e o Administrador abre o
 * editor das lojas dos outros. `esc()` não chega — impede que se saia do
 * atributo, mas não que se escreva CSS dentro dele.
 *
 * Aceita **só** o que é uma cor e nada mais: `#hex` de 3, 4, 6 ou 8 dígitos,
 * `rgb()`/`rgba()`/`hsl()`/`hsla()` com argumentos numéricos e os nomes de cor
 * do CSS. Tudo o resto — incluindo `var()`, `url()`, `;`, `}` e `<` — devolve
 * `fallback`. Total: nunca lança, para qualquer entrada.
 *
 * @param value Cor de origem desconhecida (JSON da base de dados).
 * @param fallback O que devolver quando `value` não é uma cor. `""` para «nada».
 * @returns A cor sem espaços nas pontas, ou `fallback`.
 */
export function safeCssColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  // Nenhuma cor válida passa de umas dezenas de caracteres; o teto poupa as
  // expressões regulares a entradas absurdas.
  if (v === "" || v.length > 64) return fallback;
  if (CSS_HEX_COLOR.test(v) || CSS_FUNCTION_COLOR.test(v) || CSS_NAMED_COLORS.has(v.toLowerCase())) return v;
  return fallback;
}
