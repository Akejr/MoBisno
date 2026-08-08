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
import {
  PASSWORD_MIN_LENGTH,
  REGISTER_FIX_LABELS,
  validatePasswordConfirmation,
  type RegisterFixValue,
} from "../src/ui/wizardSteps.js";

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

  it("o prompt do âmbito chega ao modelo como primeira mensagem de sistema", () => {
    // Esta asserção era o literal `{ role: "system", content: PROMPTS[scope] }` e
    // quebrou quando o contexto do ecrã passou a ser anexado ao prompt — sem que
    // a propriedade protegida (o prompt do âmbito é a mensagem de sistema, antes
    // de tudo) tenha deixado de ser verdadeira. Afirma-se agora a propriedade:
    // `system` deriva de `PROMPTS[scope]`, e é `system` que vai na mensagem.
    expect(ASSISTANT).toMatch(/const system = context[\s\S]{0,400}PROMPTS\[scope\]/);
    expect(ASSISTANT).toMatch(/messages = \[\s*\{ role: "system", content: system \}/);
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
  // é escolhida por `mountAiAgent(..., { screen: "site" })` em
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

/* ========================================================================== *
 * Contexto por ecrã — a regra de `.kiro/steering/assistente.md`
 *
 * O defeito que originou estas guardas: o prompt do âmbito `site` dizia «Há
 * planos diferentes (ver secção de preços na página)» e «No plano Básico, a
 * venda é por WhatsApp» meses depois de os escalões terem sido removidos. Um
 * Dono perguntou se com 11.000 Kz podia criar 10 lojas e o assistente mandou-o
 * consultar uma tabela que já não existe.
 *
 * A correcção tem três partes, e cada uma tem guarda aqui: os FACTOS saem do
 * domínio (nunca escritos à mão), a orientação vive ao lado das vistas
 * (`web/lib/assistantContext.ts`) e todos os ecrãs com assistente montam-no com
 * o ecrã certo.
 * ========================================================================== */

const CONTEXT_SRC = readFileSync(join(ROOT, "web/lib/assistantContext.ts"), "utf8");

/** Corpo do template literal devolvido por `platformFacts()`. */
function factsLiteral(): string {
  const fn = CONTEXT_SRC.indexOf("export function platformFacts()");
  expect(fn, "platformFacts() não encontrada").toBeGreaterThanOrEqual(0);
  const start = CONTEXT_SRC.indexOf("return `", fn);
  const end = CONTEXT_SRC.indexOf("`;", start);
  expect(end).toBeGreaterThan(start);
  return CONTEXT_SRC.slice(start + "return `".length, end);
}

/** Ecrãs declarados em `SCREEN_GUIDES` (a fonte de verdade da cobertura). */
function declaredScreens(): string[] {
  return [...CONTEXT_SRC.matchAll(/^ {2}(\w+): `ECRÃ/gm)].map((m) => m[1]!);
}

/** Texto-fonte da orientação de um ecrã, do `ECRÃ:` até ao fim do literal. */
function guiaDe(screen: string): string {
  const i = CONTEXT_SRC.indexOf(`${screen}: \`ECRÃ`);
  expect(i, `orientação do ecrã ${screen} não encontrada`).toBeGreaterThanOrEqual(0);
  return CONTEXT_SRC.slice(i, CONTEXT_SRC.indexOf("`,", i));
}

/**
 * A mesma orientação com as interpolações resolvidas pelos valores reais dos
 * módulos — é este o texto que chega ao assistente.
 *
 * Asserções sobre o texto resolvido valem sobre **o que o utilizador ouve**: se
 * o mínimo da palavra-passe ou o rótulo de um botão mudar no módulo, muda aqui
 * também, e a asserção continua a dizer a mesma coisa. Asseverar o literal
 * `${PASSWORD_MIN_LENGTH}` sozinho protegia a forma de escrever, não a resposta.
 */
function resolver(guia: string): string {
  return guia
    .replace(/\$\{PASSWORD_MIN_LENGTH\}/g, String(PASSWORD_MIN_LENGTH))
    .replace(/\$\{REGISTER_FIX_LABELS\.(\w+)\}/g, (_m, k: string) => REGISTER_FIX_LABELS[k as RegisterFixValue]);
}

describe("Factos da plataforma — derivados do domínio, nunca escritos à mão", () => {
  it("platformFacts() não tem um único número no texto: todos vêm de interpolação", () => {
    // Um preço escrito à mão fica errado no dia em que o preço mudar, e ninguém
    // repara — foi exactamente assim que o assistente passou a mentir.
    const semInterpolacoes = factsLiteral().replace(/\$\{[^}]*\}/g, "");
    expect(semInterpolacoes).not.toMatch(/\d/);
  });

  it("os valores vêm de plans.ts e de payments.ts", () => {
    expect(CONTEXT_SRC).toMatch(/import \{[\s\S]*?\} from "\.\.\/\.\.\/src\/services\/plans\.js"/);
    expect(CONTEXT_SRC).toMatch(/import \{ FEE_RATE, MIN_PAYMENT_KZ \} from "\.\.\/\.\.\/src\/services\/payments\.js"/);
    for (const nome of ["PLAN_NAME", "PRICE_KZ", "PERIOD_DAYS", "PLAN_HIGHLIGHTS", "FEE_RATE", "MIN_PAYMENT_KZ"]) {
      expect(factsLiteral(), `${nome} não é interpolado nos factos`).toContain(nome);
    }
    // A poupança anual é calculada, não escrita: sai de `yearlySavingKz()`.
    expect(CONTEXT_SRC).toContain("yearlySavingKz()");
    expect(CONTEXT_SRC).toContain("yearlyFreeMonths()");
  });

  it("responde ao caso concreto: preço por loja publicada, produtos ilimitados", () => {
    const facts = factsLiteral();
    // O preço passou a ser **por loja publicada**: criar é livre, publicar é que
    // custa. Um assistente a dizer «lojas ilimitadas» sem esta distinção estava a
    // prometer de graça o que agora se paga.
    expect(facts).toContain("O PREÇO É POR LOJA PUBLICADA");
    expect(facts).toContain("Uma loja em rascunho não é cobrada");
    expect(facts).toContain("PRODUTOS SÃO ILIMITADOS");
    // A excepção dos administradores é dita, para não ser aplicada a um Dono.
    expect(facts).toContain("Contas de ADMINISTRADOR da MôBisno não pagam");
    expect(facts).toContain("um só plano");
    expect(facts).toContain("NÃO existe teste grátis");
    // Os escalões removidos são nomeados de propósito: é a pergunta que os
    // utilizadores fazem, e sem isto o modelo inventa-os de volta.
    expect(facts).toContain("Não existe Básico, Profissional nem Empresarial");
  });
});

describe("Prompt do servidor — os factos velhos saíram (o defeito original)", () => {
  const dois = `${SITE}\n${EDITOR}`;

  it("nenhum âmbito volta a falar de escalões, de teste grátis ou de percentagens à mão", () => {
    expect(dois).not.toMatch(/plano Básico|Profissional|Empresarial/);
    expect(dois).not.toMatch(/teste grátis/i);
    expect(dois).not.toMatch(/planos pagos/);
    expect(dois).not.toMatch(/\d+\s*%/); // a comissão vem do contexto (FEE_RATE)
  });

  it("nenhum âmbito manda o utilizador ver a secção de preços", () => {
    expect(dois).not.toMatch(/secção de preços na página/);
    expect(dois).not.toMatch(/ver secção de preços/);
  });

  it("nenhum âmbito tem domínios nem preços escritos à mão", () => {
    // O apex das lojas é `sualoja.digital` (ver `web/lib/routing.ts`); o prompt
    // ainda dizia `aloja.mobisno.store`. Os endereços vêm do contexto.
    expect(dois).not.toContain("aloja.mobisno.store");
    expect(dois).not.toMatch(/\d[\d .]*Kz/);
  });

  it("os dois âmbitos de conversa remetem os números para o CONTEXTO", () => {
    expect(SITE).toContain("ESTÃO NO CONTEXTO");
    expect(EDITOR).toContain("ESTÃO NO CONTEXTO");
  });

  it("a regra dura de não mandar procurar está nas regras de estilo", () => {
    expect(STYLE).toContain("RESPONDE, NÃO MANDES PROCURAR (REGRA DURA)");
    expect(STYLE).toContain("ILIMITADO");
    // A excepção legítima: dados da CONTA do utilizador, que o contexto não tem.
    expect(STYLE).toContain("informação é da CONTA dele");
  });
});

describe("Contexto no pedido — só nos âmbitos de conversa e tratado como dados", () => {
  it("apenas editor e site aceitam contexto; os geradores não", () => {
    // `seo`, `seotitle` e `logo` devolvem texto com formato fechado: contexto
    // extra só os desviaria do formato.
    expect(ASSISTANT).toContain('const chatScope = scope === "editor" || scope === "site"');
    expect(ASSISTANT).toMatch(/const context = chatScope \? String\(body\.context \|\| ""\)\.slice\(0, \d+\) : "";/);
  });

  it("as regras vêm primeiro e o contexto depois, rotulado como contexto", () => {
    const sys = ASSISTANT.slice(ASSISTANT.indexOf("const system = context"));
    const prompt = sys.indexOf("PROMPTS[scope]");
    const ctx = sys.indexOf("CONTEXTO (");
    expect(prompt).toBeGreaterThanOrEqual(0);
    expect(ctx).toBeGreaterThan(prompt);
  });

  it("o cliente envia o contexto do ecrã onde está", () => {
    expect(AI_AGENT).toContain("context: assistantContextFor(screen)");
    expect(AI_AGENT).toMatch(/import \{[\s\S]*?assistantContextFor[\s\S]*?\} from "\.\/assistantContext\.js"/);
  });
});

describe("Cobertura dos ecrãs — cada ecrã com assistente monta-o com o seu ecrã", () => {
  /**
   * Ecrã → ficheiro da vista que o monta. É esta tabela que faz falhar o
   * acrescento de um ecrã à orientação sem o montar em lado nenhum (e o
   * contrário: montar um ecrã que não tem orientação).
   */
  const MOUNTED: Record<string, string> = {
    site: "landing.ts",
    registo: "login.ts",
    criar: "wizard.ts",
    painel: "dashboard.ts",
    produtos: "dashboard.ts",
    pagamentos: "dashboard.ts",
    plano: "dashboard.ts",
    config: "dashboard.ts",
    analises: "dashboard.ts",
    logotipo: "dashboard.ts",
    editor: "editor.ts",
    modelos: "presetGallery.ts",
    lojas: "directory.ts",
    legal: "legal.ts",
    admin: "adminPanel.ts",
  };

  const view = (f: string): string => readFileSync(join(ROOT, "web/views", f), "utf8");

  it("os ecrãs com orientação são exactamente os ecrãs montados", () => {
    expect(declaredScreens().slice().sort()).toEqual(Object.keys(MOUNTED).sort());
  });

  it("cada vista monta o assistente e nomeia o seu ecrã", () => {
    for (const [screen, file] of Object.entries(MOUNTED)) {
      const src = view(file);
      expect(src, `${file} não monta o assistente`).toContain("mountAiAgent");
      expect(src, `${file} não nomeia o ecrã ${screen}`).toContain(`"${screen}"`);
    }
  });

  it("os separadores do painel mapeiam para os ecrãs próprios", () => {
    const dash = view("dashboard.ts");
    expect(dash).toContain("const DASH_SCREEN: Record<string, AssistantScreen>");
    for (const [tab, screen] of [
      ["inicio", "painel"], ["produtos", "produtos"], ["logotipo", "logotipo"],
      ["analises", "analises"], ["pagamentos", "pagamentos"], ["plano", "plano"],
      ["config", "config"],
    ] as const) {
      expect(dash).toContain(`${tab}: "${screen}"`);
    }
  });

  it("as lojas publicadas NÃO têm assistente", () => {
    // São o site do Dono, vistas pelos clientes dele: um mascote da plataforma
    // ali é publicidade dentro da loja de outra pessoa.
    for (const f of ["storefront.ts", "product.ts", "category.ts", "cart.ts", "checkout.ts"]) {
      expect(view(f), `${f} não devia montar o assistente`).not.toContain("mountAiAgent");
    }
  });
});

describe("Orientação do ecrã «Análises» — descreve o ecrã reconstruído", () => {
  /**
   * O separador foi refeito (linha com eixo e dica por dia, variação de 7 dias
   * face aos 7 anteriores, barras de proporção, estado vazio) e os rótulos dos
   * números mudaram de nome. A regra de `.kiro/steering/assistente.md` é que a
   * orientação muda na mesma alteração; esta é a asserção que a impõe.
   */
  const DASH = readFileSync(join(ROOT, "web/views/dashboard.ts"), "utf8");
  const guia = (() => {
    const i = CONTEXT_SRC.indexOf("analises: `ECRÃ");
    expect(i, "orientação do ecrã analises não encontrada").toBeGreaterThanOrEqual(0);
    return CONTEXT_SRC.slice(i, CONTEXT_SRC.indexOf("`,", i));
  })();

  it("os rótulos dos números na orientação são os que o Dono vê no ecrã", () => {
    for (const rotulo of ["Visitas (7 dias)", "Visitas (30 dias)", "Produtos vistos (7 dias)"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(DASH, `rótulo ausente do painel: ${rotulo}`).toContain(rotulo);
    }
    // O rótulo antigo desapareceu do ecrã; não pode sobreviver na orientação.
    expect(guia).not.toContain("Visualizações (7 dias)");
  });

  it("diz o que o ecrã não faz: sem comparação nas visualizações e sem filtro de datas", () => {
    // Sem isto o assistente promete uma comparação que os dados não permitem
    // (não há série diária de visualizações de produto) e um filtro que não existe.
    expect(guia).toContain("não têm comparação entre períodos");
    expect(guia).toContain("Não há filtro de datas");
  });

  it("descreve a dica do gráfico e o estado vazio, que são o que mudou", () => {
    expect(guia).toContain("número de visitas desse dia");
    expect(guia).toContain("Ainda não há visitas para mostrar");
    expect(DASH).toContain("Ainda não há visitas para mostrar");
  });
});

describe("Orientação do ecrã «Assistente_de_Criação» — a conta como o ecrã a pede agora", () => {
  /**
   * O assistente de criação passou a tratar a conta por inteiro: email
   * revalidado no formato, palavra-passe com mínimo e confirmação, cartão «Os
   * teus dados» antes de criar, e caminhos de correção nomeados depois de uma
   * falha. A regra de `.kiro/steering/assistente.md` é que a orientação muda na
   * mesma alteração — estas são as asserções que a impõem.
   */
  const WIZARD = readFileSync(join(ROOT, "web/views/wizard.ts"), "utf8");
  const LOGIN = readFileSync(join(ROOT, "web/views/login.ts"), "utf8");
  const guia = guiaDe("criar");
  const resolvida = resolver(guia);

  it("os passos da conta estão pela ordem em que o ecrã os pede", () => {
    // A ordem é a propriedade: quem pergunta «o que é que ele me vai pedir?»
    // recebe a sequência certa, não um conjunto de campos.
    const passos = ["o nome", "o email", "a palavra-passe", "outra vez, para confirmar"];
    const posicoes = passos.map((p) => {
      const i = resolvida.indexOf(p);
      expect(i, `passo ausente da orientação: ${p}`).toBeGreaterThanOrEqual(0);
      return i;
    });
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    // O email inválido é recusado ali mesmo, e não guardado para o fim.
    expect(resolvida).toMatch(/formato inválido é recusado/);
    expect(WIZARD).toContain("Esse email não parece válido");
  });

  it("diz o mínimo real da palavra-passe, sem número escrito à mão", () => {
    // O mínimo vive em `PASSWORD_MIN_LENGTH`: escrevê-lo aqui deixava a frase
    // errada no dia em que a regra mudasse, e ninguém repararia.
    expect(resolvida).toContain(`mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
    expect(guia.replace(/\$\{[^}]*\}/g, ""), "há um número escrito à mão na orientação").not.toMatch(/\d/);
  });

  it("a palavra-passe não aparece no chat, e uma diferença pede as duas de novo", () => {
    expect(resolvida).toContain("••••••••");
    expect(WIZARD).toContain('userSay("••••••••")');
    // A frase citada é a que o módulo produz: a orientação não inventa uma
    // versão própria da mensagem que o Dono vai ler.
    const recusa = validatePasswordConfirmation("segredo123", "segredo124");
    expect(recusa.status).toBe("invalid");
    if (recusa.status === "invalid") {
      expect(resolvida).toContain(recusa.message.split(".")[0]);
    }
    expect(resolvida).toMatch(/as duas de novo/);
  });

  it("o cartão de confirmação e os seus botões são os que o ecrã mostra", () => {
    for (const rotulo of ["Os teus dados", "Está tudo certo"]) {
      expect(resolvida, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(WIZARD, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // Corrigir um campo não repete os passos anteriores: é o que distingue este
    // cartão de recomeçar a conversa.
    expect(resolvida).toMatch(/volta ao mesmo cartão/);
  });

  it("os rótulos de correção vêm da mesma constante que o ecrã usa", () => {
    // Não podem divergir porque são o mesmo valor. Uma cópia à mão divergia na
    // primeira vez que alguém renomeasse o botão.
    for (const rotulo of Object.values(REGISTER_FIX_LABELS)) {
      expect(resolvida, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(guia, `«${rotulo}» está copiado à mão em vez de vir de REGISTER_FIX_LABELS`).not.toContain(rotulo);
    }
    // Email já registado: entrar na conta existente vem primeiro, e leva à rota
    // real de início de sessão.
    const entrar = resolvida.indexOf(REGISTER_FIX_LABELS.entrar);
    expect(entrar).toBeGreaterThanOrEqual(0);
    expect(resolvida).toContain("#/login");
    expect(WIZARD).toContain('go("#/login")');
    // A escolha é do Dono: o assistente não anuncia que decide por ele.
    expect(resolvida).toMatch(/não decide sozinho/);
  });

  it("diz o que não existe, em vez de deixar o modelo inventar", () => {
    // Metade das perguntas é sobre o que a plataforma não faz. Sem isto o
    // assistente promete um email de recuperação que nunca chega.
    expect(resolvida).toMatch(/não há recuperação de palavra-passe/i);
    expect(resolvida).toMatch(/nem por SMS/);
    expect(resolvida).toMatch(/não se muda a palavra-passe depois de a conta existir/);
  });

  it("nem este ecrã nem o do início de sessão prometem recuperação por email", () => {
    // A orientação do `registo` dizia «Esquecer a palavra-passe: recuperação por
    // email» — e não há nada disso em lado nenhum. É o mesmo defeito dos
    // escalões de preços: uma funcionalidade descrita que não existe.
    const dois = `${resolvida}\n${resolver(guiaDe("registo"))}`;
    expect(dois).not.toMatch(/recuperação por email/);
    expect(LOGIN, "o ecrã de sessão não tem recuperação de palavra-passe").not.toMatch(/recuperar|esqueci|esqueceu/i);
  });
});

describe("Orientação do ecrã «Início» — um cartão por informação, expiradas e telemóvel", () => {
  /**
   * O separador foi refeito: o cartão «Vendas online» que juntava tudo deu lugar
   * a um cartão por informação, o gráfico ganhou cartão próprio, as referências
   * expiradas passaram a poder ser apagadas e a navegação passou a existir em
   * telemóvel. A orientação tinha de acompanhar as quatro coisas.
   */
  const DASH = readFileSync(join(ROOT, "web/views/dashboard.ts"), "utf8");
  const guia = guiaDe("painel");

  it("cada informação tem cartão próprio, e o cartão que juntava tudo saiu", () => {
    for (const rotulo of ["Valor total vendido", "Recebido (líquido)", "Disponível para levantar",
      "Vendas pagas", "Produtos", "Referências pendentes", "Vendas pagas por dia"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(DASH, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // «Vendas online» era o bloco único e «Três números» o que vinha a seguir:
    // descrever qualquer um deles manda o Dono procurar o que já não está lá.
    expect(guia).not.toContain("Vendas online");
    expect(DASH).not.toContain("Vendas online");
    expect(guia).not.toMatch(/[Tt]rês números/);
  });

  it("a barra e o botão são descritos no cartão a que pertencem", () => {
    // A barra é do líquido recebido e o botão é do disponível: trocá-los na
    // orientação era mandar o Dono procurar no cartão errado.
    const linhaBarra = guia.split("\n").find((l) => l.includes("Já pedido")) ?? "";
    expect(linhaBarra, "a orientação não fala da barra do dinheiro").not.toBe("");
    expect(linhaBarra).toContain("Recebido (líquido)");
    const linhaBotao = guia.split("\n").find((l) => l.includes("Solicitar levantamento")) ?? "";
    expect(linhaBotao).toContain("Disponível para levantar");
    expect(guia).toMatch(/já sem a taxa/);
  });

  it("o gráfico é um cartão próprio, ainda de 14 dias e só de vendas pagas", () => {
    const linha = guia.split("\n").find((l) => l.includes("Vendas pagas por dia")) ?? "";
    expect(linha).toMatch(/cartão próprio/);
    expect(linha).toMatch(/número de vendas desse dia/);
    expect(guia).toMatch(/conta apenas vendas pagas/);
    expect(DASH).toContain('homeCard(8, "insights", "Vendas pagas por dia"');
  });

  it("só as referências expiradas se apagam, e a guarda não é o ecrã", () => {
    expect(guia).toContain("Expirada");
    expect(guia).toContain("Apagar registo");
    expect(guia).toMatch(/[Ss]ó as expiradas se apagam/);
    // Pagas, pendentes no prazo, falhadas e canceladas ficam: prometer o
    // contrário era prometer apagar dinheiro.
    for (const estado of ["pagas", "falhadas", "canceladas"]) {
      expect(guia, `estado não protegido na orientação: ${estado}`).toContain(estado);
    }
    // A guarda de verdade é a política de `delete`; dizer que é o ecrã dava ao
    // Dono a ideia de que basta insistir.
    expect(guia).toMatch(/é a base de dados que o impede/);
    expect(guia).toMatch(/definitivo e não recuperável/);
    // Os mesmos rótulos e a mesma frase no ecrã.
    expect(DASH).toContain('badge("Expirada"');
    expect(DASH).toContain("Apagar registo");
    expect(guia).toContain("A referência passou a data-limite e já não pode ser paga.");
    expect(DASH).toContain("A referência passou a data-limite e já não pode ser paga.");
  });

  it("as sete secções da navegação estão na orientação, e o telemóvel também", () => {
    // A lista das secções é única no ecrã (`DASH_SECTIONS`): é dela que sai o
    // que a orientação tem de cobrir, para não ficar com seis quando o ecrã tem
    // sete.
    const lista = DASH.slice(DASH.indexOf("const DASH_SECTIONS"), DASH.indexOf("function navChip("));
    const labels = [...lista.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]!);
    expect(labels).toHaveLength(7);
    for (const label of labels) {
      expect(guia, `secção ausente da orientação: ${label}`).toContain(label);
    }
    expect(guia).toMatch(/faixa de atalhos deslizante/);
    expect(guia).toMatch(/barra lateral não existe no telemóvel/);
  });

  it("trocar de loja já não é só «no topo da barra lateral»", () => {
    // Em telemóvel a barra lateral não existe. A orientação antiga contava metade
    // da história e deixava o Dono a procurar um seletor que ele não vê.
    expect(guia).not.toMatch(/troca no seletor no topo da barra lateral\./);
    const frases = guia.split("\n").filter((l) => l.includes("seletor de loja"));
    expect(frases.length, "a orientação não fala do seletor de loja").toBeGreaterThan(0);
    expect(frases.some((l) => l.includes("telemóvel")), "o seletor de loja em telemóvel não está dito").toBe(true);
  });

  it("a barra de telemóvel traz o que o `aside` tinha, com os mesmos rótulos", () => {
    for (const rotulo of ["Nova loja", "Dashboard de Administração", "Terminar sessão"]) {
      expect(guia, `ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(DASH, `ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // A Administração é só de administradores: prometê-la a um Dono era mandá-lo
    // procurar um atalho que ele não tem.
    expect(guia).toMatch(/só em contas de administrador/);
  });
});

describe("Assistente no telemóvel — folha inferior, sem zoom e sem a página a fugir", () => {
  /**
   * O que o utilizador reportou: tocar no mascote dava «um zoom enorme», a página
   * fazia scroll e a vista ficava torta.
   *
   * Duas causas, ambas com guarda aqui. O Safari do iOS dá **zoom automático** a
   * qualquer campo de texto com letra menor do que 16px — a caixa de escrever
   * tinha 14px. E o painel era uma caixa de 340px a 84px do fundo: no telemóvel
   * uma janela minúscula sobre uma página que continuava a rolar por baixo,
   * empurrada pelo teclado.
   */
  it("o campo de escrever tem 16px na folha do telemóvel", () => {
    expect(AI_AGENT).toMatch(/font-size:\$\{sheet \? 16 : 14\}px/);
  });

  it("no telemóvel o painel encosta às margens e usa dvh, não vh", () => {
    // `vh` conta a barra do navegador que se esconde: a folha ficava mais alta do
    // que o ecrã.
    expect(AI_AGENT).toMatch(/const sheet = isNarrow\(\)/);
    expect(AI_AGENT).toContain("height:min(86dvh,640px)");
    expect(AI_AGENT).toContain("border-radius:20px 20px 0 0");
  });

  it("não rouba o foco no telemóvel", () => {
    // Dar foco ao abrir puxava o teclado antes de a pessoa ler a saudação.
    expect(AI_AGENT).toMatch(/if \(!sheet\) \(panel\.querySelector\("\[data-input\]"\)/);
  });

  it("bloqueia o scroll da página enquanto a folha está aberta, e repõe-no ao fechar", () => {
    expect(AI_AGENT).toMatch(/bodyOverflow = document\.body\.style\.overflow/);
    expect(AI_AGENT).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(AI_AGENT).toMatch(/document\.body\.style\.overflow = bodyOverflow/);
  });

  it("tem véu que fecha ao toque fora, e o Escape também fecha", () => {
    expect(AI_AGENT).toMatch(/backdrop\.addEventListener\("click", closeChat\)/);
    expect(AI_AGENT).toMatch(/e\.key === "Escape" && panel/);
    // O ouvinte de teclado sai no desmonte, senão fica preso à vista anterior.
    expect(AI_AGENT).toMatch(/removeEventListener\("keydown", onKey\)/);
  });
});
