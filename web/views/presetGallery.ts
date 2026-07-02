/**
 * Galeria de modelos prontos.
 * Carrega as lojas-modelo reais (secção "Modelos" do admin) e mostra o preview
 * verdadeiro de cada uma (com os produtos/fotos/textos que o admin configurou).
 * Seletor interativo (cards que expandem) + botão de preview que abre o site
 * completo em desktop e mobile. Ao aplicar, copia só a customização e bloqueia
 * a edição estrutural na loja do cliente.
 */
import { render, $, go, esc, toast } from "../lib/dom.js";
import { appState, currentOwnerId } from "../composition.js";
import { listTemplateModels, applyModelToStore, applyRawToStore, defaultFactoryModels, type TemplateModel } from "../supabase/models.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getTemplate } from "../templates/registry.js";
import { DEFAULT_LOGO, type StoreRenderView, type StoreProductView } from "../../src/storefront/storeRenderer.js";
import type { StoreCustomization } from "../templates/types.js";

const ACCENT = "#F95901";
const PRESET_ICONS = ["storefront", "diamond", "eco", "palette", "local_mall", "auto_awesome"];

/** Um item da galeria (loja-modelo real ou preset estático de reserva). */
interface GalleryItem {
  key: string;
  name: string;
  description: string;
  html: string;
  customization: StoreCustomization;
  model?: TemplateModel;
  templateId?: string;
  identifier?: string;
}

let items: GalleryItem[] = [];
let activeIndex = 0;
let currentTestMode = false;

/* ------------------------- Preview (dados de reserva) ------------------------- */

const DEMO_IMAGES = [
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=600",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=600",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600",
  "https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=600",
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=600",
  "https://images.unsplash.com/photo-1560769629-975ec94e6a86?q=80&w=600",
];

function demoProduct(i: number, name: string, price: number, category: string, featured = false): StoreProductView {
  return {
    id: `demo-${i}`, name, description: "Produto de exemplo.", category, featured,
    physical: true, price, imageUrl: DEMO_IMAGES[i % DEMO_IMAGES.length]!, stock: null,
  };
}

/** View model de reserva (quando ainda não há lojas-modelo criadas). */
function mockView(): StoreRenderView {
  const brand = { kind: "fallback" as const, identity: DEFAULT_LOGO, alt: "A Sua Loja" };
  return {
    kind: "render", templateId: "galeria", storeName: "A Sua Loja", subdomain: "asualoja.sualoja.digital",
    header: { brand, storeName: "A Sua Loja" },
    menu: { brand, items: [{ label: "Início" }, { label: "Produtos" }, { label: "Sobre" }] },
    banners: [],
    products: [
      demoProduct(0, "Vestido Elegante", 12500, "Vestidos", true),
      demoProduct(1, "Bolsa de Couro", 18900, "Acessórios"),
      demoProduct(2, "Ténis Casual", 15000, "Calçado"),
      demoProduct(3, "Óculos de Sol", 8500, "Acessórios"),
      demoProduct(4, "Camisa Clássica", 9900, "Vestidos"),
      demoProduct(5, "Relógio Moderno", 24000, "Acessórios", true),
    ],
  };
}

/* ----------------------------- Carregar itens ----------------------------- */

async function loadItems(): Promise<GalleryItem[]> {
  const models = await listTemplateModels();
  if (models.length) {
    const out: GalleryItem[] = [];
    for (const m of models) {
      let html = "";
      try {
        const { view } = await loadStorefront(m.identifier);
        if (view.kind === "render") html = getTemplate(m.templateId).render(view, m.customization);
      } catch { /* ignora falha de uma loja-modelo */ }
      out.push({
        key: m.storeId, name: m.name, description: m.description, html,
        customization: m.customization, model: m, identifier: m.identifier,
      });
    }
    return out;
  }
  // Reserva: modelos de fábrica com dados de exemplo (antes de o admin importar/criar).
  const view = mockView();
  return defaultFactoryModels().map((fm) => ({
    key: fm.templateId,
    name: fm.name,
    description: fm.description,
    html: getTemplate(fm.templateId).render(view, fm.base),
    customization: fm.base,
    templateId: fm.templateId,
  }));
}

/** Aplica as variáveis de cor/tema ao contentor do preview. */
function applyVars(el: HTMLElement, c: StoreCustomization): void {
  el.style.setProperty("--brand", c.colors?.primary ?? ACCENT);
  const ink = c.colors?.text;
  if (ink) { el.setAttribute("data-ink", ""); el.style.setProperty("--ink", ink); }
  const style = c.theme?.style;
  if (style) {
    el.setAttribute("data-theme", style);
    const tv = THEME_VARS[style];
    if (tv) { el.style.setProperty("--mb-radius", tv.radius); el.style.setProperty("--mb-head-font", tv.head); }
  }
}

