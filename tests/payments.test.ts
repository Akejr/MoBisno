/**
 * Domínio de pagamentos (`src/services/payments.ts`), independente do
 * fornecedor.
 *
 * A integração MoMenu saiu, e com ela a taxa de 2 %, a validação do checkout
 * feita a partir dos preços do navegador e os mapas de estados da MoMenu. O
 * preço de uma encomenda passou a ser calculado no servidor
 * (`api/_payments.js`) e a comissão da plataforma vive em
 * `src/services/fees.ts`. O que fica aqui é o que vale para qualquer
 * fornecedor: totais, linhas válidas, telemóveis angolanos e o ciclo de vida de
 * uma encomenda — e é isso que estes exemplos fixam.
 *
 * O **mínimo de um pagamento** voltou, mas não é o da MoMenu: a Wiza aceita uma
 * cobrança abaixo de 100 Kz, o cliente paga e o valor não é creditado. Por isso
 * `MIN_PAYMENT_KZ` existe nos dois lados — aqui, para o checkout recusar antes
 * de criar a cobrança, e em `api/_wizapay.js`, que é quem a cria. Os dois
 * valores são comparados mais abaixo.
 */
import { describe, it, expect } from "vitest";
import * as payments from "../src/services/payments.js";
import {
  PAYMENTS_PROVIDER_READY,
  round2,
  productsTotal,
  isValidProduct,
  normalizeAoPhone,
  isValidAoPhone,
  isReferenceExpired,
  MIN_PAYMENT_KZ,
  orderEffectiveStatus,
  canDeleteOrder,
  type PaymentProduct,
  type OrderLifecycle,
} from "../src/services/payments.js";

const prod = (over: Partial<PaymentProduct> = {}): PaymentProduct => ({
  productName: "Camisola",
  productPrice: 2500,
  productQuantity: 1,
  ...over,
});

describe("payments — o que saiu com a MoMenu", () => {
  it("não sobra taxa, validação de checkout nem mapas de estados do fornecedor antigo", () => {
    // A comissão da plataforma não está aqui: vive em `src/services/fees.ts`,
    // é aplicada no servidor e é comparada por `tests/fees.test.ts`. Um
    // `computeFee` neste módulo era a taxa calculada no navegador.
    for (const nome of [
      "FEE_RATE", "computeFee", "computeNet", "validateCheckout",
      "mapMomenuStatus", "mapStatusString",
    ]) {
      expect(payments, nome).not.toHaveProperty(nome);
    }
  });

  it("a bandeira do fornecedor é um booleano", () => {
    // É ela que decide, no navegador, se os pagamentos digitais aparecem.
    expect(typeof PAYMENTS_PROVIDER_READY).toBe("boolean");
  });
});

describe("payments — o mínimo de uma cobrança é o mesmo nos dois lados", () => {
  // Especificador em constante: mantém `api/` fora do programa do `tsc`.
  const ESPECIFICADOR_WIZA = "../api/_wizapay.js";

  it("MIN_PAYMENT_KZ é um valor positivo e finito", () => {
    expect(Number.isFinite(MIN_PAYMENT_KZ)).toBe(true);
    expect(MIN_PAYMENT_KZ).toBeGreaterThan(0);
  });

  it("é o mesmo valor que api/_wizapay.js valida antes de criar a cobrança", async () => {
    // Se os dois divergirem, o checkout deixa passar um total que o servidor
    // recusa (ou, pior, aceita e o Dono não recebe).
    const wiza = (await import(ESPECIFICADOR_WIZA)) as { MIN_PAYMENT_KZ: number };
    expect(wiza.MIN_PAYMENT_KZ).toBe(MIN_PAYMENT_KZ);
  });
});

describe("payments — totais", () => {
  it("productsTotal soma preço × quantidade", () => {
    expect(productsTotal([prod({ productPrice: 2500, productQuantity: 2 }), prod({ productPrice: 1000 })])).toBe(6000);
    expect(productsTotal([])).toBe(0);
  });

  it("arredonda a 2 casas sem ruído de vírgula flutuante", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(productsTotal([prod({ productPrice: 0.1, productQuantity: 3 })])).toBe(0.3);
  });
});

