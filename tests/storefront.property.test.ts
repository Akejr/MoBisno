import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import {
  createStorefrontResolver,
  isValidResolutionIdentifierFormat,
  extractIdentifierFromHost,
} from "../src/services/storefrontResolver.js";
import { SUBDOMAIN_SUFFIX } from "../src/services/identifierService.js";
import { createInMemoryStoreRepository } from "../src/services/storeRepository.js";
import { createInMemoryAssetRepository } from "../src/services/assetRepository.js";
import { createInMemoryBannerRepository } from "../src/services/bannerRepository.js";
import { createInMemoryProductRepository } from "../src/services/productRepository.js";
import type {
  Asset,
  Banner,
  Product,
  Store,
  StoreState,
} from "../src/models/index.js";

/**
 * Identificadores do plano de Administração que o resolvedor trata sempre como
 * "Loja não encontrada", mesmo que correspondam a uma Loja Publicada. Replicado
 * aqui para o oráculo independente (o conjunto interno do resolvedor não é
 * exportado).
 */
const ADMIN_PLANE_IDENTIFIERS = new Set(["app", "www"]);

/** Bloco de caracteres `[a-z0-9]` (1–8 chars), unidade base de um identificador. */
const blockArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars) => chars.join(""));

/**
 * Identificador com formato válido (2–63 caracteres): blocos `[a-z0-9]`
 * separados por hífenes únicos, sem hífen inicial/final/duplo.
 */
const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(blockArb, { minLength: 1, maxLength: 4 })
  .map((blocks) => blocks.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63 && isValidResolutionIdentifierFormat(id));

/** Estado da Loja gerado: Rascunho ou Publicada. */
const stateArb: fc.Arbitrary<StoreState> = fc.constantFrom<StoreState>(
  "Rascunho",
  "Publicada",
);

/**
 * Gerador de host parametrizado pelo identificador da Loja semeada. Produz
 * três famílias de cenários:
 *  1. o subdomínio exato da Loja semeada (deve renderizar se Publicada);
 *  2. um subdomínio de identificador válido mas inexistente;
 *  3. um host malformado: identificador de formato inválido, domínio errado
 *     ou identificador do plano de Administração (app/www).
 */
function hostArbFor(storeIdentifier: string): fc.Arbitrary<string> {
  const matchingHost = fc.constant(`${storeIdentifier}${SUBDOMAIN_SUFFIX}`);

  const nonExistentHost = validIdentifierArb
    .filter((id) => id !== storeIdentifier)
    .map((id) => `${id}${SUBDOMAIN_SUFFIX}`);

  const malformedHost = fc.oneof(
    // Formato de identificador inválido (hífen inicial/final/duplo, char inválido, vazio).
    fc.constantFrom(
      `-bad${SUBDOMAIN_SUFFIX}`,
      `bad-${SUBDOMAIN_SUFFIX}`,
      `ba--d${SUBDOMAIN_SUFFIX}`,
      `b_d${SUBDOMAIN_SUFFIX}`,
      `bad!${SUBDOMAIN_SUFFIX}`,
      `loja com espaco${SUBDOMAIN_SUFFIX}`,
      SUBDOMAIN_SUFFIX,
    ),
    // Domínio errado (não pertence à Plataforma).
    fc.constantFrom(
      "loja.example.com",
      "google.com",
      "loja.mobisno.net",
      "mobisno.com",
      "app.outrodominio.com",
    ),
    // Identificadores do plano de Administração.
    fc.constantFrom(`app${SUBDOMAIN_SUFFIX}`, `www${SUBDOMAIN_SUFFIX}`),
  );

  return fc.oneof(matchingHost, nonExistentHost, malformedHost);
}

/**
 * Oráculo independente da resolução de storefront (Property 19). Replica a
 * especificação: renderiza se e só se o identificador extraído do host tiver
 * formato de resolução válido, não pertencer ao plano de Administração,
 * corresponder à Loja existente e essa Loja estiver Publicada.
 */
function oracleKind(
  host: string,
  storeIdentifier: string,
  state: StoreState,
): "render" | "not_found" {
  const identifier = extractIdentifierFromHost(host);
  if (identifier === null) {
    return "not_found";
  }
  if (ADMIN_PLANE_IDENTIFIERS.has(identifier)) {
    return "not_found";
  }
  if (!isValidResolutionIdentifierFormat(identifier)) {
    return "not_found";
  }
  if (identifier !== storeIdentifier) {
    return "not_found";
  }
  if (state !== "Publicada") {
    return "not_found";
  }
  return "render";
}

