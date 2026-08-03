/**
 * Sobrevenda de stock no servidor — agregação por Produto e stock por Combinação.
 *
 * `api/payment.js` é a **última** porta antes de se cobrar dinheiro: o que o
 * navegador validou não conta, porque o corpo do pedido é escrito pelo cliente.
 * Estes exemplos guardam as duas avarias que deixavam essa porta aberta.
 *
 * ## Defeito 1 — comparação linha a linha
 *
 * `checkStock` comparava **cada linha independentemente** com o
 * `products.stock`, pelo que duas linhas de 3 unidades do mesmo Produto passavam
 * com stock 3. Desde as Variação de Produto (R4) isto deixou de ser um caso
 * raro: duas Combinação do mesmo Produto **são** duas linhas de Carrinho
 * (R4.13), logo o caso passou a ser o normal. A correção é somar as quantidades
 * por Produto antes de comparar.
 *
 * ## Defeito 2 — o servidor não conhecia o stock por Combinação
 *
 * O stock por Combinação vive em
 * `stores.customization.productVariations[<productId>].combinations[].stock`
 * (decisão D1) e o servidor validava e abatia **só** o `products.stock` do
 * Produto inteiro — um Cliente esgotava o tamanho M enquanto o Produto ainda
 * tinha unidades. Duas coisas tinham de mudar: a `variantKey` **não chegava ao
 * servidor** (`web/views/checkout.ts` montava as linhas sem ela), e `checkStock`
 * / `decrementStock` não sabiam ler a Personalização.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * As regras são casos enumeráveis, não uma invariante sobre entrada variável: o
 * `stock` tem exatamente três leituras (ausente = não controlado, `0` =
 * esgotado, positivo = disponível) e a Combinação está gravada ou não está. O
 * que interessa é percorrer esses casos, mais a agregação e a escrita única.
 *
 * ## Como se chega ao módulo
 *
 * `api/_shared.js` importa o cliente do Supabase, por isso não pode ser
 * importado estaticamente aqui. Usa-se o contorno de `tests/logoApi.test.ts`:
 * `await import()` com o especificador numa **constante**, o que impede o `tsc`
 * de seguir o import. O `db` é falso, com a forma que o módulo toca:
 * `from().select().in()`, `from().select().eq().maybeSingle()` e
 * `from().update().eq()`.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeVariations, findCombination, combinationAvailable, variantKeyOf,
} from "../src/services/variations.js";

/** Especificador em constante: mantém `api/_shared.js` fora do `tsc`. */
const ESPECIFICADOR_SHARED = "../api/_shared.js";

/** Linha de encomenda como o servidor a recebe. */
interface Linha {
  id?: string;
  productName?: string;
  productPrice?: number;
  productQuantity?: number;
  iva?: unknown;
  variantKey?: unknown;
}

/** Superfície de `api/_shared.js` exercitada por estes testes. */
interface ApiShared {
  checkStock(db: unknown, products: readonly Linha[], storeId?: string): Promise<string | null>;
  decrementStock(db: unknown, products: readonly Linha[], storeId?: string): Promise<void>;
  cleanProducts(products: readonly Linha[]): Linha[];
  isValidProduct(p: Linha): boolean;
  combinationStockOf(custom: unknown, productId: string, variantKey: unknown): number | undefined;
  variantKeyOfValues(values: unknown): string;
  asVariantKey(value: unknown): string | undefined;
}

const {
  checkStock, decrementStock, cleanProducts, isValidProduct,
  combinationStockOf, variantKeyOfValues, asVariantKey,
} = (await import(ESPECIFICADOR_SHARED)) as unknown as ApiShared;

/* ------------------------------- Base falsa -------------------------------- */

interface ProdutoRow { id: string; name?: string; stock?: number | null }

