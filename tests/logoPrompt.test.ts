/**
 * Plano de direções e prompt do símbolo (`api/logo.js`).
 *
 * ## A avaria que estes exemplos guardam
 *
 * O gerador pedia à IA de imagem o logótipo COMPLETO — símbolo, nome e
 * composição — cinco vezes, com uma direção de arte fixa que impunha símbolo
 * abstrato, gradiente e tipografia sans-serif em minúsculas. Daí saíam as duas
 * queixas do Dono:
 *
 *  1. **«parecem-se todas»** — a diversidade era pedida a um modelo, em texto,
 *     e ele devolvia cinco arranjos da mesma ideia;
 *  2. **«ignora o que peço»** — a descrição do Dono entrava no fim do prompt
 *     como contexto de negócio e perdia todos os conflitos. Quem escrevia «sem
 *     símbolo» recebia símbolos.
 *
 * A correção separa responsabilidades: um briefing estruturado diz o que o
 * Dono quer, um plano DETERMINÍSTICO escolhe as cinco direções, e a IA de
 * imagem só desenha o símbolo — o nome é composto no cliente. A diversidade
 * deixa de ser pedida e passa a ser construída, e por isso é testável aqui.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O que se fixa são decisões contáveis sobre um catálogo fechado de seis
 * direções: quantas entram, quais gastam imagem, e o que o prompt do símbolo
 * nunca pode deixar passar. Não há espaço de entrada a explorar — o briefing
 * já foi normalizado a montante por `normalizeBrief`.
 *
 * ## Como se chega ao módulo
 *
 * `api/logo.js` é JavaScript puro — as funções serverless não passam pelo
 * compilador — por isso está fora do `include` do `tsconfig.json` e não tem
 * declarações de tipos. Mesmo contorno de `tests/seoInfra.test.ts`.
 */
import { describe, it, expect } from "vitest";

// @ts-expect-error módulo JavaScript sem declarações de tipos
import * as logoModule from "../api/logo.js";

interface Brief {
  brandName: string;
  sector: string;
  wantsSymbol: "yes" | "no" | "either";
  colors: string[];
  typographyMood: string;
  letterCase: string;
  symbolConcepts: string[];
  avoid: string[];
}
interface Direction {
  slot: string;
  label: string;
  kind: "type" | "symbol";
  layout: string;
  fontFamily: string;
  weight: number;
  tracking: number;
  transform: string;
  color: string;
  accentColor?: string;
}

const { planDirections, buildSymbolPrompt, normalizeBrief, fallbackBrief } = logoModule as unknown as {
  planDirections(brief: Brief): Direction[];
  buildSymbolPrompt(brief: Brief, concept: string): string;
  normalizeBrief(raw: unknown): Brief;
  fallbackBrief(description: string): Brief;
};

/** Briefing base; cada exemplo altera só o campo que lhe interessa. */
function briefing(over: Partial<Brief> = {}): Brief {
  return normalizeBrief({
    brandName: "Lumi",
    sector: "plataforma de emails empresariais",
    wantsSymbol: "either",
    colors: ["#1E88E5"],
    typographyMood: "geometric",
    letterCase: "any",
    symbolConcepts: ["fluidez da comunicação", "ligação entre pontos"],
    avoid: [],
    ...over,
  });
}

