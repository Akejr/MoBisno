/**
 * Variação de Produto: leitura, aritmética e apresentação (domínio puro, sem DOM).
 *
 * As Variação de um Produto **não vivem no tipo `Product`**: por decisão **D1**,
 * são serializadas em `customization.productVariations[<productId>]`, pelo
 * precedente de `productImages` (`MODELO-GUIA.md` §9). O ganho é não haver
 * migração à base de dados nem coluna nova; o custo é que estes dados chegam de
 * JSON arbitrário, **fora** da validação de `src/services/productService.ts`, e
 * são editáveis à mão pelo Painel_Admin.
 *
 * ## Totalidade é requisito, não simpatia
 *
 * Todas as funções deste módulo são **totais**: terminam sem lançar para
 * qualquer entrada, incluindo `null`, `undefined`, números, cadeias, arrays,
 * objetos com campos de tipo errado e listas com entradas malformadas. A razão
 * é a avaria do R11: um `TypeError` na leitura da Personalização propaga-se e a
 * Pagina_De_Produto **abre em branco**. Daí o estilo herdado de
 * `src/services/storeCustom.ts` e `src/services/locations.ts` — guardas por
 * campo (`asRecord`, `asText`, `asFinite`) e nenhuma confiança nos tipos
 * declarados.
 *
 * Os parâmetros aparecem tipados (`ProductVariations`, `readonly string[]`, …)
 * porque é isso que ajuda quem chama de `src/`; as guardas de execução existem
 * porque os pontos de chamada reais estão em `web/`, que **não é verificado por
 * tipos**, e recebem o que a coluna `customization` tiver.
 *
 * ## A invariante central
 *
 * `ProductCombination.values` tem **exatamente um valor por eixo, na ordem de
 * `ProductVariations.axes`**: `values[i]` é um dos valores de `axes[i]`. Não há
 * nome de eixo guardado na Combinação — a ligação é a **posição**. Logo
 * `values.length === axes.length` para toda a Combinação válida, e é
 * `normalizeVariations` a guarda dessa invariante (ver `src/models/domain.ts`).
 *
 * ## Os três estados de `stock`
 *
 * **ausente** = não controlado, sempre disponível; **`0`** = esgotado;
 * **positivo** = disponível (R4.11, R4.12). `0` e ausente **não** são
 * equivalentes, e é por isso que nada aqui normaliza um para o outro.
 */

import type {
  ProductCombination,
  ProductVariationAxis,
  ProductVariations,
  VariationPriceMode,
} from "../models/domain.js";

/**
 * Separador dos valores dentro de uma chave de Combinação: U+001F, o
 * *unit separator* do ASCII.
 *
 * A escolha não é decorativa. Com um separador escrevível — `"|"`, `"-"`, `"/"`
 * — a chave dos valores `["A", "B"]` e a do valor único `["A|B"]` seriam a mesma
 * cadeia, e duas Combinação distintas colidiriam numa só linha de Carrinho.
 * U+001F é um carácter de controlo: não existe teclado que o produza, não
 * aparece em texto escrito por um Dono («Azul», «M», «Tamanho único») e não
 * sobrevive a uma colagem de texto normal. É isso, e só isso, que garante que a
 * chave é injetiva sobre os valores realmente usados.
 */
const VALUE_SEPARATOR = "\u001F";

/**
 * Número máximo de Combinação que `combinationsOf` gera.
 *
 * Guarda contra JSON editado à mão: dez eixos de dez valores dão 10¹⁰
 * Combinação, e o produto cartesiano completo bloquearia o navegador — uma
 * função total não pode deixar de terminar. Nenhuma loja real chega perto deste
 * limite (4 cores × 5 tamanhos = 20). Acima dele a lista é **truncada**, sempre
 * no mesmo ponto, porque a ordem de geração é determinista.
 */
const MAX_COMBINATIONS = 2000;

/** Separador entre pares na etiqueta legível de uma Combinação. */
const LABEL_SEPARATOR = " · ";

