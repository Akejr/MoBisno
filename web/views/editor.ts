/**
 * Ecrã "Personalizar" — construtor da loja diretamente no preview.
 *
 * Edição intuitiva e animada: textos clicáveis, logótipo e imagem do hero por
 * hover/clique, menus (adicionar/editar/remover), contactos do rodapé e
 * produtos (adicionar/editar com foto). Inclui "Desfazer" e "Ver loja" noutra
 * janela.
 */
import { render, $, go, esc, toast, fileToUint8Array, withBusy, withButton, fadeInImages, formatKz } from "../lib/dom.js";
import { compressImageFile } from "../lib/imageCompress.js";
import {
  appState, currentOwnerId, publicStoreUrl,
  storeRepository, assetRepository, bannerRepository, productRepository, adminPanelFor,
} from "../composition.js";
import { renderStore, type StoreViewModel } from "../../src/storefront/storeRenderer.js";
import type { StorefrontResult } from "../../src/services/storefrontResolver.js";
import { BANNER_POLICY, LOGO_POLICY } from "../../src/services/fileService.js";
import { getTemplate } from "../templates/registry.js";
import { newBlock } from "../templates/blocks.js";
import {
  testimonialsByVariant, TESTIMONIAL_VARIANTS,
  infoByVariant, INFO_VARIANTS,
  textByVariant, TEXT_VARIANTS,
  locationByVariant, LOCATION_VARIANTS,
} from "../templates/blocks.js";
import { HERO_VARIANTS, renderHero, type HeroVariant } from "../templates/heroes.js";
import { HEADER_VARIANTS, renderHeader, type HeaderVariant } from "../templates/headers.js";
import { FOOTER_VARIANTS, renderFooter, type FooterVariant } from "../templates/footers.js";
import { PRODUCTPAGE_VARIANTS, renderProductPage, type ProductPageVariant } from "../templates/productPage.js";
import { CHECKOUT_VARIANTS, renderCheckout, type CheckoutVariant } from "../templates/checkoutLayouts.js";
import { deliveredAreas } from "../lib/areas.js";
import { PRODUCT_VARIANTS, cardAspectClass, gridColsClass, type ProductVariant } from "../templates/productGrid.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { readableInk } from "../lib/brand.js";
import { applyTheme, THEME_STYLES } from "../lib/theme.js";
import { openMapPicker } from "../lib/mapPicker.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import { mountParticlesHeroes } from "../lib/particlesHero.js";
import { mountTestimonials } from "../lib/testimonialsCarousel.js";
import { mountFoodmartCarousels } from "../lib/foodmartCarousel.js";
import { foodmartDefaultFeatures } from "../templates/foodmart.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import type { StoreCustomization, ContentBlock } from "../templates/types.js";
import type { Store, Product } from "../../src/models/index.js";
import { openProductForm } from "../lib/productForm.js";
import { openWhatsappForm } from "../lib/whatsappForm.js";

const ACCENT = "#F95901";

/** Galeria alargada de ícones para categorias (Material Symbols). */
const FM_CATEGORY_ICONS = [
  "nutrition", "grocery", "bakery_dining", "local_bar", "wine_bar", "liquor",
  "egg", "egg_alt", "icecream", "cake", "local_pizza", "lunch_dining",
  "ramen_dining", "restaurant", "coffee", "emoji_food_beverage", "local_cafe", "water_drop",
  "kitchen", "blender", "set_meal", "kebab_dining", "rice_bowl", "bento",
  "fastfood", "local_drink", "sports_bar", "tapas", "soup_kitchen", "dinner_dining",
  "spa", "eco", "agriculture", "park", "yard", "grass",
  "pets", "cruelty_free", "medication", "cleaning_services", "soap", "sanitizer",
  "shopping_basket", "shopping_cart", "storefront", "redeem", "checkroom", "toys",
];

/** Ícones predefinidos para as garantias da página de produto. */
const PERK_ICON_CHOICES = [
  "local_shipping", "verified", "payments", "lock", "workspace_premium", "autorenew",
  "support_agent", "schedule", "discount", "recycling", "favorite", "shield",
  "package_2", "paid", "bolt", "eco", "spa", "diamond",
];

