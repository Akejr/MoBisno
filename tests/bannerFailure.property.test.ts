import { describe, it, expect } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import { isOk, isErr } from "../src/models/index.js";
import type { Banner } from "../src/models/index.js";
import { createBannerService } from "../src/services/bannerService.js";
import { createInMemoryBannerRepository } from "../src/services/bannerRepository.js";
import {
  createFileService,
  type StorageBackend,
  type UploadedFile,
} from "../src/services/fileService.js";

/** Assinatura PNG válida — usada para construir Banners aceites com sucesso. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Constrói um conteúdo PNG válido (assinatura + preenchimento) de `size` bytes. */
function buildPng(size: number): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, PNG_SIGNATURE.length));
  bytes.set(PNG_SIGNATURE, 0);
  return bytes;
}

/** Ficheiro PNG válido (aceite pela BANNER_POLICY). */
const validFileArb: fc.Arbitrary<UploadedFile> = fc
  .integer({ min: PNG_SIGNATURE.length, max: 4096 })
  .map((size) => ({ content: buildPng(size) }));

/**
 * Snapshot estável de um Banner para comparação de igualdade profunda. Captura
 * a identidade (id), a ordem (position) e o conteúdo relevante.
 */
function snapshot(banners: Banner[]) {
  return banners.map((b) => ({
    id: b.id,
    storeId: b.storeId,
    imageUrl: b.imageUrl,
    position: b.position,
    createdAt: b.createdAt,
  }));
}

describe("BannerService — propriedades", () => {
  it("preserva os Banners existentes quando o carregamento de um novo Banner falha", async () => {
    // **Feature: mobisno-store-builder, Property 18: Preservação de Banners em falha de carregamento**
    // **Validates: Requirements 8.6**
    await assertPropertyAsync(
      fc.asyncProperty(
        // Número de Banners pré-existentes adicionados com sucesso (0–9, abaixo do limite de 10).
        fc.integer({ min: 0, max: 9 }),
        // Conteúdos válidos para esses Banners iniciais.
        fc.array(validFileArb, { minLength: 9, maxLength: 9 }),
        // Escolha do modo de falha: "invalido" (FICHEIRO_INVALIDO) ou "storage" (FALHA_CARREGAMENTO).
        fc.constantFrom<"invalido" | "storage">("invalido", "storage"),
        // Conteúdo inválido a usar no caso "invalido": vazio ou bytes não reconhecidos.
        fc.oneof(
          fc.constant(new Uint8Array(0)),
          fc
            .array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 64 })
            .map((rest) => {
              const content = new Uint8Array(rest.length + 1);
              content[0] = 0x00; // não corresponde a PNG/JPEG/SVG => corrompido
              content.set(rest, 1);
              return content;
            }),
        ),
        async (initialCount, validFiles, failureMode, invalidContent) => {
          const storeId = "store-1";
          const ownerId = "owner-1";

          // Repositório partilhado entre o serviço de trabalho e o serviço de falha.
          const bannerRepository = createInMemoryBannerRepository();

          // Serviço "de trabalho": backend de storage funcional para semear os Banners.
          let idCounter = 0;
          const workingService = createBannerService({
            bannerRepository,
            fileService: createFileService(),
            generateId: () => `banner-${++idCounter}`,
            now: () => "2024-01-01T00:00:00.000Z",
          });

          // Semeia `initialCount` Banners válidos com sucesso.
          for (let i = 0; i < initialCount; i++) {
            const added = await workingService.add(ownerId, storeId, validFiles[i]);
            if (!isOk(added)) {
              return false; // semeação deveria sempre suceder
            }
          }

          // Estado dos Banners antes da falha.
          const before = snapshot(await workingService.listOrdered(storeId));

          // Provoca uma falha de adição de um novo Banner.
          let result;
          if (failureMode === "invalido") {
            // (a) Ficheiro inválido => FICHEIRO_INVALIDO, usando o serviço de trabalho.
            result = await workingService.add(ownerId, storeId, { content: invalidContent });
          } else {
            // (b) Backend de storage que lança em `put` => FALHA_CARREGAMENTO.
            // Partilha o MESMO bannerRepository para garantir que observamos os mesmos Banners.
            const throwingStorage: StorageBackend = {
              async put(): Promise<string> {
                throw new Error("falha simulada no object storage");
              },
            };
            const failingService = createBannerService({
              bannerRepository,
              fileService: createFileService({ storage: throwingStorage }),
              generateId: () => `banner-falha-${++idCounter}`,
              now: () => "2024-01-01T00:00:00.000Z",
            });
            // Ficheiro válido para passar a validação e falhar no armazenamento.
            result = await failingService.add(ownerId, storeId, { content: buildPng(256) });
          }

          // A adição falhou.
          if (!isErr(result)) {
            return false;
          }
          if (failureMode === "invalido") {
            if (result.error.code !== "FICHEIRO_INVALIDO") {
              return false;
            }
          } else if (result.error.code !== "FALHA_CARREGAMENTO") {
            return false;
          }

          // O conjunto de Banners existentes permanece inalterado (ids, ordem e contagem).
          const after = snapshot(await workingService.listOrdered(storeId));
          expect(after).toEqual(before);
          expect(after).toHaveLength(initialCount);
          return true;
        },
      ),
    );
  });
});
