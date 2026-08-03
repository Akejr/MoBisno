/**
 * Guardas da gestão de Variação no Formulario_De_Produto (R4.1 a R4.5, R4.19, R4.20).
 *
 * As asserções são sobre o **texto-fonte** e não sobre o DOM gerado:
 * `web/lib/productForm.ts` depende de `document` e `tests/` compila com
 * `lib: ["ES2022"]`, sem DOM, por isso o módulo não pode ser importado. É o mesmo
 * padrão `readFileSync` de `tests/comingSoon.test.ts` e de `tests/lumiereFooter.test.ts`.
 *
 * O que estas guardas protegem, e porque valem a pena: as três regras que é fácil
 * quebrar sem reparar — a lista de Combinação vem sempre de `syncCombinations`
 * (nunca montada à mão, senão R4.20 deixa de valer), a gravação é em
 * `customization.productVariations[productId]` (decisão D1) e o stock vazio é
 * apagado em vez de virar `0` (os dois estados são distintos, R4.11 e R4.12).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM = readFileSync(join(__dirname, "..", "web/lib/productForm.ts"), "utf8");

describe("Formulario_De_Produto — interruptor e definição das Variação (R4.1, R4.2, R4.4)", () => {
  it("tem um interruptor que ativa e desativa as Variação", () => {
    expect(FORM).toContain("data-var-on");
    expect(FORM).toMatch(/varOn = varOnInput\.checked/);
  });

  it("o nome do eixo é escrito pelo Dono, sem lista fixa de nomes", () => {
    // «Cor» e «Tamanho» só podem aparecer como exemplo num `placeholder`.
    expect(FORM).toContain("data-axis-name");
    const nomesFixos = FORM.split("\n").filter(
      (linha) => /"(Cor|Tamanho)"/.test(linha) && !linha.includes("placeholder"),
    );
    expect(nomesFixos).toEqual([]);
  });

  it("o modo de preço tem exactamente as duas opções do domínio", () => {
    expect(FORM).toContain('data-var-mode="substitui"');
    expect(FORM).toContain('data-var-mode="acresce"');
    expect(FORM).toContain("Substitui o preço base");
    expect(FORM).toContain("Acresce ao preço base");
  });
});

describe("Formulario_De_Produto — Combinação vindas de syncCombinations (R4.3, R4.19, R4.20)", () => {
  it("importa syncCombinations e não regenera a lista à mão", () => {
    expect(FORM).toMatch(/import \{[^}]*syncCombinations[^}]*\} from "\.\.\/\.\.\/src\/services\/variations\.js"/);
    // Uma iteração de eixos a construir tuplos seria a lista montada à mão.
    expect(FORM).not.toMatch(/for \(const value of axis\.values\)/);
  });

  it("remover uma Variação e remover um valor voltam a sincronizar", () => {
    expect(FORM).toContain("data-rm-axis");
    expect(FORM).toContain("data-rm-val");
    for (const bloco of ["axes.splice(", "values.splice("]) {
      const i = FORM.indexOf(bloco);
      expect(i, `remoção não encontrada: ${bloco}`).toBeGreaterThan(-1);
      expect(FORM.slice(i, i + 200)).toContain("drawVariations()");
    }
    expect(FORM).toMatch(/function drawVariations\(\)[\s\S]{0,400}resyncVariations\(\)/);
  });
});

describe("Formulario_De_Produto — preço e stock por Combinação (R4.5, R4.11, R4.12)", () => {
  it("cada Combinação tem campo de preço e campo de stock", () => {
    expect(FORM).toContain("data-comb-price");
    expect(FORM).toContain("data-comb-stock");
  });

  it("stock vazio é ausente e não `0`", () => {
    expect(FORM).toMatch(/delete comb\.stock/);
    expect(FORM).toMatch(/delete comb\.price/);
    // O campo vazio nunca passa a zero por coerção.
    expect(FORM).not.toMatch(/Number\(stockRaw\) \|\| 0[\s\S]{0,40}comb/);
  });
});

describe("Formulario_De_Produto — gravação na Personalização (decisão D1, R4.16)", () => {
  it("grava em customization.productVariations[productId]", () => {
    expect(FORM).toContain("custom.productVariations");
    expect(FORM).toMatch(/map\[productId\] = variations/);
  });

  it("com o interruptor desligado nada é gravado", () => {
    expect(FORM).toMatch(/if \(!varOn\) return null;/);
    expect(FORM).toMatch(/delete custom\.productVariations\[productId\]/);
  });

  it("a gravação acontece depois de o Produto ter id", () => {
    const i = FORM.indexOf("persistProductExtras(res.product.id)");
    expect(i).toBeGreaterThan(-1);
    expect(FORM.lastIndexOf('res.status === "success"', i)).toBeGreaterThan(-1);
  });
});

describe("Formulario_De_Produto — o Painel não apaga fotos extra nem Variação (R12.4)", () => {
  // `applyProductExtras` apaga a entrada quando o formulário está vazio. Fora do editor
  // (separador «Produtos» do Painel) não há Personalização em memória, por isso, sem
  // pré-carregamento, editar um Produto apagava `productImages[id]` e `productVariations[id]`
  // definidos no editor.
  it("fora do editor pré-carrega as fotos extra e as Variação já gravadas", () => {
    const i = FORM.indexOf("if (!opts.customization && product)");
    expect(i, "pré-carregamento fora do editor não encontrado").toBeGreaterThan(-1);
    const bloco = FORM.slice(i, i + 900);
    expect(bloco).toContain("getCustomization(storeId)");
    expect(bloco, "fotos extra pré-carregadas").toMatch(/current\.productImages\?\.\[product\.id\]/);
    expect(bloco, "Variação pré-carregadas").toMatch(/current\.productVariations\?\.\[product\.id\]/);
    expect(bloco).toContain("drawGallery()");
    expect(bloco).toContain("drawVariations()");
  });

  it("a gravação fora do editor espera pelo pré-carregamento", () => {
    // Guardar antes de o pré-carregamento chegar voltaria a apagar os dados.
    expect(FORM).toMatch(/await extrasPreload;[\s\S]{0,200}applyProductExtras\(current, productId\)/);
  });

  it("uma falha de validação tem onde escrever a mensagem", () => {
    // O submit escreve em `[data-errs]`; sem o contentor no HTML era um TypeError.
    expect(FORM).toContain("<div data-errs");
    expect(FORM).toContain('host.querySelector("[data-errs]")');
  });
});