/** Base de dados falsa: guarda o que foi lido e escrito, para se poder asserir. */
function baseFalsa(opcoes: { produtos?: ProdutoRow[]; custom?: unknown }) {
  const produtos = new Map((opcoes.produtos ?? []).map((p) => [p.id, { ...p }]));
  let custom: unknown = opcoes.custom;
  const leituras: string[] = [];
  const escritas: { tabela: string; id: string; patch: Record<string, unknown> }[] = [];

  const db = {
    from(tabela: string) {
      return {
        select() {
          return {
            async in(_coluna: string, ids: readonly string[]) {
              leituras.push(`${tabela}.in`);
              return { data: ids.map((id) => produtos.get(id)).filter((r) => r !== undefined) };
            },
            eq(_coluna: string, id: string) {
              return {
                async maybeSingle() {
                  leituras.push(`${tabela}.eq`);
                  if (tabela === "stores") return { data: { customization: custom } };
                  return { data: produtos.get(id) ?? null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_coluna: string, id: string) {
              escritas.push({ tabela, id, patch });
              if (tabela === "stores" && "customization" in patch) custom = patch["customization"];
              if (tabela === "products") {
                const row = produtos.get(id);
                if (row) row.stock = patch["stock"] as number;
              }
              return { data: null };
            },
          };
        },
      };
    },
  };

  return {
    db,
    leituras,
    escritas,
    stockDe: (id: string): number | null | undefined => produtos.get(id)?.stock,
    customAtual: (): unknown => custom,
  };
}

/* -------------------------------- Fixtures --------------------------------- */

const PID = "p-1";
const LOJA = "loja-1";

/** Valores por ordem de eixo → `variantKey`, como o cliente a envia. */
const chave = (...valores: string[]): string => variantKeyOf(valores);

const AZUL_M = chave("Azul", "M");
const AZUL_L = chave("Azul", "L");
const VERDE_M = chave("Verde", "M");
const VERDE_L = chave("Verde", "L");

/**
 * Loja com Variação em `PID`: `Azul/M` esgotado, `Azul/L` com 5 unidades,
 * `Verde/M` gravada **sem** stock, `Verde/L` não gravada.
 */
const CUSTOM = {
  productVariations: {
    [PID]: {
      enabled: true,
      priceMode: "substitui",
      axes: [
        { name: "Cor", values: ["Azul", "Verde"] },
        { name: "Tamanho", values: ["M", "L"] },
      ],
      combinations: [
        { values: ["Azul", "M"], stock: 0 },
        { values: ["Azul", "L"], stock: 5 },
        { values: ["Verde", "M"] },
      ],
    },
  },
};

/** Cópia funda, para nenhum exemplo herdar as mutações de outro. */
const custom = (): unknown => JSON.parse(JSON.stringify(CUSTOM)) as unknown;

/** Linha de encomenda com o mínimo que `checkStock` lê. */
function linha(quantidade: number, variantKey?: string): Linha {
  const l: Linha = { id: PID, productName: "Ténis Runner", productPrice: 45000, productQuantity: quantidade };
  if (variantKey !== undefined) l.variantKey = variantKey;
  return l;
}

/* --------------------------- Defeito 1: agregação -------------------------- */

describe("checkStock — as quantidades são somadas por Produto antes de comparar", () => {
  it("recusa duas linhas do mesmo Produto que somadas excedem o stock", async () => {
    // A avaria: 3 + 3 = 6 unidades contra stock 3. Comparadas linha a linha,
    // ambas passavam (3 <= 3) e a Loja vendia o que não tinha.
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 3 }] });

    await expect(checkStock(db, [linha(3), linha(3)], LOJA)).resolves.toBe("Ténis Runner");
  });

  it("passa duas linhas do mesmo Produto que somadas não excedem o stock", async () => {
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 6 }] });

    await expect(checkStock(db, [linha(3), linha(3)], LOJA)).resolves.toBeNull();
  });

  it("soma linhas da mesma Combinação e linhas de Combinação diferentes do mesmo Produto", async () => {
    // Duas Combinação distintas são duas linhas (R4.13) e continuam a consumir o
    // mesmo `products.stock`: 2 + 2 = 4 contra stock 3.
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 3 }], custom: custom() });

    await expect(checkStock(db, [linha(2, AZUL_L), linha(2, VERDE_M)], LOJA)).resolves.toBe("Ténis Runner");
  });

  it("passa quando o stock do Produto é NULL (não controlado), qualquer que seja a soma", async () => {
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: null }] });

    await expect(checkStock(db, [linha(500), linha(500)], LOJA)).resolves.toBeNull();
  });

  it("devolve o nome do primeiro Produto sem stock e `null` quando está tudo bem", async () => {
    // Contrato de retorno inalterado: nome do primeiro Produto em falta, ou null.
    const { db } = baseFalsa({
      produtos: [{ id: "a", name: "Camisa", stock: 10 }, { id: "b", name: "Calças", stock: 1 }],
    });
    const itens: Linha[] = [
      { id: "a", productName: "Camisa", productPrice: 100, productQuantity: 2 },
      { id: "b", productName: "Calças", productPrice: 100, productQuantity: 2 },
    ];

    await expect(checkStock(db, itens, LOJA)).resolves.toBe("Calças");
    await expect(checkStock(db, [itens[0]!], LOJA)).resolves.toBeNull();
    // Linhas sem `id` (a taxa de entrega, por exemplo) não têm stock nenhum.
    await expect(checkStock(db, [{ productName: "Entrega - Talatona", productPrice: 1500, productQuantity: 1 }], LOJA))
      .resolves.toBeNull();
  });
});

