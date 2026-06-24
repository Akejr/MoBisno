/** Modal partilhado para criar/editar um Produto (com foto). */
import { esc, toast, fileToUint8Array, withBusy, withButton } from "./dom.js";
import { PRODUCT_POLICY } from "../../src/services/fileService.js";
import type { AdminPanel } from "../../src/app/adminPanel.js";
import type { Product } from "../../src/models/index.js";

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

  const host = document.createElement("div");
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 animate-entrance";
  host.innerHTML = `
    <div class="bg-surface w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
        <h3 class="text-headline-md font-bold text-on-surface">${isEdit ? "Editar produto" : "Adicionar produto"}</h3>
        <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form data-form class="p-6 flex flex-col gap-4">
        <div class="flex gap-4">
          <div data-photo class="w-28 h-28 shrink-0 rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low flex items-center justify-center overflow-hidden cursor-pointer hover:bg-surface-container-high transition-colors">
            ${imageUrl ? `<img src="${esc(imageUrl)}" class="w-full h-full object-cover" />` : `<span class="material-symbols-outlined text-on-surface-variant text-3xl">add_a_photo</span>`}
          </div>
          <input data-photo-input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
          <div class="flex-1 flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-label-sm text-on-surface-variant">Nome *</label>
              <input data-name value="${esc(product?.name ?? "")}" class="bg-surface border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary" placeholder="Ex: Camisola oficial" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-label-sm text-on-surface-variant">Preço (Kz) *</label>
              <input data-price type="number" step="0.01" value="${product ? esc(product.price) : ""}" class="bg-surface border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary" placeholder="0,00" />
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-label-sm text-on-surface-variant">Categoria</label>
          <input data-category list="mb-cat-list" value="${esc(product?.category ?? "")}" class="bg-surface border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary" placeholder="Escolha ou escreva uma nova (ex: Camisolas)" />
          <datalist id="mb-cat-list">${categories.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
          ${categories.length ? `<div class="flex flex-wrap gap-1.5 mt-1">${categories.map((c) => `<button type="button" data-cat-chip="${esc(c)}" class="text-label-sm border border-outline-variant rounded-full px-2.5 py-0.5 text-on-surface-variant hover:bg-surface-container-high transition-colors">${esc(c)}</button>`).join("")}</div>` : ""}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-label-sm text-on-surface-variant">Descrição</label>
          <textarea data-desc rows="3" class="bg-surface border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none" placeholder="Detalhes do produto (opcional)">${esc(product?.description ?? "")}</textarea>
        </div>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input data-featured type="checkbox" ${product?.featured ? "checked" : ""} class="w-4 h-4 accent-primary" />
          <span class="text-label-md text-on-surface flex items-center gap-1"><span class="material-symbols-outlined text-[18px] text-primary">star</span> Destacar na loja (categoria "Destaques")</span>
        </label>
        <div data-errs></div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close class="px-4 py-2 rounded-full text-on-surface-variant hover:bg-surface-container-high text-label-md">Cancelar</button>
          <button type="submit" class="px-6 py-2 rounded-full bg-primary text-on-primary font-bold text-label-md flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">check</span> Guardar</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(host);

  const close = () => host.remove();
  host.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  host.addEventListener("click", (e) => { if (e.target === host) close(); });

  const photoBox = host.querySelector<HTMLElement>("[data-photo]")!;
  const photoInput = host.querySelector<HTMLInputElement>("[data-photo-input]")!;

  // Atalhos de categoria (clicar preenche o campo).
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
    const price = priceRaw === "" ? Number.NaN : Number(priceRaw);
    const input = { name, price, description, category, featured, imageUrl, available: true };

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
        `<div class="bg-error-container text-on-error-container rounded-lg px-3 py-2 text-label-sm">${esc(res.message)}</div>`;
    }
  });
}
