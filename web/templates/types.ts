/** Contrato de um Modelo de loja publicável + customização por loja. */
import type { StoreRenderView } from "../../src/storefront/storeRenderer.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

/**
 * Personalização editável pelo dono da loja (guardada em JSON no Supabase).
 * Todos os campos são opcionais; os modelos aplicam fallbacks.
 */
export interface StoreCustomization {
  colors?: {
    /** Cor de destaque principal (botões, acentos). */
    primary?: string;
  };
  hero?: {
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
    imageUrl?: string;
  };
  /** Fotos do hero em arco (modelo Galeria). Se ausente, usa fotos dos produtos. */
  heroImages?: string[];
  /** Mostrar o bloco editorial abaixo dos produtos (Galeria). Por omissão visível. */
  featureEnabled?: boolean;
  /** Garantias/benefícios na página de produto (ícone + texto). Editáveis. */
  productPerks?: { icon?: string; text?: string }[];
  /** Rótulos dos itens de menu (cabeçalho/rodapé). */
  menu?: string[];
  /**
   * Secções de produtos da página inicial. Cada secção mostra uma categoria.
   * Tokens especiais: "__all__" (todos), "__featured__" (Destaques).
   * Se ausente, mostra uma única secção com todos os produtos.
   */
  sections?: { category: string }[];
  /**
   * Secção de destaque editorial (foto + título + subtítulo), apresentada
   * abaixo dos produtos. Usada pelo modelo "Galeria".
   */
  feature?: {
    imageUrl?: string;
    title?: string;
    subtitle?: string;
  };
  footer?: {
    about?: string;
    location?: string;
    phone?: string;
    email?: string;
    /** Logótipo específico do rodapé (ex.: versão clara). Se ausente, usa o do cabeçalho. */
    logoUrl?: string;
  };
  /** Configuração do botão "Comprar via WhatsApp" na página de produto. */
  whatsapp?: {
    /** Número com código do país, ex.: "+244 9xx xxx xxx". */
    phone?: string;
    /**
     * Modelo da mensagem. Pode conter os tokens obrigatórios `{produto}` e
     * `{preco}`, substituídos pelos dados reais do produto.
     */
    messageTemplate?: string;
  };
  /**
   * Blocos de conteúdo adicionais, renderizados abaixo dos produtos, na ordem
   * definida. O dono pode adicionar/remover/reordenar no editor.
   */
  blocks?: ContentBlock[];
}

/** Bloco de conteúdo de uma loja (secção adicional editável). */
export type ContentBlock =
  | { type: "info"; title?: string; text?: string; imageUrl?: string; imageSide?: "left" | "right" }
  | { type: "text"; title?: string; text?: string }
  | { type: "testimonials"; title?: string; items?: { name?: string; role?: string; text?: string }[] }
  | { type: "location"; title?: string; address?: string };

export interface StoreTemplate {
  /** Identificador estável (igual ao `templateId` guardado na Loja). */
  id: string;
  /** Nome apresentado no assistente. */
  name: string;
  /** Imagem de pré-visualização (assistente). */
  previewUrl: string;
  /** Se o modelo está pronto para uso (aparece na criação da loja). */
  ready?: boolean;
  /** Cor de marca por omissão do modelo (usada quando o dono não escolheu uma). */
  defaultBrand?: string;
  /** Produz o HTML da loja publicada a partir do view model + customização. */
  render(view: StoreRenderView, custom?: StoreCustomization): string;
  /**
   * Produz o HTML da página individual de um produto (detalhe + compra).
   * Opcional: se ausente, a app usa uma página de produto genérica.
   */
  renderProduct?(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string;
  /**
   * Produz o HTML de uma página de categoria (mesma UI, só os produtos dessa
   * categoria). Opcional.
   */
  renderCategory?(view: StoreRenderView, category: string, custom?: StoreCustomization): string;
}

export type { StoreRenderView };
export type { StoreProductView };