/* --------------------- Defeito 2: stock por Combinação --------------------- */

describe("checkStock — stock por Combinação (R4.11, R4.12)", () => {
  it("recusa a Combinação com `stock: 0` mesmo com o Produto inteiro cheio", async () => {
    // O caso que dava a sobrevenda: o tamanho M está esgotado, o Produto tem 10.
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await expect(checkStock(db, [linha(1, AZUL_M)], LOJA)).resolves.toBe("Ténis Runner");
  });

  it("passa a Combinação gravada sem `stock` (não controlado, R4.11)", async () => {
    // Ausente e `0` não são o mesmo caso: `Verde/M` está gravada sem stock.
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await expect(checkStock(db, [linha(9, VERDE_M)], LOJA)).resolves.toBeNull();
  });

  it("passa a Combinação que não está gravada (R4.12)", async () => {
    // Um campo em falta nunca bloqueia uma venda: `Verde/L` é uma seleção válida
    // dos eixos que o Dono nunca gravou. Só o stock do Produto a limita.
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await expect(checkStock(db, [linha(10, VERDE_L)], LOJA)).resolves.toBeNull();
    await expect(checkStock(db, [linha(11, VERDE_L)], LOJA)).resolves.toBe("Ténis Runner");
  });

  it("soma as quantidades da mesma Combinação antes de comparar com o stock dela", async () => {
    // 3 + 3 = 6 contra as 5 unidades de `Azul/L`, com o Produto a dar folga (20).
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 20 }], custom: custom() });

    await expect(checkStock(db, [linha(3, AZUL_L), linha(3, AZUL_L)], LOJA)).resolves.toBe("Ténis Runner");
    await expect(checkStock(db, [linha(3, AZUL_L), linha(2, AZUL_L)], LOJA)).resolves.toBeNull();
  });

  it("não confunde Combinação diferentes: cada uma tem o seu stock", async () => {
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 20 }], custom: custom() });

    // 5 de `Azul/L` (limite exato) mais 5 de `Verde/M` (não controlada).
    await expect(checkStock(db, [linha(5, AZUL_L), linha(5, VERDE_M)], LOJA)).resolves.toBeNull();
    // Uma unidade a mais em `Azul/L` e já não passa.
    await expect(checkStock(db, [linha(6, AZUL_L), linha(5, VERDE_M)], LOJA)).resolves.toBe("Ténis Runner");
  });

  it("uma `variantKey` ausente, vazia ou de tipo errado corre o caminho de hoje", async () => {
    // Carrinhos legados em `localStorage` e encomendas já gravadas em `orders`.
    const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });
    const cruas: unknown[] = ["", null, 7, {}, [], true];

    for (const crua of cruas) {
      const l: Linha = { ...linha(9), variantKey: crua };
      await expect(checkStock(db, [l], LOJA), `variantKey=${JSON.stringify(crua)}`).resolves.toBeNull();
    }
  });
});

describe("checkStock — comportamento atual inalterado (R4.16)", () => {
  it("Produto sem `variantKey` numa Loja com `productVariations` só vê o stock do Produto", async () => {
    const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await expect(checkStock(base.db, [linha(10)], LOJA)).resolves.toBeNull();
    await expect(checkStock(base.db, [linha(11)], LOJA)).resolves.toBe("Ténis Runner");
    // E não gasta uma leitura da Personalização: sem `variantKey` não há nada
    // por Combinação para validar.
    expect(base.leituras.filter((l) => l.startsWith("stores"))).toEqual([]);
  });

  it("sem `storeId` o stock por Combinação não é validado (chamadores antigos)", async () => {
    // A assinatura é aditiva: quem chamar sem o terceiro argumento continua a
    // ter exatamente o comportamento de antes das Variação.
    const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await expect(checkStock(base.db, [linha(1, AZUL_M)])).resolves.toBeNull();
    expect(base.leituras.filter((l) => l.startsWith("stores"))).toEqual([]);
  });

  it("uma Personalização sem Variação utilizáveis não bloqueia nada", async () => {
    const semVariacoes: unknown[] = [
      null, 7, "productVariations", [], {}, { productVariations: 7 }, { productVariations: [] },
      { productVariations: { [PID]: { enabled: false, axes: [{ name: "Cor", values: ["Azul"] }] } } },
      { productVariations: { [PID]: { enabled: "true", axes: [{ name: "Cor", values: ["Azul"] }] } } },
      { productVariations: { [PID]: { enabled: true } } },
      { productVariations: { "outro-produto": { enabled: true, axes: [{ name: "Cor", values: ["Azul"] }] } } },
    ];

    for (const c of semVariacoes) {
      const { db } = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: c });
      await expect(checkStock(db, [linha(1, AZUL_M)], LOJA), JSON.stringify(c)).resolves.toBeNull();
    }
  });
});

