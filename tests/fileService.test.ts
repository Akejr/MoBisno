import { describe, it, expect } from "vitest";
import { isErr, isOk } from "../src/models/index.js";
// O barrel (src/services/index.ts) não é tocado nesta tarefa; importamos a
// fábrica e as políticas diretamente do seu módulo de origem.
import {
  createFileService,
  createInMemoryStorageBackend,
  detectFormat,
  LOGO_POLICY,
  PRODUCT_POLICY,
  BANNER_POLICY,
  MAX_FILE_BYTES,
  type StorageBackend,
  type UploadedFile,
} from "../src/services/fileService.js";

/** Conteúdo PNG mínimo: assinatura + bytes de preenchimento. */
function pngBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return bytes;
}

/** Conteúdo JPEG mínimo: assinatura SOI + preenchimento. */
function jpegBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff], 0);
  return bytes;
}

/** Conteúdo SVG (texto) com tamanho de preenchimento por comentário. */
function svgBytes(size = 64): Uint8Array {
  let text = "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>";
  if (text.length < size) {
    text += `<!--${"x".repeat(size - text.length - 7)}-->`;
  }
  return new TextEncoder().encode(text);
}

/** Conteúdo WebP mínimo: contentor RIFF "RIFF"<size>"WEBP" + preenchimento. */
function webpBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, 12));
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  return bytes;
}

function uploaded(content: Uint8Array, fileName?: string): UploadedFile {
  return { content, fileName };
}

describe("detectFormat (deteção por conteúdo / magic bytes)", () => {
  it("deteta PNG pela assinatura", () => {
    expect(detectFormat(pngBytes())).toBe("png");
  });

  it("deteta JPEG pela assinatura", () => {
    expect(detectFormat(jpegBytes())).toBe("jpeg");
  });

  it("deteta SVG que começa por <svg", () => {
    expect(detectFormat(svgBytes())).toBe("svg");
  });

  it("deteta SVG precedido por declaração XML", () => {
    const content = new TextEncoder().encode(
      "<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
    );
    expect(detectFormat(content)).toBe("svg");
  });

  it("deteta WebP pelo contentor RIFF/WEBP", () => {
    expect(detectFormat(webpBytes())).toBe("webp");
  });

  it("não confunde RIFF sem etiqueta WEBP (ex.: WAV) com WebP", () => {
    const riffWav = new Uint8Array(64);
    riffWav.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    riffWav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    expect(detectFormat(riffWav)).toBeNull();
  });

  it("aceita uma imagem de produto em WebP", () => {
    const service = createFileService();
    const result = service.validate(uploaded(webpBytes(2048), "foto.webp"), PRODUCT_POLICY);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.format).toBe("webp");
    }
  });

  it("ignora a extensão e deteta pelo conteúdo real", () => {
    const service = createFileService();
    // Conteúdo JPEG com um nome de ficheiro a fingir ser PNG.
    const result = service.validate(uploaded(jpegBytes(2048), "logo.png"), LOGO_POLICY);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.format).toBe("jpeg");
    }
  });

  it("devolve null para conteúdo não reconhecido", () => {
    expect(detectFormat(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("FileService.validate", () => {
  const service = createFileService();

  it("rejeita ficheiro vazio", () => {
    const result = service.validate(uploaded(new Uint8Array(0)), LOGO_POLICY);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe("empty");
    }
  });

  it("rejeita ficheiro corrompido (sem assinatura conhecida)", () => {
    const result = service.validate(uploaded(new Uint8Array([9, 9, 9, 9, 9])), PRODUCT_POLICY);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe("corrupted");
    }
  });

  it("rejeita formato não permitido pela política (SVG num Banner)", () => {
    const result = service.validate(uploaded(svgBytes(2048)), BANNER_POLICY);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe("unsupported_format");
    }
  });

  it("aceita PNG válido para Banner", () => {
    const result = service.validate(uploaded(pngBytes(2048)), BANNER_POLICY);
    expect(isOk(result)).toBe(true);
  });

  it("rejeita Logótipo abaixo do tamanho mínimo (1 KB)", () => {
    const result = service.validate(uploaded(pngBytes(512)), LOGO_POLICY);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe("too_small");
    }
  });

  it("aceita Logótipo exatamente no mínimo (1 KB)", () => {
    const result = service.validate(uploaded(pngBytes(1024)), LOGO_POLICY);
    expect(isOk(result)).toBe(true);
  });

  it("rejeita ficheiro acima do máximo (>5 MB)", () => {
    const result = service.validate(uploaded(pngBytes(MAX_FILE_BYTES + 1)), PRODUCT_POLICY);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe("too_large");
    }
  });

  it("aceita ficheiro exatamente no máximo (5 MB)", () => {
    const result = service.validate(uploaded(pngBytes(MAX_FILE_BYTES)), PRODUCT_POLICY);
    expect(isOk(result)).toBe(true);
  });
});

describe("FileService.store", () => {
  it("persiste um ficheiro validado e devolve o Asset com URL", async () => {
    const service = createFileService();
    const result = service.validate(uploaded(pngBytes(2048), "logo.png"), LOGO_POLICY);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const asset = await service.store("store-1", "logo", result.value);
    expect(asset.storeId).toBe("store-1");
    expect(asset.kind).toBe("logo");
    expect(asset.format).toBe("png");
    expect(asset.sizeBytes).toBe(2048);
    expect(asset.url).toContain("store-1/logo/");
  });

  it("usa um backend de storage injetável", async () => {
    const keys: string[] = [];
    const backend: StorageBackend = {
      async put(key, _content, _contentType) {
        keys.push(key);
        return `https://cdn.example/${key}`;
      },
    };
    const service = createFileService({ storage: backend, generateId: () => "fixed-id" });
    const result = service.validate(uploaded(jpegBytes(2048)), PRODUCT_POLICY);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const asset = await service.store("store-9", "product", result.value);
    expect(keys).toEqual(["store-9/product/fixed-id.jpg"]);
    expect(asset.url).toBe("https://cdn.example/store-9/product/fixed-id.jpg");
  });

  it("backend em memória devolve um URL de referência", async () => {
    const backend = createInMemoryStorageBackend();
    const url = await backend.put("k1", pngBytes(16), "image/png");
    expect(url).toContain("k1");
  });
});
