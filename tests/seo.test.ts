import { describe, it, expect } from "vitest";
import {
  truncate, storeTitle, storeDescription, productTitle, productDescription,
  platformTitle, storeJsonLd, productJsonLd, SEO_CURRENCY,
} from "../src/services/seo.js";

describe("SEO — títulos e descrições", () => {
  it("título da loja segue o formato pedido", () => {
    expect(storeTitle("Ekolo Sports")).toBe("Ekolo Sports | Compras em Angola");
  });

  it("título do produto foca a loja", () => {
    expect(productTitle("Ténis Runner", "Ekolo Sports")).toBe("Ténis Runner — Ekolo Sports");
  });

  it("truncate não corta a meio de palavra e respeita o limite", () => {
    const out = truncate("palavra ".repeat(50), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("descrição do produto usa a descrição própria quando existe", () => {
    const d = productDescription({ name: "X", description: "Camisola de algodão premium.", storeName: "Loja" });
    expect(d).toContain("algodão");
  });

  it("descrição do produto é gerada quando não há descrição", () => {
    const d = productDescription({ name: "Camisola", priceLabel: "5.000 Kz", storeName: "Loja", description: "" });
    expect(d).toContain("Camisola");
    expect(d).toContain("Loja");
  });

  it("descrição da loja menciona Angola", () => {
    expect(storeDescription("Loja X")).toContain("Angola");
  });

  it("título da plataforma menciona Angola", () => {
    expect(platformTitle()).toContain("Angola");
  });
});

describe("SEO — JSON-LD", () => {
  it("loja gera OnlineStore com moeda AOA", () => {
    const node = storeJsonLd({ storeName: "Loja", url: "https://loja.sualoja.digital", logoUrl: null }) as Record<string, unknown>;
    expect(node["@type"]).toBe("OnlineStore");
    expect(node.currenciesAccepted).toBe(SEO_CURRENCY);
    expect(node.url).toBe("https://loja.sualoja.digital");
  });

  it("produto gera Product + Offer com preço e disponibilidade", () => {
    const node = productJsonLd({ name: "P", price: 1500, url: "https://loja.sualoja.digital/produto/p", storeName: "Loja", image: "https://img/p.jpg", available: true }) as Record<string, any>;
    expect(node["@type"]).toBe("Product");
    expect(node.offers.price).toBe("1500.00");
    expect(node.offers.priceCurrency).toBe(SEO_CURRENCY);
    expect(node.offers.availability).toContain("InStock");
    expect(node.image).toBe("https://img/p.jpg");
  });

  it("produto indisponível marca OutOfStock", () => {
    const node = productJsonLd({ name: "P", price: 1, url: "u", storeName: "L", available: false }) as Record<string, any>;
    expect(node.offers.availability).toContain("OutOfStock");
  });
});