/* --------------------------- Abate do stock vendido ----------------------- */

describe("decrementStock — abate do Produto e da Combinação", () => {
  it("abate o `products.stock` somando as linhas do mesmo Produto (comportamento de hoje)", async () => {
    // Leitura fresca por linha: lê 10, escreve 7; lê 7, escreve 4.
    const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }] });

    await decrementStock(base.db, [linha(3), linha(3)], LOJA);

    expect(base.stockDe(PID)).toBe(4);
  });

  it("abate a Combinação numa única escrita da Personalização por encomenda", async () => {
    // Duas linhas de `Azul/L` (5 unidades): 2 + 1 abatidas de uma só vez. Uma
    // escrita por linha releria a Personalização e perderia o abate anterior.
    const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await decrementStock(base.db, [linha(2, AZUL_L), linha(1, AZUL_L)], LOJA);

    const escritasStores = base.escritas.filter((e) => e.tabela === "stores");
    expect(escritasStores).toHaveLength(1);
    expect(combinationStockOf(base.customAtual(), PID, AZUL_L)).toBe(2);
    // O abate do Produto continua a acontecer em paralelo.
    expect(base.stockDe(PID)).toBe(7);
  });

  it("junta os abates de Combinação diferentes na mesma escrita", async () => {
    const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await decrementStock(base.db, [linha(1, AZUL_L), linha(1, AZUL_M), linha(1, VERDE_M)], LOJA);

    expect(base.escritas.filter((e) => e.tabela === "stores")).toHaveLength(1);
    expect(combinationStockOf(base.customAtual(), PID, AZUL_L)).toBe(4);
    // Já estava a 0 e não desce abaixo disso.
    expect(combinationStockOf(base.customAtual(), PID, AZUL_M)).toBe(0);
    // `Verde/M` não tem stock controlado: continua sem `stock`, não fica a 0.
    expect(combinationStockOf(base.customAtual(), PID, VERDE_M)).toBeUndefined();
  });

  it("não escreve a Personalização quando não há nada por Combinação para abater", async () => {
    const semAbate: { nome: string; linhas: Linha[]; storeId?: string }[] = [
      { nome: "sem variantKey", linhas: [linha(2)], storeId: LOJA },
      { nome: "Combinação sem stock", linhas: [linha(2, VERDE_M)], storeId: LOJA },
      { nome: "Combinação não gravada", linhas: [linha(2, VERDE_L)], storeId: LOJA },
      { nome: "sem storeId", linhas: [linha(2, AZUL_L)] },
    ];

    for (const { nome, linhas, storeId } of semAbate) {
      const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });
      await decrementStock(base.db, linhas, storeId);
      expect(base.escritas.filter((e) => e.tabela === "stores"), nome).toEqual([]);
      // O stock do Produto é sempre abatido, em qualquer dos casos.
      expect(base.stockDe(PID), nome).toBe(8);
    }
  });

  it("não abaixo de zero, mesmo que a quantidade exceda o stock da Combinação", async () => {
    const base = baseFalsa({ produtos: [{ id: PID, name: "Ténis Runner", stock: 10 }], custom: custom() });

    await decrementStock(base.db, [linha(99, AZUL_L)], LOJA);

    expect(combinationStockOf(base.customAtual(), PID, AZUL_L)).toBe(0);
  });
});

/* ------------------------- `variantKey` no contrato ----------------------- */

