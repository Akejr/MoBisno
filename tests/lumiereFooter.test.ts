/**
 * Guarda do 4.º bloco do rodapé do modelo Lumière (R9).
 *
 * O modelo `lumiere` tinha, no quarto bloco do rodapé, um título e um texto de
 * atelier de cosmética («O Atelier» / «Junte-se ao círculo…») que nada tinham a
 * ver com uma loja de comércio eletrónico, e ambos estavam chumbados no código —
 * o Dono não os conseguia editar, ao contrário do que exige a §6.1 do
 * `MODELO-GUIA.md`.
 *
 * As asserções são sobre o **texto-fonte** de `web/templates/lumiere.ts` e não
 * sobre o DOM gerado: o módulo depende do DOM e `tests/` compila com
 * `lib: ["ES2022"]`, sem DOM, por isso não pode ser importado. É o mesmo padrão
 * `readFileSync` que `tests/seoInfra.test.ts` usa para as invariantes de SEO.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const LUMIERE = readFileSync(join(ROOT, "web/templates/lumiere.ts"), "utf8");

describe("Rodapé do Lumière — texto adequado a uma loja (R9.1)", () => {
  it("já não contém o texto de atelier que o utilizador reportou", () => {
    // O coração deste teste: se algum destes voltar, o rodapé volta a falar de
    // um atelier de beleza numa loja que pode vender qualquer coisa.
    expect(LUMIERE).not.toContain("O Atelier");
    expect(LUMIERE).not.toContain("Junte-se ao círculo");
  });

  it("lê o título e o texto do bloco da Personalização, com omissões de loja", () => {
    expect(LUMIERE).toContain("custom?.footer?.extraTitle");
    expect(LUMIERE).toContain("custom?.footer?.extraText");
    expect(LUMIERE).toContain("Compras seguras");
    expect(LUMIERE).toContain(
      "Entrega em toda Angola, pagamento por Multicaixa ou na entrega, e apoio pelo WhatsApp.",
    );
  });
});

describe("Rodapé do Lumière — bloco editável (R9.3)", () => {
  it("marca o título e o texto com data-edit (MODELO-GUIA.md §6.1)", () => {
    // Sem os dois `data-edit` o Editor não expõe os campos e a Personalização
    // nova fica inalcançável para o Dono.
    expect(LUMIERE).toContain('data-edit="footer.extraTitle"');
    expect(LUMIERE).toContain('data-edit="footer.extraText"');
  });
});
