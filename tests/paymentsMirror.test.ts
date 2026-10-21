/**
 * Guarda: o espelho de pagamentos, a marca de demonstração e a MoMenu saíram —
 * e não voltam.
 *
 * Durante muito tempo, o checkout decidia se mostrava Multicaixa Express e
 * Referência Bancária a partir de `customization.payments.onlineEnabled`, um
 * **espelho** que o próprio Dono escrevia na sua Personalização, e de uma marca
 * de demonstração (`__demoPayments`). O servidor decidia por outra coluna. Os
 * dois divergiram, e o resultado confirmado em produção foi um checkout a
 * anunciar pagamentos que o servidor recusava.
 *
 * A correção não foi sincronizar o espelho: foi apagá-lo. Quem decide agora é
 * `digitalPaymentsVisible(store)` (`src/services/paymentVisibility.ts`), a partir
 * de `stores.digital_payments`, que só a aprovação da verificação de empresa
 * liga. A integração MoMenu saiu com ele, e o fornecedor novo liga-se num só
 * sítio (`api/_provider.js`).
 *
 * Esta guarda percorre **todos** os ficheiros de `web/` (menos `web/dist`, que é
 * gerado) e de `api/`: nenhum pode voltar a nomear o espelho, a marca, as
 * decisões antigas ou a MoMenu. E confirma que os ficheiros apagados continuam
 * apagados — um `api/webhook.js` esquecido era um endpoint público que marcava
 * encomendas como pagas sem verificar quem pedia.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..");

/** Extensões de código e texto que a guarda lê (nunca `.env`: tem segredos). */
const EXTENSOES = /\.(ts|js|mjs|cjs|html|css|json)$/i;

/** Todos os ficheiros de texto de uma pasta, recursivamente, menos as excluídas. */
function ficheiros(pasta: string, excluir: readonly string[] = []): string[] {
  const out: string[] = [];
  const andar = (abs: string): void => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const caminho = join(abs, e.name);
      const rel = relative(ROOT, caminho).split(sep).join("/");
      if (excluir.some((x) => rel === x || rel.startsWith(`${x}/`))) continue;
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        andar(caminho);
      } else if (EXTENSOES.test(e.name)) {
        out.push(rel);
      }
    }
  };
  andar(join(ROOT, pasta));
  return out.sort();
}

const ALVOS = [...ficheiros("web", ["web/dist"]), ...ficheiros("api")];

/**
 * O ficheiro com os **comentários apagados** (substituídos por espaços, para as
 * linhas continuarem a ser as mesmas).
 *
 * A guarda é sobre o que o programa **faz**, não sobre o que os comentários
 * contam. Um módulo que explica porque é que o espelho foi apagado — e o que
 * aconteceu em produção enquanto existiu — é documentação que vale a pena ter; o
 * defeito era o código ler a bandeira. Sem esta distinção, a guarda obrigava a
 * apagar a história junto com o código, e a próxima pessoa a mexer nos
 * pagamentos voltava a inventar o mesmo espelho por não saber que já tinha
 * falhado.
 *
 * As cadeias de texto são atravessadas sem serem interpretadas, para um `//`
 * dentro de um URL (`"https://…"`) não passar por início de comentário.
 */
