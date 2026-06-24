/**
 * Testes unitários da UI do Painel_de_Administração (Tarefa 13.4).
 *
 * Foco em comportamentos específicos por exemplo (não quantificação universal):
 *  - Mensagens de rejeição de ficheiro no carregamento do Logótipo, mantendo o
 *    Logótipo anterior inalterado (Requisito 6.3).
 *  - Confirmação de remoção de Produto em dois passos: pedido de confirmação e
 *    remoção efetiva, deixando de constar na listagem (Requisito 7.7).
 *  - Remoção de Banner: deixa de ser listado e a mensagem de confirmação é a
 *    mensagem de remoção em português (Requisito 8.7).
 *
 * Os controladores de UI são agnósticos de framework, pelo que os testes ligam
 * diretamente os serviços reais (FileService, ProductService, BannerService)
 * com repositórios em memória, sem mocks.
 */

import { describe, it, expect } from "vitest";

import {
  createAdminLogoController,
  isLogoRejected,
  isLogoSaved,
  LOGO_SAVED_MESSAGE,
} from "../src/ui/adminLogo.js";
import {
  createAdminProductsController,
} from "../src/ui/adminProducts.js";
import {
  createAdminBannersController,
  BANNER_REMOVED_MESSAGE,
} from "../src/ui/adminBanners.js";

import {
  createFileService,
  MAX_FILE_BYTES,
  type UploadedFile,
} from "../src/services/fileService.js";
import { createInMemoryAssetRepository } from "../src/services/assetRepository.js";
import {
  createProductService,
} from "../src/services/productService.js";
import { createInMemoryProductRepository } from "../src/services/productRepository.js";
import {
  createBannerService,
} from "../src/services/bannerService.js";
import { createInMemoryBannerRepository } from "../src/services/bannerRepository.js";

/* -------------------------------------------------------------------------- */
/*  Auxiliares de conteúdo de imagem                                          */
/* -------------------------------------------------------------------------- */

/** Conteúdo PNG válido: assinatura + preenchimento até `size` bytes. */
function pngBytes(size = 2048): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return bytes;
}

/** Conteúdo SVG (texto) — formato não suportado pela política de Banner. */
function svgBytes(): Uint8Array {
  return new TextEncoder().encode(
    "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
  );
}

function uploaded(content: Uint8Array, fileName?: string): UploadedFile {
  return { content, fileName };
}

/* -------------------------------------------------------------------------- */
/*  Logótipo: mensagens de rejeição de ficheiro (Requisito 6.3)               */
/* -------------------------------------------------------------------------- */

