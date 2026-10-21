/** Contrato de um Modelo de loja publicável + customização por loja. */
import type { StoreRenderView } from "../../src/storefront/storeRenderer.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";
import type { ProductVariations } from "../../src/models/domain.js";

/**
 * Personalização editável pelo dono da loja (guardada em JSON no Supabase).
 * Todos os campos são opcionais; os modelos aplicam fallbacks.
 */
export interface StoreCustomization {
  colors?: {
    /** Cor de destaque principal (botões, acentos). */
    primary?: string;
    /** Cor dos textos e ícones da loja. */
    text?: string;
    /** Cor de TODOS os ícones do site (sobrepõe a cor de texto nos ícones). */
    icon?: string;
  };
  /** Tema global (coerência): estilo visual aplicado a toda a loja. */
  theme?: {
    /** "moderno" (cantos suaves), "classico" (serif), "minimal" (reto), "editorial" (luxo). */
    style?: "moderno" | "classico" | "minimal" | "editorial";
  };
  hero?: {
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
    imageUrl?: string;
    /** Variante de hero escolhida ("imagem" | "split" | "arco" | "particulas"). */
    variant?: "imagem" | "split" | "arco" | "particulas";
    /**
     * Destino do botão principal do hero. Vazio/ausente = secção de produtos
     * (#produtos); caso contrário, nome da categoria para onde o botão dirige.
     */
    ctaTarget?: string;
  };
  /** Fotos do hero em arco (modelo Galeria). Se ausente, usa fotos dos produtos. */
  heroImages?: string[];
  /** Cabeçalho: variante de layout + texto da faixa promo. */
  header?: {
    variant?: "classico" | "centrado" | "promo" | "transparente";
    promo?: string;
  };
  /** Disposição da lista de produtos (Fase 3). Se ausente, usa o formato do modelo. */
  productGrid?: {
    /** "retrato" (3:4) | "quadrado" | "alto" (4:5). */
    variant?: "retrato" | "quadrado" | "alto";
  };
  /** Variante de layout da página de produto. */
  productPage?: {
    variant?: "classico" | "galeria" | "imersivo";
  };
  /** Altura do logótipo no cabeçalho, em píxeis (por omissão depende do modelo). */
  logoScale?: number;
  /** Mostrar o bloco editorial abaixo dos produtos (Galeria). Por omissão visível. */
  featureEnabled?: boolean;
  /** Garantias/benefícios na página de produto (ícone + texto). Editáveis. */
  productPerks?: { icon?: string; text?: string }[];
  /** Rótulos dos itens de menu (cabeçalho/rodapé). */
  menu?: string[];
  /**
   * Destino de cada item de menu (mesmo índice de `menu`). Vazio/ausente =
   * início; caso contrário, nome da categoria para onde o botão direciona.
   */
  menuTargets?: string[];
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
    /** Variante de layout do rodapé. */
    variant?: "colunas" | "centrado" | "moderno";
    /** Título do 4.º bloco do rodapé (modelos que o têm, ex.: Lumière). */
    extraTitle?: string;
    /** Texto do 4.º bloco do rodapé. */
    extraText?: string;
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
  /*
   * Não há aqui nada sobre pagamentos digitais, e é de propósito: a visibilidade
   * de Multicaixa Express e Referência Bancária decide-se só por
   * `digitalPaymentsVisible(store)` (`src/services/paymentVisibility.ts`), a
   * partir da coluna `stores.digital_payments`, que o Dono não escreve. O antigo
   * espelho `payments.onlineEnabled` vivia nesta Personalização — editável pelo
   * próprio Dono — e saiu.
   */
  /** Variante de layout do checkout (4 modelos). */
  checkout?: {
    variant?: "dividido" | "moderno" | "compacto" | "minimal";
  };
  /** Taxas de entrega. `mode`: "single" (valor único) ou "perArea" (por área). */
  delivery?: {
    mode?: "single" | "perArea";
    /** Taxa única para todas as áreas (modo "single"). */
    flatFee?: number;
    /** Taxa por área (modo "perArea"). A presença da área = entrega lá. */
    fees?: Record<string, number>;
    /** Entrega grátis em pedidos com subtotal igual/acima deste valor (Kz). */
    freeAbove?: number;
  };
  /** SMS de confirmação de compra enviado ao cliente. */
  sms?: {
    enabled?: boolean;
  };
  /** Pixels de marketing/medição (anúncios e analytics). */
  marketing?: {
    /** ID do Meta Pixel (Facebook/Instagram), ex.: "1234567890". */
    metaPixelId?: string;
    /** ID de medição do Google Analytics 4, ex.: "G-XXXXXXX". */
    gaId?: string;
  };
  /** Domínio próprio ligado pelo dono (ex.: "www.minhaloja.co.ao"). */
  customDomain?: string;

