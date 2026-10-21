/**
 * Funcionalidades «Em breve» (`src/services/comingSoon.ts`).
 *
 * Uma só lista, lida por todos os sítios que precisam de saber: o Dashboard
 * (etiqueta e configuração bloqueada), a loja publicada (os pixels de marketing
 * não carregam), a página de preços e o assistente (que tem de dizer a verdade
 * sobre o que existe). Vivia dentro de `web/views/dashboard.ts`, e o assistente
 * repetia a lista à mão — que é exatamente a forma de as duas divergirem.
 *
 * O que se fixa aqui:
 *
 *  1. o **módulo** — bandeiras, rótulos e a lista derivada;
 *  2. **«Em breve» desliga, não apaga** — o saldo de SMS já comprado continua a
 *     ser lido, nunca escrito pelo navegador;
 *  3. **a compra de SMS saiu do servidor** — não há caminho de pagamento de
 *     pacotes de SMS em `api/`;
 *  4. **o checkout conclui a encomenda sem enviar SMS** (R6.6).
 *
 * O Dashboard e o checkout estão a ser refeitos; deles afirma-se só o
 * comportamento exigido (ler a bandeira do módulo, não haver compra de SMS), e
 * não a forma do código.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  COMING_SOON, COMING_SOON_LABELS, comingSoonList, isComingSoon, type ComingSoonFeature,
} from "../src/services/comingSoon.js";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/** Ficheiros `.ts`/`.js`/`.mjs` de uma pasta, recursivamente, menos as excluídas. */
function ficheiros(pasta: string, excluir: readonly string[] = []): string[] {
  const out: string[] = [];
  const andar = (abs: string): void => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const caminho = join(abs, e.name);
      const rel = relative(ROOT, caminho).split(sep).join("/");
      if (excluir.some((x) => rel === x || rel.startsWith(`${x}/`))) continue;
      if (e.isDirectory()) andar(caminho);
      else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(rel);
    }
  };
  andar(join(ROOT, pasta));
  return out.sort();
}

/** Linhas de `ficheiros` que casam com `padrao`, como `ficheiro:linha: texto`. */
function linhasCom(lista: readonly string[], padrao: RegExp): string[] {
  const achados: string[] = [];
  for (const f of lista) {
    ler(f).split(/\r?\n/).forEach((linha, i) => {
      if (padrao.test(linha)) achados.push(`${f}:${i + 1}: ${linha.trim().slice(0, 160)}`);
    });
  }
  return achados;
}

const FEATURES = Object.keys(COMING_SOON) as ComingSoonFeature[];

describe("O módulo «Em breve»", () => {
  it("declara o SMS de confirmação, o domínio próprio e o marketing", () => {
    expect([...FEATURES].sort()).toEqual(["customDomain", "marketing", "sms"]);
  });

  it("as três estão «Em breve» hoje", () => {
    for (const f of FEATURES) expect(isComingSoon(f), f).toBe(true);
  });

  it("isComingSoon é a bandeira, comparada sem coerção", () => {
    for (const f of FEATURES) expect(isComingSoon(f)).toBe(COMING_SOON[f] === true);
  });

  it("toda a funcionalidade tem nome, e só as declaradas têm", () => {
    expect(Object.keys(COMING_SOON_LABELS).sort()).toEqual([...FEATURES].sort());
    for (const f of FEATURES) expect(COMING_SOON_LABELS[f].trim().length, f).toBeGreaterThan(0);
  });

  it("os nomes dizem o que é cada uma, como o Dono a procura", () => {
    expect(COMING_SOON_LABELS.sms).toMatch(/SMS/);
    expect(COMING_SOON_LABELS.customDomain).toMatch(/[Dd]omínio próprio/);
    expect(COMING_SOON_LABELS.marketing).toMatch(/[Pp]ixel/);
  });

  it("comingSoonList devolve os nomes das bloqueadas, pela ordem da declaração", () => {
    expect(comingSoonList()).toEqual(FEATURES.filter(isComingSoon).map((f) => COMING_SOON_LABELS[f]));
  });

  it("comingSoonList devolve uma cópia: mexer-lhe não muda a lista seguinte", () => {
    const primeira = comingSoonList();
    primeira.push("Inventada");
    expect(comingSoonList()).not.toContain("Inventada");
  });
});

describe("«Em breve» desliga, não apaga — o saldo de SMS é lido e nunca escrito", () => {
  const SMS_MODULE = ler("web/supabase/sms.ts");

  it("o módulo de SMS do navegador só lê stores.sms_credits", () => {
    expect(SMS_MODULE).toContain('select("sms_credits")');
    for (const escrita of [".update(", ".insert(", ".upsert(", ".delete("]) {
      expect(SMS_MODULE, `o módulo de SMS não pode escrever (${escrita})`).not.toContain(escrita);
    }
  });

  it("nenhum ficheiro de web/ escreve o saldo de SMS", () => {
    // O gatilho `stores_guard` (0022) repõe `sms_credits` em qualquer escrita
    // do navegador; uma escrita aqui seria uma promessa que a base de dados
    // desfaz em silêncio.
    expect(linhasCom(ficheiros("web", ["web/dist"]), /sms_credits\s*:/)).toEqual([]);
  });
});

