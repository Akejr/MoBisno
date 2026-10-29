/**
 * O desenho do Painel_Admin: neutro, e a cor só onde diz alguma coisa.
 *
 * O Dono achou o painel «muito feio e não profissional». Tinha laranja em tudo
 * (as ligações, o filtro escolhido, o menu, os botões principais), títulos e
 * números em `font-black`, e cinco botões com texto em cada linha das lojas.
 * Quando tudo chama a atenção, nada chama. Estas asserções guardam as decisões
 * que mudaram o aspeto, e não classes ao acaso.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/**
 * O corpo de uma função, do nome ao `}` que a fecha numa linha só.
 *
 * Não serve o primeiro `}` no início de uma linha: numa assinatura em várias
 * linhas é o da lista de parâmetros (`}): string {`), e a procura acabava antes
 * do corpo. Aceita CRLF.
 */
function corpoDe(src: string, assinatura: string): string {
  const i = src.indexOf(assinatura);
  expect(i, `${assinatura} não encontrada`).toBeGreaterThanOrEqual(0);
  const fim = src.slice(i).search(/\r?\n\}\r?\n/);
  expect(fim, `fim de ${assinatura} não encontrado`).toBeGreaterThan(0);
  return src.slice(i, i + fim);
}

const VISTAS = [
  "web/views/adminPanel.ts",
  ...readdirSync(join(ROOT, "web/views/admin")).filter((f) => f.endsWith(".ts")).map((f) => `web/views/admin/${f}`),
];
const UI = ler("web/views/admin/ui.ts");

describe("Painel_Admin — a cor fica para os estados", () => {
  it("o botão principal e o filtro escolhido são neutros", () => {
    expect(UI).toMatch(/primary: "bg-gray-900 text-white/);
    const on = /const CHIP_ON = "([^"]+)"/.exec(UI)?.[1] ?? "";
    expect(on).toContain("bg-gray-900");
    expect(on, "o filtro escolhido voltou a ser laranja").not.toContain("orange");
  });

  it("a secção escolhida no menu é cinzenta, não laranja", () => {
    const PAINEL = ler("web/views/adminPanel.ts");
    expect(PAINEL).toContain('active ? "bg-gray-100 text-gray-900"');
    expect(PAINEL).not.toContain('active ? "bg-orange-50 text-orange-800"');
  });

  it("nenhuma vista usa font-black: os números e os títulos pesam semibold", () => {
    for (const f of VISTAS) expect(ler(f), f).not.toContain("font-black");
  });
});

describe("Painel_Admin — uma ação com nome por linha", () => {
  it("as ações secundárias das lojas são ícones com nome para o leitor de ecrã e para o rato", () => {
    const corpo = corpoDe(UI, "export function iconButton(");
    expect(corpo).toContain('aria-label="${esc(o.label)}"');
    expect(corpo).toContain('title="${esc(o.label)}"');
  });

  it("o tamanho dos ícones não perde para a folha dos Material Symbols", () => {
    // A folha deles chega depois da nossa e o `font-size: 24px` ganhava ao
    // `text-[18px]`: os ícones dos selos saíam do tamanho de um título.
    expect(corpoDe(UI, "export function icon(")).toContain("style=\"font-size:${px}px\"");
  });
});