function setPath(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== "object" || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export async function renderEditor(): Promise<void> {
  const realOwner = appState.ownerId ?? (await currentOwnerId());
  if (!realOwner) { go("#/criar"); return; }

  // Restaura o contexto do editor após um refresh (o appState é volátil), para
  // manter a MESMA loja em edição (ex.: dono com várias lojas) e o destino de saída.
  if (!appState.storeId) {
    try {
      const ctx = JSON.parse(localStorage.getItem("mb-editor-ctx") || "null") as
        | { storeId?: string; editOwnerId?: string | null; editorReturn?: string | null }
        | null;
      if (ctx && typeof ctx === "object") {
        appState.storeId = ctx.storeId ?? null;
        appState.editOwnerId = ctx.editOwnerId ?? null;
        appState.editorReturn = ctx.editorReturn ?? null;
      }
    } catch { /* ignora contexto inválido */ }
  }

  // O admin pode editar a loja de outro dono (appState.editOwnerId).
  const ownerId = appState.editOwnerId ?? realOwner;

  let store: Store | null = appState.storeId
    ? await storeRepository.findByIdForOwner(ownerId, appState.storeId)
    : null;
  if (!store) {
    const stores = await storeRepository.listByOwner(ownerId);
    store = stores[0] ?? null;
  }
  if (!store) { go("#/painel"); return; }
  appState.ownerId = realOwner;
  appState.storeId = store.id;

  // Persiste o contexto para sobreviver a um refresh da página.
  try {
    localStorage.setItem("mb-editor-ctx", JSON.stringify({
      storeId: store.id, editOwnerId: appState.editOwnerId, editorReturn: appState.editorReturn,
    }));
  } catch { /* ignora */ }
  /** Destino ao sair do editor (admin volta à sua tela; dono volta ao painel). */
  const backHref = appState.editorReturn ?? "/painel";

  const custom: StoreCustomization = await getCustomization(store.id);
  // FoodMart: materializa a faixa de garantias para ficar 100% editável (ícone,
  // textos e cor). Feito ANTES da baseline para não marcar alterações por si só.
  if (store.templateId === "foodmart") {
    if (!custom.foodmart) custom.foodmart = {};
    if (!custom.foodmart.features || !custom.foodmart.features.length) {
      custom.foodmart.features = foodmartDefaultFeatures();
    }
  }
  /** Loja baseada num modelo pronto: edição estrutural bloqueada (só textos/fotos/cores). */
  const locked = custom.__locked === true;
  /**
   * (Temporário) Edição de MODELO no editor (trocar header/hero/rodapé/página de
   * produto/checkout/disposição/blocos). Desativada por agora; pôr `true` para
   * reativar — o código permanece pronto.
   */
  const MODEL_EDITING = false;
  const structuralEditing = !locked && MODEL_EDITING;
  let savedJson = JSON.stringify(custom);
  const isDirty = (): boolean => JSON.stringify(custom) !== savedJson;
  const panel = adminPanelFor(store.id);
  let productsById = new Map<string, Product>();

  /**
   * Paleta de cores de fundo para as secções, com as cores JÁ EXISTENTES em
   * cada modelo (para manter a UI coerente). "Padrão" = sem fundo.
   */
  function sectionBgChoices(): { label: string; value: string }[] {
    const byModel: Record<string, { label: string; value: string }[]> = {
      lumiere: [{ label: "Creme", value: "#fcf9f8" }, { label: "Areia", value: "#f6f3f2" }],
      beauty: [{ label: "Creme", value: "#fcf9f8" }, { label: "Areia", value: "#f6f3f2" }],
      galeria: [{ label: "Cinza claro", value: "#f9fafb" }, { label: "Cinza", value: "#f3f4f6" }],
      desportivo: [{ label: "Cinza claro", value: "#f5f5f5" }, { label: "Escuro", value: "#171717" }],
      // Neon Lab: fundo branco por omissão, com opções escuras (preto/carvão).
      neonlab: [{ label: "Preto", value: "#121317" }, { label: "Carvão", value: "#1a1b1f" }, { label: "Cartão", value: "#1C1C1E" }],
    };
    const surfaces = byModel[store!.templateId] ?? [{ label: "Claro", value: "#f6f3f2" }];
    return [{ label: "Padrão", value: "" }, { label: "Branco", value: "#ffffff" }, ...surfaces];
  }

  /** Categorias distintas existentes (para o formulário de produto). */
  function currentCategories(): string[] {
    return [...new Set(
      Array.from(productsById.values())
        .map((p) => p.category)
        .filter((c): c is string => !!c),
    )];
  }

  const storeUrl = publicStoreUrl(store.identifier);
  const defaultColor = getTemplate(store.templateId).defaultBrand ?? "#DC2626";

  // --- Histórico para "Desfazer" (apenas a personalização editável) ---
  const history: string[] = [];
  let currentScreen: "home" | "product" | "checkout" = "home";
  let lastView: StoreViewModel | null = null;
  let arcTarget: number | "add" = "add";
  let blockImgTarget = 0;
  let testiTarget: { i: number; j: number } = { i: 0, j: 0 };
  function snapshot(): void {
    const json = JSON.stringify(custom);
    if (history[history.length - 1] !== json) history.push(json);
    if (history.length > 50) history.shift();
  }
  function applyState(json: string): void {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const k of Object.keys(custom)) delete (custom as Record<string, unknown>)[k];
    Object.assign(custom, parsed);
  }
  function syncColorUI(): void {
    const value = custom.colors?.primary ?? defaultColor;
    const ci = $("#color") as HTMLInputElement | null; if (ci) ci.value = value;
    const dot = $("#color-dot"); if (dot) dot.style.background = value;
  }

  async function buildView(): Promise<StoreViewModel> {
    const logo = await assetRepository.findLogo(store!.id);
    const banners = await bannerRepository.listByStore(store!.id);
    const all = await productRepository.listByStore(store!.id);
    productsById = new Map(all.map((p) => [p.id, p]));
    const products = all.filter((p) => p.available);
    const result: StorefrontResult = { kind: "render", store: store!, logo, banners, products };
    return renderStore(result);
  }

  render(`
  <div class="min-h-screen flex flex-col bg-gray-100 font-sans text-gray-900">
    <header class="sticky top-0 z-[60] bg-white/95 backdrop-blur border-b border-gray-200">
      <div class="flex justify-center px-4 pt-2 pb-1.5 border-b border-gray-100">
        <div class="inline-flex bg-gray-100 rounded-full p-1 gap-1 text-sm">
          <button data-screen="home" class="px-4 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">home</span> Início</button>
          <button data-screen="product" class="px-4 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">sell</span> Página de produto</button>
          <button data-screen="checkout" class="px-4 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">shopping_bag</span> Checkout</button>
        </div>
      </div>
      <div class="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
        <div class="flex items-center gap-3 min-w-0">
          <a href="${backHref}" id="back-link" class="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"><span class="material-symbols-outlined">arrow_back</span></a>
          <div class="min-w-0">
            <p class="text-xs text-gray-400 leading-none">A personalizar</p>
            <p class="text-gray-900 font-bold truncate">${esc(store.name)}</p>
          </div>
        </div>
        <div class="flex items-center gap-1 md:gap-2">
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer rounded-full hover:bg-gray-100 px-2 py-1.5 relative" title="Cor de destaque">
            <span class="w-6 h-6 rounded-full border border-gray-200" id="color-dot" style="background:${esc(custom.colors?.primary ?? defaultColor)}"></span>
            <span class="hidden sm:inline">Cor</span>
            <input id="color" type="color" value="${esc(custom.colors?.primary ?? defaultColor)}" class="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer rounded-full hover:bg-gray-100 px-2 py-1.5 relative" title="Cor dos textos">
            <span class="w-6 h-6 rounded-full border border-gray-200" id="ink-dot" style="background:${esc(custom.colors?.text ?? "#111827")}"></span>
            <span class="hidden sm:inline">Texto</span>
            <input id="ink" type="color" value="${esc(custom.colors?.text ?? "#111827")}" class="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer rounded-full hover:bg-gray-100 px-2 py-1.5 relative" title="Cor dos ícones">
            <span class="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center" id="icon-dot" style="color:${esc(custom.colors?.icon ?? custom.colors?.text ?? "#111827")}"><span class="material-symbols-outlined text-[16px]">star</span></span>
            <span class="hidden sm:inline">Ícones</span>
            <input id="icon-color" type="color" value="${esc(custom.colors?.icon ?? custom.colors?.text ?? "#111827")}" class="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <label class="flex items-center gap-1.5 text-sm text-gray-600 rounded-full hover:bg-gray-100 px-2 py-1.5" title="Estilo da loja">
            <span class="material-symbols-outlined text-[18px]">style</span>
            <select id="theme-style" class="bg-transparent text-sm text-gray-700 outline-none cursor-pointer">
              ${THEME_STYLES.map((s) => `<option value="${s.id}" ${custom.theme?.style === s.id ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
            </select>
          </label>
          <button id="undo" class="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-full hover:bg-gray-100 transition-colors"><span class="material-symbols-outlined text-[18px]">undo</span><span class="hidden sm:inline">Desfazer</span></button>
          <button id="tutorial" class="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-full transition-colors" style="color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">school</span><span class="hidden sm:inline">Tutorial</span></button>
          <button id="open-preview" class="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-full hover:bg-gray-100 transition-colors"><span class="material-symbols-outlined text-[18px]">visibility</span><span class="hidden sm:inline">Abrir preview</span></button>
          <a id="ver-loja" href="${esc(storeUrl)}" target="_blank" rel="noopener" class="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-full hover:bg-gray-100 transition-colors"><span class="material-symbols-outlined text-[18px]">open_in_new</span><span class="hidden sm:inline">Ver loja</span></a>
          <button id="save" class="text-white px-5 py-2 rounded-full text-sm font-bold flex items-center gap-1 shadow-sm transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>
        </div>
      </div>
    </header>
    <div id="preview" class="flex-grow overflow-auto"></div>
    <input id="logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
    <input id="hero-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="feature-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="arc-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="block-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="testi-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="footer-logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
    <div id="mb-text-tools" class="fixed left-1/2 -translate-x-1/2 bottom-5 z-[70] hidden items-center gap-3 bg-neutral-900 text-white rounded-full shadow-2xl px-4 py-2.5">
      <span class="text-xs font-medium">Cor deste texto</span>
      <label class="relative w-7 h-7 rounded-full border-2 border-white/30 cursor-pointer overflow-hidden block" title="Escolher cor">
        <span id="mb-text-color-dot" class="absolute inset-0"></span>
        <input id="mb-text-color" type="color" class="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
      <button id="mb-text-color-reset" class="text-xs text-white/70 hover:text-white flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">format_color_reset</span> Repor</button>
    </div>
  </div>
  <!-- Painel de pré-visualização (desliza da direita) -->
  <div id="mb-preview" class="fixed inset-0 z-[80]" style="display:none">
    <div id="mb-preview-backdrop" class="absolute inset-0 bg-black/40" style="opacity:0;transition:opacity .3s ease"></div>
    <div id="mb-preview-panel" class="absolute top-0 right-0 h-full bg-neutral-100 shadow-2xl flex flex-col" style="width:min(1100px,96vw);transform:translateX(100%);transition:transform .32s cubic-bezier(.16,1,.3,1)">
      <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 bg-white shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined" style="color:${ACCENT}">visibility</span>
          <span class="font-bold truncate">Pré-visualização</span>
        </div>
        <div class="inline-flex bg-neutral-100 rounded-full p-1 gap-1 text-sm">
          <button data-pvp="desktop" class="px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">computer</span><span class="hidden sm:inline">Computador</span></button>
          <button data-pvp="mobile" class="px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">smartphone</span><span class="hidden sm:inline">Telemóvel</span></button>
        </div>
        <button id="mb-preview-close" class="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 transition-colors shrink-0" title="Esconder pré-visualização"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div id="mb-preview-body" class="flex-1 overflow-auto" style="background:#ece8e3"></div>
    </div>
  </div>
  <style>
    #preview [data-edit]{outline:1px dashed transparent;transition:outline-color .15s;cursor:text;border-radius:4px}
    #preview [data-edit]:hover{outline-color:${ACCENT}}
    #preview [data-edit]:focus{outline:2px solid ${ACCENT};outline-offset:2px}
    .mb-ov{opacity:0;transition:opacity .2s ease, transform .2s ease;pointer-events:none}
    .mb-ov-btn{pointer-events:auto}
    [data-edit-logo]{cursor:pointer}
    [data-edit-hero]:hover .mb-hero-ov{opacity:1}
    [data-edit-feature-image]{cursor:pointer}
    [data-edit-feature-image]:hover .mb-feat-ov{opacity:1}
    [data-edit-arc-item]{cursor:pointer}
    [data-edit-arc-item]:hover .mb-arc-ov{opacity:1}
    [data-edit-logo]:hover .mb-logo-ov{opacity:1}
    [data-edit-footer-logo]{cursor:pointer}
    [data-edit-footer-logo]:hover .mb-flogo-ov{opacity:1}
    [data-edit-product]:hover .mb-prod-ov{opacity:1}
    [data-edit-whatsapp]{position:relative}
    [data-edit-whatsapp]:hover .mb-wa-ov{opacity:1}
    .mb-chip{transition:transform .15s ease, background .15s ease}
    .mb-chip:hover{transform:translateY(-1px)}
    .mb-model-btn{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9999px;font-size:13px;font-weight:600;color:#F95901;background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 10px rgba(0,0,0,.10);cursor:pointer;transition:background .15s ease, border-color .15s ease}
    .mb-model-btn:hover{background:#fff7f2;border-color:#F95901}
    .mb-model-btn .material-symbols-outlined{font-size:18px}
    .mb-sec-divider{display:flex;align-items:center;gap:12px;margin:8px 0 24px;color:#9ca3af;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;pointer-events:none}
    .mb-sec-divider::before,.mb-sec-divider::after{content:"";flex:1;border-top:2px dashed #d4d4d8}
  </style>`);

  function bind(preview: HTMLElement): void {
    preview.style.setProperty("--brand", custom.colors?.primary ?? defaultColor);
    applyInk(preview, custom);
    applyTheme(preview, custom);
    applyFieldColors(preview, custom);
    applyIconColor(preview, custom);

    // Não navegar ao clicar em links do preview.
    preview.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a && !(e.target as HTMLElement).closest("[data-edit-logo]")) e.preventDefault();
    });

    // Colar sempre como texto simples (remove a formatação de origem).
    preview.addEventListener("paste", (e) => {
      const t = e.target as HTMLElement;
      if (!t || !t.isContentEditable) return;
      e.preventDefault();
      const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r/g, "");
      document.execCommand("insertText", false, text);
      t.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Textos editáveis inline (com snapshot ao focar).
    preview.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.addEventListener("focus", () => { snapshot(); showTextTools(el); });
      el.addEventListener("input", () => setPath(custom as Record<string, any>, el.dataset.edit!, el.textContent?.trim() ?? ""));
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); el.blur(); }
      });
    });

    // Logótipo — trocar imagem + aumentar/diminuir tamanho.
    const logo = preview.querySelector<HTMLElement>("[data-edit-logo]");
    if (logo) {
      // Garante que o overlay ancora ao logótipo (e não ao header sticky).
      logo.style.position = logo.style.position || "relative";
      logo.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("[data-logo-ctrl]")) return;
        e.preventDefault();
        ($("#logo-input") as HTMLInputElement).click();
      });
      const ov = document.createElement("div");
      ov.className = "mb-ov mb-logo-ov absolute left-1/2 -translate-x-1/2 top-full mt-1 flex items-center gap-1 bg-neutral-900 text-white text-xs px-1.5 py-1 rounded-full shadow z-20";
      const hasImg = !!logo.querySelector("img");
      const sizeBtns = hasImg
        ? `<button data-logo-ctrl data-act="smaller" title="Diminuir" class="mb-ov-btn w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">remove</span></button>`
        : "";
      const bigBtn = hasImg
        ? `<button data-logo-ctrl data-act="bigger" title="Aumentar" class="mb-ov-btn w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">add</span></button>`
        : "";
      ov.innerHTML = `${sizeBtns}
        <button data-logo-ctrl data-act="img" class="mb-ov-btn px-2 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">photo_camera</span> Trocar</button>
        ${bigBtn}`;
      logo.appendChild(ov);
      const curH = (): number => {
        const img = logo.querySelector("img");
        return custom.logoScale ?? (img ? Math.round(img.getBoundingClientRect().height) : 32);
      };
      const setScale = (delta: number): void => {
        const next = Math.max(16, Math.min(80, curH() + delta));
        snapshot();
        setPath(custom as Record<string, any>, "logoScale", next);
        void rebuild();
      };
      ov.querySelector('[data-act="smaller"]')?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setScale(-4); });
      ov.querySelector('[data-act="bigger"]')?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setScale(4); });
      ov.querySelector('[data-act="img"]')?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); ($("#logo-input") as HTMLInputElement).click(); });
    }

    // Hero — overlay por hover.
    const hero = preview.querySelector<HTMLElement>("[data-edit-hero]");
    if (hero) {
      const ov = document.createElement("div");
      ov.className = "mb-ov mb-hero-ov absolute top-3 right-3 z-10";
      ov.innerHTML = `<button class="mb-ov-btn bg-white/90 hover:bg-white text-neutral-900 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 shadow"><span class="material-symbols-outlined text-[16px]">image</span> Trocar imagem</button>`;
      ov.querySelector("button")!.addEventListener("click", (e) => { e.preventDefault(); ($("#hero-input") as HTMLInputElement).click(); });
      hero.appendChild(ov);
    }

    // Bloco editorial (Galeria) — trocar imagem por hover.
    const feature = preview.querySelector<HTMLElement>("[data-edit-feature-image]");
    if (feature) {
      const ov = document.createElement("div");
      ov.className = "mb-ov mb-feat-ov absolute top-3 right-3 z-10";
      ov.innerHTML = `<button class="mb-ov-btn bg-white/90 hover:bg-white text-neutral-900 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 shadow"><span class="material-symbols-outlined text-[16px]">image</span> Trocar imagem</button>`;
      ov.querySelector("button")!.addEventListener("click", (e) => { e.preventDefault(); ($("#feature-input") as HTMLInputElement).click(); });
      feature.appendChild(ov);
    }

    // Hero em arco (Galeria) — trocar/remover cada foto + adicionar.
    const arc = preview.querySelector<HTMLElement>("[data-edit-arc]");
    if (arc) {
      const ensureHeroImages = (): string[] => {
        if (!Array.isArray(custom.heroImages) || custom.heroImages.length === 0) {
          custom.heroImages = Array.from(preview.querySelectorAll<HTMLImageElement>("[data-edit-arc-item] img"))
            .map((img) => img.getAttribute("src") || "")
            .filter(Boolean);
        }
        return custom.heroImages;
      };
      arc.querySelectorAll<HTMLElement>("[data-edit-arc-item]").forEach((card) => {
        const i = Number(card.dataset.editArcItem);
        const ov = document.createElement("div");
        ov.className = "mb-ov mb-arc-ov absolute inset-0 flex items-center justify-center gap-1.5 rounded-2xl";
        ov.style.background = "rgba(0,0,0,.45)";
        ov.innerHTML = `
          <button data-act="rep" class="mb-ov-btn bg-white text-neutral-900 rounded-full p-1.5 shadow" title="Trocar foto"><span class="material-symbols-outlined text-[16px]">photo_camera</span></button>
          <button data-act="rem" class="mb-ov-btn bg-white text-red-600 rounded-full p-1.5 shadow" title="Remover foto"><span class="material-symbols-outlined text-[16px]">close</span></button>`;
        ov.querySelector('[data-act="rep"]')!.addEventListener("click", (e) => { e.preventDefault(); arcTarget = i; ($("#arc-input") as HTMLInputElement).click(); });
        ov.querySelector('[data-act="rem"]')!.addEventListener("click", (e) => {
          e.preventDefault();
          const imgs = ensureHeroImages();
          if (imgs.length <= 1) { toast("Mantenha pelo menos uma foto no hero.", "error"); return; }
          snapshot();
          imgs.splice(i, 1);
          void rebuild();
        });
        card.appendChild(ov);
      });
      const addBtn = document.createElement("button");
      addBtn.className = "mb-ov-btn absolute top-3 right-3 z-20 bg-white/90 hover:bg-white text-neutral-900 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 shadow";
      addBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">add_photo_alternate</span> Adicionar foto`;
      addBtn.addEventListener("click", (e) => { e.preventDefault(); arcTarget = "add"; ($("#arc-input") as HTMLInputElement).click(); });
      arc.closest("section")?.appendChild(addBtn);
    }

    // Secção editorial (Galeria) — remover; ou adicionar quando ausente.
    const featSlot = preview.querySelector<HTMLElement>("[data-feature-slot]");
    if (featSlot) {
      const feat = featSlot.querySelector<HTMLElement>("[data-edit-feature]");
      if (feat) {
        feat.style.position = feat.style.position || "relative";
        const rm = document.createElement("button");
        rm.className = "mb-ov-btn absolute top-3 left-3 z-10 bg-white/90 hover:bg-white text-red-600 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 shadow";
        rm.innerHTML = `<span class="material-symbols-outlined text-[16px]">delete</span> Remover secção`;
        rm.addEventListener("click", (e) => { e.preventDefault(); snapshot(); setPath(custom as Record<string, any>, "featureEnabled", false); void rebuild(); });
        feat.appendChild(rm);
      } else {
        const add = document.createElement("button");
        add.className = "mb-ov-btn block mx-auto my-8 border-2 border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-500 rounded-xl py-4 px-8 flex items-center justify-center gap-2 transition-colors";
        add.innerHTML = `<span class="material-symbols-outlined">add</span> Adicionar secção (foto + texto)`;
        add.addEventListener("click", (e) => { e.preventDefault(); snapshot(); setPath(custom as Record<string, any>, "featureEnabled", true); void rebuild(); });
        featSlot.appendChild(add);
      }
    }

    // Garantias da página de produto — editar texto + remover + adicionar.
    const perks = preview.querySelector<HTMLElement>("[data-edit-perks]");
    if (perks) {
      if (!custom.productPerks || !custom.productPerks.length) {
        custom.productPerks = Array.from(perks.querySelectorAll<HTMLElement>("[data-edit-perk-item]")).map((li) => ({
          icon: li.querySelector(".material-symbols-outlined")?.textContent?.trim() || "check_circle",
          text: li.querySelector<HTMLElement>("[data-perk-text]")?.textContent?.trim() || "",
        }));
      }
      perks.querySelectorAll<HTMLElement>("[data-edit-perk-item]").forEach((li, i) => {
        const span = li.querySelector<HTMLElement>("[data-perk-text]");
        if (span) {
          span.setAttribute("contenteditable", "true");
          span.setAttribute("spellcheck", "false");
          span.addEventListener("focus", () => snapshot());
          span.addEventListener("input", () => { (custom.productPerks as { icon?: string; text?: string }[])[i]!.text = span.textContent?.trim() ?? ""; });
          span.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); span.blur(); } });
        }
        // Seletor de ícone predefinido (clicar no ícone abre a paleta).
        const iconEl = li.querySelector<HTMLElement>(".material-symbols-outlined");
        if (iconEl) {
          iconEl.style.cursor = "pointer";
          iconEl.title = "Escolher ícone";
          li.style.position = li.style.position || "relative";
          const pal = document.createElement("div");
          pal.className = "mb-ov-btn absolute z-30 hidden bg-white border border-neutral-200 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1";
          pal.style.cssText += ";top:100%;left:0;width:224px";
          pal.innerHTML = PERK_ICON_CHOICES
            .map((ic) => `<button type="button" data-ic="${ic}" class="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-700"><span class="material-symbols-outlined text-[20px]">${ic}</span></button>`)
            .join("");
          li.appendChild(pal);
          iconEl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pal.classList.toggle("hidden"); });
          pal.querySelectorAll<HTMLElement>("[data-ic]").forEach((b) => b.addEventListener("click", (e) => {
            e.preventDefault();
            snapshot();
            (custom.productPerks as { icon?: string; text?: string }[])[i]!.icon = b.dataset.ic!;
            void rebuild();
          }));
        }
        const rm = document.createElement("button");
        rm.className = "mb-ov-btn ml-1 align-middle text-neutral-400 hover:text-red-600";
        rm.title = "Remover";
        rm.innerHTML = `<span class="material-symbols-outlined text-[16px]">close</span>`;
        rm.addEventListener("click", (e) => { e.preventDefault(); snapshot(); (custom.productPerks as unknown[]).splice(i, 1); void rebuild(); });
        li.appendChild(rm);
      });
      const add = document.createElement("button");
      add.className = "mb-chip mb-ov-btn mt-3 text-xs text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-full px-3 py-1 flex items-center gap-1";
      add.innerHTML = `<span class="material-symbols-outlined text-[14px]">add</span> Adicionar garantia`;
      add.addEventListener("click", (e) => {
        e.preventDefault();
        snapshot();
        (custom.productPerks ?? (custom.productPerks = [])).push({ icon: "check_circle", text: "Nova garantia" });
        void rebuild();
      });
      perks.appendChild(add);
    }

    // Blocos de conteúdo (info / texto / testemunhos / localização) — gerir.
    preview.querySelectorAll<HTMLElement>("[data-edit-block]").forEach((blk) => {
      const i = Number(blk.dataset.editBlock);
      blk.style.position = blk.style.position || "relative";
      const bar = document.createElement("div");
      bar.className = "mb-ov-btn absolute top-3 right-3 z-20 flex items-center gap-0.5 bg-white/95 rounded-full shadow px-1 py-1";
      bar.innerHTML = `
        <button data-up title="Subir" class="w-7 h-7 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600"><span class="material-symbols-outlined text-[18px]">arrow_upward</span></button>
        <button data-down title="Descer" class="w-7 h-7 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600"><span class="material-symbols-outlined text-[18px]">arrow_downward</span></button>
        <button data-rm title="Remover" class="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-red-600"><span class="material-symbols-outlined text-[18px]">delete</span></button>`;
      bar.querySelector("[data-up]")!.addEventListener("click", (e) => { e.preventDefault(); const a = custom.blocks; if (a && i > 0) { snapshot(); [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; void rebuild(); } });
      bar.querySelector("[data-down]")!.addEventListener("click", (e) => { e.preventDefault(); const a = custom.blocks; if (a && i < a.length - 1) { snapshot(); [a[i + 1], a[i]] = [a[i]!, a[i + 1]!]; void rebuild(); } });
      bar.querySelector("[data-rm]")!.addEventListener("click", (e) => { e.preventDefault(); const a = custom.blocks; if (a) { snapshot(); a.splice(i, 1); void rebuild(); } });
      blk.appendChild(bar);

      // Cor de fundo da secção (info/texto) — escolher entre as cores do modelo.
      if (blk.dataset.blockType === "info" || blk.dataset.blockType === "text") {
        const bgBtn = document.createElement("button");
        bgBtn.title = "Cor de fundo";
        bgBtn.className = "w-7 h-7 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600";
        bgBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">format_color_fill</span>`;
        bar.insertBefore(bgBtn, bar.firstChild);
        const choices = sectionBgChoices();
        const cur = (custom.blocks?.[i] as { bg?: string } | undefined)?.bg ?? "";
        const pop = document.createElement("div");
        pop.className = "mb-ov-btn absolute top-12 right-3 z-30 hidden bg-white border border-neutral-200 rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5 w-44";
        pop.innerHTML = choices.map((c) => {
          const active = c.value === cur;
          const ring = active ? "ring-2 ring-offset-1 ring-[#F95901]" : "";
          const border = c.value ? "border-neutral-200" : "border-dashed border-neutral-400";
          const inner = c.value ? "" : `<span class="material-symbols-outlined text-[16px] text-neutral-400">format_color_reset</span>`;
          return `<button data-bg-val="${esc(c.value)}" title="${esc(c.label)}" class="w-8 h-8 rounded-lg border ${border} ${ring} flex items-center justify-center" style="background:${esc(c.value || "#ffffff")}">${inner}</button>`;
        }).join("");
        bgBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pop.classList.toggle("hidden"); });
        pop.querySelectorAll<HTMLElement>("[data-bg-val]").forEach((sw) => {
          sw.addEventListener("click", (e) => {
            e.preventDefault();
            const b = custom.blocks?.[i] as { bg?: string } | undefined;
            if (!b) return;
            snapshot();
            const v = sw.dataset.bgVal ?? "";
            if (v) b.bg = v; else delete b.bg;
            void rebuild();
          });
        });
        blk.appendChild(pop);
      }

      // Bloco "info" — trocar imagem + inverter lado.
      const imgBox = blk.querySelector<HTMLElement>("[data-edit-block-image]");
      if (imgBox) {
        imgBox.style.cursor = "pointer";
        const ov = document.createElement("div");
        ov.className = "mb-ov-btn absolute top-3 left-3 z-20 flex gap-1.5 transition-opacity";
        ov.style.opacity = "0";
        ov.innerHTML = `
          <button data-img class="bg-white/90 hover:bg-white text-neutral-900 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 shadow"><span class="material-symbols-outlined text-[16px]">image</span> Trocar</button>
          <button data-flip class="bg-white/90 hover:bg-white text-neutral-900 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 shadow"><span class="material-symbols-outlined text-[16px]">swap_horiz</span> Lado</button>`;
        imgBox.appendChild(ov);
        imgBox.addEventListener("mouseenter", () => { ov.style.opacity = "1"; });
        imgBox.addEventListener("mouseleave", () => { ov.style.opacity = "0"; });
        ov.querySelector("[data-img]")!.addEventListener("click", (e) => { e.preventDefault(); blockImgTarget = i; ($("#block-input") as HTMLInputElement).click(); });
        ov.querySelector("[data-flip]")!.addEventListener("click", (e) => { e.preventDefault(); const b = custom.blocks?.[i] as { imageSide?: string } | undefined; if (b) { snapshot(); b.imageSide = b.imageSide === "right" ? "left" : "right"; void rebuild(); } });
      }

      // Bloco "testemunhos" — adicionar/remover pessoa.
      const testis = blk.querySelector<HTMLElement>("[data-edit-testimonials]");
      if (testis) {
        testis.querySelectorAll<HTMLElement>("[data-testi-item]").forEach((card, j) => {
          const rm = document.createElement("button");
          rm.className = "mb-ov-btn absolute top-2 right-2 text-neutral-300 hover:text-red-600";
          rm.innerHTML = `<span class="material-symbols-outlined text-[18px]">close</span>`;
          rm.addEventListener("click", (e) => { e.preventDefault(); const b = custom.blocks?.[i] as { items?: unknown[] } | undefined; if (b?.items) { snapshot(); b.items.splice(j, 1); void rebuild(); } });
          card.appendChild(rm);

          // Avatar — trocar foto (câmara) ou, se tiver foto, removê-la (volta à letra editável).
          const av = card.querySelector<HTMLElement>("[data-testi-avatar]");
          if (av) {
            av.style.position = "relative";
            const cam = document.createElement("button");
            cam.className = "mb-ov-btn absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-neutral-700 hover:text-neutral-900";
            cam.title = "Trocar foto";
            cam.innerHTML = `<span class="material-symbols-outlined" style="font-size:12px">photo_camera</span>`;
            cam.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); testiTarget = { i, j }; ($("#testi-avatar-input") as HTMLInputElement).click(); });
            av.appendChild(cam);
            if (av.querySelector("img")) {
              const rmImg = document.createElement("button");
              rmImg.className = "mb-ov-btn absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-red-600";
              rmImg.title = "Remover foto";
              rmImg.innerHTML = `<span class="material-symbols-outlined" style="font-size:12px">close</span>`;
              rmImg.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                const it = (custom.blocks?.[i] as { items?: { avatarUrl?: string }[] } | undefined)?.items?.[j];
                if (it) { snapshot(); delete it.avatarUrl; void rebuild(); }
              });
              av.appendChild(rmImg);
            }
          }
        });
        const add2 = document.createElement("button");
        add2.className = "mb-ov-btn mt-6 mx-auto flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-full px-4 py-2";
        add2.innerHTML = `<span class="material-symbols-outlined text-[16px]">add</span> Adicionar testemunho`;
        add2.addEventListener("click", (e) => {
          e.preventDefault();
          const b = custom.blocks?.[i] as { items?: { name?: string; role?: string; text?: string }[] } | undefined;
          if (b) { snapshot(); (b.items ?? (b.items = [])).push({ name: "Cliente", role: "", text: "Escreva aqui o testemunho." }); void rebuild(); }
        });
        testis.parentElement?.appendChild(add2);
      }

      // Bloco "localização" — atualizar mapa ao sair do campo da morada.
      const addr = blk.querySelector<HTMLElement>("[data-edit-loc-address]");
      if (addr) addr.addEventListener("blur", () => { void rebuild(); });

      // Bloco "localização" — botão para definir o pin no mapa.
      if (blk.dataset.blockType === "location") {
        const mapBtn = document.createElement("button");
        mapBtn.className = "mb-ov-btn mt-4 mx-auto flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2 rounded-full shadow";
        mapBtn.style.background = ACCENT;
        mapBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">location_searching</span> Definir no mapa`;
        mapBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const b = custom.blocks?.[i] as { lat?: number; lng?: number; address?: string } | undefined;
          if (!b) return;
          void openMapPicker({
            lat: b.lat,
            lng: b.lng,
            address: b.address,
            onSave: (lat, lng) => { snapshot(); b.lat = lat; b.lng = lng; void rebuild(); },
          });
        });
        blk.appendChild(mapBtn);
      }
    });

    // Cor de fundo da secção de produtos (modelos que a suportam, ex.: Neon Lab).
    const prodBgHost = preview.querySelector<HTMLElement>("[data-edit-products-bg]");
    if (prodBgHost) {
      prodBgHost.style.position = prodBgHost.style.position || "relative";
      const choices = sectionBgChoices();
      const cur = custom.productsBg ?? "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = "Cor de fundo dos produtos";
      btn.className = "mb-ov-btn absolute top-4 right-4 z-20 inline-flex items-center gap-1 bg-white/95 hover:bg-white text-neutral-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow";
      btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">format_color_fill</span> Fundo`;
      const pop = document.createElement("div");
      pop.className = "mb-ov-btn absolute top-14 right-4 z-30 hidden bg-white border border-neutral-200 rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5 w-44";
      pop.innerHTML = choices.map((c) => {
        const active = c.value === cur;
        const ring = active ? "ring-2 ring-offset-1 ring-[#F95901]" : "";
        const border = c.value ? "border-neutral-200" : "border-dashed border-neutral-400";
        const inner = c.value ? "" : `<span class="material-symbols-outlined text-[16px] text-neutral-400">format_color_reset</span>`;
        return `<button data-bg-val="${esc(c.value)}" title="${esc(c.label)}" class="w-8 h-8 rounded-lg border ${border} ${ring} flex items-center justify-center" style="background:${esc(c.value || "#ffffff")}">${inner}</button>`;
      }).join("");
      btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pop.classList.toggle("hidden"); });
      pop.querySelectorAll<HTMLElement>("[data-bg-val]").forEach((sw) => {
        sw.addEventListener("click", (e) => {
          e.preventDefault();
          snapshot();
          const v = sw.dataset.bgVal ?? "";
          if (v) custom.productsBg = v; else delete custom.productsBg;
          void rebuild();
        });
      });
      prodBgHost.appendChild(btn);
      prodBgHost.appendChild(pop);
    }

    // FoodMart: escolher o ícone de cada categoria (galeria de ícones).
    preview.querySelectorAll<HTMLElement>("[data-fm-cat]").forEach((cell) => {
      const cat = cell.dataset.fmCat!;
      cell.style.position = cell.style.position || "relative";
      const cur = custom.categoryIcons?.[cat] ?? "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = "Escolher ícone";
      btn.className = "mb-ov-btn absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-white shadow border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900";
      btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">edit</span>`;
      const pop = document.createElement("div");
      pop.className = "mb-ov-btn absolute z-30 hidden top-10 right-2 bg-white border border-neutral-200 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1 w-64 max-h-64 overflow-y-auto";
      pop.innerHTML = FM_CATEGORY_ICONS
        .map((ic) => `<button type="button" data-ic="${ic}" class="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-neutral-100 ${ic === cur ? "ring-2 ring-[#F95901]" : ""}" style="color:#333"><span class="material-symbols-outlined text-[20px]">${ic}</span></button>`)
        .join("");
      btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pop.classList.toggle("hidden"); });
      pop.querySelectorAll<HTMLElement>("[data-ic]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.preventDefault();
          snapshot();
          if (!custom.categoryIcons) custom.categoryIcons = {};
          custom.categoryIcons[cat] = b.dataset.ic!;
          void rebuild();
        }));
      cell.appendChild(btn);
      cell.appendChild(pop);
    });

    // ---- FoodMart: cartões de anúncio, faixa promo e garantias ----
    if (store!.templateId === "foodmart") {
      const FM_CARD_BGS = ["#eaf5ea", "#fdeaea", "#eef1f3", "#fff4e0", "#e8f0fe", "#f3e8ff", "#fde8f3", "#e0f7f4", "#f5f5f5", "#ffffff"];
      const FM_TAG_BGS = ["#dc3545", "#3fb95a", "#FFC43F", "#6995B1", "#f97316", "#8b5cf6", "#0ea5e9", "#111827"];
      const FM_CTA_ICONS = ["arrow_forward", "shopping_cart", "local_mall", "bolt", "redeem", "sell", "trending_flat", "chevron_right"];
      const FM_ICON_COLORS = [ACCENT, "#222222", "#6995B1", "#3fb95a", "#dc3545", "#f97316", "#8b5cf6", "#0ea5e9"];

      /** Popover de controlos, aberto por um botão "tune" (lado direito ou esquerdo). */
      const fmTune = (host: HTMLElement, build: (pop: HTMLElement) => void, side: "right" | "left" = "right"): void => {
        host.style.position = host.style.position || "relative";
        const pos = side === "left" ? "top-2 left-2" : "top-2 right-2";
        const popPos = side === "left" ? "top-11 left-2" : "top-11 right-2";
        const btn = document.createElement("button");
        btn.type = "button"; btn.title = "Editar";
        btn.className = `mb-ov-btn absolute ${pos} z-30 w-8 h-8 rounded-full bg-white shadow border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900`;
        btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">tune</span>`;
        const pop = document.createElement("div");
        pop.className = `mb-ov-btn absolute z-40 hidden ${popPos} bg-white border border-neutral-200 rounded-xl shadow-xl p-3 w-64 text-left space-y-3 normal-case tracking-normal`;
        build(pop);
        btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pop.classList.toggle("hidden"); });
        host.appendChild(btn); host.appendChild(pop);
      };

      const swatchRow = (pop: HTMLElement, label: string, colors: string[], current: string | undefined, onPick: (c: string) => void): void => {
        const wrap = document.createElement("div");
        wrap.innerHTML = `<p class="text-[11px] font-semibold text-neutral-500 mb-1">${esc(label)}</p><div class="flex flex-wrap gap-1.5"></div>`;
        const row = wrap.querySelector("div")!;
        colors.forEach((c) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = `w-7 h-7 rounded-lg border ${c === current ? "ring-2 ring-[#F95901]" : "border-neutral-200"}`;
          b.style.background = c;
          b.addEventListener("click", (e) => { e.preventDefault(); snapshot(); onPick(c); void rebuild(); });
          row.appendChild(b);
        });
        pop.appendChild(wrap);
      };

      const iconRow = (pop: HTMLElement, label: string, icons: string[], current: string | undefined, onPick: (ic: string) => void): void => {
        const wrap = document.createElement("div");
        wrap.innerHTML = `<p class="text-[11px] font-semibold text-neutral-500 mb-1">${esc(label)}</p><div class="grid grid-cols-6 gap-1"></div>`;
        const grid = wrap.querySelector("div")!;
        icons.forEach((ic) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = `w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 ${ic === current ? "ring-2 ring-[#F95901]" : ""}`;
          b.style.color = "#333";
          b.innerHTML = `<span class="material-symbols-outlined text-[18px]">${ic}</span>`;
          b.addEventListener("click", (e) => { e.preventDefault(); snapshot(); onPick(ic); void rebuild(); });
          grid.appendChild(b);
        });
        pop.appendChild(wrap);
      };

      const selectRow = (pop: HTMLElement, label: string, current: string | undefined, onPick: (v: string) => void): void => {
        const cats = currentCategories();
        const wrap = document.createElement("div");
        wrap.innerHTML = `<p class="text-[11px] font-semibold text-neutral-500 mb-1">${esc(label)}</p>`;
        const sel = document.createElement("select");
        sel.className = "w-full text-sm border border-neutral-300 rounded-lg px-2 py-1.5 bg-white text-neutral-800";
        sel.innerHTML = `<option value="">Secção de produtos</option>` +
          cats.map((c) => `<option value="${esc(c)}" ${c === current ? "selected" : ""}>${esc(c)}</option>`).join("");
        sel.addEventListener("change", () => { snapshot(); onPick(sel.value); void rebuild(); });
        wrap.appendChild(sel);
        pop.appendChild(wrap);
      };

      const c = custom as Record<string, any>;

      // Cartões de anúncio do hero ("20% desconto"…): cor do cartão, cor da
      // etiqueta, ícone e destino do botão. (Textos são editáveis inline.)
      preview.querySelectorAll<HTMLElement>("[data-fm-ad]").forEach((card) => {
        const i = Number(card.dataset.fmAd);
        const ad = custom.foodmart?.ads?.[i];
        fmTune(card, (pop) => {
          swatchRow(pop, "Cor do cartão", FM_CARD_BGS, ad?.bg, (v) => setPath(c, `foodmart.ads.${i}.bg`, v));
          swatchRow(pop, "Cor da etiqueta", FM_TAG_BGS, ad?.tagBg, (v) => setPath(c, `foodmart.ads.${i}.tagBg`, v));
          iconRow(pop, "Ícone do botão", FM_CTA_ICONS, ad?.ctaIcon ?? "arrow_forward", (v) => setPath(c, `foodmart.ads.${i}.ctaIcon`, v));
          selectRow(pop, "Destino do botão", ad?.ctaTarget, (v) => setPath(c, `foodmart.ads.${i}.ctaTarget`, v));
        });
      });

      // Faixa promocional final: ícone + destino do botão.
      const promoEl = preview.querySelector<HTMLElement>("[data-fm-promo]");
      if (promoEl) {
        fmTune(promoEl, (pop) => {
          iconRow(pop, "Ícone do botão", FM_CTA_ICONS, custom.foodmart?.promo?.ctaIcon ?? "arrow_forward", (v) => setPath(c, "foodmart.promo.ctaIcon", v));
          selectRow(pop, "Destino do botão", custom.foodmart?.promo?.ctaTarget, (v) => setPath(c, "foodmart.promo.ctaTarget", v));
        }, "left");
      }

      // Faixa de garantias: cor dos ícones (secção) + ícone por cartão.
      const featsEl = preview.querySelector<HTMLElement>("[data-fm-features]");
      if (featsEl) {
        fmTune(featsEl, (pop) => {
          swatchRow(pop, "Cor dos ícones", FM_ICON_COLORS, custom.foodmart?.featuresIconColor, (v) => setPath(c, "foodmart.featuresIconColor", v));
        }, "left");
        featsEl.querySelectorAll<HTMLElement>("[data-fm-feature]").forEach((cell) => {
          const i = Number(cell.dataset.fmFeature);
          const cur = custom.foodmart?.features?.[i]?.icon ?? "";
          cell.style.position = cell.style.position || "relative";
          const btn = document.createElement("button");
          btn.type = "button"; btn.title = "Escolher ícone";
          btn.className = "mb-ov-btn absolute top-0 right-0 z-20 w-7 h-7 rounded-full bg-white shadow border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900";
          btn.innerHTML = `<span class="material-symbols-outlined text-[15px]">edit</span>`;
          const pop = document.createElement("div");
          pop.className = "mb-ov-btn absolute z-30 hidden top-8 right-0 bg-white border border-neutral-200 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1 w-64 max-h-64 overflow-y-auto";
          pop.innerHTML = FM_CATEGORY_ICONS
            .map((ic) => `<button type="button" data-ic="${ic}" class="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-neutral-100 ${ic === cur ? "ring-2 ring-[#F95901]" : ""}" style="color:#333"><span class="material-symbols-outlined text-[20px]">${ic}</span></button>`)
            .join("");
          btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pop.classList.toggle("hidden"); });
          pop.querySelectorAll<HTMLElement>("[data-ic]").forEach((b) =>
            b.addEventListener("click", (e) => { e.preventDefault(); snapshot(); setPath(c, `foodmart.features.${i}.icon`, b.dataset.ic!); void rebuild(); }));
          cell.appendChild(btn);
          cell.appendChild(pop);
        });
      }
    }

    // Logótipo do rodapé — clicar abre o upload (overlay por hover).
    const footerLogo = preview.querySelector<HTMLElement>("[data-edit-footer-logo]");
    if (footerLogo) {
      footerLogo.addEventListener("click", (e) => { e.preventDefault(); ($("#footer-logo-input") as HTMLInputElement).click(); });
      const ov = document.createElement("span");
      ov.className = "mb-ov mb-flogo-ov absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap bg-neutral-900 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow z-10";
      ov.innerHTML = `<span class="material-symbols-outlined text-[14px]">photo_camera</span> Logótipo do rodapé`;
      footerLogo.appendChild(ov);
    }

    // Cabeçalho de navegação fixo (Início/Produtos/Categorias) — não editável.

    // Hero — destino do botão principal (categoria ou secção de produtos).
    const heroCta = preview.querySelector<HTMLElement>("[data-hero-cta]");
    if (heroCta) {
      const cats = currentCategories();
      const cur = custom.hero?.ctaTarget ?? "";
      const wrap = heroCta.parentElement;
      if (wrap) {
        wrap.style.position = wrap.style.position || "relative";
        const lnk = document.createElement("button");
        lnk.type = "button";
        lnk.title = "Para onde o botão do hero direciona";
        lnk.className = "mb-ov-btn inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-full px-2.5 py-1";
        lnk.innerHTML = `<span class="material-symbols-outlined text-[14px]">link</span> Destino`;
        const pop = document.createElement("div");
        pop.className = "mb-ov-btn absolute z-40 hidden bottom-full left-0 mb-1 bg-white border border-neutral-200 rounded-xl shadow-xl p-2 w-56 normal-case tracking-normal text-left";
        pop.innerHTML = `<p class="text-[11px] font-semibold text-neutral-500 mb-1 px-1">O botão leva para</p>`;
        const sel = document.createElement("select");
        sel.className = "w-full text-sm border border-neutral-300 rounded-lg px-2 py-1.5 bg-white text-neutral-800";
        sel.innerHTML = `<option value="">Secção de produtos</option>` +
          cats.map((c) => `<option value="${esc(c)}" ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("");
        sel.addEventListener("change", () => {
          snapshot();
          setPath(custom as Record<string, any>, "hero.ctaTarget", sel.value);
          void rebuild();
        });
        pop.appendChild(sel);
        lnk.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pop.classList.toggle("hidden"); });
        heroCta.after(lnk);
        lnk.after(pop);
      }
    }

    // Produtos — editar (hover) + adicionar card.
    preview.querySelectorAll<HTMLElement>("[data-edit-product]").forEach((card) => {
      const id = card.dataset.editProduct!;
      const ov = document.createElement("button");
      ov.className = "mb-ov mb-prod-ov mb-ov-btn absolute top-2 right-2 bg-white/90 hover:bg-white text-neutral-900 rounded-full p-1.5 shadow";
      ov.innerHTML = `<span class="material-symbols-outlined text-[18px]">edit</span>`;
      ov.addEventListener("click", (e) => {
        e.preventDefault();
        const product = productsById.get(id);
        if (product) openProductForm({ panel, ownerId, storeId: store!.id, product, categories: currentCategories(), customization: custom, onImagesChange: rebuild, onDone: rebuild });
      });
      card.appendChild(ov);
    });
    const grid = preview.querySelector<HTMLElement>("[data-edit-products]");
    if (grid) {
      const addCard = document.createElement("button");
      addCard.className = "mb-ov-btn group flex flex-col items-center justify-center gap-2 aspect-square rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-[color:var(--brand,#DC2626)] hover:text-neutral-900 transition-colors";
      addCard.innerHTML = `<span class="material-symbols-outlined text-3xl">add</span><span class="text-sm font-medium">Adicionar produto</span>`;
      addCard.addEventListener("click", (e) => {
        e.preventDefault();
        openProductForm({ panel, ownerId, storeId: store!.id, categories: currentCategories(), customization: custom, onImagesChange: rebuild, onDone: rebuild });
      });
      grid.appendChild(addCard);
    }

    // Secções de produtos — escolher categoria + adicionar/remover (só no ecrã inicial).
    const sectionsWrap = preview.querySelector<HTMLElement>("[data-edit-sections]");
    const sectionEls = preview.querySelectorAll<HTMLElement>("[data-edit-section]");
    if (sectionsWrap && sectionEls.length) {
      if (!custom.sections || !custom.sections.length) custom.sections = [{ category: "__all__" }];
      const cats = currentCategories();
      const baseOpts: { v: string; l: string }[] = [
        { v: "__all__", l: "Todos os produtos" },
        { v: "__featured__", l: "Destaques" },
        ...cats.map((c) => ({ v: c, l: c })),
      ];
      sectionEls.forEach((sec) => {
        const i = Number(sec.dataset.editSection);
        const head = sec.querySelector<HTMLElement>("[data-edit-section-head]");
        const conf = custom.sections?.[i];
        if (!head || !conf) return;
        const wrap = document.createElement("div");
        wrap.className = "mb-ov-btn flex items-center gap-1.5 shrink-0";
        const mkMove = (dir: -1 | 1, icon: string, title: string): HTMLButtonElement => {
          const btn = document.createElement("button");
          btn.title = title;
          btn.className = "text-neutral-400 hover:text-neutral-800";
          btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">${icon}</span>`;
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            const a = custom.sections; if (!a) return;
            const j = i + dir; if (j < 0 || j >= a.length) return;
            snapshot(); [a[j], a[i]] = [a[i]!, a[j]!]; void rebuild();
          });
          return btn;
        };
        if ((custom.sections?.length ?? 0) > 1) {
          wrap.appendChild(mkMove(-1, "arrow_upward", "Subir secção"));
          wrap.appendChild(mkMove(1, "arrow_downward", "Descer secção"));
        }
        const cur = conf.category;
        const opts = baseOpts.some((o) => o.v === cur) ? baseOpts : [...baseOpts, { v: cur, l: cur }];
        const sel = document.createElement("select");
        sel.title = "Categoria desta secção";
        sel.className = "text-sm border border-neutral-300 rounded-lg px-2 py-1.5 bg-white text-neutral-800 max-w-[180px]";
        sel.innerHTML = opts.map((o) => `<option value="${esc(o.v)}" ${o.v === cur ? "selected" : ""}>${esc(o.l)}</option>`).join("");
        sel.addEventListener("change", () => { snapshot(); custom.sections![i]!.category = sel.value; void rebuild(); });
        wrap.appendChild(sel);
        if ((custom.sections?.length ?? 0) > 1) {
          const rm = document.createElement("button");
          rm.title = "Remover secção";
          rm.className = "text-neutral-400 hover:text-red-600";
          rm.innerHTML = `<span class="material-symbols-outlined text-[20px]">delete</span>`;
          rm.addEventListener("click", (e) => { e.preventDefault(); snapshot(); custom.sections!.splice(i, 1); void rebuild(); });
          wrap.appendChild(rm);
        }
        head.appendChild(wrap);
      });
      const addSec = document.createElement("div");
      addSec.className = "mb-ov-btn mt-10 relative";
      const menuItem = (icon: string, title: string, desc: string, val: string): string =>
        `<button data-add="${val}" class="w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-neutral-50 transition-colors">
          <span class="material-symbols-outlined text-[20px] text-neutral-500 mt-0.5">${icon}</span>
          <span><span class="block text-sm font-semibold text-neutral-900">${title}</span><span class="block text-xs text-neutral-500">${desc}</span></span>
        </button>`;
      // Em modelos prontos (locked) só se pode adicionar produtos e informação
      // com foto; o resto das secções fica reservado ao construtor livre.
      const addParts = [
        menuItem("storefront", "Secção de produtos", "Mostra produtos de uma categoria", "produto"),
        menuItem("image", "Informação com foto", "Foto ao lado de título e texto", "info"),
        menuItem("title", "Título e texto", "Texto centrado de destaque", "text"),
      ];
      if (!locked) {
        // O modelo "Neon Lab" não usa secção de testemunhos.
        if (store!.templateId !== "neonlab") addParts.push(menuItem("format_quote", "Testemunhos", "Opiniões de clientes", "testimonials"));
        addParts.push(menuItem("location_on", "Localização", "Mapa com a morada da loja", "location"));
      }
      const addItems = addParts.join("");
      addSec.innerHTML = `
        <button data-add-toggle class="w-full border-2 border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-500 rounded-xl py-4 flex items-center justify-center gap-2 transition-colors"><span class="material-symbols-outlined">add</span> Adicionar secção</button>
        <div data-add-menu class="hidden absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-80 bg-white border border-neutral-200 rounded-2xl shadow-xl p-2 z-[70]">
          ${addItems}
        </div>`;
      const menu = addSec.querySelector<HTMLElement>("[data-add-menu]")!;
      addSec.querySelector("[data-add-toggle]")!.addEventListener("click", (e) => { e.preventDefault(); menu.classList.toggle("hidden"); });
      addSec.querySelectorAll<HTMLElement>("[data-add]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.preventDefault();
          snapshot();
          const val = b.dataset.add!;
          if (val === "produto") {
            const used = new Set((custom.sections ?? []).map((s) => s.category));
            const next = !used.has("__featured__") ? "__featured__" : (cats.find((c) => !used.has(c)) ?? "__all__");
            (custom.sections ?? (custom.sections = [])).push({ category: next });
          } else {
            (custom.blocks ?? (custom.blocks = [])).push(newBlock(val as "info" | "text" | "testimonials" | "location"));
          }
          void rebuild();
        }));
      // O botão fica sempre no fim da última secção (depois dos blocos).
      // A estrutura do modelo NÃO é fixa: pode sempre adicionar-se secções.
      (preview.querySelector<HTMLElement>("[data-edit-blocks]") ?? sectionsWrap).appendChild(addSec);
    }

    // Botão de WhatsApp (página de produto) — editável.
    const wa = preview.querySelector<HTMLElement>("[data-edit-whatsapp]");
    if (wa) {
      const ov = document.createElement("span");
      ov.className = "mb-ov mb-wa-ov mb-ov-btn absolute -top-2 -right-2 bg-neutral-900 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow z-10";
      ov.innerHTML = `<span class="material-symbols-outlined text-[14px]">edit</span> Editar`;
      wa.appendChild(ov);
      wa.addEventListener("click", (e) => {
        e.preventDefault();
        openWhatsappForm({
          phone: custom.whatsapp?.phone ?? custom.footer?.phone ?? "",
          template: custom.whatsapp?.messageTemplate ?? "",
          brand: custom.colors?.primary ?? defaultColor,
          onSave: async (phone, template) => {
            snapshot();
            setPath(custom as Record<string, any>, "whatsapp.phone", phone);
            setPath(custom as Record<string, any>, "whatsapp.messageTemplate", template);
            await rebuild();
            toast("Botão de WhatsApp atualizado.");
          },
        });
      });
    }

    // Linhas tracejadas a separar as secções (apenas no editor) + botão de modelo.
    if (structuralEditing && currentScreen === "home") {
      const blockLabel: Record<string, string> = {
        info: "Informação", text: "Texto", testimonials: "Testemunhos", location: "Localização",
      };
      const mkDiv = (label: string): HTMLElement => {
        const d = document.createElement("div");
        d.className = "mb-sec-divider";
        d.innerHTML = `<span>${esc(label)}</span>`;
        return d;
      };
      const mkBar = (model: { label: string; icon: string; onClick: (a: HTMLElement) => void; id?: string }): HTMLElement => {
        const bar = document.createElement("div");
        bar.className = "mb-ov-btn flex justify-center -mt-3 mb-6";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mb-model-btn";
        if (model.id) btn.id = model.id;
        btn.innerHTML = `<span class="material-symbols-outlined">${model.icon}</span> ${esc(model.label)}`;
        btn.addEventListener("click", (e) => { e.preventDefault(); model.onClick(btn); });
        bar.appendChild(btn);
        return bar;
      };

      // Cabeçalho — nome + botão de modelo (antes do header).
      const rootDiv = preview.firstElementChild as HTMLElement | null;
      const headerEl = rootDiv?.firstElementChild as HTMLElement | null;
      if (headerEl && rootDiv) {
        rootDiv.insertBefore(mkDiv("Cabeçalho"), headerEl);
        rootDiv.insertBefore(mkBar({ label: "Trocar modelo do cabeçalho", icon: "view_carousel", onClick: openHeaderPicker, id: "tour-header" }), headerEl);
      }

      // Hero — nome + botão de modelo.
      const heroSection = preview.querySelector<HTMLElement>("section");
      if (heroSection?.parentElement) {
        heroSection.parentElement.insertBefore(mkDiv("Hero"), heroSection);
        heroSection.parentElement.insertBefore(mkBar({ label: "Trocar modelo do hero", icon: "wallpaper", onClick: openHeroPicker, id: "tour-hero" }), heroSection);
      }

      // Produtos — nome + botão de disposição.
      const sw = preview.querySelector<HTMLElement>("[data-edit-sections]");
      if (sw?.parentElement) {
        sw.parentElement.insertBefore(mkDiv("Produtos"), sw);
        sw.parentElement.insertBefore(mkBar({ label: "Mudar disposição dos produtos", icon: "grid_view", onClick: openGridPicker, id: "tour-grid" }), sw);
      }

      // Secções de produtos adicionais — nome.
      preview.querySelectorAll<HTMLElement>("[data-edit-section]").forEach((sec, i) => {
        if (i === 0) return;
        sec.parentElement?.insertBefore(mkDiv("Secção de produtos"), sec);
      });

      // Blocos de conteúdo — nome + botão de modelo (todos os blocos têm variantes).
      preview.querySelectorAll<HTMLElement>("[data-edit-block]").forEach((blk) => {
        const type = blk.dataset.blockType ?? "";
        const i = Number(blk.dataset.editBlock);
        blk.parentElement?.insertBefore(mkDiv(blockLabel[type] ?? "Secção"), blk);
        const lists: Record<string, { id: string; label: string }[]> = {
          info: INFO_VARIANTS, text: TEXT_VARIANTS, location: LOCATION_VARIANTS, testimonials: TESTIMONIAL_VARIANTS,
        };
        const list = lists[type];
        if (list) {
          const cur = (custom.blocks?.[i] as { variant?: string } | undefined)?.variant ?? blockDefVariant(type);
          const label = list.find((v) => v.id === cur)?.label ?? list[0]!.label;
          blk.parentElement?.insertBefore(mkBar({ label: `Modelo: ${label}`, icon: "style", onClick: (anchor) => openBlockPicker(anchor, i) }), blk);
        }
      });

      // Rodapé — nome + botão de modelo (antes do footer).
      const footerEl = preview.querySelector<HTMLElement>("footer");
      if (footerEl?.parentElement) {
        footerEl.parentElement.insertBefore(mkDiv("Rodapé"), footerEl);
        footerEl.parentElement.insertBefore(mkBar({ label: "Trocar modelo do rodapé", icon: "splitscreen_bottom", onClick: openFooterPicker, id: "tour-footer" }), footerEl);
      }
    } else if (structuralEditing && currentScreen === "product") {
      // Página de produto — botão para trocar o modelo, antes do conteúdo.
      const main = preview.querySelector<HTMLElement>("main");
      if (main?.parentElement) {
        const div = document.createElement("div");
        div.className = "mb-sec-divider";
        div.innerHTML = `<span>Página de produto</span>`;
        const bar = document.createElement("div");
        bar.className = "mb-ov-btn flex justify-center -mt-3 mb-6";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mb-model-btn";
        btn.id = "tour-productpage";
        btn.innerHTML = `<span class="material-symbols-outlined">sell</span> Trocar modelo da página de produto`;
        btn.addEventListener("click", (e) => { e.preventDefault(); openProductPagePicker(btn); });
        bar.appendChild(btn);
        main.parentElement.insertBefore(div, main);
        main.parentElement.insertBefore(bar, main);
      }
    }
  }

  /** HTML da loja para o ecrã atual (home ou página de produto). `null` se não houver produto. */
  function storeHtmlFor(view: StoreViewModel): string | null {
    if (view.kind !== "render") return "";
    const template = getTemplate(store!.templateId);
    if (currentScreen === "product") {
      const sample = view.products[0] ?? null;
      if (!sample) return null;
      return template.renderProduct ? template.renderProduct(view, sample, custom) : template.render(view, custom);
    }
    return template.render(view, custom);
  }

  async function rebuild(): Promise<void> {
    const view = await buildView();
    lastView = view;
    const preview = $("#preview")!;
    if (view.kind !== "render") { preview.innerHTML = ""; return; }

    if (currentScreen === "checkout") { renderCheckoutEditorPreview(view); return; }

    const html = storeHtmlFor(view);
    if (html === null) {
      preview.innerHTML = `<div class="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 p-8 text-neutral-500">
        <span class="material-symbols-outlined" style="font-size:48px;">production_quantity_limits</span>
        <p class="max-w-sm">Adicione um produto na página inicial para pré-visualizar e editar a página de produto.</p>
      </div>`;
      if (previewOpen) renderPreviewDrawer(view);
      return;
    }

    preview.innerHTML = html;
    bind(preview);
    fadeInImages(preview);
    mountParticlesHeroes(preview);
    mountTestimonials(preview);
    mountTestimonialEditor(preview);
    mountLumiereSections(preview);
    mountFoodmartCarousels(preview);
    if (previewOpen) renderPreviewDrawer(view);
  }

  /** Itens de exemplo para a pré-visualização do checkout (produtos reais ou um placeholder). */
  function checkoutSampleItems(): { name: string; price: number; quantity: number; imageUrl?: string }[] {
    const lv = lastView;
    const prods = lv && lv.kind === "render" ? lv.products.slice(0, 3) : [];
    if (prods.length) return prods.map((p) => ({ name: p.name, price: p.price, quantity: 1, imageUrl: p.imageUrl ?? undefined }));
    return [{ name: "Produto exemplo", price: 5000, quantity: 1 }];
  }

  function checkoutPreviewHtml(variant: CheckoutVariant): string {
    const items = checkoutSampleItems();
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const online = !!custom.payments?.onlineEnabled;
    const areas = deliveredAreas(custom.delivery);
    const selectedArea = areas[0]?.name ?? null;
    const deliveryFee = areas[0]?.fee ?? 0;
    return renderCheckout(variant, {
      storeName: store!.name, items, total, online,
      selected: online ? "mcx" : "whatsapp",
      physical: true, areas, selectedArea, deliveryFee,
    });
  }

  /** Pré-visualização do ecrã de checkout dentro do editor (com o cromo da loja). */
  function renderCheckoutEditorPreview(view: StoreViewModel): void {
    if (view.kind !== "render") return;
    const preview = $("#preview")!;
    const variant = (custom.checkout?.variant ?? "dividido") as CheckoutVariant;
    const template = getTemplate(store!.templateId);
    const inner = checkoutPreviewHtml(variant);
    const wrapped = template.renderCheckout ? template.renderCheckout(view, inner, custom) : inner;
    // O botão "Trocar modelo do checkout" só aparece com a edição estrutural
    // ativa (desativada por agora). Caso contrário, só a barra de título.
    const swapBtn = structuralEditing
      ? `<button id="tour-checkout" class="mb-model-btn"><span class="material-symbols-outlined">shopping_bag</span> Trocar modelo do checkout</button>`
      : "";
    preview.innerHTML = `<div class="sticky top-0 z-10 flex items-center justify-center gap-3 py-2 bg-white/85 backdrop-blur border-b border-gray-100">
        <span class="mb-sec-divider !my-0 !mb-0" style="flex:0"><span>Checkout</span></span>
        ${swapBtn}
      </div>${wrapped}`;
    preview.style.setProperty("--brand", custom.colors?.primary ?? defaultColor);
    applyInk(preview, custom);
    applyTheme(preview, custom);
    applyFieldColors(preview, custom);
    applyIconColor(preview, custom);
    fadeInImages(preview);
    $("#tour-checkout")?.addEventListener("click", () => openCheckoutPicker($("#tour-checkout") as HTMLElement));
    if (previewOpen) renderPreviewDrawer(view);
  }

  /** Controlos de edição dos testemunhos (adicionar/remover) — no editor. */
  function mountTestimonialEditor(preview: HTMLElement): void {
    const section = preview.querySelector<HTMLElement>("[data-lx-testi]");
    if (!section) return;

    // Garante que a lista existe como array (semeia a partir dos slides atuais).
    if (!Array.isArray(custom.testimonials) || custom.testimonials.length === 0) {
      const slides = Array.from(section.querySelectorAll<HTMLElement>("[data-lx-slide]"));
      custom.testimonials = slides.map((s) => ({
        quote: s.querySelector<HTMLElement>('[data-edit$=".quote"]')?.textContent?.trim() ?? "",
        author: s.querySelector<HTMLElement>('[data-edit$=".author"]')?.textContent?.trim() ?? "",
        role: s.querySelector<HTMLElement>('[data-edit$=".role"]')?.textContent?.trim() ?? "Cliente verificada",
      }));
    }

    const total = custom.testimonials?.length ?? 0;

    // Botão remover em cada slide (se houver mais de um).
    if (total > 1) {
      section.querySelectorAll<HTMLElement>("[data-lx-slide]").forEach((slide) => {
        const i = Number(slide.dataset.lxSlide);
        slide.style.position = "relative";
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "mb-ov-btn absolute top-0 right-0 text-neutral-400 hover:text-red-600";
        rm.title = "Remover testemunho";
        rm.innerHTML = `<span class="material-symbols-outlined text-[20px]">delete</span>`;
        rm.addEventListener("click", (e) => {
          e.preventDefault();
          snapshot();
          custom.testimonials?.splice(i, 1);
          void rebuild();
        });
        slide.appendChild(rm);
      });
    }

    // Botão "Adicionar testemunho" abaixo dos pontos.
    const wrap = document.createElement("div");
    wrap.className = "mb-ov-btn mt-6 flex justify-center";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "inline-flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50";
    add.innerHTML = `<span class="material-symbols-outlined text-[18px]">add</span> Adicionar testemunho`;
    add.addEventListener("click", (e) => {
      e.preventDefault();
      snapshot();
      if (!Array.isArray(custom.testimonials)) custom.testimonials = [];
      custom.testimonials.push({ quote: "Escreva aqui o testemunho…", author: "Cliente", role: "Cliente verificada" });
      void rebuild();
    });
    wrap.appendChild(add);
    (section.querySelector<HTMLElement>("[data-lx-dots]")?.parentElement ?? section).appendChild(wrap);
  }

  /**
   * Secções opcionais do Lumière (testemunhos e lojas/mapa): remover/repor e,
   * no mapa, definir os pontos (pins) das lojas. A secção de produtos nunca é
   * removível — só estas.
   */
  function mountLumiereSections(preview: HTMLElement): void {
    // Botão flutuante "Remover secção" no canto de uma secção.
    const addRemoveBtn = (host: HTMLElement, onRemove: () => void): void => {
      host.style.position = host.style.position || "relative";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "mb-ov-btn absolute top-4 right-4 z-20 inline-flex items-center gap-1 bg-white/95 hover:bg-white text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full shadow";
      rm.innerHTML = `<span class="material-symbols-outlined text-[16px]">delete</span> Remover secção`;
      rm.addEventListener("click", (e) => { e.preventDefault(); snapshot(); onRemove(); void rebuild(); });
      host.appendChild(rm);
    };
    // Placeholder "Adicionar secção" quando o slot está vazio (secção removida).
    const addSlotAddBtn = (slot: HTMLElement, label: string, onAdd: () => void): void => {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "mb-ov-btn block mx-auto my-8 border-2 border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-500 rounded-xl py-4 px-8 flex items-center justify-center gap-2 transition-colors";
      add.innerHTML = `<span class="material-symbols-outlined">add</span> ${esc(label)}`;
      add.addEventListener("click", (e) => { e.preventDefault(); snapshot(); onAdd(); void rebuild(); });
      slot.appendChild(add);
    };

    // --- Testemunhos ---
    const tSlot = preview.querySelector<HTMLElement>('[data-lumiere-slot="testimonials"]');
    if (tSlot) {
      const section = tSlot.querySelector<HTMLElement>("[data-lx-testi]");
      if (section) addRemoveBtn(section, () => setPath(custom as Record<string, any>, "lumiere.hideTestimonials", true));
      else addSlotAddBtn(tSlot, "Adicionar secção de testemunhos", () => setPath(custom as Record<string, any>, "lumiere.hideTestimonials", false));
    }

    // --- Lojas / mapa ---
    const bSlot = preview.querySelector<HTMLElement>('[data-lumiere-slot="boutiques"]');
    if (bSlot) {
      const section = bSlot.querySelector<HTMLElement>("[data-lx-boutiques]");
      if (!section) {
        addSlotAddBtn(bSlot, "Adicionar secção de lojas (mapa)", () => setPath(custom as Record<string, any>, "lumiere.hideBoutiques", false));
      } else {
        addRemoveBtn(section, () => setPath(custom as Record<string, any>, "lumiere.hideBoutiques", true));
        const ensureList = (): NonNullable<NonNullable<StoreCustomization["lumiere"]>["boutiques"]> => {
          if (!custom.lumiere) custom.lumiere = {};
          if (!Array.isArray(custom.lumiere.boutiques)) custom.lumiere.boutiques = [];
          return custom.lumiere.boutiques;
        };
        const list = custom.lumiere?.boutiques ?? [];

        // Cada loja: botão de pin (mapa) + remover.
        section.querySelectorAll<HTMLElement>("[data-boutique]").forEach((card) => {
          const i = Number(card.dataset.boutique);
          const bar = document.createElement("div");
          bar.className = "mb-ov-btn mt-3 flex items-center justify-center gap-2";
          const pin = document.createElement("button");
          pin.type = "button";
          pin.className = "inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50";
          pin.innerHTML = `<span class="material-symbols-outlined text-[16px]">location_on</span> Escolher no mapa`;
          pin.addEventListener("click", (e) => {
            e.preventDefault();
            const b = custom.lumiere?.boutiques?.[i] ?? {};
            void openMapPicker({
              lat: b.lat, lng: b.lng, address: b.address,
              onSave: (lat, lng) => {
                snapshot();
                const arr = ensureList();
                arr[i] = { ...(arr[i] ?? {}), lat, lng };
                void rebuild();
              },
            });
          });
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border border-neutral-300 text-red-600 hover:bg-red-50";
          rm.innerHTML = `<span class="material-symbols-outlined text-[16px]">delete</span> Remover`;
          rm.addEventListener("click", (e) => {
            e.preventDefault();
            snapshot();
            ensureList().splice(i, 1);
            void rebuild();
          });
          bar.appendChild(pin);
          bar.appendChild(rm);
          card.appendChild(bar);
        });

        // Botão "Adicionar loja".
        const addWrap = document.createElement("div");
        addWrap.className = "mb-ov-btn mt-10 flex justify-center";
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "inline-flex items-center gap-1 text-sm font-semibold px-5 py-2.5 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50";
        addBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">add_location_alt</span> Adicionar loja`;
        addBtn.addEventListener("click", (e) => {
          e.preventDefault();
          snapshot();
          const arr = ensureList();
          // Primeira loja herda a morada do rodapé como ponto de partida.
          if (arr.length === 0) arr.push({ name: "A nossa loja", address: custom.footer?.location || "Luanda, Angola" });
          else arr.push({ name: "Nova loja", address: "Luanda, Angola" });
          void rebuild();
        });
        addWrap.appendChild(addBtn);
        section.appendChild(addWrap);

        // Estado vazio (mapa único): oferece começar a definir pontos.
        if (list.length === 0) {
          const hint = document.createElement("p");
          hint.className = "mb-ov-btn text-center text-xs text-neutral-500 mt-3";
          hint.textContent = "Adicione lojas para mostrar um pin no mapa para cada uma.";
          section.appendChild(hint);
        }
      }
    }
  }

  /** Documento completo (Tailwind + fontes + marca) para o iframe de pré-visualização. */
  function buildIframeDoc(innerHtml: string): string {
    const brand = custom.colors?.primary ?? defaultColor;
    const ink = custom.colors?.text?.trim();
    const iconC = custom.colors?.icon?.trim();
    const tvars: Record<string, { radius: string; head: string; body?: string }> = {
      moderno: { radius: "1rem", head: "Inter, sans-serif" },
      classico: { radius: "0.35rem", head: "'Noto Serif', serif" },
      minimal: { radius: "0px", head: "Inter, sans-serif" },
      editorial: { radius: "0.125rem", head: "'Playfair Display', serif", body: "'Montserrat', sans-serif" },
    };
    const themeStyle = custom.theme?.style;
    const tv = themeStyle ? tvars[themeStyle] : null;
    const bodyAttrs = `${ink ? "data-ink" : ""} ${iconC ? "data-icons" : ""} ${tv ? `data-theme="${esc(themeStyle!)}"` : ""}`.trim();
    const bodyStyle = [
      `--brand:${brand}`,
      `--brand-ink:${readableInk(brand)}`,
      ink ? `--ink:${ink}` : "",
      iconC ? `--mb-icons:${iconC}` : "",
      tv ? `--mb-radius:${tv.radius}` : "",
      tv ? `--mb-head-font:${tv.head}` : "",
      tv?.body ? `--mb-body-font:${tv.body}` : "",
    ].filter(Boolean).join(";");
    const inkCss =
      "[data-ink] :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,figcaption,label){color:var(--ink)}" +
      "[data-ink] .material-symbols-outlined{color:var(--ink)}" +
      "[data-ink] .mb-dark,[data-ink] .mb-dark :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,span,figcaption,label),[data-ink] .mb-dark .material-symbols-outlined{color:inherit}" +
      "[data-icons] .material-symbols-outlined{color:var(--mb-icons) !important}[data-icons] .mb-dark .material-symbols-outlined{color:inherit !important}";
    const themeCss =
      "[data-theme]{font-family:var(--mb-body-font,inherit)}" +
      "[data-theme] :is(.rounded,.rounded-lg,.rounded-xl,.rounded-2xl,.rounded-3xl){border-radius:var(--mb-radius)}" +
      "[data-theme] :is(h1,h2,h3,h4){font-family:var(--mb-head-font)}";
    // Cores de texto por-campo (isoladas) — aplicadas também no preview (#5).
    const fieldCss = Object.entries(custom.fieldColors ?? {})
      .filter(([, c]) => !!c)
      .map(([p, c]) => `[data-edit="${p}"]{color:${c} !important}`)
      .join("");
    return `<!DOCTYPE html><html lang="pt-AO"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<style>
.material-symbols-outlined{font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 24;vertical-align:middle}
body{font-family:Inter,sans-serif;margin:0}
${inkCss}
${themeCss}
${fieldCss}
</style>
</head><body ${bodyAttrs} style="${bodyStyle}">${innerHtml}</body></html>`;
  }

  /* ----------------------- Painel de pré-visualização ----------------------- */

  let previewOpen = false;
  let previewMode: "desktop" | "mobile" = "desktop";

  function updatePreviewModeTabs(): void {
    document.querySelectorAll<HTMLElement>("[data-pvp]").forEach((b) => {
      const active = b.dataset.pvp === previewMode;
      b.style.background = active ? ACCENT : "transparent";
      b.style.color = active ? "#fff" : "#52525b";
      b.style.fontWeight = active ? "700" : "500";
    });
  }

  function renderPreviewDrawer(view: StoreViewModel): void {
    const body = document.getElementById("mb-preview-body");
    if (!body || view.kind !== "render") return;
    const html = storeHtmlFor(view);
    if (html === null) {
      body.innerHTML = `<div class="h-full flex items-center justify-center text-neutral-400 text-sm p-8 text-center">Adicione um produto para pré-visualizar a página de produto.</div>`;
      return;
    }
    const doc = buildIframeDoc(html);
    if (previewMode === "mobile") {
      body.innerHTML = `<div class="min-h-full flex items-start justify-center py-8 px-4">
        <div style="width:390px;max-width:100%;background:#0c0c0c;border-radius:48px;padding:12px;box-shadow:0 30px 70px -20px rgba(0,0,0,.55)">
          <div style="position:relative;height:760px;border-radius:36px;overflow:hidden;background:#fff;display:flex;flex-direction:column">
            <div style="height:34px;flex:none;position:relative;background:#fff"><div style="position:absolute;top:9px;left:50%;transform:translateX(-50%);width:104px;height:26px;background:#0c0c0c;border-radius:9999px"></div></div>
            <iframe class="mb-pv-frame" style="flex:1;width:100%;border:0;background:#fff;display:block" title="Pré-visualização no telemóvel"></iframe>
          </div>
        </div>
      </div>`;
    } else {
      const W = body.clientWidth || 1000;
      const H = body.clientHeight || 700;
      const logical = 1280;
      const scale = Math.min(1, W / logical);
      const fh = Math.round(H / scale);
      body.innerHTML = `<div style="width:${W}px;height:${H}px;overflow:hidden;background:#fff;margin:0 auto">
        <iframe class="mb-pv-frame" style="width:${logical}px;height:${fh}px;border:0;background:#fff;transform:scale(${scale});transform-origin:top left;display:block" title="Pré-visualização no computador"></iframe>
      </div>`;
    }
    const iframe = body.querySelector<HTMLIFrameElement>("iframe.mb-pv-frame");
    if (iframe) iframe.srcdoc = doc;
  }

  function openPreview(): void {
    const root = document.getElementById("mb-preview");
    const panel = document.getElementById("mb-preview-panel");
    const back = document.getElementById("mb-preview-backdrop");
    if (!root || !panel || !back) return;
    root.style.display = "block";
    previewOpen = true;
    updatePreviewModeTabs();
    if (lastView) renderPreviewDrawer(lastView);
    requestAnimationFrame(() => {
      back.style.opacity = "1";
      panel.style.transform = "translateX(0)";
    });
  }

  function closePreview(): void {
    const root = document.getElementById("mb-preview");
    const panel = document.getElementById("mb-preview-panel");
    const back = document.getElementById("mb-preview-backdrop");
    if (!root || !panel || !back) return;
    previewOpen = false;
    back.style.opacity = "0";
    panel.style.transform = "translateX(100%)";
    window.setTimeout(() => {
      root.style.display = "none";
      const body = document.getElementById("mb-preview-body");
      if (body) body.innerHTML = "";
    }, 340);
  }

  function updateScreenTabs(): void {
    document.querySelectorAll<HTMLElement>("[data-screen]").forEach((b) => {
      const active = b.dataset.screen === currentScreen;
      b.className = "px-4 py-1.5 rounded-full transition-colors flex items-center gap-1 " + (active ? "text-white font-bold shadow-sm" : "text-gray-500 hover:text-gray-900");
      b.style.background = active ? ACCENT : "";
    });
  }

  await rebuild();
  updateScreenTabs();
  mountAiAgent($("#preview")?.parentElement);

  // Painel de pré-visualização (Abrir / esconder + alternar Computador/Telemóvel).
  $("#open-preview")?.addEventListener("click", () => openPreview());
  $("#mb-preview-close")?.addEventListener("click", () => closePreview());
  $("#mb-preview-backdrop")?.addEventListener("click", () => closePreview());
  document.querySelectorAll<HTMLElement>("[data-pvp]").forEach((b) =>
    b.addEventListener("click", () => {
      const next = b.dataset.pvp === "mobile" ? "mobile" : "desktop";
      if (next === previewMode) return;
      previewMode = next;
      updatePreviewModeTabs();
      if (lastView) renderPreviewDrawer(lastView);
    }));
  window.addEventListener("resize", () => {
    if (previewOpen && previewMode === "desktop" && lastView) renderPreviewDrawer(lastView);
  });

  // Seletor de telas (Início / Página de produto).
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((b) =>
    b.addEventListener("click", async () => {
      const next = b.dataset.screen === "product" ? "product" : b.dataset.screen === "checkout" ? "checkout" : "home";
      if (next === currentScreen) return;
      currentScreen = next;
      updateScreenTabs();
      await rebuild();
    }));

  // Cor principal (snapshot ao focar, aplica ao vivo).
  const colorInput = $("#color") as HTMLInputElement;
  colorInput.addEventListener("focus", () => snapshot());
  colorInput.addEventListener("input", (e) => {
    const value = (e.target as HTMLInputElement).value;
    setPath(custom as Record<string, any>, "colors.primary", value);
    $("#preview")!.style.setProperty("--brand", value);
    const dot = $("#color-dot"); if (dot) dot.style.background = value;
  });

  // Cor dos textos/ícones (ink) — aplica ao vivo.
  const inkInput = $("#ink") as HTMLInputElement;
  inkInput?.addEventListener("focus", () => snapshot());
  inkInput?.addEventListener("input", (e) => {
    const value = (e.target as HTMLInputElement).value;
    setPath(custom as Record<string, any>, "colors.text", value);
    const dot = $("#ink-dot"); if (dot) dot.style.background = value;
    applyInk($("#preview"), custom);
  });

  // Cor global de todos os ícones do site.
  const iconInput = $("#icon-color") as HTMLInputElement | null;
  iconInput?.addEventListener("input", (e) => {
    const value = (e.target as HTMLInputElement).value;
    setPath(custom as Record<string, any>, "colors.icon", value);
    const dot = $("#icon-dot"); if (dot) dot.style.color = value;
    applyIconColor($("#preview"), custom);
  });

  // Estilo global (tema) — aplica ao vivo.
  const themeSelect = $("#theme-style") as HTMLSelectElement | null;
  themeSelect?.addEventListener("change", () => {
    snapshot();
    setPath(custom as Record<string, any>, "theme.style", themeSelect.value);
    applyTheme($("#preview"), custom);
  });

  // Modo restrito / edição de modelo desativada: esconde o estilo/tema.
  if (locked || !MODEL_EDITING) {
    themeSelect?.closest("label")?.remove();
  }

  // --- Cor por-texto (barra flutuante ao editar um texto) ---
  const textTools = $("#mb-text-tools");
  const textColorInput = $("#mb-text-color") as HTMLInputElement | null;
  const textColorDot = $("#mb-text-color-dot");
  let activeTextPath: string | null = null;

  function rgbToHex(rgb: string): string {
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return "";
    return "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  }
  function normalizeHex(c: string): string {
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    return rgbToHex(c) || (custom.colors?.text ?? "#111827");
  }
  function paintField(path: string, color: string | null): void {
    const prev = $("#preview");
    prev?.querySelectorAll<HTMLElement>(`[data-edit="${CSS.escape(path)}"]`).forEach((e) => {
      if (color) e.style.setProperty("color", color, "important");
      else e.style.removeProperty("color");
    });
  }
  function showTextTools(el: HTMLElement): void {
    activeTextPath = el.dataset.edit ?? null;
    if (!activeTextPath || !textTools) return;
    const col = custom.fieldColors?.[activeTextPath] ?? normalizeHex(getComputedStyle(el).color);
    if (textColorInput) textColorInput.value = normalizeHex(col);
    if (textColorDot) textColorDot.style.background = col;
    textTools.classList.remove("hidden");
    textTools.classList.add("flex");
  }
  function hideTextTools(): void {
    activeTextPath = null;
    textTools?.classList.add("hidden");
    textTools?.classList.remove("flex");
  }

  textColorInput?.addEventListener("input", () => {
    if (!activeTextPath) return;
    const val = textColorInput.value;
    snapshot();
    if (!custom.fieldColors) custom.fieldColors = {};
    custom.fieldColors[activeTextPath] = val;
    if (textColorDot) textColorDot.style.background = val;
    paintField(activeTextPath, val);
  });
  $("#mb-text-color-reset")?.addEventListener("click", () => {
    if (!activeTextPath) return;
    snapshot();
    if (custom.fieldColors) delete custom.fieldColors[activeTextPath];
    paintField(activeTextPath, null);
    applyInk($("#preview"), custom);
    applyFieldColors($("#preview"), custom);
    hideTextTools();
  });
  document.addEventListener("mousedown", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#mb-text-tools") || t.closest("#preview [data-edit]")) return;
    hideTextTools();
  });

  // --- Seletores de variantes (com miniatura escalada real) ---
  interface PickItem { id: string; label: string; }
  const PREVIEW_W = 1180;
  function openVariantPicker(
    anchor: HTMLElement,
    title: string,
    items: PickItem[],
    current: string | undefined,
    onPick: (id: string) => void,
    renderPreview?: (id: string) => string,
  ): void {
    document.getElementById("mb-picker")?.remove();
    const layer = document.createElement("div");
    layer.id = "mb-picker";
    layer.style.cssText = "position:fixed;inset:0;z-index:120";
    const panel = document.createElement("div");
    panel.className = "absolute bg-white rounded-2xl shadow-2xl border border-gray-200 p-3 w-[320px]";

    const brand = custom.colors?.primary ?? defaultColor;
    const ink = custom.colors?.text ?? "#111827";
    const innerW = 296; // 320 - 2*12 (padding)
    const scale = innerW / PREVIEW_W;
    const previewArea = renderPreview
      ? `<div class="rounded-xl overflow-hidden border border-gray-200 bg-white mb-3" style="height:188px">
           <div class="mb-pick-stage" style="width:${PREVIEW_W}px;transform:scale(${scale});transform-origin:top left;--brand:${esc(brand)};--ink:${esc(ink)}"></div>
         </div>`
      : "";
    const cols = items.length <= 3 ? items.length : 2;
    panel.innerHTML = `
      ${previewArea}
      <p class="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-2">${esc(title)}</p>
      <div class="grid grid-cols-${cols} gap-2">
        ${items.map((it) => `
          <button data-pick="${esc(it.id)}" class="rounded-xl border-2 ${it.id === current ? "border-[color:var(--mb-accent)] text-[color:var(--mb-accent)]" : "border-gray-200 text-gray-700"} hover:border-gray-400 px-2 py-2.5 text-[12px] font-semibold text-center transition-colors" style="--mb-accent:${ACCENT}">${esc(it.label)}</button>`).join("")}
      </div>`;

    // Posição: por baixo da âncora; se não couber, por cima.
    const r = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 328);
    const estH = (renderPreview ? 200 : 0) + 90;
    const top = r.bottom + estH > window.innerHeight ? Math.max(8, r.top - estH) : r.bottom + 8;
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    layer.appendChild(panel);
    layer.addEventListener("click", (e) => { if (e.target === layer) layer.remove(); });

    const stage = panel.querySelector<HTMLElement>(".mb-pick-stage");
    const showPrev = (id: string): void => { if (stage && renderPreview) stage.innerHTML = renderPreview(id); };
    showPrev(current ?? items[0]!.id);

    panel.querySelectorAll<HTMLElement>("[data-pick]").forEach((b) => {
      b.addEventListener("mouseenter", () => showPrev(b.dataset.pick!));
      b.addEventListener("mouseleave", () => showPrev(current ?? items[0]!.id));
      b.addEventListener("click", (e) => { e.preventDefault(); layer.remove(); onPick(b.dataset.pick!); });
    });
    document.body.appendChild(layer);
  }

  const PREV_CTX = { container: "w-full max-w-[1180px] mx-auto px-8", brand: "var(--brand,#4f46e5)" };

  function openHeaderPicker(anchor: HTMLElement): void {
    if (currentScreen !== "home") { currentScreen = "home"; updateScreenTabs(); void rebuild(); }
    openVariantPicker(
      anchor,
      "Modelo do cabeçalho",
      HEADER_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
      custom.header?.variant ?? "classico",
      (id) => { snapshot(); setPath(custom as Record<string, any>, "header.variant", id as HeaderVariant); void rebuild(); toast("Cabeçalho atualizado."); },
      (id) => lastView ? renderHeader(id as HeaderVariant, lastView, custom, PREV_CTX) : "",
    );
  }

  function openFooterPicker(anchor: HTMLElement): void {
    if (currentScreen !== "home") { currentScreen = "home"; updateScreenTabs(); void rebuild(); }
    openVariantPicker(
      anchor,
      "Modelo do rodapé",
      FOOTER_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
      custom.footer?.variant ?? "colunas",
      (id) => { snapshot(); setPath(custom as Record<string, any>, "footer.variant", id as FooterVariant); void rebuild(); toast("Rodapé atualizado."); },
      (id) => lastView ? renderFooter(id as FooterVariant, lastView, custom, PREV_CTX) : "",
    );
  }

  function openProductPagePicker(anchor: HTMLElement): void {
    openVariantPicker(
      anchor,
      "Modelo da página de produto",
      PRODUCTPAGE_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
      custom.productPage?.variant ?? "classico",
      (id) => { snapshot(); setPath(custom as Record<string, any>, "productPage.variant", id as ProductPageVariant); void rebuild(); toast("Página de produto atualizada."); },
      (id) => {
        const sample = lastView?.products[0];
        return sample ? renderProductPage(id as ProductPageVariant, lastView!, sample, custom, PREV_CTX) : `<div class="p-8 text-center text-gray-400">Adicione um produto para pré-visualizar.</div>`;
      },
    );
  }

  function openCheckoutPicker(anchor: HTMLElement): void {
    openVariantPicker(
      anchor,
      "Modelo do checkout",
      CHECKOUT_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
      custom.checkout?.variant ?? "dividido",
      (id) => { snapshot(); setPath(custom as Record<string, any>, "checkout.variant", id as CheckoutVariant); void rebuild(); toast("Checkout atualizado."); },
      (id) => checkoutPreviewHtml(id as CheckoutVariant),
    );
  }

  function openHeroPicker(anchor: HTMLElement): void {
    if (currentScreen !== "home") { currentScreen = "home"; updateScreenTabs(); void rebuild(); }
    openVariantPicker(
      anchor,
      "Modelo do hero",
      HERO_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
      custom.hero?.variant,
      (id) => { snapshot(); setPath(custom as Record<string, any>, "hero.variant", id as HeroVariant); void rebuild(); toast("Hero atualizado."); },
      (id) => lastView ? renderHero(id as HeroVariant, lastView, custom, PREV_CTX) : "",
    );
  }

  function openGridPicker(anchor: HTMLElement): void {
    if (currentScreen !== "home") { currentScreen = "home"; updateScreenTabs(); void rebuild(); }
    openVariantPicker(
      anchor,
      "Disposição dos produtos",
      PRODUCT_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
      custom.productGrid?.variant,
      (id) => { snapshot(); setPath(custom as Record<string, any>, "productGrid.variant", id as ProductVariant); void rebuild(); toast("Disposição atualizada."); },
      (id) => gridPreviewHtml(id as ProductVariant),
    );
  }

  function gridPreviewHtml(v: ProductVariant): string {
    const items = (lastView?.products ?? []).slice(0, 8);
    if (!items.length) return `<div class="p-8 text-center text-gray-400">Adicione produtos para pré-visualizar.</div>`;
    const cards = items.map((p) => `<div class="group block">
      <div class="relative ${cardAspectClass(v)} bg-gray-100 overflow-hidden rounded-2xl border border-gray-100">
        ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" class="w-full h-full object-cover" />` : ""}
      </div>
      <p class="mt-2 text-sm font-semibold text-gray-900 truncate">${esc(p.name)}</p>
      <p class="text-sm font-bold" style="color:var(--brand,#4f46e5)">${esc(formatKz(p.price))}</p>
    </div>`).join("");
    return `<div class="w-full max-w-[1180px] mx-auto px-8 py-6"><div class="${gridColsClass(v)}">${cards}</div></div>`;
  }

  function blockDefVariant(type: string): string {
    if (type === "info") return "lado";
    if (type === "text") return "centrado";
    if (type === "location") return "classico";
    return store!.templateId === "galeria" ? "editorial" : "cards"; // testimonials
  }

  function openBlockPicker(anchor: HTMLElement, i: number): void {
    const blk = custom.blocks?.[i] as { type: string; variant?: string } | undefined;
    if (!blk) return;
    const lists: Record<string, { id: string; label: string }[]> = {
      info: INFO_VARIANTS, text: TEXT_VARIANTS, location: LOCATION_VARIANTS, testimonials: TESTIMONIAL_VARIANTS,
    };
    const list = lists[blk.type];
    if (!list) return;
    const renderPreview = (id: string): string => {
      const b = (custom.blocks?.[i] ?? { type: blk.type }) as ContentBlock;
      if (blk.type === "info") return infoByVariant(id as "lado" | "sobreposto" | "cartao", b as Extract<ContentBlock, { type: "info" }>, i, PREV_CTX);
      if (blk.type === "text") return textByVariant(id as "centrado" | "destaque" | "linha", b as Extract<ContentBlock, { type: "text" }>, i, PREV_CTX);
      if (blk.type === "location") return locationByVariant(id as "classico" | "cartao" | "estilizado", b as Extract<ContentBlock, { type: "location" }>, i, PREV_CTX);
      return testimonialsByVariant(id as "cards" | "editorial" | "marquee", b as Extract<ContentBlock, { type: "testimonials" }>, i, PREV_CTX);
    };
    openVariantPicker(
      anchor,
      "Modelo da secção",
      list.map((v) => ({ id: v.id, label: v.label })),
      blk.variant ?? blockDefVariant(blk.type),
      (id) => {
        const bb = custom.blocks?.[i] as { variant?: string } | undefined;
        if (!bb) return;
        snapshot();
        bb.variant = id;
        void rebuild();
        toast("Modelo atualizado.");
      },
      renderPreview,
    );
  }

  // Upload do logótipo.
  $("#logo-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const content = await fileToUint8Array(await compressImageFile(file));
      const res = await withBusy(
        () => panel.controllers.logo.uploadLogo({ content, fileName: file.name }),
        "A carregar logótipo…",
      );
      if (res.status === "saved") { toast("Logótipo atualizado."); await rebuild(); }
      else toast(res.message, "error");
    } catch (err) {
      console.error("uploadLogo", err);
      toast("Falha ao guardar o logótipo. Verifique o Storage/migração.", "error");
    }
    input.value = "";
  });

  // Upload da imagem do hero.
  $("#hero-input")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(await compressImageFile(file));
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, BANNER_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(store!.id, "banner", validation.value),
      "A carregar imagem…",
    );
    snapshot();
    setPath(custom as Record<string, any>, "hero.imageUrl", stored.url);
    toast("Imagem do hero atualizada.");
    await rebuild();
    (e.target as HTMLInputElement).value = "";
  });

  // Upload da imagem do bloco editorial (Galeria → feature.imageUrl).
  $("#feature-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(await compressImageFile(file));
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, BANNER_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); input.value = ""; return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(store!.id, "banner", validation.value),
      "A carregar imagem…",
    );
    snapshot();
    setPath(custom as Record<string, any>, "feature.imageUrl", stored.url);
    toast("Imagem da secção atualizada.");
    await rebuild();
    input.value = "";
  });

  // Upload de foto do hero em arco (Galeria → heroImages[]).
  $("#arc-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(await compressImageFile(file));
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, BANNER_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); input.value = ""; return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(store!.id, "banner", validation.value),
      "A carregar foto…",
    );
    snapshot();
    let imgs = custom.heroImages;
    if (!Array.isArray(imgs) || imgs.length === 0) {
      imgs = Array.from($("#preview")!.querySelectorAll<HTMLImageElement>("[data-edit-arc-item] img"))
        .map((img) => img.getAttribute("src") || "")
        .filter(Boolean);
      custom.heroImages = imgs;
    }
    if (arcTarget === "add") imgs.push(stored.url);
    else if (typeof arcTarget === "number" && arcTarget < imgs.length) imgs[arcTarget] = stored.url;
    toast("Foto do hero atualizada.");
    await rebuild();
    input.value = "";
  });

  // Upload de imagem de um bloco "info".
  $("#block-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(await compressImageFile(file));
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, BANNER_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); input.value = ""; return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(store!.id, "banner", validation.value),
      "A carregar imagem…",
    );
    snapshot();
    const b = custom.blocks?.[blockImgTarget] as { imageUrl?: string } | undefined;
    if (b) b.imageUrl = stored.url;
    toast("Imagem atualizada.");
    await rebuild();
    input.value = "";
  });

  // Upload de foto de avatar de um testemunho.
  $("#testi-avatar-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(await compressImageFile(file));
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, BANNER_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); input.value = ""; return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(store!.id, "banner", validation.value),
      "A carregar foto…",
    );
    snapshot();
    const it = (custom.blocks?.[testiTarget.i] as { items?: { avatarUrl?: string }[] } | undefined)?.items?.[testiTarget.j];
    if (it) it.avatarUrl = stored.url;
    toast("Foto do testemunho atualizada.");
    await rebuild();
    input.value = "";
  });

  // Upload do logótipo do rodapé (versão clara/alternativa).
  $("#footer-logo-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(await compressImageFile(file));
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, LOGO_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); input.value = ""; return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(store!.id, "logo", validation.value),
      "A carregar logótipo do rodapé…",
    );
    snapshot();
    setPath(custom as Record<string, any>, "footer.logoUrl", stored.url);
    toast("Logótipo do rodapé atualizado.");
    await rebuild();
    input.value = "";
  });

  // Desfazer.
  $("#undo")?.addEventListener("click", async () => {
    const prev = history.pop();
    if (prev === undefined) { toast("Nada para desfazer.", "error"); return; }
    applyState(prev);
    await rebuild();
    syncColorUI();
    toast("Alteração desfeita.");
  });

  // Guardar personalização (textos/cores/menus/contactos/hero).
  $("#save")?.addEventListener("click", async (e) => {
    const ok = await withButton(
      e.currentTarget as HTMLButtonElement,
      () => saveCustomization(ownerId, store!.id, custom),
      "A guardar…",
    );
    if (ok) savedJson = JSON.stringify(custom);
    toast(ok ? "Loja guardada!" : "Não foi possível guardar.", ok ? "success" : "error");
  });

  // Aviso de alterações por guardar ao sair (botão voltar / fechar separador).
  $("#back-link")?.addEventListener("click", (e) => {
    if (isDirty() && !confirm("Tem alterações por guardar. Sair sem guardar? As alterações serão perdidas.")) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  // Tutorial guiado.
  $("#tutorial")?.addEventListener("click", () => void startTutorial());

  interface TourStep { sel: string; title: string; text: string; screen?: "home" | "product"; }
  const TOUR: TourStep[] = [
    { sel: "", title: "Bem-vindo ao editor 👋", text: "Vou mostrar-te, em poucos passos, como personalizar a tua loja. Tudo o que mudas aqui aparece ao vivo.", screen: "home" },
    { sel: "[data-edit-logo]", title: "O teu logótipo", text: "Clica no logótipo para trocar a imagem e usa − / + para ajustar o tamanho.", screen: "home" },
    { sel: "#preview [data-edit]", title: "Editar textos", text: "Clica em qualquer texto (títulos, descrições, contactos) e escreve diretamente.", screen: "home" },
    { sel: "#color-dot", title: "Cor principal", text: "Define a cor da marca — aplica-se a botões e destaques em toda a loja, ao vivo." },
    { sel: "#ink-dot", title: "Cor dos textos", text: "Muda a cor dos textos e ícones da loja." },
    { sel: "#theme-style", title: "Estilo geral", text: "Escolhe um estilo (moderno, clássico ou minimal) para dar coerência a tudo." },
    { sel: "#tour-hero", title: "Modelo do cabeçalho (hero)", text: "Troca o topo da loja entre vários modelos — passa o rato em cada opção para pré-visualizar.", screen: "home" },
    { sel: "#tour-grid", title: "Disposição dos produtos", text: "Muda a forma como os produtos aparecem: retrato, quadrado ou alto.", screen: "home" },
    { sel: "[data-edit-products]", title: "Os teus produtos", text: "Adiciona e edita produtos aqui. Passa o rato num produto para o editar.", screen: "home" },
    { sel: "[data-add-toggle]", title: "Adicionar secções", text: "Monta a página por blocos: produtos, informação, texto, testemunhos ou localização.", screen: "home" },
    { sel: "#mb-ai-agent", title: "O teu assistente", text: "Clica neste robô para abrir o chat e tirar dúvidas sobre o editor a qualquer momento." },
    { sel: "[data-edit-perks]", title: "Garantias do produto", text: "Na página de produto podes editar, adicionar ou remover estas garantias.", screen: "product" },
    { sel: "#ver-loja", title: "Ver a loja", text: "Abre a tua loja publicada numa nova aba para a veres como um cliente." },
    { sel: "#save", title: "Guardar", text: "Quando terminares, clica em Guardar para publicar as alterações." },
  ];

  async function startTutorial(): Promise<void> {
    document.getElementById("mb-tour")?.remove();
    if (previewOpen) closePreview();
    let idx = 0;
    const layer = document.createElement("div");
    layer.id = "mb-tour";
    layer.style.cssText = "position:fixed;inset:0;z-index:200;font-family:Inter,sans-serif";
    const hole = document.createElement("div");
    hole.style.cssText = "position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.55);transition:all .25s ease;pointer-events:none;top:50%;left:50%;width:0;height:0";
    const tip = document.createElement("div");
    tip.style.cssText = "position:fixed;max-width:320px;background:#fff;border-radius:16px;padding:18px;box-shadow:0 16px 48px rgba(0,0,0,.3);transition:all .2s ease";
    layer.appendChild(hole); layer.appendChild(tip);
    document.body.appendChild(layer);

    const close = () => { trackToken++; layer.remove(); };
    let trackToken = 0;

    function position(el: Element | null): void {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (el) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        hole.style.top = `${Math.max(0, r.top - pad)}px`;
        hole.style.left = `${Math.max(0, r.left - pad)}px`;
        hole.style.width = `${r.width + pad * 2}px`;
        hole.style.height = `${r.height + pad * 2}px`;
        hole.style.transform = "none";
        let top = r.bottom + 14;
        if (top + 210 > vh) top = Math.max(12, r.top - 210);
        const left = Math.min(Math.max(12, r.left), vw - 332);
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
        tip.style.transform = "none";
      } else {
        hole.style.width = "0"; hole.style.height = "0"; hole.style.top = "50%"; hole.style.left = "50%";
        tip.style.top = "50%"; tip.style.left = "50%"; tip.style.transform = "translate(-50%,-50%)";
      }
    }

    function renderContent(): void {
      const step = TOUR[idx]!;
      const last = idx === TOUR.length - 1;
      tip.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span style="color:${ACCENT}" class="text-xs font-bold uppercase tracking-wider">Passo ${idx + 1} de ${TOUR.length}</span>
          <button data-skip class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <h3 class="font-black text-gray-900 text-lg">${esc(step.title)}</h3>
        <p class="text-gray-500 text-sm mt-1.5 leading-relaxed">${esc(step.text)}</p>
        <div class="flex items-center justify-between gap-2 mt-5">
          <button data-prev class="text-sm font-semibold px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 ${idx === 0 ? "invisible" : ""}">Anterior</button>
          <button data-next class="text-sm font-bold px-5 py-2 rounded-lg text-white" style="background:${ACCENT}">${last ? "Concluir" : "Seguinte"}</button>
        </div>`;
      tip.querySelector("[data-skip]")?.addEventListener("click", close);
      tip.querySelector("[data-prev]")?.addEventListener("click", () => { if (idx > 0) { idx--; void show(); } });
      tip.querySelector("[data-next]")?.addEventListener("click", () => { if (last) { close(); return; } idx++; void show(); });
    }

    /** Mantém o destaque sobre o elemento (acompanha scroll/animações). */
    function track(el: Element): void {
      const token = ++trackToken;
      const tick = (): void => {
        if (token !== trackToken || !document.body.contains(layer)) return;
        position(el);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    async function show(): Promise<void> {
      const step = TOUR[idx]!;
      if (step.screen && step.screen !== currentScreen) {
        currentScreen = step.screen;
        updateScreenTabs();
        await rebuild();
      }
      renderContent();
      // Aguarda um frame para o DOM/preview estabilizar após o rebuild.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const el = (step.sel ? document.querySelector(step.sel) : null) as HTMLElement | null;
      if (!el) { position(null); return; }

      // Se o alvo estiver fora da área visível, faz scroll até ao centro (em
      // qualquer contentor com scroll) e espera o movimento suave assentar.
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 70 || r.bottom > window.innerHeight - 20 || r.left < 0 || r.right > window.innerWidth;
      if (offscreen) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        await new Promise((res) => setTimeout(res, 420));
      }
      position(el);
      track(el);
    }

    await show();
  }
}