/* -------------------------------------------------------------------------- */
/* Guardas de leitura                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Devolve o valor como registo de propriedades, ou `null` quando não é um
 * objeto onde faça sentido ler campos. Arrays contam como não-objeto: nem a
 * Personalização, nem o mapa `productVariations`, nem uma Variação são listas.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Devolve o valor como lista, ou uma lista vazia quando não é um array. */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/**
 * Devolve o texto sem espaços nas pontas, ou `undefined` quando não é uma
 * string com conteúdo.
 *
 * Ao contrário de `asText` de `src/services/storeCustom.ts`, aqui o `trim` é
 * aplicado ao **valor devolvido**: um nome de eixo ou um valor de eixo é uma
 * etiqueta que entra numa chave de Combinação e numa etiqueta de linha de
 * Carrinho, e `"M"` e `"M "` não podem ser duas versões distintas do mesmo
 * Produto. Normalizar aqui é o que torna `variantKeyOf` estável.
 */
function asLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Devolve o número quando é finito, `undefined` caso contrário.
 *
 * `NaN` e `Infinity` são do tipo `number` e passariam a barreira de tipos, mas
 * envenenariam toda a aritmética a jusante (um preço `NaN` apresentado ao
 * Cliente, um total `NaN` enviado ao serviço de pagamento). São tratados como
 * **ausentes**, o que faz o preço cair no preço base e o stock em não
 * controlado.
 */
function asFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Devolve o stock de uma Combinação, ou `undefined` para «não controlado».
 *
 * Um stock só existe em unidades inteiras não negativas: `Math.floor` mais
 * limite inferior a 0. Um valor negativo passa a `0` — esgotado, que é a leitura
 * segura — e um valor fracionário desce para o inteiro abaixo, porque metade de
 * uma unidade não se vende. Tudo o que não é número finito conta como ausente,
 * ou seja, tratado como não controlado, exatamente como um campo em falta.
 */
function asStock(value: unknown): number | undefined {
  const n = asFinite(value);
  if (n === undefined) return undefined;
  return Math.max(0, Math.floor(n));
}

/**
 * Modo de preço das Combinação. Só `"acresce"` é `"acresce"`; qualquer outro
 * valor — incluindo tipos errados e cadeias desconhecidas — vale
 * `"substitui"`, que é o modo predefinido e o mais previsível para o Cliente:
 * o preço apresentado é o que a Combinação diz.
 */
function asPriceMode(value: unknown): VariationPriceMode {
  return value === "acresce" ? "acresce" : "substitui";
}

/**
 * Eixos utilizáveis de uma lista de forma desconhecida.
 *
 * Descarta, silenciosamente e por eixo: entradas que não são objetos, eixos com
 * nome vazio (ou de tipo errado), valores que não são texto utilizável e eixos
 * que ficam sem nenhum valor. Dentro de cada eixo os **valores duplicados** são
 * descartados, ficando a primeira ocorrência — dois valores iguais no mesmo eixo
 * dariam duas linhas indistinguíveis no seletor e duas Combinação com a mesma
 * chave.
 *
 * Devolve objetos novos, seguros de mutar: a tarefa 15.3 edita esta lista.
 */
function normalizeAxes(value: unknown): ProductVariationAxis[] {
  const axes: ProductVariationAxis[] = [];
  for (const entry of asList(value)) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = asLabel(record["name"]);
    if (name === undefined) continue;
    const values: string[] = [];
    for (const rawValue of asList(record["values"])) {
      const label = asLabel(rawValue);
      if (label === undefined) continue;
      if (values.includes(label)) continue;
      values.push(label);
    }
    if (values.length === 0) continue;
    axes.push({ name, values });
  }
  return axes;
}

