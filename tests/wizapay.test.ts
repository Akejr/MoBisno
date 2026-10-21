/**
 * Formatos e regras dos dois fornecedores do fluxo de pagamento: a **Wiza**
 * (cobrança) e o **Vero** (factura).
 *
 * Estes exemplos ficam nas funções puras — as que transformam um valor nosso no
 * formato que a API do outro lado exige. É aí que um pagamento se perde sem
 * ninguém perceber: um montante com três casas decimais, um telemóvel com o
 * indicativo colado, Kwanzas enviados onde se esperavam cêntimos. A chamada em
 * si não se testa aqui (é rede), mas o que entra nela, sim.
 *
 * Há também duas guardas sobre o texto dos módulos, e ambas vêm do guia de
 * integração: a Wiza responde **303 sem corpo** (seguir o redireccionamento
 * perde o `id` e com ele a única forma de confirmar o pagamento), e o Vero
 * **calcula o IVA a partir do código de isenção** — enviar `taxRate` faz o
 * documento ser recusado pela AGT.
 *
 * ## Como se chega aos módulos
 *
 * `api/` está fora do `include` do `tsconfig.json`: `await import()` com o
 * especificador **numa constante**, como em `tests/serverOrder.test.ts`. A
 * forma de cada módulo é declarada à mão pelo mesmo motivo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIN_PAYMENT_KZ } from "../src/services/payments.js";

const ESPECIFICADOR_WIZA = "../api/_wizapay.js";
const ESPECIFICADOR_VERO = "../api/_vero.js";

interface ApiWiza {
  MIN_PAYMENT_KZ: number;
  STATUS_WINDOW_MS: number;
  wizaConfigured(): boolean;
  wizaAmount(kz: unknown): string | null;
  wizaPhone(raw: unknown): string | null;
  methodFromService(service: unknown): string | null;
  wizaStatusMessage(code: unknown): string | null;
  WIZA_STATUS_MESSAGES: Record<string, string | null>;
}

interface ApiVero {
  TAX_EXEMPTION_CODE: string;
  veroUsable(creds: unknown): boolean;
  veroIsTestKey(apiKey: unknown): boolean;
  toCents(kz: unknown): number;
  veroPdfUrl(invoiceId: unknown): string;
}

const wiza = (await import(ESPECIFICADOR_WIZA)) as unknown as ApiWiza;
const vero = (await import(ESPECIFICADOR_VERO)) as unknown as ApiVero;

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/* ================================= Wiza ================================== */

describe("wizaAmount — string com duas casas, ou nada", () => {
  it("formata um valor em Kz como a Wiza o quer", () => {
    expect(wiza.wizaAmount(50_000)).toBe("50000.00");
    expect(wiza.wizaAmount(2500)).toBe("2500.00");
    expect(wiza.wizaAmount(1234.5)).toBe("1234.50");
    expect(wiza.wizaAmount(0.99)).toBe("0.99");
  });

  it("arredonda ao cêntimo em vez de enviar três casas", () => {
    expect(wiza.wizaAmount(7350.555)).toBe("7350.56");
    expect(wiza.wizaAmount(1 / 3)).toBe("0.33");
  });

  it("recusa o que não é um montante: a cobrança não chega a ser criada", () => {
    for (const lixo of [0, -1, -2500, NaN, Infinity, null, undefined, "", "abc", {}, []]) {
      expect(wiza.wizaAmount(lixo), String(lixo)).toBeNull();
    }
  });
});

describe("wizaPhone — nove algarismos, sem indicativo", () => {
  it("aceita os três formatos que o cliente escreve", () => {
    expect(wiza.wizaPhone("923456789")).toBe("923456789");
    expect(wiza.wizaPhone("+244 923 456 789")).toBe("923456789");
    expect(wiza.wizaPhone("244923456789")).toBe("923456789");
    expect(wiza.wizaPhone("(+244) 923-456-789")).toBe("923456789");
  });

  it("recusa o que não é um telemóvel angolano", () => {
    // O primeiro algarismo tem de ser 9: um fixo não recebe Multicaixa Express.
    for (const lixo of ["823456789", "92345678", "9234567890", "244823456789", "", null, undefined, "abc"]) {
      expect(wiza.wizaPhone(lixo), String(lixo)).toBeNull();
    }
  });
});

