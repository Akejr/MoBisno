/** Página individual de produto — resolve a loja, encontra o produto e liga a compra. */
import { render, $, esc, toast, fadeInImages, formatKz } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorefront } from "../lib/storeCache.js";
import { addToCart, cartCount, updateCartBadge } from "../lib/cart.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { productSlugPath } from "../lib/slug.js";
import { navigate } from "../lib/routing.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { publicStoreUrl } from "../composition.js";
import { applySeo } from "../lib/seo.js";
import { productTitle, productDescription, productJsonLd } from "../../src/services/seo.js";
import { trackPixel } from "../lib/pixels.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { listProductReviews, summarize, submitReview, type Review } from "../supabase/reviews.js";

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

  const outOfStock = product.stock === 0;

  // Página de produto do modelo (ou fallback simples se o modelo não a definir).
  const html = template.renderProduct
    ? template.renderProduct(view, product, custom)
    : `<div class="min-h-screen ${""}"><a href="#/loja/${esc(identifier)}">Voltar</a><h1>${esc(product.name)}</h1></div>`;

  const app = render(html);
  app.style.setProperty("--brand", brandOf(custom, view.templateId));
  app.style.setProperty("--brand-ink", readableInk(brandOf(custom, view.templateId)));
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  updateCartBadge(result.store.id);

  // Avaliações (estrelas) — carrega e calcula o resumo para o JSON-LD.
  let reviews: Review[] = [];
  try { reviews = await listProductReviews(product.id); } catch { reviews = []; }
  const rating = summarize(reviews);

  // SEO do produto (imagem do produto + foco na loja).
  const productUrl = `${publicStoreUrl(identifier)}/produto/${productSlugPath(product)}`;
  applySeo({
    title: productTitle(product.name, view.storeName),
    description: productDescription({
      name: product.name,
      description: product.description,
      priceLabel: formatKz(product.price),
      storeName: view.storeName,
    }),
    canonical: productUrl,
    image: product.imageUrl,
    type: "product",
    siteName: view.storeName,
    jsonLd: productJsonLd({
      name: product.name,
      description: product.description,
      image: product.imageUrl,
      price: product.price,
      url: productUrl,
      storeName: view.storeName,
      available: !outOfStock,
      rating: rating.count > 0 ? rating : null,
    }),
  });
  trackPixel(custom, { type: "PageView" });
  trackPixel(custom, { type: "ViewContent", name: product.name, id: product.id, value: product.price });
  void trackStoreEvent(result.store.id, "product_view", product.id);

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
    trackPixel(custom, { type: "AddToCart", name: product.name, id: product.id, value: product.price });
    toast(`Adicionado ao carrinho (${cartCount(result.store.id)} item(s)).`);
  });

  // Checkout online ativo: o botão de WhatsApp passa a "Comprar agora"
  // (adiciona ao carrinho e segue para o checkout com as três opções).
  if (custom.payments?.onlineEnabled) {
    document.querySelectorAll<HTMLElement>("[data-edit-whatsapp]").forEach((el) => {
      el.removeAttribute("href");
      el.removeAttribute("target");
      el.innerHTML = `<span class="material-symbols-outlined text-[20px]">bolt</span> Comprar agora`;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        addToCart(result.store.id, {
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl ?? undefined,
        }, readQty());
        updateCartBadge(result.store.id);
        navigate(`/loja/${encodeURIComponent(identifier)}/checkout`);
      });
    });
  }

  // Esgotado: desativa a compra e marca visualmente (corre após todos os binds).
  if (outOfStock) {
    document.querySelectorAll<HTMLElement>("[data-add-cart], [data-edit-whatsapp]").forEach((el) => {
      el.setAttribute("disabled", "true");
      el.style.opacity = "0.55";
      el.style.pointerEvents = "none";
      el.style.cursor = "not-allowed";
      el.innerHTML = `<span class="material-symbols-outlined text-[20px]">block</span> Esgotado`;
    });
  }

  // No preview de um MODELO (loja marcada com __template) mostramos avaliações
  // de exemplo, para o preview ficar completo. A loja real do cliente usa o
  // sistema real (vazio até receber avaliações verdadeiras).
  const isModelPreview = !!(custom as { __template?: unknown }).__template;
  const dispReviews = isModelPreview && reviews.length === 0 ? sampleReviews(result.store.id, product.id) : reviews;
  const dispRating = isModelPreview && reviews.length === 0 ? { average: 4.8, count: 3 } : rating;
  mountReviews(app, result.store.id, product.id, dispReviews, dispRating, view.templateId);
}

/** Avaliações de exemplo (apenas para o preview de modelos). */
function sampleReviews(storeId: string, productId: string): Review[] {
  const base = { storeId, productId, approved: true, createdAt: new Date().toISOString() };
  return [
    { ...base, id: "sample-1", author: "Eleanor V.", rating: 5, comment: "A textura é diferente de tudo o que experimentei. A minha pele fica visivelmente mais luminosa todas as manhãs." },
    { ...base, id: "sample-2", author: "Sofia M.", rating: 5, comment: "Substituiu vários produtos da minha rotina. O aroma botânico torna a minha noite um verdadeiro ritual." },
    { ...base, id: "sample-3", author: "Clara D.", rating: 4, comment: "Perfeito para o clima seco. Aplico antes de dormir e acordo com a pele incrivelmente macia." },
  ];
}

