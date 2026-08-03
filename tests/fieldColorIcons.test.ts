/**
 * Guarda da cor dos ícones dentro dos botões (cor por-campo).
 *
 * O problema: nos modelos o ícone de um botão é **irmão** do rótulo editável
 * (`<a><span data-edit="hero.ctaLabel">Ver produtos</span><span
 * class="material-symbols-outlined">arrow_forward</span></a>`), por isso pintar
 * só `[data-edit="…"]` deixava a seta branca.
 *
 * A correção põe a regra num só módulo (`web/lib/fieldColors.ts`, decisão D8) e
 * faz os **três** sítios que pintam cor por-campo consumi-la:
 *   1. `applyFieldColors` (loja publicada e preview do editor);
 *   2. a folha de estilo do preview em `web/views/editor.ts`;
 *   3. `paintField`, a resposta imediata ao arrastar o seletor de cor.
 * A maior parte destas asserções existe para garantir que ninguém corrige um
 * sítio e deixa os outros dois a divergir.
 *
 * Porque é que as asserções são sobre o **texto-fonte** e não sobre o DOM:
 * `vitest.config.ts` tem `environment: "node"` e não há jsdom nem happy-dom nas
 * dependências; `web/lib/fieldColors.ts` usa `document`, `CSS.escape` e
 * `HTMLElement`, logo não pode ser importado daqui (nem estaticamente nem com
 * `await import()`). É o mesmo padrão `readFileSync` de
 * `tests/paymentsMirror.test.ts`, `tests/seedRename.test.ts` e
 * `tests/comingSoon.test.ts`. Um teste de comportamento real (jsdom) fica
 * disponível como passo seguinte, mas acrescentar uma dependência é decisão do
 * dono do repositório.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const FIELD_COLORS = ler("web/lib/fieldColors.ts");
const EDITOR = ler("web/views/editor.ts");
const ICON_COLOR = ler("web/lib/iconColor.ts");

/** Recorta o texto entre dois marcadores, falhando se algum desaparecer. */
function trecho(texto: string, inicio: string, fim: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `marcador inicial não encontrado: ${inicio}`).toBeGreaterThan(-1);
  const j = texto.indexOf(fim, i + inicio.length);
  expect(j, `marcador final não encontrado: ${fim}`).toBeGreaterThan(i);
  return texto.slice(i, j);
}

describe("fieldColors — a cor do campo sobe até ao botão e pinta os ícones", () => {
  it("reconhece os ascendentes de botão, incluindo os marcadores dos modelos", () => {
    const lista = trecho(FIELD_COLORS, "export const BUTTON_ANCESTORS", "export const BUTTON_ANCESTOR_SELECTOR");
    for (const asc of ['"a"', '"button"', '[role="button"]']) {
      expect(lista, `ascendente de botão em falta: ${asc}`).toContain(asc);
    }
    // Marcadores de CTA em uso nos modelos (encontrados por grep em web/templates).
    for (const marcador of [
      "[data-hero-cta]",
      "[data-add-cart]",
      "[data-edit-whatsapp]",
      "[data-fm-banner-cta]",
      "[data-fm-ad-cta]",
      "[data-fm-promo-cta]",
    ]) {
      expect(lista, `marcador de botão em falta: ${marcador}`).toContain(marcador);
    }
  });

  it("procura o botão com closest e pinta os ícones desse botão", () => {
    const alvos = trecho(FIELD_COLORS, "export function fieldColorTargets", "\nexport function paintFieldColor");
    expect(alvos).toContain("closest<HTMLElement>(BUTTON_ANCESTOR_SELECTOR)");
    expect(alvos).toContain("querySelectorAll<HTMLElement>(ICON_SELECTOR)");
    expect(FIELD_COLORS).toMatch(/ICON_SELECTOR\s*=\s*"\.material-symbols-outlined"/);
  });

  it("sem botão em volta (ex.: hero.title num h1) devolve antes de tocar em ícones", () => {
    const alvos = trecho(FIELD_COLORS, "export function fieldColorTargets", "\nexport function paintFieldColor");
    const guarda = alvos.indexOf("if (!button) return;");
    expect(guarda, "falta a devolução antecipada quando não há botão").toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(alvos.indexOf("querySelectorAll<HTMLElement>(ICON_SELECTOR)"));
  });

  it("não rouba o ícone de outro campo com cor própria", () => {
    expect(FIELD_COLORS).toContain("function iconOwnedByOtherField");
    const dono = trecho(FIELD_COLORS, "function iconOwnedByOtherField", "\n/**");
    // Sobe do ícone até ao botão à procura do primeiro `data-edit`.
    expect(dono).toContain('getAttribute("data-edit")');
    expect(dono).toContain("parentElement");
    expect(dono).toMatch(/owner !== path/);
    const alvos = trecho(FIELD_COLORS, "export function fieldColorTargets", "\nexport function paintFieldColor");
    expect(alvos).toContain("if (iconOwnedByOtherField(icon, button, path, map)) return;");
  });

  it("a cor por-campo vence a cor global de ícones: !important inline", () => {
    // iconColor.ts usa `!important` numa folha de estilo; inline com a mesma
    // força ganha, logo a intenção mais específica (este botão) prevalece.
    expect(ICON_COLOR).toContain("[data-icons] .material-symbols-outlined{color:var(--mb-icons) !important}");
    const pintar = trecho(FIELD_COLORS, "export function paintFieldColor", "\n/** Aplica as cores por-campo");
    expect(pintar).toContain('el.style.setProperty("color", color, "important")');
  });

  it("remover a cor limpa a propriedade inline e nunca escreve uma cor de substituição", () => {
    const pintar = trecho(FIELD_COLORS, "export function paintFieldColor", "\n/** Aplica as cores por-campo");
    expect(pintar).toContain('el.style.removeProperty("color")');
    // Uma cor de substituição prenderia o ícone e impediria o regresso à cor
    // global de ícones (ou à herdada, nas zonas .mb-dark).
    expect(pintar).not.toMatch(/else[^}]*setProperty/);
  });

  it("não mexe no comportamento das zonas escuras (.mb-dark)", () => {
    expect(ICON_COLOR).toContain("[data-icons] .mb-dark .material-symbols-outlined{color:inherit !important}");
    // fieldColors só pode emitir regras para o campo e para os ícones do botão:
    // nada que redefina as zonas escuras.
    expect(FIELD_COLORS, "fieldColors não deve emitir regras para .mb-dark").not.toMatch(/mb-dark[^\n]*\{/);
  });
});