/**
 * Combinação utilizáveis de uma lista de forma desconhecida, validadas contra
 * `axes`.
 *
 * É aqui que a invariante posicional é imposta. Uma Combinação só passa quando:
 *
 *  - é um objeto com `values` em array;
 *  - `values.length === axes.length` — o comprimento errado significa que a
 *    Combinação foi gravada com outro conjunto de eixos e já não se sabe a que
 *    eixo pertence cada valor;
 *  - cada `values[i]` é um dos valores de `axes[i]` — um valor que o Dono
 *    removeu do eixo deixa de existir, e é este teste que descarta a Combinação
 *    que o usava (R4.19);
 *  - a chave resultante ainda não apareceu — duplicados na lista gravada ficam
 *    pela primeira ocorrência, para `findCombination` ser determinista.
 *
 * `price` e `stock` são lidos em separado e **só são escritos quando existem**,
 * porque «sem preço» e «sem stock» são estados com significado próprio (R4.8,
 * R4.12) e não podem ser confundidos com `0`.
 */
function normalizeCombinations(
  value: unknown,
  axes: readonly ProductVariationAxis[],
): ProductCombination[] {
  const combinations: ProductCombination[] = [];
  const seen = new Set<string>();
  for (const entry of asList(value)) {
    const record = asRecord(entry);
    if (!record) continue;
    const rawValues = asList(record["values"]);
    if (rawValues.length !== axes.length) continue;
    const values: string[] = [];
    for (let i = 0; i < axes.length; i += 1) {
      const label = asLabel(rawValues[i]);
      const axis = axes[i];
      if (label === undefined || axis === undefined || !axis.values.includes(label)) break;
      values.push(label);
    }
    if (values.length !== axes.length) continue;
    const key = variantKeyOf(values);
    if (seen.has(key)) continue;
    seen.add(key);
    const combination: ProductCombination = { values };
    const price = asFinite(record["price"]);
    if (price !== undefined) combination.price = price;
    const stock = asStock(record["stock"]);
    if (stock !== undefined) combination.stock = stock;
    const image = asLabel(record["image"]);
    if (image !== undefined) combination.image = image;
    combinations.push(combination);
  }
  return combinations;
}

/* -------------------------------------------------------------------------- */
/* Leitura da Personalização                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lê e normaliza as Variação de um Produto a partir da Personalização da Loja.
 *
 * **Devolve `null` — e é esse `null` que garante o comportamento atual
 * inalterado (R4.16).** Um Produto sem Variação utilizáveis corre exatamente o
 * código de hoje: sem seletores na Pagina_De_Produto, sem `variantKey` no
 * Carrinho, preço igual a `product.price`. Por isso a lista de casos que dão
 * `null` é a parte mais importante desta função:
 *
 *  - `custom` não é objeto, ou `custom.productVariations` não é objeto;
 *  - a entrada `productVariations[productId]` não existe ou não é objeto;
 *  - `enabled !== true` — comparação estrita, sem coerção: `"true"`, `1` e `{}`
 *    não ativam Variação (R4.1);
 *  - `axes` não é array;
 *  - não sobra nenhum eixo com valores depois da normalização.
 *
 * Quando devolve um valor, tudo nele é utilizável e a invariante posicional está
 * garantida: eixos com nome e pelo menos um valor, sem valores duplicados, e
 * Combinação com um valor válido por eixo. As Combinação gravadas são
 * **filtradas, não regeneradas** — a função não inventa Combinação que o Dono
 * não gravou (para regenerar a lista a partir dos eixos existe
 * `syncCombinations`). Uma seleção sem Combinação gravada é legítima e
 * comporta-se como Combinação sem preço e sem stock: preço base, disponível.
 *
 * Total: nunca lança, para qualquer `custom` e qualquer `productId`.
 *
 * @param custom Personalização da Loja (`stores.customization`), de forma
 *        desconhecida.
 * @param productId Identificador do Produto, chave em `productVariations`.
 * @returns Variação utilizáveis, ou `null` para manter o comportamento atual.
 */
export function normalizeVariations(custom: unknown, productId: string): ProductVariations | null {
  const map = asRecord(asRecord(custom)?.["productVariations"]);
  if (!map) return null;
  if (typeof productId !== "string" || productId === "") return null;
  const entry = asRecord(map[productId]);
  if (!entry) return null;
  if (entry["enabled"] !== true) return null;
  if (!Array.isArray(entry["axes"])) return null;
  const axes = normalizeAxes(entry["axes"]);
  if (axes.length === 0) return null;
  return {
    enabled: true,
    priceMode: asPriceMode(entry["priceMode"]),
    axes,
    combinations: normalizeCombinations(entry["combinations"], axes),
  };
}

