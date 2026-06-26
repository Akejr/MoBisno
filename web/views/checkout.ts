/**
 * Checkout da loja — finalização a sério com três opções (Multicaixa Express,
 * Referência Bancária e WhatsApp). 4 layouts selecionáveis no editor
 * (`custom.checkout.variant`); o HTML vive em `web/templates/checkoutLayouts.ts`.
 *
 * O layout "Etapas" (moderno) é um fluxo real: Dados → Pagamento → Confirmação,
 * com transições animadas. Os restantes são de página única.
 *
 * As opções online só aparecem quando a loja tem `custom.payments.onlineEnabled`.
 * Para testar sem cobrar, abra com `?qa=1` no URL.
 */
import { render, $, esc, formatKz, fadeInImages, toast } from "../lib/dom.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getCart, cartTotal, clearCart, updateCartBadge, type CartItem } from "../lib/cart.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyTheme } from "../lib/theme.js";
import { initPayment, checkStatus } from "../lib/paymentsApi.js";
import { getTemplate } from "../templates/registry.js";
import {
  renderCheckout, renderStepper, renderCustomerFields, renderMethodTile,
  checkoutMethods, renderPayButton, renderOrderSummaryCard,
  type CheckoutVariant, type CheckoutMethodId, type CheckoutLayoutCtx,
} from "../templates/checkoutLayouts.js";
import type { PaymentProduct } from "../../src/services/payments.js";

function notFoundShell(): void {
  render(`<div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">storefront</span>
    <h1 class="text-headline-lg text-on-surface">Loja não encontrada</h1>
    <a href="#/" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar ao início</a></div>`);
}

