/**
 * A encomenda que o checkout fecha: os dados do comprador (o que é obrigatório,
 * como se limpam) e o que segue para a loja — pela mensagem de WhatsApp e pelo
 * campo `customer` do pagamento digital.
 *
 * Dois defeitos que estes exemplos guardam:
 *
 *  1. **O email era recolhido e deitado fora.** O checkout lia o campo e não o
 *     punha nem na mensagem nem no pagamento.
 *  2. **A área perdia-se com a entrega grátis.** Só seguia como linha
 *     «Entrega - <área>» quando a taxa era maior do que zero; com a entrega
 *     grátis, o Dono recebia a encomenda sem saber para onde ia.
 *
 * Exemplos e não propriedades: as regras são casos enumeráveis (campo vazio,
 * preenchido, inválido; com e sem produtos físicos; com e sem áreas). A
 * propriedade que interessa — o servidor aceita o `customer` tal como sai
 * daqui — está em `tests/serverOrder.test.ts`.
 *
 * Import estático: `src/services/delivery.ts`, `cartMessage.ts` e `format.ts`
 * são domínio puro, sem DOM.
 */
import { describe, it, expect } from "vitest";
import {
  buyerErrors, buyerCustomer, deliveryAddressLine, firstBuyerError, deliveryFeeFor, BUYER_MESSAGES,
  type BuyerDetails,
} from "../src/services/delivery.js";
import { buildCartWhatsAppMessage, type OrderLine } from "../src/services/cartMessage.js";
import { formatKz } from "../src/services/format.js";
import { discountAmount } from "../src/services/discount.js";

/** Áreas de uma Loja que entrega por área. */
const AREAS = ["Talatona", "Kilamba"];

/** Comprador completo de uma encomenda com entrega. */
const COMPLETO: BuyerDetails = {
  name: "Maria Silva",
  phone: "923 456 789",
  email: "maria@exemplo.ao",
  nif: "004567890LA042",
  street: "Rua Direita do Kilamba",
  number: "12",
  reference: "junto à farmácia",
  area: "Kilamba",
};

describe("buyerErrors — o que o comprador tem de preencher", () => {
  it("um comprador completo passa, com e sem produtos físicos", () => {
    expect(buyerErrors(COMPLETO, { physical: true, areas: AREAS })).toEqual({});
    expect(buyerErrors(COMPLETO, { physical: false, areas: AREAS })).toEqual({});
  });

  it("o nome e o telemóvel são obrigatórios; espaços não contam como preenchido", () => {
    const erros = buyerErrors({ name: "   ", phone: "" }, { physical: false, areas: [] });
    expect(erros.name).toBe(BUYER_MESSAGES.nameMissing);
    expect(erros.phone).toBe(BUYER_MESSAGES.phoneMissing);
  });

  it("o telemóvel tem de ser angolano (isValidAoPhone): 9 algarismos a começar por 9, com ou sem 244", () => {
    for (const valido of ["923456789", "923 456 789", "+244 923 456 789", "244923456789", "923-456-789"]) {
      expect(buyerErrors({ name: "A", phone: valido }, { physical: false, areas: [] }).phone, valido).toBeUndefined();
    }
    for (const invalido of ["823456789", "12345", "92345678", "+351 912 345 678", "telemóvel"]) {
      expect(buyerErrors({ name: "A", phone: invalido }, { physical: false, areas: [] }).phone, invalido)
        .toBe(BUYER_MESSAGES.phoneInvalid);
    }
  });

  it("o email e o NIF são opcionais; um email escrito tem de ter forma de email", () => {
    const base = { name: "A", phone: "923456789" };
    expect(buyerErrors({ ...base, email: "", nif: "" }, { physical: false, areas: [] })).toEqual({});
    expect(buyerErrors({ ...base, email: "maria@exemplo" }, { physical: false, areas: [] }).email)
      .toBe(BUYER_MESSAGES.emailInvalid);
    expect(buyerErrors({ ...base, email: "maria@exemplo.ao", nif: "qualquer coisa" }, { physical: false, areas: [] }))
      .toEqual({});
  });

  it("com produtos físicos, a rua é obrigatória e a área tem de ser uma das servidas", () => {
    const base = { name: "A", phone: "923456789" };
    const sem = buyerErrors(base, { physical: true, areas: AREAS });
    expect(sem.street).toBe(BUYER_MESSAGES.streetMissing);
    expect(sem.area).toBe(BUYER_MESSAGES.areaMissing);
    expect(buyerErrors({ ...base, street: "Rua A", area: "Viana" }, { physical: true, areas: AREAS }).area)
      .toBe(BUYER_MESSAGES.areaMissing);
    // O número e o ponto de referência nunca são obrigatórios.
    expect(buyerErrors({ ...base, street: "Rua A", area: "Talatona" }, { physical: true, areas: AREAS })).toEqual({});
  });

  it("a loja não definiu áreas: a área não é pedida (o servidor também não a pede)", () => {
    const erros = buyerErrors({ name: "A", phone: "923456789", street: "Rua A" }, { physical: true, areas: [] });
    expect(erros).toEqual({});
    expect(deliveryFeeFor({ mode: "perArea", fees: {} }, null, 10_000)).toEqual({ ok: true, fee: 0 });
  });

  it("sem produtos físicos não se pede morada nem área", () => {
    expect(buyerErrors({ name: "A", phone: "923456789" }, { physical: false, areas: AREAS })).toEqual({});
  });

  it("o foco vai para o primeiro campo por corrigir, pela ordem do formulário", () => {
    expect(firstBuyerError({ street: "x", phone: "x" })).toBe("phone");
    expect(firstBuyerError({ street: "x", area: "x" })).toBe("area");
    expect(firstBuyerError({})).toBeNull();
  });
});