/* -------------------------------------------------------------------------- */
/* Combinação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Produto cartesiano dos valores dos eixos, na ordem dos eixos (R4.3).
 *
 * **Determinista:** para os mesmos eixos a saída é sempre a mesma lista, na
 * mesma ordem — o primeiro eixo varia mais devagar, o último mais depressa,
 * como um contador. Dois eixos, `Cor = [Preto, Branco]` e `Tamanho = [S, M]`,
 * dão por esta ordem: `[Preto,S]`, `[Preto,M]`, `[Branco,S]`, `[Branco,M]`.
 * Sem esta garantia a lista de Combinação do Formulario_De_Produto mudaria de
 * ordem entre duas aberturas do mesmo Produto.
 *
 * Os eixos são normalizados antes do cálculo, pelo que eixos sem nome ou sem
 * valores não contribuem — e não deixam um lugar vazio nas Combinação, o que
 * mantém a invariante `values.length === axes.length` face aos eixos
 * normalizados. Sem nenhum eixo utilizável devolve `[]`: um Produto sem eixos
 * não tem Combinação nenhuma (e não uma Combinação vazia).
 *
 * A lista é truncada em `MAX_COMBINATIONS`; ver a constante para a razão.
 *
 * Total: nunca lança e termina sempre.
 *
 * @param axes Eixos de Variação, de forma possivelmente inválida.
 * @returns Lista de tuplos de valores. Arrays novos, seguros de mutar.
 */
export function combinationsOf(
  axes: readonly { name: string; values: readonly string[] }[],
): string[][] {
  const normalized = normalizeAxes(axes);
  if (normalized.length === 0) return [];
  let result: string[][] = [[]];
  for (const axis of normalized) {
    const next: string[][] = [];
    for (const prefix of result) {
      for (const value of axis.values) {
        if (next.length >= MAX_COMBINATIONS) break;
        next.push([...prefix, value]);
      }
      if (next.length >= MAX_COMBINATIONS) break;
    }
    result = next;
  }
  return result;
}

/**
 * Realinha a lista de Combinação com os eixos atuais, preservando os dados das
 * que sobrevivem (R4.19, R4.20).
 *
 * A lista devolvida é o produto cartesiano dos eixos normalizados, e cada
 * Combinação **herda o `price` e o `stock` da Combinação gravada com a mesma
 * chave**. Consequências, que são exatamente o que o Dono nota:
 *
 *  - **remover um valor de um eixo** faz desaparecer as Combinação que o usavam
 *    e **as restantes mantêm preço e stock** — a chave das sobreviventes não
 *    mudou, porque o número de eixos não mudou (R4.20);
 *  - **acrescentar um valor** acrescenta Combinação novas, sem preço e sem
 *    stock: valem o preço base e não têm stock controlado, o que é a leitura
 *    correta para uma versão do Produto que o Dono ainda não preencheu;
 *  - **acrescentar ou remover um eixo inteiro** muda o comprimento de `values`
 *    de *todas* as Combinação, logo nenhuma chave antiga corresponde e os dados
 *    não são reaproveitáveis. Não é perda acidental: com um eixo novo, as
 *    Combinação anteriores deixaram de existir enquanto versões do Produto.
 *
 * É **idempotente**: aplicar duas vezes dá o mesmo resultado. E quando a lista
 * de entrada já é o produto cartesiano completo — que é como o
 * Formulario_De_Produto a grava — o resultado é a mesma lista, apenas filtrada.
 *
 * Total: nunca lança, para qualquer `v`, incluindo `null`.
 *
 * @param v Variação gravadas, possivelmente desalinhadas dos eixos.
 * @returns Variação com `combinations` alinhadas aos eixos. Objetos novos.
 */
