/**
 * A visita guiada do editor, num telemóvel.
 *
 * ## O que estava mal
 *
 * A visita foi escrita para um ecrã largo, e num telemóvel quebrava de quatro
 * formas independentes:
 *
 *  1. **a camada engolia tudo.** Cobria o ecrã inteiro sem `pointer-events:none`,
 *     e num telemóvel não há rato nem teclas: não se conseguia **rolar a
 *     página** durante a visita, nem tocar no que estava destacado. Como quase
 *     todos os passos exigem rolar, a visita ficava presa;
 *  2. **a geometria era do computador.** Largura fixa de 320px e o limite
 *     esquerdo `vw - 332`, que num ecrã de 320px dá −12 e punha o cartão meio
 *     fora do ecrã; e uma altura **assumida** de 210px, quando o mesmo texto
 *     estreito passa a quatro linhas e o cartão chega perto dos 300px, pelo que
 *     a conta de «cabe por baixo?» respondia sim e o cartão saía pelo fundo;
 *  3. **o cabeçalho tinha uma altura escrita à mão** (70px). No telemóvel tem
 *     três linhas e passa dos 130px: um alvo entre os dois valores era dado como
 *     visível, não se rolava nada, e o destaque era desenhado sobre um alvo
 *     escondido por baixo do cabeçalho;
 *  4. **mandava passar o rato.** Três passos diziam «passa o rato» e um mandava
 *     usar «− / +», controlos que só existem ao passar o rato.
 *
 * ## Porque é que as asserções são sobre o texto-fonte
 *
 * A visita mede elementos reais (`getBoundingClientRect`) e corre num
 * navegador; não há como a exercitar em Node. O que se fixa aqui é o que o
 * código **não pode voltar a ser**: números de geometria escritos à mão, uma
 * camada que bloqueia o ecrã, e instruções de rato sem alternativa para toque.
 * O resultado foi verificado com capturas de ecrã a 504px de largura.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const EDITOR = readFileSync(join(ROOT, "web/views/editor.ts"), "utf8");

/** O corpo de `startTutorial`, que é onde vive tudo isto. */
const TOUR = (() => {
  const i = EDITOR.indexOf("async function startTutorial(");
  expect(i, "startTutorial não encontrada").toBeGreaterThan(0);
  return EDITOR.slice(i);
})();

/**
 * O mesmo, sem comentários: as asserções de «isto não pode voltar» são sobre o
 * que **corre**, e os comentários nomeiam de propósito os valores antigos.
 */
const CODIGO = TOUR.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** O array dos passos. */
const PASSOS = (() => {
  const i = EDITOR.indexOf("const TOUR: TourStep[] = [");
  expect(i, "os passos não foram encontrados").toBeGreaterThan(0);
  return EDITOR.slice(i, EDITOR.indexOf("\n  ];", i));
})();

describe("Visita guiada — a camada não bloqueia o ecrã", () => {
  it("só o cartão recebe toques; a camada deixa passar", () => {
    expect(TOUR).toContain("position:fixed;inset:0;z-index:200;pointer-events:none");
    // O cartão é o único elemento que recebe toques.
    expect(TOUR).toMatch(/tip\.style\.cssText = "position:fixed;[^"]*pointer-events:auto/);
  });

  it("o botão de sair tem nome e um alvo de toque decente", () => {
    expect(TOUR).toContain('aria-label="Sair da visita guiada"');
    expect(TOUR).toMatch(/data-skip[^>]*w-9 h-9/);
  });
});