  /**
   * SEO da loja. `title`/`description` são o título e a meta-descrição usados na
   * pré-renderização (partilhas/Google). Podem ser gerados por IA a partir do
   * que o dono descreve, e editados manualmente.
   */
  seo?: {
    title?: string;
    description?: string;
  };
  /**
   * Blocos de conteúdo adicionais, renderizados abaixo dos produtos, na ordem
   * definida. O dono pode adicionar/remover/reordenar no editor.
   */
  blocks?: ContentBlock[];

  /** Cores de texto por-campo (ex.: {"hero.title":"#DF0B26"}). Sobrepõem a cor global. */
  fieldColors?: Record<string, string>;

  /** Testemunhos em destaque (secção editorial do modelo, ex.: Lumière). */
  testimonials?: { quote?: string; author?: string; role?: string }[];

  /**
   * Fotos adicionais por produto (além da foto principal do produto), indexadas
   * pelo ID do produto. Guardadas aqui para não exigir migração à base de dados.
   */
  productImages?: Record<string, string[]>;

  /**
   * Variação por produto (eixos, modo de preço e Combinação), indexadas pelo
   * **ID do produto** — a mesma chave e o mesmo motivo de `productImages`
   * acima: guardadas aqui para não exigir migração à base de dados
   * (`MODELO-GUIA.md` §9, decisão **D1**). Um produto sem entrada, ou com
   * `enabled` diferente de `true`, corre o comportamento atual.
   *
   * Este JSON não é de confiança: foi gravado por versões diferentes da
   * Plataforma e é editável à mão no Painel_Admin. **Nunca ler diretamente** —
   * a leitura passa sempre por `normalizeVariations(custom, productId)` de
   * `src/services/variations.ts`, que é total e devolve `null` para tudo o que
   * não sirva.
   */
  productVariations?: Record<string, ProductVariations>;

  /** Cor de fundo da secção de produtos (padrão branco em modelos que a suportam). */
  productsBg?: string;

  /** Definições específicas do modelo Tech Essentials. */
  techEssentials?: {
    /** Esconde a faixa de marcas (secção removível, `MODELO-GUIA.md` §7). */
    hideBrands?: boolean;
    /**
     * Marcas que a loja vende, na faixa abaixo do hero. São **sempre quatro**:
     * o desenho é uma fila de quatro e menos do que isso deixa a fila
     * desequilibrada. Cada uma mostra o logótipo carregado pelo Dono ou, sem
     * imagem, o nome em palavra-marca — que é como a referência do modelo as
     * apresenta.
     */
    brands?: { imageUrl?: string; name?: string }[];
  };

  /** Definições específicas do modelo Lumière Chic. */
  lumiere?: {
    /** Título da secção do mapa/lojas. */
    boutiquesTitle?: string;
    /** Esconde a secção de testemunhos (removível pelo dono). */
    hideTestimonials?: boolean;
    /** Esconde a secção de lojas/mapa (removível pelo dono). */
    hideBoutiques?: boolean;
    /**
     * Pontos das lojas no mapa. Cada ponto mostra um pin próprio (a partir de
     * lat/lng, ou da morada). Se vazio, mostra um único mapa da morada do rodapé.
     */
    boutiques?: { name?: string; address?: string; lat?: number; lng?: number }[];
  };

  /* --------- Campos internos (modelos prontos) — prefixo `__` --------- */
  /**
   * (Interno) Marca esta loja como MODELO-mestre, editável pelo admin na
   * secção "Modelos". Não aparece nas listagens normais nem nas métricas.
   */
  __template?: { id: string; name: string; description: string };
  /**
   * (Interno) ID do modelo em que a loja do cliente se baseia. Presente quando
   * o cliente escolheu um modelo pronto em vez do construtor.
   */
  __basedOn?: string;
  /**
   * (Interno) Bloqueia a edição estrutural (header, hero, rodapé, página de
   * produto, checkout, disposição, tema e blocos). O cliente só pode alterar
   * textos, fotos e cores. Ativo nas lojas baseadas num modelo pronto.
   */
  __locked?: boolean;
  /** (Interno) Versão do conteúdo de fábrica de um modelo (para re-sincronizar). */
  __v?: number;
}

