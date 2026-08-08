/** Página individual de produto — resolve a loja, encontra o produto e liga a compra. */
import { render, $, esc, toast, fadeInImages, formatKz } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorefront } from "../lib/storeCache.js";
import { addToCart, cartCount, updateCartBadge } from "../lib/cart.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { productSlugPath, categorySlug } from "../lib/slug.js";
import { navigate, storeHomePath } from "../lib/routing.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { publicStoreUrl } from "../composition.js";
import { applySeo, shippingFromCustom } from "../lib/seo.js";
import { productTitle, productDescription, productJsonLd, breadcrumbJsonLd } from "../../src/services/seo.js";
import { trackPixel } from "../lib/pixels.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { listProductReviews, summarize, submitReview, type Review } from "../supabase/reviews.js";
import { storeNotFoundHtml } from "../templates/notFound.js";
import {
  combinationAvailable,
  combinationsOf,
  effectivePrice,
  findCombination,
  missingAxes,
  normalizeVariations,
  variantKeyOf,
  variantLabelOf,
} from "../../src/services/variations.js";
import type { ProductVariations } from "../../src/models/domain.js";

/**
 * Produto inexistente numa loja que existe. Distinto da
 * Pagina_Loja_Nao_Encontrada: aqui a loja abre, por isso a ligação volta à loja
 * — com caminho real, sem fragmento `#` (`SEO.md` §5.1).
 */
function productNotFound(identifier: string): void {
  render(`
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">production_quantity_limits</span>
    <h1 class="text-headline-lg text-on-surface">Produto não encontrado</h1>
    <a href="${esc(storeHomePath(identifier))}" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar à loja</a>
  </div>`);
}

/** Combinação escolhida, pronta a entrar numa linha de Carrinho (R4.13, R4.15). */
interface VariantChoice {
  variantKey: string;
  variantLabel: string;
  /** Preço efetivo da Combinação, de `effectivePrice` (R4.6 a R4.8). */
  price: number;
  /**
   * Foto da versão escolhida, quando existe. Vai para a linha de Carrinho: o
   * Cliente que escolheu o azul vê o azul no carrinho, não a foto do Produto.
   */
  image?: string;
}

/**
 * Liga os seletores de Variação desenhados pelo Modelo_De_Loja
 * (`variationPickerHtml` de `web/templates/variationPicker.ts`).
 *
 * **Só é chamada quando `normalizeVariations` devolve um valor.** Um Produto sem
 * Variação nunca passa por aqui, e é isso que mantém o comportamento atual
 * inalterado (R4.16): sem seletores, sem `variantKey`, preço igual a
 * `product.price`.
 *
 * O que faz, e nada mais:
 *
 *  - um clique escolhe (ou desescolhe) o valor de um eixo;
 *  - o preço no ecrã é recalculado por `effectivePrice` a cada mudança (R4.9);
 *  - um valor que não leva a nenhuma Combinação disponível fica marcado
 *    «Esgotado» e desativado (R4.11), sem nunca desativar o valor já escolhido —
 *    senão o Cliente ficava preso numa seleção que não podia mudar;
 *  - `resolve()` é o guarda da adição ao Carrinho: rejeita a seleção incompleta
 *    dizendo **quais** as Variação em falta (R4.10) e rejeita a Combinação
 *    esgotada (R4.11).
 *
 * **Lacuna declarada:** se o HTML do Modelo_De_Loja não trouxer os seletores
 * (`[data-variations]` ausente), não há como o Cliente escolher e a página passa
 * a comportar-se como hoje — preço base e sem Combinação — em vez de bloquear a
 * venda. Nenhum Modelo_De_Loja registado está nesse caso.
 */
