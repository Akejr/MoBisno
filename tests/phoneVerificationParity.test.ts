/**
 * O servidor da confirmação por SMS usa as mesmas regras do domínio — e não
 * guarda o que não deve.
 *
 * `api/` é JavaScript simples e não pode importar `src/`: os números e o texto
 * da mensagem estão repetidos em `api/phone-verify.js` e `api/_nsangu.js`. Duas
 * cópias divergem em silêncio, e a divergência aqui é particularmente má: o ecrã
 * oferecia um reenvio aos 20 s que o servidor recusava, ou prometia dez minutos
 * a um código que já tinha morrido.
 *
 * Os especificadores ficam em constantes de propósito: com eles literais, o
 * `tsc` seguia-os e compilava `api/` dentro do programa de `tests/`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PHONE_CODE_LENGTH, PHONE_CODE_TTL_MS, PHONE_MAX_ATTEMPTS, PHONE_MAX_SENDS,
  PHONE_MAX_SENDS_PER_HOUR, PHONE_RESEND_DELAYS_MS, PHONE_SENDS_WINDOW_MS, phoneCodeMessage,
} from "../src/services/phoneVerification.js";

const ROOT = join(__dirname, "..");
const ENDPOINT = readFileSync(join(ROOT, "api/phone-verify.js"), "utf8");
const PROVEDOR = readFileSync(join(ROOT, "api/_nsangu.js"), "utf8");

/**
 * O ficheiro sem comentários. A história pode (e deve) nomear o que não se faz
 * — «`randomInt` e não `Math.random()`» —; o que corre é que não pode.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const ENDPOINT_CODIGO = semComentarios(ENDPOINT);
const PROVEDOR_CODIGO = semComentarios(PROVEDOR);

const ESP_NSANGU = "../api/_nsangu.js";
const nsangu = (await import(ESP_NSANGU)) as { phoneCodeMessage(code: string): string };

/** Valor de uma constante `const NOME = <número>;` no texto do endpoint. */
function numero(nome: string): number {
  const m = new RegExp(`const ${nome} = ([^;]+);`).exec(ENDPOINT);
  expect(m, `${nome} não encontrada em api/phone-verify.js`).not.toBeNull();
  // As declarações são expressões aritméticas simples (`10 * 60 * 1000`), com
  // separadores de milhares do JavaScript (`20_000`).
  const expressao = (m?.[1] ?? "0").replace(/_/g, "").trim();
  expect(expressao, `${nome} não é uma expressão aritmética simples`).toMatch(/^[\d\s*+.]+$/);
  return Number(new Function(`return (${expressao});`)());
}

describe("Os números do servidor são os do domínio", () => {
  it("o tamanho do código e a validade", () => {
    expect(numero("CODE_LENGTH")).toBe(PHONE_CODE_LENGTH);
    expect(numero("CODE_TTL_MS")).toBe(PHONE_CODE_TTL_MS);
  });

  it("as esperas dos reenvios, pela mesma ordem", () => {
    const m = /const RESEND_DELAYS_MS = \[([^\]]+)\]/.exec(ENDPOINT);
    expect(m, "RESEND_DELAYS_MS não encontrada em api/phone-verify.js").not.toBeNull();
    const valores = (m?.[1] ?? "").split(",").map((v) => Number(v.replace(/_/g, "").trim()));
    expect(valores).toEqual([...PHONE_RESEND_DELAYS_MS]);
  });

  it("o total de envios deriva das esperas, nas duas pontas", () => {
    // Escrito à mão, ficava a dizer «3» no dia em que houvesse três reenvios.
    expect(ENDPOINT).toContain("const MAX_SENDS = RESEND_DELAYS_MS.length + 1;");
    const m = /const RESEND_DELAYS_MS = \[([^\]]+)\]/.exec(ENDPOINT);
    const quantas = (m?.[1] ?? "").split(",").filter((v) => v.trim()).length;
    expect(quantas + 1).toBe(PHONE_MAX_SENDS);
  });

  it("as tentativas e os tetos por hora", () => {
    expect(numero("MAX_ATTEMPTS")).toBe(PHONE_MAX_ATTEMPTS);
    expect(numero("MAX_SENDS_PER_HOUR")).toBe(PHONE_MAX_SENDS_PER_HOUR);
    expect(numero("SENDS_WINDOW_MS")).toBe(PHONE_SENDS_WINDOW_MS);
  });

  it("o texto da SMS é o mesmo, palavra por palavra", () => {
    for (const code of ["123456", "000000", "482913"]) {
      expect(nsangu.phoneCodeMessage(code)).toBe(phoneCodeMessage(code));
    }
  });

  it("há um teto global, acima do teto de uma conta", () => {
    // Os tetos por conta não travam quem cria contas em série; criar conta não
    // custa nada a ninguém, e as SMS custam-nos dinheiro.
    const global = numero("MAX_SENDS_PER_HOUR_GLOBAL");
    expect(global).toBeGreaterThan(PHONE_MAX_SENDS_PER_HOUR);
    expect(ENDPOINT).toContain("sendsInWindow(db, null, desde) >= MAX_SENDS_PER_HOUR_GLOBAL");
  });
});

