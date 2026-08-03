/**
 * Guardas das funcionalidades «Em breve» — SMS de confirmação e domínio próprio (R6).
 *
 * A decisão D6 do design escolheu **desativar sem apagar**: uma constante
 * `COMING_SOON` no Painel_Do_Dono, a etiqueta «Em breve» nas duas secções e uma
 * devolução antecipada nos três manipuladores (comprar créditos, ativar SMS,
 * guardar domínio). O saldo de `stores.sms_credits` continua a ser lido e nunca
 * escrito pelo Painel_Do_Dono.
 *
 * As asserções são sobre o **texto-fonte** e não sobre o DOM gerado:
 * `web/views/dashboard.ts` depende do DOM e `tests/` compila com `lib: ["ES2022"]`,
 * sem DOM, por isso o módulo não pode ser importado. É o mesmo padrão
 * `readFileSync` de `tests/seoInfra.test.ts` e de `tests/lumiereFooter.test.ts`.
 *
 * Nota sobre a etiqueta: o literal «Em breve» aparece em vários sítios de
 * `dashboard.ts`, incluindo num `stub()` anterior a esta spec que nada tem a ver
 * com R6. Contar ocorrências seria frágil, por isso as asserções incidem no que é
 * específico de R6: a constante, as duas bandeiras e a passagem de `comingSoon:`
 * aos acordeões de SMS e de Domínio.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const DASHBOARD = ler("web/views/dashboard.ts");
const SMS_MODULE = ler("web/supabase/sms.ts");
const SHARED = ler("api/_shared.js");

/**
 * Recorta o texto entre dois marcadores. Falha com mensagem útil se algum
 * marcador desaparecer — sem isto, um bloco renomeado passaria por «não tem
 * envio de SMS» simplesmente por não ter sido encontrado.
 */
function trecho(texto: string, inicio: string, fim: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `marcador inicial não encontrado: ${inicio}`).toBeGreaterThan(-1);
  const j = texto.indexOf(fim, i + inicio.length);
  expect(j, `marcador final não encontrado: ${fim}`).toBeGreaterThan(i);
  return texto.slice(i, j);
}

describe("«Em breve» — etiquetas das duas funcionalidades (R6.1, R6.4)", () => {
  it("a constante COMING_SOON declara as duas bandeiras a true", () => {
    expect(DASHBOARD).toMatch(/const COMING_SOON\s*=\s*\{\s*sms:\s*true\s*,\s*customDomain:\s*true\s*\}/);
  });

  it("a etiqueta partilhada tem o texto literal «Em breve»", () => {
    const badge = trecho(DASHBOARD, "function comingSoonBadge()", "\nfunction comingSoonNotice");
    expect(badge).toContain("Em breve");
  });

  it("o acordeão de Configurações sabe desenhar a etiqueta", () => {
    const acordeao = trecho(DASHBOARD, "function settingsAccordion(", "\nfunction areaRowHtml");
    expect(acordeao).toContain("comingSoon?: boolean");
    expect(acordeao).toContain("o.comingSoon ? comingSoonBadge()");
  });

  it("a secção «SMS de confirmação» recebe a etiqueta a partir de COMING_SOON.sms", () => {
    expect(DASHBOARD).toMatch(/const smsSoon\s*=\s*COMING_SOON\.sms/);
    const chamada = trecho(DASHBOARD, 'title: "SMS de confirmação"', "})}");
    expect(chamada).toContain("comingSoon: smsSoon");
  });

  it("a secção «Domínio» recebe a etiqueta a partir de COMING_SOON.customDomain", () => {
    expect(DASHBOARD).toMatch(/const domainSoon\s*=\s*COMING_SOON\.customDomain/);
    const chamada = trecho(DASHBOARD, 'title: "Domínio"', "})}");
    expect(chamada).toContain("comingSoon: domainSoon");
  });
});

describe("«Em breve» — as três devoluções antecipadas (R6.2, R6.3, R6.5)", () => {
  /** Guarda com aviso ao Dono e `return` antes de qualquer efeito. */
  const guardaSms = /if \(COMING_SOON\.sms\)\s*\{[^}]*toast\([^)]*\)[^}]*return;\s*\}/;
  const guardaDominio = /if \(COMING_SOON\.customDomain\)\s*\{[^}]*toast\([^)]*\)[^}]*return;\s*\}/;

  it("comprar créditos de SMS devolve antes de abrir o checkout de SMS (R6.2)", () => {
    const bloco = trecho(DASHBOARD, '[data-sms-pack]"', "// Código de desconto");
    expect(bloco).toMatch(guardaSms);
    // A ordem é o que importa: a guarda tem de vir antes de `openSmsCheckout`,
    // senão o diálogo de pagamento abre mesmo com a bandeira a `true`.
    expect(bloco.search(guardaSms)).toBeLessThan(bloco.indexOf("openSmsCheckout("));
  });

  it("ativar o SMS devolve antes de escrever c.sms e antes de guardar (R6.3)", () => {
    const bloco = trecho(DASHBOARD, '$("#save-sms")?.addEventListener', '[data-sms-pack]"');
    expect(bloco).toMatch(guardaSms);
    expect(bloco.search(guardaSms)).toBeLessThan(bloco.indexOf("c.sms ="));
    expect(bloco.search(guardaSms)).toBeLessThan(bloco.indexOf("saveCustomization("));
  });

  it("guardar o domínio devolve antes de escrever c.customDomain e antes de guardar (R6.5)", () => {
    const bloco = trecho(DASHBOARD, '$("#save-domain")?.addEventListener', '$("#delete-store")');
    expect(bloco).toMatch(guardaDominio);
    expect(bloco.search(guardaDominio)).toBeLessThan(bloco.indexOf("c.customDomain ="));
    expect(bloco.search(guardaDominio)).toBeLessThan(bloco.indexOf("saveCustomization("));
  });
});

