/**
 * Criação de conta no Assistente_de_Criação: confirmação da palavra-passe e
 * caminhos de correção.
 *
 * As duas regras que valem mesmo são:
 *  1. **palavras-passe diferentes não criam conta** — a comparação decide, e o
 *     registo só corre depois de ela passar;
 *  2. **existe caminho de correção para o email** — tanto no resumo antes de
 *     criar a conta como depois de o registo falhar, e a escolha de para onde
 *     voltar nunca vem de procurar palavras na mensagem de erro.
 *
 * A lógica está em `src/ui/wizardSteps.ts`, que é puro e corre aqui a sério. A
 * ligação ao chat está em `web/views/wizard.ts`, que depende do DOM e não pode
 * ser importado (`tests/` compila com `lib: ["ES2022"]`); para essa parte usa-se
 * o padrão `readFileSync` sobre o texto-fonte, como em `tests/comingSoon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PASSWORD_MIN_LENGTH,
  validatePasswordLength,
  validatePasswordConfirmation,
  buildRegisterFixOptions,
  REGISTER_FIX_LABELS,
} from "../src/ui/wizardSteps.js";
import type { AuthError, AuthErrorCode } from "../src/services/authService.js";

const WIZARD = readFileSync(join(__dirname, "..", "web/views/wizard.ts"), "utf8");

/** Erro de autenticação como o serviço o devolve (código + campos + motivo). */
function authError(code: AuthErrorCode, fields: string[]): AuthError {
  return { code, reason: "Motivo qualquer, que pode mudar de texto amanhã.", fields };
}