export function syncCombinations(v: ProductVariations): ProductVariations {
  const record = asRecord(v);
  const axes = normalizeAxes(record?.["axes"]);
  const previous = new Map<string, ProductCombination>();
  for (const combination of normalizeCombinations(record?.["combinations"], axes)) {
    previous.set(variantKeyOf(combination.values), combination);
  }
  const combinations = combinationsOf(axes).map((values) => {
    const kept = previous.get(variantKeyOf(values));
    const combination: ProductCombination = { values };
    if (kept?.price !== undefined) combination.price = kept.price;
    if (kept?.stock !== undefined) combination.stock = kept.stock;
    if (kept?.image !== undefined) combination.image = kept.image;
    return combination;
  });
  return {
    enabled: record?.["enabled"] === true,
    priceMode: asPriceMode(record?.["priceMode"]),
    axes,
    combinations,
  };
}

/**
 * Chave estável de uma Combinação: os valores por ordem de eixo, unidos por
 * U+001F (ver `VALUE_SEPARATOR` para a razão do separador).
 *
 * É a identidade da Combinação em toda a Plataforma: entra em `findCombination`
 * e, através de `cartLineKey` de `src/services/cartLine.ts`, na identidade da
 * linha de Carrinho. Duas seleções diferentes dão sempre chaves diferentes; a
 * mesma seleção dá sempre a mesma chave.
 *
 * Espera valores já normalizados — os que vêm de `normalizeVariations`. Valores
 * que não sejam texto contam como cadeia vazia, para a função não lançar.
 *
 * @param values Valores escolhidos, um por eixo, na ordem dos eixos.
 * @returns Chave da Combinação. `""` para uma lista vazia.
 */
export function variantKeyOf(values: readonly string[]): string {
  return asList(values)
    .map((value) => (typeof value === "string" ? value : ""))
    .join(VALUE_SEPARATOR);
}

/**
 * Etiqueta legível de uma Combinação: `"Cor: Azul · Tamanho: M"` (R4.14, R3.11).
 *
 * É o que o Cliente lê na linha do Carrinho e na mensagem de WhatsApp, e é por
 * isso que inclui o **nome do eixo** e não apenas os valores: «Azul · M» não
 * diz que a segunda etiqueta é um tamanho.
 *
 * Percorre os eixos por ordem e ignora os que não têm valor correspondente em
 * `values` — uma seleção incompleta produz a etiqueta do que já está escolhido
 * em vez de lançar. Com nenhum par utilizável devolve `""`, e quem apresenta
 * trata a etiqueta vazia como «sem Combinação», que é o caso de um Produto sem
 * Variação.
 *
 * @param axes Eixos, na mesma ordem de `values`.
 * @param values Valores escolhidos, um por eixo.
 * @returns Etiqueta legível, ou `""`.
 */
export function variantLabelOf(axes: readonly { name: string }[], values: readonly string[]): string {
  const list = asList(values);
  const parts: string[] = [];
  asList(axes).forEach((entry, index) => {
    const name = asLabel(asRecord(entry)?.["name"]);
    const value = asLabel(list[index]);
    if (name === undefined || value === undefined) return;
    parts.push(`${name}: ${value}`);
  });
  return parts.join(LABEL_SEPARATOR);
}

/**
 * Combinação correspondente a uma seleção, ou `null` quando não há nenhuma
 * gravada.
 *
 * A comparação é feita pela chave de `variantKeyOf`, o que a torna insensível à
 * ordem em que as Combinação estão gravadas e sensível à ordem dos valores —
 * como tem de ser, porque é a posição que liga um valor ao seu eixo.
 *
 * **`null` não é erro.** Significa que o Dono não deu preço nem stock a esta
 * versão do Produto, e é assim que `effectivePrice` e `combinationAvailable` a
 * tratam: preço base e disponível.
 *
 * Total: nunca lança, incluindo com `v` a `null`.
 *
 * @param v Variação do Produto.
 * @param values Valores escolhidos, um por eixo, na ordem dos eixos.
 * @returns A Combinação gravada, ou `null`.
 */
