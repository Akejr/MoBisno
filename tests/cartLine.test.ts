/**
 * Tarefa 14.7 da spec `melhorias-loja-e-admin` (R4.13, R4.16).
 *
 * Exemplos nomeados que fixam a **forma** da chave de linha de Carrinho. Import
 * estático directo: `src/services/cartLine.ts` é puro e não toca em `document`,
 * `window` nem `localStorage`, pelo que não é preciso o contorno de
 * `await import()` com o especificador numa constante que
 * `tests/storeCustom.property.test.ts` usa para os módulos de `web/`.
 *
 * ## Porque é que este ficheiro pequeno é o que mais interessa da Fase D
 *
 * `web/lib/cart.ts` depende de `localStorage` e fica fora do programa de testes.
 * Este módulo é a **única** parte testável da mudança de chave do Carrinho, e a
 * forma da chave é o que garante que os carrinhos gravados **agora**, em
 * telemóveis de Clientes reais, continuam a funcionar depois do deploy — sem
 * migração de dados. Um item legado gravado sem `variantKey` tem de continuar a
 * ser encontrado (R4.16): é por isso que a chave é `"<id>|"` e não `"<id>"`.
 *
 * Exemplos e não propriedade: a regra é uma concatenação de duas partes com um
 * separador, e o que precisa de ser guardado são os valores literais das chaves.
 */
import { describe, it, expect } from "vitest";
import { cartLineKey, type CartLineIdentity } from "../src/services/cartLine.js";

/**
 * Separador dos valores **dentro** de uma `variantKey`, produzido por
 * `variantKeyOf` de `src/services/variations.ts`: U+001F, o *unit separator* do
 * ASCII. Escrito aqui numa constante nomeada — e nunca colado no meio de uma
 * cadeia literal — porque é um carácter de controlo invisível num editor.
 *
 * Não confundir com o `"|"` de `cartLineKey`: são dois separadores em dois
 * níveis, o interior (valores → `variantKey`) e o exterior
 * (`productId` + `variantKey` → chave de linha).
 */
const VALUE_SEPARATOR = "\u001F";

/** `variantKey` de uma Combinação «Azul» + «M», tal como `variantKeyOf` a produz. */
const AZUL_M = ["Azul", "M"].join(VALUE_SEPARATOR);
/** `variantKey` de uma Combinação «Azul» + «L». */
const AZUL_L = ["Azul", "L"].join(VALUE_SEPARATOR);

describe("cartLineKey — item legado sem `variantKey` (R4.16)", () => {
  it('devolve `"p1|"`: o separador está presente e a parte da Combinação fica vazia', () => {
    // A forma legada. Este valor literal é um contrato com dados já gravados em
    // `localStorage`: se mudar, os carrinhos existentes deixam de ser
    // encontrados e o Cliente perde o carrinho no deploy.
    expect(cartLineKey({ productId: "p1" })).toBe("p1|");
  });

  it("dá a mesma chave com `variantKey` ausente, `undefined` ou cadeia vazia", () => {
    // Os três estados em que um item chega sem Combinação: item legado gravado
    // antes das Variação existirem, item novo de um Produto sem Variação
    // (`variantKey: undefined`), e item cuja `variantKey` foi serializada como
    // `""`. Os três são a mesma linha, e é isso que faz o item legado continuar
    // a encontrar-se.
    const legado: CartLineIdentity = { productId: "p1" };
    const explicito: CartLineIdentity = { productId: "p1", variantKey: undefined };
    const vazio: CartLineIdentity = { productId: "p1", variantKey: "" };

    expect(cartLineKey(explicito)).toBe(cartLineKey(legado));
    expect(cartLineKey(vazio)).toBe(cartLineKey(legado));
    expect(new Set([legado, explicito, vazio].map(cartLineKey)).size).toBe(1);
  });
});

