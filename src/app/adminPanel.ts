/**
 * Wiring do Painel_de_Administração (Tarefa 15.2).
 *
 * Este módulo liga, de ponta a ponta, a camada de UI de administração aos
 * serviços de negócio e à camada de persistência, garantindo que **todas as
 * alterações efetuadas no Painel_de_Administração se propagam à Loja
 * publicada**. A propagação é estrutural: os controladores de administração e
 * o resolvedor de storefront partilham exatamente os mesmos repositórios, pelo
 * que uma escrita feita pela administração (carregar Logótipo, registar/editar/
 * remover Produto, adicionar/remover Banner) é imediatamente visível ao
 * renderizar a Loja publicada.
 *
 * Requisitos cobertos:
 *  - 6.1: o Painel permite carregar um ficheiro de imagem como Logótipo
 *    (controlador de Logótipo ligado ao {@link FileService} e ao
 *    {@link AssetRepository}).
 *  - 6.8: a substituição do Logótipo passa a ser exibida na Loja publicada —
 *    aqui assegurada por partilha do {@link AssetRepository} entre a
 *    administração (`upsertLogo`) e o resolvedor (`findLogo`).
 *  - 7.5: o registo de um Produto válido reflete-se na listagem e, quando
 *    disponível, na Loja publicada — por partilha do {@link ProductRepository}.
 *  - 8.2: a gravação de um Banner reflete-se na Loja publicada pela ordem de
 *    adição — por partilha do {@link BannerRepository}.
 *
 * Princípios de design (alinhados com design.md):
 *  - **Determinístico e injetável**: todas as dependências (repositórios e
 *    serviços) são injetáveis; quando omitidas, são criadas implementações em
 *    memória deterministas, adequadas a testes.
 *  - **Isolamento de inquilino**: a verificação de posse da Loja é ligada ao
 *    {@link StoreRepository}, pelo que operações de Produto/Banner sobre uma
 *    Loja que não pertence ao Dono autenticado são rejeitadas (Req. 7.9).
 *  - **Fonte única de verdade**: os mesmos repositórios alimentam a
 *    administração e o plano público, eliminando qualquer divergência de
 *    estado entre os dois planos.
 */

import {
  createFileService,
  type FileService,
} from "../services/fileService.js";
import {
  createProductService,
  type ProductService,
} from "../services/productService.js";
import {
  createBannerService,
  type BannerService,
} from "../services/bannerService.js";
import {
  createInMemoryStoreRepository,
  type StoreRepository,
} from "../services/storeRepository.js";
import {
  createInMemoryProductRepository,
  type ProductRepository,
} from "../services/productRepository.js";
import {
  createInMemoryBannerRepository,
  type BannerRepository,
} from "../services/bannerRepository.js";
import {
  createInMemoryAssetRepository,
  type AssetRepository,
} from "../services/assetRepository.js";
import {
  createStorefrontResolver,
  type StorefrontResolver,
  type StorefrontResult,
} from "../services/storefrontResolver.js";
import {
  createAdminLogoController,
  type AdminLogoController,
} from "../ui/adminLogo.js";
import {
  createAdminProductsController,
  type AdminProductsController,
} from "../ui/adminProducts.js";
import {
  createAdminBannersController,
  type AdminBannersController,
} from "../ui/adminBanners.js";
import { renderStore, type StoreViewModel } from "../storefront/storeRenderer.js";

/* -------------------------------------------------------------------------- */
/*  Tipos compostos                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Conjunto de repositórios partilhados entre o Painel_de_Administração e o
 * plano de Loja publicada. Partilhar estas instâncias é o que garante a
 * propagação imediata das alterações (Req. 6.8, 7.5, 8.2).
 */
export interface AdminPanelRepositories {
  /** Repositório de Lojas (resolução por identificador e verificação de posse). */
  storeRepository: StoreRepository;
  /** Repositório de Assets (Logótipo). */
  assetRepository: AssetRepository;
  /** Repositório de Produtos. */
  productRepository: ProductRepository;
  /** Repositório de Banners. */
  bannerRepository: BannerRepository;
}

