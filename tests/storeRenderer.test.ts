import { describe, it, expect } from "vitest";
import {
  renderStore,
  DEFAULT_LOGO,
  STORE_NOT_FOUND_MESSAGE,
} from "../src/storefront/storeRenderer.js";
import type { StorefrontResult } from "../src/services/storefrontResolver.js";
import type { Asset, Banner, Product, Store } from "../src/models/index.js";

/**
 * Testes unitários (por exemplo) da renderização da Loja publicada
 * (`renderStore`) — Tarefa 14.3.
 *
 * Cobrem comportamentos concretos da camada de renderização:
 *  - Exibição do Logótipo no cabeçalho e nos menus (Req. 6.5, 6.6).
 *  - Identidade visual de substituição na ausência de Logótipo (Req. 6.7).
 *  - A remoção de um Produto (ausência na lista resolvida) deixa de o exibir
 *    e a renderização reflete exatamente os produtos fornecidos (Req. 7.7).
 *  - A remoção de um Banner (ausência na lista resolvida) deixa de o exibir,
 *    refletindo exatamente os banners fornecidos, por ordem (Req. 8.7, 8.5).
 *  - Resultado `not_found` produz o view model "Loja não encontrada".
 */

const baseStore: Store = {
  id: "store-1",
  ownerId: "owner-1",
  name: "Loja do João",
  storeType: "Vestuário",
  templateId: "template-1",
  identifier: "loja-do-joao",
  subdomain: "loja-do-joao.mobisno.store",
  state: "Publicada",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const logoAsset: Asset = {
  id: "logo-1",
  storeId: "store-1",
  kind: "logo",
  url: "https://cdn.example.com/logo.png",
  format: "png",
  sizeBytes: 2048,
};

function makeProduct(overrides: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    storeId: "store-1",
    description: "",
    price: 100,
    available: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeBanner(id: string, position: number): Banner {
  return {
    id,
    storeId: "store-1",
    imageUrl: `https://cdn.example.com/${id}.png`,
    position,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function renderResult(overrides: Partial<Extract<StorefrontResult, { kind: "render" }>> = {}): StorefrontResult {
  return {
    kind: "render",
    store: baseStore,
    logo: null,
    banners: [],
    products: [],
    ...overrides,
  };
}

describe("renderStore — exibição do Logótipo (Req. 6.5, 6.6)", () => {
  it("apresenta o Logótipo no cabeçalho e nos menus quando existe um Logótipo", () => {
    const view = renderStore(renderResult({ logo: logoAsset }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    // Cabeçalho usa o Logótipo (Req. 6.5).
    expect(view.header.brand.kind).toBe("logo");
    if (view.header.brand.kind === "logo") {
      expect(view.header.brand.url).toBe(logoAsset.url);
      expect(view.header.brand.format).toBe(logoAsset.format);
    }

    // Menus usam o Logótipo (Req. 6.6).
    expect(view.menu.brand.kind).toBe("logo");
    if (view.menu.brand.kind === "logo") {
      expect(view.menu.brand.url).toBe(logoAsset.url);
      expect(view.menu.brand.format).toBe(logoAsset.format);
    }
  });

  it("usa a identidade visual de substituição predefinida quando não há Logótipo (Req. 6.7)", () => {
    const view = renderStore(renderResult({ logo: null }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    expect(view.header.brand.kind).toBe("fallback");
    if (view.header.brand.kind === "fallback") {
      expect(view.header.brand.identity).toBe(DEFAULT_LOGO);
    }

    expect(view.menu.brand.kind).toBe("fallback");
    if (view.menu.brand.kind === "fallback") {
      expect(view.menu.brand.identity).toBe(DEFAULT_LOGO);
    }
  });
});

describe("renderStore — remoção de Produto deixa de o exibir (Req. 7.7)", () => {
  const productA = makeProduct({ id: "product-a", name: "Camisa" });
  const productB = makeProduct({ id: "product-b", name: "Calças" });

  it("exibe os produtos presentes na lista resolvida", () => {
    const view = renderStore(renderResult({ products: [productA, productB] }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    const ids = view.products.map((p) => p.id);
    expect(ids).toEqual(["product-a", "product-b"]);
  });

  it("deixa de exibir um Produto removido (ausente da lista resolvida)", () => {
    // Após remoção, o produto B já não consta da lista de produtos resolvidos.
    const view = renderStore(renderResult({ products: [productA] }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    const ids = view.products.map((p) => p.id);
    expect(ids).toEqual(["product-a"]);
    expect(ids).not.toContain("product-b");
  });

  it("renderiza exatamente os produtos fornecidos, sem adicionar nem omitir", () => {
    const view = renderStore(renderResult({ products: [productB] }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    expect(view.products).toHaveLength(1);
    expect(view.products[0].id).toBe("product-b");
    expect(view.products[0].name).toBe("Calças");
  });
});

describe("renderStore — remoção de Banner deixa de o exibir (Req. 8.7, 8.5)", () => {
  const banner0 = makeBanner("banner-0", 0);
  const banner1 = makeBanner("banner-1", 1);
  const banner2 = makeBanner("banner-2", 2);

  it("exibe os banners presentes, pela ordem de adição", () => {
    const view = renderStore(renderResult({ banners: [banner0, banner1, banner2] }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    expect(view.banners.map((b) => b.id)).toEqual([
      "banner-0",
      "banner-1",
      "banner-2",
    ]);
  });

  it("deixa de exibir um Banner removido (ausente da lista resolvida)", () => {
    // Banner do meio removido: a lista resolvida já não o contém.
    const view = renderStore(renderResult({ banners: [banner0, banner2] }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    const ids = view.banners.map((b) => b.id);
    expect(ids).toEqual(["banner-0", "banner-2"]);
    expect(ids).not.toContain("banner-1");
  });

  it("reflete exatamente os banners fornecidos, ordenados por posição", () => {
    // Mesmo fornecidos fora de ordem, são exibidos por posição crescente.
    const view = renderStore(renderResult({ banners: [banner2, banner0] }));

    expect(view.kind).toBe("render");
    if (view.kind !== "render") return;

    expect(view.banners.map((b) => b.id)).toEqual(["banner-0", "banner-2"]);
  });
});

describe("renderStore — resultado not_found", () => {
  it("produz o view model 'Loja não encontrada'", () => {
    const view = renderStore({ kind: "not_found" });

    expect(view.kind).toBe("not_found");
    if (view.kind !== "not_found") return;
    expect(view.message).toBe(STORE_NOT_FOUND_MESSAGE);
    expect(view.message).toBe("Loja não encontrada");
  });
});
