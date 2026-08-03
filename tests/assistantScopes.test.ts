/**
 * Guardas dos âmbitos do Assistente_IA (`api/assistant.js`) e da saudação da
 * página inicial (`web/lib/aiAgent.ts`).
 *
 * Estes testes não exercitam lógica: leem o texto-fonte, ao modo de
 * `tests/seoInfra.test.ts`. `api/` é JavaScript sem tipos, corre nas funções
 * serverless e não deve ser importado por `tests/` só para verificar prompts.
 *
 * O que guardam:
 *
 *  1. Os cinco âmbitos (`site`, `editor`, `seo`, `seotitle`, `logo`) continuam
 *     registados em `PROMPTS` e continuam a ser resolvidos a partir de
 *     `body.scope`. Um âmbito que desapareça do mapa não falha nada em tempo de
 *     execução: cai silenciosamente no âmbito `editor`.
 *  2. O vocabulário novo — modelos prontos de site que se personalizam — está nos
 *     âmbitos `site` e `editor`, e o mesmo vocabulário aparece na saudação da
 *     página inicial. Cliente e servidor têm de contar a mesma história.
 *  3. **Ausência do vocabulário antigo de construtor por componentes** nos
 *     âmbitos `site` e `editor`. Era esta a regressão reportada: o assistente
 *     ensinava a trocar o modelo do hero e a mudar a disposição dos produtos,
 *     ações que já não existem numa Loja com `customization.__locked`. Todas as
 *     cadeias afirmadas como ausentes **estavam** no ficheiro antes da tarefa
 *     8.1 (commit `d7b365b`); nenhuma é inventada.
 *  4. O âmbito `seo` mantém as regras intocadas: uma frase, português de
 *     Portugal, até 160 caracteres.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ASSISTANT = readFileSync(join(ROOT, "api", "assistant.js"), "utf8");
const AI_AGENT = readFileSync(join(ROOT, "web", "lib", "aiAgent.ts"), "utf8");

/** Recorta o texto-fonte entre dois marcadores, para localizar as asserções num só âmbito. */
function sectionBetween(src: string, startMarker: string, endMarker: string): string {
  const from = src.indexOf(startMarker);
  const to = src.indexOf(endMarker, from + startMarker.length);
  expect(from, `marcador não encontrado: ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marcador não encontrado: ${endMarker}`).toBeGreaterThan(from);
  return src.slice(from, to);
}

const EDITOR = sectionBetween(ASSISTANT, "const SYSTEM_EDITOR =", "const SYSTEM_SITE =");
const SITE = sectionBetween(ASSISTANT, "const SYSTEM_SITE =", "const SYSTEM_SEO =");
const SEO = sectionBetween(ASSISTANT, "const SYSTEM_SEO =", "const SYSTEM_SEOTITLE =");
const SEOTITLE = sectionBetween(ASSISTANT, "const SYSTEM_SEOTITLE =", "const SYSTEM_LOGO =");
const LOGO = sectionBetween(ASSISTANT, "const SYSTEM_LOGO =", "const PROMPTS =");

describe("api/assistant.js — os cinco âmbitos", () => {
  it("declara os cinco prompts de sistema", () => {
    for (const name of ["SYSTEM_EDITOR", "SYSTEM_SITE", "SYSTEM_SEO", "SYSTEM_SEOTITLE", "SYSTEM_LOGO"]) {
      expect(ASSISTANT).toContain(`const ${name} = `);
    }
  });

  it("registra os cinco âmbitos em PROMPTS", () => {
    const prompts = sectionBetween(ASSISTANT, "const PROMPTS =", "export default");
    for (const pair of [
      "editor: SYSTEM_EDITOR",
      "site: SYSTEM_SITE",
      "seo: SYSTEM_SEO",
      "seotitle: SYSTEM_SEOTITLE",
      "logo: SYSTEM_LOGO",
    ]) {
      expect(prompts).toContain(pair);
    }
  });

  it("resolve os cinco âmbitos a partir de body.scope, com editor por omissão", () => {
    for (const scope of ["site", "seo", "seotitle", "logo"]) {
      expect(ASSISTANT).toContain(`body.scope === "${scope}"`);
    }
    expect(ASSISTANT).toContain(`: "editor";`);
    expect(ASSISTANT).toContain("PROMPTS[scope]");
  });
});