describe("AdminLogoController — rejeição de ficheiro (Req. 6.3, 6.4)", () => {
  const STORE_ID = "store-logo";

  it("rejeita um formato não suportado e mantém o Logótipo anterior inalterado", async () => {
    const fileService = createFileService();
    const assetRepository = createInMemoryAssetRepository();
    const controller = createAdminLogoController({
      storeId: STORE_ID,
      fileService,
      assetRepository,
    });

    // 1. Guardar primeiro um Logótipo válido (PNG).
    const saved = await controller.uploadLogo(uploaded(pngBytes(2048), "logo.png"));
    expect(isLogoSaved(saved)).toBe(true);
    const previousLogo = await assetRepository.findLogo(STORE_ID);
    expect(previousLogo).not.toBeNull();

    // 2. Tentar carregar um ficheiro de formato não suportado (GIF/desconhecido).
    //    Bytes que não correspondem a nenhuma assinatura conhecida => corrompido.
    const rejected = await controller.uploadLogo(
      uploaded(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "logo.gif"),
    );

    expect(isLogoRejected(rejected)).toBe(true);
    if (isLogoRejected(rejected)) {
      // Mensagem em português indicando que o ficheiro é inválido/corrompido.
      expect(rejected.message).toMatch(/inválido|corrompido/i);
      expect(rejected.message.length).toBeGreaterThan(0);
    }

    // 3. O Logótipo anterior permanece inalterado (mesmo Asset).
    const afterLogo = await assetRepository.findLogo(STORE_ID);
    expect(afterLogo).toEqual(previousLogo);
  });

  it("rejeita um ficheiro demasiado grande (>5 MB) com mensagem de tamanho máximo", async () => {
    const fileService = createFileService();
    const assetRepository = createInMemoryAssetRepository();
    const controller = createAdminLogoController({
      storeId: STORE_ID,
      fileService,
      assetRepository,
    });

    // Logótipo inicial válido.
    await controller.uploadLogo(uploaded(pngBytes(2048), "logo.png"));
    const previousLogo = await assetRepository.findLogo(STORE_ID);

    // Ficheiro PNG acima do limite de 5 MB.
    const rejected = await controller.uploadLogo(
      uploaded(pngBytes(MAX_FILE_BYTES + 1), "grande.png"),
    );

    expect(isLogoRejected(rejected)).toBe(true);
    if (isLogoRejected(rejected)) {
      expect(rejected.error.kind).toBe("too_large");
      // Mensagem em português a indicar o tamanho máximo aceite.
      expect(rejected.message).toMatch(/máximo/i);
      expect(rejected.message).toMatch(/MB/);
    }

    // Logótipo anterior inalterado.
    const afterLogo = await assetRepository.findLogo(STORE_ID);
    expect(afterLogo).toEqual(previousLogo);
  });

  it("rejeita um ficheiro vazio com mensagem de ficheiro inválido", async () => {
    const fileService = createFileService();
    const assetRepository = createInMemoryAssetRepository();
    const controller = createAdminLogoController({
      storeId: STORE_ID,
      fileService,
      assetRepository,
    });

    const rejected = await controller.uploadLogo(uploaded(new Uint8Array(0), "vazio.png"));

    expect(isLogoRejected(rejected)).toBe(true);
    if (isLogoRejected(rejected)) {
      expect(rejected.error.kind).toBe("empty");
      expect(rejected.message).toMatch(/vazio/i);
    }

    // Nenhum Logótipo foi guardado.
    expect(await assetRepository.findLogo(STORE_ID)).toBeNull();
  });

  it("confirma a gravação de um Logótipo válido com a mensagem de confirmação", async () => {
    const fileService = createFileService();
    const controller = createAdminLogoController({ storeId: STORE_ID, fileService });

    const result = await controller.uploadLogo(uploaded(pngBytes(2048), "logo.png"));

    expect(isLogoSaved(result)).toBe(true);
    if (isLogoSaved(result)) {
      expect(result.message).toBe(LOGO_SAVED_MESSAGE);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Produtos: confirmação de remoção em dois passos (Requisito 7.7)           */
/* -------------------------------------------------------------------------- */

describe("AdminProductsController — confirmação de remoção (Req. 7.7)", () => {
  const OWNER_ID = "owner-1";
  const STORE_ID = "store-prod";

  function makeController() {
    const productRepository = createInMemoryProductRepository();
    const productService = createProductService({ productRepository });
    const controller = createAdminProductsController({ productService });
    return { controller };
  }

  it("requestRemoval devolve um pedido de confirmação para um Produto existente", async () => {
    const { controller } = makeController();
    const registered = await controller.register(OWNER_ID, STORE_ID, {
      name: "Sapatos",
      price: 5000,
    });
    expect(registered.status).toBe("success");
    if (registered.status !== "success") return;

    const request = await controller.requestRemoval(
      OWNER_ID,
      STORE_ID,
      registered.product.id,
    );

    expect(request.status).toBe("confirmation_required");
    if (request.status === "confirmation_required") {
      expect(request.prompt.productId).toBe(registered.product.id);
      expect(request.prompt.productName).toBe("Sapatos");
      // Mensagem de confirmação em português.
      expect(request.prompt.message).toMatch(/certeza/i);
      expect(request.prompt.confirmLabel).toBe("Remover");
      expect(request.prompt.cancelLabel).toBe("Cancelar");
    }
  });

  it("confirmRemoval remove o Produto, que deixa de constar na listagem", async () => {
    const { controller } = makeController();
    const registered = await controller.register(OWNER_ID, STORE_ID, {
      name: "Camisa",
      price: 3000,
    });
    expect(registered.status).toBe("success");
    if (registered.status !== "success") return;
    const productId = registered.product.id;

    // Antes da remoção: o Produto consta na listagem.
    const before = await controller.list(STORE_ID);
    expect(before.items.some((item) => item.id === productId)).toBe(true);

    // Passo 1: pedir confirmação.
    const request = await controller.requestRemoval(OWNER_ID, STORE_ID, productId);
    expect(request.status).toBe("confirmation_required");

    // Passo 2: confirmar a remoção.
    const removal = await controller.confirmRemoval(OWNER_ID, STORE_ID, productId);
    expect(removal.status).toBe("removed");
    if (removal.status === "removed") {
      expect(removal.productId).toBe(productId);
      expect(removal.message).toMatch(/removido/i);
    }

    // Depois da remoção: já não consta na listagem.
    const after = await controller.list(STORE_ID);
    expect(after.items.some((item) => item.id === productId)).toBe(false);
    expect(after.count).toBe(before.count - 1);
  });

  it("requestRemoval rejeita um Produto inexistente com mensagem de erro", async () => {
    const { controller } = makeController();

    const request = await controller.requestRemoval(OWNER_ID, STORE_ID, "inexistente");

    expect(request.status).toBe("error");
    if (request.status === "error") {
      expect(request.code).toBe("PRODUTO_NAO_ENCONTRADO");
      expect(request.message).toMatch(/não existe|não pertence/i);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Banners: remoção (Requisito 8.7)                                          */
/* -------------------------------------------------------------------------- */

describe("AdminBannersController — remoção de Banner (Req. 8.7)", () => {
  const OWNER_ID = "owner-1";
  const STORE_ID = "store-banner";

  function makeController() {
    const bannerRepository = createInMemoryBannerRepository();
    const fileService = createFileService();
    const bannerService = createBannerService({ bannerRepository, fileService });
    const controller = createAdminBannersController({ bannerService });
    return { controller };
  }

  it("adiciona e remove um Banner, deixando de o listar, com mensagem de confirmação", async () => {
    const { controller } = makeController();

    // Adicionar um Banner (PNG válido).
    const added = await controller.add(OWNER_ID, STORE_ID, uploaded(pngBytes(2048), "banner.png"));
    expect(added.status).toBe("added");
    if (added.status !== "added") return;
    const bannerId = added.banner.id;

    // Está listado.
    const before = await controller.list(STORE_ID);
    expect(before.items.some((item) => item.id === bannerId)).toBe(true);
    expect(before.count).toBe(1);

    // Remover.
    const removal = await controller.remove(OWNER_ID, STORE_ID, bannerId);
    expect(removal.status).toBe("removed");
    if (removal.status === "removed") {
      expect(removal.bannerId).toBe(bannerId);
      // A mensagem é a confirmação de remoção em português.
      expect(removal.message).toBe(BANNER_REMOVED_MESSAGE);
    }

    // Deixou de ser listado.
    const after = await controller.list(STORE_ID);
    expect(after.items.some((item) => item.id === bannerId)).toBe(false);
    expect(after.count).toBe(0);
    expect(after.isEmpty).toBe(true);
  });

  it("rejeita a remoção de um Banner inexistente com mensagem de erro", async () => {
    const { controller } = makeController();

    const removal = await controller.remove(OWNER_ID, STORE_ID, "inexistente");

    expect(removal.status).toBe("error");
    if (removal.status === "error") {
      expect(removal.code).toBe("BANNER_INEXISTENTE");
      expect(removal.message).toMatch(/não existe|não pertence/i);
    }
  });

  it("rejeita um Banner em formato não suportado (SVG) sem alterar os Banners existentes", async () => {
    const { controller } = makeController();

    // Banner válido inicial.
    const added = await controller.add(OWNER_ID, STORE_ID, uploaded(pngBytes(2048), "ok.png"));
    expect(added.status).toBe("added");

    const before = await controller.list(STORE_ID);

    // Tentar adicionar um SVG (não permitido pela política de Banner).
    const rejected = await controller.add(OWNER_ID, STORE_ID, uploaded(svgBytes(), "x.svg"));
    expect(rejected.status).toBe("error");
    if (rejected.status === "error") {
      expect(rejected.code).toBe("FICHEIRO_INVALIDO");
      expect(rejected.message).toMatch(/formato/i);
    }

    // Os Banners existentes não foram alterados.
    const after = await controller.list(STORE_ID);
    expect(after.count).toBe(before.count);
  });
});
