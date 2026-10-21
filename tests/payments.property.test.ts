import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  round2,
  productsTotal,
  isValidProduct,
  normalizeAoPhone,
  isValidAoPhone,
  isReferenceExpired,
  orderEffectiveStatus,
  canDeleteOrder,
  type PaymentProduct,
  type OrderLifecycle,
} from "../src/services/payments.js";

/**
 * Propriedades das funções puras de pagamento, as que valem para qualquer
 * fornecedor. A taxa e a validação do checkout da MoMenu saíram; o montante de
 * uma encomenda é calculado no servidor (`api/_payments.js`).
 */

/** Linha com preço e quantidade inteiros (os preços em Kz são inteiros). */
const linhaInteiraArb: fc.Arbitrary<PaymentProduct> = fc.record({
  productName: fc.constantFrom("Camisola", "Bola", "Ténis de corrida"),
  productPrice: fc.integer({ min: 1, max: 5_000_000 }),
  productQuantity: fc.integer({ min: 1, max: 999 }),
});

/** Linha arbitrária, com as fronteiras inválidas. */
const linhaArb: fc.Arbitrary<PaymentProduct> = fc.record({
  productName: fc.oneof(fc.constantFrom("", " ", "Camisola"), fc.string({ maxLength: 12 })),
  productPrice: fc.oneof(
    fc.constantFrom(-10, 0, 0.01, 2500, Number.NaN, Number.POSITIVE_INFINITY),
    fc.double({ min: -100, max: 1_000_000, noNaN: true }),
  ),
  productQuantity: fc.oneof(fc.constantFrom(0, 1, 1.5, -1), fc.integer({ min: -2, max: 50 })),
});

const AGORA = Date.parse("2026-07-01T12:00:00Z");
const DIA = 86_400_000;

/** Encomenda arbitrária: estados e métodos conhecidos e desconhecidos, datas dos dois lados. */
const encomendaArb: fc.Arbitrary<OrderLifecycle> = fc.record({
  status: fc.oneof(fc.constantFrom("open", "paid", "failed", "cancelled"), fc.constantFrom("expired", "PAID", "")),
  method: fc.oneof(fc.constantFrom("reference", "mcx", "whatsapp"), fc.constantFrom("REFERENCE", "")),
  dueDate: fc.oneof(
    fc.integer({ min: -30 * DIA, max: 30 * DIA }).map((d) => new Date(AGORA + d).toISOString()),
    fc.constantFrom<(string | null)[]>(null, "", "sem data"),
  ),
  paidAt: fc.constantFrom<(string | null | undefined)[]>(null, undefined, "2026-06-30T12:00:00Z", ""),
});

describe("payments — propriedades", () => {
  it("productsTotal com preços inteiros é a soma exata, por qualquer ordem", () => {
    assertProperty(
      fc.property(fc.array(linhaInteiraArb, { maxLength: 8 }), (linhas) => {
        const soma = linhas.reduce((s, l) => s + l.productPrice * l.productQuantity, 0);
        expect(productsTotal(linhas)).toBe(soma);
        expect(productsTotal([...linhas].reverse())).toBe(soma);
      }),
    );
  });

  it("round2 é idempotente e nunca se afasta mais de meio cêntimo", () => {
    assertProperty(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => {
        const r = round2(x);
        // `===` e não `Object.is`: um valor negativo minúsculo arredonda para
        // `-0`, e `-0` e `0` são o mesmo montante.
        expect(round2(r) === r).toBe(true);
        expect(Math.abs(r - x)).toBeLessThanOrEqual(0.005 + 1e-6);
      }),
    );
  });

  it("isValidProduct aceita se e só se o nome tem conteúdo, o preço é finito e positivo e a quantidade é inteira e positiva", () => {
    assertProperty(
      fc.property(linhaArb, (l) => {
        const esperado =
          typeof l.productName === "string" && l.productName.trim() !== "" &&
          Number.isFinite(l.productPrice) && l.productPrice > 0 &&
          Number.isInteger(l.productQuantity) && l.productQuantity > 0;
        expect(isValidProduct(l)).toBe(esperado);
      }),
    );
  });

  it("normalizeAoPhone é idempotente e devolve só algarismos", () => {
    assertProperty(
      fc.property(fc.string({ maxLength: 24 }), (s) => {
        const n = normalizeAoPhone(s);
        expect(n).toMatch(/^\d*$/);
        expect(normalizeAoPhone(n)).toBe(n);
      }),
    );
  });

  it("qualquer forma de escrever um telemóvel angolano é válida e normaliza para 2449XXXXXXXX", () => {
    const formatoArb = fc.constantFrom(
      (d: string) => `9${d}`,
      (d: string) => `+244 9${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`,
      (d: string) => `244-9${d}`,
      (d: string) => `(+244) 9${d}`,
    );
    assertProperty(
      fc.property(fc.stringMatching(/^\d{8}$/), formatoArb, (d, formato) => {
        const escrito = formato(d);
        expect(isValidAoPhone(escrito)).toBe(true);
        expect(normalizeAoPhone(escrito)).toBe(`2449${d}`);
      }),
    );
  });

  it("uma encomenda só expira se for uma referência por pagar com data-limite passada, e só o que expirou se apaga", () => {
    assertProperty(
      fc.property(encomendaArb, (e) => {
        const t = e.dueDate ? Date.parse(e.dueDate) : Number.NaN;
        const expirada = e.status === "open" && e.method === "reference" && Number.isFinite(t) && t < AGORA;
        expect(isReferenceExpired(e, AGORA)).toBe(expirada);

        const efetivo = orderEffectiveStatus(e, AGORA);
        expect(efetivo).toBe(expirada ? "expired" : e.status);

        // Apagável ⇒ expirada, não paga e sem `paidAt`.
        if (canDeleteOrder(e, AGORA)) {
          expect(efetivo).toBe("expired");
          expect(e.status).not.toBe("paid");
          expect(e.paidAt).toBeFalsy();
        }
        // Uma encomenda paga, por qualquer dos dois sinais, nunca se apaga.
        if (e.status === "paid" || e.paidAt) expect(canDeleteOrder(e, AGORA)).toBe(false);
      }),
    );
  });
});
