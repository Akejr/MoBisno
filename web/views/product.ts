/** Página individual de produto — resolve a loja, encontra o produto e liga a compra. */
import { render, $, esc, toast, fadeInImages } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorefront } from "../lib/storeCache.js";
import { addToCart, cartCount, updateCartBadge } from "../lib/cart.js";
import { brandOf } from "../lib/brand.js";
import { productSlugPath } from "../lib/slug.js";
import { applyInk } from "../lib/ink.js";

function notFound(message: string): void {
  render(`
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">${message.includes("Produto") ? "production_quantity_limits" : "storefront"}</span>
    <h1 class="text-headline-lg text-on-surface">${esc(message)}</h1>
    <a href="#/" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar ao início</a>
  </div>`);
}

/**
 * Renderiza a página de um produto. O parâmetro `slugOrId` aceita o caminho
 * amigável `<categoria>/<nome>` ou, por retrocompatibilidade, o id do produto.
 */
export async function renderProductPage(identifier: string, slugOrId: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind === "not_found" || result.kind !== "render") {
    notFound("Loja não encontrada");
    return;
  }

  const wanted = slugOrId.replace(/^\/+|\/+$/g, "").toLowerCase();
  const product =
    view.products.find((p) => productSlugPath(p).toLowerCase() === wanted) ??
    view.products.find((p) => p.id === slugOrId);
  if (!product) {
    notFound("Produto não encontrado");
    return;
  }

  const template = getTemplate(view.templateId);

  // Página de produto do modelo (ou fallback simples se o modelo não a definir).
  const html = template.renderProduct
    ? template.renderProduct(view, product, custom)
    : `<div class="min-h-screen ${""}"><a href="#/loja/${esc(identifier)}">Voltar</a><h1>${esc(product.name)}</h1></div>`;

  const app = render(html);
  app.style.setProperty("--brand", brandOf(custom, view.templateId));
  applyInk(app, custom);
  fadeInImages(app);
  updateCartBadge(result.store.id);

  // Não navegar nas âncoras de menu/logo da própria página (já estamos na loja).
  // Controlo de quantidade.
  const qtyInput = $("[data-qty]") as HTMLInputElement | null;
  const readQty = (): number => {
    const n = parseInt(qtyInput?.value ?? "1", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const writeQty = (n: number) => { if (qtyInput) qtyInput.value = String(Math.max(1, n)); };
  $("[data-qty-dec]")?.addEventListener("click", () => writeQty(readQty() - 1));
  $("[data-qty-inc]")?.addEventListener("click", () => writeQty(readQty() + 1));
  qtyInput?.addEventListener("input", () => { qtyInput.value = qtyInput.value.replace(/[^\d]/g, ""); });

  // Adicionar ao carrinho.
  const addBtn = $("[data-add-cart]") as HTMLButtonElement | null;
  addBtn?.addEventListener("click", () => {
    const qty = readQty();
    addToCart(result.store.id, {
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl ?? undefined,
    }, qty);
    updateCartBadge(result.store.id);
    toast(`Adicionado ao carrinho (${cartCount(result.store.id)} item(s)).`);
  });
}
