/** Modal para criar/editar um Produto (com foto) — design MôBisno (branco + #F95901). */
import { esc, toast, fileToUint8Array, withBusy, withButton } from "./dom.js";
import { compressImageFile } from "./imageCompress.js";
import { PRODUCT_POLICY } from "../../src/services/fileService.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import type { AdminPanel } from "../../src/app/adminPanel.js";
import type { Product } from "../../src/models/index.js";
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

  /** Persiste as fotos extra do produto (na personalização), sem migração à BD. */
  async function persistGallery(productId: string): Promise<void> {
    if (opts.customization) {
      // Editor: escreve na personalização em memória (guardada com o "Guardar").
      const map = opts.customization.productImages ?? (opts.customization.productImages = {});
      if (gallery.length) map[productId] = [...gallery]; else delete map[productId];
      await opts.onImagesChange?.();
      return;
    }
    // Fora do editor: lê-modifica-grava a personalização atual da loja.
    const current = await getCustomization(storeId);
    const map = current.productImages ?? (current.productImages = {});
    if (gallery.length) map[productId] = [...gallery]; else delete map[productId];
    await saveCustomization(ownerId, storeId, current);
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
      // Persiste as fotos extra (galeria) associadas a este produto.
      try { await persistGallery(res.product.id); } catch { /* não bloquear o save do produto */ }
      toast(isEdit ? "Produto atualizado." : "Produto adicionado.");
      close();
      await onDone();
    } else {
      host.querySelector("[data-errs]")!.innerHTML =
        `<div class="bg-red-50 text-red-700 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm">${esc(res.message)}</div>`;
    }
  });
}