/**
 * Conjunto de serviços de negócio usados pelos controladores de administração.
 * Todos operam sobre os repositórios partilhados de {@link AdminPanelRepositories}.
 */
export interface AdminPanelServices {
  /** Serviço de Ficheiros (validação + armazenamento de imagens). */
  fileService: FileService;
  /** Serviço de Produtos (validação, isolamento e listagens). */
  productService: ProductService;
  /** Serviço de Banners (limite, ordem e tolerância a falhas). */
  bannerService: BannerService;
}

/**
 * Controladores de UI expostos pelo Painel_de_Administração, todos ligados aos
 * mesmos repositórios partilhados.
 */
export interface AdminPanelControllers {
  /** Controlador de gestão do Logótipo (Req. 6.1). */
  logo: AdminLogoController;
  /** Controlador de gestão de Produtos (Req. 7.5). */
  products: AdminProductsController;
  /** Controlador de gestão de Banners (Req. 8.2). */
  banners: AdminBannersController;
}

/** Opções de criação do {@link AdminPanel}. */
export interface CreateAdminPanelOptions {
  /**
   * Identificador da Loja administrada por este Painel. Usado para ligar o
   * controlador de Logótipo (que opera sobre uma Loja específica) e como valor
   * por omissão nas operações de conveniência.
   */
  storeId: string;
  /**
   * Repositórios a partilhar com o plano público. Cada um é opcional; quando
   * omitido, é criada uma implementação em memória determinista. Fornecer
   * instâncias pré-construídas permite partilhar estado com o resto da
   * aplicação (ex.: o wiring do Assistente_de_Criação — Tarefa 15.1).
   */
  repositories?: Partial<AdminPanelRepositories>;
  /**
   * Serviço de Ficheiros já construído. Quando omitido, é criado um
   * {@link FileService} com backend de armazenamento em memória.
   */
  fileService?: FileService;
  /**
   * Serviço de Produtos já construído. Quando omitido, é criado a partir do
   * `productRepository` partilhado, com verificação de posse ligada ao
   * `storeRepository` (Req. 7.9).
   */
  productService?: ProductService;
  /**
   * Serviço de Banners já construído. Quando omitido, é criado a partir do
   * `bannerRepository` partilhado e do {@link FileService}, com verificação de
   * posse ligada ao `storeRepository` (Req. 7.9).
   */
  bannerService?: BannerService;
  /**
   * Gerador de identificadores de Produto. Quando omitido, o
   * {@link ProductService} usa o seu contador interno determinista (`product-N`),
   * adequado a testes. A camada web injeta `crypto.randomUUID` para coincidir
   * com o tipo `uuid` da coluna `products.id` no Postgres.
   */
  productIdGenerator?: () => string;
}

/**
 * Painel_de_Administração ligado de ponta a ponta. Expõe os controladores de
 * UI, os repositórios/serviços partilhados e operações para resolver e
 * renderizar a Loja publicada — permitindo confirmar que uma alteração feita
 * na administração se propaga ao plano público.
 */
export interface AdminPanel {
  /** Identificador da Loja administrada por este Painel. */
  readonly storeId: string;
  /** Controladores de UI do Painel (logo, produtos, banners). */
  readonly controllers: AdminPanelControllers;
  /** Repositórios partilhados entre administração e plano público. */
  readonly repositories: AdminPanelRepositories;
  /** Serviços de negócio usados pelos controladores. */
  readonly services: AdminPanelServices;
  /** Resolvedor de storefront que partilha os repositórios da administração. */
  readonly storefrontResolver: StorefrontResolver;
  /**
   * Resolve a Loja publicada a partir de um cabeçalho `Host`
   * (`[identificador].mobisno.com`), usando os repositórios partilhados.
   */
  resolveStorefront(host: string): Promise<StorefrontResult>;
  /**
   * Resolve e renderiza a Loja publicada a partir de um cabeçalho `Host`,
   * devolvendo o view model pronto a apresentar. Reflete o estado atual dos
   * repositórios partilhados, pelo que qualquer alteração feita na
   * administração (Logótipo, Produtos, Banners) é visível no resultado
   * (Req. 6.8, 7.5, 8.2).
   */
  renderPublishedStore(host: string): Promise<StoreViewModel>;
}

