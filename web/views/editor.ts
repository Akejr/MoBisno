/**
 * Ecrã "Personalizar" — construtor da loja diretamente no preview.
 *
 * Edição intuitiva e animada: textos clicáveis, logótipo e imagem do hero por
 * hover/clique, menus (adicionar/editar/remover), contactos do rodapé e
 * produtos (adicionar/editar com foto). Inclui "Desfazer" e "Ver loja" noutra
 * janela.
 */
import { render, $, go, esc, toast, fileToUint8Array, withBusy, withButton, fadeInImages } from "../lib/dom.js";
import {
  appState, currentOwnerId, publicStoreUrl,
  storeRepository, assetRepository, bannerRepository, productRepository, adminPanelFor,
} from "../composition.js";
import { renderStore, type StoreViewModel } from "../../src/storefront/storeRenderer.js";
import type { StorefrontResult } from "../../src/services/storefrontResolver.js";
import { BANNER_POLICY, LOGO_POLICY } from "../../src/services/fileService.js";
import { getTemplate } from "../templates/registry.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import type { StoreCustomization } from "../templates/types.js";
import type { Store, Product } from "../../src/models/index.js";
import { openProductForm } from "../lib/productForm.js";
import { openWhatsappForm } from "../lib/whatsappForm.js";

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
  const ownerId = appState.ownerId ?? (await currentOwnerId());
  if (!ownerId) { go("#/criar"); return; }

  let store: Store | null = appState.storeId
    ? await storeRepository.findByIdForOwner(ownerId, appState.storeId)
    : null;
  if (!store) {
    const stores = await storeRepository.listByOwner(ownerId);
    store = stores[0] ?? null;
  }
  if (!store) { go("#/painel"); return; }
  appState.ownerId = ownerId;
  appState.storeId = store.id;

  const custom: StoreCustomization = await getCustomization(store.id);
  const panel = adminPanelFor(store.id);
  let productsById = new Map<string, Product>();

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
  let currentScreen: "home" | "product" = "home";
  let arcTarget: number | "add" = "add";
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
  <div class="min-h-screen flex flex-col bg-neutral-100">
    <header class="sticky top-0 z-[60] bg-surface/95 backdrop-blur border-b border-outline-variant">
      <div class="flex justify-center px-4 pt-2 pb-1.5 border-b border-outline-variant/50">
        <div class="inline-flex bg-surface-container-high rounded-full p-1 gap-1 text-label-sm">
          <button data-screen="home" class="px-4 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">home</span> Início</button>
          <button data-screen="product" class="px-4 py-1.5 rounded-full transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">sell</span> Página de produto</button>
        </div>
      </div>
      <div class="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
        <div class="flex items-center gap-3 min-w-0">
          <a href="#/painel" class="w-9 h-9 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"><span class="material-symbols-outlined">arrow_back</span></a>
          <div class="min-w-0">
            <p class="text-label-sm text-on-surface-variant leading-none">A personalizar</p>
            <p class="text-on-surface font-bold truncate">${esc(store.name)}</p>
          </div>
        </div>
        <div class="flex items-center gap-1 md:gap-2">
          <label class="flex items-center gap-2 text-label-sm text-on-surface-variant cursor-pointer rounded-full hover:bg-surface-container-high px-2 py-1 relative">
            <span class="w-6 h-6 rounded-full border border-outline-variant" id="color-dot" style="background:${esc(custom.colors?.primary ?? defaultColor)}"></span>
            <span class="hidden sm:inline">Cor</span>
            <input id="color" type="color" value="${esc(custom.colors?.primary ?? defaultColor)}" class="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <button id="undo" class="flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface px-3 py-2 rounded-full hover:bg-surface-container-high"><span class="material-symbols-outlined text-[18px]">undo</span><span class="hidden sm:inline">Desfazer</span></button>
          <a href="${esc(storeUrl)}" target="_blank" rel="noopener" class="flex items-center gap-1 text-label-md text-on-surface-variant hover:text-primary px-3 py-2 rounded-full hover:bg-surface-container-high"><span class="material-symbols-outlined text-[18px]">open_in_new</span><span class="hidden sm:inline">Ver loja</span></a>
          <button id="save" class="bg-primary text-on-primary px-5 py-2 rounded-full text-label-md font-bold flex items-center gap-1 shadow-sm hover:bg-surface-tint transition-colors"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>
        </div>
      </div>
    </header>
    <div id="preview" class="flex-grow overflow-auto"></div>
    <input id="logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
    <input id="hero-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="feature-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="arc-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
    <input id="footer-logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
  </div>
  <style>
    #preview [data-edit]{outline:1px dashed transparent;transition:outline-color .15s;cursor:text;border-radius:4px}
    #preview [data-edit]:hover{outline-color:#ff5c00}
    #preview [data-edit]:focus{outline:2px solid #ff5c00;outline-offset:2px}
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
  </style>`);

  function bind(preview: HTMLElement): void {
    preview.style.setProperty("--brand", custom.colors?.primary ?? defaultColor);

    // Não navegar ao clicar em links do preview.
    preview.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a && !(e.target as HTMLElement).closest("[data-edit-logo]")) e.preventDefault();
    });

    // Textos editáveis inline (com snapshot ao focar).
    preview.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.addEventListener("focus", () => snapshot());
      el.addEventListener("input", () => setPath(custom as Record<string, any>, el.dataset.edit!, el.textContent?.trim() ?? ""));
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); el.blur(); }
      });
    });

    // Logótipo — clicar (no logo ou no botão) abre o upload.
    const logo = preview.querySelector<HTMLElement>("[data-edit-logo]");
    if (logo) {
      logo.addEventListener("click", (e) => { e.preventDefault(); ($("#logo-input") as HTMLInputElement).click(); });
      const ov = document.createElement("span");
      ov.className = "mb-ov mb-logo-ov absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap bg-neutral-900 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow";
      ov.innerHTML = `<span class="material-symbols-outlined text-[14px]">photo_camera</span> Trocar logótipo`;
      logo.appendChild(ov);
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

    // Logótipo do rodapé — clicar abre o upload (overlay por hover).
    const footerLogo = preview.querySelector<HTMLElement>("[data-edit-footer-logo]");
    if (footerLogo) {
      footerLogo.addEventListener("click", (e) => { e.preventDefault(); ($("#footer-logo-input") as HTMLInputElement).click(); });
      const ov = document.createElement("span");
      ov.className = "mb-ov mb-flogo-ov absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap bg-neutral-900 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow z-10";
      ov.innerHTML = `<span class="material-symbols-outlined text-[14px]">photo_camera</span> Logótipo do rodapé`;
      footerLogo.appendChild(ov);
    }

    // Menus — editar inline + remover + adicionar.
    const nav = preview.querySelector<HTMLElement>("[data-edit-menu]");
    if (nav) {
      custom.menu = custom.menu ?? Array.from(nav.querySelectorAll("[data-edit-menu-item]")).map((s) => s.textContent?.trim() ?? "");
      nav.querySelectorAll<HTMLElement>("[data-edit-menu-item]").forEach((item, i) => {
        item.setAttribute("contenteditable", "true");
        item.setAttribute("spellcheck", "false");
        item.addEventListener("focus", () => snapshot());
        item.addEventListener("input", () => { (custom.menu as string[])[i] = item.textContent?.trim() ?? ""; });
        item.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); item.blur(); } });
        const rm = document.createElement("button");
        rm.className = "mb-ov-btn ml-1 align-middle text-neutral-400 hover:text-red-600";
        rm.title = "Remover";
        rm.innerHTML = `<span class="material-symbols-outlined text-[16px]">close</span>`;
        rm.addEventListener("click", (e) => {
          e.preventDefault();
          snapshot();
          (custom.menu as string[]).splice(i, 1);
          void rebuild();
        });
        item.after(rm);
      });
      const add = document.createElement("button");
      add.className = "mb-chip mb-ov-btn text-xs text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-full px-2 py-0.5 flex items-center gap-1";
      add.innerHTML = `<span class="material-symbols-outlined text-[14px]">add</span> Menu`;
      add.addEventListener("click", (e) => {
        e.preventDefault();
        snapshot();
        (custom.menu as string[]).push("Novo");
        void rebuild();
      });
      nav.appendChild(add);
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
        if (product) openProductForm({ panel, ownerId, storeId: store!.id, product, categories: currentCategories(), onDone: rebuild });
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
        openProductForm({ panel, ownerId, storeId: store!.id, categories: currentCategories(), onDone: rebuild });
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
        wrap.className = "mb-ov-btn flex items-center gap-2 shrink-0";
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
      const addSec = document.createElement("button");
      addSec.className = "mb-ov-btn mt-10 w-full border-2 border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-500 rounded-xl py-4 flex items-center justify-center gap-2 transition-colors";
      addSec.innerHTML = `<span class="material-symbols-outlined">add</span> Adicionar secção`;
      addSec.addEventListener("click", (e) => {
        e.preventDefault();
        snapshot();
        const used = new Set((custom.sections ?? []).map((s) => s.category));
        const next = !used.has("__featured__") ? "__featured__" : (cats.find((c) => !used.has(c)) ?? "__all__");
        (custom.sections ?? (custom.sections = [])).push({ category: next });
        void rebuild();
      });
      sectionsWrap.appendChild(addSec);
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
  }

  async function rebuild(): Promise<void> {
    const view = await buildView();
    const preview = $("#preview")!;
    if (view.kind !== "render") { preview.innerHTML = ""; return; }
    const template = getTemplate(store!.templateId);

    if (currentScreen === "product") {
      const sample = view.products[0] ?? null;
      if (!sample) {
        preview.innerHTML = `<div class="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 p-8 text-neutral-500">
          <span class="material-symbols-outlined" style="font-size:48px;">production_quantity_limits</span>
          <p class="max-w-sm">Adicione um produto na página inicial para pré-visualizar e editar a página de produto.</p>
        </div>`;
        return;
      }
      preview.innerHTML = template.renderProduct
        ? template.renderProduct(view, sample, custom)
        : template.render(view, custom);
    } else {
      preview.innerHTML = template.render(view, custom);
    }
    bind(preview);
    fadeInImages(preview);
  }

  function updateScreenTabs(): void {
    document.querySelectorAll<HTMLElement>("[data-screen]").forEach((b) => {
      const active = b.dataset.screen === currentScreen;
      b.className =
        "px-4 py-1.5 rounded-full transition-colors flex items-center gap-1 " +
        (active ? "bg-primary text-on-primary font-bold shadow-sm" : "text-on-surface-variant hover:text-on-surface");
    });
  }

  await rebuild();
  updateScreenTabs();

  // Seletor de telas (Início / Página de produto).
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((b) =>
    b.addEventListener("click", async () => {
      const next = b.dataset.screen === "product" ? "product" : "home";
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

  // Upload do logótipo.
  $("#logo-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const content = await fileToUint8Array(file);
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
    const content = await fileToUint8Array(file);
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
    const content = await fileToUint8Array(file);
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
    const content = await fileToUint8Array(file);
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

  // Upload do logótipo do rodapé (versão clara/alternativa).
  $("#footer-logo-input")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await fileToUint8Array(file);
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
    toast(ok ? "Loja guardada!" : "Não foi possível guardar.", ok ? "success" : "error");
  });
}
