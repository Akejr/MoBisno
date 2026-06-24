import { describe, it, expect } from "vitest";
import type { Asset, Banner, Product, Store } from "../src/models/index.js";
import { isErr, isOk } from "../src/models/index.js";
// O barrel (src/services/index.ts) não é tocado nesta tarefa; importamos cada
// fábrica diretamente do seu módulo de origem.
import { createInMemoryStoreRepository as makeStoreRepo } from "../src/services/storeRepository.js";
import { createInMemoryProductRepository as makeProductRepo } from "../src/services/productRepository.js";
import { createInMemoryBannerRepository as makeBannerRepo } from "../src/services/bannerRepository.js";
import { createInMemoryAssetRepository as makeAssetRepo } from "../src/services/assetRepository.js";

function makeStore(overrides: Partial<Store> = {}): Store {
  const identifier = overrides.identifier ?? "loja-teste";
  return {
    id: overrides.id ?? "store-1",
    ownerId: overrides.ownerId ?? "owner-1",
    name: overrides.name ?? "Loja Teste",
    storeType: overrides.storeType ?? "Outro",
    templateId: overrides.templateId ?? "template-1",
    identifier,
    subdomain: overrides.subdomain ?? `${identifier}.mobisno.store`,
    state: overrides.state ?? "Rascunho",
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id ?? "product-1",
    storeId: overrides.storeId ?? "store-1",
    name: overrides.name ?? "Produto",
    description: overrides.description ?? "",
    price: overrides.price ?? 10,
    imageUrl: overrides.imageUrl,
    available: overrides.available ?? true,
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  };
}

function makeBanner(overrides: Partial<Banner> = {}): Banner {
  return {
    id: overrides.id ?? "banner-1",
    storeId: overrides.storeId ?? "store-1",
    imageUrl: overrides.imageUrl ?? "https://cdn/banner.png",
    position: overrides.position ?? 0,
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: overrides.id ?? "asset-1",
    storeId: overrides.storeId ?? "store-1",
    kind: overrides.kind ?? "logo",
    url: overrides.url ?? "https://cdn/logo.png",
    format: overrides.format ?? "png",
    sizeBytes: overrides.sizeBytes ?? 2048,
  };
}

describe("StoreRepository — invariantes e isolamento", () => {
  it("cria uma Loja com identificador único e subdomínio coerente", async () => {
    const repo = makeStoreRepo();
    const result = await repo.create(makeStore());
    expect(isOk(result)).toBe(true);
  });

  it("rejeita identificador duplicado na Plataforma", async () => {
    const repo = makeStoreRepo([makeStore({ id: "store-1", identifier: "minha-loja" })]);
    const result = await repo.create(
      makeStore({ id: "store-2", ownerId: "owner-2", identifier: "minha-loja" }),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("IDENTIFICADOR_DUPLICADO");
    }
  });

  it("rejeita identificador duplicado ignorando maiúsculas/minúsculas", async () => {
    const repo = makeStoreRepo([makeStore({ id: "store-1", identifier: "minha-loja" })]);
    // mesmo identificador, mas com caixa diferente no índice de unicidade
    const result = await repo.create(
      makeStore({ id: "store-2", identifier: "MINHA-LOJA", subdomain: "MINHA-LOJA.mobisno.store" }),
    );
    expect(isErr(result)).toBe(true);
  });

  it("rejeita subdomínio incoerente com o identificador", async () => {
    const repo = makeStoreRepo();
    const result = await repo.create(
      makeStore({ identifier: "loja-a", subdomain: "loja-b.mobisno.store" }),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("SUBDOMINIO_INCOERENTE");
    }
  });

  it("isola leituras por ownerId (findByIdForOwner)", async () => {
    const repo = makeStoreRepo([makeStore({ id: "store-1", ownerId: "owner-1" })]);
    expect(await repo.findByIdForOwner("owner-1", "store-1")).not.toBeNull();
    // outro dono não consegue ler a Loja
    expect(await repo.findByIdForOwner("owner-2", "store-1")).toBeNull();
  });

  it("listByOwner devolve apenas as Lojas do Dono", async () => {
    const repo = makeStoreRepo([
      makeStore({ id: "s1", ownerId: "owner-1", identifier: "a" }),
      makeStore({ id: "s2", ownerId: "owner-2", identifier: "b" }),
      makeStore({ id: "s3", ownerId: "owner-1", identifier: "c" }),
    ]);
    const stores = await repo.listByOwner("owner-1");
    expect(stores.map((s) => s.id).sort()).toEqual(["s1", "s3"]);
  });

  it("update rejeita Loja de outro Dono (isolamento)", async () => {
    const repo = makeStoreRepo([makeStore({ id: "store-1", ownerId: "owner-1" })]);
    const result = await repo.update("owner-2", makeStore({ id: "store-1", name: "Hack" }));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("LOJA_INEXISTENTE");
    }
  });

  it("findByIdentifier resolve a Loja independentemente do Dono", async () => {
    const repo = makeStoreRepo([makeStore({ id: "store-1", identifier: "publica" })]);
    const store = await repo.findByIdentifier("publica");
    expect(store?.id).toBe("store-1");
    expect(await repo.isIdentifierTaken("publica")).toBe(true);
    expect(await repo.isIdentifierTaken("inexistente")).toBe(false);
  });
});