function semComentarios(texto: string): string {
  let out = "";
  let i = 0;
  const vazio = (s: string): string => s.replace(/[^\n]/g, " ");
  while (i < texto.length) {
    const c = texto[i]!;
    const d = texto[i + 1];
    if (c === "/" && d === "*") {
      const fim = texto.indexOf("*/", i + 2);
      const bloco = fim < 0 ? texto.slice(i) : texto.slice(i, fim + 2);
      out += vazio(bloco);
      i += bloco.length;
    } else if (c === "/" && d === "/") {
      const fim = texto.indexOf("\n", i);
      const linha = fim < 0 ? texto.slice(i) : texto.slice(i, fim);
      out += vazio(linha);
      i += linha.length;
    } else if (c === '"' || c === "'" || c === "`") {
      // Atravessa a cadeia inteira (com escapes) e copia-a tal como está.
      let j = i + 1;
      while (j < texto.length && texto[j] !== c) {
        if (texto[j] === "\\") j += 1;
        j += 1;
      }
      out += texto.slice(i, Math.min(j + 1, texto.length));
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Ocorrências de `padrao` no **código** de cada ficheiro, como `ficheiro:linha: texto`. */
function ocorrencias(padrao: RegExp, opts: { comentarios?: boolean } = {}): string[] {
  const achados: string[] = [];
  for (const f of ALVOS) {
    const bruto = readFileSync(join(ROOT, f), "utf8");
    const texto = opts.comentarios === true ? bruto : semComentarios(bruto);
    texto.split(/\r?\n/).forEach((linha, i) => {
      if (padrao.test(linha)) achados.push(`${f}:${i + 1}: ${linha.trim().slice(0, 160)}`);
    });
  }
  return achados;
}

describe("A guarda lê o que diz que lê", () => {
  it("percorre web/ e api/, e deixa web/dist de fora", () => {
    expect(ALVOS).toContain("web/main.ts");
    expect(ALVOS).toContain("api/payment.js");
    expect(ALVOS.some((f) => f.startsWith("web/dist/"))).toBe(false);
    expect(ALVOS.some((f) => /(^|\/)\.env/.test(f))).toBe(false);
  });
});

describe("Nenhum código de web/ nem de api/ lê o que saiu", () => {
  // Os comentários podem (e devem) contar a história: o que falhou em produção
  // enquanto o espelho existiu é a razão de ele não voltar. O que a guarda
  // recusa é o programa a lê-lo — incluindo dentro de uma cadeia de texto, que
  // é a forma como uma coluna chega a um pedido ao Supabase.
  const PROIBIDOS: readonly [string, RegExp][] = [
    ["o espelho customization.payments.onlineEnabled", /onlineEnabled/i],
    ["a marca de demonstração __demoPayments", /__demoPayments/i],
    ["a decisão antiga isPaymentsDemo", /isPaymentsDemo/i],
    ["a decisão antiga onlinePaymentsVisible", /onlinePaymentsVisible/i],
    ["a integração MoMenu", /momenu/i],
  ];

  for (const [nome, padrao] of PROIBIDOS) {
    it(`ninguém nomeia ${nome}`, () => {
      expect(ocorrencias(padrao)).toEqual([]);
    });
  }

  it("nenhum pedido nomeia uma coluna que a base de dados já largou", () => {
    // Um `select`, `insert` ou `update` com uma coluna inexistente falha o
    // pedido inteiro — não devolve as outras colunas a `null`. A 0023 largou as
    // três primeiras; a 0019, as duas últimas.
    expect(ocorrencias(/\b(online_enabled|momenu_api_key|plan_stores|trial_ends_at|next_plan)\b/)).toEqual([]);
  });
});

describe("Os ficheiros apagados continuam apagados", () => {
  const APAGADOS = [
    // O webhook da MoMenu aceitava qualquer POST: bastava conhecer o
    // `transactionId`, que o próprio comprador recebia.
    "api/webhook.js",
    "api/logo.js",
    "web/lib/logoApi.ts",
    "web/lib/logoCompose.ts",
    "web/lib/logoPurchase.ts",
    "web/lib/smsCheckout.ts",
  ];

  for (const f of APAGADOS) {
    it(`${f} não existe`, () => {
      expect(existsSync(join(ROOT, f))).toBe(false);
    });
  }

  it("nada importa nem chama o que foi apagado", () => {
    expect(ocorrencias(/logoApi|logoCompose|logoPurchase|smsCheckout|\/api\/webhook\b|\/api\/logo\b/)).toEqual([]);
  });

  it("o vercel.json não reescreve para os endpoints apagados", () => {
    const vercel = readFileSync(join(ROOT, "vercel.json"), "utf8");
    expect(vercel).not.toMatch(/\/api\/(webhook|logo)\b/);
  });
});