export async function renderCheckoutPage(identifier: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);
  if (view.kind !== "render" || result.kind !== "render") { notFoundShell(); return; }

  const storeId = result.store.id;
  const storeName = view.storeName;
  const template = getTemplate(result.store.templateId);
  const brand = brandOf(custom, result.store.templateId);
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;
  const online = !!custom.payments?.onlineEnabled;
  const variant: CheckoutVariant = custom.checkout?.variant ?? "dividido";
  const qa = location.search.includes("qa=1");
  const waPhone = resolveWaPhone(custom);

  let selected: CheckoutMethodId | null = null;
  const cust: { name?: string; email?: string; nif?: string; phone?: string } = {};

  function products(): PaymentProduct[] {
    return getCart(storeId).map((i: CartItem) => ({
      id: i.productId, productName: i.name, productPrice: i.price, productQuantity: i.quantity,
    }));
  }

  function ctx(): CheckoutLayoutCtx {
    const items = getCart(storeId).map((i) => ({ name: i.name, price: i.price, quantity: i.quantity, imageUrl: i.imageUrl }));
    return { storeName, items, total: cartTotal(storeId), online, selected };
  }

  /** Envolve o conteúdo no cromo da loja (cabeçalho, rodapé, tema, fontes). */
  function shell(inner: string): void {
    const wrapped = template.renderCheckout
      ? template.renderCheckout(view, inner, custom)
      : `<div class="min-h-screen bg-neutral-50"><div class="max-w-[1080px] mx-auto px-4 sm:px-6 py-8">${inner}</div></div>`;
    const app = render(wrapped);
    app.style.setProperty("--brand", brand);
    applyInk(app, custom);
    applyTheme(app, custom);
    fadeInImages(app);
    updateCartBadge(storeId);
  }

  function emptyCart(): string {
    return `<div class="py-20 text-center text-neutral-500">
      <span class="material-symbols-outlined" style="font-size:56px;">shopping_cart</span>
      <p class="mt-3">O seu carrinho está vazio.</p>
      <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg text-white font-bold" style="background:var(--brand)">Continuar a comprar</a>
    </div>`;
  }

  const qaNote = qa ? `<p class="max-w-[1080px] mx-auto text-xs text-center text-neutral-400 mt-4">Modo de teste (QA) ativo — nenhum valor real é cobrado.</p>` : "";

  /* --------------------------- Página única (3 layouts) --------------------------- */

  function drawForm(): void {
    if (getCart(storeId).length === 0) { shell(emptyCart()); return; }
    shell(renderCheckout(variant, ctx()) + qaNote);
    bindMethods();
    $("#pay")?.addEventListener("click", () => void pay());
    $("#coupon-apply")?.addEventListener("click", () => toast("Sem cupões disponíveis de momento."));
  }

  function bindMethods(): void {
    document.querySelectorAll<HTMLElement>("[data-method]").forEach((b) =>
      b.addEventListener("click", () => { selected = (b.dataset.method as CheckoutMethodId) ?? null; drawForm(); }));
  }

  /* ------------------------------- Fluxo por etapas ------------------------------- */

  let step: 1 | 2 | 3 = 1;

  function drawSteps(): void {
    if (getCart(storeId).length === 0) { shell(emptyCart()); return; }
    step = 1; selected = null;
    shell(`
      <div id="mb-stepper" class="mb-8">${renderStepper(1)}</div>
      <div id="mb-step" style="transition:opacity .25s ease, transform .25s ease">${stepPanel(1)}</div>
      ${qaNote}`);
    bindStep();
  }

  function stepPanel(n: 1 | 2 | 3): string {
    if (n === 1) {
      return `<div class="max-w-xl mx-auto">
        <h1 class="text-2xl md:text-3xl font-black text-neutral-900">Os seus dados</h1>
        <p class="text-neutral-500 mt-1 mb-6 text-sm">Precisamos destes dados para concluir a encomenda.</p>
        ${renderCustomerFields({ email: true })}
        <button id="step-next" class="w-full mt-6 py-4 rounded-xl font-bold text-white inline-flex items-center justify-center gap-2 active:scale-[.99]" style="background:var(--brand);box-shadow:0 10px 24px -10px var(--brand)">Continuar <span class="material-symbols-outlined">arrow_forward</span></button>
      </div>`;
    }
    // n === 2
    const tiles = checkoutMethods(online).map((m) => renderMethodTile(m, selected === m.id)).join("");
    const cols = Math.min(checkoutMethods(online).length, 3);
    return `<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
      <div class="lg:col-span-7 order-2 lg:order-1">
        <button id="step-back" class="text-sm text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1 mb-3"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Editar dados</button>
        <h1 class="text-2xl md:text-3xl font-black text-neutral-900">Pagamento</h1>
        <p class="text-neutral-500 mt-1 mb-6 text-sm">Escolha como quer pagar.</p>
        <div class="grid grid-cols-${cols} gap-2 sm:gap-3">${tiles}</div>
        <div class="mt-6">${renderPayButton(selected)}</div>
        <p class="text-center text-xs text-neutral-400 mt-3 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[15px]">verified_user</span> Pagamento 100% seguro e protegido</p>
      </div>
      <div class="lg:col-span-5 order-1 lg:order-2">${renderOrderSummaryCard(ctx())}</div>
    </div>`;
  }

  function captureCustomer(): void {
    cust.name = ($("#c-name") as HTMLInputElement)?.value.trim() || undefined;
    cust.email = ($("#c-email") as HTMLInputElement)?.value.trim() || undefined;
    cust.nif = ($("#c-nif") as HTMLInputElement)?.value.trim() || undefined;
    cust.phone = ($("#c-phone") as HTMLInputElement)?.value.trim() || undefined;
  }

  function prefillCustomer(): void {
    const set = (id: string, v?: string): void => { const el = $(id) as HTMLInputElement | null; if (el && v) el.value = v; };
    set("#c-name", cust.name); set("#c-email", cust.email); set("#c-nif", cust.nif); set("#c-phone", cust.phone);
  }

  function gotoStep(n: 1 | 2 | 3, customPanel?: string): void {
    const el = $("#mb-step");
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    window.setTimeout(() => {
      step = n;
      const stp = $("#mb-stepper");
      if (stp) stp.innerHTML = renderStepper(n);
      el.innerHTML = customPanel ?? stepPanel(n);
      bindStep();
      requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
    }, 200);
  }

  /** Re-renderiza o painel do passo 2 (sem animação) — ao escolher um método. */
  function refreshStep2(): void {
    const el = $("#mb-step");
    if (!el) return;
    el.innerHTML = stepPanel(2);
    bindStep();
  }

  let lastRef: Awaited<ReturnType<typeof initPayment>> | null = null;

  function bindStep(): void {
    // Passo 1
    prefillCustomer();
    $("#step-next")?.addEventListener("click", () => { captureCustomer(); gotoStep(2); });
    // Passo 2
    document.querySelectorAll<HTMLElement>("[data-method]").forEach((b) =>
      b.addEventListener("click", () => { selected = (b.dataset.method as CheckoutMethodId) ?? null; refreshStep2(); }));
    $("#step-back")?.addEventListener("click", () => gotoStep(1));
    $("#pay")?.addEventListener("click", () => void pay());
    $("#coupon-apply")?.addEventListener("click", () => toast("Sem cupões disponíveis de momento."));
    // Passo 3 (referência)
    bindReferenceCheck();
  }

  function bindReferenceCheck(): void {
    const ref = lastRef;
    if (!ref) return;
    const operationId = ref.operationId ?? "";
    const mtx = ref.transactionId ?? "";
    let busy = false;
    $("#check")?.addEventListener("click", async () => {
      if (busy || !operationId) return;
      busy = true;
      const statusEl = $("#ref-status");
      if (statusEl) statusEl.textContent = "A verificar…";
      const st = await checkStatus({ operationId, merchantTransactionId: mtx, storeId });
      busy = false;
      if (st.status === "paid") { showConfirmation(successInner(st.invoiceUrl ?? null)); return; }
      if (statusEl) statusEl.textContent = st.status === "cancelled" || st.status === "failed"
        ? "Pagamento não concluído. Gere uma nova referência se necessário."
        : "Ainda não recebemos a confirmação. Aguarde alguns minutos e tente de novo.";
    });
  }

  /** Mostra a confirmação: no fluxo por etapas anima para o passo 3; senão re-renderiza. */
  function showConfirmation(inner: string): void {
    if (variant === "moderno" && $("#mb-step")) {
      gotoStep(3, inner);
    } else {
      shell(inner + qaNote);
      bindReferenceCheck();
    }
  }

  /* --------------------------------- Pagamento --------------------------------- */

  async function pay(): Promise<void> {
    if (!selected) { toast("Escolha uma forma de pagamento.", "error"); return; }
    const items = getCart(storeId);
    if (!items.length) { toast("O carrinho está vazio.", "error"); return; }

    // No fluxo por etapas os dados já foram capturados; na página única, lê agora.
    if (variant !== "moderno") {
      cust.name = ($("#c-name") as HTMLInputElement)?.value.trim() || cust.name;
      cust.nif = ($("#c-nif") as HTMLInputElement)?.value.trim() || cust.nif;
      cust.phone = ($("#c-phone") as HTMLInputElement)?.value.trim() || cust.phone;
    }

    if (selected === "whatsapp") {
      const lines = items.map((i) => `• ${i.quantity}x ${i.name} (${formatKz(i.price * i.quantity)})`).join("\n");
      const msg = `Olá! Gostaria de encomendar:\n${lines}\n\nTotal: ${formatKz(cartTotal(storeId))}`;
      window.open(waLink(waPhone, msg), "_blank", "noopener");
      toast("A abrir o WhatsApp para finalizar…");
      return;
    }

    if (selected === "mcx" && !(cust.phone && cust.phone.replace(/\D/g, "").length >= 9)) {
      toast("Indique um número de telemóvel válido para o Multicaixa Express.", "error");
      if (variant === "moderno") gotoStep(1);
      return;
    }

    const btn = $("#pay") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; }
    const res = await initPayment({
      kind: "store", storeId, method: selected, products: products(),
      phoneNumber: selected === "mcx" ? cust.phone : undefined,
      customer: { name: cust.name, nif: cust.nif, phone: cust.phone },
      qa, simulateResult: qa && selected === "mcx" ? "success" : undefined,
    });
    if (btn) { btn.disabled = false; btn.style.opacity = "1"; }

    if (!res.success) { toast(res.error || "Não foi possível processar o pagamento.", "error"); return; }

    clearCart(storeId);
    if (selected === "mcx") { showConfirmation(successInner(res.invoiceUrl ?? null)); }
    else { lastRef = res; showConfirmation(referenceInner(res)); }
  }

  /* ------------------------------- Confirmações ------------------------------- */

  function successInner(invoiceUrl: string | null): string {
    return `<div class="max-w-md mx-auto text-center py-10">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12);color:#059669"><span class="material-symbols-outlined" style="font-size:36px">check_circle</span></div>
      <h1 class="text-2xl font-black mt-4">Pagamento confirmado!</h1>
      <p class="text-neutral-500 mt-2">Obrigado pela sua compra.</p>
      <div class="flex flex-col gap-3 mt-8">
        ${invoiceUrl ? `<a href="${esc(invoiceUrl)}" target="_blank" rel="noopener" class="py-3.5 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand)"><span class="material-symbols-outlined text-[20px]">receipt_long</span> Ver fatura</a>` : ""}
        <a href="${esc(homeHref)}" class="py-3.5 rounded-xl border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50">Voltar à loja</a>
      </div>
    </div>`;
  }

  function referenceInner(res: Awaited<ReturnType<typeof initPayment>>): string {
    const due = res.dueDate ? new Date(res.dueDate).toLocaleDateString("pt-PT") : null;
    return `<div class="max-w-md mx-auto py-8">
      <div class="text-center">
        <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:rgba(0,0,0,.05)"><span class="material-symbols-outlined" style="font-size:36px;color:var(--brand)">receipt_long</span></div>
        <h1 class="text-2xl font-black mt-4">Referência gerada</h1>
        <p class="text-neutral-500 mt-2">Pague no ATM ou Internet Banking com os dados abaixo.</p>
      </div>
      <div class="bg-white border border-neutral-200 rounded-2xl p-6 mt-6 space-y-3">
        <div class="flex items-center justify-between"><span class="text-neutral-500">Entidade</span><span class="font-black text-lg tracking-wider">${esc(res.entity ?? "—")}</span></div>
        <div class="flex items-center justify-between"><span class="text-neutral-500">Referência</span><span class="font-black text-lg tracking-wider">${esc(res.referenceNumber ?? "—")}</span></div>
        <div class="flex items-center justify-between"><span class="text-neutral-500">Montante</span><span class="font-black text-lg" style="color:var(--brand)">${esc(formatKz(res.amount ?? cartTotal(storeId)))}</span></div>
        ${due ? `<div class="flex items-center justify-between"><span class="text-neutral-500">Validade</span><span class="font-semibold">${esc(due)}</span></div>` : ""}
      </div>
      <div id="ref-status" class="mt-5 text-center text-sm text-neutral-500"></div>
      <button id="check" class="w-full mt-4 py-3.5 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand)"><span class="material-symbols-outlined text-[20px]">refresh</span> Já paguei — verificar</button>
      <a href="${esc(homeHref)}" class="block text-center mt-3 text-sm text-neutral-500 hover:text-neutral-900">Voltar à loja</a>
    </div>`;
  }

  // Arranque: fluxo por etapas para "moderno", página única para os restantes.
  if (variant === "moderno") drawSteps();
  else drawForm();
}
