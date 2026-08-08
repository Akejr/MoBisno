import { describe, it, expect } from "vitest";
import { isOk, isErr } from "../src/models/index.js";
import {
  FEE_RATE,
  MIN_PAYMENT_KZ,
  round2,
  productsTotal,
  computeFee,
  computeNet,
  isValidProduct,
  validateCheckout,
  normalizeAoPhone,
  mapMomenuStatus,
  mapStatusString,
  isReferenceExpired,
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

describe("payments — taxas e totais", () => {
  it("FEE_RATE é 2% e o mínimo é 100 KZ", () => {
    expect(FEE_RATE).toBe(0.02);
    expect(MIN_PAYMENT_KZ).toBe(100);
  });

  it("computeFee e computeNet repartem o valor exatamente", () => {
    expect(computeFee(10000)).toBe(200);
    expect(computeNet(10000)).toBe(9800);
    expect(round2(computeFee(10000) + computeNet(10000))).toBe(10000);
  });

  it("productsTotal soma preço × quantidade", () => {
    expect(productsTotal([prod({ productPrice: 2500, productQuantity: 2 }), prod({ productPrice: 1000, productQuantity: 1 })])).toBe(6000);
  });
});

describe("payments — validação de produto", () => {
  it("aceita um produto válido", () => {
    expect(isValidProduct(prod())).toBe(true);
    expect(isValidProduct(prod({ iva: 14 }))).toBe(true);
  });
  it("rejeita nome vazio, preço ≤ 0, quantidade não inteira e IVA inválido", () => {
    expect(isValidProduct(prod({ productName: "  " }))).toBe(false);
    expect(isValidProduct(prod({ productPrice: 0 }))).toBe(false);
    expect(isValidProduct(prod({ productPrice: -5 }))).toBe(false);
    expect(isValidProduct(prod({ productQuantity: 1.5 }))).toBe(false);
    expect(isValidProduct(prod({ productQuantity: 0 }))).toBe(false);
    expect(isValidProduct(prod({ iva: 9 }))).toBe(false);
  });
});

describe("payments — validateCheckout", () => {
  it("aceita MCX com telefone e produtos válidos", () => {
    const r = validateCheckout({ method: "mcx", products: [prod({ productPrice: 2500 })], phoneNumber: "923456789" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.amount).toBe(2500);
  });

  it("aceita Referência sem telefone", () => {
    const r = validateCheckout({ method: "reference", products: [prod({ productPrice: 5000 })] });
    expect(isOk(r)).toBe(true);
  });

  it("rejeita sem produtos", () => {
    const r = validateCheckout({ method: "reference", products: [] });
    expect(isErr(r) && r.error).toBe("MISSING_PRODUCTS");
  });

  it("rejeita produto inválido", () => {
    const r = validateCheckout({ method: "reference", products: [prod({ productPrice: 0 })] });
    expect(isErr(r) && r.error).toBe("INVALID_PRODUCT");
  });

  it("rejeita abaixo do mínimo (100 KZ)", () => {
    const r = validateCheckout({ method: "reference", products: [prod({ productPrice: 50, productQuantity: 1 })] });
    expect(isErr(r) && r.error).toBe("BELOW_MINIMUM");
  });

  it("rejeita amount que não bate com os produtos", () => {
    const r = validateCheckout({ method: "reference", products: [prod({ productPrice: 2500 })], amount: 3000 });
    expect(isErr(r) && r.error).toBe("AMOUNT_MISMATCH");
  });

  it("rejeita MCX sem telefone", () => {
    const r = validateCheckout({ method: "mcx", products: [prod({ productPrice: 2500 })] });
    expect(isErr(r) && r.error).toBe("MISSING_PHONE");
  });
});

describe("payments — telefone e estados", () => {
  it("normalizeAoPhone garante prefixo 244", () => {
    expect(normalizeAoPhone("923456789")).toBe("244923456789");
    expect(normalizeAoPhone("244923456789")).toBe("244923456789");
    expect(normalizeAoPhone("+244 923 456 789")).toBe("244923456789");
  });

  it("mapMomenuStatus mapeia operationStatus", () => {
    expect(mapMomenuStatus("1")).toBe("paid");
    expect(mapMomenuStatus("3")).toBe("cancelled");
    expect(mapMomenuStatus("4")).toBe("failed");
    expect(mapMomenuStatus("5")).toBe("failed");
    expect(mapMomenuStatus(undefined)).toBe("open");
  });

  it("mapStatusString mapeia o status textual", () => {
    expect(mapStatusString("paid")).toBe("paid");
    expect(mapStatusString("pending")).toBe("open");
    expect(mapStatusString("expired")).toBe("cancelled");
    expect(mapStatusString("rejected")).toBe("failed");
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

  it("o que é apagável é sempre expirado, e o que não expirou nunca é apagável", () => {
    const casos: OrderLifecycle[] = [
      enc({ dueDate: ONTEM }),
      enc({ dueDate: AMANHA }),
      enc({ dueDate: null }),
      enc({ status: "paid", paidAt: ONTEM, dueDate: ONTEM }),
      enc({ status: "failed", dueDate: ONTEM }),
      enc({ status: "cancelled", dueDate: ONTEM }),
      enc({ method: "mcx", dueDate: ONTEM }),
      enc({ method: "whatsapp", dueDate: null }),
    ];
    for (const c of casos) {
      if (canDeleteOrder(c, AGORA)) expect(orderEffectiveStatus(c, AGORA)).toBe("expired");
      else expect(orderEffectiveStatus(c, AGORA) === "expired" && !c.paidAt).toBe(false);
    }
  });
});
