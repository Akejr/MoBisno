/**
 * Guardas dos âmbitos do Assistente_IA e da orientação por ecrã (R8).
 *
 * Duas metades, com a mesma origem.
 *
 * A primeira é sobre `api/assistant.js`: o Assistente_IA descrevia o MôBisno
 * como um construtor onde a loja se monta peça por peça, quando criar uma Loja é
 * escolher um **modelo pronto de site** e personalizar textos, fotografias e
 * cores. As asserções são sobre o **texto-fonte** — `api/` é JavaScript fora do
 * programa do `tsc`, por isso nada é importado: é o mesmo padrão `readFileSync`
 * de `tests/seoInfra.test.ts`.
 *
 * O ponto mais frágil aqui é o âmbito `seotitle`. Se desaparecer,
 * `web/lib/seoGen.ts` passa a receber o prompt errado **sem nada falhar**,
 * porque a ligação é uma chamada HTTP que o `tsc` não vê. Daí as asserções serem
 * sobre o mapa `PROMPTS` e sobre a resolução de `body.scope`, e não apenas sobre
 * a presença do texto no ficheiro.
 *
 * A segunda metade é sobre `web/lib/assistantContext.ts`, e nasceu de um defeito
 * concreto: o prompt dizia «Há planos diferentes (ver secção de preços na
 * página)» meses depois de os escalões terem sido removidos, e um Dono que
 * perguntou se com 11.000 Kz podia criar 10 lojas foi mandado consultar uma
 * tabela que já não existe. A correcção tem três partes, e cada uma tem guarda
 * aqui: os FACTOS saem do domínio (nunca escritos à mão), a orientação vive ao
 * lado das vistas, e todos os ecrãs com assistente montam-no com o ecrã certo.
 * Ver `.kiro/steering/assistente.md`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PASSWORD_MIN_LENGTH,
  REGISTER_FIX_LABELS,
  validatePasswordConfirmation,
  type RegisterFixValue,
  WIZARD_DRAFT_TTL_DAYS,
} from "../src/ui/wizardSteps.js";
import { COMING_SOON_LABELS, comingSoonList } from "../src/services/comingSoon.js";
import { VERIFICATION_STATUS_LABEL, COMPANY_DOCUMENTS } from "../src/services/paymentVerification.js";
import { ACTIVATION_MONTHS, REJECTION_REASON_MIN } from "../src/services/adminMetrics.js";
import { PHONE_CODE_LENGTH, PHONE_CODE_TTL_MS, PHONE_RESEND_DELAYS_MS } from "../src/services/phoneVerification.js";
import { PLATFORM_CONTACT_EMAIL } from "../src/services/domains.js";
import { DELIVERY_PROVINCE } from "../src/services/delivery.js";
import type { StoreTemplate } from "../web/templates/types.js";

const ROOT = join(__dirname, "..");
const ASSISTANT = readFileSync(join(ROOT, "api/assistant.js"), "utf8");
const AI_AGENT = readFileSync(join(ROOT, "web/lib/aiAgent.ts"), "utf8");

/**
 * Devolve o conteúdo do template literal de `const <name> = \`…\`;`.
 *
 * Isola cada âmbito para as asserções não passarem por acidente com texto que
 * vive noutro âmbito.
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
const STYLE = block("STYLE_RULES");

describe("Assistente_IA — os quatro âmbitos estão registados (R8.8)", () => {
  it("o mapa PROMPTS liga os quatro âmbitos aos quatro prompts", () => {
    // Não basta o texto existir no ficheiro: se o âmbito sair do mapa, o
    // `PROMPTS[scope]` fica `undefined` e o pedido segue sem prompt de sistema.
    for (const [scope, constant] of [
      ["editor", "SYSTEM_EDITOR"],
      ["site", "SYSTEM_SITE"],
      ["seo", "SYSTEM_SEO"],
      ["seotitle", "SYSTEM_SEOTITLE"],
    ] as const) {
      expect(ASSISTANT).toMatch(new RegExp(`PROMPTS\\s*=\\s*\\{[^}]*\\b${scope}:\\s*${constant}\\b`));
    }
  });

  it("o gerador de logótipos saiu por inteiro: nem âmbito, nem prompt, nem endpoint", () => {
    // O produto deixou de ter gerador de logótipos. Um âmbito `logo` vivo aqui
    // seria o assistente a oferecer uma funcionalidade que não existe — o mesmo
    // defeito dos escalões de preço.
    expect(ASSISTANT).not.toContain("SYSTEM_LOGO");
    expect(ASSISTANT).not.toMatch(/\blogo:\s*SYSTEM/);
    expect(ASSISTANT).not.toMatch(/body\.scope === "logo"/);
    expect(`${SITE}\n${EDITOR}`).not.toMatch(/logótipo por IA/i);
    expect(`${SITE}\n${EDITOR}`).not.toMatch(/cinco propostas/i);
  });

  it("a resolução de body.scope aceita os três âmbitos explícitos e cai em editor", () => {
    // `seotitle` é o caso que se perde em silêncio: `web/lib/seoGen.ts` envia
    // `scope: "seotitle"` por HTTP e, sem este ramo, receberia o prompt do
    // editor sem erro nenhum.
    for (const scope of ["site", "seo", "seotitle"]) {
      expect(ASSISTANT).toContain(`body.scope === "${scope}" ? "${scope}"`);
    }
    expect(ASSISTANT).toMatch(/body\.scope === "seotitle" \? "seotitle" : "editor"/);
  });

  it("o prompt do âmbito chega ao modelo como primeira mensagem de sistema", () => {
    // A chamada vive em `api/_openrouter.js`: é lá que a mensagem de sistema é
    // posta à frente da conversa, e é de lá que vem o `system` que o endpoint
    // monta a partir de `PROMPTS[scope]`.
    const OR = readFileSync(join(ROOT, "api/_openrouter.js"), "utf8");
    expect(OR).toMatch(/messages: \[\s*\{ role: "system", content: system \}/);
    expect(ASSISTANT).toContain("aiChat({");
    expect(ASSISTANT).toContain("system,");
    // Afirma-se a propriedade e não o literal: `system` deriva de
    // `PROMPTS[scope]`, e é `system` que vai na mensagem.
    expect(ASSISTANT).toMatch(/const system = context[\s\S]{0,400}PROMPTS\[scope\]/);
    expect(ASSISTANT).toMatch(/const system = context/);
  });
});

describe("Toda a IA passa pelo OpenRouter, num sítio só", () => {
  /**
   * O endereço e o nome do modelo estavam escritos no meio de
   * `api/assistant.js`, e o modelo por omissão — `gpt-5.4-mini` — **não
   * existia**. Cada pedido falhava, o endpoint respondia 502, e quem gerava a
   * descrição da loja recebia em silêncio um resumo do próprio texto.
   */
  const OR = readFileSync(join(ROOT, "api/_openrouter.js"), "utf8");
  const SEOGEN = readFileSync(join(ROOT, "web/lib/seoGen.ts"), "utf8");

  it("há um módulo só para a chamada ao modelo, e é o que o endpoint usa", () => {
    expect(OR).toContain("https://openrouter.ai/api/v1/chat/completions");
    expect(ASSISTANT).toContain('from "./_openrouter.js"');
    expect(ASSISTANT).not.toContain("api.openai.com");
  });

  it("nenhum ficheiro volta a falar com a OpenAI nem a ler OPENAI_API_KEY", () => {
    const todos = [ASSISTANT, OR, SEOGEN, readFileSync(join(ROOT, "api/health.js"), "utf8")];
    for (const fonte of todos) {
      expect(fonte).not.toContain("api.openai.com");
      expect(fonte).not.toContain("OPENAI_API_KEY");
      expect(fonte).not.toContain("OPENAI_MODEL");
    }
  });

  it("o modelo é configurável, e o que vem por omissão tem a forma de um slug do OpenRouter", () => {
    // `fornecedor/modelo`. Um nome sem fornecedor é um nome da OpenAI, e no
    // OpenRouter não existe: era meio caminho para repetir o mesmo erro.
    expect(OR).toContain("process.env.OPENROUTER_MODEL");
    const m = /const DEFAULT_MODEL = "([^"]+)"/.exec(OR);
    expect(m, "DEFAULT_MODEL não encontrado").not.toBeNull();
    expect(m?.[1]).toMatch(/^[a-z0-9-]+\/[a-zA-Z0-9.:-]+$/);
  });

  it("a chave fica no servidor: nunca entra no pacote do navegador", () => {
    for (const f of ["web/lib/seoGen.ts", "web/lib/aiAgent.ts", "web/lib/assistantContext.ts"]) {
      const fonte = readFileSync(join(ROOT, f), "utf8");
      expect(fonte, `${f} lê a chave do modelo`).not.toContain("OPENROUTER_API_KEY");
    }
  });

  it("a geração de texto diz quando NÃO foi a IA a escrever", () => {
    /*
     * O recurso está certo — criar a loja não pode esperar por um modelo. O que
     * não pode é ser invisível: o assistente prometia «a melhor descrição para o
     * Google» e entregava um resumo do texto do próprio Dono.
     */
    expect(SEOGEN).toContain("byAi");
    expect(SEOGEN).toContain("byAi: false");
    const WIZARD = readFileSync(join(ROOT, "web/views/wizard.ts"), "utf8");
    expect(WIZARD).toContain("wiz.data.seoByAi");
    expect(WIZARD).toMatch(/A IA não respondeu agora/);
  });

  it("uma falha da IA é registada no cliente com o código, não engolida", () => {
    expect(SEOGEN).toContain('console.warn("[seoGen]"');
    expect(SEOGEN).toContain("corpo?.code");
  });
});

