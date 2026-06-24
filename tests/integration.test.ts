import { describe, it, expect, beforeAll } from "vitest";

/**
 * Testes de integração e smoke (Tarefa 15.3).
 *
 * Exercitam o sistema ponta a ponta usando os módulos de wiring
 * (`createWizardFlow` e `createAdminPanel`) ligados aos serviços e à camada de
 * persistência em memória, validando os requisitos dependentes de
 * infraestrutura/tempo desta fase:
 *
 *  - Arranque do Assistente_de_Criação ≤ 3 s e disponibilidade da mensagem de
 *    retry em falha (Req. 1.2, 1.3).
 *  - Criação da Loja ≤ 10 s, com redireccionamento para o Painel_de_Administração
 *    (Req. 5.1, 5.3).
 *  - Propagação do Logótipo, do Produto disponível e do Banner para a Loja
 *    publicada (Req. 6.8, 7.5, 8.2).
 *  - Carregamento/renderização da Loja publicada ≤ 3 s e roteamento por
 *    subdomínio (render quando Publicada, not_found para subdomínio inexistente)
 *    (Req. 9.2).
 *
 * Todos os componentes correm em memória, pelo que as medições de tempo de
 * parede ficam muito abaixo dos limites; as asserções de tempo confirmam o
 * comportamento dentro dos prazos exigidos sem dependerem de infraestrutura
 * externa, mantendo o teste determinista.
 */

import {
  createHomePageViewModel,
  WIZARD_START_ERROR_MESSAGE,
  WIZARD_START_RETRY_LABEL,
} from "../src/ui/homePage.js";
import { WIZARD_FIELDS, type WizardStepData } from "../src/ui/wizardSteps.js";
import { createWizardFlow } from "../src/app/wizardFlow.js";
import { createAdminPanel, type AdminPanel } from "../src/app/adminPanel.js";
import {
  createAuthService,
  type AuthService,
  type Session,
} from "../src/services/authService.js";
import { createInMemoryOwnerRepository } from "../src/services/inMemoryOwnerRepository.js";
import { createIdentifierService } from "../src/services/identifierService.js";
import { createStoreService } from "../src/services/storeService.js";
import {
  createInMemoryStoreRepository,
  type StoreRepository,
} from "../src/services/storeRepository.js";
import type { Store, StoreType } from "../src/models/index.js";
import type { UploadedFile } from "../src/services/fileService.js";
import type { StoreViewModel } from "../src/storefront/storeRenderer.js";
import type { StorefrontResult } from "../src/services/storefrontResolver.js";

/* -------------------------------------------------------------------------- */
/*  Auxiliares deterministas                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Constrói conteúdo PNG válido: começa pela assinatura PNG
 * (0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A) preenchido até `sizeBytes` bytes.
 * Permite satisfazer o tamanho mínimo do Logótipo (1 KB) e a deteção por
 * conteúdo (magic bytes) usada pelo FileService.
 */
function makePng(sizeBytes: number): Uint8Array {
  const content = new Uint8Array(Math.max(sizeBytes, 8));
  content.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return content;
}

/** Ficheiro carregado de Logótipo: PNG ≥ 1 KB (Req. 6.2). */
const LOGO_FILE: UploadedFile = { content: makePng(2048), fileName: "logo.png" };

/** Ficheiro carregado de Banner: PNG (Req. 8.2). */
const BANNER_FILE: UploadedFile = { content: makePng(1024), fileName: "banner.png" };

const STORE_TYPE: StoreType = "Vestuário";
const TEMPLATE_ID = "template-1";
const IDENTIFIER = "loja-teste";

/** Constrói o conjunto completo de serviços partilhando o StoreRepository. */
function createEnvironment(): {
  storeRepository: StoreRepository;
  authService: AuthService;
  wizardFlow: ReturnType<typeof createWizardFlow>;
} {
  const storeRepository = createInMemoryStoreRepository();
  const ownerRepository = createInMemoryOwnerRepository();
  const authService = createAuthService({ ownerRepository });
  const identifierService = createIdentifierService({
    isIdentifierTaken: (identifier) => storeRepository.isIdentifierTaken(identifier),
  });
  const storeService = createStoreService({ storeRepository, identifierService });
  const wizardFlow = createWizardFlow({ authService, identifierService, storeService });
  return { storeRepository, authService, wizardFlow };
}