describe("O código nunca fica legível, e a chave nunca sai", () => {
  it("o que é gravado é um SHA-256 salgado com o id do desafio", () => {
    expect(ENDPOINT).toContain('createHash("sha256")');
    expect(ENDPOINT).toContain("`${id}:${code}`");
    // Nunca uma coluna com o código em claro.
    expect(ENDPOINT).not.toMatch(/code:\s*code/);
    expect(ENDPOINT).not.toMatch(/\bcode_plain\b|\bcodigo\b\s*:/);
  });

  it("a comparação é em tempo constante", () => {
    // Uma comparação com `===` denuncia quantos algarismos estão certos pelo
    // tempo de resposta.
    expect(ENDPOINT).toContain("timingSafeEqual");
    expect(ENDPOINT).toContain("function sameHash(");
  });

  it("o código vem de aleatoriedade criptográfica, não de Math.random", () => {
    expect(ENDPOINT).toContain("randomInt");
    expect(ENDPOINT_CODIGO).not.toContain("Math.random");
  });

  it("nem o código nem a chave de API aparecem em registos", () => {
    // O que nunca pode entrar num registo é o **valor**: o código escrito, ou a
    // chave lida da variável de ambiente. Nomear a variável que falta («falta
    // NSANGU_API_KEY») é precisamente o que torna o registo útil.
    const logs = [...ENDPOINT_CODIGO.matchAll(/console\.(log|warn|error)\(([^;]*)\)/g)].map((m) => m[2] ?? "");
    for (const linha of logs) {
      expect(linha, `registo com o código: ${linha}`).not.toMatch(/\bcode\b|code_hash/);
    }
    for (const fonte of [ENDPOINT_CODIGO, PROVEDOR_CODIGO]) {
      const dela = [...fonte.matchAll(/console\.(log|warn|error)\(([^;]*)\)/g)].map((m) => m[2] ?? "");
      for (const linha of dela) {
        expect(linha, `registo com a chave: ${linha}`).not.toMatch(/process\.env\.NSANGU_API_KEY|Bearer|headers/);
      }
    }
  });

  it("o Dono vem do token da sessão, nunca do corpo do pedido", () => {
    expect(ENDPOINT).toContain("userFromRequest(db, req)");
    expect(ENDPOINT).not.toMatch(/body\.ownerId/);
  });
});

