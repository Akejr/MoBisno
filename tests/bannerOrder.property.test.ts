import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import { createBannerService } from "../src/services/bannerService.js";
import { createInMemoryBannerRepository } from "../src/services/bannerRepository.js";
import { createFileService, type UploadedFile } from "../src/services/fileService.js";
import { isOk } from "../src/models/index.js";

/** Assinatura PNG: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Gerador de um ficheiro PNG válido (aceite pela BANNER_POLICY): conteúdo que
 * começa pela assinatura PNG, seguido de bytes arbitrários (corpo). O tamanho
 * mantém-se pequeno mas sempre acima de zero.
 */
const validBannerFileArb: fc.Arbitrary<UploadedFile> = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 32 })
  .map((body) => {
    const content = Uint8Array.from([...PNG_SIGNATURE, ...body]);
    return { content, fileName: "banner.png", declaredFormat: "png" };
  });

describe("BannerService — ordem de exibição de Banners (propriedade)", () => {
  it("a listagem respeita a ordem de adição (posições estritamente crescentes)", async () => {
    // **Feature: mobisno-store-builder, Property 17: Ordem de exibição de Banners**
    // **Validates: Requirements 8.5**
    await assertPropertyAsync(
      fc.asyncProperty(
        // Sequência de até 10 adições de Banner válidas (limite máximo por Loja).
        fc.array(validBannerFileArb, { minLength: 0, maxLength: 10 }),
        async (files) => {
          const storeId = "store-banner-order";
          const ownerId = "owner-banner-order";

          const bannerRepository = createInMemoryBannerRepository();
          const fileService = createFileService();
          const service = createBannerService({ bannerRepository, fileService });

          // Adiciona os Banners pela ordem da sequência, registando a ordem de
          // adição através do id atribuído a cada Banner criado.
          const additionOrderIds: string[] = [];
          for (const file of files) {
            const result = await service.add(ownerId, storeId, file);
            expect(isOk(result)).toBe(true);
            if (!isOk(result)) {
              return;
            }
            additionOrderIds.push(result.value.id);
          }

          const listed = await service.listOrdered(storeId);

          // 1. Todos os Banners adicionados são listados (sem perdas).
          expect(listed.length).toBe(additionOrderIds.length);

          // 2. As posições são estritamente crescentes pela ordem da listagem.
          for (let i = 1; i < listed.length; i++) {
            expect(listed[i].position).toBeGreaterThan(listed[i - 1].position);
          }

          // 3. A ordem dos ids na listagem é igual à ordem de adição.
          expect(listed.map((b) => b.id)).toEqual(additionOrderIds);
        },
      ),
    );
  });
});
