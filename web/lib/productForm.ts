/** Modal para criar/editar um Produto (com foto) — design MôBisno (branco + #F95901). */
import { esc, toast, fileToUint8Array, withBusy, withButton } from "./dom.js";
import { PRODUCT_POLICY } from "../../src/services/fileService.js";
import type { AdminPanel } from "../../src/app/adminPanel.js";
import type { Product } from "../../src/models/index.js";

const ACCENT = "#F95901";

interface ProductFormOptions {
  panel: AdminPanel;
  ownerId: string;
  storeId: string;
  product?: Product | null;
  /** Categorias já existentes na loja (para sugestão/seleção rápida). */
  categories?: string[];
  onDone: () => void | Promise<void>;
}

export function openProductForm(opts: ProductFormOptions): void {
  const { panel, ownerId, storeId, product, onDone } = opts;
  const categories = opts.categories ?? [];
  const isEdit = !!product;
  let imageUrl: string | undefined = product?.imageUrl;

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
        </div>

        <div data-errs></div>
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
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
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
    const input = { name, price, description, category, featured, physical, imageUrl, available: true };

    const res = await withButton(
      submitBtn,
      () => isEdit
        ? panel.controllers.products.edit(ownerId, storeId, product!.id, input)
        : panel.controllers.products.register(ownerId, storeId, input),
      "A guardar…",
    );

    if (res.status === "success") {
      toast(isEdit ? "Produto atualizado." : "Produto adicionado.");
      close();
      await onDone();
    } else {
      host.querySelector("[data-errs]")!.innerHTML =
        `<div class="bg-red-50 text-red-700 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm">${esc(res.message)}</div>`;
    }
  });
}