describe("api/assistant.js — vocabulário novo de modelos prontos", () => {
  it("o âmbito site descreve escolher um modelo pronto e personalizar", () => {
    expect(SITE).toContain("ESCOLHER UM MODELO PRONTO");
    expect(SITE).toContain("PERSONALIZAR os textos, as fotografias e as cores");
    expect(SITE).toContain("Não se monta a loja peça por peça");
  });

  it("o âmbito site apresenta o percurso pela ordem criar conta → escolher modelo → personalizar → publicar", () => {
    const criar = SITE.indexOf("1) CRIAR CONTA");
    const escolher = SITE.indexOf("2) ESCOLHER O MODELO PRONTO");
    const personalizar = SITE.indexOf("3) PERSONALIZAR");
    const publicar = SITE.indexOf("4) PUBLICAR");
    expect(criar).toBeGreaterThanOrEqual(0);
    expect(escolher).toBeGreaterThan(criar);
    expect(personalizar).toBeGreaterThan(escolher);
    expect(publicar).toBeGreaterThan(personalizar);
  });

  it("o âmbito editor mantém a estrutura do modelo e limita a personalização a textos, fotografias e cores", () => {
    expect(EDITOR).toContain("A ESTRUTURA desse modelo mantém-se");
    expect(EDITOR).toContain("os TEXTOS, as FOTOGRAFIAS e as CORES");
    expect(EDITOR).toContain("não se trocam no editor");
  });

  it("o âmbito logo indica cinco propostas", () => {
    expect(LOGO).toContain("CINCO propostas");
  });
});

describe("api/assistant.js — ausência do vocabulário antigo de construtor por componentes", () => {
  // Cada uma destas cadeias existia em `api/assistant.js` antes da tarefa 8.1 e
  // descreve uma ação que já não existe numa Loja com `customization.__locked`.
  const REMOVIDAS_DO_EDITOR = [
    'Trocar modelo do hero',       // botão de trocar o modelo do topo
    'Mudar disposição',            // botão de mudar a disposição dos produtos
    'DISPOSIÇÃO DOS PRODUTOS',     // rubrica dessa instrução
    'seletor "Estilo"',            // seletor de estilo global
    '4 modelos no botão "Modelo"', // modelos de testemunhos
  ];

  const REMOVIDAS_DO_SITE = [
    'modelos de cabeçalho (hero)',
    'disposição dos produtos',
    'secções por blocos',
  ];

  it("o âmbito editor já não ensina a trocar o modelo do topo nem a mudar a disposição", () => {
    for (const cadeia of REMOVIDAS_DO_EDITOR) expect(EDITOR).not.toContain(cadeia);
  });

  it("o âmbito site já não descreve a plataforma como montagem por blocos e modelos de componentes", () => {
    for (const cadeia of REMOVIDAS_DO_SITE) expect(SITE).not.toContain(cadeia);
  });

  it("nenhum dos dois âmbitos volta a falar de trocar modelo de hero ou de rodapé", () => {
    const dois = `${EDITOR}\n${SITE}`;
    expect(dois).not.toMatch(/Trocar modelo do (hero|rodapé)/);
    expect(dois).not.toMatch(/modelos? de (hero|rodapé)/i);
  });
});

describe("api/assistant.js — âmbitos intocados", () => {
  it("o âmbito seo mantém uma frase, português de Portugal e o limite de 160 caracteres", () => {
    expect(SEO).toContain("Uma única frase");
    expect(SEO).toContain("português de Portugal");
    expect(SEO).toContain("até 160 caracteres");
  });

  it("o âmbito seotitle continua a existir com as suas regras", () => {
    expect(SEOTITLE).toContain("português de Portugal");
    expect(SEOTITLE).toContain("45 caracteres");
  });

  it("mantém a recusa numa frase para perguntas fora do âmbito", () => {
    expect(ASSISTANT).toContain("RECUSA educadamente numa única frase");
    expect(ASSISTANT).toContain("Só consigo ajudar com o MôBisno");
  });
});

describe("web/lib/aiAgent.ts — saudação da página inicial", () => {
  it("a saudação do âmbito site fala de modelos prontos de site que se personalizam", () => {
    const saudacao = sectionBetween(AI_AGENT, 'scope === "site"', "} else {");
    expect(saudacao).toContain("modelo pronto de site");
    expect(saudacao).toContain("personalizas os textos, as fotografias e as cores");
    // Saudação anterior, genérica e sem modelos prontos.
    expect(saudacao).not.toContain("o que é a plataforma, o que dá (ou não) para fazer");
  });

  it("usa o mesmo vocabulário de «modelo pronto de site» que o servidor", () => {
    expect(AI_AGENT).toContain("modelo pronto de site");
    expect(SITE).toContain("MODELO PRONTO");
  });
});
