/**
 * Checkout da loja — finalização com Multicaixa Express, Referência Bancária e
 * WhatsApp. 4 layouts selecionáveis no editor (`custom.checkout.variant`); o
 * HTML vive em `web/templates/checkoutLayouts.ts`.
 *
 * O layout "Etapas" (moderno) é um fluxo real: Dados → Pagamento → Confirmação,
 * com transições animadas. Os restantes são de página única.
 *
 * ## Métodos
 *
 * O WhatsApp está sempre disponível. Multicaixa Express e Referência Bancária
 * só aparecem quando `digitalPaymentsVisible(store)` o diz — a única decisão
 * (`src/services/paymentVisibility.ts`): loja aprovada **e** fornecedor ligado.
 *
 * ## O que segue para o servidor
 *
 * Num pagamento digital o navegador **não diz preços**: envia os ids dos
 * Produtos, a Combinação e a quantidade (`orderRequestLines`), os dados do
 * comprador (`buyerCustomer`), o código de desconto e `expectedTotal` — o total
 * que o comprador viu. O servidor calcula o montante a partir da base de dados
 * (`api/_payments.js`); se o dele for outro, responde `PRICE_CHANGED` com o
 * novo total e a página pede ao comprador que o confirme antes de voltar a
 * tentar. Nenhuma bandeira de testes sai daqui: um modo de testes do
 * fornecedor é escolhido no servidor.
 *
 * ## A mesma conta dos dois lados
 *
 * A taxa de entrega (`deliveryFeeFor`) e o desconto (`discountAmount`) usam as
 * regras que o servidor espelha (`deliveryFeeOf`, `discountAmountOf` em
 * `api/_shared.js`, comparadas por `tests/serverOrder.test.ts`): o total
 * apresentado é o que o servidor calcula, salvo um preço que mudou entretanto.
 */
import { render, esc, formatKz, fadeInImages } from "../lib/dom.js";
import { storeHomePath } from "../lib/routing.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getCart, cartTotal, clearCart, updateCartBadge, announce, type CartItem } from "../lib/cart.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { initPayment, checkStatus, type PaymentResult } from "../lib/paymentsApi.js";
import { validateDiscount, type ValidDiscount } from "../supabase/discounts.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { recordWhatsappOrder } from "../supabase/whatsappOrders.js";
import { trackPixel } from "../lib/pixels.js";
import { getTemplate } from "../templates/registry.js";
import { deliveredAreas, deliveryFeeFor, freeDeliveryFrom } from "../lib/areas.js";
import {
  renderCheckout, renderStepper, renderCustomerFields, renderMethodTile, renderMethodGroup,
  checkoutMethods, renderPayButton, renderOrderSummaryCard, renderSecureNote, checkoutTotal,
  type CheckoutVariant, type CheckoutMethodId, type CheckoutLayoutCtx, type CouponState,
} from "../templates/checkoutLayouts.js";
import { MIN_PAYMENT_KZ, type DigitalPaymentMethod } from "../../src/services/payments.js";
import { digitalPaymentsVisible } from "../../src/services/paymentVisibility.js";
import { buildCartWhatsAppMessage } from "../../src/services/cartMessage.js";
import { discountAmount, normalizeDiscountCode } from "../../src/services/discount.js";
import {
  orderRequestLines, exceedsOrderLimits, MAX_ORDER_LINES, MAX_LINE_QUANTITY, type OrderRequestLine,
} from "../../src/services/cartLine.js";
import {
  buyerErrors, buyerCustomer, firstBuyerError, BUYER_FIELDS, BUYER_MESSAGES,
  type BuyerDetails, type BuyerField,
} from "../../src/services/delivery.js";
import { storeNotFoundHtml } from "../templates/notFound.js";

/** Códigos do servidor que querem dizer «os pagamentos digitais não estão disponíveis aqui». */
const DIGITAL_UNAVAILABLE = new Set(["PAYMENTS_UNAVAILABLE", "PAYMENTS_NOT_ENABLED", "PLAN_NOT_COVERED"]);

/** Mensagem quando o fornecedor de pagamentos não está ligado. */
const UNAVAILABLE_MESSAGE =
  "Os pagamentos por Multicaixa Express e Referência Bancária não estão disponíveis neste momento.";

/** Tempo durante o qual um segundo toque em «Finalizar via WhatsApp» é ignorado. */
const WHATSAPP_COOLDOWN_MS = 2500;

/** URL utilizável num `href` vindo do servidor (fatura): só `https:`. */
function safeHttpsUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

/** Data legível (pt-PT) de uma data ISO, ou `null`. */
function dateText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("pt-PT") : null;
}