describe("methodFromService — o nome da Wiza para o nosso", () => {
  it("gpo é Multicaixa Express e reference é Referência Bancária", () => {
    // É o `service` da resposta que diz o que o cliente escolheu no checkout
    // alojado: o nosso lado não sabe antes.
    expect(wiza.methodFromService("gpo")).toBe("mcx");
    expect(wiza.methodFromService("reference")).toBe("reference");
  });

  it("um serviço desconhecido não vira um método inventado", () => {
    for (const outro of ["express", "mcx", "GPO", "", null, undefined, 1]) {
      expect(wiza.methodFromService(outro), String(outro)).toBeNull();
    }
  });
});

describe("wizaStatusMessage — o código vira uma frase, ou uma genérica", () => {
  it("o sucesso não tem frase de erro", () => {
    expect(wiza.wizaStatusMessage(2000)).toBeNull();
  });

  it("cada código conhecido tem a sua frase, em português", () => {
    for (const [codigo, frase] of Object.entries(wiza.WIZA_STATUS_MESSAGES)) {
      if (frase === null) continue;
      expect(wiza.wizaStatusMessage(Number(codigo)), `código ${codigo}`).toBe(frase);
      expect(frase.length, `código ${codigo} sem frase`).toBeGreaterThan(0);
    }
  });

  it("um código desconhecido dá uma frase e nunca o código cru", () => {
    // O cliente não pode ver «4203» no ecrã.
    for (const desconhecido of [9999, "abc", null, undefined, {}]) {
      const frase = wiza.wizaStatusMessage(desconhecido);
      expect(typeof frase, String(desconhecido)).toBe("string");
      expect(frase, String(desconhecido)).not.toContain(String(desconhecido));
    }
  });
});

