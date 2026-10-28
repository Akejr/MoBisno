/**
 * O campo do endereço da loja, no assistente de criação: o que ele limpa
 * enquanto se escreve, e o que avisa.
 *
 * O endereço escolhia-se por conversa, e cada erro era uma volta inteira com um
 * parágrafo sobre as quatro regras. O campo diz só a regra que falhou, na hora.
 * A verificação final continua a ser `resolvePassoSubdominio`, e o
 * `isValidIdentifierFormat` do domínio é o árbitro: por isso a última asserção
 * confere que o campo e o domínio concordam em qualquer texto.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeIdentifierInput, identifierProblem } from "../src/ui/wizardSteps.js";
import {
  isValidIdentifierFormat, MAX_IDENTIFIER_LENGTH, DEFAULT_RESERVED_IDENTIFIERS,
} from "../src/services/identifierService.js";

describe("Endereço — o que o campo limpa enquanto se escreve", () => {
  it("minúsculas, sem acentos, e o espaço passa a hífen", () => {
    expect(sanitizeIdentifierInput("Café Ndombe")).toBe("cafe-ndombe");
    expect(sanitizeIdentifierInput("LOJA_da Joana")).toBe("loja-da-joana");
  });

  it("tira o que não pode estar num endereço", () => {
    expect(sanitizeIdentifierInput("kitanda!@#.ao")).toBe("kitandaao");
  });

  it("não mexe nos hífenes: quem escreveu «loja-» vai a meio da palavra seguinte", () => {
    expect(sanitizeIdentifierInput("loja-")).toBe("loja-");
    expect(sanitizeIdentifierInput("loja--x")).toBe("loja--x");
  });

  it("corta no comprimento máximo", () => {
    expect(sanitizeIdentifierInput("a".repeat(100))).toHaveLength(MAX_IDENTIFIER_LENGTH);
  });
});

describe("Endereço — o aviso diz só a regra que falhou", () => {
  it("um endereço bom não tem aviso", () => {
    expect(identifierProblem("kitanda-do-bairro")).toBeNull();
  });

  it("cada regra tem a sua frase", () => {
    expect(identifierProblem("")).toMatch(/Escreve o endereço/);
    expect(identifierProblem("a")).toMatch(/pelo menos 2/);
    expect(identifierProblem("-loja")).toMatch(/começar nem acabar em hífen/);
    expect(identifierProblem("loja-")).toMatch(/começar nem acabar em hífen/);
    expect(identifierProblem("lo--ja")).toMatch(/dois hífenes seguidos/);
    expect(identifierProblem("modelo-moda")).toMatch(/reservado à MôBisno/);
    for (const r of DEFAULT_RESERVED_IDENTIFIERS) expect(identifierProblem(r), r).toMatch(/reservado/);
  });

  it("os avisos são curtos: uma frase, não as quatro regras de uma vez", () => {
    for (const v of ["", "a", "-x", "x--y", "modelo-x"]) {
      expect(String(identifierProblem(v)).split(/\s+/).length, v).toBeLessThanOrEqual(10);
    }
  });

  it("o campo e o domínio concordam: sem aviso de formato é um formato válido", () => {
    // `isValidIdentifierFormat` é o árbitro da criação. Se o campo deixasse
    // passar o que o domínio recusa, o Dono veria «Disponível» e depois um erro.
    fc.assert(fc.property(fc.string({ maxLength: 80 }), (s) => {
      const v = sanitizeIdentifierInput(s);
      const semAviso = identifierProblem(v) === null;
      return !semAviso || isValidIdentifierFormat(v);
    }), { numRuns: 400 });
  });
});