describe("payments — validação de uma linha", () => {
  it("aceita uma linha válida, com ou sem Combinação", () => {
    expect(isValidProduct(prod())).toBe(true);
    expect(isValidProduct(prod({ variantKey: "Azul\u001FM" }))).toBe(true);
  });

  it("rejeita nome vazio, preço ≤ 0 ou não finito, e quantidade não inteira ou ≤ 0", () => {
    expect(isValidProduct(prod({ productName: "  " }))).toBe(false);
    expect(isValidProduct(prod({ productPrice: 0 }))).toBe(false);
    expect(isValidProduct(prod({ productPrice: -5 }))).toBe(false);
    expect(isValidProduct(prod({ productPrice: Number.NaN }))).toBe(false);
    expect(isValidProduct(prod({ productPrice: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(isValidProduct(prod({ productQuantity: 1.5 }))).toBe(false);
    expect(isValidProduct(prod({ productQuantity: 0 }))).toBe(false);
    expect(isValidProduct(prod({ productQuantity: -1 }))).toBe(false);
  });

  it("rejeita o que nem é uma linha", () => {
    expect(isValidProduct(null as unknown as PaymentProduct)).toBe(false);
    expect(isValidProduct({ productName: 7 } as unknown as PaymentProduct)).toBe(false);
  });
});

describe("payments — telemóvel angolano", () => {
  it("normalizeAoPhone garante o prefixo 244", () => {
    expect(normalizeAoPhone("923456789")).toBe("244923456789");
    expect(normalizeAoPhone("244923456789")).toBe("244923456789");
    expect(normalizeAoPhone("+244 923 456 789")).toBe("244923456789");
    expect(normalizeAoPhone("")).toBe("");
  });

  it("isValidAoPhone aceita 9 algarismos a começar por 9, com ou sem 244", () => {
    for (const valido of ["923456789", "+244 923 456 789", "244923456789", "(+244) 912-345-678"]) {
      expect(isValidAoPhone(valido), valido).toBe(true);
    }
    for (const invalido of ["", "823456789", "92345678", "2449234567890", "+351 912 345 678", "telefone"]) {
      expect(isValidAoPhone(invalido), invalido).toBe(false);
    }
  });
});

/**
 * Ciclo de vida de uma encomenda — quem pode ser apagado.
 *
 * A decisão vive aqui, em domínio puro, e não dentro da vista: é a mesma
 * condição que a política de `delete` da base de dados impõe (migração
 * `0021_orders_owner_delete.sql`). Uma encomenda paga apagada é dinheiro sem
 * rasto e é irreversível, por isso a regra é testada com exemplos e não afirmada
 * pela leitura do código-fonte.
 *
 * `AGORA` fixo: com `Date.now()`, um teste destes passa ou falha conforme o
 * relógio da máquina.
 */
const AGORA = Date.parse("2026-07-01T12:00:00Z");
const ONTEM = "2026-06-30T12:00:00Z";
const AMANHA = "2026-07-02T12:00:00Z";

const enc = (over: Partial<OrderLifecycle> = {}): OrderLifecycle => ({
  status: "open",
  method: "reference",
  dueDate: AMANHA,
  paidAt: null,
  ...over,
});

describe("payments — referência expirada", () => {
  it("uma referência por pagar com a data-limite no passado está expirada", () => {
    expect(isReferenceExpired(enc({ dueDate: ONTEM }), AGORA)).toBe(true);
    expect(orderEffectiveStatus(enc({ dueDate: ONTEM }), AGORA)).toBe("expired");
  });

  it("dentro do prazo continua pendente, e sem data-limite nunca expira", () => {
    expect(isReferenceExpired(enc({ dueDate: AMANHA }), AGORA)).toBe(false);
    expect(isReferenceExpired(enc({ dueDate: null }), AGORA)).toBe(false);
    expect(orderEffectiveStatus(enc({ dueDate: AMANHA }), AGORA)).toBe("open");
  });

  it("só a referência bancária expira: o Multicaixa Express e o WhatsApp não", () => {
    expect(isReferenceExpired(enc({ method: "mcx", dueDate: ONTEM }), AGORA)).toBe(false);
    expect(isReferenceExpired(enc({ method: "whatsapp", dueDate: ONTEM }), AGORA)).toBe(false);
  });

  it("uma data-limite ilegível não inventa uma expiração", () => {
    expect(isReferenceExpired(enc({ dueDate: "sem data" }), AGORA)).toBe(false);
  });

  it("os estados gravados passam intactos quando não há expiração", () => {
    for (const status of ["paid", "failed", "cancelled"] as const) {
      expect(orderEffectiveStatus(enc({ status, dueDate: ONTEM }), AGORA)).toBe(status);
    }
  });
});

describe("payments — canDeleteOrder", () => {
  it("apaga-se uma referência expirada: já não pode ser paga", () => {
    expect(canDeleteOrder(enc({ dueDate: ONTEM }), AGORA)).toBe(true);
  });

  it("uma encomenda paga NUNCA é apagável — pelo estado e pelo paidAt", () => {
    // As duas condições em separado: uma encomenda com `paid_at` mas com o
    // estado dessincronizado continua a ser dinheiro que aconteceu.
    expect(canDeleteOrder(enc({ status: "paid", dueDate: ONTEM }), AGORA)).toBe(false);
    expect(canDeleteOrder(enc({ status: "open", dueDate: ONTEM, paidAt: ONTEM }), AGORA)).toBe(false);
  });

  it("uma referência ainda dentro do prazo não se apaga: pode ser paga hoje", () => {
    expect(canDeleteOrder(enc({ dueDate: AMANHA }), AGORA)).toBe(false);
  });

  it("as falhadas e as canceladas ficam de fora (decisão: só as expiradas)", () => {
    expect(canDeleteOrder(enc({ status: "failed", dueDate: ONTEM }), AGORA)).toBe(false);
    expect(canDeleteOrder(enc({ status: "cancelled", dueDate: ONTEM }), AGORA)).toBe(false);
  });
});