describe("planDirections — cinco direções, diversidade por construção", () => {
  it("devolve sempre exatamente cinco direções", () => {
    for (const querSimbolo of ["yes", "no", "either"] as const) {
      expect(planDirections(briefing({ wantsSymbol: querSimbolo }))).toHaveLength(5);
    }
  });

  it("dá a cada direção um `slot` distinto", () => {
    for (const querSimbolo of ["yes", "no", "either"] as const) {
      const slots = planDirections(briefing({ wantsSymbol: querSimbolo })).map((d) => d.slot);
      expect(new Set(slots).size).toBe(5);
    }
  });

  it("não pede um único símbolo quando o Dono os recusou", () => {
    // A regressão do caso «Juddy Cosmetics»: o Dono escreveu «não quero um
    // símbolo» e três das cinco propostas antigas traziam um. Aqui o pedido
    // não chega sequer a gastar uma geração de imagem.
    const direcoes = planDirections(briefing({ wantsSymbol: "no" }));

    expect(direcoes.every((d) => d.kind === "type")).toBe(true);
    expect(direcoes.filter((d) => d.kind === "symbol")).toHaveLength(0);
  });

  it("mistura tipografia e símbolo quando o Dono aceita símbolos", () => {
    for (const querSimbolo of ["yes", "either"] as const) {
      const direcoes = planDirections(briefing({ wantsSymbol: querSimbolo }));
      // Nem só símbolos (o wordmark é a proposta mais escolhida), nem nenhum.
      expect(direcoes.some((d) => d.kind === "symbol")).toBe(true);
      expect(direcoes.some((d) => d.kind === "type")).toBe(true);
    }
  });

  it("varia a composição, e não só o arranjo das mesmas peças", () => {
    // «Parecem-se todas» era isto: cinco layouts com a mesma letra e a mesma
    // cor. Duas direções não podem partilhar layout, peso e espacejamento.
    const direcoes = planDirections(briefing());
    const assinaturas = direcoes.map((d) => `${d.layout}|${d.weight}|${d.tracking}|${d.transform}`);
    expect(new Set(assinaturas).size).toBe(5);
  });

  it("usa a cor do Dono no texto de todas as direções", () => {
    const direcoes = planDirections(briefing({ colors: ["#111111"] }));
    expect(direcoes.every((d) => d.color === "#111111")).toBe(true);
  });

  it("escolhe letra serifada para um registo elegante", () => {
    // «Quero uma fonte elegante» tem de chegar à tipografia, não ao acaso.
    const direcoes = planDirections(briefing({ typographyMood: "elegant" }));
    const familias = new Set(direcoes.map((d) => d.fontFamily));
    for (const f of familias) expect(["Playfair Display", "Noto Serif"]).toContain(f);
  });
});

describe("normalizeBrief — a resposta do modelo não é de confiança", () => {
  it("repõe valores válidos a partir de lixo", () => {
    const b = normalizeBrief({ brandName: 42, wantsSymbol: "talvez", colors: ["azul", "#ff0000"], typographyMood: "x", letterCase: null, symbolConcepts: "não é lista", avoid: [1, "3D"] });

    expect(b.brandName).toBe("Marca");
    expect(b.wantsSymbol).toBe("either");
    expect(b.colors).toEqual(["#FF0000"]); // "azul" não é hexadecimal: cai fora
    expect(b.typographyMood).toBe("geometric");
    expect(b.letterCase).toBe("any");
    expect(b.symbolConcepts).toEqual([]);
    expect(b.avoid).toEqual(["3D"]);
  });

  it("limita as cores a duas", () => {
    const b = normalizeBrief({ colors: ["#111111", "#222222", "#333333"] });
    expect(b.colors).toHaveLength(2);
  });
});

describe("fallbackBrief — a falha do briefing não trava o pedido", () => {
  it("não decide pelo Dono quando não sabe", () => {
    // Sem briefing, `either` deixa o plano seguir a mistura habitual. Assumir
    // «no» perderia propostas; assumir «yes» repetiria o bug original.
    const b = fallbackBrief("uma marca qualquer");
    expect(b.wantsSymbol).toBe("either");
    expect(b.colors).toEqual([]);
  });

  it("aproveita o nome provável da descrição", () => {
    expect(fallbackBrief("Loja de cosméticos Juddy Cosmetics em Luanda").brandName).toBe("Loja");
  });
});

describe("buildSymbolPrompt — a IA de imagem só desenha a forma", () => {
  it("proíbe qualquer texto dentro da imagem", () => {
    // É a razão de ser da separação: sem letras, não há nome mal escrito nem
    // tipografia diferente entre as cinco propostas.
    const p = buildSymbolPrompt(briefing(), "fluidez");
    expect(p).toMatch(/PROIBIDO, sem exceção: qualquer texto/);
    expect(p).toMatch(/slogan/);
  });

  it("exige fundo transparente e leitura a 32 píxeis", () => {
    const p = buildSymbolPrompt(briefing(), "");
    expect(p).toContain("Fundo TOTALMENTE transparente");
    expect(p).toContain("32 píxeis");
  });

  it("impõe a cor do Dono e recusa gradiente", () => {
    const p = buildSymbolPrompt(briefing({ colors: ["#1E88E5"] }), "");
    expect(p).toContain("#1E88E5");
    expect(p).toMatch(/sem gradiente/i);
  });

  it("transporta as recusas do Dono para o prompt", () => {
    const p = buildSymbolPrompt(briefing({ avoid: ["envelope óbvio", "3D"] }), "");
    expect(p).toContain("envelope óbvio");
    expect(p).toContain("3D");
  });

  it("afasta o registo datado e os pictogramas literais", () => {
    const p = buildSymbolPrompt(briefing(), "");
    expect(p).toMatch(/emblemas circulares|brasões|escudos/);
    expect(p).toMatch(/envelope, carrinho, telefone/);
  });
});
