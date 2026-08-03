/**
 * Tipos de domínio do MôBisno (ver design.md → "Data Models").
 *
 * Estes tipos modelam as entidades centrais da plataforma multi-inquilino:
 * Dono_da_Loja, Loja, Modelo, Asset (Logótipo), Produto e Banner. Os
 * comentários de cada campo documentam as invariantes e limites definidos
 * nos requisitos.
 */

/** Estado de uma Loja: rascunho (não público) ou publicada (visível). */
export type StoreState = "Rascunho" | "Publicada";

/** Categoria de negócio da Loja, selecionada na criação (Requisito 2.3). */
export type StoreType =
  | "Vestuário"
  | "Alimentação"
  | "Eletrónica"
  | "Beleza"
  | "Serviços"
  | "Outro";

/** Formatos de imagem suportados para os recursos de uma Loja. */
export type ImageFormat = "png" | "jpeg" | "svg" | "webp";

/** Tipo de recurso (asset) armazenado para uma Loja. */
export type AssetKind = "logo" | "product" | "banner";

/**
 * Dono_da_Loja: utilizador autenticado que cria e administra Lojas.
 * Ver ER diagram (STORE_OWNER) em design.md.
 */
export interface StoreOwner {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

/**
 * Loja: conjunto de dados e configurações de uma loja online individual,
 * pertencente exclusivamente a um Dono_da_Loja (isolamento de inquilino).
 */
export interface Store {
  id: string;
  /** Proprietário exclusivo da Loja (isolamento de inquilino, Requisito 5.2). */
  ownerId: string;
  /** Nome da Loja: 2–60 caracteres após remoção de espaços (trim). */
  name: string;
  storeType: StoreType;
  /** Referencia exatamente um Modelo associado (Requisito 3.3). */
  templateId: string;
  /** Identificador: 2–63 chars, `[a-z0-9-]`, sem hífen inicial/final/duplo. */
  identifier: string;
  /** Subdomínio composto: `${identifier}.mobisno.com`. */
  subdomain: string;
  state: StoreState;
  createdAt: string;
}

/**
 * Modelo: site pré-construído e selecionável. Nesta fase não é editável,
 * apenas referenciado pela Loja através do seu `id`.
 */
export interface Template {
  id: string;
  name: string;
  previewUrl: string;
}

/**
 * Asset: recurso de imagem armazenado para uma Loja (Logótipo, imagem de
 * Produto ou Banner), referenciado por URL.
 */
export interface Asset {
  id: string;
  /** Loja à qual o recurso pertence (isolamento de inquilino). */
  storeId: string;
  kind: AssetKind;
  url: string;
  format: ImageFormat;
  sizeBytes: number;
}

/**
 * Produto: item à venda registado numa Loja.
 * Validações: nome 1–120, descrição ≤2000, preço 0,00–999.999.999,99
 * (Requisito 7.1).
 */
export interface Product {
  id: string;
  storeId: string;
  /** Nome do Produto: 1–120 caracteres. */
  name: string;
  /** Descrição do Produto: até 2000 caracteres. */
  description: string;
  /** Categoria do Produto (livre, opcional). Ex.: "Camisolas". */
  category?: string;
  /** Produto destacado (aparece na categoria "Destaques"). */
  featured?: boolean;
  /** Produto físico (precisa de entrega/morada). Por omissão `true`. */
  physical?: boolean;
  /** Preço: 0,00 a 999.999.999,99. */
  price: number;
  imageUrl?: string;
  available: boolean;
  /**
   * Stock disponível. `null`/`undefined` = stock não controlado (sempre
   * disponível). `0` = esgotado. Decrementado no servidor a cada venda paga.
   */
  stock?: number | null;
  createdAt: string;
}

/* ------------------------------ Variação ------------------------------ */

/**
 * Variação de um Produto: um eixo de escolha com nome dado pelo Dono (ex.:
 * «Cor», «Tamanho») e a lista de valores possíveis (Requisito 4.2).
 *
 * Os eixos de um Produto vivem numa lista **ordenada** — é essa ordem que dá
 * sentido a `ProductCombination.values` (ver a invariante aí documentada).
 */
export interface ProductVariationAxis {
  /** Nome do eixo escolhido pelo Dono, ex.: "Cor". Não vazio após trim. */
  name: string;
  /** Valores possíveis deste eixo, ex.: ["Preto", "Branco"]. Sem duplicados. */
  values: string[];
}

/**
 * Como interpretar `ProductCombination.price` face ao preço base do Produto
 * (Requisito 4.4). É definido **por Produto**, não por Combinação:
 *
 * - `"substitui"` — o preço da Combinação troca o preço base (Requisito 4.6);
 * - `"acresce"` — o preço da Combinação soma-se ao preço base (Requisito 4.7).
 *
 * Em qualquer dos modos, o preço efetivo é limitado a 0 por baixo. Esse limite
 * é aplicado por `effectivePrice` de `src/services/variations.ts`; aqui só se
 * declara a forma dos dados.
 */
export type VariationPriceMode = "substitui" | "acresce";

/**
 * Combinação: uma versão concreta do Produto, com preço e stock próprios
 * (Requisito 4.5).
 *
 * **Invariante de `values` — correspondência posicional.** `values` tem
 * **exatamente um valor por eixo, na mesma ordem de `ProductVariations.axes`**:
 * `values[i]` é sempre um dos valores de `axes[i]`. Não há nome de eixo
 * guardado na Combinação; a ligação ao eixo é a **posição**, e mais nada.
 *
 * ```ts
 * axes = [{ name: "Cor", values: ["Preto", "Branco"] },
 *         { name: "Tamanho", values: ["S", "M"] }]
 * // values: ["Branco", "M"]  →  Cor = Branco, Tamanho = M
 * // values: ["M", "Branco"]  →  inválida: "M" não é valor de "Cor"
 * ```
 *
 * Daí decorre `values.length === axes.length` para toda a Combinação válida.
 * É esta correspondência que `variantKeyOf` e `findCombination`
 * (`src/services/variations.ts`) exploram para identificar uma Combinação, e é
 * a invariante de que todo o resto das Variação depende — a chave de linha do
 * Carrinho, a etiqueta apresentada ao Cliente e o preço efetivo. Combinação com
 * `values` de comprimento diferente do número de eixos são descartadas por
 * `normalizeVariations`, que é a guarda desta invariante (decisão D1).
 */
export interface ProductCombination {
  /** Um valor por eixo, na ordem de `axes` (ver a invariante acima). */
  values: string[];
  /**
   * Preço da Combinação, interpretado por `ProductVariations.priceMode`:
   * substitui o preço base ou acresce-lhe. **Ausente** = a Combinação não
   * define preço e vale o preço base do Produto (Requisito 4.8).
   */
  price?: number;
  /**
   * Stock desta Combinação, com três estados distintos (Requisitos 4.11, 4.12):
   *
   * - **ausente** — stock não controlado; a Combinação está sempre disponível,
   *   seguindo a regra atual de `Product.stock` não definido;
   * - **`0`** — esgotado; a Combinação é apresentada como esgotada e a adição
   *   ao Carrinho é rejeitada;
   * - **positivo** — disponível.
   *
   * `0` e ausente **não** são equivalentes, e é por isso que o campo é
   * opcional em vez de ser normalizado para `0`.
   */
  stock?: number;
}

/**
 * Variação de um Produto: o conjunto dos eixos, do modo de preço e das
 * Combinação.
 *
 * **Vive fora do tipo `Product`** e fora da validação de
 * `src/services/productService.ts`, por decisão **D1**: a serialização é
 * `customization.productVariations[productId]`, pelo precedente de
 * `productImages` (`MODELO-GUIA.md` §9), o que dispensa migração à base de
 * dados e mantém a Fase D reversível. O custo desse ganho é que estes dados
 * chegam de JSON arbitrário, sem validação de serviço; a guarda é
 * `normalizeVariations` de `src/services/variations.ts`, função total que
 * devolve `null` para tudo o que não respeite esta forma.
 */
export interface ProductVariations {
  /**
   * Interruptor de Variação do Produto (Requisito 4.1). Só `true` ativa as
   * Variação; com qualquer outro valor o Produto corre o comportamento atual na
   * Pagina_De_Produto, no Carrinho e no Checkout (Requisito 4.16).
   */
  enabled: boolean;
  /** Modo de preço das Combinação, definido por Produto (Requisito 4.4). */
  priceMode: VariationPriceMode;
  /**
   * Eixos de Variação, **ordenados**. A ordem é significativa: é a referência
   * posicional de `ProductCombination.values`.
   */
  axes: ProductVariationAxis[];
  /**
   * Combinação com preço e stock próprios. Normalmente o produto cartesiano dos
   * valores dos eixos (Requisito 4.3), mas a lista gravada pode estar
   * desalinhada dos eixos — o Dono removeu um valor, por exemplo — e é
   * `syncCombinations` que a realinha, descartando as Combinação que usavam o
   * valor removido e preservando os dados das restantes (Requisitos 4.19, 4.20).
   */
  combinations: ProductCombination[];
}

/**
 * Banner: imagem promocional exibida na Loja. Limite de 10 por Loja
 * (Requisito 8.1); `position` reflete a ordem de adição (Requisito 8.5).
 */
export interface Banner {
  id: string;
  storeId: string;
  imageUrl: string;
  /** Ordem de adição, estritamente crescente por Loja. */
  position: number;
  createdAt: string;
}
