/**
 * Templates prontos (presets completos de customização) que o utilizador pode
 * escolher no wizard em vez de ir ao construtor. Cada preset define todas as
 * escolhas visuais de uma loja pronta a usar.
 */
import type { StoreCustomization } from "./types.js";

export interface TemplatePreset {
  /** ID único do preset. */
  id: string;
  /** Nome apresentado ao utilizador. */
  name: string;
  /** Descrição curta. */
  description: string;
  /** Imagem de pré-visualização (screenshot do modelo completo). */
  previewUrl: string;
  /** Customização completa aplicada ao escolher este preset. */
  customization: StoreCustomization;
}

/**
 * Lista de templates prontos. O primeiro é sempre o recomendado (mostrado em
 * destaque no wizard).
 */
export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "vermelho-moderno",
    name: "Vermelho Moderno",
    description: "Vibrante e contemporâneo, perfeito para moda e acessórios.",
    previewUrl: "/presets/vermelho-moderno.jpg", // placeholder — criar screenshot depois
    customization: {
      colors: {
        primary: "#DF0B26", // Vermelho vibrante
        text: "#111827",    // Cinzento muito escuro (quase preto)
      },
      theme: {
        style: "moderno", // Cantos arredondados, fonte Inter
      },
      header: {
        variant: "promo", // Com faixa promocional
        promo: "Frete grátis em compras acima de 15.000 Kz",
      },
      hero: {
        variant: "imagem", // Imagem em destaque
        title: "A sua marca, o seu estilo",
        subtitle: "Descubra a coleção perfeita para si.",
        ctaLabel: "Ver produtos",
      },
      productGrid: {
        variant: "retrato", // Cards verticais (3:4)
      },
      productPage: {
        variant: "classico", // Layout clássico de produto
      },
      checkout: {
        variant: "compacto", // Checkout compacto (formulário + resumo lado a lado)
      },
      footer: {
        variant: "colunas", // Rodapé com colunas (sobre, contactos, menu)
        about: "Somos uma loja dedicada a oferecer produtos de qualidade com entrega rápida em toda Angola.",
      },
      // Blocos de conteúdo pré-configurados (aparecem abaixo dos produtos)
      blocks: [
        {
          type: "testimonials",
          title: "O que os nossos clientes dizem",
          variant: "cards", // Cartões de testemunho
          items: [
            {
              name: "Ana Silva",
              role: "Cliente satisfeita",
              text: "Adorei a qualidade dos produtos e a entrega foi rápida!",
              avatarText: "AS",
            },
            {
              name: "Carlos Mendes",
              role: "Comprador frequente",
              text: "Excelente atendimento e preços justos. Recomendo!",
              avatarText: "CM",
            },
            {
              name: "Maria João",
              role: "Cliente VIP",
              text: "A melhor loja online que já experimentei em Angola.",
              avatarText: "MJ",
            },
          ],
        },
        {
          type: "location",
          title: "Visite-nos",
          address: "Luanda, Angola",
          variant: "classico", // Mapa + endereço clássico
          lat: -8.8383, // Coordenadas de Luanda (placeholder)
          lng: 13.2344,
        },
      ],
    },
  },
  // Mais presets virão aqui (azul elegante, verde natural, etc.)
];

/** Devolve o preset por ID, ou null se não existir. */
export function getPreset(id: string): TemplatePreset | null {
  return TEMPLATE_PRESETS.find((p) => p.id === id) ?? null;
}

/** Devolve o preset recomendado (o primeiro da lista). */
export function getRecommendedPreset(): TemplatePreset {
  return TEMPLATE_PRESETS[0]!;
}

