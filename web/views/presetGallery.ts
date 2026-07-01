/**
 * Galeria de modelos prontos (presets) com preview visual.
 * O utilizador vê cada modelo com mockup visual, escolhe e aplica.
 */
import { render, $, go, esc, toast } from "../lib/dom.js";
import { TEMPLATE_PRESETS, getPreset } from "../templates/presets.js";
import { appState } from "../composition.js";
import { saveCustomization } from "../supabase/customization.js";

const ACCENT = "#F95901";

/** Gera um preview visual mockup do preset (simulação de loja). */
function generatePreviewHTML(presetId: string): string {
  const preset = getPreset(presetId);
  if (!preset) return "<p class='text-gray-400 text-center p-8'>Modelo não encontrado</p>";
  
  const c = preset.customization;
  const primary = c.colors?.primary ?? "#DF0B26";
  const text = c.colors?.text ?? "#111827";
  const headerPromo = c.header?.promo ?? "Frete grátis em compras acima de 15.000 Kz";
  const heroTitle = c.hero?.title ?? "A sua marca, o seu estilo";
  const heroSubtitle = c.hero?.subtitle ?? "Descubra a coleção perfeita para si.";
  const heroCtaLabel = c.hero?.ctaLabel ?? "Ver produtos";
  
  // Simula a loja em miniatura (scaled down)
  return `
    <div class="w-full h-full overflow-auto bg-white" style="font-size:10px;line-height:1.4">
      <!-- Header com promo -->
      <div class="text-white text-center py-1 px-2 font-medium" style="background:${primary};font-size:8px">${esc(headerPromo)}</div>
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div class="font-black" style="color:${primary};font-size:12px">A Sua Loja</div>
        <div class="flex gap-2 text-gray-400" style="font-size:10px">
          <span>🔍</span>
          <span>🛒</span>
        </div>
      </div>
      
      <!-- Hero -->
      <div class="bg-gray-100 px-4 py-6 text-center">
        <h1 class="font-black mb-1" style="color:${text};font-size:14px">${esc(heroTitle)}</h1>
        <p class="text-gray-600 mb-2" style="font-size:9px">${esc(heroSubtitle)}</p>
        <button class="text-white px-3 py-1 rounded-full font-bold" style="background:${primary};font-size:9px">${esc(heroCtaLabel)}</button>
      </div>
      
      <!-- Produtos em grelha (retrato 3:4) -->
      <div class="grid grid-cols-3 gap-2 p-3">
        ${[1, 2, 3, 4, 5, 6].map((i) => `
          <div class="bg-white border border-gray-200 rounded overflow-hidden">
            <div class="bg-gray-200 aspect-[3/4]"></div>
            <div class="p-1.5">
              <div class="font-semibold mb-0.5" style="color:${text};font-size:9px">Produto ${i}</div>
              <div class="font-bold" style="color:${primary};font-size:9px">12.500 Kz</div>
            </div>
          </div>
        `).join("")}
      </div>
      
      <!-- Testemunhos (cartões) -->
      <div class="bg-gray-50 px-3 py-4">
        <h2 class="font-black text-center mb-2" style="color:${text};font-size:11px">O que os nossos clientes dizem</h2>
        <div class="grid grid-cols-3 gap-2">
          ${["Ana Silva", "Carlos Mendes", "Maria João"].map((name) => `
            <div class="bg-white rounded p-2 text-center border border-gray-100">
              <div class="w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center text-white font-bold" style="background:${primary};font-size:8px">${name.split(" ").map(n => n[0]).join("")}</div>
              <div class="font-semibold mb-0.5" style="color:${text};font-size:8px">${esc(name)}</div>
              <div class="text-gray-500" style="font-size:7px">⭐⭐⭐⭐⭐</div>
            </div>
          `).join("")}
        </div>
      </div>
      
      <!-- Footer -->
      <div class="bg-gray-900 text-white px-3 py-3 text-center" style="font-size:8px">
        <div class="font-semibold mb-1">A Sua Loja</div>
        <div class="text-gray-400">© 2024 - Feito com MôBisno</div>
      </div>
    </div>
  `;
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
          <p class="text-gray-600 text-lg">Veja o preview visual e escolha o que mais combina com a sua marca.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8" id="presets-grid"></div>
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
          <div class="flex-1">
            <h3 class="text-xl font-bold text-gray-900">${esc(preset.name)}</h3>
            <p class="text-sm text-gray-500 mt-1">${esc(preset.description)}</p>
          </div>
        </div>
      </div>
      <div class="bg-gray-50 p-4">
        <!-- Preview desktop -->
        <div class="hidden md:block mb-4">
          <div class="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">computer</span>
            Desktop
          </div>
          <div class="aspect-[16/10] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-inner">
            <div data-preview-desktop="${esc(preset.id)}" class="w-full h-full"></div>
          </div>
        </div>
        
        <!-- Preview mobile -->
        <div class="mb-4">
          <div class="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">phone_iphone</span>
            Mobile
          </div>
          <div class="max-w-[375px] mx-auto">
            <div class="aspect-[9/16] bg-white border-2 border-gray-300 rounded-3xl overflow-hidden shadow-xl" style="box-shadow:0 0 0 12px #1f2937">
              <div data-preview-mobile="${esc(preset.id)}" class="w-full h-full"></div>
            </div>
          </div>
        </div>
        
        <button data-apply="${esc(preset.id)}" class="w-full px-6 py-3 rounded-full text-white font-bold text-base flex items-center justify-center gap-2 shadow-sm hover:opacity-95 transition-opacity" style="background:${ACCENT}">
          <span class="material-symbols-outlined text-[20px]">check</span> Usar este modelo
        </button>
      </div>`;
    grid.appendChild(card);

    // Renderiza os previews (desktop e mobile com o mesmo HTML).
    const desktopContainer = card.querySelector(`[data-preview-desktop="${preset.id}"]`) as HTMLElement;
    const mobileContainer = card.querySelector(`[data-preview-mobile="${preset.id}"]`) as HTMLElement;
    
    if (desktopContainer) desktopContainer.innerHTML = generatePreviewHTML(preset.id);
    if (mobileContainer) mobileContainer.innerHTML = generatePreviewHTML(preset.id);

    // Botão "Usar este modelo".
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