/* -------------------------------------------------------------------------- */
/*  Arranque do Assistente (Req. 1.2, 1.3)                                    */
/* -------------------------------------------------------------------------- */

describe("Smoke — arranque do Assistente_de_Criação (Req. 1.2, 1.3)", () => {
  it("constrói o view model da página inicial bem dentro do prazo de 3 s (Req. 1.2)", () => {
    const start = Date.now();
    const viewModel = createHomePageViewModel();
    const elapsedMs = Date.now() - start;

    // A ação única "Criar o meu site" está disponível para iniciar o Assistente.
    expect(viewModel.callToAction.label).toBe("Criar o meu site");
    expect(viewModel.callToAction.intent).toBe("iniciarAssistente");

    // Arranque dentro do prazo máximo de 3 segundos (Req. 1.2).
    expect(elapsedMs).toBeLessThanOrEqual(3000);
  });

  it("disponibiliza a mensagem de falha de arranque e a opção de tentar novamente (Req. 1.3)", () => {
    expect(WIZARD_START_ERROR_MESSAGE.length).toBeGreaterThan(0);
    expect(WIZARD_START_ERROR_MESSAGE).toMatch(/tente novamente/i);
    expect(WIZARD_START_RETRY_LABEL.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Fluxo ponta a ponta (Req. 5.1, 5.3, 6.8, 7.5, 8.2, 9.2)                   */
/* -------------------------------------------------------------------------- */

describe("Integração — fluxo ponta a ponta de criação, administração e publicação", () => {
  let storeRepository: StoreRepository;
  let session: Session;
  let store: Store;
  let panel: AdminPanel;
  let publishedView: StoreViewModel;

  // Medições de tempo de parede recolhidas durante o fluxo.
  let creationMs = 0;
  let panelMs = 0;
  let renderMs = 0;

  let creationStatus = "";
  let redirectTarget: string | undefined;
  let logoStatus = "";
  let productStatus = "";
  let bannerStatus = "";
  let publishOk = false;
  let resolvedPublished: StorefrontResult["kind"] | "" = "";
  let resolvedMissing: StorefrontResult["kind"] | "" = "";

  beforeAll(async () => {
    const env = createEnvironment();
    storeRepository = env.storeRepository;

    // 1. Registar um Dono_da_Loja e obter a sessão autenticada (Req. 1.4).
    const registration = await env.authService.register({
      email: "dono@example.com",
      password: "segredo-forte-123",
      name: "Dono da Loja",
    });
    expect(registration.ok).toBe(true);
    if (!registration.ok) return;
    session = registration.value;

    // 2. Preencher a mala de dados do Assistente (WIZARD_FIELDS).
    const wizardData: WizardStepData = {
      [WIZARD_FIELDS.name]: "Loja Teste",
      [WIZARD_FIELDS.storeType]: STORE_TYPE,
      [WIZARD_FIELDS.templateId]: TEMPLATE_ID,
      [WIZARD_FIELDS.identifier]: IDENTIFIER,
      [WIZARD_FIELDS.ownerId]: session.ownerId,
    };

    // 3. Concluir a criação da Loja (Req. 5.1, 5.3), medindo o tempo.
    const creationStart = Date.now();
    const creation = await env.wizardFlow.completeCreation(wizardData, session);
    creationMs = Date.now() - creationStart;
    creationStatus = creation.status;
    if (creation.status !== "created") return;
    store = creation.store;
    redirectTarget = creation.redirect.target;

    // 4. Apresentar o Painel_de_Administração da Loja criada (Req. 5.3),
    //    partilhando o MESMO StoreRepository para que a Loja seja resolvível
    //    no plano público.
    const panelStart = Date.now();
    panel = createAdminPanel({
      storeId: store.id,
      repositories: { storeRepository },
    });
    panelMs = Date.now() - panelStart;

    // 5. Carregar um Logótipo (Req. 6.1/6.8).
    const logoResult = await panel.controllers.logo.uploadLogo(LOGO_FILE);
    logoStatus = logoResult.status;

    // 6. Registar um Produto disponível (Req. 7.5).
    const productResult = await panel.controllers.products.register(
      session.ownerId,
      store.id,
      { name: "Camisa", description: "Camisa de algodão", price: 5000, available: true },
    );
    productStatus = productResult.status;

    // 7. Adicionar um Banner (Req. 8.2).
    const bannerResult = await panel.controllers.banners.add(
      session.ownerId,
      store.id,
      BANNER_FILE,
    );
    bannerStatus = bannerResult.status;

    // 8. Publicar a Loja (passa de "Rascunho" a "Publicada") via repositório
    //    partilhado, para que a resolução de storefront tenha sucesso.
    const owned = await storeRepository.findByIdForOwner(session.ownerId, store.id);
    expect(owned).not.toBeNull();
    if (owned === null) return;
    const published = await storeRepository.update(session.ownerId, {
      ...owned,
      state: "Publicada",
    });
    publishOk = published.ok;

    // 9. Resolver e renderizar a Loja publicada por subdomínio (Req. 9.1, 9.2),
    //    medindo o tempo de carregamento.
    const renderStart = Date.now();
    publishedView = await panel.renderPublishedStore(store.subdomain);
    renderMs = Date.now() - renderStart;

    // 10. Roteamento por subdomínio: existente publicada vs. inexistente.
    const okResolution = await panel.resolveStorefront(store.subdomain);
    resolvedPublished = okResolution.kind;
    const missingResolution = await panel.resolveStorefront("inexistente.mobisno.store");
    resolvedMissing = missingResolution.kind;
  });

  it("cria a Loja e redirecciona para o Painel_de_Administração dentro dos prazos (Req. 5.1, 5.3)", () => {
    expect(creationStatus).toBe("created");
    expect(store).toBeDefined();
    expect(store.ownerId).toBe(session.ownerId);
    expect(store.subdomain).toBe(`${IDENTIFIER}.mobisno.store`);

    // Redireccionamento para o Painel_de_Administração (Req. 5.3).
    expect(redirectTarget).toBe("admin-panel");

    // Criação ≤ 10 s (Req. 5.1) e apresentação do Painel ≤ 5 s (Req. 5.3).
    expect(creationMs).toBeLessThanOrEqual(10_000);
    expect(panelMs).toBeLessThanOrEqual(5_000);
  });

  it("propaga o Logótipo carregado para a Loja publicada (Req. 6.8)", () => {
    expect(logoStatus).toBe("saved");
    expect(publishedView.kind).toBe("render");
    if (publishedView.kind !== "render") return;

    // O cabeçalho passa a usar o Logótipo (e não a identidade de substituição).
    expect(publishedView.header.brand.kind).toBe("logo");
    expect(publishedView.menu.brand.kind).toBe("logo");
  });

  it("propaga o Produto disponível registado para a Loja publicada (Req. 7.5)", () => {
    expect(productStatus).toBe("success");
    expect(publishedView.kind).toBe("render");
    if (publishedView.kind !== "render") return;

    const names = publishedView.products.map((product) => product.name);
    expect(names).toContain("Camisa");
  });

  it("propaga o Banner adicionado para a Loja publicada (Req. 8.2)", () => {
    expect(bannerStatus).toBe("added");
    expect(publishedView.kind).toBe("render");
    if (publishedView.kind !== "render") return;

    expect(publishedView.banners).toHaveLength(1);
  });

  it("publica a Loja e resolve o storefront por subdomínio (Req. 9.1, 9.2)", () => {
    expect(publishOk).toBe(true);

    // Subdomínio de Loja existente e Publicada => render (Req. 9.1).
    expect(resolvedPublished).toBe("render");

    // Carregamento da Loja publicada ≤ 3 s (Req. 9.2).
    expect(renderMs).toBeLessThanOrEqual(3_000);
  });

  it("devolve not_found para um subdomínio inexistente (Req. 9.3, roteamento)", () => {
    expect(resolvedMissing).toBe("not_found");
  });
});