describe("os três sítios que pintam cor por-campo delegam na regra partilhada", () => {
  it("applyFieldColors passa por paintFieldColor (sítio 1)", () => {
    const aplicar = trecho(FIELD_COLORS, "export function applyFieldColors", "\n/**");
    expect(aplicar).toContain("paintFieldColor(root, path, color, map)");
    // Já não pode pintar por si só o elemento do campo.
    expect(aplicar).not.toContain("querySelectorAll");
  });

  it("a folha de estilo do preview vem de fieldColorCss (sítio 2)", () => {
    expect(EDITOR).toContain('import { applyFieldColors, fieldColorCss, paintFieldColor } from "../lib/fieldColors.js"');
    expect(EDITOR).toContain("const fieldCss = fieldColorCss(custom.fieldColors);");
    expect(FIELD_COLORS).toContain("export function fieldColorCss");
    const css = FIELD_COLORS.slice(FIELD_COLORS.indexOf("export function fieldColorCss"));
    // O :has() cobre o ícone antes e depois do rótulo; é reforço, não a garantia.
    expect(css).toContain(":is(${BUTTON_ANCESTOR_SELECTOR}):has(${f})");
    expect(css).toContain("${ICON_SELECTOR}:not([data-edit] *)");
  });

  it("paintField do editor delega em paintFieldColor (sítio 3)", () => {
    const pintar = trecho(EDITOR, "function paintField(", "\n  function showTextTools");
    expect(pintar).toContain('paintFieldColor($("#preview"), path, color, custom.fieldColors)');
    // O editor não pode voltar a repetir o seletor por sua conta.
    expect(pintar).not.toContain("querySelectorAll");
    expect(pintar).not.toContain("CSS.escape");
  });

  it("o editor não constrói mais nenhum seletor de cor por-campo", () => {
    // Se voltar a aparecer um `[data-edit="…"]` construído no editor, os três
    // sítios podem divergir outra vez.
    expect(EDITOR).not.toMatch(/\[data-edit="\$\{/);
  });

  it("o seletor por caminho existe num só sítio e escapa o caminho", () => {
    expect(FIELD_COLORS).toContain("export function fieldSelector");
    const sel = trecho(FIELD_COLORS, "export function fieldSelector", "\n}");
    expect(sel).toContain("CSS.escape(path)");
  });
});

describe("resposta imediata ao arrastar o seletor de cor", () => {
  it("o input do seletor pinta na hora, sem esperar por guardar", () => {
    const bloco = trecho(EDITOR, "textColorInput?.addEventListener", "#mb-text-color-reset");
    expect(bloco).toContain("custom.fieldColors[activeTextPath] = val");
    expect(bloco).toContain("paintField(activeTextPath, val)");
  });

  it("o botão de remover limpa a cor e reaplica o que resta", () => {
    const bloco = trecho(EDITOR, '$("#mb-text-color-reset")?.addEventListener', "document.addEventListener");
    expect(bloco).toContain("delete custom.fieldColors[activeTextPath]");
    expect(bloco).toContain("paintField(activeTextPath, null)");
    expect(bloco).toContain('applyFieldColors($("#preview"), custom)');
    // A limpeza tem de vir antes da reaplicação das cores que ficam.
    expect(bloco.indexOf("paintField(activeTextPath, null)")).toBeLessThan(
      bloco.indexOf('applyFieldColors($("#preview"), custom)'),
    );
  });
});

describe("as vistas da loja publicada continuam a aplicar as cores por-campo", () => {
  const VISTAS = [
    "web/views/storefront.ts",
    "web/views/product.ts",
    "web/views/category.ts",
    "web/views/cart.ts",
    "web/views/checkout.ts",
  ];

  it("todas importam e chamam applyFieldColors", () => {
    for (const v of VISTAS) {
      const texto = ler(v);
      expect(texto, `${v} não importa applyFieldColors`).toContain('from "../lib/fieldColors.js"');
      expect(texto, `${v} não chama applyFieldColors`).toContain("applyFieldColors(app, custom)");
    }
  });

  it("nenhuma vista pinta cor por-campo por sua conta", () => {
    for (const v of VISTAS) {
      expect(ler(v), `${v} constrói o seu próprio seletor de campo`).not.toMatch(/\[data-edit="\$\{/);
    }
  });
});