describe("buyerCustomer — o `customer` que segue para /api/payment", () => {
  it("leva o nome, o telemóvel normalizado, o email, o NIF, a morada numa linha e a área", () => {
    expect(buyerCustomer(COMPLETO, { physical: true })).toEqual({
      name: "Maria Silva",
      phone: "244923456789",
      email: "maria@exemplo.ao",
      nif: "004567890LA042",
      address: "Rua Direita do Kilamba, 12 (ponto de referência: junto à farmácia)",
      area: "Kilamba",
    });
  });

  it("o email segue — era recolhido e deitado fora", () => {
    expect(buyerCustomer({ name: "A", phone: "923456789", email: " a@b.ao " }, { physical: false }).email).toBe("a@b.ao");
  });

  it("a área segue com a entrega grátis", () => {
    const entrega = { mode: "perArea", fees: { Kilamba: 1_500 }, freeAbove: 20_000 };
    expect(deliveryFeeFor(entrega, "Kilamba", 25_000)).toEqual({ ok: true, fee: 0 });
    expect(buyerCustomer(COMPLETO, { physical: true }).area).toBe("Kilamba");
  });

  it("campos vazios ficam de fora; espaços e quebras de linha são reduzidos", () => {
    const c = buyerCustomer({ name: "  Maria \n  Silva ", phone: "923456789", email: "  ", street: "", area: null }, { physical: true });
    expect(c).toEqual({ name: "Maria Silva", phone: "244923456789" });
  });

  it("sem produtos físicos não leva morada nem área, mesmo que tenham sido escritas", () => {
    const c = buyerCustomer(COMPLETO, { physical: false });
    expect(c).not.toHaveProperty("address");
    expect(c).not.toHaveProperty("area");
  });

  it("deliveryAddressLine: a morada no formato português, sem as partes vazias", () => {
    expect(deliveryAddressLine({ street: "Rua Direita", number: "12" })).toBe("Rua Direita, 12");
    expect(deliveryAddressLine({ street: "Rua Direita", reference: "junto à escola" }))
      .toBe("Rua Direita (ponto de referência: junto à escola)");
    expect(deliveryAddressLine({ reference: "junto à escola" })).toBe("Ponto de referência: junto à escola");
    expect(deliveryAddressLine({})).toBe("");
  });
});

describe("mensagem de WhatsApp do checkout — itens, entrega, desconto e os dados do comprador", () => {
  const linhas: OrderLine[] = [
    { name: "Camisola oficial", quantity: 2, price: 15_000, variantLabel: "Cor: Azul · Tamanho: M" },
    { name: "Boné", quantity: 1, price: 8_000 },
  ];

  /** A mensagem tal como o checkout a compõe, a partir do `customer` do pagamento. */
  function mensagem(comprador: BuyerDetails, fee: number, desconto?: { code: string; amount: number }): string {
    const c = buyerCustomer(comprador, { physical: true });
    return buildCartWhatsAppMessage(linhas, formatKz, {
      delivery: c.area ? { area: c.area, fee } : undefined,
      discount: desconto,
      customer: { name: c.name, phone: c.phone ? `+${c.phone}` : undefined, address: c.address, email: c.email, nif: c.nif },
    });
  }

  it("leva cada linha com a Combinação, a entrega, o desconto, o total e os dados do comprador", () => {
    const total = 38_000 + 1_500;
    const desconto = { code: "VERAO10", amount: discountAmount({ type: "percent", value: 10 }, total) };
    expect(mensagem(COMPLETO, 1_500, desconto)).toBe([
      "Olá! Gostaria de encomendar:",
      "• 2x Camisola oficial · Cor: Azul · Tamanho: M (30.000,00 Kz)",
      "• 1x Boné (8.000,00 Kz)",
      "Entrega: Kilamba (1.500,00 Kz)",
      "Desconto (VERAO10): -3.950,00 Kz",
      "",
      "Total: 35.550,00 Kz",
      "",
      "Os meus dados:",
      "Nome: Maria Silva",
      "Telemóvel: +244923456789",
      "Morada: Rua Direita do Kilamba, 12 (ponto de referência: junto à farmácia)",
      "Email: maria@exemplo.ao",
      "NIF: 004567890LA042",
    ].join("\n"));
  });

  it("com a entrega grátis, a área continua lá, com «(grátis)»", () => {
    expect(mensagem(COMPLETO, 0)).toContain("Entrega: Kilamba (grátis)");
  });

  it("só os dados preenchidos entram no bloco do comprador", () => {
    const msg = mensagem({ name: "Maria", phone: "923456789", street: "Rua A", area: "Talatona" }, 2_500);
    expect(msg).toContain("Os meus dados:\nNome: Maria\nTelemóvel: +244923456789\nMorada: Rua A");
    expect(msg).not.toContain("Email:");
    expect(msg).not.toContain("NIF:");
  });

  it("um campo com quebras de linha fica numa linha só, com o seu rótulo", () => {
    const msg = buildCartWhatsAppMessage(linhas, formatKz, { customer: { name: "Maria", address: "Rua A\n\nPrédio 3" } });
    expect(msg).toContain("Morada: Rua A Prédio 3");
  });

  it("sem dados do comprador (página do carrinho e gaveta) o total é a última linha", () => {
    const msg = buildCartWhatsAppMessage(linhas, formatKz);
    expect(msg.split("\n").at(-1)).toBe("Total: 38.000,00 Kz");
    expect(msg).toContain("• 2x Camisola oficial · Cor: Azul · Tamanho: M (30.000,00 Kz)");
    expect(buildCartWhatsAppMessage(linhas, formatKz, { customer: {} }).split("\n").at(-1)).toBe("Total: 38.000,00 Kz");
  });
});
