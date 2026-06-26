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
  type PaymentProduct,
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
