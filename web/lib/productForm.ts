/** Modal para criar/editar um Produto (com foto) — design MôBisno (branco + #F95901). */
import { esc, toast, fileToUint8Array, withBusy, withButton } from "./dom.js";
import { compressImageFile } from "./imageCompress.js";
import { PRODUCT_POLICY } from "../../src/services/fileService.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { syncCombinations, variantLabelOf } from "../../src/services/variations.js";
import type { AdminPanel } from "../../src/app/adminPanel.js";
import type { Product } from "../../src/models/index.js";
import type {
  ProductCombination,
  ProductVariationAxis,
  ProductVariations,
  VariationPriceMode,
} from "../../src/models/domain.js";
import type { StoreCustomization } from "../templates/types.js";

const ACCENT = "#F95901";

interface ProductFormOptions {
  panel: AdminPanel;
  ownerId: string;
  storeId: string;
  product?: Product | null;
  /** Categorias já existentes na loja (para sugestão/seleção rápida). */
  categories?: string[];
  /**
   * Personalização em memória (editor). Se fornecida, as fotos extra são
   * escritas nela e persistidas com o "Guardar" do editor (evita conflitos).
   * Se ausente, o formulário grava as fotos extra diretamente na BD.
   */
  customization?: StoreCustomization;
  /** Chamado após alterar as fotos extra (ex.: rebuild do editor). */
  onImagesChange?: () => void | Promise<void>;
  onDone: () => void | Promise<void>;
}