describe("«Em breve» — o saldo de SMS é lido e nunca escrito (R6.7, R6.8)", () => {
  it("o Painel_Do_Dono continua a ler o saldo para o apresentar", () => {
    expect(DASHBOARD).toContain("getSmsCredits(store!.id)");
    expect(DASHBOARD).toContain("${smsCredits} SMS");
  });

  it("o módulo de SMS do cliente só lê stores.sms_credits", () => {
    expect(SMS_MODULE).toContain('select("sms_credits")');
    for (const escrita of [".update(", ".insert(", ".upsert(", ".delete("]) {
      expect(SMS_MODULE, `o módulo de SMS não pode escrever (${escrita})`).not.toContain(escrita);
    }
  });
});

/**
 * R6.6 — «o Checkout conclui a encomenda sem enviar SMS de confirmação».
 *
 * Isto **já é verdade** na linha de base: a leitura do código confirma que não
 * existe envio de SMS em nenhum caminho da Plataforma. `api/_shared.js` apenas
 * credita saldo (`creditSms`) depois de um pagamento confirmado, e `api/payment.js`,
 * `api/webhook.js` e `api/payment-status.js` só tocam em SMS para registar a
 * compra de créditos. O valor destes testes é serem a guarda de que continua
 * assim: se alguém acrescentar envio ao caminho do Checkout, falham aqui.
 */
describe("Checkout conclui a encomenda sem enviar SMS (R6.6)", () => {
  /** Vistas e bibliotecas que compõem o caminho do Checkout na SPA. */
  const CHECKOUT_SPA = [
    "web/views/checkout.ts",
    "web/templates/checkoutLayouts.ts",
    "web/lib/cart.ts",
    "web/lib/cartDrawer.ts",
    "web/lib/paymentsApi.ts",
  ];
  /** Funções serverless que fecham a encomenda depois do pagamento. */
  const CHECKOUT_SERVIDOR = [
    "api/payment.js",
    "api/payment-status.js",
    "api/webhook.js",
    "api/_shared.js",
  ];
  const CAMINHO = [...CHECKOUT_SPA, ...CHECKOUT_SERVIDOR].map((f) => ({ f, texto: ler(f) }));

  /** Nomes que denunciam um envio de mensagem. */
  const ENVIO = /\b(send|dispatch|deliver|notify|enviar|envia)[_-]?sms\b|\bsms[_-]?(send|dispatch|deliver|enviar|message)/i;
  /** Serviços de SMS de terceiros: chegar a um deles é enviar mensagens. */
  const FORNECEDOR = /twilio|vonage|nexmo|messagebird|africa'?stalking|infobip|clickatell|plivo|bulksms|smsgateway/i;

  it("nenhum ficheiro do caminho invoca um envio de SMS", () => {
    const infratores: string[] = [];
    for (const { f, texto } of CAMINHO) {
      texto.split("\n").forEach((linha, i) => {
        if (ENVIO.test(linha)) infratores.push(`${f}:${i + 1}: ${linha.trim()}`);
      });
    }
    expect(infratores).toEqual([]);
  });

  it("nenhum ficheiro do caminho fala com um serviço de SMS de terceiros", () => {
    const infratores: string[] = [];
    for (const { f, texto } of CAMINHO) {
      texto.split("\n").forEach((linha, i) => {
        if (FORNECEDOR.test(linha)) infratores.push(`${f}:${i + 1}: ${linha.trim()}`);
      });
    }
    expect(infratores).toEqual([]);
  });

  it("nenhuma linha que mencione SMS faz uma chamada de rede", () => {
    // Um envio precisa de sair da Plataforma. Todas as linhas de SMS que existem
    // hoje são consultas ao Supabase (`sms_purchases`, `sms_credits`); nenhuma
    // abre um pedido HTTP.
    const infratores: string[] = [];
    for (const { f, texto } of CAMINHO) {
      texto.split("\n").forEach((linha, i) => {
        if (!/sms/i.test(linha)) return;
        if (/\bfetch\s*\(|\baxios\b|https?:\/\//i.test(linha)) infratores.push(`${f}:${i + 1}: ${linha.trim()}`);
      });
    }
    expect(infratores).toEqual([]);
  });

  it("o Checkout da SPA não importa sequer o módulo de SMS", () => {
    for (const f of CHECKOUT_SPA) {
      const texto = ler(f);
      expect(texto, `${f} importa o módulo de saldo de SMS`).not.toContain("supabase/sms.js");
      expect(texto, `${f} importa o checkout de compra de SMS`).not.toContain("smsCheckout.js");
    }
  });

  it("creditSms apenas soma ao saldo: não envia nada e não gasta saldo", () => {
    const bloco = trecho(SHARED, "export async function creditSms", "\nexport ");
    expect(bloco).toContain("sms_credits: cur + qty");
    expect(bloco).not.toContain("fetch(");
    // Gastar saldo é o efeito colateral de um envio; se aparecer, houve envio.
    expect(bloco).not.toMatch(/sms_credits:\s*(cur\s*-|Math\.max)/);
  });
});