/** O utilizador pediu menos movimento ao sistema? */
function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function renderCheckoutPage(identifier: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);
  if (view.kind !== "render" || result.kind !== "render") { render(storeNotFoundHtml(identifier)); return; }
  // Vista já estreitada a "render": as funções abaixo são declarações (içadas),
  // onde o TypeScript não leva o estreitamento de `view`.
  const storeView = view;

  const storeId = result.store.id;
  const storeName = view.storeName;
  const template = getTemplate(result.store.templateId);
  const brand = brandOf(custom, result.store.templateId);
  const homeHref = storeHomePath(identifier);
  // Decisão única (src/services/paymentVisibility.ts): loja aprovada pela
  // MôBisno e fornecedor de pagamentos ligado.
  const online = digitalPaymentsVisible(result.store);
  const variant: CheckoutVariant = custom.checkout?.variant ?? "dividido";
  const waPhone = resolveWaPhone(custom);
  const methods = checkoutMethods(online);

  // Entrega: áreas servidas + se o carrinho tem produtos físicos.
  const allAreas = deliveredAreas(custom.delivery);
  const areaNames = allAreas.map((a) => a.name);
  const freeFrom = freeDeliveryFrom(custom.delivery);
  const physical = getCart(storeId).some((ci) => {
    const p = view.products.find((pp) => pp.id === ci.productId);
    return p ? p.physical : false;
  });

  /* ---------------------------------- Estado ---------------------------------- */

  // Só há um método (WhatsApp): vem já escolhido, para não pedir um clique inútil.
  let selected: CheckoutMethodId | null = methods.length === 1 ? (methods[0]?.id ?? null) : null;
  const buyer: BuyerDetails = {};
  let errors: Partial<Record<BuyerField, string>> = {};
  let applied: ValidDiscount | null = null;
  const coupon: CouponState = { value: "", message: null, error: false, busy: false };
  /** Pagamento digital em curso — recusa o segundo clique. */
  let paying = false;
  /** Encomenda por WhatsApp acabada de abrir — recusa o toque duplo. */
  let sendingWa = false;
  /** Aviso por baixo do botão de pagar (HTML já escapado). */
  let notice: string | null = null;
  /** Nova tentativa à espera de o comprador confirmar o total que mudou. */
  let pendingRetry: { method: DigitalPaymentMethod; lines: OrderRequestLine[]; total: number } | null = null;
  let lastPayment: PaymentResult | null = null;
  let purchaseValue = 0;
  let step: 1 | 2 | 3 = 1;

  /* ---------------------------------- Contas ---------------------------------- */

  /** Subtotal, entrega e desconto — as regras com que o servidor cobra. */
  function totals(): { subtotal: number; fee: number; discount: number } {
    const subtotal = cartTotal(storeId);
    const delivery = physical ? deliveryFeeFor(custom.delivery, buyer.area ?? null, subtotal) : null;
    const fee = delivery && delivery.ok ? delivery.fee : 0;
    const discount = applied ? discountAmount(applied, subtotal + fee) : 0;
    return { subtotal, fee, discount };
  }

  function ctx(): CheckoutLayoutCtx {
    const t = totals();
    // `i.price` é o preço efetivo da linha e `i.variantLabel` a etiqueta da
    // Combinação escolhida (R4.14, R4.15) — o resumo do pedido mostra ambas.
    const items = getCart(storeId).map((i) => ({
      name: i.name, price: i.price, quantity: i.quantity, imageUrl: i.imageUrl, variantLabel: i.variantLabel,
    }));
    return {
      storeName, items, total: t.subtotal, online, selected, physical,
      // Taxa a pagar em cada área, já com a entrega grátis aplicada: é o que o
      // comprador vê no seletor e o que o servidor cobra.
      areas: allAreas.map((a) => {
        const r = deliveryFeeFor(custom.delivery, a.name, t.subtotal);
        return { name: a.name, fee: r.ok ? r.fee : a.fee };
      }),
      selectedArea: physical && buyer.area && areaNames.includes(buyer.area) ? buyer.area : null,
      deliveryFee: t.fee,
      discount: t.discount,
      discountCode: applied?.code ?? null,
      buyer, errors, coupon,
      freeDeliveryFrom: freeFrom,
      busy: paying,
    };
  }

  /* -------------------------------- Desenho --------------------------------- */

  /** Envolve o conteúdo no cromo da loja (cabeçalho, rodapé, tema, fontes). Só no primeiro desenho. */
  function shell(inner: string): void {
    const body = `<div id="mb-checkout">${inner}</div>`;
    const wrapped = template.renderCheckout
      ? template.renderCheckout(storeView, body, custom)
      : `<div class="min-h-screen bg-neutral-50"><div class="max-w-[1080px] mx-auto px-4 sm:px-6 py-8">${body}</div></div>`;
    const app = render(wrapped);
    app.style.setProperty("--brand", brand);
    app.style.setProperty("--brand-ink", readableInk(brand));
    applyInk(app, custom);
    applyTheme(app, custom);
    applyFieldColors(app, custom);
    applyIconColor(app, custom);
    fadeInImages(app);
    updateCartBadge(storeId);
  }

  /** Troca só o miolo do checkout: o cabeçalho e o rodapé da loja ficam. */
  function paint(inner: string): void {
    const host = document.getElementById("mb-checkout");
    if (!host) { shell(inner); return; }
    host.innerHTML = inner;
    fadeInImages(host);
  }

  /** Seletor do controlo com foco, para o devolver depois de redesenhar. */
  function focusedSelector(): string | null {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !document.getElementById("mb-checkout")?.contains(el)) return null;
    const method = el.getAttribute("data-method");
    if (method) return `[data-method="${method}"]`;
    return el.id ? `#${el.id}` : null;
  }

  function focusEl(selector: string | null | undefined, preventScroll = false): void {
    if (!selector) return;
    document.querySelector<HTMLElement>(selector)?.focus({ preventScroll });
  }

  /** Redesenha o estado atual sem perder o foco nem o aviso. */
  function redraw(): void {
    const keep = focusedSelector();
    if (variant === "moderno") {
      const panel = document.getElementById("mb-step");
      if (panel && step !== 3) panel.innerHTML = stepPanel(step);
    } else {
      paint(renderCheckout(variant, ctx()));
    }
    bind();
    showNotice();
    focusEl(keep, true);
  }

  /** Esquece o aviso e a confirmação pendente: o total vai mudar. */
  function resetPending(): void {
    notice = null;
    pendingRetry = null;
  }

  function emptyCart(): string {
    return `<div class="py-20 text-center text-neutral-600">
      <span class="material-symbols-outlined" aria-hidden="true" style="font-size:56px;">shopping_cart</span>
      <h1 class="mt-3 text-lg font-semibold text-neutral-900">O seu carrinho está vazio.</h1>
      <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg font-bold" style="background:var(--brand);color:var(--brand-ink,#fff)">Continuar a comprar</a>
    </div>`;
  }

  /* --------------------------------- Avisos --------------------------------- */

  function errorNotice(text: string): string {
    return `<div role="alert" class="rounded-xl border p-3 text-sm" style="border-color:#fecaca;background:#fef2f2"><p class="font-medium" style="color:#991b1b">${esc(text)}</p></div>`;
  }

  /** Os pagamentos digitais falharam por não estarem disponíveis: sugere o WhatsApp. */
  function unavailableNotice(serverMessage: string | undefined, code: string | undefined): string {
    const first = code === "PAYMENTS_UNAVAILABLE" || !serverMessage ? UNAVAILABLE_MESSAGE : serverMessage;
    return `<div role="alert" class="rounded-xl border p-4 text-sm" style="border-color:#d4d4d8;background:#fafafa">
      <p class="font-semibold" style="color:#262626">${esc(first)}</p>
      <p class="mt-1" style="color:#404040">Pode concluir a encomenda por WhatsApp: a loja recebe-a com os seus dados e combina o pagamento consigo.</p>
      <button id="use-whatsapp" type="button" class="mt-3 px-4 py-2.5 rounded-lg font-bold inline-flex items-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chat</span> Encomendar por WhatsApp</button>
    </div>`;
  }

  /** O servidor calculou outro total: mostra-o e pede confirmação antes de cobrar. */
  function priceChangedNotice(seen: number, total: number): string {
    return `<div role="alert" class="rounded-xl border p-4 text-sm" style="border-color:#f59e0b;background:#fffbeb">
      <p class="font-semibold" style="color:#78350f">O total da encomenda mudou.</p>
      <p class="mt-1" style="color:#78350f">A loja atualizou preços ou a entrega entretanto: o total passa de ${esc(formatKz(seen))} para <strong>${esc(formatKz(total))}</strong>. Confirme o novo valor para continuar.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button id="price-confirm" type="button" class="px-4 py-2.5 rounded-lg font-bold" style="background:var(--brand);color:var(--brand-ink,#fff)">Pagar ${esc(formatKz(total))}</button>
        <button id="price-cancel" type="button" class="px-4 py-2.5 rounded-lg border font-semibold" style="border-color:#78350f;color:#78350f">Cancelar</button>
      </div>
    </div>`;
  }

  function whatsappSentNotice(href: string): string {
    return `<div role="status" class="rounded-xl border p-4 text-sm" style="border-color:#bbf7d0;background:#f0fdf4">
      <p class="font-semibold" style="color:#14532d">A abrir o WhatsApp com a sua encomenda.</p>
      <p class="mt-1" style="color:#166534">Envie a mensagem para a loja receber o pedido. <a href="${esc(href)}" target="_blank" rel="noopener" class="font-semibold underline" style="color:#14532d">O WhatsApp não abriu? Abrir agora</a></p>
    </div>`;
  }

  /** Mostra o aviso atual na caixa por baixo do botão de pagar e liga os seus botões. */
  function showNotice(): void {
    const box = document.getElementById("pay-feedback");
    if (!box) return;
    box.innerHTML = notice ?? "";
    box.querySelector("#price-confirm")?.addEventListener("click", () => {
      const retry = pendingRetry;
      if (!retry) return;
      pendingRetry = null;
      void submitDigital(retry.method, retry.lines, retry.total);
    });
    box.querySelector("#price-cancel")?.addEventListener("click", () => {
      resetPending();
      showNotice();
      focusEl("#pay");
      announce("Pagamento cancelado. Pode rever a encomenda.");
    });
    box.querySelector("#use-whatsapp")?.addEventListener("click", () => {
      selected = "whatsapp";
      resetPending();
      redraw();
      focusEl("#pay");
      announce("WhatsApp escolhido. Toque em «Finalizar via WhatsApp» para enviar a encomenda.");
    });
  }

  function setNotice(html: string | null, focusSelector?: string): void {
    notice = html;
    showNotice();
    if (focusSelector) focusEl(focusSelector);
  }

  /* --------------------------------- Ligações -------------------------------- */

  function setBuyerField(field: BuyerField, value: string): void {
    if (field === "area") buyer.area = value || null;
    else buyer[field] = value;
  }

  function asBuyerField(value: string | undefined): BuyerField | null {
    return (BUYER_FIELDS as readonly string[]).includes(value ?? "") ? (value as BuyerField) : null;
  }

  /** Tira o erro de um campo sem redesenhar (o comprador está a escrever nele). */
  function clearError(field: BuyerField): void {
    if (errors[field] === undefined) return;
    delete errors[field];
    const errorId = `c-${field}-error`;
    const input = document.getElementById(`c-${field}`);
    if (input) {
      input.removeAttribute("aria-invalid");
      const rest = (input.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id !== "" && id !== errorId);
      if (rest.length) input.setAttribute("aria-describedby", rest.join(" "));
      else input.removeAttribute("aria-describedby");
    }
    document.getElementById(errorId)?.remove();
  }

  function bind(): void {
    const root = document.getElementById("mb-checkout");
    if (!root) return;

    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-buyer]").forEach((el) => {
      const field = asBuyerField(el.dataset.buyer);
      if (!field) return;
      if (el instanceof HTMLSelectElement) {
        // A área muda a taxa de entrega e o total: redesenha.
        el.addEventListener("change", () => {
          setBuyerField(field, el.value);
          delete errors[field];
          resetPending();
          redraw();
        });
      } else {
        el.addEventListener("input", () => { setBuyerField(field, el.value); clearError(field); });
      }
    });

    root.querySelectorAll<HTMLElement>("[data-method]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.method as CheckoutMethodId | undefined;
        if (!id || id === selected || !methods.some((m) => m.id === id)) return;
        selected = id;
        resetPending();
        redraw();
      }));

    root.querySelector("#pay")?.addEventListener("click", () => void pay());

    const couponInput = root.querySelector<HTMLInputElement>("#coupon");
    couponInput?.addEventListener("input", () => { coupon.value = couponInput.value; });
    couponInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); }
    });
    root.querySelector("#coupon-apply")?.addEventListener("click", () => void applyCoupon());
    root.querySelector("#coupon-remove")?.addEventListener("click", removeCoupon);

    root.querySelector("#step-next")?.addEventListener("click", stepNext);
    root.querySelector("#step-back")?.addEventListener("click", () => gotoStep(1));
    bindStatusCheck();
  }

  /* ---------------------------- Código de desconto ---------------------------- */

  /** Valida o código escrito e aplica-o. Um pedido de cada vez. */
  async function applyCoupon(): Promise<void> {
    if (coupon.busy) return;
    const input = document.getElementById("coupon") as HTMLInputElement | null;
    const code = normalizeDiscountCode(input?.value ?? coupon.value ?? "");
    coupon.value = code;
    if (!code) {
      coupon.message = "Escreva o código de desconto.";
      coupon.error = true;
      redraw();
      focusEl("#coupon");
      announce(coupon.message);
      return;
    }
    coupon.busy = true;
    coupon.message = "A validar o código…";
    coupon.error = false;
    // O total vai mudar: um aviso de pagamento pendente deixa de valer.
    resetPending();
    redraw();
    let found: ValidDiscount | null = null;
    try {
      found = await validateDiscount(storeId, code);
    } finally {
      coupon.busy = false;
    }
    if (!found) {
      applied = null;
      coupon.message = "Código inválido ou expirado.";
      coupon.error = true;
    } else {
      applied = found;
      coupon.value = found.code;
      const label = found.type === "percent" ? `${found.value}%` : formatKz(found.value);
      coupon.message = `Código ${found.code} aplicado: ${label} de desconto.`;
      coupon.error = false;
    }
    resetPending();
    redraw();
    announce(coupon.message);
  }

  function removeCoupon(): void {
    applied = null;
    coupon.value = "";
    coupon.message = "Código removido.";
    coupon.error = false;
    resetPending();
    redraw();
    focusEl("#coupon");
    announce(coupon.message);
  }

  /* --------------------------------- Validação -------------------------------- */

  /** Mostra os erros do formulário e leva o foco ao primeiro campo por corrigir. */
  function showErrors(found: Partial<Record<BuyerField, string>>): void {
    errors = found;
    resetPending();
    const first = firstBuyerError(found);
    const selector = first ? `#c-${first}` : undefined;
    announce("Há dados por corrigir: veja as mensagens junto de cada campo.");
    if (variant === "moderno" && step !== 1) { gotoStep(1, undefined, selector); return; }
    redraw();
    focusEl(selector);
  }

  function validateBuyer(): boolean {
    const found = buyerErrors(buyer, { physical, areas: areaNames });
    if (Object.keys(found).length) { showErrors(found); return false; }
    errors = {};
    return true;
  }

  /* ------------------------------- Fluxo por etapas ------------------------------- */

  function drawSteps(): void {
    step = 1;
    shell(`
      <div id="mb-stepper" class="mb-8">${renderStepper(1)}</div>
      <div id="mb-step" style="transition:opacity .25s ease, transform .25s ease">${stepPanel(1)}</div>`);
    bind();
  }

  function stepPanel(n: 1 | 2): string {
    const c = ctx();
    if (n === 1) {
      return `<div class="max-w-xl mx-auto">
        <h1 id="step-title" tabindex="-1" class="text-2xl md:text-3xl font-black text-neutral-900 outline-none">Os seus dados</h1>
        <p class="text-neutral-600 mt-1 mb-6 text-sm">Precisamos destes dados para concluir a encomenda.</p>
        ${renderCustomerFields(c)}
        <button id="step-next" type="button" class="w-full mt-6 py-4 rounded-xl font-bold inline-flex items-center justify-center gap-2 active:scale-[.99]" style="background:var(--brand);color:var(--brand-ink,#fff);box-shadow:0 10px 24px -10px var(--brand)">Continuar <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
      </div>`;
    }
    const tiles = methods.map((m) => renderMethodTile(m, selected === m.id)).join("");
    const cols = Math.min(methods.length, 3);
    return `<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
      <div class="lg:col-span-7 order-2 lg:order-1">
        <button id="step-back" type="button" class="text-sm text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 mb-3"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span> Editar dados</button>
        <h1 id="step-title" tabindex="-1" class="text-2xl md:text-3xl font-black text-neutral-900 outline-none">Pagamento</h1>
        <p class="text-neutral-600 mt-1 mb-6 text-sm">Escolha como quer pagar.</p>
        ${renderMethodGroup(`grid grid-cols-${cols} gap-2 sm:gap-3`, tiles)}
        <div class="mt-6">${renderPayButton(selected, paying)}</div>
        ${renderSecureNote(c)}
      </div>
      <div class="lg:col-span-5 order-1 lg:order-2">${renderOrderSummaryCard(c)}</div>
    </div>`;
  }

  function stepNext(): void {
    if (!validateBuyer()) return;
    gotoStep(2);
  }

  function gotoStep(n: 1 | 2 | 3, customPanel?: string, focusSelector?: string): void {
    const el = document.getElementById("mb-step");
    if (!el) return;
    const swap = (): void => {
      step = n;
      const stp = document.getElementById("mb-stepper");
      if (stp) stp.innerHTML = renderStepper(n);
      el.innerHTML = customPanel ?? stepPanel(n === 3 ? 2 : n);
      bind();
      showNotice();
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      // O foco segue a mudança de ecrã: o título do passo (ou o campo por
      // corrigir), para o leitor de ecrã anunciar onde o comprador está.
      focusEl(focusSelector ?? (n === 3 ? "#done-title" : "#step-title"));
    };
    if (reducedMotion()) { swap(); return; }
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    window.setTimeout(() => requestAnimationFrame(swap), 200);
  }

  /* -------------------------------- Pagamento -------------------------------- */

  async function pay(): Promise<void> {
    if (paying || sendingWa) return;
    const items = getCart(storeId);
    if (!items.length) { setNotice(errorNotice("O carrinho está vazio.")); return; }
    if (!selected) { setNotice(errorNotice("Escolha uma forma de pagamento.")); return; }
    if (!validateBuyer()) return;

    if (selected === "whatsapp") { sendWhatsApp(items); return; }

    const lines = orderRequestLines(items);
    if (exceedsOrderLimits(lines)) {
      setNotice(errorNotice(
        `Um pagamento pode ter até ${MAX_ORDER_LINES} artigos diferentes e ${MAX_LINE_QUANTITY} unidades de cada. Ajuste o carrinho ou encomende por WhatsApp.`,
      ));
      return;
    }
    const expected = checkoutTotal(ctx());
    // O servidor recusa cobrar 0 Kz (`INVALID_TOTAL`): um desconto que cobre
    // tudo só pode seguir por WhatsApp.
    if (!(expected > 0)) {
      setNotice(errorNotice("Com o desconto, o total desta encomenda é zero. Conclua-a por WhatsApp."));
      return;
    }
    // Abaixo do mínimo, o fornecedor aceita a cobrança, o cliente paga e **o
    // valor não é creditado**. Recusar aqui poupa-lhe esse desfecho.
    if (expected < MIN_PAYMENT_KZ) {
      setNotice(errorNotice(
        `O pagamento digital exige um total de pelo menos ${formatKz(MIN_PAYMENT_KZ)}. Para este valor, conclua a encomenda por WhatsApp.`,
      ));
      return;
    }
    await submitDigital(selected, lines, expected);
  }

  /** Mostra o botão de pagar ocupado, sem o desativar (o foco fica nele). */
  function setPayBusy(busy: boolean): void {
    const btn = document.getElementById("pay");
    if (!btn) return;
    const label = btn.querySelector<HTMLElement>("[data-pay-label]");
    if (busy) {
      btn.setAttribute("aria-disabled", "true");
      btn.setAttribute("aria-busy", "true");
      btn.setAttribute("aria-label", "A processar…");
      btn.style.opacity = "0.75";
      if (label) label.textContent = "A processar…";
    } else {
      redraw();
    }
  }

  /**
   * Inicia o pagamento digital com o payload que `/api/payment` espera: sem
   * preços, com as linhas, os dados do comprador, o código de desconto e o
   * total que o comprador viu.
   */
  async function submitDigital(method: DigitalPaymentMethod, lines: OrderRequestLine[], expected: number): Promise<void> {
    if (paying) return;
    paying = true;
    notice = null;
    showNotice();
    setPayBusy(true);
    announce("A processar o pagamento…");

    const customer = buyerCustomer(buyer, { physical });
    let res: PaymentResult;
    try {
      res = await initPayment({
        kind: "store",
        storeId,
        method,
        lines: lines.map((l) => (l.variantKey === undefined
          ? { id: l.id, quantity: l.quantity }
          : { id: l.id, variantKey: l.variantKey, quantity: l.quantity })),
        customer,
        ...(applied ? { discountCode: applied.code } : {}),
        expectedTotal: expected,
        ...(method === "mcx" && customer.phone ? { phone: customer.phone } : {}),
      });
    } finally {
      paying = false;
    }

    if (res.success) {
      lastPayment = res;
      purchaseValue = typeof res.amount === "number" ? res.amount : expected;
      /*
       * O cliente paga na página do fornecedor — é lá que ele confirma no
       * telemóvel ou pede a referência do ATM. O carrinho **não** é esvaziado
       * aqui: a cobrança está criada, não paga. Quem o esvazia é o regresso,
       * depois de o servidor confirmar.
       */
      if (res.hostedUrl && res.id) {
        rememberPending(res.id);
        announce("A abrir a página de pagamento.");
        window.location.href = res.hostedUrl;
        return;
      }
      // Sem página alojada (um fornecedor que cobre logo): o estado manda.
      if (res.status === "paid") {
        clearCart(storeId);
        updateCartBadge(storeId);
        trackPixel(custom, { type: "Purchase", value: purchaseValue });
        showConfirmation(successInner(res.invoiceUrl ?? null));
      } else if (method === "reference") {
        showConfirmation(referenceInner(res));
      } else {
        showConfirmation(mcxPendingInner(customer.phone));
      }
      return;
    }

    setPayBusy(false);
    const code = res.code ?? "";
    if (code === "PRICE_CHANGED" && typeof res.total === "number" && Number.isFinite(res.total)) {
      pendingRetry = { method, lines, total: res.total };
      setNotice(priceChangedNotice(expected, res.total), "#price-confirm");
      return;
    }
    if (DIGITAL_UNAVAILABLE.has(code)) {
      setNotice(unavailableNotice(res.error, code), "#use-whatsapp");
      return;
    }
    if (code === "INVALID_DISCOUNT") {
      // O código deixou de valer entre aplicá-lo e pagar (esgotou ou caducou).
      applied = null;
      coupon.message = "Código inválido ou expirado.";
      coupon.error = true;
      redraw();
      setNotice(errorNotice("O código de desconto deixou de ser válido e foi retirado. Confirme o novo total antes de pagar."), "#coupon");
      return;
    }
    if (code === "INVALID_AREA") {
      // Com produtos físicos o campo está no ecrã. Sem eles, foi a loja que
      // mudou um produto para físico depois de esta página carregar: o campo
      // não existe aqui, e só um recarregamento o mostra.
      if (physical) showErrors({ area: res.error || BUYER_MESSAGES.areaMissing });
      else setNotice(errorNotice("A loja passou a pedir a área de entrega para esta encomenda. Recarregue a página para a escolher."));
      return;
    }
    if (code === "MISSING_PHONE") { showErrors({ phone: res.error || BUYER_MESSAGES.phoneInvalid }); return; }
    setNotice(errorNotice(res.error || "Não foi possível processar o pagamento. Tente de novo."));
  }

  /** Envia a encomenda por WhatsApp — itens, entrega, desconto e os dados do comprador. */
  function sendWhatsApp(items: CartItem[]): void {
    if (sendingWa) return;
    sendingWa = true;
    window.setTimeout(() => { sendingWa = false; }, WHATSAPP_COOLDOWN_MS);

    const t = totals();
    const customer = buyerCustomer(buyer, { physical });
    // A área segue mesmo com a entrega grátis: a mensagem escreve «(grátis)».
    const area = physical ? customer.area : undefined;
    const msg = buildCartWhatsAppMessage(
      items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, variantLabel: i.variantLabel })),
      formatKz,
      {
        delivery: area ? { area, fee: t.fee } : undefined,
        discount: applied && t.discount > 0 ? { code: applied.code, amount: t.discount } : undefined,
        customer: {
          name: customer.name,
          phone: customer.phone ? `+${customer.phone}` : undefined,
          address: customer.address,
          email: customer.email,
          nif: customer.nif,
        },
      },
    );
    const href = waLink(waPhone, msg);
    window.open(href, "_blank", "noopener");
    void trackStoreEvent(storeId, "whatsapp_order");
    /*
     * A encomenda fica gravada para o Dono a ver no painel.
     *
     * Até agora, uma loja que só vende por WhatsApp não guardava nada: se a
     * mensagem não chegasse — porque o cliente desistiu a meio, ou abriu a
     * conversa e fechou-a — a venda desaparecia sem ninguém saber que existiu.
     * Não esperamos pelo resultado: a conversa já abriu, e uma falha a gravar
     * não pode atrapalhar a encomenda.
     */
    void recordWhatsappOrder({
      storeId,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, variantLabel: i.variantLabel })),
      subtotal: t.subtotal,
      deliveryFee: physical ? t.fee : 0,
      discountAmount: t.discount,
      total: Math.max(0, t.subtotal + (physical ? t.fee : 0) - t.discount),
      customer,
      origin: "checkout",
    });
    setNotice(whatsappSentNotice(href));
    announce("A abrir o WhatsApp com a sua encomenda. Envie a mensagem para a loja receber o pedido.");
  }

  /* ------------------------------- Confirmações ------------------------------- */

  /** Mostra a confirmação: no fluxo por etapas anima para o passo 3; senão troca o miolo. */
  function showConfirmation(inner: string): void {
    resetPending();
    if (variant === "moderno" && document.getElementById("mb-step")) {
      gotoStep(3, inner);
    } else {
      paint(inner);
      bindStatusCheck();
      focusEl("#done-title");
    }
  }

  /** «Já paguei — verificar»: pergunta ao servidor o estado da encomenda. */
  function bindStatusCheck(): void {
    const id = lastPayment?.id;
    const btn = document.getElementById("check");
    if (!btn || !id) return;
    let busy = false;
    btn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      btn.setAttribute("aria-busy", "true");
      btn.setAttribute("aria-disabled", "true");
      const statusEl = document.getElementById("ref-status");
      if (statusEl) statusEl.textContent = "A verificar…";
      const st = await checkStatus({ kind: "store", id });
      busy = false;
      btn.removeAttribute("aria-busy");
      btn.removeAttribute("aria-disabled");
      if (st.success && st.status === "paid") {
        trackPixel(custom, { type: "Purchase", value: purchaseValue });
        showConfirmation(successInner(st.invoiceUrl ?? null));
        return;
      }
      const text = !st.success
        ? (st.error || "Não foi possível verificar o pagamento. Tente de novo dentro de momentos.")
        : st.status === "cancelled" || st.status === "failed"
          ? "O pagamento não foi concluído. Pode voltar à loja e fazer uma nova encomenda."
          : "Ainda não recebemos a confirmação. Aguarde alguns minutos e tente de novo.";
      if (statusEl) statusEl.textContent = text;
    });
  }

  function homeLink(): string {
    return `<a href="${esc(homeHref)}" class="block text-center mt-3 text-sm font-medium text-neutral-700 hover:text-neutral-900 underline">Voltar à loja</a>`;
  }

  /**
   * Compra paga.
   *
   * A fatura é emitida pela empresa da loja (certificada pela AGT) e pode
   * demorar alguns segundos a sair. Quando ainda não existe, dizemos que chega
   * por email em vez de mostrar um botão que não leva a nada.
   */
  function successInner(invoiceUrl: string | null, invoiceStatus: string | null = null): string {
    const invoice = safeHttpsUrl(invoiceUrl);
    const porEmitir = !invoice && invoiceStatus !== "skipped";
    return `<div class="max-w-md mx-auto text-center py-10">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12)"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:36px;color:#047857">check_circle</span></div>
      <h1 id="done-title" tabindex="-1" class="text-2xl font-black mt-4 outline-none">Pagamento confirmado</h1>
      <p class="text-neutral-600 mt-2">Obrigado pela sua compra. A loja já recebeu a sua encomenda.</p>
      ${porEmitir ? `<p class="text-sm text-neutral-600 mt-3">A fatura está a ser emitida e chega-lhe por email, se o indicou.</p>` : ""}
      <div class="flex flex-col gap-3 mt-8">
        ${invoice ? `<a href="${esc(invoice)}" target="_blank" rel="noopener" class="py-3.5 rounded-xl font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">receipt_long</span> Ver fatura</a>` : ""}
        <a href="${esc(homeHref)}" class="py-3.5 rounded-xl border border-neutral-400 text-neutral-800 font-semibold hover:bg-neutral-50">Voltar à loja</a>
      </div>
    </div>`;
  }

  /** Ecrã de espera enquanto o servidor confirma o pagamento com o fornecedor. */
  function confirmingInner(): string {
    return `<div class="max-w-md mx-auto text-center py-16">
      <span class="inline-block w-8 h-8 rounded-full border-[3px] border-neutral-200 animate-spin" style="border-top-color:var(--brand)" aria-hidden="true"></span>
      <h1 id="done-title" tabindex="-1" role="status" aria-live="polite" class="text-xl font-black mt-5 outline-none">A confirmar o pagamento…</h1>
      <p class="text-neutral-600 mt-2 text-sm">Não feche esta página.</p>
    </div>`;
  }

  /**
   * Pagamento por concluir: o cliente voltou sem ter pago, ou a confirmação
   * ainda não chegou. O botão de verificar fica aqui — e o carrinho fica como
   * estava, para ele poder tentar outra vez.
   */
  function pendingInner(message: string | null, falhou: boolean): string {
    const texto = message
      ?? (falhou
        ? "O pagamento não foi concluído. O seu carrinho ficou como estava: pode tentar de novo."
        : "Ainda não recebemos a confirmação do pagamento. Se já pagou, a loja confirma a encomenda assim que o banco processar.");
    return `<div class="max-w-md mx-auto text-center py-12">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:#fffbeb"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:34px;color:#b45309">schedule</span></div>
      <h1 id="done-title" tabindex="-1" class="text-2xl font-black mt-4 outline-none">Pagamento por confirmar</h1>
      <p class="text-neutral-600 mt-2">${esc(texto)}</p>
      ${statusCheck("Já paguei, verificar")}
      ${homeLink()}
    </div>`;
  }

  /** Pagamento recusado, com o motivo do fornecedor quando ele o dá. */
  function failedInner(message: string | null): string {
    return `<div class="max-w-md mx-auto text-center py-12">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:#fef2f2"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:34px;color:#b91c1c">error</span></div>
      <h1 id="done-title" tabindex="-1" class="text-2xl font-black mt-4 outline-none">O pagamento não foi concluído</h1>
      <p class="text-neutral-600 mt-2">${esc(message ?? "Não foi possível concluir o pagamento. Pode tentar de novo, ou encomendar por WhatsApp.")}</p>
      <p class="text-sm text-neutral-600 mt-3">O seu carrinho ficou como estava.</p>
      <div class="flex flex-col gap-3 mt-8">
        <a href="${esc(location.pathname)}" class="py-3.5 rounded-xl font-bold" style="background:var(--brand);color:var(--brand-ink,#fff)">Tentar de novo</a>
        <a href="${esc(homeHref)}" class="py-3.5 rounded-xl border border-neutral-400 text-neutral-800 font-semibold hover:bg-neutral-50">Voltar à loja</a>
      </div>
    </div>`;
  }

  /** Botão «verificar» + estado, comum à Referência e ao Multicaixa Express por confirmar. */
  function statusCheck(label: string): string {
    return `<p id="ref-status" role="status" aria-live="polite" class="mt-5 text-center text-sm text-neutral-700"></p>
      <button id="check" type="button" class="w-full mt-4 py-3.5 rounded-xl font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">refresh</span> ${esc(label)}</button>`;
  }

  function referenceInner(res: PaymentResult): string {
    const ref = res.reference ?? null;
    const due = dateText(ref?.dueDate);
    const row = (label: string, value: string, strong = true): string =>
      `<div class="flex items-center justify-between gap-3"><dt class="text-neutral-600">${esc(label)}</dt><dd class="${strong ? "font-black text-lg tracking-wider" : "font-semibold"} text-neutral-900">${esc(value)}</dd></div>`;
    return `<div class="max-w-md mx-auto py-8">
      <div class="text-center">
        <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:rgba(0,0,0,.05)"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:36px;color:var(--brand)">receipt_long</span></div>
        <h1 id="done-title" tabindex="-1" class="text-2xl font-black mt-4 outline-none">Referência gerada</h1>
        <p class="text-neutral-600 mt-2">Pague no Multicaixa (ATM) ou no Internet Banking com os dados abaixo.</p>
      </div>
      <dl class="bg-white border border-neutral-200 rounded-2xl p-6 mt-6 space-y-3">
        ${row("Entidade", ref?.entity ?? "-")}
        ${row("Referência", ref?.number ?? "-")}
        ${row("Montante", formatKz(typeof res.amount === "number" ? res.amount : purchaseValue))}
        ${due ? row("Validade", due, false) : ""}
      </dl>
      ${statusCheck("Já paguei, verificar")}
      ${homeLink()}
    </div>`;
  }

  /** Multicaixa Express à espera da confirmação do comprador na aplicação. */
  function mcxPendingInner(phone: string | undefined): string {
    const to = phone ? ` para o número +${phone}` : "";
    return `<div class="max-w-md mx-auto py-8 text-center">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:rgba(0,0,0,.05)"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:36px;color:var(--brand)">smartphone</span></div>
      <h1 id="done-title" tabindex="-1" class="text-2xl font-black mt-4 outline-none">Confirme o pagamento no telemóvel</h1>
      <p class="text-neutral-600 mt-2">Enviámos o pedido de pagamento de ${esc(formatKz(purchaseValue))}${esc(to)}. Abra a aplicação Multicaixa Express e confirme.</p>
      ${statusCheck("Já confirmei, verificar")}
      ${homeLink()}
    </div>`;
  }

  /* ------------------------- Regresso da página de pagamento ------------------------- */

  /**
   * Confirma o pagamento depois de o cliente voltar do fornecedor.
   *
   * O endereço de regresso **não prova nada** — é trivial de abrir à mão. Quem
   * decide é `/api/payment-status`, que pergunta ao fornecedor e grava o
   * resultado. Enquanto a resposta não chega, o ecrã diz que está a confirmar,
   * e o carrinho só é esvaziado quando a venda estiver paga de facto.
   *
   * O fornecedor só responde ao estado durante cerca de cinco minutos. Fora
   * dessa janela (uma referência paga mais tarde) a resposta traz
   * `window: "closed"`: aí a página explica que a loja confirma quando o banco
   * processar, em vez de mostrar um erro.
   */
  async function confirmarRegresso(paymentId: string, falhou: boolean): Promise<void> {
    forgetPending();
    shell(confirmingInner());
    const st = await checkStatus({ kind: "store", id: paymentId });
    lastPayment = { success: true, id: paymentId, reference: st.reference ?? null };

    if (st.success && st.status === "paid") {
      clearCart(storeId);
      updateCartBadge(storeId);
      trackPixel(custom, { type: "Purchase", value: purchaseValue });
      paint(successInner(st.invoiceUrl ?? null, st.invoiceStatus ?? null));
      focusEl("#done-title");
      return;
    }
    if (st.success && (st.status === "failed" || st.status === "cancelled")) {
      paint(failedInner(st.message ?? null));
      bind();
      focusEl("#done-title");
      return;
    }
    // Ainda aberto: com referência emitida mostra-se a referência; sem ela, a
    // espera (e o botão de verificar outra vez).
    if (st.reference?.number) {
      paint(referenceInner({ success: true, id: paymentId, reference: st.reference }));
      bindStatusCheck();
      focusEl("#done-title");
      return;
    }
    paint(pendingInner(st.message ?? null, falhou));
    bindStatusCheck();
    focusEl("#done-title");
  }

  const regresso = pendingFromUrl();
  if (regresso) {
    void confirmarRegresso(regresso.id, regresso.falhou);
    return;
  }

  /* ---------------------------------- Arranque ---------------------------------- */

  if (getCart(storeId).length === 0) { shell(emptyCart()); return; }
  void trackStoreEvent(storeId, "checkout_start");
  // Fluxo por etapas para "moderno", página única para os restantes.
  if (variant === "moderno") drawSteps();
  else { shell(renderCheckout(variant, ctx())); bind(); }
}