export function openProductForm(opts: ProductFormOptions): void {
  const { panel, ownerId, storeId, product, onDone } = opts;
  const categories = opts.categories ?? [];
  const isEdit = !!product;
  let imageUrl: string | undefined = product?.imageUrl;
  // Fotos extra (galeria) — geridas em memória e persistidas ao guardar.
  let gallery: string[] = product && opts.customization?.productImages?.[product.id]
    ? [...opts.customization.productImages[product.id]!]
    : [];

  /* ---------------------------- Variação (R4.1 a R4.5, R4.19, R4.20) ----------------------------
   * As Variação vivem na Personalização (`customization.productVariations[productId]`), por
   * decisão D1, e não no Produto — o Produto novo só tem `id` depois de ser criado, por isso a
   * gravação acontece **depois** do `register`/`edit`, como já acontecia com as fotos extra.
   *
   * `axes` é o **rascunho** do Dono: pode conter um eixo recém-acrescentado, ainda sem nome e sem
   * valores. `syncCombinations` descarta esses eixos incompletos, por isso a lista de Combinação
   * (e os eixos que a indexam, `syncedAxes`) é sempre o que ela devolve, nunca uma lista montada à
   * mão. É essa a peça que, ao remover um valor, deixa cair as Combinação que o usavam e preserva
   * o preço e o stock das restantes (R4.20).
   */
  const storedVariations = product && opts.customization?.productVariations
    ? opts.customization.productVariations[product.id]
    : undefined;
  let varOn = false;
  let priceMode: VariationPriceMode = "substitui";
  let axes: ProductVariationAxis[] = [];
  /** Combinação alinhadas com `syncedAxes`. Só `syncCombinations` escreve aqui. */
  let combinations: ProductCombination[] = [];
  /** Eixos utilizáveis (com nome e ≥ 1 valor), na ordem que indexa `combinations.values`. */
  let syncedAxes: ProductVariationAxis[] = [];

  /** Realinha as Combinação com os eixos. Chamada sempre que os eixos mudam. */
  function resyncVariations(): void {
    const synced = syncCombinations({ enabled: true, priceMode, axes, combinations });
    syncedAxes = synced.axes;
    combinations = synced.combinations;
  }

  /** Carrega o rascunho a partir de uma entrada gravada, de forma desconhecida. */
  function loadVariations(raw: unknown): void {
    const synced = syncCombinations(raw as ProductVariations);
    varOn = synced.enabled && synced.axes.length > 0;
    priceMode = synced.priceMode;
    // O rascunho é uma cópia: editá-lo não mexe nos eixos que indexam as Combinação.
    axes = synced.axes.map((axis) => ({ name: axis.name, values: [...axis.values] }));
    combinations = synced.combinations;
    syncedAxes = synced.axes;
  }
  loadVariations(storedVariations);

  const input = "w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] text-gray-900 outline-none transition-colors focus:border-[#F95901]";
  const label = "text-sm font-semibold text-gray-700";
  const physicalOn = product ? product.physical !== false : true;

  const host = document.createElement("div");
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 animate-entrance";
  host.innerHTML = `
    <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <h3 class="text-lg font-black text-gray-900">${isEdit ? "Editar produto" : "Adicionar produto"}</h3>
        <button data-close class="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form data-form class="p-6 flex flex-col gap-5 overflow-y-auto">
        <div class="flex gap-4">
          <div data-photo class="w-28 h-28 shrink-0 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-[#F95901] hover:bg-orange-50/40 transition-colors">
            ${imageUrl ? `<img src="${esc(imageUrl)}" class="w-full h-full object-cover" />` : `<span class="material-symbols-outlined text-gray-400 text-3xl">add_a_photo</span>`}
          </div>
          <input data-photo-input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
          <div class="flex-1 flex flex-col gap-3 min-w-0">
            <label class="flex flex-col gap-1.5">
              <span class="${label}">Nome *</span>
              <input data-name value="${esc(product?.name ?? "")}" class="${input}" placeholder="Ex: Camisola oficial" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="${label}">Preço (Kz) *</span>
              <input data-price type="number" step="0.01" value="${product ? esc(product.price) : ""}" class="${input}" placeholder="0,00" />
            </label>
          </div>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="${label}">Categoria</span>
          <input data-category list="mb-cat-list" value="${esc(product?.category ?? "")}" class="${input}" placeholder="Escolha ou escreva uma nova (ex: Camisolas)" />
          <datalist id="mb-cat-list">${categories.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
          ${categories.length ? `<div class="flex flex-wrap gap-1.5 mt-1">${categories.map((c) => `<button type="button" data-cat-chip="${esc(c)}" class="text-xs border border-gray-200 rounded-full px-2.5 py-1 text-gray-600 hover:bg-gray-50 transition-colors">${esc(c)}</button>`).join("")}</div>` : ""}
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="${label}">Descrição</span>
          <textarea data-desc rows="3" class="${input} resize-none" placeholder="Detalhes do produto (opcional)">${esc(product?.description ?? "")}</textarea>
        </label>

        <div class="flex flex-col gap-2">
          <span class="${label}">Mais fotos <span class="text-gray-400 font-normal">(galeria do produto)</span></span>
          <div data-gallery class="flex flex-wrap gap-2"></div>
          <input data-gallery-input type="file" accept="image/png,image/jpeg,image/webp" multiple class="hidden" />
        </div>

        <div class="rounded-2xl border border-gray-100 divide-y divide-gray-100">
          <label class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
            <span class="flex items-center gap-2 text-sm font-medium text-gray-800"><span class="material-symbols-outlined text-[20px]" style="color:${ACCENT}">star</span> Destacar na loja</span>
            <span class="relative inline-flex items-center">
              <input data-featured type="checkbox" ${product?.featured ? "checked" : ""} class="peer sr-only" />
              <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
            </span>
          </label>
          <label class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
            <span class="flex items-center gap-2 text-sm font-medium text-gray-800"><span class="material-symbols-outlined text-[20px]" style="color:${ACCENT}">local_shipping</span> Produto físico <span class="text-gray-400 font-normal">(precisa de entrega)</span></span>
            <span class="relative inline-flex items-center">
              <input data-physical type="checkbox" ${physicalOn ? "checked" : ""} class="peer sr-only" />
              <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
            </span>
          </label>
          <label class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
            <span class="flex items-center gap-2 text-sm font-medium text-gray-800"><span class="material-symbols-outlined text-[20px]" style="color:${ACCENT}">inventory</span> Controlar stock <span class="text-gray-400 font-normal">(esgota sozinho)</span></span>
            <span class="relative inline-flex items-center">
              <input data-stock-on type="checkbox" ${product && product.stock != null ? "checked" : ""} class="peer sr-only" />
              <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
            </span>
          </label>
          <label data-stock-wrap class="flex items-center justify-between gap-3 px-4 pb-3 ${product && product.stock != null ? "" : "hidden"}">
            <span class="text-sm font-medium text-gray-700">Quantidade em stock</span>
            <input data-stock type="number" min="0" step="1" value="${product && product.stock != null ? esc(product.stock) : ""}" class="w-28 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-[#F95901]" placeholder="0" />
          </label>
        </div>

        <div class="rounded-2xl border border-gray-100">
          <label class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
            <span class="flex items-center gap-2 text-sm font-medium text-gray-800"><span class="material-symbols-outlined text-[20px]" style="color:${ACCENT}">tune</span> Ativar variações <span class="text-gray-400 font-normal">(ex.: cor, tamanho)</span></span>
            <span class="relative inline-flex items-center">
              <input data-var-on type="checkbox" ${varOn ? "checked" : ""} class="peer sr-only" />
              <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
            </span>
          </label>
          <div data-var-body class="${varOn ? "" : "hidden"} border-t border-gray-100 px-4 py-4 flex flex-col gap-4"></div>
        </div>
        <div data-errs class="empty:hidden"></div>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" data-close class="px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors">Cancelar</button>
          <button type="submit" class="px-6 py-2.5 rounded-xl text-white font-bold text-sm flex items-center gap-1 transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">check</span> Guardar</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(host);

  const close = (): void => host.remove();
  host.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  host.addEventListener("click", (e) => { if (e.target === host) close(); });

  const photoBox = host.querySelector<HTMLElement>("[data-photo]")!;
  const photoInput = host.querySelector<HTMLInputElement>("[data-photo-input]")!;
  const catInput = host.querySelector<HTMLInputElement>("[data-category]")!;
  host.querySelectorAll<HTMLElement>("[data-cat-chip]").forEach((chip) =>
    chip.addEventListener("click", () => { catInput.value = chip.dataset.catChip ?? ""; }));

  photoBox.addEventListener("click", () => photoInput.click());
  // Mostra/esconde o campo de quantidade conforme o toggle de stock.
  const stockOn = host.querySelector<HTMLInputElement>("[data-stock-on]")!;
  const stockWrap = host.querySelector<HTMLElement>("[data-stock-wrap]")!;
  stockOn.addEventListener("change", () => {
    stockWrap.classList.toggle("hidden", !stockOn.checked);
    if (stockOn.checked) (host.querySelector<HTMLInputElement>("[data-stock]"))?.focus();
  });
  photoInput.addEventListener("change", async () => {
    const raw = photoInput.files?.[0];
    if (!raw) return;
    const file = await compressImageFile(raw);
    const content = await fileToUint8Array(file);
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, PRODUCT_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(storeId, "product", validation.value),
      "A carregar foto…",
    );
    imageUrl = stored.url;
    photoBox.innerHTML = `<img src="${esc(imageUrl)}" class="w-full h-full object-cover" />`;
  });

  // Galeria de fotos extra (upload múltiplo + remover).
  const galleryBox = host.querySelector<HTMLElement>("[data-gallery]")!;
  const galleryInput = host.querySelector<HTMLInputElement>("[data-gallery-input]")!;
  function drawGallery(): void {
    const thumbs = gallery.map((url, i) =>
      `<div class="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 group">
        <img src="${esc(url)}" class="w-full h-full object-cover" />
        <button type="button" data-rm-img="${i}" class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 shadow flex items-center justify-center text-red-600 hover:bg-white"><span class="material-symbols-outlined text-[14px]">close</span></button>
      </div>`).join("");
    const add = `<button type="button" data-add-img class="w-16 h-16 shrink-0 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 hover:border-[#F95901] hover:bg-orange-50/40 transition-colors"><span class="material-symbols-outlined">add_photo_alternate</span></button>`;
    galleryBox.innerHTML = thumbs + add;
    galleryBox.querySelector("[data-add-img]")!.addEventListener("click", () => galleryInput.click());
    galleryBox.querySelectorAll<HTMLElement>("[data-rm-img]").forEach((b) =>
      b.addEventListener("click", () => { gallery.splice(Number(b.dataset.rmImg), 1); drawGallery(); }));
  }
  drawGallery();
  galleryInput.addEventListener("change", async () => {
    const files = Array.from(galleryInput.files ?? []);
    galleryInput.value = "";
    for (const raw of files) {
      const file = await compressImageFile(raw);
      const content = await fileToUint8Array(file);
      const validation = panel.services.fileService.validate({ content, fileName: file.name }, PRODUCT_POLICY);
      if (!validation.ok) { toast(validation.error.message, "error"); continue; }
      const stored = await withBusy(
        () => panel.services.fileService.store(storeId, "product", validation.value),
        "A carregar foto…",
      );
      gallery.push(stored.url);
      drawGallery();
    }
  });

  /* --------------------------------- Variação --------------------------------- */

  const varOnInput = host.querySelector<HTMLInputElement>("[data-var-on]")!;
  const varBody = host.querySelector<HTMLElement>("[data-var-body]")!;
  const smallInput = "w-full min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#F95901]";

  /** Lê um campo numérico opcional: vazio (ou inválido) = ausente, `0` = zero. */
  function readOptionalNumber(raw: string): number | undefined {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  function drawVariations(): void {
    varBody.classList.toggle("hidden", !varOn);
    if (!varOn) { varBody.innerHTML = ""; return; }
    resyncVariations();

    const modeHtml = `
      <div class="flex flex-col gap-2">
        <span class="${label}">Preço das combinações</span>
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="radio" name="mb-var-mode" data-var-mode="substitui" ${priceMode === "substitui" ? "checked" : ""} class="accent-[#F95901]" /> Substitui o preço base</label>
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="radio" name="mb-var-mode" data-var-mode="acresce" ${priceMode === "acresce" ? "checked" : ""} class="accent-[#F95901]" /> Acresce ao preço base</label>
      </div>`;

    const axesHtml = axes.map((axis, i) => {
      const chips = axis.values.map((value, j) =>
        `<span class="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full pl-2.5 pr-1 py-1 text-xs text-gray-700 max-w-full">
          <span class="truncate">${esc(value)}</span>
          <button type="button" data-rm-val="${i}:${j}" title="Remover valor" class="w-5 h-5 shrink-0 rounded-full hover:bg-white text-gray-500 hover:text-red-600 flex items-center justify-center"><span class="material-symbols-outlined text-[13px]">close</span></button>
        </span>`).join("");
      return `
        <div class="rounded-xl border border-gray-200 p-3 flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input data-axis-name="${i}" value="${esc(axis.name)}" placeholder="Nome da variação (ex.: Cor)" class="${smallInput} font-semibold" />
            <button type="button" data-rm-axis="${i}" title="Remover variação" class="w-9 h-9 shrink-0 rounded-xl text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
          ${chips ? `<div class="flex flex-wrap gap-1.5">${chips}</div>` : `<p class="text-[11px] text-gray-400">Sem valores. Acrescente pelo menos um.</p>`}
          <div class="flex gap-2">
            <input data-val-input="${i}" placeholder="Novo valor (ex.: Azul)" class="${smallInput}" />
            <button type="button" data-add-val="${i}" class="shrink-0 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Juntar</button>
          </div>
        </div>`;
    }).join("");

    const pricePlaceholder = priceMode === "acresce" ? "+ 0" : "Preço base";
    const combsHtml = combinations.length
      ? combinations.map((comb, i) => `
        <div class="rounded-xl border border-gray-100 bg-gray-50/60 p-3 flex flex-col gap-2">
          <span class="text-[13px] font-semibold text-gray-800 break-words">${esc(variantLabelOf(syncedAxes, comb.values))}</span>
          <div class="flex gap-2">
            <label class="flex-1 min-w-0 flex flex-col gap-1">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preço (Kz)</span>
              <input data-comb-price="${i}" type="number" step="0.01" value="${comb.price == null ? "" : esc(comb.price)}" placeholder="${esc(pricePlaceholder)}" class="${smallInput} text-right" />
            </label>
            <label class="flex-1 min-w-0 flex flex-col gap-1">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Stock</span>
              <input data-comb-stock="${i}" type="number" min="0" step="1" value="${comb.stock == null ? "" : esc(comb.stock)}" placeholder="Sem controlo" class="${smallInput} text-right" />
            </label>
          </div>
        </div>`).join("")
      : `<p class="text-xs text-gray-500">Dê um nome à variação e junte valores para ver as combinações.</p>`;

    varBody.innerHTML = `
      ${modeHtml}
      <div class="flex flex-col gap-2">
        <span class="${label}">Variações</span>
        ${axesHtml}
        <button type="button" data-add-axis class="self-start inline-flex items-center gap-1 text-sm font-bold" style="color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add</span> Adicionar variação</button>
      </div>
      <div class="flex flex-col gap-2">
        <span class="${label}">Combinações <span class="text-gray-400 font-normal">(${combinations.length})</span></span>
        <p class="text-[11px] text-gray-500 leading-snug">Preço vazio usa o preço base. Stock vazio não é controlado; <strong>0</strong> marca a combinação como esgotada.</p>
        ${combsHtml}
      </div>`;

    // Nome do eixo: o rascunho acompanha cada tecla, mas só realinhamos ao sair do campo —
    // redesenhar a cada tecla tirava o foco ao Dono a meio da escrita.
    varBody.querySelectorAll<HTMLInputElement>("[data-axis-name]").forEach((el) => {
      const i = Number(el.dataset.axisName);
      el.addEventListener("input", () => { const axis = axes[i]; if (axis) axis.name = el.value; });
      el.addEventListener("change", () => { drawVariations(); });
    });
    varBody.querySelectorAll<HTMLElement>("[data-rm-axis]").forEach((el) =>
      el.addEventListener("click", () => { axes.splice(Number(el.dataset.rmAxis), 1); drawVariations(); }));
    varBody.querySelector("[data-add-axis]")?.addEventListener("click", () => {
      axes.push({ name: "", values: [] });
      drawVariations();
      varBody.querySelector<HTMLInputElement>(`[data-axis-name="${axes.length - 1}"]`)?.focus();
    });

    const addValue = (i: number): void => {
      const field = varBody.querySelector<HTMLInputElement>(`[data-val-input="${i}"]`);
      const axis = axes[i];
      if (!field || !axis) return;
      const value = field.value.trim();
      if (value === "") return;
      if (axis.values.includes(value)) { toast("Esse valor já existe nesta variação.", "error"); return; }
      axis.values.push(value);
      drawVariations();
      varBody.querySelector<HTMLInputElement>(`[data-val-input="${i}"]`)?.focus();
    };
    varBody.querySelectorAll<HTMLElement>("[data-add-val]").forEach((el) =>
      el.addEventListener("click", () => addValue(Number(el.dataset.addVal))));
    varBody.querySelectorAll<HTMLInputElement>("[data-val-input]").forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault(); // senão o Enter submetia o formulário do Produto
        addValue(Number(el.dataset.valInput));
      }));
    varBody.querySelectorAll<HTMLElement>("[data-rm-val]").forEach((el) =>
      el.addEventListener("click", () => {
        const [i, j] = (el.dataset.rmVal ?? "").split(":").map(Number);
        // `syncCombinations` (em drawVariations) descarta as Combinação que usavam este valor e
        // preserva o preço e o stock das restantes — R4.20.
        axes[i!]?.values.splice(j!, 1);
        drawVariations();
      }));

    varBody.querySelectorAll<HTMLInputElement>("[data-var-mode]").forEach((el) =>
      el.addEventListener("change", () => {
        if (!el.checked) return;
        priceMode = el.dataset.varMode === "acresce" ? "acresce" : "substitui";
        drawVariations();
      }));

    varBody.querySelectorAll<HTMLInputElement>("[data-comb-price]").forEach((el) =>
      el.addEventListener("input", () => {
        const comb = combinations[Number(el.dataset.combPrice)];
        if (!comb) return;
        const value = readOptionalNumber(el.value);
        if (value === undefined) delete comb.price; else comb.price = value;
      }));
    varBody.querySelectorAll<HTMLInputElement>("[data-comb-stock]").forEach((el) =>
      el.addEventListener("input", () => {
        const comb = combinations[Number(el.dataset.combStock)];
        if (!comb) return;
        const value = readOptionalNumber(el.value);
        // Vazio = stock não controlado; `0` = esgotado. Os dois estados são distintos.
        if (value === undefined) delete comb.stock; else comb.stock = Math.max(0, Math.floor(value));
      }));
  }
  drawVariations();
  varOnInput.addEventListener("change", () => { varOn = varOnInput.checked; drawVariations(); });

  /**
   * Fora do editor não há Personalização em memória: as fotos extra e as Variação já gravadas são
   * lidas da Loja e o formulário é redesenhado quando chegam. Sem este pré-carregamento, o
   * "Guardar" do Painel apagava `productImages[id]` e `productVariations[id]` definidos no editor,
   * porque `applyProductExtras` remove a entrada quando o formulário está vazio.
   *
   * A gravação espera por esta promessa (ver `persistProductExtras`): guardar antes de ela resolver
   * voltaria a apagar os dados.
   */
  let extrasPreload: Promise<void> | null = null;
  if (!opts.customization && product) {
    extrasPreload = (async () => {
      try {
        const current = await getCustomization(storeId);
        const storedGallery = current.productImages?.[product.id];
        if (storedGallery?.length) { gallery = [...storedGallery]; drawGallery(); }
        const raw = current.productVariations?.[product.id];
        if (!raw) return;
        loadVariations(raw);
        varOnInput.checked = varOn;
        drawVariations();
      } catch { /* sem fotos extra nem Variação: o Produto segue o comportamento atual */ }
    })();
    void extrasPreload;
  }

  /** Entrada a gravar em `productVariations`, ou `null` para não gravar nada (R4.16). */
  function variationsToSave(): ProductVariations | null {
    if (!varOn) return null;
    const synced = syncCombinations({ enabled: true, priceMode, axes, combinations });
    return synced.axes.length > 0 ? synced : null;
  }

  /** Escreve fotos extra e Variação do Produto numa Personalização. */
  function applyProductExtras(custom: StoreCustomization, productId: string): void {
    const images = custom.productImages ?? (custom.productImages = {});
    if (gallery.length) images[productId] = [...gallery]; else delete images[productId];
    const variations = variationsToSave();
    if (variations) {
      const map = custom.productVariations ?? (custom.productVariations = {});
      map[productId] = variations;
    } else if (custom.productVariations) {
      delete custom.productVariations[productId];
      // Sem nenhum Produto com Variação, não fica sequer o mapa vazio na Personalização.
      if (Object.keys(custom.productVariations).length === 0) delete custom.productVariations;
    }
  }

  /**
   * Persiste as fotos extra e as Variação do produto (na personalização), sem migração à BD.
   *
   * Um Produto novo só tem `id` depois de criado, por isso isto corre **depois** do
   * `register`/`edit`, com o `id` devolvido — uma só leitura-modificação-gravação para os dois
   * conjuntos de dados, para a segunda escrita não apagar a primeira.
   */
  async function persistProductExtras(productId: string): Promise<boolean> {
    if (opts.customization) {
      // Editor: escreve na personalização em memória (guardada com o "Guardar").
      applyProductExtras(opts.customization, productId);
      await opts.onImagesChange?.();
      return true;
    }
    // Fora do editor: lê-modifica-grava a personalização atual da loja.
    if (extrasPreload) await extrasPreload;
    const current = await getCustomization(storeId);
    applyProductExtras(current, productId);
    return await saveCustomization(ownerId, storeId, current);
  }

  host.querySelector<HTMLFormElement>("[data-form]")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    const name = host.querySelector<HTMLInputElement>("[data-name]")!.value;
    const priceRaw = host.querySelector<HTMLInputElement>("[data-price]")!.value;
    const description = host.querySelector<HTMLTextAreaElement>("[data-desc]")!.value;
    const category = host.querySelector<HTMLInputElement>("[data-category]")!.value;
    const featured = host.querySelector<HTMLInputElement>("[data-featured]")!.checked;
    const physical = host.querySelector<HTMLInputElement>("[data-physical]")!.checked;
    const price = priceRaw === "" ? Number.NaN : Number(priceRaw);
    const trackStock = host.querySelector<HTMLInputElement>("[data-stock-on]")!.checked;
    const stockRaw = host.querySelector<HTMLInputElement>("[data-stock]")?.value ?? "";
    const stock = trackStock ? Math.max(0, Math.floor(Number(stockRaw) || 0)) : null;
    const input = { name, price, description, category, featured, physical, imageUrl, available: true, stock };

    const res = await withButton(
      submitBtn,
      () => isEdit
        ? panel.controllers.products.edit(ownerId, storeId, product!.id, input)
        : panel.controllers.products.register(ownerId, storeId, input),
      "A guardar…",
    );

    if (res.status === "success") {
      // Persiste as fotos extra (galeria) e as Variação associadas a este produto.
      let extrasOk = true;
      try { extrasOk = await persistProductExtras(res.product.id); } catch { extrasOk = false; }
      if (extrasOk) toast(isEdit ? "Produto atualizado." : "Produto adicionado.");
      else toast("Produto guardado, mas as fotos extra e as variações não ficaram gravadas.", "error");
      close();
      await onDone();
    } else {
      host.querySelector("[data-errs]")!.innerHTML =
        `<div class="bg-red-50 text-red-700 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm">${esc(res.message)}</div>`;
    }
  });
}