/** Bloco de conteúdo de uma loja (secção adicional editável). */
export type ContentBlock =
  | { type: "info"; title?: string; text?: string; imageUrl?: string; imageSide?: "left" | "right"; variant?: "lado" | "sobreposto" | "cartao"; bg?: string; badge?: string }
  | { type: "text"; title?: string; text?: string; variant?: "centrado" | "destaque" | "linha"; bg?: string }
  | { type: "testimonials"; title?: string; variant?: "cards" | "editorial" | "marquee"; items?: { name?: string; role?: string; text?: string; avatarUrl?: string; avatarText?: string }[] }
  /**
   * Bloco de mapa. Aceita dois formatos de localização:
   *
   * - **lista** — `places`, com uma entrada por ponto de venda, cada uma com o
   *   seu mapa e pin. Mesma forma de `lumiere.boutiques[]` (`MODELO-GUIA.md`
   *   §8), para partilharem `mapEmbedSrc` de `src/services/locations.ts`;
   * - **localização única (legado)** — `address`/`lat`/`lng` no próprio bloco,
   *   como todas as lojas gravadas até aqui. **Continuam a ser lidos** quando
   *   `places` está ausente ou vazio (ver `resolveLocations`).
   */
  | { type: "location"; title?: string; places?: { name?: string; address?: string; lat?: number; lng?: number }[]; address?: string; lat?: number; lng?: number; variant?: "classico" | "cartao" | "estilizado" };

/** Tipo de uma secção acrescentável (bloco de conteúdo). */
export type BlockType = ContentBlock["type"];

/**
 * Desenho das secções acrescentadas, na linguagem visual do modelo.
 *
 * ## Porque é por parâmetro
 *
 * Uma secção acrescentada tem de sair **100% no desenho do modelo** onde é
 * acrescentada (`MODELO-GUIA.md` §9.3). `blocks.ts` é partilhado por todos os
 * modelos, por isso não pode chumbar `text-gray-900`, `font-black` e
 * `rounded-2xl` e esperar que sirvam ao Lumière, que é serifado, creme e de
 * cantos retos. O modelo passa a sua tipografia e os seus cantos, tal como já
 * faz em `variationPickerHtml` e em `categoryFilterHtml` — é o padrão da casa.
 *
 * Os campos de classe são **sem o tamanho**: o tamanho é da variante. Os de
 * `…Style` são CSS inline do próprio modelo (constantes do código, nunca dados
 * do Dono). Todos são opcionais; um modelo que não passe `style` nenhum fica
 * com o desenho genérico de sempre, byte a byte.
 *
 * Vive aqui, e não em `blocks.ts`, para este ficheiro de tipos não arrastar
 * código de DOM para quem só precisa dos tipos (os testes compilam sem DOM).
 */
export interface BlockStyle {
  /** Aparência do título de secção. */
  heading?: string;
  /** Estilo inline do título (cor própria do modelo). */
  headingStyle?: string;
  /** Aparência do texto corrido. */
  body?: string;
  /** Estilo inline do texto corrido. */
  bodyStyle?: string;
  /** Nomes curtos — autor de um testemunho, nome de uma loja no mapa. Ausente = o do título. */
  name?: string;
  /** Estilo inline dos nomes curtos. */
  nameStyle?: string;
  /** Citação em destaque (testemunhos «Editorial»). Ausente = a do título. */
  quote?: string;
  /** Estilo inline da citação. */
  quoteStyle?: string;
  /** Texto secundário (o cargo de quem dá o testemunho). Ausente = o do corpo. */
  muted?: string;
  /** Estilo inline do texto secundário. */
  mutedStyle?: string;
  /** Superfície de um cartão (fundo, moldura, sombra). */
  surface?: string;
  /** Estilo inline da superfície. */
  surfaceStyle?: string;
  /** Classe de cantos aplicada a cartões, imagens e mapas. `""` = cantos retos. */
  radius?: string;
  /** Faixa tonal de fundo das secções que assentam sobre uma banda. */
  band?: string;
  /** Estilo inline da faixa tonal. */
  bandStyle?: string;
}

/** Variante de cada tipo de secção, extraída do próprio `ContentBlock`. */
export type BlockVariant<T extends BlockType> = NonNullable<Extract<ContentBlock, { type: T }>["variant"]>;

