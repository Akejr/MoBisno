import { describe, it } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import { isOk, isErr } from "../src/models/index.js";
import type { Asset, AssetKind, ImageFormat } from "../src/models/index.js";
import {
  createFileService,
  detectFormat,
  LOGO_POLICY,
  PRODUCT_POLICY,
  BANNER_POLICY,
  MAX_FILE_BYTES,
  LOGO_MIN_BYTES,
  type FilePolicy,
  type StorageBackend,
  type UploadedFile,
} from "../src/services/fileService.js";

/**
 * Construtores de conteúdo com formato conhecido por construção. Servem de
 * oráculo independente: sabemos qual o formato (ou ausência de formato) sem
 * depender da implementação que está a ser testada.
 */

/** PNG válido com a assinatura nos primeiros bytes e o tamanho pedido. */
function buildPng(size: number): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const bytes = new Uint8Array(Math.max(size, sig.length));
  bytes.set(sig, 0);
  return bytes;
}

/** JPEG válido com a assinatura SOI nos primeiros bytes e o tamanho pedido. */
function buildJpeg(size: number): Uint8Array {
  const sig = [0xff, 0xd8, 0xff];
  const bytes = new Uint8Array(Math.max(size, sig.length));
  bytes.set(sig, 0);
  return bytes;
}

/** SVG válido (texto) com preenchimento por comentário até ao tamanho pedido. */
function buildSvg(size: number): Uint8Array {
  const encoder = new TextEncoder();
  let text = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  let bytes = encoder.encode(text);
  if (size > bytes.length) {
    const padCount = size - bytes.length;
    text = `<svg xmlns="http://www.w3.org/2000/svg"><!--${"x".repeat(padCount)}--></svg>`;
    bytes = encoder.encode(text);
  }
  return bytes;
}

/** Tamanhos que exercitam as fronteiras das políticas (mín. 1 KB, máx. 5 MB). */
const sizeArb = fc.oneof(
  fc.constantFrom(
    8,
    512,
    LOGO_MIN_BYTES - 1, // 1023 (abaixo do mínimo do Logótipo)
    LOGO_MIN_BYTES, // 1024 (no mínimo do Logótipo)
    LOGO_MIN_BYTES + 1,
    2048,
    MAX_FILE_BYTES - 1,
    MAX_FILE_BYTES, // 5 MB (no máximo)
    MAX_FILE_BYTES + 1, // acima do máximo
  ),
  fc.integer({ min: 1, max: 8192 }),
);

type FileSpec = { content: Uint8Array; knownFormat: ImageFormat | null };

/** Ficheiros com formato válido (PNG/JPEG/SVG) e tamanhos variados. */
const validFileArb: fc.Arbitrary<FileSpec> = fc
  .record({
    fmt: fc.constantFrom<ImageFormat>("png", "jpeg", "svg"),
    size: sizeArb,
  })
  .map(({ fmt, size }) => {
    const content =
      fmt === "png" ? buildPng(size) : fmt === "jpeg" ? buildJpeg(size) : buildSvg(size);
    return { content, knownFormat: fmt };
  });

/** Conteúdo corrompido / não reconhecido: primeiro byte 0x00 garante ausência de assinatura. */
const corruptedFileArb: fc.Arbitrary<FileSpec> = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 128 })
  .map((rest) => {
    const content = new Uint8Array(rest.length + 1);
    content[0] = 0x00; // não corresponde a PNG, JPEG nem SVG
    content.set(rest, 1);
    return { content, knownFormat: null };
  });

/** Ficheiro vazio. */
const emptyFileArb: fc.Arbitrary<FileSpec> = fc.constant({
  content: new Uint8Array(0),
  knownFormat: null,
});

const fileArb: fc.Arbitrary<FileSpec> = fc.oneof(
  { weight: 3, arbitrary: validFileArb },
  { weight: 1, arbitrary: corruptedFileArb },
  { weight: 1, arbitrary: emptyFileArb },
);

const policyArb: fc.Arbitrary<FilePolicy> = fc.constantFrom(
  LOGO_POLICY,
  PRODUCT_POLICY,
  BANNER_POLICY,
);

const KINDS: AssetKind[] = ["logo", "product", "banner"];

describe("FileService — propriedades", () => {
  it("aceita um ficheiro se e só se o formato e o tamanho respeitarem a política; rejeitados não são persistidos", async () => {
    // **Feature: mobisno-store-builder, Property 11: Validação de ficheiro por política**
    // **Validates: Requirements 6.2, 6.3, 6.4, 7.4, 8.2, 8.3**
    await assertPropertyAsync(
      fc.asyncProperty(
        fileArb,
        policyArb,
        fc.constantFrom(...KINDS),
        async (file, policy, kind) => {
          // Backend que regista cada persistência efetiva.
          let putCount = 0;
          const backend: StorageBackend = {
            async put(key) {
              putCount += 1;
              return `memory://${key}`;
            },
          };
          let idCounter = 0;
          const service = createFileService({
            storage: backend,
            generateId: () => `asset-${++idCounter}`,
          });

          // Recurso anterior já existente para a Loja (deve permanecer inalterado em caso de rejeição).
          const previousAsset: Asset = {
            id: "asset-anterior",
            storeId: "store-1",
            kind,
            url: "memory://store-1/anterior",
            format: "png",
            sizeBytes: 2048,
          };
          let currentAsset: Asset = previousAsset;

          const size = file.content.length;
          const detected = file.knownFormat;

          // Oráculo independente: a deteção por conteúdo coincide com o formato conhecido.
          if (detectFormat(file.content) !== detected) {
            return false;
          }

          // Aceitação esperada: não vazio, formato detetado permitido e tamanho dentro dos limites.
          const expectedAccept =
            size > 0 &&
            detected !== null &&
            policy.allowedFormats.includes(detected) &&
            size >= policy.minBytes &&
            size <= policy.maxBytes;

          const uploaded: UploadedFile = { content: file.content };
          const result = service.validate(uploaded, policy);

          if (expectedAccept) {
            if (!isOk(result)) {
              return false;
            }
            // Ficheiro aceite é persistido e passa a ser o recurso atual.
            const asset = await service.store("store-1", kind, result.value);
            currentAsset = asset;
            return (
              asset.format === detected &&
              asset.sizeBytes === size &&
              putCount === 1
            );
          }

          // Ficheiro rejeitado: erro, nenhuma persistência e recurso anterior inalterado.
          return isErr(result) && putCount === 0 && currentAsset === previousAsset;
        },
      ),
    );
  });
});
