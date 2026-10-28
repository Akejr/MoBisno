/**
 * As lojas não têm avisos flutuantes.
 *
 * O Dono pediu-o, com um exemplo: ao adicionar um produto ao carrinho aparecia
 * «Adicionado ao carrinho (7 item(s))», num bloco na cor da plataforma, que não
 * é a de nenhuma loja. Havia mais: «A abrir o WhatsApp para finalizar…», e os
 * erros das variações e das avaliações, que já tinham uma nota no próprio sítio.
 *
 * A confirmação passou para o que já lá estava: o botão diz «Adicionado» nas
 * cores da loja, o contador do carrinho muda, e o leitor de ecrã ouve
 * `announce`. Os erros ficam junto ao que falhou.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** O que desenha e liga as páginas públicas de uma loja. */
const LOJA = [
  "web/views/storefront.ts", "web/views/product.ts", "web/views/category.ts",
  "web/views/cart.ts", "web/views/checkout.ts", "web/views/storeHtml.ts",
  "web/lib/cart.ts", "web/lib/cartDrawer.ts",
  ...readdirSync(join(ROOT, "web/templates")).filter((f) => f.endsWith(".ts")).map((f) => `web/templates/${f}`),
];

describe("Lojas — sem avisos flutuantes", () => {
  it("nenhum ficheiro das páginas da loja chama toast()", () => {
    for (const f of LOJA) expect(ler(f), f).not.toMatch(/\btoast\(/);
  });

  it("a confirmação de «adicionar» é o próprio botão, e o leitor de ecrã ouve-a", () => {
    const PRODUTO = ler("web/views/product.ts");
    expect(PRODUTO).toContain("Adicionado");
    expect(PRODUTO).toContain("announce(`${product.name} adicionado ao carrinho.`)");
    expect(PRODUTO).not.toContain("Adicionado ao carrinho (${cartCount(");
  });

  it("o aviso que fica, no painel, é neutro: a cor só no ícone", () => {
    const DOM = ler("web/lib/dom.ts");
    const i = DOM.indexOf("export function toast(");
    const corpo = DOM.slice(i, DOM.indexOf("\n}", i));
    expect(corpo).toContain("bg-white");
    expect(corpo, "voltou o bloco na cor do sistema de desenho").not.toContain("bg-primary");
  });
});
