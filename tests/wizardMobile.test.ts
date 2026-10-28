/**
 * A conversa da criação de conta no telemóvel: o teclado não pode atirar a
 * página para cima.
 *
 * Com `height: 100dvh`, o telemóvel não encolhia a conversa quando o teclado
 * abria: encolhia só a parte visível e deslocava a página inteira. O cabeçalho
 * saía do ecrã, a conversa ficava cortada, e ao fechar o teclado a página não
 * voltava ao sítio. O código lê `visualViewport` e corre no navegador, por isso
 * estas asserções são sobre o texto-fonte, como as do assistente no telemóvel
 * (`tests/assistantScopes.test.ts`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const WIZARD = readFileSync(join(ROOT, "web/views/wizard.ts"), "utf8");
const SHELL = readFileSync(join(ROOT, "web/index.html"), "utf8");

describe("Conversa de criação no telemóvel — o teclado não desloca a página", () => {
  it("a conversa está presa ao ecrã, e não ao fluxo da página", () => {
    expect(WIZARD).toContain(".mb-chat-root{position:fixed;top:0;left:0;right:0;");
  });

  it("acompanha a parte visível do ecrã: altura e deslocação", () => {
    const i = WIZARD.indexOf("function fitToViewport(");
    expect(i, "fitToViewport não existe").toBeGreaterThan(0);
    const corpo = WIZARD.slice(i, WIZARD.indexOf("\n}\n", i) + 2);
    expect(corpo).toContain("window.visualViewport");
    expect(corpo).toContain('vv.addEventListener("resize"');
    expect(corpo).toContain('vv.addEventListener("scroll"');
    expect(corpo).toContain("vv.height");
    expect(corpo).toContain("vv.offsetTop");
    // As vistas são trocadas sem aviso: os ouvintes saem com a conversa.
    expect(corpo).toContain("root.isConnected");
    expect(corpo).toContain("removeEventListener");
    expect(WIZARD).toContain("fitToViewport();");
  });

  it("no Chrome de Android, o próprio navegador encolhe a página", () => {
    expect(SHELL).toMatch(/<meta name="viewport" content="[^"]*interactive-widget=resizes-content/);
  });
});