describe("O que o fornecedor exige", () => {
  it("cada envio leva uma Idempotency-Key, e cada reenvio leva a sua", () => {
    // Sem a chave, a resposta é 400. Com a MESMA chave, um reenvio não enviava
    // nada: a Nsangu devolvia a primeira mensagem.
    expect(PROVEDOR).toContain('"Idempotency-Key"');
    expect(ENDPOINT).toContain("idempotencyKey: `mb-otp-${id}-${sends}`");
  });

  it("a categoria é OTP: o texto não fica guardado no fornecedor", () => {
    expect(PROVEDOR).toContain('category: "OTP"');
  });

  it("o número vai sem separadores, que o fornecedor recusa", () => {
    expect(PROVEDOR).toContain("function toRecipient(");
    expect(PROVEDOR).toContain('replace(/\\D/g, "")');
  });

  it("os erros são tratados pelo código, não pelo texto em português", () => {
    // A documentação do fornecedor avisa que `title` e `detail` podem mudar.
    expect(PROVEDOR).toContain("body?.code");
    expect(PROVEDOR).not.toMatch(/body\??\.(title|detail)\s*(===|\.includes)/);
    for (const codigo of ["insufficient_balance", "validation_error", "unauthorized", "idempotency_conflict"]) {
      expect(PROVEDOR, `erro não tratado: ${codigo}`).toContain(codigo);
    }
  });

  it("sem remetente próprio no pedido: sai o do projeto, e a resposta diz qual foi", () => {
    // Em rede Movicel o fornecedor entrega com um código curto numérico; fixar
    // um `from` aqui era arriscar `sender_not_allowed` nessa rede.
    expect(PROVEDOR).not.toMatch(/from:\s*"/);
    expect(PROVEDOR).toContain("from: body.from");
  });

  it("nenhuma falha de SMS rebenta: as funções devolvem um resultado", () => {
    expect(PROVEDOR).toContain("export async function sendPhoneCode(");
    expect(PROVEDOR).toContain('code: "PROVIDER_UNREACHABLE"');
    expect(PROVEDOR).toContain('code: "SMS_NOT_CONFIGURED"');
    // Um envio que não saiu não conta para o teto: era castigar quem não
    // recebeu nada.
    expect(ENDPOINT).toContain('.update({ sends: sends - 1 })');
  });
});

describe("Falhar sem prender ninguém", () => {
  it("o serviço indisponível é dito, e o Dono pode seguir", () => {
    expect(ENDPOINT).toContain('"SMS_UNAVAILABLE"');
    expect(ENDPOINT).toMatch(/confirmar o número mais tarde/);
    // As quatro falhas que não são culpa de quem se registou caem todas no
    // mesmo caminho: dizer a verdade e deixar seguir.
    for (const codigo of ["SMS_NOT_CONFIGURED", "NO_BALANCE", "PROVIDER_AUTH", "PROVIDER_UNREACHABLE"]) {
      expect(ENDPOINT, `falha não tratada como «segue sem confirmar»: ${codigo}`).toContain(codigo);
    }
  });

  it("confirmar o que já está confirmado não gasta uma SMS", () => {
    expect(ENDPOINT).toContain("alreadyVerified(db, ownerId)");
    expect(ENDPOINT).toContain("alreadyVerified: true");
  });

  it("a confirmação escreve as duas colunas do perfil, e nada mais", () => {
    const m = /\.update\(\{ phone: desafio\.phone, phone_verified_at: agora \}\)/.exec(ENDPOINT);
    expect(m, "a confirmação não grava o número e a data").not.toBeNull();
  });

  it("a linha de `profiles` é garantida antes de lhe escrever", () => {
    /*
     * O 500 que apareceu no primeiro teste a sério: a linha de `profiles` é
     * gravada pelo navegador depois do registo, sem verificar o resultado, e o
     * pedido do código chega logo a seguir. A chave estrangeira do desafio
     * apontava para `profiles` e falhava; hoje aponta para `auth.users`
     * (migração 0027) e o perfil é garantido aqui.
     */
    expect(ENDPOINT).toContain("async function ensureProfile(db, user)");
    expect(ENDPOINT).toContain("ignoreDuplicates: true");
    // A ordem conta, e mede-se dentro do `handler`: a definição de `doSend`
    // aparece antes dele no ficheiro, e comparar posições no texto todo dava
    // uma asserção que passava por acidente.
    const handler = ENDPOINT.slice(ENDPOINT.indexOf("export default async function handler"));
    const garante = handler.indexOf("await ensureProfile(db, user);");
    const despacha = handler.indexOf('action === "send" ? await doSend(');
    expect(garante, "o perfil não é garantido no handler").toBeGreaterThan(-1);
    expect(despacha, "o despacho das ações não foi encontrado").toBeGreaterThan(-1);
    expect(garante, "o perfil é garantido depois das escritas").toBeLessThan(despacha);
  });

  it("uma confirmação que não encontre linha nenhuma não diz «feito»", () => {
    // Um `update` sem linhas não é erro para o Postgres: sem o `select`, o ecrã
    // dizia «número confirmado» e o Dono continuava sem poder publicar.
    expect(ENDPOINT).toContain('.select("phone_verified_at")');
    expect(ENDPOINT).toContain("if (error || !(data ?? []).length)");
  });

  it("uma falha da base de dados diz a causa, em vez de «não foi possível»", () => {
    // Uma definição só, em `api/_shared.js`, partilhada com os pagamentos: a
    // mesma falha tem de dar a mesma frase nos dois sítios.
    expect(ENDPOINT).toContain("const causa = dbCause;");
    expect(readFileSync(join(ROOT, "api/_shared.js"), "utf8")).toContain("export function dbCause(error)");
    const quantas = [...ENDPOINT.matchAll(/causa\(error\)/g)].length;
    expect(quantas, "há falhas de gravação sem causa na resposta").toBeGreaterThanOrEqual(4);
  });
});
