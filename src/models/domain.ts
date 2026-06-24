/**
 * Tipos de domínio do MôBisno (ver design.md → "Data Models").
 *
 * Estes tipos modelam as entidades centrais da plataforma multi-inquilino:
 * Dono_da_Loja, Loja, Modelo, Asset (Logótipo), Produto e Banner. Os
 * comentários de cada campo documentam as invariantes e limites definidos
 * nos requisitos.
 */

/** Estado de uma Loja: rascunho (não público) ou publicada (visível). */
export type StoreState = "Rascunho" | "Publicada";

/** Categoria de negócio da Loja, selecionada na criação (Requisito 2.3). */
export type StoreType =
  | "Vestuário"
  | "Alimentação"
  | "Eletrónica"
  | "Beleza"
  | "Serviços"
  | "Outro";

/** Formatos de imagem suportados para os recursos de uma Loja. */
export type ImageFormat = "png" | "jpeg" | "svg" | "webp";

/** Tipo de recurso (asset) armazenado para uma Loja. */
export type AssetKind = "logo" | "product" | "banner";

/**
 * Dono_da_Loja: utilizador autenticado que cria e administra Lojas.
 * Ver ER diagram (STORE_OWNER) em design.md.
 */
export interface StoreOwner {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

/**
 * Loja: conjunto de dados e configurações de uma loja online individual,
 * pertencente exclusivamente a um Dono_da_Loja (isolamento de inquilino).
 */
export interface Store {
  id: string;
  /** Proprietário exclusivo da Loja (isolamento de inquilino, Requisito 5.2). */
  ownerId: string;
  /** Nome da Loja: 2–60 caracteres após remoção de espaços (trim). */
  name: string;
  storeType: StoreType;
  /** Referencia exatamente um Modelo associado (Requisito 3.3). */
  templateId: string;
  /** Identificador: 2–63 chars, `[a-z0-9-]`, sem hífen inicial/final/duplo. */
  identifier: string;
  /** Subdomínio composto: `${identifier}.mobisno.com`. */
  subdomain: string;
  state: StoreState;
  createdAt: string;
}

/**
 * Modelo: site pré-construído e selecionável. Nesta fase não é editável,
 * apenas referenciado pela Loja através do seu `id`.
 */
export interface Template {
  id: string;
  name: string;
  previewUrl: string;
}

/**
 * Asset: recurso de imagem armazenado para uma Loja (Logótipo, imagem de
 * Produto ou Banner), referenciado por URL.
 */
export interface Asset {
  id: string;
  /** Loja à qual o recurso pertence (isolamento de inquilino). */
  storeId: string;
  kind: AssetKind;
  url: string;
  format: ImageFormat;
  sizeBytes: number;
}

/**
 * Produto: item à venda registado numa Loja.
 * Validações: nome 1–120, descrição ≤2000, preço 0,00–999.999.999,99
 * (Requisito 7.1).
 */
export interface Product {
  id: string;
  storeId: string;
  /** Nome do Produto: 1–120 caracteres. */
  name: string;
  /** Descrição do Produto: até 2000 caracteres. */
  description: string;
  /** Categoria do Produto (livre, opcional). Ex.: "Camisolas". */
  category?: string;
  /** Produto destacado (aparece na categoria "Destaques"). */
  featured?: boolean;
  /** Preço: 0,00 a 999.999.999,99. */
  price: number;
  imageUrl?: string;
  available: boolean;
  createdAt: string;
}

/**
 * Banner: imagem promocional exibida na Loja. Limite de 10 por Loja
 * (Requisito 8.1); `position` reflete a ordem de adição (Requisito 8.5).
 */
export interface Banner {
  id: string;
  storeId: string;
  imageUrl: string;
  /** Ordem de adição, estritamente crescente por Loja. */
  position: number;
  createdAt: string;
}