describe("A compra de SMS saiu — não há caminho de pagamento de pacotes de SMS", () => {
  const WEB = ficheiros("web", ["web/dist"]);
  /** Funções serverless escritas à mão (o pacote gerado `api/_ssr` fica de fora). */
  const API = ficheiros("api", ["api/_ssr"]);

  it("o checkout de compra de SMS foi apagado e ninguém o abre", () => {
    expect(existsSync(join(ROOT, "web/lib/smsCheckout.ts"))).toBe(false);
    expect(linhasCom(WEB, /openSmsCheckout|SMS_PACKAGES|smsCheckout/)).toEqual([]);
  });

  it("o servidor não conhece um pagamento do tipo «sms»", () => {
    // `api/payment.js` só aceita `kind: "plan"` (subscrição) e `kind: "store"`
    // (encomenda numa loja).
    expect(linhasCom(API, /kind[^\n]{0,24}["'`]sms["'`]|["'`]sms["'`][^\n]{0,24}kind/i)).toEqual([]);
    expect(linhasCom(API, /creditSms|sms_purchases|SMS_PACK/i)).toEqual([]);
  });

  it("os ficheiros do pagamento nem falam de SMS", () => {
    for (const f of ["api/payment.js", "api/payment-status.js", "api/payment-webhook.js", "api/_payments.js", "api/_provider.js"]) {
      expect(ler(f), f).not.toMatch(/sms/i);
    }
  });
});

describe("O Dashboard lê as bandeiras do módulo, não uma cópia", () => {
  /** `web/views/dashboard.ts` e os módulos dos separadores. */
  const DASHBOARD = ["web/views/dashboard.ts", ...ficheiros("web/views/dashboard")];

  it("algum módulo do Dashboard importa COMING_SOON ou isComingSoon de src/services/comingSoon", () => {
    const importa = DASHBOARD.some((f) =>
      /import\s*\{[^}]*\b(COMING_SOON|isComingSoon)\b[^}]*\}\s*from\s*["'][^"']*src\/services\/comingSoon\.js["']/.test(ler(f)));
    expect(importa).toBe(true);
  });

  it("nenhum módulo do Dashboard declara a sua própria lista «Em breve»", () => {
    expect(linhasCom(DASHBOARD, /\b(const|let|var)\s+COMING_SOON\b/)).toEqual([]);
  });
});

/**
 * R6.6 — «o Checkout conclui a encomenda sem enviar SMS de confirmação».
 *
 * Nenhum caminho da Plataforma envia SMS: o SMS de confirmação está «Em breve».
 * O valor destes testes é serem a guarda de que continua assim: se alguém
 * acrescentar um envio ao caminho do checkout, falham aqui.
 */
describe("Checkout conclui a encomenda sem enviar SMS (R6.6)", () => {
  /** Vistas e bibliotecas que compõem o caminho do checkout na SPA. */
  const CHECKOUT_SPA = [
    "web/views/checkout.ts",
    "web/templates/checkoutLayouts.ts",
    "web/lib/cart.ts",
    "web/lib/cartDrawer.ts",
    "web/lib/paymentsApi.ts",
  ].filter((f) => existsSync(join(ROOT, f)));
  /** Funções serverless que fecham a encomenda. */
  const CHECKOUT_SERVIDOR = [
    "api/payment.js",
    "api/payment-status.js",
    "api/payment-webhook.js",
    "api/_payments.js",
    "api/_provider.js",
    "api/_shared.js",
  ];
  const CAMINHO = [...CHECKOUT_SPA, ...CHECKOUT_SERVIDOR];

  /** Nomes que denunciam um envio de mensagem. */
  const ENVIO = /\b(send|dispatch|deliver|notify|enviar|envia)[_-]?sms\b|\bsms[_-]?(send|dispatch|deliver|enviar|message)/i;
  /** Serviços de SMS de terceiros: chegar a um deles é enviar mensagens. */
  const FORNECEDOR = /twilio|vonage|nexmo|messagebird|africa'?stalking|infobip|clickatell|plivo|bulksms|smsgateway/i;

  it("o caminho do checkout existe (a guarda não está a ler ficheiros vazios)", () => {
    expect(CHECKOUT_SPA).toContain("web/views/checkout.ts");
    for (const f of CHECKOUT_SERVIDOR) expect(existsSync(join(ROOT, f)), f).toBe(true);
  });

  it("nenhum ficheiro do caminho invoca um envio de SMS", () => {
    expect(linhasCom(CAMINHO, ENVIO)).toEqual([]);
  });

  it("nenhum ficheiro do caminho fala com um serviço de SMS de terceiros", () => {
    expect(linhasCom(CAMINHO, FORNECEDOR)).toEqual([]);
  });

  it("nenhuma linha que mencione SMS faz uma chamada de rede", () => {
    const infratores = linhasCom(CAMINHO, /sms/i).filter((l) => /\bfetch\s*\(|\baxios\b|https?:\/\//i.test(l));
    expect(infratores).toEqual([]);
  });

  it("o checkout da SPA não importa o módulo de SMS", () => {
    for (const f of CHECKOUT_SPA) {
      expect(ler(f), `${f} importa o módulo de saldo de SMS`).not.toContain("supabase/sms.js");
    }
  });
});