describe("Visita guiada — a geometria é medida, não assumida", () => {
  it("a altura do cartão é medida depois de escrever o texto", () => {
    expect(TOUR).toContain("cardH = Math.ceil(tip.getBoundingClientRect().height)");
    // Duas passagens: a altura só se sabe com a largura aplicada.
    const layout = TOUR.slice(TOUR.indexOf("function layout("));
    const corpo = layout.slice(0, layout.indexOf("\n    }"));
    expect(corpo.match(/position\(el\)/g) ?? [], "layout tem de colocar, medir e colocar").toHaveLength(2);
  });

  it("já não há a largura nem a altura do computador escritas na conta", () => {
    // `vw - 332` dava um valor negativo num ecrã de 320px.
    expect(CODIGO, "o limite esquerdo voltou a ser escrito à mão").not.toContain("vw - 332");
    expect(CODIGO, "a altura do cartão voltou a ser assumida").not.toContain("+ 210 > vh");
    // A largura do cartão num sítio só, e o telemóvel não a usa.
    expect(TOUR).toContain("const CARD_W = 320;");
  });

  it("no telemóvel o cartão encosta às duas margens", () => {
    const pos = TOUR.slice(TOUR.indexOf("function position("));
    const corpo = pos.slice(0, pos.indexOf("\n    }"));
    expect(corpo).toContain("const folha = isNarrowScreen();");
    expect(corpo).toContain('tip.style.left = "12px"');
    expect(corpo).toContain('tip.style.right = "12px"');
    // Sem isto, o `max-width` do computador encolhia a folha para 320px.
    expect(corpo).toContain('tip.style.maxWidth = folha ? "none"');
  });

  it("a folha vai para cima quando taparia o que está destacado", () => {
    // O assistente e «Guardar» vivem no fundo do ecrã.
    expect(TOUR).toContain("r.bottom > emBaixo - 8");
    expect(TOUR).toContain("headerBottom() + 8");
  });

  it("a altura do cabeçalho é lida do cabeçalho, não escrita à mão", () => {
    expect(TOUR).toContain("function headerBottom()");
    expect(TOUR).toContain('document.querySelector<HTMLElement>("header")');
    expect(CODIGO, "o limite de cima voltou a ser 70px").not.toContain("r.top < 70");
    expect(TOUR).toContain("const topo = headerBottom() + 8;");
  });
});

describe("Visita guiada — não trabalha a cada fotograma", () => {
  it("só volta a colocar quando algo mudou", () => {
    const track = TOUR.slice(TOUR.indexOf("function track("));
    const corpo = track.slice(0, track.indexOf("\n    }"));
    expect(corpo).toContain("if (chave !== anterior)");
    // A chave inclui o ecrã: uma rotação ou o teclado voltam a medir.
    expect(corpo).toContain("window.innerWidth");
    expect(corpo).toContain("window.innerHeight");
  });
});

describe("Visita guiada — num telemóvel não se passa o rato", () => {
  /** Os passos, com o texto de rato e o de toque. */
  const linhas = PASSOS.split("\n").filter((l) => l.includes("{ sel:"));

  it("há um passo por linha, e são catorze", () => {
    expect(linhas).toHaveLength(14);
  });

  it("todo o passo que fala de rato tem a versão para toque", () => {
    for (const l of linhas) {
      const texto = /text: "([^"]*)"/.exec(l)?.[1] ?? "";
      if (!/passa o rato|Clica|clica/i.test(texto)) continue;
      expect(l, `passo sem texto para toque: ${texto.slice(0, 40)}`).toContain("touch:");
    }
  });

  it("nenhum texto para toque fala de rato, nem dos controlos que só o rato mostra", () => {
    for (const l of linhas) {
      const touch = /touch: "([^"]*)"/.exec(l)?.[1];
      if (!touch) continue;
      expect(touch, `texto de toque fala de rato: ${touch}`).not.toMatch(/rato|clica/i);
      // «− / +» são os botões do logótipo, que só aparecem ao passar o rato.
      expect(touch, `texto de toque manda usar − / +: ${touch}`).not.toContain("−");
    }
  });

  it("o telemóvel recebe o texto de toque quando existe", () => {
    expect(TOUR).toContain("const texto = isNarrowScreen() && step.touch ? step.touch : step.text;");
    expect(TOUR).toContain("esc(texto)");
  });
});
