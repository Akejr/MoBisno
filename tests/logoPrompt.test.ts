/**
 * Direção de arte do Gerador_De_Logotipos (`api/logo.js` → `buildPrompt`).
 *
 * ## A avaria que estes exemplos guardam
 *
 * O gerador montava o prompt por esta ordem: direção de arte fixa, estilo da
 * variação e, no fim, a descrição do Dono rotulada como «Descrição do negócio
 * dada pelo cliente». A direção de arte impunha, em texto imperativo e em
 * TODAS as cinco variações, que o símbolo fosse abstrato, que levasse
 * gradiente e que a tipografia fosse sans-serif em minúsculas.
 *
 * Daí saíam as duas queixas do Dono:
 *
 *  1. **«parecem-se todas»** — as cinco variações só trocavam a arrumação das
 *     peças; tipografia, cor e acabamento vinham fixos do bloco partilhado, que
 *     era a maior parte do prompt. Cinco layouts, uma só direção de arte.
 *  2. **«ignora o que peço»** — apresentado como contexto de negócio e colocado
 *     depois das regras, o pedido do Dono perdia os conflitos. Quem escrevia
 *     «todo preto, sem símbolo, só o nome» recebia símbolos com gradiente
 *     colorido, porque três das cinco variações exigiam um símbolo.
 *
 * A correção é de precedência, não de gosto: o briefing abre o prompt e manda,
 * as predefinições da casa só preenchem silêncios, e cada variação sabe
 * degradar para tratamento tipográfico quando o Dono recusa símbolos.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O que se fixa é a ESTRUTURA do prompt — que blocos existem, por que ordem
 * aparecem e o que nenhum deles pode voltar a impor. São afirmações contáveis
 * sobre cinco direções conhecidas, não uma invariante sobre entradas variáveis:
 * a descrição do Dono é transportada tal e qual e não entra em nenhuma decisão.
 *
 * ## Como se chega ao módulo
 *
 * `api/logo.js` é JavaScript puro — as funções serverless não passam pelo
 * compilador — por isso está fora do `include` do `tsconfig.json` e não tem
 * declarações de tipos. Mesmo contorno de `tests/seoInfra.test.ts`: import
 * suprimido e resultado tipado à mão.
 */
import { describe, it, expect } from "vitest";

// @ts-expect-error módulo JavaScript sem declarações de tipos
import * as logoModule from "../api/logo.js";

const { buildPrompt, VARIATION_COUNT } = logoModule as unknown as {
  buildPrompt(description: string, variationIndex: number): string;
  VARIATION_COUNT: number;
};

/** O briefing do ecrã real que motivou a correção (três recusas explícitas). */
const BRIEFING =
  "Uma marca de cosmeticos de nome Juddy Cosmetics. Quero uma fonte elegante. " +
  "o logo quero todo preto. não quero um simbolo, quero somente o nome escrito " +
  "de forma personalizada para a marca";

/** Os cinco prompts que um pedido produz. */
function todosOsPrompts(descricao = BRIEFING): string[] {
  return Array.from({ length: VARIATION_COUNT }, (_, i) => buildPrompt(descricao, i));
}

/**
 * Os seis blocos do prompt, pela ordem em que o modelo os lê: abertura,
 * briefing, precedência, direção da variação, predefinições e requisitos de
 * ficheiro. `buildPrompt` junta-os com linha em branco, e nenhum bloco tem
 * linhas em branco lá dentro — é isso que torna a divisão fiável.
 */
function blocos(prompt: string): string[] {
  return prompt.split("\n\n");
}

describe("buildPrompt — precedência do briefing do Dono", () => {
  it("gera uma direção por proposta da grelha (R2.1: são cinco)", () => {
    // A grelha do painel mostra cinco cartões e `LOGO_PROPOSALS` pede cinco.
    expect(VARIATION_COUNT).toBe(5);
  });

  it("põe o briefing do Dono ANTES das predefinições da casa, em todas as direções", () => {
    for (const prompt of todosOsPrompts()) {
      const briefing = prompt.indexOf(BRIEFING);
      const predefinicoes = prompt.indexOf("PREDEFINIÇÕES DA CASA");

      expect(briefing).toBeGreaterThanOrEqual(0);
      expect(predefinicoes).toBeGreaterThan(briefing);
    }
  });

  it("declara o briefing como vinculativo antes de enunciar qualquer estilo", () => {
    for (const prompt of todosOsPrompts()) {
      const precedencia = prompt.indexOf("PRECEDÊNCIA");
      const predefinicoes = prompt.indexOf("PREDEFINIÇÕES DA CASA");

      // A regra de conflito tem de ser lida antes das regras com que conflitua.
      expect(precedencia).toBeGreaterThanOrEqual(0);
      expect(precedencia).toBeLessThan(predefinicoes);
      expect(prompt).toContain("VINCULATIVO");
    }
  });

  it("monta os seis blocos pela ordem em que têm de ser lidos", () => {
    // A divisão em blocos é o que os restantes exemplos usam para distinguir
    // «a variação impõe isto» de «a casa prefere isto». Se a montagem mudar,
    // é aqui que se parte primeiro — e não em asserções de texto solto.
    for (const prompt of todosOsPrompts()) {
      const partes = blocos(prompt);

      expect(partes).toHaveLength(6);
      expect(partes[1]).toBe(`"""${BRIEFING}"""`);
      expect(partes[2]).toMatch(/^PRECEDÊNCIA/);
      expect(partes[3]).toMatch(/^VARIAÇÃO [A-E]/);
      expect(partes[4]).toMatch(/^PREDEFINIÇÕES DA CASA/);
      expect(partes[5]).toMatch(/^REQUISITOS DE FICHEIRO/);
    }
  });

  it("transporta a descrição do Dono tal e qual, sem a reescrever", () => {
    // O gerador não interpreta nem resume o briefing: quem o melhora é o
    // `scope: "logo"` do assistente, e só quando o Dono o pede.
    for (const prompt of todosOsPrompts()) {
      expect(prompt).toContain(`"""${BRIEFING}"""`);
    }
  });
});