describe("cartLineKey — duas Combinação são duas linhas (R4.13)", () => {
  it("dá chaves distintas a duas Combinação do mesmo Produto", () => {
    const azulM = cartLineKey({ productId: "p1", variantKey: AZUL_M });
    const azulL = cartLineKey({ productId: "p1", variantKey: AZUL_L });

    expect(azulM).toBe(`p1|Azul${VALUE_SEPARATOR}M`);
    expect(azulL).toBe(`p1|Azul${VALUE_SEPARATOR}L`);
    // Chaves distintas ⇒ duas linhas independentes no Carrinho, cada uma com a
    // sua quantidade. É a única coisa que `web/lib/cart.ts` precisa deste
    // módulo para cumprir o R4.13.
    expect(azulM).not.toBe(azulL);
  });

  it("separa a linha com Combinação da linha sem Combinação do mesmo Produto", () => {
    // O Produto que ganha Variação depois de já estar no carrinho de alguém: a
    // linha legada e a linha nova coexistem em vez de se fundirem.
    expect(cartLineKey({ productId: "p1", variantKey: AZUL_M })).not.toBe(
      cartLineKey({ productId: "p1" }),
    );
  });

  it("dá chaves distintas à mesma Combinação em Produtos diferentes", () => {
    expect(cartLineKey({ productId: "p1", variantKey: AZUL_M })).not.toBe(
      cartLineKey({ productId: "p2", variantKey: AZUL_M }),
    );
    expect(cartLineKey({ productId: "p1" })).not.toBe(cartLineKey({ productId: "p2" }));
  });
});

describe("cartLineKey — forma da chave", () => {
  it("é determinística: a mesma identidade dá sempre a mesma chave", () => {
    const linha: CartLineIdentity = { productId: "p1", variantKey: AZUL_M };

    expect(cartLineKey(linha)).toBe(cartLineKey(linha));
    expect(cartLineKey({ ...linha })).toBe(cartLineKey(linha));
    expect(cartLineKey({ productId: "p1", variantKey: AZUL_M })).toBe(cartLineKey(linha));
  });

  it('contém o separador `"|"` exactamente uma vez quando a `variantKey` não o contém', () => {
    const comCombinacao = cartLineKey({ productId: "p1", variantKey: AZUL_M });
    const semCombinacao = cartLineKey({ productId: "p1" });

    expect(comCombinacao.split("|")).toHaveLength(2);
    expect(semCombinacao.split("|")).toHaveLength(2);
    // Uma só fronteira ⇒ a chave é legível ao meio: antes do `"|"` está o
    // Produto, depois está a Combinação (vazia quando não há).
    expect(comCombinacao.split("|")[0]).toBe("p1");
    expect(semCombinacao.split("|")[1]).toBe("");
  });
});

describe('cartLineKey — limite documentado: `productId` sem `"|"`', () => {
  // A unicidade da chave **assume** que `productId` não contém `"|"`. A assunção
  // vale na Plataforma: os `id` de Produto vêm de `crypto.randomUUID()`, cujo
  // alfabeto é apenas hexadecimal e `"-"`. Os dois exemplos seguintes fixam
  // onde a violação dessa assunção dói e onde não dói.
  //
  // **É limite, não defeito a corrigir.** Escapar o separador — ou trocá-lo por
  // um carácter de controlo, como o nível interior faz — mudaria a forma da
  // chave e quebraria os carrinhos legados gravados em `localStorage` com a
  // forma `"<id>|"` (R4.16). O custo de escapar é perder o carrinho a Clientes
  // reais; o benefício é eliminar uma colisão que a origem dos `id` já torna
  // impossível. Por isso a assunção fica assumida, e fixada aqui, para que quem
  // vier a mexer nos identificadores de Produto encontre estes testes e saiba
  // porquê.

  it('colide quando o `productId` contém `"|"` e a Combinação absorve o resto', () => {
    // A colisão real: o `"|"` de dentro do `productId` é indistinguível da
    // fronteira entre Produto e Combinação.
    const idComSeparador = cartLineKey({ productId: "a|b", variantKey: "c" });
    const combinacaoComSeparador = cartLineKey({ productId: "a", variantKey: "b|c" });

    expect(idComSeparador).toBe("a|b|c");
    expect(combinacaoComSeparador).toBe("a|b|c");
    expect(idComSeparador).toBe(combinacaoComSeparador);

    // O sinal de que a assunção foi violada: mais de uma fronteira na chave.
    expect(idComSeparador.split("|")).toHaveLength(3);
  });

  it("não colide com o item legado, porque o separador final está sempre lá", () => {
    // O par `{ "a|b", undefined }` e `{ "a", "b" }` **não** colide, e vale a
    // pena registá-lo: o separador terminal obrigatório de `"<id>|"` — a forma
    // que mantém os carrinhos legados vivos — é também o que separa estes dois.
    // A forma escolhida por R4.16 estreita o limite em vez de o alargar.
    expect(cartLineKey({ productId: "a|b" })).toBe("a|b|");
    expect(cartLineKey({ productId: "a", variantKey: "b" })).toBe("a|b");
    expect(cartLineKey({ productId: "a|b" })).not.toBe(
      cartLineKey({ productId: "a", variantKey: "b" }),
    );
  });
});