describe("cleanProducts / isValidProduct — `variantKey` aceita e preservada", () => {
  it("preserva a `variantKey` quando é texto com conteúdo", async () => {
    const [limpo] = cleanProducts([{ ...linha(2, AZUL_M), iva: 14 }]);

    expect(limpo).toEqual({
      id: PID, productName: "Ténis Runner", productPrice: 45000, productQuantity: 2,
      iva: 14, variantKey: AZUL_M,
    });
  });

  it("omite a `variantKey` ausente, vazia ou de tipo errado, sem invalidar a linha", async () => {
    const cruas: unknown[] = [undefined, null, "", 7, {}, [], true];

    for (const crua of cruas) {
      const entrada: Linha = { ...linha(2), variantKey: crua };
      const [limpo] = cleanProducts([entrada]);
      expect(limpo, JSON.stringify(crua)).not.toHaveProperty("variantKey");
      // Nunca recusa a encomenda por causa deste campo: há carrinhos legados em
      // `localStorage` e encomendas já gravadas em `orders` sem ele.
      expect(isValidProduct(entrada), JSON.stringify(crua)).toBe(true);
      expect(isValidProduct(limpo!), JSON.stringify(crua)).toBe(true);
    }
    expect(isValidProduct(cleanProducts([linha(2, AZUL_M)])[0]!)).toBe(true);
  });
});

/* ---------------------------- Guarda de paridade -------------------------- */