describe("buildPrompt — as cinco direções são mesmo cinco", () => {
  it("produz cinco prompts distintos", () => {
    const prompts = todosOsPrompts();
    expect(new Set(prompts).size).toBe(VARIATION_COUNT);
  });

  it("dá a cada direção um rótulo próprio", () => {
    const rotulos = ["VARIAÇÃO A", "VARIAÇÃO B", "VARIAÇÃO C", "VARIAÇÃO D", "VARIAÇÃO E"];
    todosOsPrompts().forEach((prompt, i) => {
      expect(prompt).toContain(rotulos[i]);
      // Uma direção não arrasta as outras: só o seu rótulo aparece.
      for (const outro of rotulos.filter((r) => r !== rotulos[i])) {
        expect(prompt).not.toContain(outro);
      }
    });
  });

  it("cai na primeira direção quando o índice está fora do intervalo", () => {
    // Comportamento preservado da versão anterior (`VARIATIONS[i] || VARIATIONS[0]`).
    const primeira = buildPrompt(BRIEFING, 0);
    expect(buildPrompt(BRIEFING, VARIATION_COUNT)).toBe(primeira);
    expect(buildPrompt(BRIEFING, -1)).toBe(primeira);
  });
});

describe("buildPrompt — o que nenhuma direção pode voltar a impor", () => {
  it("nunca exige um gradiente", () => {
    // Era o maior uniformizador: quatro das cinco variações antigas pediam
    // gradiente, e um Dono que quisesse «tudo preto» recebia cor à mesma.
    // O gradiente só pode aparecer como coisa que o cliente pode vetar.
    for (const prompt of todosOsPrompts()) {
      expect(prompt).not.toMatch(/usa um gradiente|com gradiente (suave|subtil)/i);
    }
  });

  it("mantém as preferências de tipografia e de cor no bloco subordinado ao briefing", () => {
    // A versão original impunha «tipografia sans-serif moderna, minúsculas» no
    // bloco partilhado, em pé de igualdade com as regras técnicas, e ganhava a
    // quem pedisse letra elegante. Estas preferências podem existir — sem elas
    // o resultado cai no corporativo datado —, mas só dentro das predefinições,
    // que o cabeçalho declara aplicáveis apenas ao que o cliente não disse.
    for (const prompt of todosOsPrompts()) {
      const [, , , variacao, predefinicoes] = blocos(prompt);

      expect(predefinicoes).toContain("só onde o cliente nada disse");
      // A direção da variação trata de estrutura; não fixa letra nem cor.
      expect(variacao).not.toMatch(/sans-serif|serifada|minúscul|maiúscul/i);
    }
  });

  it("afasta explicitamente o registo corporativo antiquado", () => {
    // A queixa que motivou esta segunda passagem: azul-marinho pesado, letra
    // encorpada, emblema circular e descritor do setor em maiúsculas
    // espaçadas. Duas das direções antigas ENCOMENDAVAM esse resultado.
    for (const prompt of todosOsPrompts()) {
      const [, , , variacao, predefinicoes] = blocos(prompt);

      expect(predefinicoes).toMatch(/emblemas circulares/i);
      expect(predefinicoes).toMatch(/azul-marinho/i);
      // Nenhuma direção pode ENCOMENDAR contenção nem descritor. Mencioná-los
      // para os proibir é legítimo — a variação B fá-lo —, por isso o que se
      // procura são as construções afirmativas, não as palavras soltas.
      expect(variacao).not.toMatch(/^VARIAÇÃO [A-E] — (EMBLEMA|SELO|DISTINTIVO)/);
      expect(variacao).not.toMatch(/dentro de (um|uma) (círculo|moldura|contenção|retângulo|arco)/i);
      expect(variacao).not.toMatch(/setor do negócio|descritor[^.]*espaçad/i);
    }
  });

  it("não deixa entrar texto além do nome da marca", () => {
    // O descritor («BUSINESS EMAILS» por baixo do nome) era permitido pelos
    // requisitos de ficheiro e aparecia sozinho, sem ninguém o pedir.
    for (const prompt of todosOsPrompts()) {
      expect(prompt).toContain("sem descritor do setor, sem slogan");
    }
  });

  it("oferece alternativa sem símbolo em todas as direções", () => {
    // Sem isto, um Dono que recusa símbolos perde três das cinco propostas:
    // ou desobedecem, ou colapsam todas na mesma proposta tipográfica.
    for (const prompt of todosOsPrompts()) {
      expect(prompt).toMatch(/sem símbolo/i);
    }
  });
});

describe("buildPrompt — requisitos de ficheiro", () => {
  it("exige fundo transparente e nome bem escrito em todas as direções", () => {
    // Estes não são estética: são o formato que o painel precisa, e por isso
    // ficam fora do alcance da regra de precedência.
    for (const prompt of todosOsPrompts()) {
      expect(prompt).toContain("Fundo TOTALMENTE transparente");
      expect(prompt).toContain("CORRETAMENTE");
    }
  });

  it("mantém os requisitos de ficheiro depois do briefing, sem os pôr em causa", () => {
    for (const prompt of todosOsPrompts()) {
      expect(prompt).toContain("REQUISITOS DE FICHEIRO (obrigatórios, valem sempre)");
    }
  });
});
