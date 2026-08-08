/** Modal para criar/editar um Produto (com foto) — design MôBisno (branco + #F95901). */
import { esc, toast, fileToUint8Array, formatKz, withBusy, withButton } from "./dom.js";
import { compressImageFile } from "./imageCompress.js";
import { PRODUCT_POLICY } from "../../src/services/fileService.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { syncCombinations } from "../../src/services/variations.js";
import type { AdminPanel } from "../../src/app/adminPanel.js";
import type { Product } from "../../src/models/index.js";
import type {
  ProductCombination,
  ProductVariationAxis,
  ProductVariations,
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

  /** Nome do grupo por omissão, quando o Dono não escreve nenhum. */
  const DEFAULT_GROUP = "Opção";

  /**
   * Uma variação, como o Dono a vê: nome, preço, foto e stock.
   *
   * Isto é **um valor de um eixo** mais a Combinação que lhe corresponde, juntos
   * numa só linha. A serialização continua a ser a de sempre (um eixo com
   * valores + uma Combinação por valor), mas o formulário deixou de a expor: com
   * um só grupo há exactamente uma Combinação por valor, e pedir ao Dono que
   * pense em «eixos» e «combinações» era pedir-lhe o vocabulário da base de
   * dados.
   *
   * `price` ausente = **preço original** do Produto (é o que a caixa marca).
   * `stock` ausente = não controlado; `0` = esgotado (Requisitos 4.11, 4.12).
   */
  interface VariationItem {
    name: string;
    price?: number;
    stock?: number;
    image?: string;
  }

  let varOn = false;
  let groupName = "";
  let items: VariationItem[] = [];
  /**
   * Grupos que a Personalização tinha para além do primeiro.
   *
   * O formulário edita **um** grupo. Uma Loja gravada com dois (por exemplo Cor +
   * Tamanho, do editor anterior) mantém os dados em base de dados, mas guardar
   * aqui deixa-a com um só — por isso o formulário avisa antes, em vez de deixar
   * o Dono descobrir depois.
   */
  let droppedGroups = 0;

  /**
   * Carrega o rascunho a partir de uma entrada gravada, de forma desconhecida.
   *
   * O preço é normalizado para **absoluto**. A serialização tem um `priceMode`
   * («substitui» ou «acresce») que o formulário já não pergunta: um preço por
   * variação é o preço, e o modo «acresce» obrigava o Dono a pensar em somas. O
   * que estiver gravado como acréscimo é convertido aqui uma vez — `+2000` sobre
   * um Produto de `10000` passa a `12000` — para o número que ele lê ser o que o
   * Cliente paga, e para gravar de volta em «substitui» não mudar preço nenhum.
   */
  function loadVariations(raw: unknown): void {
    const synced = syncCombinations(raw as ProductVariations);
    varOn = synced.enabled && synced.axes.length > 0;
    droppedGroups = Math.max(0, synced.axes.length - 1);
    const axis = synced.axes[0];
    groupName = axis?.name ?? "";
    const base = Number(product?.price ?? 0);
    items = (axis?.values ?? []).map((value) => {
      const comb = synced.combinations.find((c) => c.values[0] === value);
      const item: VariationItem = { name: value };
      if (comb?.price !== undefined) {
        const absolute = synced.priceMode === "acresce" ? base + comb.price : comb.price;
        item.price = Math.max(0, absolute);
      }
      if (comb?.stock !== undefined) item.stock = comb.stock;
      if (comb?.image !== undefined) item.image = comb.image;
      return item;
    });
  }
  loadVariations(storedVariations);

  const input = "w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] text-gray-900 outline-none transition-colors focus:border-[#F95901]";
  const label = "text-sm font-semibold text-gray-700";
  const physicalOn = product ? product.physical !== false : true;

  const host = document.createElement("div");
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 animate-entrance";
  host.innerHTML = `
    <!--
      Largura de quatro colunas e conteudo em duas: o formulario cabia numa
      coluna estreita e obrigava a percorrer tudo de cima a baixo para chegar as
      variacoes. Em ecra grande as duas colunas mostram o produto e as variacoes
      ao mesmo tempo; abaixo de lg volta a ser uma coluna, que e o unico arranjo
      que serve num telemovel. Sem acentos graves neste comentario: vive dentro
      de um template literal.
    -->
    <div class="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <h3 class="text-lg font-black text-gray-900">${isEdit ? "Editar produto" : "Adicionar produto"}</h3>
        <button data-close class="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form data-form class="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 items-start">
        <div class="flex flex-col gap-5 min-w-0">
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
        </div>

        <!--
          Variacoes, no mesmo ecra. Estavam num separador proprio: o Dono tinha de
          descobrir que existia um separador antes de sequer ver o que faziam. Sem
          acentos graves neste comentario: vive dentro de um template literal.
        -->
        <div class="flex flex-col gap-4 min-w-0 lg:border-l lg:border-gray-100 lg:pl-8">
          <span class="${label}">Variações</span>
          <div data-var-empty class="${varOn ? "hidden" : ""} flex flex-col items-center text-center gap-3 py-6 px-4">
            <span class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background:${ACCENT}1a"><span class="material-symbols-outlined text-[26px]" style="color:${ACCENT}">tune</span></span>
            <div>
              <p class="text-sm font-bold text-gray-900">Este produto tem versões diferentes?</p>
              <p class="text-[13px] text-gray-500 leading-snug mt-1 max-w-xs">Cada versão pode ter o seu preço, a sua foto e o seu stock — por exemplo, uma cor ou um tamanho.</p>
            </div>
            <button type="button" data-var-start class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-95" style="background:${ACCENT}">
              <span class="material-symbols-outlined text-[18px]">add</span> Adicionar variação
            </button>
          </div>
          <label data-var-head class="${varOn ? "flex" : "hidden"} items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 cursor-pointer select-none">
            <span class="flex items-center gap-2 text-sm font-medium text-gray-800"><span class="material-symbols-outlined text-[20px]" style="color:${ACCENT}">tune</span> Variações ativas</span>
            <span class="relative inline-flex items-center">
              <input data-var-on type="checkbox" ${varOn ? "checked" : ""} class="peer sr-only" />
              <span class="w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-[#F95901] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></span>
            </span>
          </label>
          <div data-var-body class="${varOn ? "flex" : "hidden"} flex-col gap-3"></div>
          <input data-var-image-input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
        </div>

        <div class="flex flex-col gap-4 min-w-0 lg:col-span-2 border-t border-gray-100 pt-5">
        <span class="${label}">Opções</span>
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

        </div>

        <div data-errs class="empty:hidden lg:col-span-2"></div>
        <div class="flex justify-end gap-2 pt-1 lg:col-span-2">
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
    // As variações têm um campo de stock por linha: ele só faz sentido enquanto
    // este interruptor estiver ligado, por isso a lista é redesenhada.
    if (varOn) drawVariations();
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
  const varEmpty = host.querySelector<HTMLElement>("[data-var-empty]")!;
  const varHead = host.querySelector<HTMLElement>("[data-var-head]")!;
  const varImageInput = host.querySelector<HTMLInputElement>("[data-var-image-input]")!;

  const smallInput = "w-full min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#F95901]";

  /** Lê um campo numérico opcional: vazio (ou inválido) = ausente, `0` = zero. */
  function readOptionalNumber(raw: string): number | undefined {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Preço escrito no campo do Produto, para a caixa «preço original» o mostrar. */
  function basePrice(): number {
    const n = Number(host.querySelector<HTMLInputElement>("[data-price]")?.value ?? "");
    return Number.isFinite(n) ? n : 0;
  }

  /** Acrescenta uma variação vazia e põe o cursor no nome dela. */
  function addItem(): void {
    items.push({ name: "" });
    drawVariations();
    varBody.querySelector<HTMLInputElement>(`[data-item-name="${items.length - 1}"]`)?.focus();
  }

  // Estado vazio → liga o interruptor e cria já a primeira variação, para o Dono
  // não ter de descobrir dois passos separados.
  host.querySelector<HTMLElement>("[data-var-start]")?.addEventListener("click", () => {
    varOn = true;
    varOnInput.checked = true;
    if (groupName.trim() === "") groupName = DEFAULT_GROUP;
    if (items.length === 0) items.push({ name: "" });
    drawVariations();
    varBody.querySelector<HTMLInputElement>('[data-item-name="0"]')?.focus();
  });

  /**
   * Linha à espera de uma fotografia.
   *
   * Um só `<input type="file">` serve todas as linhas — abrir um por variação
   * enchia o formulário de elementos escondidos —, por isso o índice da linha que
   * pediu a foto tem de ficar guardado entre o clique e o `change` do ficheiro.
   */
  let imageRow = -1;

  function drawVariations(): void {
    varBody.classList.toggle("hidden", !varOn);
    varBody.classList.toggle("flex", varOn);
    varEmpty.classList.toggle("hidden", varOn);
    varHead.classList.toggle("hidden", !varOn);
    varHead.classList.toggle("flex", varOn);
    if (!varOn) { varBody.innerHTML = ""; return; }

    const base = basePrice();
    /*
     * O stock por variação só existe se o Produto controlar stock.
     *
     * Com «Controlar stock» desligado, o Produto **nunca esgota** — e um campo de
     * stock por variação ali ao lado prometia um controlo que não ia acontecer:
     * o Dono escrevia `0` numa variação, ficava à espera que ela aparecesse
     * esgotada, e não aparecia. Desligado, os campos ficam inertes e explicados.
     */
    const stockOn = host.querySelector<HTMLInputElement>("[data-stock-on]")?.checked === true;
    // Aviso, e não correção silenciosa: a Personalização tinha mais do que um
    // grupo (o editor anterior permitia Cor + Tamanho) e este formulário edita um.
    // Guardar deixa a Loja com o primeiro; o Dono tem de o saber antes.
    const aviso = droppedGroups > 0
      ? `<div class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900 leading-snug">
          Este produto tinha <strong>${droppedGroups + 1} grupos</strong> de variações. Aqui edita-se um: ao guardar, fica só <strong>${esc(groupName || DEFAULT_GROUP)}</strong> e as combinações dos outros grupos são descartadas.
        </div>`
      : "";

    const rows = items.map((item, i) => {
      const usaBase = item.price === undefined;
      const thumb = item.image
        ? `<img src="${esc(item.image)}" class="w-full h-full object-cover" />`
        : `<span class="material-symbols-outlined text-gray-400 text-[22px]">add_a_photo</span>`;
      return `
        <div class="rounded-xl border border-gray-200 p-3">
          <div class="flex items-start gap-3">
            <div class="shrink-0 flex flex-col items-center gap-1">
              <button type="button" data-var-photo="${i}" title="Foto desta variação" class="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden hover:border-[#F95901] hover:bg-orange-50/40 transition-colors">${thumb}</button>
              ${item.image ? `<button type="button" data-rm-var-photo="${i}" class="text-[11px] text-gray-400 hover:text-red-600 transition-colors">remover</button>` : ""}
            </div>
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <input data-item-name="${i}" value="${esc(item.name)}" placeholder="Nome da variação (ex.: Azul)" class="${smallInput} font-semibold" />
                <button type="button" data-rm-item="${i}" title="Remover variação" class="w-9 h-9 shrink-0 rounded-xl text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label class="inline-flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" data-item-base="${i}" ${usaBase ? "checked" : ""} class="accent-[#F95901]" />
                  Preço original <span class="text-gray-400">(${esc(formatKz(base))})</span>
                </label>
                <input data-item-price="${i}" type="number" step="0.01" min="0" value="${item.price === undefined ? "" : esc(item.price)}" placeholder="Preço (Kz)" ${usaBase ? "disabled" : ""} class="${smallInput} w-32 text-right ${usaBase ? "opacity-50" : ""}" />
                <input data-item-stock="${i}" type="number" min="0" step="1" value="${item.stock === undefined ? "" : esc(item.stock)}" placeholder="Stock" ${stockOn ? "" : "disabled"} title="${stockOn ? "Stock desta variação" : "Ligue «Controlar stock» nas opções para controlar o stock por variação"}" class="${smallInput} w-28 text-right ${stockOn ? "" : "opacity-50 cursor-not-allowed"}" />
              </div>
            </div>
          </div>
        </div>`;
    }).join("");

    varBody.innerHTML = `
      ${aviso}
      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Nome do grupo</span>
        <input data-group-name value="${esc(groupName)}" placeholder="${esc(DEFAULT_GROUP)}" class="${smallInput}" />
      </label>
      ${rows || `<p class="text-xs text-gray-500">Acrescente a primeira variação.</p>`}
      <button type="button" data-add-item class="self-start inline-flex items-center gap-1 text-sm font-bold" style="color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add</span> Adicionar variação</button>
      <p class="text-[11px] text-gray-500 leading-snug">Com <strong>Preço original</strong> marcado, a variação custa o preço do produto. ${stockOn
        ? "Stock vazio não é controlado; <strong>0</strong> marca a variação como esgotada."
        : `Para dar stock a cada variação, ligue <strong>Controlar stock</strong> nas opções — sem isso o produto nunca esgota.`} A foto é opcional — quando existe, a loja troca a imagem ao escolher esta variação.</p>`;

    // O nome do grupo acompanha cada tecla sem redesenhar: redesenhar tirava o
    // foco ao Dono a meio da escrita.
    varBody.querySelector<HTMLInputElement>("[data-group-name]")?.addEventListener("input", (e) => {
      groupName = (e.target as HTMLInputElement).value;
    });
    varBody.querySelector("[data-add-item]")?.addEventListener("click", addItem);

    varBody.querySelectorAll<HTMLInputElement>("[data-item-name]").forEach((el) => {
      const i = Number(el.dataset.itemName);
      el.addEventListener("input", () => { const item = items[i]; if (item) item.name = el.value; });
    });
    varBody.querySelectorAll<HTMLElement>("[data-rm-item]").forEach((el) =>
      el.addEventListener("click", () => { items.splice(Number(el.dataset.rmItem), 1); drawVariations(); }));

    varBody.querySelectorAll<HTMLInputElement>("[data-item-base]").forEach((el) => {
      const i = Number(el.dataset.itemBase);
      el.addEventListener("change", () => {
        const item = items[i];
        if (!item) return;
        // Marcar «preço original» apaga o preço próprio: é a diferença entre «vale
        // o preço do produto» e «vale zero», e um preço esquecido no campo
        // desativado voltaria a valer no próximo desmarcar.
        if (el.checked) delete item.price;
        else item.price = item.price ?? basePrice();
        drawVariations();
      });
    });
    varBody.querySelectorAll<HTMLInputElement>("[data-item-price]").forEach((el) => {
      const i = Number(el.dataset.itemPrice);
      el.addEventListener("input", () => {
        const item = items[i];
        if (!item) return;
        const value = readOptionalNumber(el.value);
        if (value === undefined) delete item.price; else item.price = Math.max(0, value);
      });
    });
    varBody.querySelectorAll<HTMLInputElement>("[data-item-stock]").forEach((el) => {
      const i = Number(el.dataset.itemStock);
      el.addEventListener("input", () => {
        const item = items[i];
        if (!item) return;
        const value = readOptionalNumber(el.value);
        // Vazio = stock não controlado; `0` = esgotado. Os dois estados são distintos.
        if (value === undefined) delete item.stock; else item.stock = Math.max(0, Math.floor(value));
      });
    });

    varBody.querySelectorAll<HTMLElement>("[data-var-photo]").forEach((el) =>
      el.addEventListener("click", () => {
        imageRow = Number(el.dataset.varPhoto);
        varImageInput.value = "";
        varImageInput.click();
      }));
    varBody.querySelectorAll<HTMLElement>("[data-rm-var-photo]").forEach((el) =>
      el.addEventListener("click", () => {
        const item = items[Number(el.dataset.rmVarPhoto)];
        if (item) delete item.image;
        drawVariations();
      }));
  }

  varImageInput.addEventListener("change", async () => {
    const raw = varImageInput.files?.[0];
    const item = items[imageRow];
    if (!raw || !item) return;
    const file = await compressImageFile(raw);
    const content = await fileToUint8Array(file);
    const validation = panel.services.fileService.validate({ content, fileName: file.name }, PRODUCT_POLICY);
    if (!validation.ok) { toast(validation.error.message, "error"); return; }
    const stored = await withBusy(
      () => panel.services.fileService.store(storeId, "product", validation.value),
      "A carregar foto…",
    );
    item.image = stored.url;
    drawVariations();
  });

  // O rótulo «Preço original» mostra o preço do Produto: se o Dono o mudar, o
  // rótulo tem de acompanhar, senão fica a prometer um valor que já não existe.
  host.querySelector<HTMLInputElement>("[data-price]")?.addEventListener("change", () => {
    if (varOn) drawVariations();
  });
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

  /**
   * Entrada a gravar em `productVariations`, ou `null` para não gravar nada
   * (R4.16).
   *
   * A lista simples do formulário volta aqui à forma serializada: **um** eixo com
   * os nomes das variações, e uma Combinação por nome com o preço, o stock e a
   * foto. `syncCombinations` é quem monta a lista final — descarta nomes vazios,
   * ignora repetidos e alinha as Combinação com os valores que sobram.
   *
   * `priceMode` é sempre `"substitui"`: o preço de uma variação é o preço que o
   * Cliente paga. O modo «acresce» saiu do formulário, e o que estivesse gravado
   * assim já foi convertido para absoluto em `loadVariations`.
   */
  function variationsToSave(): ProductVariations | null {
    if (!varOn) return null;
    const controlaStock = host.querySelector<HTMLInputElement>("[data-stock-on]")?.checked === true;
    const values: string[] = [];
    const combinations: ProductCombination[] = [];
    for (const item of items) {
      const name = item.name.trim();
      if (name === "" || values.includes(name)) continue;
      values.push(name);
      const comb: ProductCombination = { values: [name] };
      if (item.price !== undefined) comb.price = item.price;
      // Stock só é gravado se o Produto controlar stock. Sem isso ficaria um `0`
      // esquecido a marcar a variação como esgotada numa loja onde nada esgota.
      if (controlaStock && item.stock !== undefined) comb.stock = item.stock;
      if (item.image !== undefined) comb.image = item.image;
      combinations.push(comb);
    }
    if (values.length === 0) return null;
    const axes: ProductVariationAxis[] = [{ name: groupName.trim() || DEFAULT_GROUP, values }];
    const synced = syncCombinations({ enabled: true, priceMode: "substitui", axes, combinations });
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
      // O que falha na validação é sempre o nome ou o preço, no topo do
      // formulário. Num ecrã único pode estar fora de vista, por isso o campo é
      // trazido ao ecrã em vez de o Dono ler um erro sobre algo que não vê.
      host.querySelector<HTMLElement>("[data-name]")?.scrollIntoView({ block: "center", behavior: "smooth" });
      host.querySelector("[data-errs]")!.innerHTML =
        `<div class="bg-red-50 text-red-700 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm">${esc(res.message)}</div>`;
    }
  });
}