/** Cenário gerado: Loja semeada + recursos + host a resolver. */
interface Scenario {
  storeIdentifier: string;
  state: StoreState;
  hasLogo: boolean;
  productAvailability: boolean[];
  bannerCount: number;
  host: string;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    storeIdentifier: validIdentifierArb,
    state: stateArb,
    hasLogo: fc.boolean(),
    productAvailability: fc.array(fc.boolean(), { minLength: 0, maxLength: 8 }),
    bannerCount: fc.integer({ min: 0, max: 5 }),
  })
  .chain((base) =>
    hostArbFor(base.storeIdentifier).map((host) => ({ ...base, host })),
  );

describe("StorefrontResolver — resolução de storefront por subdomínio (propriedade)", () => {
  it("renderiza a Loja se e só se o identificador é válido, existe e está Publicada; caso contrário 'Loja não encontrada' sem expor dados", async () => {
    // **Feature: mobisno-store-builder, Property 19: Resolução de storefront por subdomínio**
    // **Validates: Requirements 9.1, 9.3, 9.4, 9.5**
    await assertPropertyAsync(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const storeId = "store-1";
        const store: Store = {
          id: storeId,
          ownerId: "owner-1",
          name: "Loja de Teste",
          storeType: "Outro",
          templateId: "template-1",
          identifier: scenario.storeIdentifier,
          subdomain: `${scenario.storeIdentifier}${SUBDOMAIN_SUFFIX}`,
          state: scenario.state,
          createdAt: "2024-01-01T00:00:00.000Z",
        };

        // Logótipo (opcional).
        const assets: Asset[] = scenario.hasLogo
          ? [
              {
                id: "logo-1",
                storeId,
                kind: "logo",
                url: "https://cdn.example.com/logo.png",
                format: "png",
                sizeBytes: 2048,
              },
            ]
          : [];

        // Banners (ordem de adição via position).
        const banners: Banner[] = Array.from(
          { length: scenario.bannerCount },
          (_unused, index) => ({
            id: `banner-${index}`,
            storeId,
            imageUrl: `https://cdn.example.com/banner-${index}.png`,
            position: index,
            createdAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        // Produtos (disponíveis e indisponíveis).
        const products: Product[] = scenario.productAvailability.map(
          (available, index) => ({
            id: `product-${index}`,
            storeId,
            name: `Produto ${index}`,
            description: "",
            price: 100,
            available,
            createdAt: "2024-01-01T00:00:00.000Z",
          }),
        );
        const expectedAvailableIds = new Set(
          products.filter((p) => p.available === true).map((p) => p.id),
        );

        const resolver = createStorefrontResolver({
          storeRepository: createInMemoryStoreRepository([store]),
          assetRepository: createInMemoryAssetRepository(assets),
          bannerRepository: createInMemoryBannerRepository(banners),
          productRepository: createInMemoryProductRepository(products),
        });

        const result = await resolver.resolve(scenario.host);
        const expectedKind = oracleKind(
          scenario.host,
          scenario.storeIdentifier,
          scenario.state,
        );

        // O tipo de resultado coincide exatamente com o oráculo independente.
        expect(result.kind).toBe(expectedKind);

        if (expectedKind === "not_found") {
          // Não expõe quaisquer dados da Loja: o objeto contém apenas { kind }.
          expect(result).toEqual({ kind: "not_found" });
          expect(Object.keys(result)).toEqual(["kind"]);
          const exposed = result as Record<string, unknown>;
          expect(exposed.store).toBeUndefined();
          expect(exposed.logo).toBeUndefined();
          expect(exposed.banners).toBeUndefined();
          expect(exposed.products).toBeUndefined();
          return;
        }

        // render: inclui a Loja correta e apenas os produtos disponíveis.
        expect(result.kind).toBe("render");
        if (result.kind !== "render") {
          return;
        }
        expect(result.store.id).toBe(storeId);
        expect(result.store.identifier).toBe(scenario.storeIdentifier);
        expect(result.store.state).toBe("Publicada");

        // Apenas produtos disponíveis são expostos.
        const renderedProductIds = new Set(result.products.map((p) => p.id));
        expect(renderedProductIds).toEqual(expectedAvailableIds);
        for (const product of result.products) {
          expect(product.available).toBe(true);
          expect(product.storeId).toBe(storeId);
        }

        // Logótipo coerente com a presença/ausência semeada.
        if (scenario.hasLogo) {
          expect(result.logo).not.toBeNull();
        } else {
          expect(result.logo).toBeNull();
        }

        // Banners pela ordem de adição (position estritamente crescente).
        expect(result.banners.map((b) => b.id)).toEqual(
          banners.map((b) => b.id),
        );
        for (const banner of result.banners) {
          expect(banner.storeId).toBe(storeId);
        }
      }),
    );
  });
});
