import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import {
  createBannerService,
  MAX_BANNERS_PER_STORE,
} from "../src/services/bannerService.js";
import { createInMemoryBannerRepository } from "../src/services/bannerRepository.js";
import {
  createFileService,
  type UploadedFile,
} from "../src/services/fileService.js";
import { isOk, isErr } from "../src/models/index.js";

/**
 * Constrói um ficheiro PNG válido dentro da BANNER_POLICY.
 * O conteúdo começa pela assinatura PNG (0x89 P N G 0x0D 0x0A 0x1A 0x0A) e tem
 * um tamanho confortavelmente dentro dos limites (não vazio, < 5 MB).
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makeValidBannerFile(): UploadedFile {
  const size = 2048;
  const content = new Uint8Array(size);
  content.set(PNG_SIGNATURE, 0);
  // Preenche o restante com bytes arbitrários determinísticos (irrelevantes
  // para a deteção de formato, que se baseia apenas na assinatura inicial).
  for (let i = PNG_SIGNATURE.length; i < size; i++) {
    content[i] = i % 256;
  }
  return { content, fileName: "banner.png", declaredFormat: "png" };
}

describe("BannerService — limite máximo de Banners (propriedade)", () => {
  it("nunca excede 10 Banners; adições para além de 10 são impedidas com mensagem, sem alterar os existentes", async () => {
    // **Feature: mobisno-store-builder, Property 16: Limite máximo de Banners**
    // **Validates: Requirements 8.1, 8.4**
    await assertPropertyAsync(
      fc.asyncProperty(
        // Número de tentativas de adição, cobrindo o intervalo 0..20 para
        // exercitar adições abaixo, no e acima do limite de 10.
        fc.integer({ min: 0, max: 20 }),
        async (attempts) => {
          const ownerId = "owner-1";
          const storeId = "store-1";

          const bannerRepository = createInMemoryBannerRepository();
          const fileService = createFileService();
          const service = createBannerService({ bannerRepository, fileService });

          // Ids dos Banners criados com sucesso, na ordem em que foram aceites.
          const succeededIds: string[] = [];

          for (let i = 0; i < attempts; i++) {
            // Snapshot dos Banners existentes antes da tentativa.
            const before = await service.listOrdered(storeId);
            const beforeIds = before.map((b) => b.id);

            const result = await service.add(ownerId, storeId, makeValidBannerFile());

            if (i < MAX_BANNERS_PER_STORE) {
              // As primeiras (até) 10 adições devem ser aceites.
              expect(isOk(result)).toBe(true);
              if (isOk(result)) {
                succeededIds.push(result.value.id);
              }
            } else {
              // Adições para além de 10 são impedidas com erro específico e
              // mensagem não vazia, sem alterar os Banners existentes.
              expect(isErr(result)).toBe(true);
              if (isErr(result)) {
                expect(result.error.code).toBe("MAXIMO_BANNERS_ATINGIDO");
                expect(result.error.reason.trim().length).toBeGreaterThan(0);
              }

              // Os Banners existentes permanecem inalterados (mesmos ids/ordem).
              const after = await service.listOrdered(storeId);
              expect(after.map((b) => b.id)).toEqual(beforeIds);
            }

            // Invariante global: o número de Banners nunca excede 10.
            const count = await bannerRepository.countByStore(storeId);
            expect(count).toBeLessThanOrEqual(MAX_BANNERS_PER_STORE);
          }

          // Estado final coerente: total = min(attempts, 10) e os ids
          // armazenados correspondem exatamente aos que foram aceites.
          const finalBanners = await service.listOrdered(storeId);
          const expectedCount = Math.min(attempts, MAX_BANNERS_PER_STORE);
          expect(finalBanners.length).toBe(expectedCount);
          expect(finalBanners.map((b) => b.id)).toEqual(succeededIds);
        },
      ),
    );
  });
});
