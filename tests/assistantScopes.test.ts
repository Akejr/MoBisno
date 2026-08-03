/**
 * Guardas dos âmbitos do Assistente_IA (R8).
 *
 * O Assistente_IA descrevia o MôBisno como um construtor onde a loja se monta
 * peça por peça. Hoje criar uma Loja é escolher um **modelo pronto de site** e
 * personalizar textos, fotografias e cores. A tarefa 8.1 reescreveu os âmbitos
 * `site`, `editor` e `logo` de `api/assistant.js`; este ficheiro é a guarda de
 * que o texto novo fica, e de que nada do que tinha de ficar intacto se perdeu.
 *
 * As asserções são sobre o **texto-fonte**. `api/` é JavaScript sem verificação
 * de tipos e fora do programa do `tsc`, por isso nada aqui é importado: é o
 * mesmo padrão `readFileSync` que `tests/seoInfra.test.ts` usa para as
 * invariantes de SEO.
 *
 * O ponto mais frágil que este ficheiro protege é o âmbito `seotitle`. A §7.3 do
 * `SEO.md` afirmava que `seotitle` tinha saído de `api/assistant.js` e que
 * `api/logo.js` tinha sido apagado — ambos existem, e a tarefa 8.3 corrigiu o
 * documento. Se o `seotitle` desaparecer de facto, `web/lib/seoGen.ts` passa a
 * receber o prompt errado **sem nada falhar**, porque a ligação é uma chamada
 * HTTP que o `tsc` não vê. Daí as asserções serem sobre o mapa `PROMPTS` e sobre
 * a resolução de `body.scope`, e não apenas sobre a presença do texto no
 * ficheiro.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ASSISTANT = readFileSync(join(ROOT, "api/assistant.js"), "utf8");
const AI_AGENT = readFileSync(join(ROOT, "web/lib/aiAgent.ts"), "utf8");

/**
 * Devolve o conteúdo do template literal de `const <name> = \`…\`;`.
 *
 * Isola cada âmbito para as asserções não passarem por acidente com texto que
 * vive noutro âmbito — «cinco propostas», por exemplo, aparece no `site` e no
 * `logo`, e são critérios diferentes (8.1 e 8.6).
 */
function block(name: string): string {
  const opening = `const ${name} = \``;
  const start = ASSISTANT.indexOf(opening);
  expect(start, `constante ${name} não encontrada em api/assistant.js`).toBeGreaterThanOrEqual(0);
  const from = start + opening.length;
  const end = ASSISTANT.indexOf("`;", from);
  expect(end, `template literal de ${name} não fechado`).toBeGreaterThan(from);
  return ASSISTANT.slice(from, end);
}

const SITE = block("SYSTEM_SITE");
const EDITOR = block("SYSTEM_EDITOR");
const SEO = block("SYSTEM_SEO");
const SEOTITLE = block("SYSTEM_SEOTITLE");
const LOGO = block("SYSTEM_LOGO");
const STYLE = block("STYLE_RULES");

describe("Assistente_IA — os cinco âmbitos estão registados (R8.8)", () => {
  it("o mapa PROMPTS liga os cinco âmbitos aos cinco prompts", () => {
    // Não basta o texto existir no ficheiro: se o âmbito sair do mapa, o
    // `PROMPTS[scope]` fica `undefined` e o pedido segue sem prompt de sistema.
    for (const [scope, constant] of [
      ["editor", "SYSTEM_EDITOR"],
      ["site", "SYSTEM_SITE"],
      ["seo", "SYSTEM_SEO"],
      ["seotitle", "SYSTEM_SEOTITLE"],
      ["logo", "SYSTEM_LOGO"],
    ] as const) {
      expect(ASSISTANT).toMatch(new RegExp(`PROMPTS\\s*=\\s*\\{[^}]*\\b${scope}:\\s*${constant}\\b`));
    }
  });

  it("a resolução de body.scope aceita os quatro âmbitos explícitos e cai em editor", () => {
    // `seotitle` é o caso que se perde em silêncio: `web/lib/seoGen.ts` envia
    // `scope: "seotitle"` por HTTP e, sem este ramo, receberia o prompt do
    // editor sem erro nenhum.
    for (const scope of ["site", "seo", "seotitle", "logo"]) {
      expect(ASSISTANT).toContain(`body.scope === "${scope}" ? "${scope}"`);
    }
    expect(ASSISTANT).toMatch(/body\.scope === "logo" \? "logo" : "editor"/);
  });

  it("os cinco prompts são passados como mensagem de sistema", () => {
    expect(ASSISTANT).toContain('{ role: "system", content: PROMPTS[scope] }');
  });
});