/* -------------------------------------------------------------------------- */
/*  Fábrica                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Cria um {@link AdminPanel} totalmente ligado.
 *
 * Constrói (ou reutiliza) os repositórios partilhados, instancia os serviços
 * de negócio sobre esses repositórios, liga os controladores de administração
 * e configura um {@link StorefrontResolver} que lê **exatamente os mesmos**
 * repositórios. Esta partilha é o mecanismo que assegura a propagação das
 * alterações da administração para a Loja publicada (Req. 6.8, 7.5, 8.2).
 *
 * @param options Configuração e dependências injetáveis.
 */
export function createAdminPanel(options: CreateAdminPanelOptions): AdminPanel {
  const { storeId } = options;

  // 1. Repositórios partilhados (instâncias únicas reutilizadas por toda a
  //    administração e pelo plano público). Implementações em memória por
  //    omissão, deterministas e testáveis.
  const storeRepository =
    options.repositories?.storeRepository ?? createInMemoryStoreRepository();
  const assetRepository =
    options.repositories?.assetRepository ?? createInMemoryAssetRepository();
  const productRepository =
    options.repositories?.productRepository ?? createInMemoryProductRepository();
  const bannerRepository =
    options.repositories?.bannerRepository ?? createInMemoryBannerRepository();

  const repositories: AdminPanelRepositories = {
    storeRepository,
    assetRepository,
    productRepository,
    bannerRepository,
  };

  // 2. Verificação de posse da Loja ligada ao StoreRepository: uma operação só
  //    é permitida se a Loja pertencer ao Dono autenticado (isolamento, Req. 7.9).
  const verifyStoreOwnership = async (
    ownerId: string,
    targetStoreId: string,
  ): Promise<boolean> => {
    const owned = await storeRepository.findByIdForOwner(ownerId, targetStoreId);
    return owned !== null;
  };

  // 3. Serviços de negócio sobre os repositórios partilhados (ou injetados).
  const fileService = options.fileService ?? createFileService();
  const productService =
    options.productService ??
    createProductService({
      productRepository,
      verifyStoreOwnership,
      idGenerator: options.productIdGenerator,
    });
  const bannerService =
    options.bannerService ??
    createBannerService({
      bannerRepository,
      fileService,
      verifyOwnership: verifyStoreOwnership,
    });

  const services: AdminPanelServices = {
    fileService,
    productService,
    bannerService,
  };

  // 4. Controladores de UI ligados aos serviços/repositórios partilhados.
  //    - Logótipo: valida/armazena via FileService e regista o Logótipo atual
  //      no AssetRepository partilhado (Req. 6.1; propagação Req. 6.8).
  //    - Produtos: delega ao ProductService partilhado (Req. 7.5).
  //    - Banners: delega ao BannerService partilhado (Req. 8.2).
  const controllers: AdminPanelControllers = {
    logo: createAdminLogoController({
      storeId,
      fileService,
      assetRepository,
    }),
    products: createAdminProductsController({ productService }),
    banners: createAdminBannersController({ bannerService }),
  };

  // 5. Resolvedor de storefront que partilha os MESMOS repositórios. É isto
  //    que torna visível, no plano público, qualquer alteração da administração.
  const storefrontResolver = createStorefrontResolver({
    storeRepository,
    assetRepository,
    bannerRepository,
    productRepository,
  });

  return {
    storeId,
    controllers,
    repositories,
    services,
    storefrontResolver,

    async resolveStorefront(host: string): Promise<StorefrontResult> {
      return storefrontResolver.resolve(host);
    },

    async renderPublishedStore(host: string): Promise<StoreViewModel> {
      const result = await storefrontResolver.resolve(host);
      return renderStore(result);
    },
  };
}
