import { describe, it, expect } from "vitest";
import {
  truncate, storeTitle, storeDescription, productTitle, productDescription,
  platformTitle, storeJsonLd, productJsonLd, SEO_CURRENCY,
  categoryTitle, categoryDescription, breadcrumbJsonLd, collectionJsonLd,
} from "../src/services/seo.js";
import { slugify, productSlugPath, resolveCategoryLabel } from "../src/services/slug.js";

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
  it("loja gera OnlineStore com moeda AOA e URL canónica com barra final", () => {
    const node = storeJsonLd({ storeName: "Loja", url: "https://loja.sualoja.digital", logoUrl: null }) as Record<string, unknown>;
    expect(node["@type"]).toBe("OnlineStore");
    expect(node.currenciesAccepted).toBe(SEO_CURRENCY);
    // A home tem sempre barra final: "/" e "" seriam duas URLs para a mesma
    // página, e o Google trataria uma delas como duplicado.
    expect(node.url).toBe("https://loja.sualoja.digital/");
  });

  it("loja com barra final na entrada não duplica a barra", () => {
    const node = storeJsonLd({ storeName: "Loja", url: "https://loja.sualoja.digital/" }) as Record<string, unknown>;
    expect(node.url).toBe("https://loja.sualoja.digital/");
  });

  it("SEO local só aparece quando o dono definiu a morada", () => {
    const semMorada = storeJsonLd({ storeName: "L", url: "https://l.x" }) as Record<string, unknown>;
    expect(semMorada.address).toBeUndefined();
    expect(semMorada.geo).toBeUndefined();

    const comMorada = storeJsonLd({
      storeName: "L", url: "https://l.x",
      address: { street: "Rua Amílcar Cabral 12", latitude: -8.83, longitude: 13.24 },
    }) as Record<string, any>;
    expect(comMorada.address.addressCountry).toBe("AO");
    expect(comMorada.geo.latitude).toBe(-8.83);
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

  it("oferta traz os campos que o Google exige para mostrar preço no resultado", () => {
    const node = productJsonLd({
      name: "P", price: 1500, url: "https://l.x/p", storeName: "Loja", sku: "abc",
      now: new Date("2026-01-15T00:00:00Z"),
    }) as Record<string, any>;
    expect(node.sku).toBe("abc");
    expect(node.offers.itemCondition).toContain("NewCondition");
    expect(node.offers.seller.name).toBe("Loja");
    expect(node.offers.priceValidUntil).toBe("2027-01-15");
  });

  it("portes só entram no schema quando a loja os configurou", () => {
    const sem = productJsonLd({ name: "P", price: 1, url: "u", storeName: "L" }) as Record<string, any>;
    expect(sem.offers.shippingDetails).toBeUndefined();

    const com = productJsonLd({ name: "P", price: 1, url: "u", storeName: "L", shipping: { cost: 2500 } }) as Record<string, any>;
    expect(com.offers.shippingDetails.shippingRate.value).toBe("2500.00");
    expect(com.offers.shippingDetails.shippingDestination.addressCountry).toBe("AO");
  });

  it("avaliações só entram quando há avaliações reais", () => {
    const sem = productJsonLd({ name: "P", price: 1, url: "u", storeName: "L", rating: { average: 0, count: 0 } }) as Record<string, any>;
    expect(sem.aggregateRating).toBeUndefined();

    const com = productJsonLd({ name: "P", price: 1, url: "u", storeName: "L", rating: { average: 4.5, count: 8 } }) as Record<string, any>;
    expect(com.aggregateRating.ratingValue).toBe(4.5);
    expect(com.aggregateRating.reviewCount).toBe(8);
  });

  it("breadcrumb numera as posições a partir de 1", () => {
    const node = breadcrumbJsonLd([
      { name: "Loja", url: "https://l.x/" },
      { name: "Ténis", url: "https://l.x/categoria/tenis" },
      { name: "Nimbus", url: "https://l.x/produto/tenis/nimbus" },
    ]) as Record<string, any>;
    expect(node.itemListElement).toHaveLength(3);
    expect(node.itemListElement[0].position).toBe(1);
    expect(node.itemListElement[2].name).toBe("Nimbus");
  });

  it("coleção conta os itens e preserva a ordem", () => {
    const node = collectionJsonLd({
      name: "Ténis", url: "https://l.x/categoria/tenis", description: "d",
      items: [{ name: "A", url: "u1" }, { name: "B", url: "u2" }],
    }) as Record<string, any>;
    expect(node.mainEntity.numberOfItems).toBe(2);
    expect(node.mainEntity.itemListElement[1].name).toBe("B");
  });
});

describe("SEO — descrições de categoria (conteúdo duplicado)", () => {
  it("duas categorias da mesma loja geram descrições diferentes", () => {
    const a = categoryDescription({ category: "Ténis", storeName: "Sport", count: 4, sampleNames: ["Nimbus"] });
    const b = categoryDescription({ category: "Camisolas", storeName: "Sport", count: 9, sampleNames: ["Térmica"] });
    expect(a).not.toBe(b);
    expect(a).toContain("Ténis");
    expect(b).toContain("Camisolas");
  });

  it("respeita o limite de 160 caracteres da meta-descrição", () => {
    const d = categoryDescription({
      category: "Equipamento de Desporto ao Ar Livre",
      storeName: "Uma Loja com um Nome Bastante Comprido",
      count: 120,
      sampleNames: ["Produto com nome longo A", "Produto com nome longo B", "Produto com nome longo C"],
      priceFrom: "125.000,00 Kz",
    });
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it("título da categoria distingue-se do título da loja", () => {
    expect(categoryTitle("Ténis", "Sport")).not.toBe(storeTitle("Sport"));
    expect(categoryTitle("Ténis", "Sport")).toContain("Angola");
  });
});

describe("SEO — slugs de URL", () => {
  it("remove acentos e normaliza para minúsculas com hífens", () => {
    expect(slugify("Ténis de Corrida")).toBe("tenis-de-corrida");
    expect(slugify("Beleza & Saúde")).toBe("beleza-saude");
    expect(slugify("  Vários   espaços  ")).toBe("varios-espacos");
  });

  it("nunca devolve vazio", () => {
    expect(slugify("")).toBe("item");
    expect(slugify("!!!")).toBe("item");
  });

  it("caminho do produto usa categoria/nome", () => {
    expect(productSlugPath({ name: "Ténis Runner", category: "Calçado" })).toBe("calcado/tenis-runner");
    expect(productSlugPath({ name: "X", category: null })).toBe("geral/x");
  });

  it("resolve o rótulo da categoria a partir do slug da URL", () => {
    const labels = ["Ténis de Corrida", "Camisolas"];
    expect(resolveCategoryLabel("tenis-de-corrida", labels)).toBe("Ténis de Corrida");
    // Ligações antigas com o rótulo por extenso continuam a resolver.
    expect(resolveCategoryLabel("Ténis de Corrida", labels)).toBe("Ténis de Corrida");
    expect(resolveCategoryLabel("inexistente", labels)).toBeNull();
  });
});