const THEME_VARS: Record<string, { radius: string; head: string }> = {
  moderno: { radius: "1rem", head: "Inter, sans-serif" },
  classico: { radius: "0.35rem", head: "'Noto Serif', serif" },
  minimal: { radius: "0px", head: "Inter, sans-serif" },
};

/**
 * Documento HTML completo (para iframe) com o preview. Copia os estilos da
 * página (Tailwind, fontes, ink/theme) para que os breakpoints respondam à
 * LARGURA DO IFRAME (viewport próprio) — preview mobile verdadeiro.
 */
function buildStoreDoc(item: GalleryItem): string {
  const heads = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style'))
    .map((el) => el.outerHTML).join("\n");
  const c = item.customization;
  const primary = c.colors?.primary ?? ACCENT;
  const ink = c.colors?.text ?? "";
  const style = c.theme?.style;
  const tv = style ? THEME_VARS[style] : undefined;
  const vars = `--brand:${primary};` + (ink ? `--ink:${ink};` : "") + (tv ? `--mb-radius:${tv.radius};--mb-head-font:${tv.head};` : "");
  const attrs = `${ink ? " data-ink" : ""}${style ? ` data-theme="${style}"` : ""}`;
  const body = item.html || `<div style="padding:3rem;text-align:center;color:#9ca3af;font-family:sans-serif">Este modelo ainda não tem conteúdo.</div>`;
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${heads}<style>html,body{margin:0;padding:0;background:#fff}</style></head><body><div${attrs} style="${vars}">${body}</div></body></html>`;
}

function storeIframe(item: GalleryItem, cssText: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `border:0;background:#fff;${cssText}`;
  iframe.setAttribute("title", "Pré-visualização da loja");
  iframe.srcdoc = buildStoreDoc(item);
  return iframe;
}

/* -------------------------- Estilos injetados --------------------------- */

function injectStyle(): void {
  if (document.getElementById("mb-gallery-style")) return;
  const st = document.createElement("style");
  st.id = "mb-gallery-style";
  st.textContent = `
    @keyframes mbFadeInTop{0%{opacity:0;transform:translateY(-20px)}100%{opacity:1;transform:translateY(0)}}
    .mb-fade-top{opacity:0;animation:mbFadeInTop .8s ease-in-out forwards}
    .mb-delay-1{animation-delay:.15s}.mb-delay-2{animation-delay:.3s}
    .mb-option{position:relative;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;cursor:pointer;
      border:2px solid #e5e7eb;background:#fff;min-width:56px;border-radius:18px;
      transition:flex-grow .7s cubic-bezier(.16,1,.3,1),box-shadow .5s ease,border-color .3s ease;
      box-shadow:0 8px 24px rgba(0,0,0,.06);flex:1 1 0%}
    .mb-option.active{flex:7 1 0%;border-color:${ACCENT};box-shadow:0 18px 50px rgba(0,0,0,.16)}
    .mb-option-bg{position:absolute;inset:0;overflow:hidden;background:#fff;pointer-events:none}
    .mb-option-bg > .mb-scale{width:1200px;transform-origin:top left;transform:scale(.7)}
    .mb-option-shadow{position:absolute;left:0;right:0;bottom:0;height:130px;pointer-events:none;
      background:linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.35) 55%, transparent);
      opacity:0;transition:opacity .5s ease}
    .mb-option.active .mb-option-shadow{opacity:1}
    .mb-option-label{position:absolute;left:0;right:0;bottom:16px;display:flex;align-items:center;height:48px;z-index:2;pointer-events:none;padding:0 16px;gap:12px}
    .mb-option-icon{min-width:44px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:9999px;
      background:${ACCENT};box-shadow:0 4px 12px rgba(249,89,1,.4);flex-shrink:0}
    .mb-option-info{color:#fff;white-space:pre;text-shadow:0 1px 4px rgba(0,0,0,.4)}
    .mb-option-info .main{font-weight:800;font-size:17px;transition:all .6s ease}
    .mb-option:not(.active) .mb-option-info{opacity:0;transform:translateX(20px)}
    .mb-option.active .mb-option-info{opacity:1;transform:translateX(0)}
  `;
  document.head.appendChild(st);
}

/* ------------------------------ Render ---------------------------------- */

export async function renderPresetGallery(testMode = false): Promise<void> {
  currentTestMode = testMode;
  activeIndex = 0;

  if (!testMode && (!appState.storeId || !appState.ownerId)) {
    // Sem loja em contexto: tenta o dono autenticado; senão volta ao assistente.
    const owner = await currentOwnerId();
    if (!owner || !appState.storeId) {
      toast("Loja não identificada. Volta ao assistente.", "error");
      go("#/criar");
      return;
    }
  }

  injectStyle();

  render(`
  <div class="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
    <nav class="bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 sticky top-0 z-40">
      <div class="flex justify-between items-center px-4 md:px-8 py-3.5 max-w-7xl mx-auto w-full">
        <a href="#/painel" class="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
          <span class="material-symbols-outlined text-[20px]">arrow_back</span>
          <span class="text-sm font-medium">Voltar</span>
        </a>
        <a href="#/" class="flex items-center gap-2"><img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" /></a>
      </div>
    </nav>

    <main class="flex-grow flex flex-col items-center px-4 md:px-8 py-10">
      <div class="w-full max-w-3xl text-center mb-8">
        <h1 class="text-3xl md:text-4xl font-black mb-3 tracking-tight mb-fade-top mb-delay-1">Escolha o modelo da sua loja</h1>
        <p class="text-base md:text-lg text-gray-500 mb-fade-top mb-delay-2">Clique num modelo para ver mais. Abra o preview para ver o site completo em desktop e telemóvel.</p>
      </div>
      <div id="selector" class="flex w-full max-w-[960px] gap-3 h-[440px] items-stretch items-center justify-center">
        <div class="text-gray-400 flex items-center gap-2"><span class="material-symbols-outlined animate-spin">progress_activity</span> A carregar modelos…</div>
      </div>
      <div class="text-center mt-6 h-14">
        <h2 id="active-name" class="text-xl md:text-2xl font-black text-gray-900"></h2>
        <p id="active-desc" class="text-sm md:text-base text-gray-500 mt-1"></p>
      </div>
      <div class="flex flex-wrap gap-3 justify-center mt-4" id="gallery-actions" style="visibility:hidden">
        <button id="btn-preview" class="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-base border-2 border-gray-200 text-gray-700 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors">
          <span class="material-symbols-outlined text-[20px]">visibility</span> Ver preview completo
        </button>
        <button id="btn-apply" class="inline-flex items-center gap-2 px-8 py-3 rounded-full font-bold text-base text-white shadow-lg hover:opacity-95 transition-opacity" style="background:${ACCENT}">
          <span class="material-symbols-outlined text-[20px]">check</span> <span>${testMode ? "Selecionar (teste)" : "Usar este modelo"}</span>
        </button>
      </div>
    </main>
  </div>`);

  items = await loadItems();

  if (!items.length) {
    const sel = $("#selector");
    if (sel) sel.innerHTML = `<div class="text-center text-gray-500"><span class="material-symbols-outlined text-gray-300" style="font-size:48px">dashboard_customize</span><p class="mt-2">Ainda não há modelos disponíveis.</p></div>`;
    return;
  }

  buildSelector();
  const actions = $("#gallery-actions");
  if (actions) actions.style.visibility = "visible";

  $("#btn-preview")!.addEventListener("click", () => openFullPreview(activeIndex));
  $("#btn-apply")!.addEventListener("click", () => {
    const item = items[activeIndex]!;
    if (currentTestMode) toast(`Modelo "${item.name}" selecionado (modo de teste)`, "info");
    else void applyItem(item);
  });
}

function buildSelector(): void {
  const selector = $("#selector")!;
  selector.className = "flex w-full max-w-[960px] gap-3 h-[440px] items-stretch";
  selector.innerHTML = "";

  items.forEach((item, index) => {
    const opt = document.createElement("div");
    opt.className = `mb-option${index === activeIndex ? " active" : ""}`;
    opt.dataset.index = String(index);
    const icon = PRESET_ICONS[index % PRESET_ICONS.length];

    opt.innerHTML = `
      <div class="mb-option-bg"><div class="mb-scale"></div></div>
      <div class="mb-option-shadow"></div>
      <div class="mb-option-label">
        <div class="mb-option-icon"><span class="material-symbols-outlined" style="font-size:22px;color:#fff">${icon}</span></div>
        <div class="mb-option-info"><div class="main">${esc(item.name)}</div></div>
      </div>`;

    selector.appendChild(opt);

    const scale = opt.querySelector(".mb-scale") as HTMLElement;
    scale.innerHTML = item.html || `<div style="padding:3rem;text-align:center;color:#9ca3af">Sem conteúdo</div>`;
    applyVars(scale, item.customization);

    opt.addEventListener("click", () => selectOption(index));
  });

  updateCaption();

  requestAnimationFrame(() => {
    selector.querySelectorAll<HTMLElement>(".mb-option").forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-40px)";
      el.style.transition = "opacity .5s ease, transform .5s ease";
      setTimeout(() => { el.style.opacity = "1"; el.style.transform = "translateX(0)"; }, 120 * i);
    });
  });
}

