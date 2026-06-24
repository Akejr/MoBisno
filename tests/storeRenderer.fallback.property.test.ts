import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  renderStore,
  DEFAULT_LOGO,
} from "../src/storefront/storeRenderer.js";
import type { StorefrontResult } from "../src/services/storefrontResolver.js";
import type { Asset, ImageFormat, Store, StoreType } from "../src/models/index.js";

/** Bloco de caracteres `[a-z0-9]` (1–8 chars), unidade base de um identificador. */
const blockArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars) => chars.join(""));

/** Identificador válido (2–63 chars): blocos `[a-z0-9]` separados por hífenes únicos. */
const identifierArb: fc.Arbitrary<string> = fc
  .array(blockArb, { minLength: 1, maxLength: 4 })
  .map((blocks) => blocks.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63);

/** Tipo de Loja gerado. */
const storeTypeArb: fc.Arbitrary<StoreType> = fc.constantFrom<StoreType>(
  "Vestuário",
  "Alimentação",
  "Eletrónica",
  "Beleza",
  "Serviços",
  "Outro",
);

/** Formato de imagem gerado para o Logótipo (Asset). */
const imageFormatArb: fc.Arbitrary<ImageFormat> = fc.constantFrom<ImageFormat>(
  "png",
  "jpeg",
  "svg",
);

/** Loja válida e Publicada (o nome inclui acentos/espaços para exercitar a marca). */
const storeArb: fc.Arbitrary<Store> = fc
  .record({
    name: fc.string({ minLength: 2, maxLength: 60 }),
    storeType: storeTypeArb,
    identifier: identifierArb,
  })
  .map(({ name, storeType, identifier }) => ({
    id: "store-1",
    ownerId: "owner-1",
    name,
    storeType,
    templateId: "template-1",
    identifier,
    subdomain: `${identifier}.mobisno.store`,
    state: "Publicada" as const,
    createdAt: "2024-01-01T00:00:00.000Z",
  }));

/** Logótipo (Asset) gerado, com URL e formato variáveis. */
const logoArb: fc.Arbitrary<Asset> = fc
  .record({
    url: fc.webUrl(),
    format: imageFormatArb,
    sizeBytes: fc.integer({ min: 1024, max: 5 * 1024 * 1024 }),
  })
  .map(({ url, format, sizeBytes }) => ({
    id: "logo-1",
    storeId: "store-1",
    kind: "logo" as const,
    url,
    format,
    sizeBytes,
  }));

/** Logótipo presente (Asset) ou ausente (null), gerado aleatoriamente. */
const logoOrNullArb: fc.Arbitrary<Asset | null> = fc.option(logoArb, {
  nil: null,
  freq: 2,
});

describe("StoreRenderer — identidade visual de substituição (propriedade)", () => {
  it("usa a identidade de substituição predefinida sem Logótipo e o Logótipo quando definido, no cabeçalho e nos menus", () => {
    // **Feature: mobisno-store-builder, Property 12: Identidade visual de substituição na ausência de Logótipo**
    // **Validates: Requirements 6.7**
    assertProperty(
      fc.property(storeArb, logoOrNullArb, (store, logo) => {
        const result: StorefrontResult = {
          kind: "render",
          store,
          logo,
          banners: [],
          products: [],
        };

        const view = renderStore(result);

        // A renderização de uma Loja Publicada produz sempre um view model de render.
        expect(view.kind).toBe("render");
        if (view.kind !== "render") {
          return;
        }

        const { header, menu } = view;

        if (logo === null) {
          // Sem Logótipo: cabeçalho e menus usam a identidade de substituição predefinida.
          expect(header.brand.kind).toBe("fallback");
          expect(menu.brand.kind).toBe("fallback");
          if (header.brand.kind === "fallback") {
            expect(header.brand.identity).toEqual(DEFAULT_LOGO);
          }
          if (menu.brand.kind === "fallback") {
            expect(menu.brand.identity).toEqual(DEFAULT_LOGO);
          }
        } else {
          // Com Logótipo: cabeçalho e menus usam o Logótipo (Asset).
          expect(header.brand.kind).toBe("logo");
          expect(menu.brand.kind).toBe("logo");
          if (header.brand.kind === "logo") {
            expect(header.brand.url).toBe(logo.url);
            expect(header.brand.format).toBe(logo.format);
          }
          if (menu.brand.kind === "logo") {
            expect(menu.brand.url).toBe(logo.url);
            expect(menu.brand.format).toBe(logo.format);
          }
        }
      }),
    );
  });
});
