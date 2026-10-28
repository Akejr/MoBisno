/**
 * Nenhum travessão (—) no texto do site.
 *
 * ## Porquê
 *
 * O Dono pediu-o: o travessão é a marca do texto gerado por IA, e o robô da
 * criação de conta usava-o em quase todas as frases. Foram 134 no texto do
 * código e 3 no `<head>` estático, trocados pela pontuação que cada frase pedia.
 *
 * A regra é sobre o que **chega ao ecrã**: literais de string e de template do
 * código que vai para produção (`web/`, `src/`, `api/`). Os comentários ficam de
 * fora — são documentação do código, não texto do site. Os literais são lidos
 * com o próprio analisador do TypeScript, para um travessão num comentário não
 * contar e um travessão numa string nunca escapar.
 *
 * A IA também os escreve por hábito: `api/assistant.js` proíbe-os nas regras de
 * estilo e, como um modelo não obedece sempre, limpa-os da resposta.
 */
import { describe, it, expect } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const DASH = "\u2014";
/** Pastas que não são código do site: o pacote gerado e as fontes de desenho. */
const FORA = new Set(["web/dist", "web/node_modules", "api/_ssr", "src/Modelos", "src/Interface", "src/WePink Angola", "src/images"]);

function ficheiros(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (FORA.has(rel)) continue;
    if (e.isDirectory()) ficheiros(rel, out);
    else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Literais com travessão, como `ficheiro:linha  texto`. */
function travessoes(rel: string): string[] {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (!text.includes(DASH)) return [];
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const out: string[] = [];
  const LITERAIS = new Set([
    ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail,
  ]);
  const visit = (n: ts.Node): void => {
    if (LITERAIS.has(n.kind)) {
      const raw = text.slice(n.getStart(sf), n.getEnd());
      const i = raw.indexOf(DASH);
      if (i >= 0) {
        const linha = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        out.push(`${rel}:${linha}  ${raw.slice(Math.max(0, i - 50), i + 50).replace(/\s+/g, " ")}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("Travessões — nenhum no texto do site", () => {
  const TODOS = ["web", "src", "api"].flatMap((d) => ficheiros(d));

  it("a varredura encontra o código (não está a ler pastas vazias)", () => {
    expect(TODOS).toContain("web/views/wizard.ts");
    expect(TODOS).toContain("api/assistant.js");
    expect(TODOS.some((f) => f.startsWith("api/_ssr/"))).toBe(false);
  });

  it("nenhum literal de string ou de template tem um travessão", () => {
    expect(TODOS.flatMap(travessoes)).toEqual([]);
  });

  it("o <head> estático também não: o título é o que aparece no separador e no Google", () => {
    const head = readFileSync(join(ROOT, "web/index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    expect(head).not.toContain(DASH);
  });
});

describe("Travessões — a IA também não os escreve", () => {
  const ASSISTANT = readFileSync(join(ROOT, "api/assistant.js"), "utf8");

  it("as regras de estilo proíbem-nos", () => {
    expect(ASSISTANT).toMatch(/NUNCA uses travessões/);
  });

  it("e a resposta é limpa no servidor, porque um modelo não obedece sempre", async () => {
    expect(ASSISTANT).toContain("answer: semTravessoes(r.answer)");
    const ESP = "../api/assistant.js";
    const { semTravessoes } = (await import(ESP)) as { semTravessoes(t: string): string };
    expect(semTravessoes("A loja está pronta \u2014 só falta publicar.")).toBe("A loja está pronta, só falta publicar.");
    expect(semTravessoes("Cosmética natural\u2014Luanda")).toBe("Cosmética natural, Luanda");
    expect(semTravessoes("\u2014 Olá")).toBe("Olá");
    expect(semTravessoes("Sem nada para trocar.")).toBe("Sem nada para trocar.");
    expect(semTravessoes("")).toBe("");
  });
});
