/**
 * Galeria de modelos prontos (presets) com preview em tempo real.
 * O utilizador vê cada modelo renderizado num iframe, escolhe e aplica.
 */
import { render, $, go, esc, toast } from "../lib/dom.js";
import { TEMPLATE_PRESETS, getPreset } from "../templates/presets.js";
import { appState } from "../composition.js";
import { saveCustomization } from "../supabase/customization.js";
import { getTemplate } from "../templates/registry.js";
import { renderStore, type StoreViewModel } from "../../src/storefront/storeRenderer.js";
import { applyInk } from "../lib/ink.js";
import { applyTheme } from "../lib/theme.js";

const ACCENT = "#F95901";

/** Dados da loja fake usados no preview (produtos e dados genéricos). */
function mockStoreView(): StoreViewModel {
  return {
    storeName: "A Sua Loja",
    storeType: "Moda e Acessórios",
    logo: null,
    banners: [],
    products: [
      {
        id: "mock-1",
        name: "Produto Exemplo 1",
        price: 12500,
        imageUrl: null,
        available: true,
        featured: false,
        category: "Categoria A",
        description: "Descrição do produto de exemplo.",
        stock: null,
      },
      {
        id: "mock-2",
        name: "Produto Exemplo 2",
        price: 8900,
        imageUrl: null,
        available: true,
        featured: true,
        category: "Categoria A",
        description: "Outro produto de exemplo em destaque.",
        stock: null,
      },
      {
        id: "mock-3",
        name: "Produto Exemplo 3",
        price: 15000,
        imageUrl: null,
        available: true,
        featured: false,
        category: "Categoria B",
        description: "Mais um produto de exemplo.",
        stock: null,
      },
    ],
    categories: ["Categoria A", "Categoria B"],
  };
}

/** Renderiza o HTML de preview de um preset dentro de um contentor. */
function renderPreview(presetId: string, container: HTMLElement): void {
  const preset = getPreset(presetId);
  if (!preset) { container.innerHTML = "<p>Modelo não encontrado.</p>"; return; }
  const view = mockStoreView();
  const template = getTemplate("galeria"); // Usa o template Galeria como base (ou outro)
  const html = template.render(view, preset.customization);
  container.innerHTML = html;
  // Aplica cor e tema ao preview.
  container.style.setProperty("--brand", preset.customization.colors?.primary ?? ACCENT);
  applyInk(container, preset.customization);
  applyTheme(container, preset.customization);
}

export function renderPresetGallery(): void {
  if (!appState.storeId || !appState.ownerId) {
    toast("Loja não identificada. Volta ao wizard.", "error");
    go("#/criar");
    return;
  }

  render(`
  <div class="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
    <nav class="bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 sticky top-0 z-50">
      <div class="flex justify-between items-center px-4 md:px-8 py-3.5 max-w-7xl mx-auto w-full">
        <div class="flex items-center gap-3">
          <a href="#/painel" class="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            <span class="text-sm font-medium">Voltar ao painel</span>
          </a>
        </div>
        <a href="#/" class="flex items-center gap-2"><img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" /></a>
      </div>
    </nav>
    <main class="flex-grow overflow-auto px-4 md:px-8 py-8">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-10">
          <h1 class="text-3xl md:text-4xl font-black text-gray-900 mb-3">Escolha o modelo da sua loja</h1>
          <p class="text-gray-600 text-lg">Veja o preview em tempo real e escolha o que mais combina com a sua marca.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8" id="presets-grid"></div>
      </div>
    </main>
  </div>`);

  const grid = $("#presets-grid")!;
  for (const preset of TEMPLATE_PRESETS) {
    const card = document.createElement("div");
    card.className = "bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow";
    card.innerHTML = `
      <div class="p-5 border-b border-gray-100">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 class="text-xl font-bold text-gray-900">${esc(preset.name)}</h3>
            <p class="text-sm text-gray-500 mt-1">${esc(preset.description)}</p>
          </div>
          <button data-apply="${esc(preset.id)}" class="shrink-0 px-5 py-2.5 rounded-full text-white font-bold text-sm flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-opacity" style="background:${ACCENT}">
            <span class="material-symbols-outlined text-[18px]">check</span> Usar este
          </button>
        </div>
      </div>
      <div class="bg-gray-50 p-4">
        <div class="aspect-[16/10] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-inner">
          <div data-preview="${esc(preset.id)}" class="w-full h-full overflow-auto"></div>
        </div>
      </div>`;
    grid.appendChild(card);

    // Renderiza o preview do modelo.
    const previewContainer = card.querySelector(`[data-preview="${preset.id}"]`) as HTMLElement;
    renderPreview(preset.id, previewContainer);

    // Botão "Usar este".
    card.querySelector(`[data-apply="${preset.id}"]`)!.addEventListener("click", () => applyPreset(preset.id));
  }
}

async function applyPreset(presetId: string): Promise<void> {
  const preset = getPreset(presetId);
  if (!preset) { toast("Modelo não encontrado.", "error"); return; }
  if (!appState.storeId || !appState.ownerId) { toast("Loja não identificada.", "error"); go("#/criar"); return; }

  toast("A aplicar o modelo…");
  const saved = await saveCustomization(appState.ownerId, appState.storeId, preset.customization);
  if (!saved) { toast("Não foi possível aplicar o modelo. Tenta de novo.", "error"); return; }

  toast(`Modelo "${preset.name}" aplicado com sucesso! 🎉`);
  setTimeout(() => go("#/painel"), 800);
}