describe("paridade entre o espelho de api/_shared.js e src/services/variations.ts", () => {
  // `api/` é JavaScript sem type-check e **não pode importar de `src/`** (mundos
  // de módulos distintos; `api/_seo.js` é o precedente). A lógica de Combinação
  // do servidor é por isso um espelho, e `SEO.md` §5.2 exige que espelhos
  // tenham esta guarda: se um dos lados mudar sozinho, este teste falha.

  /** Personalização com uma entrada de Variação para `PID`. */
  const de = (entry: unknown): unknown => ({ productVariations: { [PID]: entry } });

  const EIXOS = [
    { name: "Cor", values: ["Azul", "Verde"] },
    { name: "Tamanho", values: ["M", "L"] },
  ];

  // Casos escolhidos para percorrer as três leituras do `stock`, a Combinação
  // não gravada, a validação posicional (R4.19), os duplicados, e **todos** os
  // caminhos que dão `null` em `normalizeVariations` — é esse `null` que mantém
  // o comportamento atual inalterado (R4.16).
  const casos: { nome: string; custom: unknown }[] = [
    { nome: "as três leituras do stock", custom: CUSTOM },
    { nome: "stock negativo conta como esgotado", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: -3 }] }) },
    { nome: "stock fracionário desce ao inteiro abaixo", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: 2.7 }] }) },
    { nome: "stock de tipo errado conta como ausente", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: "5" }, { values: ["Azul", "L"], stock: null }, { values: ["Verde", "M"], stock: NaN }] }) },
    { nome: "stock infinito conta como ausente", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: Number.POSITIVE_INFINITY }] }) },
    { nome: "duplicados: fica a primeira ocorrência", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: 4 }, { values: ["Azul", "M"], stock: 0 }] }) },
    { nome: "valores com espaços a aparar", custom: de({ enabled: true, axes: [{ name: " Cor ", values: [" Azul ", "Verde"] }, { name: "Tamanho", values: ["M "] }], combinations: [{ values: ["Azul ", " M"], stock: 0 }] }) },
    { nome: "comprimento errado de values", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Azul"], stock: 0 }, { values: ["Azul", "M", "extra"], stock: 0 }] }) },
    { nome: "valor que já não existe no eixo (R4.19)", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: ["Vermelho", "M"], stock: 0 }] }) },
    { nome: "values de tipo errado", custom: de({ enabled: true, axes: EIXOS, combinations: [{ values: [7, "M"], stock: 0 }, { values: null, stock: 0 }, null, 3, "Azul"] }) },
    { nome: "combinations não é array", custom: de({ enabled: true, axes: EIXOS, combinations: { values: ["Azul", "M"], stock: 0 } }) },
    { nome: "combinations ausente", custom: de({ enabled: true, axes: EIXOS }) },
    { nome: "um só eixo", custom: de({ enabled: true, axes: [{ name: "Cor", values: ["Azul", "Verde"] }], combinations: [{ values: ["Azul"], stock: 0 }, { values: ["Verde"], stock: 2 }] }) },
    { nome: "eixo sem valores utilizáveis é descartado", custom: de({ enabled: true, axes: [{ name: "Cor", values: [null, "  ", 3] }, { name: "Tamanho", values: ["M", "L"] }], combinations: [{ values: ["M"], stock: 0 }] }) },
    { nome: "valores duplicados no eixo", custom: de({ enabled: true, axes: [{ name: "Cor", values: ["Azul", "Azul", "Verde"] }], combinations: [{ values: ["Azul"], stock: 0 }] }) },
    { nome: "enabled a false", custom: de({ enabled: false, axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: 0 }] }) },
    { nome: "enabled sem comparação estrita", custom: de({ enabled: "true", axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: 0 }] }) },
    { nome: "enabled ausente", custom: de({ axes: EIXOS, combinations: [{ values: ["Azul", "M"], stock: 0 }] }) },
    { nome: "axes não é array", custom: de({ enabled: true, axes: { name: "Cor", values: ["Azul"] } }) },
    { nome: "axes ausente", custom: de({ enabled: true }) },
    { nome: "entrada do Produto não é objeto", custom: de("Cor: Azul") },
    { nome: "entrada do Produto é array", custom: de([{ name: "Cor", values: ["Azul"] }]) },
    { nome: "productVariations não é objeto", custom: { productVariations: 7 } },
    { nome: "productVariations é array", custom: { productVariations: [] } },
    { nome: "Produto ausente do mapa", custom: { productVariations: { outro: { enabled: true, axes: EIXOS } } } },
    { nome: "custom sem productVariations", custom: { blocks: [], footer: {} } },
    { nome: "custom a null", custom: null },
    { nome: "custom a undefined", custom: undefined },
    { nome: "custom é número", custom: 42 },
    { nome: "custom é array", custom: [{ enabled: true, axes: EIXOS }] },
    { nome: "custom é cadeia", custom: "productVariations" },
  ];

  /** Seleções percorridas em cada caso, incluindo as que não correspondem a nada. */
  const SELECOES: string[][] = [
    ["Azul", "M"], ["Azul", "L"], ["Verde", "M"], ["Verde", "L"],
    ["Vermelho", "M"], ["Azul"], ["M"], ["Azul", "M", "extra"], [],
  ];

  it("o stock de uma Combinação é o mesmo nos dois módulos", () => {
    for (const { nome, custom: c } of casos) {
      for (const valores of SELECOES) {
        const v = normalizeVariations(c, PID);
        const comb = v ? findCombination(v, valores) : null;
        const esperado = comb?.stock;
        const obtido = combinationStockOf(c, PID, variantKeyOf(valores));
        expect(obtido, `${nome} — ${JSON.stringify(valores)}`).toBe(esperado);
        // E a decisão de disponibilidade que dela sai: ausente = não controlado,
        // `0` = esgotado, positivo = disponível (R4.11, R4.12).
        expect(obtido === undefined || obtido > 0, `disponível — ${nome} — ${JSON.stringify(valores)}`)
          .toBe(combinationAvailable(comb));
      }
    }
  });

  it("um identificador de Produto vazio ou de tipo errado dá `undefined` nos dois módulos", () => {
    for (const id of ["", "outro"]) {
      const v = normalizeVariations(CUSTOM, id);
      const comb = v ? findCombination(v, ["Azul", "M"]) : null;
      expect(combinationStockOf(CUSTOM, id, AZUL_M)).toBe(comb?.stock);
    }
  });

  it("a chave de uma Combinação é a mesma nos dois módulos", () => {
    const listas: unknown[] = [
      ["Azul", "M"], ["Azul"], [], ["Azul", "M", "L"], ["A|B"], ["A", "B"],
      [7, "M"], [null, undefined], "Azul", null, undefined, 7, {},
    ];
    for (const lista of listas) {
      const esperado = variantKeyOf(lista as readonly string[]);
      expect(variantKeyOfValues(lista), JSON.stringify(lista)).toBe(esperado);
    }
    // O separador é U+001F, e é ele que torna a chave injetiva: `["A","B"]` e
    // `["A|B"]` não podem colidir.
    expect(variantKeyOfValues(["Azul", "M"])).toBe("Azul\u001FM");
    expect(variantKeyOfValues(["A", "B"])).not.toBe(variantKeyOfValues(["A|B"]));
  });

  it("`asVariantKey` segue a mesma regra de `lineKeyOf` do Carrinho", () => {
    // Só texto com conteúdo conta como Combinação escolhida; o resto é ausente.
    expect(asVariantKey(AZUL_M)).toBe(AZUL_M);
    for (const crua of [undefined, null, "", 7, {}, [], true]) {
      expect(asVariantKey(crua), JSON.stringify(crua)).toBeUndefined();
    }
  });
});
