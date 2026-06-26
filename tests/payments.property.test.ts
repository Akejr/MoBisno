import { describe, it } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { isOk } from "../src/models/index.js";
import {
  round2,
  computeFee,
  computeNet,
  productsTotal,
  validateCheckout,
  isValidProduct,
  MIN_PAYMENT_KZ,
  type PaymentProduct,
} from "../src/services/payments.js";

/** Item de produto arbitrário (inclui fronteiras inválidas). */
const productArb: fc.Arbitrary<PaymentProduct> = fc.record({
  productName: fc.oneof(fc.constantFrom("", " ", "Camisola", "Bola"), fc.string({ maxLength: 20 })),
  productPrice: fc.oneof(
    fc.constantFrom(-10, 0, 0.01, 50, 100, 2500, 999999),
    fc.double({ min: -100, max: 1_000_000, noNaN: true }),
  ),
  productQuantity: fc.oneof(fc.constantFrom(0, 1, 2, 1.5, -1, 10), fc.integer({ min: -2, max: 50 })),
  iva: fc.oneof(fc.constant<number | undefined>(undefined), fc.constantFrom(0, 2, 5, 7, 14, 9, 100)),
});

describe("payments — propriedades", () => {
  it("a taxa (2%) e o líquido somam exatamente o valor (sem perder Kwanzas)", () => {
    // **Feature: pagamentos MoMenu, Property: repartição taxa+líquido**
    assertProperty(
      fc.property(fc.double({ min: 0, max: 5_000_000, noNaN: true }), (raw) => {
        const amount = round2(raw);
        return round2(computeFee(amount) + computeNet(amount)) === amount;
      }),
    );
  });

  it("validateCheckout aceita se e só se: ≥1 produto, todos válidos, total ≥ 100 e (MCX⇒telefone) e (amount coincide quando dado)", () => {
    // **Feature: pagamentos MoMenu, Property: validação de checkout**
    assertProperty(
      fc.property(
        fc.array(productArb, { maxLength: 4 }),
        fc.constantFrom("mcx" as const, "reference" as const),
        fc.oneof(fc.constant<string | undefined>(undefined), fc.constantFrom("", "923456789")),
        fc.oneof(fc.constant<number | undefined>(undefined), fc.double({ min: 0, max: 2_000_000, noNaN: true })),
        (products, method, phoneNumber, amount) => {
          const result = validateCheckout({ method, products, phoneNumber, amount });

          // Oráculo independente.
          const hasProducts = products.length > 0;
          const allValid = products.every(isValidProduct);
          const total = hasProducts && allValid ? productsTotal(products) : 0;
          const amountOk = amount === undefined || (hasProducts && allValid && round2(amount) === total);
          const aboveMin = total >= MIN_PAYMENT_KZ;
          const phoneOk = method !== "mcx" || (phoneNumber !== undefined && phoneNumber.trim() !== "");
          const expectAccept = hasProducts && allValid && amountOk && aboveMin && phoneOk;

          if (isOk(result) !== expectAccept) return false;
          if (isOk(result)) return result.value.amount === total;
          return true;
        },
      ),
    );
  });
});