function mountVariationPicker(
  root: HTMLElement,
  v: ProductVariations,
  basePrice: number,
  baseImage: string,
): { resolve(): VariantChoice | null } {
  const axes = v.axes;
  const container = root.querySelector<HTMLElement>("[data-variations]");
  if (!container) {
    return { resolve: () => ({ variantKey: "", variantLabel: "", price: basePrice }) };
  }

  const selection: (string | null)[] = axes.map(() => null);
  const note = container.querySelector<HTMLElement>("[data-variation-note]");
  const pickStyle = container.getAttribute("data-pick-style") ?? "";
  const buttons = Array.from(container.querySelectorAll<HTMLElement>("[data-variation-pick]"));
  const priceEls = Array.from(root.querySelectorAll<HTMLElement>("[data-product-price]"));

  /**
   * Mostra a fotografia de uma versão do Produto.
   *
   * Duas vias, porque os modelos desenham a imagem de duas maneiras:
   *
   *  - com **galeria** (2+ fotos), a foto da variação já é um slide — `productImages`
   *    inclui-a — e basta marcar o rádio cujo `data-img-src` é essa foto: a troca
   *    fica com o CSS da galeria, com a transição que ele já faz, e a miniatura
   *    correspondente acende sozinha;
   *  - **sem galeria** (variante «imersivo», ou Produto com uma foto só), troca-se
   *    o `src` do `[data-product-image]`.
   *
   * Sem nenhum dos dois, não faz nada — um modelo que não desenhe imagem não pode
   * quebrar a escolha da variação.
   */
  const showImage = (url: string): void => {
    if (!url) return;
    const slide = root.querySelector<HTMLInputElement>(`input[data-img-src="${CSS.escape(url)}"]`);
    if (slide) { slide.checked = true; return; }
    const img = root.querySelector<HTMLImageElement>("[data-product-image]");
    if (img && img.getAttribute("src") !== url) img.setAttribute("src", url);
  };

  const showNote = (message: string): void => {
    if (!note) return;
    note.textContent = message;
    note.classList.remove("hidden");
  };
  const clearNote = (): void => {
    if (!note) return;
    note.textContent = "";
    note.classList.add("hidden");
  };

  /**
   * Existe alguma Combinação disponível com este valor neste eixo, respeitando o
   * que já está escolhido nos outros eixos?
   *
   * Os eixos ainda por escolher são percorridos todos (`combinationsOf`), por
   * isso basta **uma** Combinação disponível para o valor continuar clicável.
   * Combinação não gravada conta como disponível (R4.12), o que impede que um
   * campo em falta bloqueie uma venda.
   */
  const reachable = (axisIndex: number, value: string): boolean => {
    const free: number[] = [];
    axes.forEach((_, i) => { if (i !== axisIndex && selection[i] === null) free.push(i); });
    const tuples = free.length ? combinationsOf(free.map((i) => axes[i]!)) : [[]];
    for (const tuple of tuples) {
      const values = axes.map((_, i) => {
        if (i === axisIndex) return value;
        const chosen = selection[i];
        if (chosen !== null) return chosen;
        return tuple[free.indexOf(i)] ?? "";
      });
      if (combinationAvailable(findCombination(v, values))) return true;
    }
    return false;
  };

  const paint = (): void => {
    buttons.forEach((el) => {
      const i = Number(el.getAttribute("data-variation-pick"));
      const value = el.getAttribute("data-variation-value") ?? "";
      const base = el.getAttribute("data-pick-base") ?? "";
      const picked = selection[i] === value;
      el.setAttribute("aria-pressed", picked ? "true" : "false");
      el.setAttribute("style", picked && pickStyle ? (base ? `${base};${pickStyle}` : pickStyle) : base);
      const soldOut = !reachable(i, value);
      if (soldOut) el.setAttribute("data-sold-out", "1");
      else el.removeAttribute("data-sold-out");
      // O valor escolhido nunca é desativado: é a única forma de o Cliente
      // voltar atrás depois de uma escolha que esgotou o resto.
      if (soldOut && !picked) el.setAttribute("disabled", "true");
      else el.removeAttribute("disabled");
      el.querySelector("[data-sold-out-badge]")?.classList.toggle("hidden", !soldOut);
    });

    const complete = missingAxes(axes, selection).length === 0;
    const comb = complete ? findCombination(v, selection as string[]) : null;
    const price = complete ? effectivePrice(basePrice, comb, v.priceMode) : basePrice;
    priceEls.forEach((el) => { el.textContent = formatKz(price); });
    if (complete && !combinationAvailable(comb)) showNote("Esta combinação está esgotada.");
    else clearNote();

    /*
     * Foto da versão escolhida. A da Combinação ganha à do valor: com dois eixos,
     * «Azul + M» pode ter foto própria e é essa a versão que o Cliente está a
     * ver. Sem nenhuma escolha, volta a foto do Produto — senão ficava a foto de
     * uma versão que o Cliente já desmarcou.
     */
    const picked = buttons.find((el) => el.getAttribute("aria-pressed") === "true" && el.hasAttribute("data-variation-image"));
    const image = comb?.image || picked?.getAttribute("data-variation-image") || "";
    if (image) showImage(image);
    else if (selection.every((s) => s === null)) showImage(baseImage);
  };

  buttons.forEach((el) => el.addEventListener("click", () => {
    if (el.hasAttribute("disabled")) return;
    const i = Number(el.getAttribute("data-variation-pick"));
    const value = el.getAttribute("data-variation-value") ?? "";
    if (!Number.isInteger(i) || !axes[i]) return;
    selection[i] = selection[i] === value ? null : value;
    paint();
  }));
  paint();

  return {
    resolve(): VariantChoice | null {
      const missing = missingAxes(axes, selection);
      if (missing.length > 0) {
        const message = `Falta escolher: ${missing.join(", ")}.`;
        showNote(message);
        toast(message, "error");
        return null;
      }
      const values = selection as string[];
      const comb = findCombination(v, values);
      if (!combinationAvailable(comb)) {
        const message = "Esta combinação está esgotada.";
        showNote(message);
        toast(message, "error");
        return null;
      }
      clearNote();
      const choice: VariantChoice = {
        variantKey: variantKeyOf(values),
        variantLabel: variantLabelOf(axes, values),
        price: effectivePrice(basePrice, comb, v.priceMode),
      };
      const image = comb?.image
        || buttons.find((el) => el.getAttribute("aria-pressed") === "true" && el.hasAttribute("data-variation-image"))?.getAttribute("data-variation-image")
        || "";
      if (image) choice.image = image;
      return choice;
    },
  };
}