/* ------------------------- Pagamento a decorrer (módulo) ------------------------- */

/**
 * Chave onde fica o pagamento que está a ser pago na página do fornecedor.
 *
 * O cliente sai do site e volta; o id tem de atravessar essa ida. Fica em
 * `sessionStorage` (só este separador, e desaparece ao fechá-lo) e serve de
 * reserva quando o fornecedor o devolve sem o parâmetro no endereço.
 */
const PENDING_KEY = "mb-pagamento-pendente";

/** Guarda o pagamento que o cliente vai pagar lá fora. */
function rememberPending(id: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, id);
  } catch { /* sem sessionStorage: o parâmetro do endereço basta */ }
}

/** Esquece-o: já foi confirmado (ou falhou). */
function forgetPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch { /* nada a fazer */ }
}

/** Forma de um identificador de pagamento (UUID), para não consultar lixo. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O pagamento que está a ser confirmado, lido do endereço de regresso
 * (`?pagamento=<id>`) ou, em falta dele, do que ficou guardado.
 */
function pendingFromUrl(): { id: string; falhou: boolean } | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    return null;
  }
  const doUrl = params.get("pagamento") ?? "";
  const falhou = params.get("falhou") === "1";
  if (UUID.test(doUrl)) return { id: doUrl, falhou };
  if (!params.has("pagamento")) return null;
  // O fornecedor devolveu o cliente sem o id: usa-se o que ficou guardado.
  try {
    const guardado = sessionStorage.getItem(PENDING_KEY) ?? "";
    return UUID.test(guardado) ? { id: guardado, falhou } : null;
  } catch {
    return null;
  }
}
