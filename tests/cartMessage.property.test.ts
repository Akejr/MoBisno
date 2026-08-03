import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { buildCartWhatsAppMessage } from "../src/services/cartMessage.js";
import { orderExtrasArb, orderLinesArb } from "./geradores.js";

/**
 * Formatador injetado no lugar de `formatKz`.
 *
 * A aplicação injeta `formatKz` (`src/services/format.ts`), mas aqui interessa
 * verificar **a composição da mensagem**, não a formatação do Kwanza — que é
 * responsabilidade de outro módulo. Um formatador com delimitadores próprios
 * (`«…»`, fora do conjunto de caracteres que os geradores produzem) torna cada
 * valor monetário impossível de confundir com o resto do texto: sem ele, um
 * nome de Produto arbitrário com dígitos e vírgulas poderia satisfazer por
 * acidente a asserção de que o valor da linha está na mensagem, e a propriedade
 * passaria sem o módulo ter escrito nada. O valor cru também torna qualquer
 * contra-exemplo legível de imediato.
 */
const dinheiro = (v: number): string => `«${v}»`;

/** Etiqueta de Combinação efetiva: a implementação ignora vazio e só-espaços. */
const etiquetaEfetiva = (label: string | undefined): string | null => {
  const t = label?.trim();
  return t ? t : null;
};

describe("cartMessage — mensagem de WhatsApp da encomenda (propriedade)", () => {
  it("contém o nome, a quantidade e o valor de cada linha, a Combinação quando existe, e o total", () => {
    // Feature: melhorias-loja-e-admin, Property 4: Para qualquer Carrinho não vazio, a mensagem de WhatsApp contém o nome, a quantidade e o valor de cada item, a Combinação quando existe, e o total
    // **Validates: Requirements 3.9, 3.10, 3.11**

    // A propriedade tem de cobrir linhas **com** e **sem** Combinação. Em vez de
    // confiar que o gerador produz os dois casos, registamo-los e verificamos no
    // fim: se um deles nunca aparecesse, o teste deixaria de provar metade do
    // que promete e ninguém dava por isso.
    let viuLinhaComCombinacao = false;
    let viuLinhaSemCombinacao = false;

    assertProperty(
      fc.property(orderLinesArb, orderExtrasArb, (lines, extras) => {
        const msg = buildCartWhatsAppMessage(lines, dinheiro, extras);

        for (const line of lines) {
          const etiqueta = etiquetaEfetiva(line.variantLabel);
          if (etiqueta) viuLinhaComCombinacao = true;
          else viuLinhaSemCombinacao = true;

          // Uma só asserção por linha, com as quatro exigências juntas e na
          // mesma linha de texto: quantidade, nome, Combinação quando existe, e
          // valor da linha (`price * quantity`) formatado. Ligá-las num único
          // fragmento é o que prova que a Combinação vai na linha do seu item, e
          // não em qualquer sítio da mensagem (R3.11). O formato é o que o
          // design fixa em § Components (`• 2x Camisola oficial — Cor: Azul ·
          // Tamanho: M (30 000,00 Kz)`).
          const combinacao = etiqueta ? ` — ${etiqueta}` : "";
          const esperado =
            `• ${line.quantity}x ${line.name}${combinacao}` +
            ` (${dinheiro(line.price * line.quantity)})`;
          expect(msg).toContain(esperado);
        }

        // Total da encomenda: soma das linhas, mais a entrega, menos o desconto,
        // limitado a 0 por baixo (R3.10).
        const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
        const total = Math.max(
          0,
          subtotal + (extras?.delivery?.fee ?? 0) - (extras?.discount?.amount ?? 0),
        );
        expect(msg).toContain(`Total: ${dinheiro(total)}`);
      }),
      { numRuns: 100 },
    );

    expect(viuLinhaComCombinacao).toBe(true);
    expect(viuLinhaSemCombinacao).toBe(true);
  });
});