/**
 * Renderiza a página de um produto. O parâmetro `slugOrId` aceita o caminho
 * amigável `<categoria>/<nome>` ou, por retrocompatibilidade, o id do produto.
 */
export async function renderProductPage(identifier: string, slugOrId: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);

  if (view.kind === "not_found" || result.kind !== "render") {
    render(storeNotFoundHtml(identifier));
    return;
  }

  const wanted = slugOrId.replace(/^\/+|\/+$/g, "").toLowerCase();
  const product =
    view.products.find((p) => productSlugPath(p).toLowerCase() === wanted) ??
    view.products.find((p) => p.id === slugOrId);
  if (!product) {
    productNotFound(identifier);
    return;
  }

  const template = getTemplate(view.templateId);

  const outOfStock = product.stock === 0;

  // Página de produto do modelo (ou fallback simples se o modelo não a definir).
  const html = template.renderProduct
    ? template.renderProduct(view, product, custom)
    : `<div class="min-h-screen ${""}"><a href="${esc(storeHomePath(identifier))}">Voltar</a><h1>${esc(product.name)}</h1></div>`;

  const app = render(html);
  app.style.setProperty("--brand", brandOf(custom, view.templateId));
  app.style.setProperty("--brand-ink", readableInk(brandOf(custom, view.templateId)));
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  updateCartBadge(result.store.id);

  // Variação do Produto (R4.9 a R4.12). `null` = Produto sem Variação: daqui em
  // diante corre exactamente o código de hoje (R4.16).
  const variations = normalizeVariations(custom, product.id);
  const picker = variations
    ? mountVariationPicker(app, variations, product.price, product.imageUrl ?? "")
    : null;

  // Avaliações (estrelas) — carrega e calcula o resumo para o JSON-LD.
  let reviews: Review[] = [];
  try { reviews = await listProductReviews(product.id); } catch { reviews = []; }
  const rating = summarize(reviews);

  // SEO do produto (imagem do produto + foco na loja). O trilho de navegação
  // dá ao Google a hierarquia Loja › Categoria › Produto no resultado.
  const storeUrl = publicStoreUrl(identifier);
  const productUrl = `${storeUrl}/produto/${productSlugPath(product)}`;
  const crumbs = [{ name: view.storeName, url: `${storeUrl}/` }];
  if (product.category) {
    crumbs.push({ name: product.category, url: `${storeUrl}/categoria/${categorySlug(product.category)}` });
  }
  crumbs.push({ name: product.name, url: productUrl });

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
    jsonLd: [
      productJsonLd({
        name: product.name,
        description: product.description,
        image: product.imageUrl,
        price: product.price,
        url: productUrl,
        storeName: view.storeName,
        storeUrl,
        sku: product.id,
        category: product.category,
        available: !outOfStock,
        rating: rating.count > 0 ? rating : null,
        shipping: shippingFromCustom(custom),
      }),
      breadcrumbJsonLd(crumbs),
    ],
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
    // Com Variação ativas, a linha leva a Combinação escolhida e o preço efetivo
    // (R4.13, R4.15). Seleção incompleta (R4.10) ou esgotada (R4.11) é rejeitada
    // por `resolve`, que já mostrou a razão.
    if (picker) {
      const choice = picker.resolve();
      if (!choice) return;
      addToCart(result.store.id, {
        productId: product.id,
        name: product.name,
        price: choice.price,
        // A foto da versão escolhida, quando existe: quem escolheu o azul vê o
        // azul na linha do carrinho.
        imageUrl: choice.image ?? product.imageUrl ?? undefined,
        variantKey: choice.variantKey,
        variantLabel: choice.variantLabel,
      }, qty);
      updateCartBadge(result.store.id);
      trackPixel(custom, { type: "AddToCart", name: product.name, id: product.id, value: choice.price });
      toast(`Adicionado ao carrinho (${cartCount(result.store.id)} item(s)).`);
      return;
    }
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
        // Mesma regra do botão de carrinho: com Variação ativas segue a
        // Combinação escolhida e o seu preço efetivo; sem Variação, o código de
        // hoje (R4.16).
        if (picker) {
          const choice = picker.resolve();
          if (!choice) return;
          addToCart(result.store.id, {
            productId: product.id,
            name: product.name,
            price: choice.price,
            imageUrl: choice.image ?? product.imageUrl ?? undefined,
            variantKey: choice.variantKey,
            variantLabel: choice.variantLabel,
          }, readQty());
          updateCartBadge(result.store.id);
          navigate(`/loja/${encodeURIComponent(identifier)}/checkout`);
          return;
        }
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
  // A exceção do «Neon Lab» (sem secção de avaliações) saiu com o modelo: desde
  // a remoção do registo (R1.4) nenhuma Loja é servida com esse id — um
  // `template_id` antigo em base de dados passa pelo fallback de `getTemplate` e
  // é desenhado pelo primeiro Modelo registado, que tem avaliações.
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