function selectOption(index: number): void {
  if (index === activeIndex) return;
  activeIndex = index;
  document.querySelectorAll<HTMLElement>(".mb-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.index === String(index));
  });
  updateCaption();
}

function updateCaption(): void {
  const item = items[activeIndex];
  if (!item) return;
  const name = $("#active-name");
  const desc = $("#active-desc");
  if (name) name.textContent = item.name;
  if (desc) desc.textContent = item.description;
}

/* ------------------------- Preview completo ----------------------------- */

function openFullPreview(index: number): void {
  const item = items[index];
  if (!item) return;
  let mode: "desktop" | "mobile" = "desktop";

  const overlay = document.createElement("div");
  overlay.id = "mb-preview-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(17,17,17,.9);backdrop-filter:blur(6px);display:flex;flex-direction:column";
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;color:#fff;flex-shrink:0">
      <div style="font-weight:700;font-size:16px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</div>
      <div style="display:flex;gap:4px;align-items:center;background:rgba(255,255,255,.1);border-radius:9999px;padding:4px">
        <button data-mode="desktop" class="mb-mode-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9999px;border:none;font-weight:600;font-size:14px;cursor:pointer">
          <span class="material-symbols-outlined" style="font-size:18px">computer</span> Desktop
        </button>
        <button data-mode="mobile" class="mb-mode-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9999px;border:none;font-weight:600;font-size:14px;cursor:pointer">
          <span class="material-symbols-outlined" style="font-size:18px">phone_iphone</span> Mobile
        </button>
      </div>
      <button id="mb-preview-close" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font-weight:600;font-size:14px;cursor:pointer">
        <span class="material-symbols-outlined" style="font-size:18px">close</span> Fechar
      </button>
    </div>
    <div id="mb-preview-stage" style="flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:20px"></div>`;

  document.body.appendChild(overlay);
  const stage = overlay.querySelector("#mb-preview-stage") as HTMLElement;

  const renderStage = (): void => {
    stage.innerHTML = "";
    if (mode === "desktop") {
      const frame = document.createElement("div");
      frame.style.cssText = "width:100%;max-width:1200px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;height:82vh";
      frame.innerHTML = `
        <div style="background:#e5e7eb;padding:8px 14px;display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span style="width:11px;height:11px;border-radius:9999px;background:#ef4444"></span>
          <span style="width:11px;height:11px;border-radius:9999px;background:#f59e0b"></span>
          <span style="width:11px;height:11px;border-radius:9999px;background:#22c55e"></span>
          <span style="margin-left:12px;font-size:12px;color:#6b7280">${esc(item.identifier ?? "asualoja")}.sualoja.digital</span>
        </div>`;
      frame.appendChild(storeIframe(item, "width:100%;flex:1;display:block"));
      stage.appendChild(frame);
    } else {
      const phone = document.createElement("div");
      phone.style.cssText = "width:390px;max-width:100%;background:#111827;border-radius:44px;padding:12px;box-shadow:0 20px 60px rgba(0,0,0,.5)";
      const screen = document.createElement("div");
      screen.style.cssText = "background:#fff;border-radius:34px;overflow:hidden;height:78vh";
      screen.appendChild(storeIframe(item, "width:100%;height:100%;display:block"));
      phone.appendChild(screen);
      stage.appendChild(phone);
    }
    overlay.querySelectorAll<HTMLElement>(".mb-mode-btn").forEach((b) => {
      const active = b.dataset.mode === mode;
      b.style.background = active ? "#fff" : "transparent";
      b.style.color = active ? "#111" : "#fff";
    });
  };

  renderStage();
  overlay.querySelectorAll<HTMLElement>(".mb-mode-btn").forEach((b) =>
    b.addEventListener("click", () => { mode = b.dataset.mode as "desktop" | "mobile"; renderStage(); }));

  const close = (): void => overlay.remove();
  overlay.querySelector("#mb-preview-close")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

/* ----------------------------- Aplicar ---------------------------------- */

async function applyItem(item: GalleryItem): Promise<void> {
  const ownerId = appState.ownerId ?? (await currentOwnerId());
  if (!ownerId || !appState.storeId) {
    toast("Loja não identificada.", "error");
    go("#/criar");
    return;
  }

  toast("A aplicar o modelo…");
  let ok: boolean;
  if (item.model) {
    // Modelo real: copia customização + atualiza o template visual da loja.
    ok = await applyModelToStore(ownerId, appState.storeId, item.model);
  } else {
    // Reserva (modelo de fábrica): copia customização + template e bloqueia estrutura.
    ok = await applyRawToStore(ownerId, appState.storeId, item.templateId ?? "galeria", item.customization);
  }
  if (!ok) { toast("Não foi possível aplicar o modelo. Tenta de novo.", "error"); return; }

  toast(`Modelo "${item.name}" aplicado! 🎉`);
  setTimeout(() => go("#/painel"), 800);
}