describe("Âmbito site — modelo pronto e personalização (R8.1, R8.2)", () => {
  it("descreve criar uma Loja como escolher um modelo pronto e personalizar", () => {
    expect(SITE).toContain("ESCOLHER UM MODELO PRONTO");
    expect(SITE).toContain("PERSONALIZAR os textos, as fotografias e as cores");
    // A frase que fecha a porta ao construtor peça por peça.
    expect(SITE).toContain("Não se monta a loja peça por peça");
  });

  it("apresenta o percurso pela ordem criar conta → escolher → personalizar → publicar", () => {
    const passos = ["1) CRIAR CONTA", "2) ESCOLHER O MODELO PRONTO", "3) PERSONALIZAR", "4) PUBLICAR"];
    const posicoes = passos.map((p) => {
      const i = SITE.indexOf(p);
      expect(i, `passo ausente do âmbito site: ${p}`).toBeGreaterThanOrEqual(0);
      return i;
    });
    // A ordem é o critério 8.2, não só a presença dos quatro passos.
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it("diz que a estrutura do modelo escolhido se mantém", () => {
    expect(SITE).toContain("dá a ESTRUTURA da loja, e essa estrutura mantém-se");
  });

  it("indica cinco propostas no logótipo por IA", () => {
    expect(SITE).toContain("cinco propostas");
  });
});

describe("Âmbito editor — estrutura mantida, três coisas personalizáveis (R8.3, R8.4)", () => {
  it("declara que a estrutura do modelo se mantém e enumera o que não se troca", () => {
    expect(EDITOR).toContain("A ESTRUTURA desse modelo mantém-se");
    for (const parte of ["cabeçalho", "topo (hero)", "página de produto", "checkout", "rodapé"]) {
      expect(EDITOR).toContain(parte);
    }
    expect(EDITOR).toContain("não se trocam no editor");
  });

  it("descreve as três ações: textos, fotografias e cores", () => {
    expect(EDITOR).toContain("personalizas TRÊS coisas: os TEXTOS, as FOTOGRAFIAS e as CORES");
    expect(EDITOR).toContain("Não montas a loja peça por peça");
  });
});

describe("Âmbitos site e editor — ausência do vocabulário antigo de construtor (R8.1, R8.3)", () => {
  // Cada cadeia afirmada como ausente **estava** em `api/assistant.js` antes da
  // tarefa 8.1 (commit `d7b365b`) e descreve uma ação que já não existe numa
  // Loja com `customization.__locked`. Nenhuma é inventada: todas saem das
  // linhas removidas pela reescrita.
  const REMOVIDAS_DO_EDITOR = [
    "Trocar modelo do hero",       // botão de trocar o modelo do topo
    "Mudar disposição",            // botão de mudar a disposição dos produtos
    "DISPOSIÇÃO DOS PRODUTOS",     // rubrica dessa instrução
    'seletor "Estilo"',            // seletor de estilo global (Moderno/Clássico/Minimal)
    '4 modelos no botão "Modelo"', // modelos de testemunhos
  ];

  const REMOVIDAS_DO_SITE = [
    "modelos de cabeçalho (hero)",
    "disposição dos produtos",
    "secções por blocos",
  ];

  it("o âmbito editor já não ensina a trocar o modelo do topo nem a mudar a disposição", () => {
    for (const cadeia of REMOVIDAS_DO_EDITOR) expect(EDITOR).not.toContain(cadeia);
  });

  it("o âmbito site já não descreve a plataforma como montagem por blocos e componentes", () => {
    for (const cadeia of REMOVIDAS_DO_SITE) expect(SITE).not.toContain(cadeia);
  });

  it("nenhum dos dois âmbitos volta a falar de trocar modelo de hero ou de rodapé", () => {
    // A forma genérica: qualquer instrução de escolher um modelo *de peça* em
    // vez do modelo pronto de site inteiro.
    const dois = `${EDITOR}\n${SITE}`;
    expect(dois).not.toMatch(/Trocar modelo do (hero|rodapé)/);
    expect(dois).not.toMatch(/modelos? de (hero|rodapé)/i);
    expect(dois).not.toMatch(/disposição/i);
  });
});

describe("Âmbito seo — a regra dos 160 caracteres fica intacta (R8.7)", () => {
  it("mantém uma frase, em português de Portugal, até 160 caracteres", () => {
    expect(SEO).toContain("Uma única frase");
    expect(SEO).toContain("português de Portugal");
    expect(SEO).toContain("até 160 caracteres");
  });
});

describe("Âmbito seotitle — regras atuais preservadas (R8.8)", () => {
  it("mantém o limite de 45 caracteres e a exclusão do nome da loja", () => {
    expect(SEOTITLE).toContain("português de Portugal");
    expect(SEOTITLE).toContain("máximo 45 caracteres");
    expect(SEOTITLE).toContain("Sem o nome da loja");
  });
});

describe("Âmbito logo — cinco propostas (R8.6)", () => {
  it("o bloco CONTEXTO diz que o gerador devolve cinco propostas", () => {
    expect(LOGO).toContain("CONTEXTO");
    expect(LOGO).toContain("devolve CINCO propostas diferentes");
    expect(LOGO).toContain("português de Portugal");
  });
});

describe("Regras de estilo comuns — recusa fora de âmbito (R8.9, R8.10)", () => {
  it("recusa numa frase e redireciona para o âmbito do MôBisno", () => {
    expect(STYLE).toContain("RECUSA educadamente numa única frase");
    expect(STYLE).toContain("Só consigo ajudar com o MôBisno");
    expect(STYLE).toContain("Português de Portugal");
  });

  it("as regras de estilo são interpoladas nos âmbitos conversacionais", () => {
    // `site` e `editor` são os que respondem a perguntas livres; os três âmbitos
    // de geração (seo, seotitle, logo) recebem só a descrição do dono.
    expect(SITE).toContain("${STYLE_RULES}");
    expect(EDITOR).toContain("${STYLE_RULES}");
  });
});

describe("Saudação da página inicial — âmbito site (R8.5)", () => {
  // Única guarda automatizada possível do texto que o utilizador reportou como
  // desatualizado na página inicial: a saudação vive em `web/lib/aiAgent.ts` e
  // é escolhida por `mountAiAgent(..., { scope: "site" })` em
  // `web/views/landing.ts`. `web/` não é verificado por tipos, por isso a
  // asserção é sobre a fonte.
  const saudacao = AI_AGENT.split("\n").find((l) => l.includes("Sou o assistente do MôBisno")) ?? "";

  it("a saudação existe e está no ramo do âmbito site", () => {
    expect(AI_AGENT).toContain('addMsg("assistant", scope === "site"');
    expect(saudacao).not.toBe("");
  });

  it("fala de um modelo pronto de site e de personalizar textos, fotografias e cores", () => {
    expect(saudacao).toContain("modelo pronto de site");
    expect(saudacao).toContain("personalizas os textos, as fotografias e as cores");
  });
});