/**
 * Secções acrescentáveis de um Modelo_De_Loja.
 *
 * ## Porque é que isto existe
 *
 * O menu «Adicionar secção» do editor decidia o que oferecer comparando
 * `store.templateId` com identificadores escritos à mão — a mercearia e o modelo
 * escuro —, e esses dois modelos já tinham saído do `TEMPLATE_REGISTRY`, pelo
 * que as comparações nunca disparavam. Pior: não havia forma de dizer «este
 * modelo já tem esta secção». O Lumière tem testemunhos e mapa próprios, e o
 * menu oferecia os dois outra vez; a secção acrescentada aparecia duplicada e
 * **com o desenho de outro modelo**, porque `newBlock` criava o bloco sem
 * `variant` e o desenho caía num padrão genérico.
 *
 * ## A regra
 *
 * Toda a secção acrescentada tem de sair com o desenho do modelo onde é
 * acrescentada. Um modelo declara aqui tudo o que o editor precisa de saber
 * sobre as suas secções, e passa `style` no seu `BlockCtx` (`blocks.ts`) para o
 * desenho seguir a sua tipografia, os seus cantos e a sua paleta. O editor lê
 * isto por `sectionRules.ts` e **nunca** compara `store.templateId`. Um modelo
 * que não declare nada fica com o comportamento de sempre.
 *
 * Ver `MODELO-GUIA.md` §9.3 e `.kiro/steering/modelos-secoes.md`.
 */
export interface TemplateSections {
  /**
   * Secções que o modelo **já traz** no seu desenho. Não são oferecidas no menu
   * «Adicionar secção»: já estão no ecrã e editam-se onde estão. Oferecê-las é
   * convidar o Dono a duplicar o que já tem.
   */
  native?: readonly BlockType[];
  /**
   * Secções que o modelo aceita acrescentar. Ausente = todas as que não são
   * `native`. Lista vazia = nenhuma.
   */
  allowed?: readonly BlockType[];
  /**
   * Variante com que cada secção **acrescentada** se desenha neste modelo. É
   * gravada no bloco no momento em que ele é criado, para o desenho não passar
   * a depender de um valor por omissão que muda com o tempo.
   */
  variants?: {
    info?: BlockVariant<"info">;
    text?: BlockVariant<"text">;
    testimonials?: BlockVariant<"testimonials">;
    location?: BlockVariant<"location">;
  };
  /**
   * O desenho com que o modelo desenha os blocos — **o mesmo** objeto que passa
   * no `style` do `BlockCtx` de `blocksHtml` ({@link BlockStyle}). Declarado
   * aqui para o editor desenhar as miniaturas do seletor de variantes com ele, em
   * vez de as mostrar no desenho genérico. Ausente = desenho genérico.
   */
  style?: BlockStyle;
  /**
   * Cores de fundo que o Dono pode dar a uma secção (`blocks[i].bg` e
   * `productsBg`), além de «Padrão» e «Branco», que o editor oferece sempre.
   * Têm de ser cores que o modelo **já usa** — é o que mantém a página coerente.
   * Ausente = uma só cor clara genérica.
   */
  backgrounds?: readonly SectionBackground[];
  /**
   * Prepara a Personalização para edição: materializa os arrays com fallback
   * que o modelo desenha (`MODELO-GUIA.md` §6.1). O editor chama-o **antes da
   * baseline** `savedJson` — sem isso, editar um item com `setPath` num array que
   * não existe criava um objeto `{0:…}` sem `.length`, o modelo voltava aos
   * valores por omissão e a edição perdia-se.
   *
   * Regras: escreve **exactamente o que a loja já mostra** (abrir o editor não
   * pode mudar o aspeto nem marcar alterações), é idempotente, e não toca no que
   * já está na forma certa — para o JSON gravado não mudar de forma nem de ordem
   * de chaves.
   */
  materialize?(custom: StoreCustomization): void;
}

/** Uma cor de fundo de secção, como o Dono a vê no seletor do editor. */
export interface SectionBackground {
  /** Nome curto mostrado ao passar o rato (`title` da amostra). */
  label: string;
  /** Cor em CSS (`#hex`). */
  value: string;
}

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
  /**
   * Secções acrescentáveis: o que o modelo já tem, o que aceita e com que
   * desenho. Ver {@link TemplateSections} — é o que garante que uma secção
   * acrescentada sai 100% no desenho do modelo.
   */
  sections?: TemplateSections;
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
  /**
   * Produz o HTML do checkout dentro do cromo da loja (cabeçalho/rodapé/tema),
   * recebendo o conteúdo interior (formulário + métodos + resumo). Opcional.
   */
  renderCheckout?(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string;
}

export type { StoreRenderView };
export type { StoreProductView };