describe("ProductRepository — isolamento por storeId", () => {
  it("não devolve Produto de outra Loja", async () => {
    const repo = makeProductRepo([makeProduct({ id: "p1", storeId: "store-1" })]);
    expect(await repo.findById("store-1", "p1")).not.toBeNull();
    expect(await repo.findById("store-2", "p1")).toBeNull();
  });

  it("não remove Produto de outra Loja", async () => {
    const repo = makeProductRepo([makeProduct({ id: "p1", storeId: "store-1" })]);
    expect(await repo.remove("store-2", "p1")).toBe(false);
    expect(await repo.findById("store-1", "p1")).not.toBeNull();
  });

  it("não atualiza Produto de outra Loja", async () => {
    const repo = makeProductRepo([makeProduct({ id: "p1", storeId: "store-1" })]);
    const updated = await repo.update("store-2", makeProduct({ id: "p1", name: "Hack" }));
    expect(updated).toBeNull();
  });

  it("create força o storeId do recurso", async () => {
    const repo = makeProductRepo();
    const created = await repo.create("store-1", makeProduct({ id: "p1", storeId: "store-9" }));
    expect(created.storeId).toBe("store-1");
  });

  it("listByStore só devolve Produtos da Loja", async () => {
    const repo = makeProductRepo([
      makeProduct({ id: "p1", storeId: "store-1" }),
      makeProduct({ id: "p2", storeId: "store-2" }),
    ]);
    const list = await repo.listByStore("store-1");
    expect(list.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("BannerRepository — isolamento, ordem e contagem", () => {
  it("lista Banners por ordem de posição", async () => {
    const repo = makeBannerRepo([
      makeBanner({ id: "b2", storeId: "store-1", position: 1 }),
      makeBanner({ id: "b1", storeId: "store-1", position: 0 }),
      makeBanner({ id: "b3", storeId: "store-1", position: 2 }),
    ]);
    const list = await repo.listByStore("store-1");
    expect(list.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("isola por storeId (find/remove/count)", async () => {
    const repo = makeBannerRepo([
      makeBanner({ id: "b1", storeId: "store-1" }),
      makeBanner({ id: "b2", storeId: "store-2" }),
    ]);
    expect(await repo.findById("store-2", "b1")).toBeNull();
    expect(await repo.remove("store-2", "b1")).toBe(false);
    expect(await repo.countByStore("store-1")).toBe(1);
  });
});

describe("AssetRepository — isolamento e Logótipo único", () => {
  it("upsertLogo mantém no máximo um Logótipo por Loja", async () => {
    const repo = makeAssetRepo();
    await repo.upsertLogo("store-1", makeAsset({ id: "a1" }));
    await repo.upsertLogo("store-1", makeAsset({ id: "a2" }));
    const logos = await repo.listByStore("store-1", "logo");
    expect(logos).toHaveLength(1);
    expect(logos[0]?.id).toBe("a2");
  });

  it("não devolve Asset de outra Loja", async () => {
    const repo = makeAssetRepo([makeAsset({ id: "a1", storeId: "store-1" })]);
    expect(await repo.findById("store-2", "a1")).toBeNull();
    expect(await repo.findLogo("store-2")).toBeNull();
  });
});