describe("Endpoint do assistente — protegido e sem fugas", () => {
  it("recusa origens de fora e limita os pedidos por IP", () => {
    // Não exige sessão (o visitante da página inicial também pergunta), por isso
    // a origem e o limite são o que impede outro site de gastar a nossa chave.
    expect(ASSISTANT).toContain("if (!allowedOrigin(req))");
    expect(ASSISTANT).toContain("if (rateLimited(req))");
    expect(ASSISTANT).toMatch(/res\.status\(403\)/);
    expect(ASSISTANT).toMatch(/res\.status\(429\)/);
  });

  it("as pré-visualizações aceitas são as deste projeto, não qualquer *.vercel.app", () => {
    // `host.endsWith(".vercel.app")` deixava qualquer pessoa criar um site que
    // passava a guarda.
    expect(ASSISTANT).not.toContain('endsWith(".vercel.app")');
    expect(ASSISTANT).toContain("process.env.VERCEL_URL");
  });

  it("o erro do fornecedor fica no registo do servidor, não na resposta", () => {
    /*
     * Continua a ser verdade — e ganhou uma segunda metade. O detalhe do
     * fornecedor pode trazer identificadores da conta ou da chave e fica nos
     * registos; o **código** vai na resposta.
     *
     * Sem o código, «falha a contactar o assistente» não distinguia uma chave
     * errada de um modelo que não existe de uma falha de rede — e o modelo
     * configurado não existia, durante meses, sem ninguém saber.
     */
    const OR = readFileSync(join(ROOT, "api/_openrouter.js"), "utf8");
    expect(OR).toContain('console.error("[openrouter]"');
    expect(ASSISTANT).toContain("res.status(502).json({ error: r.error, code: r.code });");
    expect(ASSISTANT, "o detalhe do fornecedor não pode ir na resposta").not.toMatch(/detail/);
    for (const codigo of ["AI_NOT_CONFIGURED", "AI_MODEL_NOT_FOUND", "AI_UNAUTHORIZED"]) {
      expect(OR, `código em falta: ${codigo}`).toContain(codigo);
    }
    // O detalhe pode trazer identificadores da conta ou da chave.
    expect(ASSISTANT).not.toMatch(/detail: detail\.slice/);
    expect(ASSISTANT).toMatch(/console\.error\("\[assistant\]"/);
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

  it("descreve as vendas como são: WhatsApp sempre, digitais para empresas aprovadas", () => {
    expect(SITE).toContain("vendem por WhatsApp desde o primeiro dia");
    expect(SITE).toMatch(/empresas registadas, depois de aprovadas/);
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

  it("manda os pagamentos para o Dashboard e descreve-os como são hoje", () => {
    expect(EDITOR).toMatch(/WhatsApp está sempre ativo/);
    expect(EDITOR).toMatch(/empresas registadas/);
    expect(EDITOR).toMatch(/aprovar os dados da empresa/);
  });
});

describe("Âmbitos site e editor — ausência do vocabulário antigo de construtor (R8.1, R8.3)", () => {
  // Cada cadeia afirmada como ausente **estava** em `api/assistant.js` antes da
  // tarefa 8.1 e descreve uma ação que já não existe numa Loja com
  // `customization.__locked`.
  const REMOVIDAS_DO_EDITOR = [
    "Trocar modelo do hero",
    "Mudar disposição",
    "DISPOSIÇÃO DOS PRODUTOS",
    'seletor "Estilo"',
    '4 modelos no botão "Modelo"',
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

describe("Regras de estilo comuns — recusa fora de âmbito (R8.9, R8.10)", () => {
  it("recusa numa frase e redireciona para o âmbito do MôBisno", () => {
    expect(STYLE).toContain("RECUSA educadamente numa única frase");
    expect(STYLE).toContain("Só consigo ajudar com o MôBisno");
    expect(STYLE).toContain("Português de Portugal");
  });

  it("as regras de estilo são interpoladas nos âmbitos conversacionais", () => {
    // `site` e `editor` são os que respondem a perguntas livres; os dois âmbitos
    // de geração (seo, seotitle) recebem só a descrição do dono.
    expect(SITE).toContain("${STYLE_RULES}");
    expect(EDITOR).toContain("${STYLE_RULES}");
  });
});

describe("Saudação da página inicial — âmbito site (R8.5)", () => {
  // Única guarda automatizada possível do texto que o utilizador reportou como
  // desatualizado na página inicial: a saudação vive em `web/lib/aiAgent.ts` e
  // é escolhida por `mountAiAgent(..., { screen: "site" })`.
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
 * também, e a asserção continua a dizer a mesma coisa.
 */
function resolver(guia: string): string {
  return guia
    .replace(/\$\{PASSWORD_MIN_LENGTH\}/g, String(PASSWORD_MIN_LENGTH))
    .replace(/\$\{REGISTER_FIX_LABELS\.(\w+)\}/g, (_m, k: string) => REGISTER_FIX_LABELS[k as RegisterFixValue])
    .replace(/\$\{VERIFICATION_STATUS_LABEL\.(\w+)\}/g, (_m, k: string) => VERIFICATION_STATUS_LABEL[k as "none" | "pending" | "approved" | "rejected"])
    .replace(/\$\{COMING_SOON_LABELS\.(\w+)\}/g, (_m, k: string) => COMING_SOON_LABELS[k as "sms" | "customDomain" | "marketing"])
    .replace(/\$\{REJECTION_REASON_MIN\}/g, String(REJECTION_REASON_MIN))
    .replace(/\$\{DELIVERY_PROVINCE\}/g, DELIVERY_PROVINCE)
    .replace(/\$\{PLATFORM_CONTACT_EMAIL\}/g, PLATFORM_CONTACT_EMAIL)
    .replace(/\$\{DOCUMENTOS\}/g, COMPANY_DOCUMENTS.map((d) => `«${d.label}»`).join(" e "))
    .replace(/\$\{emBreveLista\(\)\}/g, comingSoonList().map((x) => `«${x}»`).join(", "))
    .replace(/\$\{ACTIVATION_MONTHS\.slice\(0, -1\)\.join\(", "\)\}/g, ACTIVATION_MONTHS.slice(0, -1).join(", "))
    .replace(/\$\{ACTIVATION_MONTHS\[ACTIVATION_MONTHS\.length - 1\]\}/g, String(ACTIVATION_MONTHS[ACTIVATION_MONTHS.length - 1]))
    .replace(/\$\{PHONE_CODE_LENGTH\}/g, String(PHONE_CODE_LENGTH))
    .replace(/\$\{CODIGO_MINUTOS\}/g, String(Math.round(PHONE_CODE_TTL_MS / 60_000)))
    .replace(/\$\{REENVIOS\}/g, PHONE_RESEND_DELAYS_MS.map((ms) => String(Math.round(ms / 1000))).join(" e "))
    .replace(/\$\{WIZARD_DRAFT_TTL_DAYS\}/g, String(WIZARD_DRAFT_TTL_DAYS));
}

describe("Factos da plataforma — derivados do domínio, nunca escritos à mão", () => {
  it("platformFacts() não tem um único número no texto: todos vêm de interpolação", () => {
    // Um preço escrito à mão fica errado no dia em que o preço mudar, e ninguém
    // repara — foi exactamente assim que o assistente passou a mentir.
    const semInterpolacoes = factsLiteral().replace(/\$\{[^}]*\}/g, "");
    expect(semInterpolacoes).not.toMatch(/\d/);
  });

  it("os valores vêm dos módulos de domínio, e não de uma cópia local", () => {
    for (const mod of ["plans", "payments", "comingSoon", "domains", "paymentVerification", "adminMetrics"]) {
      expect(CONTEXT_SRC, `${mod} não é importado`).toContain(`src/services/${mod}.js`);
    }
    for (const nome of ["PLAN_NAME", "PLAN_HIGHLIGHTS", "PRECO"]) {
      expect(factsLiteral(), `${nome} não é interpolado nos factos`).toContain(nome);
    }
    // O preço e o período saem de `plans.ts`, pela função de formato do domínio.
    expect(CONTEXT_SRC).toContain("kzWhole(PLAN_PRICE_KZ)");
    expect(CONTEXT_SRC).toContain("PLAN_PERIOD_DAYS");
    // O que está «Em breve» sai da lista do domínio, não de uma enumeração aqui.
    expect(CONTEXT_SRC).toContain("comingSoonList()");
  });

  it("responde ao caso concreto: um plano, pago por loja, e produtos ilimitados", () => {
    const facts = factsLiteral();
    expect(facts).toContain("um só plano");
    expect(facts).toContain("**POR LOJA**");
    expect(facts).toMatch(/Quantas lojas posso criar\?/);
    expect(facts).toContain("PRODUTOS ILIMITADOS");
    expect(facts).toContain("NÃO existe teste grátis");
    // Os escalões removidos são nomeados de propósito: é a pergunta que os
    // utilizadores fazem, e sem isto o modelo inventa-os de volta.
    expect(facts).toContain("Não existe Básico, Profissional nem Empresarial");
    expect(facts).toMatch(/Não há ciclo anual/);
    // A excepção dos administradores é dita, para não ser aplicada a um Dono.
    expect(facts).toContain("Contas de ADMINISTRADOR da MôBisno não pagam");
  });

  it("cada loja paga a sua subscrição, sem lugares nem contas de dias à parte", () => {
    // O preço é por loja (migração 0025): duas lojas online são duas
    // subscrições, cada uma com o seu período. O que não pode voltar é o preço
    // «da conta», nem os «lugares» pagos com a proporção dos dias que faltam.
    const facts = factsLiteral();
    expect(facts).toMatch(/Cada loja tem a sua subscrição/);
    expect(facts).toMatch(/duas lojas online paga duas subscrições/);
    expect(facts).not.toContain("É o preço da conta");
    expect(facts).not.toMatch(/lugar pago/);
    expect(facts).not.toMatch(/dias que faltam/);
  });

  it("descreve as vendas como elas são: WhatsApp sempre, digitais só depois de aprovadas", () => {
    const facts = resolver(factsLiteral());
    expect(facts).toMatch(/todas as lojas vendem por WhatsApp/i);
    expect(facts).toContain("empresas registadas");
    for (const d of COMPANY_DOCUMENTS) expect(facts).toContain(d.label);
    expect(facts).toMatch(/só depois de \*\*aprovado\*\*/);
  });

  it("não promete o que não existe, e nomeia-o", () => {
    const facts = resolver(factsLiteral());
    // O gerador de logótipos e a compra de SMS saíram do produto. Quem pergunta
    // por eles tem de ouvir «não existe», não uma explicação de como se usa.
    expect(facts).toMatch(/NÃO existe/);
    expect(facts).toMatch(/logótipos por IA \(foi removido\)/);
    // Cada funcionalidade «Em breve» é nomeada pela lista do domínio.
    for (const nome of comingSoonList()) expect(facts).toContain(nome);
  });

  it("diz a verdade sobre o estado do serviço de pagamentos", async () => {
    // `PAYMENTS_PROVIDER_READY` decide a frase. Com ele a `false`, o assistente
    // não pode dizer que o checkout já cobra; com ele a `true`, não pode
    // continuar a dizer que está por ligar.
    const { PAYMENTS_PROVIDER_READY } = (await import("../src/services/payments.js")) as { PAYMENTS_PROVIDER_READY: boolean };
    expect(CONTEXT_SRC).toContain("PAYMENTS_PROVIDER_READY");
    const estado = CONTEXT_SRC.slice(CONTEXT_SRC.indexOf("const ESTADO_DIGITAIS"), CONTEXT_SRC.indexOf("const ESTADO_SUBSCRICAO"));
    if (PAYMENTS_PROVIDER_READY) expect(estado).toContain("estão a funcionar");
    else expect(estado).toMatch(/ainda NÃO está ligado/);
  });
});

describe("Prompt do servidor — os factos velhos saíram (o defeito original)", () => {
  const dois = `${SITE}\n${EDITOR}`;

  it("nenhum âmbito volta a falar de escalões, de teste grátis ou de percentagens à mão", () => {
    expect(dois).not.toMatch(/plano Básico|Profissional|Empresarial/);
    expect(dois).not.toMatch(/teste grátis/i);
    expect(dois).not.toMatch(/planos pagos/);
    expect(dois).not.toMatch(/\d+\s*%/);
  });

  it("nenhum âmbito manda o utilizador ver a secção de preços", () => {
    expect(dois).not.toMatch(/secção de preços na página/);
    expect(dois).not.toMatch(/ver secção de preços/);
  });

  it("nenhum âmbito tem domínios nem preços escritos à mão", () => {
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
    entregas: "dashboard.ts",
    descontos: "dashboard.ts",
    avaliacoes: "dashboard.ts",
    analises: "dashboard.ts",
    pagamentos: "dashboard.ts",
    plano: "dashboard.ts",
    config: "dashboard.ts",
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

  it("o ecrã do gerador de logótipos saiu da orientação e do painel", () => {
    expect(declaredScreens()).not.toContain("logotipo");
    expect(CONTEXT_SRC).not.toMatch(/logotipo/i);
    expect(view("dashboard.ts")).not.toContain('"logotipo"');
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
      ["inicio", "painel"], ["produtos", "produtos"], ["entregas", "entregas"],
      ["descontos", "descontos"], ["avaliacoes", "avaliacoes"], ["analises", "analises"],
      ["pagamentos", "pagamentos"], ["plano", "plano"], ["config", "config"],
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

/* -------------------------------------------------------------------------- *
 * Painel do Dono — as nove secções, com os rótulos do ecrã
 * -------------------------------------------------------------------------- */

/** Código do painel: a moldura e todos os separadores. */
const DASH_ALL = (() => {
  const base = readFileSync(join(ROOT, "web/views/dashboard.ts"), "utf8");
  const pasta = join(ROOT, "web/views/dashboard");
  const partes = readdirSync(pasta).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(pasta, f), "utf8"));
  return [base, ...partes].join("\n");
})();

const DASH_SHELL = readFileSync(join(ROOT, "web/views/dashboard.ts"), "utf8");

describe("Orientação do ecrã «Início» — as nove secções, o funil e os próximos passos", () => {
  const guia = guiaDe("painel");

  it("as nove secções da navegação estão na orientação, com os rótulos do ecrã", () => {
    // A lista das secções é única no ecrã (`DASH_SECTIONS`): é dela que sai o
    // que a orientação tem de cobrir, para não ficar com oito quando o ecrã tem
    // nove.
    const lista = DASH_SHELL.slice(DASH_SHELL.indexOf("const DASH_SECTIONS"), DASH_SHELL.indexOf("function navItem("));
    const labels = [...lista.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]!);
    expect(labels).toHaveLength(9);
    for (const label of labels) {
      expect(guia, `secção ausente da orientação: ${label}`).toContain(label);
    }
    expect(guia).toMatch(/nove secções/);
    expect(guia).toMatch(/faixa de atalhos deslizante/);
    expect(guia).toMatch(/barra lateral não existe no telemóvel/);
  });

  it("descreve o funil de compra pelos quatro passos do ecrã", () => {
    for (const passo of ["Visitas", "Produtos vistos", "Adições ao carrinho", "Encomendas por WhatsApp"]) {
      expect(guia, `passo ausente da orientação: ${passo}`).toContain(passo);
      expect(DASH_ALL, `passo ausente do ecrã: ${passo}`).toContain(passo);
    }
    expect(guia).toContain("Funil de compra");
    expect(guia).toContain("Ainda sem movimento nos últimos 30 dias");
    expect(DASH_ALL).toContain("Ainda sem movimento nos últimos 30 dias");
  });

  it("descreve os «Próximos passos» com os mesmos títulos do ecrã", () => {
    expect(guia).toContain("Próximos passos");
    for (const passo of ["Adicionar produtos", "Personalizar a loja", "Número de WhatsApp",
      "Taxa de entrega", "Ativar a subscrição e publicar", "Verificar a empresa para pagamentos digitais"]) {
      expect(guia, `passo ausente da orientação: ${passo}`).toContain(passo);
      expect(DASH_ALL, `passo ausente do ecrã: ${passo}`).toContain(passo);
    }
  });

  it("o estado da loja e a regra de publicar são os do ecrã", () => {
    for (const rotulo of ["Publicada", "Rascunho", "Publicar a loja", "Despublicar", "Copiar"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
    }
    expect(guia).toContain("Ative a subscrição para publicar.");
    expect(DASH_ALL).toContain("Ative a subscrição para publicar.");
  });

  it("as encomendas e as vendas estão no Início, com os rótulos do ecrã", () => {
    // Vieram de «Pagamentos», que passou a ser só configuração. Mandar o Dono
    // procurar o saldo em «Pagamentos» seria uma não-resposta.
    const MARKUP = readFileSync(join(ROOT, "web/views/dashboard/markup.ts"), "utf8");
    for (const rotulo of ["Recebido (líquido)", "Disponível para levantar", "Solicitar levantamento",
      "Vendas pagas", "Referências pendentes", "Expirada", "Apagar registo"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(MARKUP, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    expect(guia).toContain("Encomendas por WhatsApp");
    expect(guia).toMatch(/[Ss]ó as expiradas se apagam/);
    for (const estado of ["pagas", "falhadas", "canceladas"]) {
      expect(guia, `estado não protegido na orientação: ${estado}`).toContain(estado);
    }
    // A guarda de verdade é a política de `delete`; dizer que é o ecrã dava ao
    // Dono a ideia de que basta insistir.
    expect(guia).toMatch(/é a base de dados que o impede/);
    expect(MARKUP).toContain("A referência passou a data-limite e já não pode ser paga.");
    expect(guia).toMatch(/separador «Pagamentos» é só configuração/);
  });

  it("a barra de telemóvel traz o que o `aside` tinha, com os mesmos rótulos", () => {
    for (const rotulo of ["Nova loja", "Dashboard de Administração", "Terminar sessão", "Personalizar loja"]) {
      expect(guia, `ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(DASH_SHELL, `ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    expect(guia).toMatch(/só em contas de administrador/);
  });
});

describe("Orientação do ecrã «Análises» — os quatro números do ecrã reconstruído", () => {
  const guia = guiaDe("analises");
  const ANALISES = readFileSync(join(ROOT, "web/views/dashboard/analises.ts"), "utf8");

  it("os rótulos dos números na orientação são os que o Dono vê no ecrã", () => {
    for (const rotulo of ["Visitas (7 dias)", "Visitas (30 dias)", "Produtos vistos (7 dias)",
      "Encomendas por WhatsApp (7 dias)"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(ANALISES, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // Os rótulos antigos desapareceram do ecrã; não podem sobreviver na orientação.
    expect(guia).not.toContain("Visualizações (7 dias)");
    expect(guia).not.toMatch(/«Produtos»[,.]/);
  });

  it("descreve o funil e os checkouts, que são o que o ecrã ganhou", () => {
    expect(guia).toContain("Funil de compra (30 dias)");
    expect(guia).toContain("Checkouts abertos (30 dias)");
    expect(ANALISES).toContain("Checkouts abertos (30 dias)");
    expect(ANALISES).toContain("Funil de compra (30 dias)");
  });

  it("diz o que o ecrã não faz: sem comparação nas visualizações e sem filtro de datas", () => {
    expect(guia).toContain("não têm comparação entre períodos");
    expect(guia).toContain("Não há filtro de datas");
  });

  it("descreve a dica do gráfico e o estado vazio", () => {
    expect(guia).toContain("Visitas — últimos 14 dias");
    expect(ANALISES).toContain("Visitas — últimos 14 dias");
    expect(guia).toContain("Ainda não há visitas para mostrar");
    expect(ANALISES).toContain("Ainda não há visitas para mostrar");
  });
});

describe("Orientação dos ecrãs novos — Taxa de entrega, Código de desconto e Avaliações", () => {
  it("«Taxa de entrega» descreve os dois modos e a província real", () => {
    const guia = resolver(guiaDe("entregas"));
    expect(guia).toContain(DELIVERY_PROVINCE);
    for (const rotulo of ["Valor único", "Por área", "Entrega grátis acima de", "Guardar a taxa de entrega"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(DASH_ALL, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // A consequência que o Dono precisa de saber antes de guardar.
    expect(guia).toMatch(/não aparecem ao cliente/);
    // Saiu das Configurações: a orientação do `config` tem de o dizer.
    expect(guiaDe("config")).toContain("Taxa de entrega");
  });

  it("«Código de desconto» descreve os campos e os quatro estados", () => {
    const guia = guiaDe("descontos");
    for (const rotulo of ["Código", "Tipo", "Percentagem", "Valor fixo", "Limite de usos", "Válido até", "Criar código"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(DASH_ALL, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    for (const estado of ["Ativo", "Inativo", "Caducado", "Esgotado"]) {
      expect(guia, `estado ausente da orientação: ${estado}`).toContain(estado);
    }
    // Duas regras que o Dono não adivinha.
    expect(guia).toMatch(/quando a encomenda é paga/);
    expect(guia).toMatch(/não são visíveis aos clientes/);
  });

  it("«Avaliações» diz que as novas entram por aprovar", () => {
    const guia = guiaDe("avaliacoes");
    expect(guia).toMatch(/entram \*\*por aprovar\*\*/);
    for (const rotulo of ["Por aprovar", "Publicadas", "Aprovar", "Esconder", "Apagar"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
    }
    expect(DASH_ALL).toContain("As avaliações novas só aparecem na página do produto depois de as aprovar.");
  });
});

describe("Orientação do ecrã «Pagamentos» — WhatsApp sempre, digitais por aprovação", () => {
  const guia = resolver(guiaDe("pagamentos"));
  const PAG = readFileSync(join(ROOT, "web/views/dashboard/pagamentos.ts"), "utf8");
  const MARKUP = readFileSync(join(ROOT, "web/views/dashboard/markup.ts"), "utf8");

  it("o WhatsApp é descrito como sempre ativo, com o campo do ecrã", () => {
    expect(guia).toContain("Sempre ativo");
    expect(guia).toContain("Número de WhatsApp");
    expect(MARKUP).toContain("Número de WhatsApp");
  });

  it("enumera os campos e os documentos do pedido de verificação", () => {
    for (const rotulo of ["Nome da empresa", "NIF da empresa", "Banco", "Titular da conta", "IBAN", "Enviar para aprovação"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(MARKUP, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    for (const d of COMPANY_DOCUMENTS) expect(guia, `documento ausente: ${d.label}`).toContain(d.label);
  });

  it("os quatro estados são os rótulos do domínio, não uma cópia à mão", () => {
    for (const estado of Object.values(VERIFICATION_STATUS_LABEL)) {
      expect(guia, `estado ausente da orientação: ${estado}`).toContain(estado);
    }
    expect(guiaDe("pagamentos"), "os estados estão copiados à mão em vez de vir de VERIFICATION_STATUS_LABEL")
      .toContain("${VERIFICATION_STATUS_LABEL.pending}");
  });

  it("avisa que alterar dados aprovados volta a pôr o pedido em análise", () => {
    expect(guia).toContain("Alterar dados");
    expect(guia).toMatch(new RegExp(`volta a pôr o pedido «${VERIFICATION_STATUS_LABEL.pending}»`));
    expect(PAG).toContain("changeRequiresReview");
  });

  it("não promete um interruptor que não existe: quem liga é a aprovação", () => {
    expect(guia).toMatch(/quem os liga é a aprovação/);
    expect(guia).not.toMatch(/Pagamentos online/);
    // Houve um tempo em que esta guarda era «a orientação não fala de chave
    // nenhuma», porque a chave que existia era a do fornecedor antigo e ligava
    // os pagamentos. Agora há uma chave no ecrã — a do **Vero da empresa do
    // Dono**, que emite a fatura — e o que importa é que nenhuma chave apareça
    // como forma de ligar pagamentos. Logo: cada linha que fale de chave tem de
    // ser uma linha da faturação.
    const comChave = guia.split("\n").filter((l) => /chave|API key/i.test(l));
    expect(comChave.length, "ninguém fala de chave: esta guarda deixou de guardar algo").toBeGreaterThan(0);
    for (const linha of comChave) {
      expect(linha, `chave fora da faturação: ${linha.trim().slice(0, 90)}`).toMatch(/Vero|fatura/i);
    }
  });

  it("é só configuração, e manda as vendas para o «Início», onde elas estão", () => {
    expect(guia).toMatch(/só configuração/);
    expect(guia).toMatch(/estão no «Início»/);
    expect(PAG).toContain("As encomendas e as vendas estão no");
    for (const rotulo of ["Recebido (líquido)", "Disponível para levantar", "Solicitar levantamento", "Apagar registo"]) {
      expect(guia, `${rotulo} já não é de «Pagamentos»`).not.toContain(rotulo);
    }
  });
});

describe("Orientação dos ecrãs «Plano» e «Configurações»", () => {
  it("o Plano fala de um só cartão de preço e do que não existe", () => {
    const guia = guiaDe("plano");
    expect(guia).toContain("${PRECO}");
    expect(guia).toMatch(/um cartão de preço só/);
    expect(guia).toMatch(/Cada loja tem a sua subscrição/);
    expect(guia).toMatch(/Não há escalões nem ciclo anual/);
    expect(guia).toContain("A subscrição desta loja");
    expect(readFileSync(join(ROOT, "web/views/dashboard/markup.ts"), "utf8")).toContain("A subscrição desta loja");
  });

  it("diz que o método se escolhe na página do fornecedor, não na janela do painel", () => {
    /*
     * A janela tinha dois cartões, «Multicaixa Express» e «Referência
     * Bancária», e a escolha não ia a sítio nenhum: `wizaCreateCharge` não
     * recebe o método, e a página do fornecedor mostra sempre os dois. Pedir a
     * mesma decisão duas vezes, e na primeira sem efeito, era pedir ao Dono
     * para adivinhar qual contava.
     */
    const guia = resolver(guiaDe("plano"));
    expect(guia).toMatch(/é feita lá/);
    expect(guia).toContain("Continuar para o pagamento");
    const CHECKOUT = readFileSync(join(ROOT, "web/lib/planCheckout.ts"), "utf8");
    expect(CHECKOUT).toContain("Continuar para o pagamento");
    expect(CHECKOUT, "a janela voltou a escolher o método").not.toContain("methodCard");
    expect(CHECKOUT).not.toContain("data-m=");
    // E o fornecedor continua a não receber método nenhum.
    expect(readFileSync(join(ROOT, "api/_wizapay.js"), "utf8"))
      .toMatch(/export async function wizaCreateCharge\(\{ amountKz, referenceId, phone/);
    for (const estado of ["Ativa até", "Inativa", "Caducada", "Conta de administração"]) {
      expect(guia, `estado ausente: ${estado}`).toContain(estado);
    }
    // Nenhum número escrito à mão.
    expect(guia.replace(/\$\{[^}]*\}/g, "")).not.toMatch(/\d/);
  });

  it("diz que a janela já não pede o telemóvel: o número é o da conta", () => {
    /*
     * O Dono confirma um número por SMS para poder publicar, e a janela de
     * pagamento pedia-o outra vez. Era pedir o que a plataforma já sabia — e
     * deixava pagar com um número diferente do confirmado. Quem o lê agora é o
     * servidor, de `profiles.phone` (`tests/paymentCallbacks.test.ts` verifica
     * que é esse o que chega ao fornecedor).
     */
    const guia = resolver(guiaDe("plano"));
    expect(guia).toMatch(/já não pede o telemóvel/);
    expect(guia).toMatch(/confirmou por SMS/);
    const CHECKOUT = readFileSync(join(ROOT, "web/lib/planCheckout.ts"), "utf8");
    // O campo fica para um caso só, e só depois de o servidor o pedir.
    expect(CHECKOUT, "a janela voltou a pedir o telemóvel sempre").toContain("PHONE_REQUIRED");
  });

  it("as Configurações são exactamente as três funcionalidades «Em breve», pelos rótulos do domínio", () => {
    const guia = guiaDe("config");
    for (const k of ["customDomain", "marketing", "sms"] as const) {
      expect(guia, `${k} não vem de COMING_SOON_LABELS`).toContain(`\${COMING_SOON_LABELS.${k}}`);
    }
    const resolvida = resolver(guia);
    for (const nome of comingSoonList()) expect(resolvida).toContain(nome);
    expect(resolvida).toContain("Em breve");
    expect(resolvida).toContain("Apagar a loja");
    expect(DASH_ALL).toContain("Apagar a loja");
    // Não prometer datas é regra: a orientação di-lo.
    expect(resolvida).toMatch(/Não prometas datas/);
  });

  it("as Configurações dizem para onde foram as entregas, os descontos e as avaliações", () => {
    // Sem isto, o assistente manda o Dono procurar nas Configurações o que
    // mudou de sítio — a não-resposta que originou esta regra.
    const guia = guiaDe("config");
    for (const destino of ["Taxa de entrega", "Código de desconto", "Avaliações"]) {
      expect(guia, `destino ausente: ${destino}`).toContain(destino);
    }
  });
});

describe("Orientação do ecrã «Administração» — as seis secções e as aprovações", () => {
  const guia = resolver(guiaDe("admin"));
  const ADMIN_SHELL = readFileSync(join(ROOT, "web/views/adminPanel.ts"), "utf8");
  const ADMIN_ALL = (() => {
    const pasta = join(ROOT, "web/views/admin");
    const partes = readdirSync(pasta).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(pasta, f), "utf8"));
    return [ADMIN_SHELL, ...partes].join("\n");
  })();

  it("as secções da orientação são as do painel, e são seis", () => {
    const lista = ADMIN_SHELL.slice(ADMIN_SHELL.indexOf("const SECTIONS"), ADMIN_SHELL.indexOf("const LEGACY_ROUTES"));
    const labels = [...lista.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]!);
    expect(labels.length).toBeGreaterThanOrEqual(5);
    for (const label of labels) expect(guia, `secção ausente da orientação: ${label}`).toContain(label);
    expect(guia).toMatch(/Seis secções/);
  });

  it("descreve as aprovações com as ações e o mínimo real do motivo", () => {
    for (const rotulo of ["Ver matrícula", "Ver certidão", "Aprovar", "Rejeitar", "Histórico"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(ADMIN_ALL, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    expect(guia).toContain(`pelo menos ${REJECTION_REASON_MIN} caracteres`);
    expect(guiaDe("admin"), "o mínimo do motivo está escrito à mão").toContain("${REJECTION_REASON_MIN}");
    expect(guia).toMatch(/liga sozinho os pagamentos digitais/);
  });

  it("descreve a ativação manual com as durações reais", () => {
    expect(guia).toContain("Ativar");
    expect(guia).toContain("Prolongar");
    expect(guia).toContain("Desativar");
    for (const m of ACTIVATION_MONTHS) expect(guia).toMatch(new RegExp(`\\b${m}\\b`));
    expect(guiaDe("admin"), "as durações estão escritas à mão").toContain("ACTIVATION_MONTHS");
    // A subscrição é de cada loja: ativa-se em «Lojas», e «Contas» já não tem o botão.
    expect(guia).toMatch(/- LOJAS:[^\n]*«Ativar»/);
    expect(guia).not.toMatch(/- CONTAS:[^\n]*«Ativar»/);
    const LOJAS = readFileSync(join(ROOT, "web/views/admin/stores.ts"), "utf8");
    const CONTAS = readFileSync(join(ROOT, "web/views/admin/accounts.ts"), "utf8");
    expect(LOJAS).toContain('data-act="activate"');
    expect(LOJAS).toContain("adminActivateStorePlan(s.id, months)");
    expect(CONTAS).not.toContain('data-act="activate"');
  });

  it("distingue a receita da plataforma do dinheiro dos Donos, e não fala do que saiu", () => {
    expect(guia).toContain("Receita do mês");
    expect(guia).toMatch(/dinheiro dos Donos/);
    expect(guia).not.toMatch(/Transações/);
    expect(guia).not.toMatch(/SMS e logótipos/);
    expect(guia).not.toMatch(/teste grátis/i);
  });

  it("explica porque é que as lojas da própria conta não entram nos números, e onde estão", () => {
    // O Administrador criou duas lojas com a própria conta e concluiu que o
    // painel não as mostrava: a Visão geral contava zero e «Contas» abria no
    // filtro dos Donos. A regra de exclusão está certa; faltava dizê-lo.
    expect(guia).toMatch(/própria conta/);
    expect(guia).toContain("«Lojas», que é onde elas aparecem");
    expect(guia).toContain("filtro «Administradores»");
    const VISAO = readFileSync(join(ROOT, "web/views/admin/overview.ts"), "utf8");
    expect(VISAO, "a Visão geral já não conta as lojas da própria conta").toContain("adminIds.has(s.ownerId)");
    expect(VISAO).toContain("da sua própria conta de administração");
  });

  it("uma leitura falhada aparece como falha, com a causa, e não como lista vazia", () => {
    expect(guia).toContain("Não foi possível carregar esta secção");
    expect(guia).toContain("Tentar de novo");
    expect(guia).toMatch(/falta aplicar uma migração/);
    for (const rotulo of ["Não foi possível carregar esta secção.", "Tentar de novo"]) {
      expect(ADMIN_ALL, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    // A causa chega ao ecrã: é a frase da exceção que a leitura lança.
    expect(ADMIN_SHELL).toContain("errorState(err instanceof Error ? err.message : \"\")");
  });
});

describe("Orientação do ecrã «Assistente_de_Criação» — a conta como o ecrã a pede agora", () => {
  const WIZARD = readFileSync(join(ROOT, "web/views/wizard.ts"), "utf8");
  const guia = guiaDe("criar");
  const resolvida = resolver(guia);

  it("os passos da conta estão pela ordem em que o ecrã os pede", () => {
    const passos = ["o nome", "o email", "a palavra-passe", "outra vez, para confirmar"];
    const posicoes = passos.map((p) => {
      const i = resolvida.indexOf(p);
      expect(i, `passo ausente da orientação: ${p}`).toBeGreaterThanOrEqual(0);
      return i;
    });
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    expect(resolvida).toMatch(/formato inválido é recusado/);
    expect(WIZARD).toContain("Esse email não parece válido");
  });

  it("diz o mínimo real da palavra-passe, sem número escrito à mão", () => {
    expect(resolvida).toContain(`mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
    expect(guia.replace(/\$\{[^}]*\}/g, ""), "há um número escrito à mão na orientação").not.toMatch(/\d/);
  });

  it("a palavra-passe não aparece no chat, e uma diferença pede as duas de novo", () => {
    expect(resolvida).toContain("••••••••");
    expect(WIZARD).toContain('userSay("••••••••")');
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
    expect(resolvida).toMatch(/volta ao mesmo cartão/);
  });

  it("os rótulos de correção vêm da mesma constante que o ecrã usa", () => {
    for (const rotulo of Object.values(REGISTER_FIX_LABELS)) {
      expect(resolvida, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(guia, `«${rotulo}» está copiado à mão em vez de vir de REGISTER_FIX_LABELS`).not.toContain(rotulo);
    }
    const entrar = resolvida.indexOf(REGISTER_FIX_LABELS.entrar);
    expect(entrar).toBeGreaterThanOrEqual(0);
    expect(resolvida).toContain("/login");
    expect(WIZARD).toContain('go("#/login")');
    expect(resolvida).toMatch(/não decide sozinho/);
  });

  it("o fim do assistente é a galeria de modelos, e já não pergunta pelo logótipo", () => {
    // O gerador de logótipos saiu: a conversa acabava com uma oferta que já não
    // existe.
    expect(resolvida).toMatch(/galeria de modelos prontos/);
    expect(WIZARD).toContain("goToModels()");
    expect(resolvida).not.toMatch(/logótipo/i);
    expect(WIZARD).not.toMatch(/logoPurchase|generateLogos/);
  });

  it("diz o que não existe aqui, e onde se resolve", () => {
    expect(resolvida).toMatch(/não se recupera a palavra-passe aqui dentro/);
    // O email continua a não ser confirmado. A SMS deste ecrã confirma o
    // telemóvel, e a orientação tem de distinguir as duas coisas: foi a
    // confusão que estava à espera de acontecer quando a SMS entrou.
    expect(resolvida).toMatch(/o email não é confirmado/);
    expect(resolvida).toMatch(/confirma o \*\*telemóvel\*\*, não o email/);
    expect(resolvida).toContain("Esqueci-me da palavra-passe");
  });
});

describe("Orientação do ecrã «Assistente_de_Criação» — o código por SMS", () => {
  /**
   * O passo novo é o que mais perguntas vai gerar («não me chegou a SMS»), e é
   * aquele em que uma orientação errada custa dinheiro: se o assistente disser
   * que se pode reenviar à vontade, o Dono tenta, e cada tentativa é uma SMS
   * paga.
   */
  const WIZARD = readFileSync(join(ROOT, "web/views/wizard.ts"), "utf8");
  const guia = guiaDe("criar");
  const resolvida = resolver(guia);

  it("os números do código vêm das constantes, não escritos à mão", () => {
    for (const nome of ["${PHONE_CODE_LENGTH}", "${CODIGO_MINUTOS}", "${REENVIOS}"]) {
      expect(guia, `${nome} está escrito à mão na orientação`).toContain(nome);
    }
    // A regra de sempre neste ecrã: nenhum algarismo no texto-fonte.
    expect(guia.replace(/\$\{[^}]*\}/g, "")).not.toMatch(/\d/);
  });

  it("o telemóvel é pedido depois de a conta existir, e a orientação diz porquê", () => {
    const conta = resolvida.indexOf("conta ser criada");
    expect(conta).toBeGreaterThan(-1);
    expect(resolvida).toMatch(/com a sessão já iniciada/);
    // E é o que o ecrã faz: o passo do telemóvel segue a criação da conta.
    expect(WIZARD).toMatch(/botSay\("Boa, conta criada! 🎉"\);\s*askPhone\(\);/);
  });

  it("os rótulos do ecrã do código são os que o Dono vê", () => {
    for (const rotulo of ["Reenviar código", "Trocar o número", "Não recebi o código"]) {
      expect(resolvida, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(WIZARD, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    expect(resolvida).toContain(`${PHONE_RESEND_DELAYS_MS.map((ms) => String(ms / 1000)).join(" e ")} segundos`);
  });

  it("diz que «Não recebi o código» não cancela nada, e o que fica por fazer", () => {
    // É a pergunta a seguir: «se eu não confirmar, perco a loja?». Não.
    expect(resolvida).toMatch(/não cancela nada/);
    expect(resolvida).toMatch(/confirma-se mais tarde no Dashboard/);
    expect(resolvida).toMatch(/fica por fazer é \*\*publicar\*\*/);
  });

  it("diz o que acontece quando a SMS não pode ser enviada", () => {
    for (const rotulo of ["Tentar de novo", "Continuar sem confirmar"]) {
      expect(resolvida, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(WIZARD, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
    expect(resolvida).toMatch(/Nunca fica ninguém preso/);
  });

  it("os factos dizem que publicar exige as duas condições", () => {
    const facts = resolver(factsLiteral());
    expect(facts).toMatch(/PUBLICAR exige \*\*duas\*\* coisas/);
    expect(facts).toMatch(/telemóvel da conta confirmado por SMS/);
    // E dizem o que NÃO é confirmado, que é metade das perguntas.
    expect(facts).toMatch(/O EMAIL não é confirmado/);
  });
});

describe("Orientação do ecrã «registo» — a redefinição da palavra-passe existe mesmo", () => {
  /**
   * A orientação prometeu durante muito tempo uma «recuperação por email» que
   * não existia, e depois negou-a quando ela passou a existir. As duas versões
   * eram o mesmo defeito: a orientação a contar uma história diferente do ecrã.
   */
  const LOGIN = readFileSync(join(ROOT, "web/views/login.ts"), "utf8");
  const guia = resolver(guiaDe("registo"));

  it("os rótulos do fluxo são os do ecrã", () => {
    for (const rotulo of ["Entrar", "Esqueci-me da palavra-passe", "Enviar link",
      "Definir nova palavra-passe", "Guardar a nova palavra-passe"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
      expect(LOGIN, `rótulo ausente do ecrã: ${rotulo}`).toContain(rotulo);
    }
  });

  it("cita a resposta neutra do ecrã, que não diz se a conta existe", () => {
    const neutra = "Se existir uma conta com este email, enviámos um link para redefinir a palavra-passe.";
    expect(LOGIN).toContain(neutra);
    expect(guia).toContain(neutra);
  });

  it("avisa do mesmo navegador e diz o mínimo real da palavra-passe", () => {
    // O cliente usa PKCE: o link aberto noutro navegador não tem a sessão.
    expect(guia).toMatch(/mesmo navegador/);
    expect(guia).toContain(`mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
    // O número tem de vir da constante: no texto-fonte não há um só algarismo.
    expect(guiaDe("registo").replace(/\$\{[^}]*\}/g, "")).not.toMatch(/\d/);
  });

  it("não volta a negar a redefinição, e distingue o email do telemóvel", () => {
    expect(guia).not.toMatch(/NÃO há recuperação/);
    expect(guia).not.toMatch(/não se muda a palavra-passe depois de a conta existir/);
    // O email não é confirmado; o telemóvel é. Depois de a SMS entrar, «não há
    // confirmação por SMS» passou a ser falso — e é exactamente este tipo de
    // frase que envelhece em silêncio.
    expect(guia).toMatch(/NÃO há confirmação de email/);
    expect(guia).toMatch(/O que é confirmado é o telemóvel/);
  });
});

describe("Orientação do ecrã «Assistente_de_Criação» — sair a meio não perde nada", () => {
  /*
   * A mala de dados vivia só em memória: fechar o separador perdia o nome da
   * loja, o tipo, o texto longo sobre o negócio e os textos para o Google já
   * corrigidos. Agora a fase da loja é gravada no navegador
   * (`web/lib/wizardDraft.ts`) e o assistente oferece-se para continuar. Quem
   * pergunta «perdi tudo?» tem de ouvir a resposta certa.
   */
  const guia = resolver(guiaDe("criar"));
  const WIZARD = readFileSync(join(ROOT, "web/views/wizard.ts"), "utf8");

  it("diz que a fase da loja é guardada e como se retoma", () => {
    expect(guia).toMatch(/SAIR A MEIO NÃO PERDE/);
    expect(guia).toContain("Continuar");
    expect(guia).toContain("Começar de novo");
    expect(guia).toMatch(/é apagado quando a loja é criada/);
    // O prazo vem do módulo, não escrito à mão no texto.
    expect(guiaDe("criar")).toContain("${WIZARD_DRAFT_TTL_DAYS}");
    expect(guia).toContain(`vale ${WIZARD_DRAFT_TTL_DAYS} dias`);
  });

  it("diz que a fase da conta NÃO é guardada", () => {
    // O contrário seria pior do que não dizer nada: o Dono fica à espera de
    // encontrar o email e a palavra-passe preenchidos.
    expect(guia).toMatch(/Os passos da CONTA não são guardados/);
    expect(guia).toMatch(/palavra-passe, que nunca é escrita no navegador/);
  });

  it("o ecrã grava a cada resposta da loja e limpa quando a loja nasce", () => {
    for (const passo of ["\"type\"", "\"about\"", "\"seo\"", "\"subdomain\""]) {
      expect(WIZARD, `nenhuma gravação com o passo ${passo}`).toContain(`guardarRascunho(${passo})`);
    }
    expect(WIZARD).toContain("clearWizardDraft()");
    // E a entrada na fase da loja passa toda pelo mesmo sítio: se um caminho
    // chamasse `askStoreName()` diretamente, esse caminho apagava o rascunho
    // sem perguntar.
    expect(WIZARD).toContain("function continuarLoja()");
    // Os quatro caminhos: sessão já iniciada, número confirmado agora, número
    // que já estava confirmado, e «Não recebi o código».
    expect(WIZARD.match(/continuarLoja\(\);/g) ?? [], "um caminho entra na loja sem passar pelo rascunho")
      .toHaveLength(4);
  });
});

describe("Orientação do ecrã «editor» — o que se acrescenta depende do modelo", () => {
  /**
   * O menu «Adicionar secção» deixou de oferecer as secções que o modelo já
   * traz, e o que é acrescentado passou a sair no desenho do modelo
   * (`MODELO-GUIA.md` §9.3). A versão antiga enumerava três secções fixas, e com
   * ela o assistente mandaria um Dono do Lumière acrescentar testemunhos que ele
   * já tem.
   */
  const guia = guiaDe("editor");

  it("diz que o menu depende do modelo, em vez de enumerar uma lista fixa", () => {
    expect(guia).toMatch(/depende do modelo/);
    expect(guia).toContain("Secção de produtos");
    expect(guia).not.toMatch(/acrescenta Produtos, Informação com foto ou Título e texto/);
  });

  it("diz que as secções nativas do modelo se editam onde estão", () => {
    expect(guia).toMatch(/não aparecem no menu/i);
    expect(guia).toMatch(/edita-se onde estão|na própria secção/);
    expect(guia).toContain("Lumière Chic");
  });

  it("nomeia as secções nativas que o modelo do exemplo declara", async () => {
    // A orientação não pode ficar a falar de secções que o modelo deixou de
    // declarar como nativas: são a mesma verdade em dois sítios.
    //
    // O especificador fica numa constante de propósito: com ele literal, o `tsc`
    // segue o import e arrasta `web/lib/routing.ts` (que lê `location` e
    // `window`) para um programa compilado sem DOM.
    // `web/templates/lumiere.js` puxa `web/lib/routing.ts`, que lê `location` no
    // arranque. O substituto é posto aqui e não deixado ao acaso: sem ele, este
    // teste só passava quando outro ficheiro, no mesmo processo, o tinha posto
    // primeiro — e falhava conforme a ordem em que o vitest distribuía os
    // ficheiros pelos trabalhadores.
    const g = globalThis as unknown as { location?: unknown };
    if (!g.location) {
      g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost", href: "http://localhost/" };
    }
    const especificador = "../web/templates/lumiere.js";
    const { lumiereTemplate } = (await import(especificador)) as { lumiereTemplate: StoreTemplate };
    expect(lumiereTemplate.sections?.native).toContain("testimonials");
    expect(lumiereTemplate.sections?.native).toContain("location");
    expect(guia).toMatch(/testemunhos/i);
    expect(guia).toMatch(/As nossas lojas/);
  });

  it("promete que a secção acrescentada tem o desenho do modelo", () => {
    expect(guia).toMatch(/desenho do modelo/);
  });

  it("não oferece um gerador de logótipos: o logótipo é carregado pelo Dono", () => {
    expect(guia).toMatch(/não há gerador de logótipos/i);
    expect(guia).toContain("Trocar");
  });
});

describe("Orientação da página inicial — as secções que a página tem agora", () => {
  /*
   * `tests/landingCopy.test.ts` já garante que **cada título** da página está
   * aqui. Estas asserções são sobre o que não é título e o visitante pergunta:
   * o botão que substituiu o «Já tenho conta», o que a secção das lojas faz, e
   * quem emite a fatura.
   */
  const guia = resolver(guiaDe("site"));

  it("descreve os dois botões do topo, e que o «Já tenho conta» saiu", () => {
    expect(guia).toContain("Criar minha loja");
    expect(guia).toContain("Ver lojas de exemplo");
    expect(guia).toMatch(/já não há «Já tenho conta»/);
    expect(guia, "o login desapareceu da orientação").toContain("cabeçalho");
  });

  it("explica a secção das lojas de exemplo: o que abre cada botão", () => {
    expect(guia).toContain("Lojas criadas na MôBisno.");
    expect(guia).toMatch(/«Ver a loja» abre a loja inteira numa janela/);
    expect(guia).toContain("Ver todas as lojas");
    expect(guia).toContain("/lojas");
    // São lojas de clientes: não prometer maquetas nem lojas de demonstração.
    expect(guia).toMatch(/lojas verdadeiras de clientes/);
  });

  it("diz quem emite a fatura, e que a chave é do Dono", () => {
    expect(guia).toMatch(/certificada pela AGT/);
    expect(guia).toContain("Vero");
    expect(guia).toContain("vero.ao");
    expect(guia, "sem isto o assistente promete faturas a quem não tem chave")
      .toMatch(/sem elas a loja vende e recebe como sempre, só não emite fatura/);
  });
});

describe("Orientação do ecrã «legal» — descreve o que os documentos dizem agora", () => {
  const guia = resolver(guiaDe("legal"));

  it("fala do plano único, do WhatsApp e da verificação de empresa", () => {
    expect(guia).toMatch(/plano único/);
    expect(guia).toMatch(/WhatsApp/);
    expect(guia).toMatch(/empresas registadas/);
    for (const d of COMPANY_DOCUMENTS) expect(guia).toContain(d.label);
  });

  it("diz quem vê os dados da empresa e para que servem", () => {
    expect(guia).toMatch(/armazenamento privado/);
    expect(guia).toMatch(/administração da MôBisno/);
    expect(guia).toContain(PLATFORM_CONTACT_EMAIL);
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
    expect(AI_AGENT).toMatch(/const sheet = isNarrow\(\)/);
    expect(AI_AGENT).toContain("height:min(86dvh,640px)");
    expect(AI_AGENT).toContain("border-radius:20px 20px 0 0");
  });

  it("não rouba o foco no telemóvel", () => {
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

  it("a animação da bolha está definida no próprio módulo", () => {
    // `mbBubbleIn` era usada aqui e definida noutro ficheiro: a bolha entrava
    // sem animação em qualquer ecrã que não fosse o assistente de criação.
    expect(AI_AGENT).toContain("@keyframes mbBubbleIn");
  });
});