describe("Palavras-passe diferentes não criam conta", () => {
  const iguais = ["segredo123", "aaaaaa", "Ól@ Angola 2024", " com espaços ", "😀😀😀😀😀😀"];

  it("duas palavras-passe iguais passam a confirmação", () => {
    for (const p of iguais) {
      expect(validatePasswordConfirmation(p, p).status, p).toBe("valid");
    }
  });

  it("qualquer diferença entre as duas é recusada", () => {
    const diferentes: [string, string][] = [
      ["segredo123", "segredo124"],
      ["segredo123", "Segredo123"],
      ["segredo123", "segredo123 "],
      ["segredo123", " segredo123"],
      ["segredo123", ""],
      ["", "segredo123"],
      ["aaaaaa", "aaaaaaa"],
    ];
    for (const [a, b] of diferentes) {
      const r = validatePasswordConfirmation(a, b);
      expect(r.status, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe("invalid");
      if (r.status === "invalid") {
        // A mensagem tem de dizer que são as duas que voltam a ser pedidas: sem
        // isso o Dono fica a adivinhar qual delas estava errada.
        expect(r.message).toMatch(/duas/i);
      }
    }
  });

  it("o comprimento é validado antes da confirmação, com o mínimo declarado uma só vez", () => {
    // Sem número à mão: o mínimo é o que o módulo declara.
    const curta = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    const exata = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validatePasswordLength("").status).toBe("invalid");
    expect(validatePasswordLength(curta).status).toBe("invalid");
    expect(validatePasswordLength(exata).status).toBe("valid");
    expect(validatePasswordLength(exata + "mais").status).toBe("valid");
  });

  it("o ecrã não repete o número do mínimo: lê-o do módulo de passos", () => {
    expect(WIZARD).toContain("PASSWORD_MIN_LENGTH");
    expect(WIZARD).not.toMatch(/m[ií]nimo\s*\d/i);
  });

  it("o registo corre uma única vez e só com a palavra-passe já confirmada", () => {
    // Só existe um sítio a criar a conta, e a palavra-passe que ele usa é a que
    // ficou guardada — o valor escrito à primeira nunca chega ao serviço sozinho.
    const chamadas = WIZARD.match(/authService\.register\(/g) ?? [];
    expect(chamadas).toHaveLength(1);
    expect(WIZARD).toContain("password: pendingPassword");

    // A palavra-passe só é aceite depois de a comparação passar: a única
    // atribuição de um valor a `pendingPassword` (fora da limpeza) vive depois
    // da guarda de `validatePasswordConfirmation`.
    const atribuicoes = WIZARD.match(/pendingPassword\s*=\s*(?!"")\S/g) ?? [];
    expect(atribuicoes).toHaveLength(1);
    const guarda = WIZARD.indexOf("validatePasswordConfirmation(");
    const atribuicao = WIZARD.search(/pendingPassword\s*=\s*(?!"")\S/);
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(atribuicao);
  });

  it("a palavra-passe nunca é ecoada no chat nem guardada na mala de dados", () => {
    expect(WIZARD).toContain('userSay("••••••••")');
    expect(WIZARD).not.toMatch(/wiz\.data\[WIZARD_FIELDS\.password\]\s*=/);
  });
});

describe("Há caminho de correção para o email", () => {
  it("o resumo antes de criar a conta deixa corrigir o email e o nome", () => {
    // Os rótulos são os do módulo de passos, para o botão e a orientação do
    // assistente não divergirem.
    expect(REGISTER_FIX_LABELS.email).toBe("Corrigir o email");
    expect(REGISTER_FIX_LABELS.nome).toBe("Corrigir o nome");
    expect(WIZARD).toContain("REGISTER_FIX_LABELS.email");
    expect(WIZARD).toContain("REGISTER_FIX_LABELS.nome");
  });

  it("corrigir o email pede só o email e regressa ao resumo", () => {
    expect(WIZARD).toMatch(/askEmail\(askConfirmAccount/);
    expect(WIZARD).toMatch(/askName\(askConfirmAccount/);
  });

  it("qualquer falha de registo oferece corrigir o email", () => {
    const codigos: AuthErrorCode[] = [
      "EMAIL_EM_FALTA",
      "EMAIL_INVALIDO",
      "PALAVRA_PASSE_EM_FALTA",
      "NOME_EM_FALTA",
      "EMAIL_JA_REGISTADO",
      "CREDENCIAIS_INVALIDAS",
    ];
    for (const code of codigos) {
      const opcoes = buildRegisterFixOptions(authError(code, []));
      const valores = opcoes.map((o) => o.value);
      expect(valores, code).toContain("email");
      expect(valores, code).toContain("nome");
      expect(valores, code).toContain("password");
      // Nenhuma escolha repetida: dois botões iguais não ajudam ninguém.
      expect(new Set(valores).size, code).toBe(valores.length);
      for (const o of opcoes) expect(o.label).toBe(REGISTER_FIX_LABELS[o.value]);
    }
  });

  it("o campo assinalado pelo erro é a primeira sugestão", () => {
    expect(buildRegisterFixOptions(authError("EMAIL_INVALIDO", ["email"]))[0]?.value).toBe("email");
    expect(buildRegisterFixOptions(authError("NOME_EM_FALTA", ["name"]))[0]?.value).toBe("nome");
    expect(buildRegisterFixOptions(authError("PALAVRA_PASSE_EM_FALTA", ["password"]))[0]?.value).toBe("password");
  });

  it("email já registado oferece entrar na conta existente", () => {
    const opcoes = buildRegisterFixOptions(authError("EMAIL_JA_REGISTADO", ["email"]));
    expect(opcoes[0]?.value).toBe("entrar");
    expect(opcoes.map((o) => o.value)).toContain("email");
    // O caminho é a rota real de início de sessão da SPA.
    expect(WIZARD).toContain('go("#/login")');
  });

  it("nenhum outro motivo manda o Dono para o início de sessão", () => {
    for (const code of ["EMAIL_INVALIDO", "NOME_EM_FALTA", "CREDENCIAIS_INVALIDAS"] as AuthErrorCode[]) {
      const valores = buildRegisterFixOptions(authError(code, ["email"])).map((o) => o.value);
      expect(valores, code).not.toContain("entrar");
    }
  });

  it("para onde voltar nunca é decidido por procura de texto na mensagem de erro", () => {
    // Era esta a raiz do problema: uma mensagem com a palavra «email» por
    // acidente mandava o Dono ao passo errado.
    expect(WIZARD).not.toMatch(/reason[^\n]*\.includes\(/);
    expect(WIZARD).not.toMatch(/reason\.toLowerCase\(\)/);
    // A decisão vem do erro estruturado e da escolha do Dono.
    expect(WIZARD).toContain("buildRegisterFixOptions(");
  });
});