export function findCombination(
  v: ProductVariations,
  values: readonly string[],
): ProductCombination | null {
  const list = asList(values);
  if (list.length === 0) return null;
  const key = variantKeyOf(values);
  for (const entry of asList(asRecord(v)?.["combinations"])) {
    const record = asRecord(entry);
    if (!record) continue;
    const combinationValues = asList(record["values"]).map((value) =>
      typeof value === "string" ? value : "",
    );
    if (combinationValues.length !== list.length) continue;
    if (variantKeyOf(combinationValues) === key) return record as unknown as ProductCombination;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Preço e disponibilidade                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Preço efetivo de uma Combinação (R4.6, R4.7, R4.8, R4.16) — **Propriedade 2**.
 *
 *  - Combinação sem preço (ou inexistente) → **preço base** (R4.8);
 *  - `priceMode` `"substitui"` com preço definido → **preço da Combinação**
 *    (R4.6);
 *  - `priceMode` `"acresce"` → **preço base + preço da Combinação** (R4.7).
 *
 * **O resultado é sempre um número finito maior ou igual a zero.** É a garantia
 * central desta função, e não é teórica: no modo «acresce» o Dono pode gravar um
 * valor negativo para fazer um desconto por versão, e um desconto maior do que o
 * preço base daria um preço negativo — dinheiro a sair da Loja a cada venda. O
 * limite inferior a 0 é aplicado no fim, uma vez, sobre o resultado.
 *
 * Entradas não finitas são neutralizadas antes da aritmética: um preço base
 * `NaN` ou infinito vale `0`, e um preço de Combinação não finito conta como
 * ausente (cai no preço base). No caso extremo de a soma de dois finitos
 * transbordar para infinito, o resultado é `Number.MAX_VALUE` — absurdo como
 * preço, mas finito, que é o que impede um `NaN` de chegar ao total do Checkout.
 *
 * Total: nunca lança, para qualquer entrada.
 *
 * @param basePrice Preço base do Produto (`product.price`).
 * @param comb Combinação escolhida, ou `null` quando não há nenhuma gravada.
 * @param mode Modo de preço do Produto.
 * @returns Preço a apresentar e a cobrar. Finito e ≥ 0.
 */
export function effectivePrice(
  basePrice: number,
  comb: ProductCombination | null,
  mode: VariationPriceMode,
): number {
  const base = asFinite(basePrice) ?? 0;
  const price = asFinite(asRecord(comb)?.["price"]);
  let value: number;
  if (price === undefined) value = base;
  else if (asPriceMode(mode) === "acresce") value = base + price;
  else value = price;
  if (Number.isNaN(value)) return 0;
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  return value < 0 ? 0 : value;
}

/**
 * Disponibilidade de uma Combinação (R4.11, R4.12).
 *
 *  - `stock` **ausente** → `true`: stock não controlado, sempre disponível, tal
 *    como um Produto sem `stock` definido hoje;
 *  - `stock === 0` → `false`: esgotado, e a adição ao Carrinho é rejeitada;
 *  - `stock` positivo → `true`.
 *
 * `0` e ausente **não** são o mesmo caso, e é aqui que a diferença se vê. Um
 * `stock` de tipo errado conta como ausente, pela regra geral do módulo: não
 * bloqueia uma venda por causa de um campo malformado.
 *
 * Uma Combinação **inexistente** (`null`) é `true`, pela mesma razão que
 * `effectivePrice(null)` devolve o preço base: uma seleção sem Combinação
 * gravada é uma versão do Produto que o Dono não restringiu.
 *
 * @param comb Combinação escolhida, ou `null`.
 * @returns `true` quando a Combinação pode ser adicionada ao Carrinho.
 */
export function combinationAvailable(comb: ProductCombination | null): boolean {
  const stock = asStock(asRecord(comb)?.["stock"]);
  return stock === undefined || stock > 0;
}

/* -------------------------------------------------------------------------- */
/* Seleção e apresentação                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Nomes dos eixos sem valor escolhido, na ordem dos eixos (R4.10).
 *
 * É o que a Pagina_De_Produto apresenta quando o Cliente aciona a adição ao
 * Carrinho com a seleção incompleta: a adição é rejeitada e a mensagem diz
 * **quais** as Variação em falta, não que «falta escolher». Lista vazia
 * significa seleção completa, e é a condição que autoriza a adição.
 *
 * Um eixo conta como em falta quando a posição correspondente de `selection` é
 * `null`, `undefined`, uma cadeia vazia ou só espaços, ou não existe — a
 * seleção mais curta do que a lista de eixos é o estado inicial da página, com
 * nenhum seletor tocado. Eixos sem nome utilizável são ignorados: não há nome
 * para apresentar ao Cliente.
 *
 * Total: nunca lança, para qualquer entrada.
 *
 * @param axes Eixos de Variação, na ordem dos eixos.
 * @param selection Valores escolhidos até agora, na mesma ordem.
 * @returns Nomes dos eixos em falta, na ordem dos eixos.
 */
export function missingAxes(
  axes: readonly { name: string }[],
  selection: readonly (string | null)[],
): string[] {
  const chosen = asList(selection);
  const missing: string[] = [];
  asList(axes).forEach((entry, index) => {
    const name = asLabel(asRecord(entry)?.["name"]);
    if (name === undefined) return;
    if (asLabel(chosen[index]) === undefined) missing.push(name);
  });
  return missing;
}

/**
 * Fotografias definidas nas Combinação, sem repetições e na ordem em que estão
 * gravadas.
 *
 * Serve para a galeria da Pagina_De_Produto as incluir como slides: quando o
 * Cliente escolhe uma versão, a imagem dessa versão **já está no documento** e
 * trocar é revelar a que existe, não carregar uma nova. É também isso que as põe
 * como miniaturas navegáveis, e que faz o HTML pré-renderizado (sem JavaScript)
 * mostrar todas as versões do Produto.
 *
 * Total: nunca lança, incluindo com `v` a `null`.
 *
 * @param v Variação do Produto, ou `null`.
 * @returns URLs das fotos, sem repetições. Lista vazia quando não há nenhuma.
 */
export function variationImages(v: ProductVariations | null): string[] {
  const out: string[] = [];
  for (const entry of asList(asRecord(v)?.["combinations"])) {
    const image = asLabel(asRecord(entry)?.["image"]);
    if (image === undefined || out.includes(image)) continue;
    out.push(image);
  }
  return out;
}

/**
 * Texto legível dos eixos e dos respetivos valores, para o HTML pré-renderizado
 * (R4.18).
 *
 * O HTML servido sem JavaScript não tem seletores — os seletores são montados
 * pela SPA — e sem esta linha de texto um motor de busca não veria que o Produto
 * existe em várias versões. A saída é deliberadamente simples e determinista,
 * porque tem de ser **espelhada em `api/_seo.js`** (tarefa 15.6, decisão D9), e
 * uma saída complicada seria uma paridade impossível de manter.
 *
 * **Forma exata:** uma linha por eixo, `nome + ": " + valores unidos por ", "`,
 * as linhas unidas por `"\n"`, sem linha em branco no fim. Para os eixos
 * `Cor = [Preto, Branco]` e `Tamanho = [S, M]`:
 *
 * ```text
 * Cor: Preto, Branco
 * Tamanho: S, M
 * ```
 *
 * Devolve `""` quando não há nenhum eixo utilizável (incluindo `v` a `null`), e
 * quem desenha o HTML omite a secção nesse caso. O equivalente em JavaScript,
 * para a paridade, é
 * `axes.map((a) => a.name + ": " + a.values.join(", ")).join("\n")` sobre os
 * eixos já normalizados.
 *
 * Total: nunca lança, para qualquer entrada.
 *
 * @param v Variação do Produto, ou `null`.
 * @returns Texto legível dos eixos e valores, ou `""`.
 */
export function variationsPlainText(v: ProductVariations | null): string {
  return normalizeAxes(asRecord(v)?.["axes"])
    .map((axis) => `${axis.name}: ${axis.values.join(", ")}`)
    .join("\n");
}
