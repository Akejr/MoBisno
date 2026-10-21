/**
 * Guardas da vista do checkout, da página do carrinho e da gaveta — sobre o
 * texto-fonte.
 *
 * Porque é texto-fonte e não DOM: as três importam o cliente do Supabase
 * (pagamentos, descontos, analytics), que lê variáveis de ambiente do navegador,
 * e `vitest` corre em `node`. É o padrão `readFileSync` de
 * `tests/comingSoon.test.ts`. O HTML que os layouts produzem é testado de facto
 * em `tests/checkoutLayouts.test.ts`; a conta, em `tests/serverOrder.test.ts`.
 *
 * O que se guarda aqui são decisões, não estilo:
 *  - nenhuma bandeira de testes sai do navegador (o `?qa=1` mandava o servidor
 *    simular um pagamento);
 *  - a visibilidade dos pagamentos digitais tem **um** autor,
 *    `digitalPaymentsVisible(store)`;
 *  - o pagamento não diz preços: diz linhas e o total que o comprador viu;
 *  - o funil regista a abertura do checkout e a encomenda por WhatsApp;
 *  - a mensagem de WhatsApp tem um só autor, `buildCartWhatsAppMessage`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/** Só o código: os comentários explicam as armadilhas e citam-nas pelo nome. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const CHECKOUT = semComentarios(ler("web/views/checkout.ts"));
const CARRINHO = semComentarios(ler("web/views/cart.ts"));
const GAVETA = semComentarios(ler("web/lib/cartDrawer.ts"));
const VISTAS = [
  { nome: "checkout", codigo: CHECKOUT },
  { nome: "carrinho", codigo: CARRINHO },
  { nome: "gaveta", codigo: GAVETA },
];

describe("pagamentos digitais — uma só decisão, nenhuma bandeira do cliente", () => {
  for (const { nome, codigo } of VISTAS) {
    it(`${nome}: decide com digitalPaymentsVisible(store) e mais nada`, () => {
      expect(codigo).toMatch(/digitalPaymentsVisible\((result|loaded\.result)\.store\)/);
      for (const antigo of ["onlinePaymentsVisible", "isPaymentsDemo", "onlineEnabled", "__demoPayments"]) {
        expect(codigo, `${nome} ainda lê ${antigo}`).not.toContain(antigo);
      }
    });
  }

  it("o checkout não envia nenhum modo de testes ao servidor", () => {
    expect(CHECKOUT).not.toMatch(/\bqa\b|qa=1|simulateResult/);
  });
});

describe("o pedido de pagamento — linhas e total visto, nunca preços", () => {
  it("envia lines, customer, discountCode e expectedTotal, como /api/payment espera", () => {
    for (const campo of ["lines:", "customer,", "discountCode:", "expectedTotal:"]) {
      expect(CHECKOUT, campo).toContain(campo);
    }
    expect(CHECKOUT).toContain("orderRequestLines(items)");
    expect(CHECKOUT).toContain("buyerCustomer(buyer, { physical })");
  });

  it("não diz preços nem usa o contrato antigo", () => {
    for (const antigo of ["productPrice", "products:", "phoneNumber", "discountCodeId", "operationId", "merchantTransactionId"]) {
      expect(CHECKOUT, antigo).not.toContain(antigo);
    }
  });

  it("trata PRICE_CHANGED (confirmação do novo total) e os pagamentos indisponíveis (sugere WhatsApp)", () => {
    expect(CHECKOUT).toContain('"PRICE_CHANGED"');
    expect(CHECKOUT).toContain("res.total");
    expect(CHECKOUT).toContain('"PAYMENTS_UNAVAILABLE"');
    expect(CHECKOUT).toContain('id="use-whatsapp"');
  });

  it("recusa o segundo clique em pagar e em enviar", () => {
    expect(CHECKOUT).toMatch(/if \(paying \|\| sendingWa\) return;/);
    expect(CHECKOUT).toMatch(/if \(paying\) return;/);
    expect(CHECKOUT).toMatch(/if \(sendingWa\) return;/);
    expect(CHECKOUT).toMatch(/if \(coupon\.busy\) return;/);
    for (const codigo of [CARRINHO, GAVETA]) expect(codigo).toMatch(/if \(sending\) return;/);
  });
});

describe("funil e mensagem", () => {
  it("o checkout regista a abertura e a encomenda por WhatsApp", () => {
    expect(CHECKOUT).toContain('trackStoreEvent(storeId, "checkout_start")');
    expect(CHECKOUT).toContain('trackStoreEvent(storeId, "whatsapp_order")');
  });

  it("o carrinho e a gaveta também registam a encomenda por WhatsApp", () => {
    for (const codigo of [CARRINHO, GAVETA]) expect(codigo).toContain('trackStoreEvent(storeId, "whatsapp_order")');
  });

  it("a mensagem tem um só autor — a do carrinho deixava cair a Combinação", () => {
    for (const { nome, codigo } of VISTAS) {
      expect(codigo, nome).toContain("buildCartWhatsAppMessage(");
      expect(codigo, `${nome} escreve a mensagem à mão`).not.toContain("Gostaria de encomendar");
    }
  });

  it("o desconto do checkout é o do domínio, o mesmo que o servidor espelha", () => {
    expect(ler("web/views/checkout.ts")).toContain('from "../../src/services/discount.js"');
    expect(CHECKOUT).toContain("discountAmount(applied, subtotal + fee)");
    expect(CHECKOUT).toContain("deliveryFeeFor(custom.delivery");
  });
});