describe("os limites da Wiza que o nosso lado tem de respeitar", () => {
  it("o mínimo é o mesmo que o domínio anuncia ao checkout", () => {
    expect(wiza.MIN_PAYMENT_KZ).toBe(MIN_PAYMENT_KZ);
  });

  it("a janela de consulta do estado é da ordem dos minutos", () => {
    // `GET /hosts/payments/{id}` deixa de responder ~5 min depois da criação.
    // Uma janela de segundos (ou de horas) quer dizer que a constante mudou de
    // unidade e o fluxo de regresso deixa de confirmar nada.
    expect(wiza.STATUS_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
    expect(wiza.STATUS_WINDOW_MS).toBeLessThanOrEqual(30 * 60_000);
  });

  it("sem credenciais no ambiente, a Wiza diz que não está configurada", () => {
    // É isto que faz o servidor responder 503 em vez de tentar cobrar.
    const antes = { id: process.env.WIPAY_CLIENT_ID, secret: process.env.WIPAY_CLIENT_SECRET };
    delete process.env.WIPAY_CLIENT_ID;
    delete process.env.WIPAY_CLIENT_SECRET;
    try {
      expect(wiza.wizaConfigured()).toBe(false);
      process.env.WIPAY_CLIENT_ID = "id";
      expect(wiza.wizaConfigured(), "só com o id não basta").toBe(false);
      process.env.WIPAY_CLIENT_SECRET = "segredo";
      expect(wiza.wizaConfigured()).toBe(true);
    } finally {
      if (antes.id === undefined) delete process.env.WIPAY_CLIENT_ID;
      else process.env.WIPAY_CLIENT_ID = antes.id;
      if (antes.secret === undefined) delete process.env.WIPAY_CLIENT_SECRET;
      else process.env.WIPAY_CLIENT_SECRET = antes.secret;
    }
  });
});

describe("o 303 da criação não pode ser seguido", () => {
  /**
   * A Wiza responde à criação com **303 e sem corpo**: o `id` e o `nonce` vêm
   * no cabeçalho `Location`. Qualquer cliente HTTP que siga o
   * redireccionamento sozinho perde-os, e sem `id` não há como confirmar o
   * pagamento — a venda acontece e nunca é registada.
   */
  const SRC = ler("api/_wizapay.js");

  it("o pedido de criação pede o redireccionamento à mão", () => {
    expect(SRC).toContain('redirect: "manual"');
  });

  it("o id sai do cabeçalho Location", () => {
    expect(SRC).toMatch(/headers\.get\("location"\)/i);
  });
});

/* ================================= Vero ================================== */

describe("toCents — Kwanzas → cêntimos, num sítio só", () => {
  it("multiplica por cem e arredonda ao inteiro", () => {
    expect(vero.toCents(2500)).toBe(250_000);
    expect(vero.toCents(0)).toBe(0);
    expect(vero.toCents(1234.56)).toBe(123_456);
    expect(vero.toCents(0.01)).toBe(1);
  });

  it("não deixa escapar cêntimos fraccionários", () => {
    // Um valor com três casas chegava ao Vero como cêntimo decimal e o
    // documento era recusado.
    expect(Number.isInteger(vero.toCents(7350.555))).toBe(true);
    expect(Number.isInteger(vero.toCents(1 / 3))).toBe(true);
  });

  it("entrada inválida ou negativa dá zero, nunca NaN", () => {
    for (const lixo of [null, undefined, "", "abc", NaN, -1, -0.5, {}, []]) {
      expect(vero.toCents(lixo), String(lixo)).toBe(0);
    }
  });
});

describe("credenciais do Vero — da empresa do Dono, as duas ou nenhuma", () => {
  it("só são utilizáveis com organização e chave", () => {
    expect(vero.veroUsable({ orgId: "org_1", apiKey: "vero_live_sk_x" })).toBe(true);
    expect(vero.veroUsable({ orgId: "org_1", apiKey: "" })).toBe(false);
    expect(vero.veroUsable({ orgId: "", apiKey: "vero_live_sk_x" })).toBe(false);
    expect(vero.veroUsable({})).toBe(false);
    expect(vero.veroUsable(null)).toBe(false);
  });

  it("reconhece a chave de teste, que não chega à AGT", () => {
    // É o que o painel avisa ao Dono: factura emitida, mas sem valor fiscal.
    expect(vero.veroIsTestKey("vero_test_sk_abc")).toBe(true);
    expect(vero.veroIsTestKey("vero_live_sk_abc")).toBe(false);
    expect(vero.veroIsTestKey("")).toBe(false);
    expect(vero.veroIsTestKey(null)).toBe(false);
  });
});

describe("veroPdfUrl — o endereço público, o único que se partilha", () => {
  it("é o caminho público e leva o identificador escapado", () => {
    const url = vero.veroPdfUrl("inv_123");
    expect(url).toContain("/v1/public/invoices/inv_123/pdf");
    expect(url.startsWith("https://")).toBe(true);
  });

  it("um identificador com caracteres estranhos não parte o endereço", () => {
    expect(vero.veroPdfUrl("a/b?c")).toContain(encodeURIComponent("a/b?c"));
  });
});

describe("o IVA é do código de isenção, nunca de uma taxa nossa", () => {
  /**
   * O guia do Vero é explícito: o IVA é calculado a partir do código de
   * isenção da organização. Enviar `taxRate` no documento faz a AGT recusá-lo —
   * e a recusa só aparece depois, na validação, com a venda já feita.
   */
  const SRC = ler("api/_vero.js");

  it("o código de isenção é o do regime simplificado e vem de uma constante", () => {
    expect(vero.TAX_EXEMPTION_CODE).toBe("M04");
    expect(SRC).toContain("TAX_EXEMPTION_CODE");
  });

  it("nenhuma chamada envia taxRate", () => {
    const codigo = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo, "o documento leva taxRate e vai ser recusado").not.toContain("taxRate");
  });

  it("a emissão é idempotente pela referência da venda", () => {
    // Sem isto, uma retentativa emitia um segundo documento fiscal da mesma
    // venda — e um documento fiscal não se apaga.
    expect(SRC).toContain("idempotencyKey");
    expect(ler("api/_fulfil.js")).toContain("idempotencyKey: order.id");
  });
});