/** Estrelas (preenchidas/vazias) para uma nota de 0–5. */
function starsHtml(value: number, size = 18, color = "#f59e0b"): string {
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const fill = value >= i ? "star" : value >= i - 0.5 ? "star_half" : "star_outline";
    out += `<span class="material-symbols-outlined" style="font-size:${size}px;color:${color}">${fill}</span>`;
  }
  return out;
}

/**
 * Secção de avaliações (lista + média + formulário) — sistema REAL (grava e lê
 * da base de dados). Adapta a UI ao modelo: o "lumiere" usa o visual editorial
 * (Playfair, dourado, cartões em vidro, campos minimais). Inserida antes do rodapé.
 */
function mountReviews(
  app: HTMLElement,
  storeId: string,
  productId: string,
  reviews: Review[],
  rating: { average: number; count: number },
  templateId: string,
): void {
  // O modelo "Neon Lab" não tem secção de avaliações na página de produto.
  if (templateId === "neonlab") return;
  const lux = templateId === "lumiere";
  const gold = "#D4AF37";
  const section = document.createElement("section");

  const list = (items: Review[]): string => {
    if (!items.length) {
      return lux
        ? `<p class="lx-body text-sm py-4 md:col-span-3" style="color:#777871">Ainda não há avaliações. Seja o primeiro a avaliar!</p>`
        : `<p class="text-neutral-400 text-sm py-4">Ainda não há avaliações. Seja o primeiro a avaliar!</p>`;
    }
    if (lux) {
      return items.map((r) => `<div class="p-8 flex flex-col h-full" style="background:rgba(249,247,242,.8);backdrop-filter:blur(12px);border:1px solid rgba(228,226,221,.4);box-shadow:0 30px 50px -15px rgba(28,27,27,.05)">
        <div class="flex mb-4">${starsHtml(r.rating, 16, gold)}</div>
        ${r.comment ? `<p class="lx-body text-sm leading-relaxed mb-6" style="color:#464742">${esc(r.comment)}</p>` : ""}
        <p class="lx-body lx-track uppercase text-[12px] mt-auto" style="color:#1c1b1b">— ${esc(r.author)}</p>
      </div>`).join("");
    }
    return items.map((r) => `<div class="border-b border-neutral-100 py-4">
      <div class="flex items-center justify-between gap-2">
        <p class="font-semibold text-neutral-900">${esc(r.author)}</p>
        <div class="flex items-center">${starsHtml(r.rating, 15)}</div>
      </div>
      ${r.comment ? `<p class="text-neutral-600 text-sm mt-1">${esc(r.comment)}</p>` : ""}
    </div>`).join("");
  };

  if (lux) {
    section.className = "relative mt-8";
    const summary = rating.count ? `${rating.average.toFixed(1)} (${rating.count} avaliações)` : "Sem avaliações";
    const many = reviews.length > 3;
    const listCls = many
      ? "grid grid-flow-col auto-cols-[86%] sm:auto-cols-[48%] md:auto-cols-[31%] gap-6 overflow-x-hidden scroll-smooth lx-noscroll"
      : "grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch";
    const arrows = many
      ? `<div class="flex gap-2">
          <button type="button" data-rv-prev class="w-10 h-10 flex items-center justify-center border hover:bg-black/[.03] transition-colors" style="border-color:#1c1b1b;color:#1c1b1b"><span class="material-symbols-outlined">chevron_left</span></button>
          <button type="button" data-rv-next class="w-10 h-10 flex items-center justify-center border hover:bg-black/[.03] transition-colors" style="border-color:#1c1b1b;color:#1c1b1b"><span class="material-symbols-outlined">chevron_right</span></button>
        </div>`
      : "";
    section.innerHTML = `
      <div class="relative" style="background:#f9f7f2;width:100vw;left:50%;right:50%;margin-left:-50vw;margin-right:-50vw">
        <div class="w-full max-w-[1280px] mx-auto px-5 md:px-16 py-16 md:py-24">
          <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <h2 class="lx-serif text-3xl md:text-4xl mb-3" style="color:#1c1b1b">Avaliações</h2>
              <div class="flex items-center gap-2">
                <div class="flex">${starsHtml(rating.average, 18, gold)}</div>
                <span class="lx-body text-sm" style="color:#464742">${summary}</span>
              </div>
            </div>
            <div class="flex items-center gap-4 self-start">
              ${arrows}
              <button type="button" data-rv-toggle class="lx-body lx-track uppercase text-[12px] font-semibold border-b pb-1 hover:opacity-60 transition-opacity" style="color:#1c1b1b;border-color:#1c1b1b">Escrever avaliação</button>
            </div>
          </div>
          <div data-rv-form class="hidden mb-10 p-8 max-w-xl" style="background:rgba(249,247,242,.85);backdrop-filter:blur(12px);border:1px solid rgba(228,226,221,.5);box-shadow:0 30px 50px -15px rgba(28,27,27,.05)">
            <div class="flex items-center gap-1 mb-5" data-star-pick>
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="material-symbols-outlined" style="font-size:28px;color:#c8c6c2;cursor:pointer">star</button>`).join("")}
            </div>
            <input data-rv-name placeholder="O seu nome" class="w-full bg-transparent border-0 border-b px-0 py-2 text-[16px] outline-none mb-5 lx-body" style="border-color:rgba(28,27,27,.3);color:#1c1b1b" />
            <textarea data-rv-comment rows="3" placeholder="O que achou do produto? (opcional)" class="w-full bg-transparent border-0 border-b px-0 py-2 text-[16px] outline-none resize-none mb-6 lx-body" style="border-color:rgba(28,27,27,.3);color:#1c1b1b"></textarea>
            <button data-rv-submit class="px-8 py-3 lx-body lx-track uppercase text-[12px] font-semibold" style="background:var(--brand,#1c1b1b);color:var(--brand-ink,#fff)">Enviar avaliação</button>
          </div>
          <div data-reviews-list class="${listCls}">${list(reviews)}</div>
        </div>
      </div>`;
  } else {
    section.className = "w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-neutral-100";
    section.innerHTML = `
      <h2 class="text-2xl font-black text-neutral-900">Avaliações</h2>
      <div class="flex items-center gap-3 mt-2 mb-6">
        <div class="flex items-center">${starsHtml(rating.average, 22)}</div>
        <span class="text-neutral-600 text-sm">${rating.count ? `${rating.average.toFixed(1)} · ${rating.count} avaliação(ões)` : "Sem avaliações"}</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div data-reviews-list class="lg:col-span-2">${list(reviews)}</div>
        <div class="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-1 lg:sticky lg:top-6">
          <h3 class="font-bold text-neutral-900 mb-3">Deixe a sua avaliação</h3>
          <div class="flex items-center gap-1 mb-3" data-star-pick>
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="material-symbols-outlined" style="font-size:30px;color:#d4d4d8;cursor:pointer">star</button>`).join("")}
          </div>
          <input data-rv-name placeholder="O seu nome" class="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2.5 text-[16px] outline-none focus:border-[color:var(--brand)] mb-2" />
          <textarea data-rv-comment rows="3" placeholder="O que achou do produto? (opcional)" class="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2.5 text-[16px] outline-none focus:border-[color:var(--brand)] resize-none mb-3"></textarea>
          <button data-rv-submit class="w-full px-5 py-2.5 rounded-xl text-white font-bold text-sm inline-flex items-center justify-center gap-1" style="background:var(--brand)"><span class="material-symbols-outlined text-[18px]">send</span> Enviar avaliação</button>
        </div>
      </div>`;
  }

  // Insere as avaliações antes de "Também pode gostar" (se existir) ou do rodapé.
  const anchor = app.querySelector("[data-related]") ?? app.querySelector("footer");
  if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(section, anchor);
  else app.appendChild(section);

  // Seleção de estrelas.
  let picked = 0;
  const pickColor = lux ? gold : "#f59e0b";
  const emptyColor = lux ? "#c8c6c2" : "#d4d4d8";
  const stars = Array.from(section.querySelectorAll<HTMLElement>("[data-star]"));
  const paint = (): void => stars.forEach((s, i) => { s.style.color = i < picked ? pickColor : emptyColor; });
  stars.forEach((s, i) => s.addEventListener("click", () => { picked = i + 1; paint(); }));

  // Botão "Escrever avaliação" revela o formulário (modelo Lumière).
  section.querySelector<HTMLElement>("[data-rv-toggle]")?.addEventListener("click", () => {
    section.querySelector<HTMLElement>("[data-rv-form]")?.classList.toggle("hidden");
  });

  // Setas do carrossel de avaliações (quando há mais de 3).
  const rvList = section.querySelector<HTMLElement>("[data-reviews-list]");
  const scrollAmt = (): number => Math.max(280, Math.round((rvList?.clientWidth ?? 900) / 3));
  section.querySelector<HTMLElement>("[data-rv-prev]")?.addEventListener("click", () => rvList?.scrollBy({ left: -scrollAmt(), behavior: "smooth" }));
  section.querySelector<HTMLElement>("[data-rv-next]")?.addEventListener("click", () => rvList?.scrollBy({ left: scrollAmt(), behavior: "smooth" }));

  section.querySelector<HTMLElement>("[data-rv-submit]")?.addEventListener("click", async () => {
    const author = (section.querySelector("[data-rv-name]") as HTMLInputElement).value;
    const comment = (section.querySelector("[data-rv-comment]") as HTMLTextAreaElement).value;
    const err = await submitReview(storeId, productId, { author, rating: picked, comment });
    if (err) { toast(err, "error"); return; }
    toast("Obrigado pela sua avaliação!");
    const fresh = await listProductReviews(productId);
    const el = section.querySelector("[data-reviews-list]");
    if (el) el.innerHTML = list(fresh);
  });
}
