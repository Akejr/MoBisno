/**
 * Checkout da loja — finalização a sério com três opções (Multicaixa Express,
 * Referência Bancária e WhatsApp), em 4 layouts selecionáveis no editor
 * (`custom.checkout.variant`). O HTML dos layouts vive em
 * `web/templates/checkoutLayouts.ts` (partilhado com a pré-visualização).
 *
 * As opções online só aparecem quando a loja tem `custom.payments.onlineEnabled`.
 * A iniciação real é feita pela função serverless `/api/payment`. Para testar
 * sem cobrar, abra com `?qa=1` no URL.
 */
import { render, $, esc, formatKz, fadeInImages, toast } from "../lib/dom.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getCart, cartTotal, clearCart, updateCartBadge, type CartItem } from "../lib/cart.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyTheme } from "../lib/theme.js";
import { initPayment, checkStatus } from "../lib/paymentsApi.js";
import { renderCheckout, type CheckoutVariant, type CheckoutMethodId } from "../templates/checkoutLayouts.js";
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
  const brand = brandOf(custom, result.store.templateId);
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;
  const cartHref = `${homeHref}/carrinho`;
  const online = !!custom.payments?.onlineEnabled;
  const variant: CheckoutVariant = custom.checkout?.variant ?? "dividido";
  const qa = location.search.includes("qa=1");
  const waPhone = resolveWaPhone(custom);

  let selected: CheckoutMethodId | null = null;

  function products(): PaymentProduct[] {
    return getCart(storeId).map((i: CartItem) => ({
      id: i.productId,
      productName: i.name,
      productPrice: i.price,
      productQuantity: i.quantity,
    }));
  }

  function shell(inner: string): void {
    const app = render(`
      <div class="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
        <header class="sticky top-0 z-50 bg-white border-b border-neutral-100">
          <div class="w-full max-w-[1080px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <a href="${esc(cartHref)}" class="flex items-center gap-1 text-neutral-600 hover:text-neutral-900"><span class="material-symbols-outlined">arrow_back</span> Voltar</a>
            <span class="font-bold truncate">${esc(storeName)}</span>
          </div>
        </header>
        <main class="w-full max-w-[1080px] mx-auto px-4 sm:px-6 py-8 flex-grow">${inner}</main>
      </div>`);
    app.style.setProperty("--brand", brand);
    applyInk(app, custom);
    applyTheme(app, custom);
    fadeInImages(app);
    updateCartBadge(storeId);
  }

  function drawForm(): void {
    const items = getCart(storeId);
    if (items.length === 0) {
      shell(`<div class="py-20 text-center text-neutral-500">
        <span class="material-symbols-outlined" style="font-size:56px;">shopping_cart</span>
        <p class="mt-3">O seu carrinho está vazio.</p>
        <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg text-white font-bold" style="background:var(--brand)">Continuar a comprar</a>
      </div>`);
      return;
    }
    shell(renderCheckout(variant, {
      storeName,
      items: items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity, imageUrl: i.imageUrl })),
      total: cartTotal(storeId),
      online,
      selected,
    }) + (qa ? `<p class="max-w-[1080px] mx-auto text-xs text-center text-neutral-400 mt-4">Modo de teste (QA) ativo — nenhum valor real é cobrado.</p>` : ""));
    bindForm();
  }

  function bindForm(): void {
    document.querySelectorAll<HTMLElement>("[data-method]").forEach((b) =>
      b.addEventListener("click", () => { selected = (b.dataset.method as CheckoutMethodId) ?? null; drawForm(); }));
    $("#pay")?.addEventListener("click", () => void pay());
    $("#coupon-apply")?.addEventListener("click", () => toast("Sem cupões disponíveis de momento."));
  }

  function customer(): { name?: string; nif?: string; phone?: string } {
    const name = ($("#c-name") as HTMLInputElement)?.value.trim() || undefined;
    const nif = ($("#c-nif") as HTMLInputElement)?.value.trim() || undefined;
    const phone = ($("#c-phone") as HTMLInputElement)?.value.trim() || undefined;
    return { name, nif, phone };
  }

  async function pay(): Promise<void> {
    if (!selected) { toast("Escolha uma forma de pagamento.", "error"); return; }
    const items = getCart(storeId);
    if (!items.length) { toast("O carrinho está vazio.", "error"); return; }

    if (selected === "whatsapp") {
      const lines = items.map((i) => `• ${i.quantity}x ${i.name} (${formatKz(i.price * i.quantity)})`).join("\n");
      const msg = `Olá! Gostaria de encomendar:\n${lines}\n\nTotal: ${formatKz(cartTotal(storeId))}`;
      window.open(waLink(waPhone, msg), "_blank", "noopener");
      toast("A abrir o WhatsApp para finalizar…");
      return;
    }

    const c = customer();
    if (selected === "mcx" && !(c.phone && c.phone.replace(/\D/g, "").length >= 9)) {
      toast("Indique um número de telemóvel válido para o Multicaixa Express.", "error");
      return;
    }

    const btn = $("#pay") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; }
    const res = await initPayment({
      kind: "store",
      storeId,
      method: selected,
      products: products(),
      phoneNumber: selected === "mcx" ? c.phone : undefined,
      customer: c,
      qa,
      simulateResult: qa && selected === "mcx" ? "success" : undefined,
    });
    if (btn) { btn.disabled = false; btn.style.opacity = "1"; }

    if (!res.success) { toast(res.error || "Não foi possível processar o pagamento.", "error"); return; }

    clearCart(storeId);
    if (selected === "mcx") drawSuccess(res.invoiceUrl ?? null);
    else drawReference(res);
  }

  function drawSuccess(invoiceUrl: string | null): void {
    shell(`<div class="max-w-md mx-auto text-center py-12">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12);color:#059669"><span class="material-symbols-outlined" style="font-size:36px">check_circle</span></div>
      <h1 class="text-2xl font-black mt-4">Pagamento confirmado!</h1>
      <p class="text-neutral-500 mt-2">Obrigado pela sua compra.</p>
      <div class="flex flex-col gap-3 mt-8">
        ${invoiceUrl ? `<a href="${esc(invoiceUrl)}" target="_blank" rel="noopener" class="py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand)"><span class="material-symbols-outlined text-[20px]">receipt_long</span> Ver fatura</a>` : ""}
        <a href="${esc(homeHref)}" class="py-3 rounded-xl border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50">Voltar à loja</a>
      </div>
    </div>`);
  }

  function drawReference(res: Awaited<ReturnType<typeof initPayment>>): void {
    const due = res.dueDate ? new Date(res.dueDate).toLocaleDateString("pt-PT") : null;
    shell(`<div class="max-w-md mx-auto py-10">
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
      <button id="check" class="w-full mt-4 py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand)"><span class="material-symbols-outlined text-[20px]">refresh</span> Já paguei — verificar</button>
      <a href="${esc(homeHref)}" class="block text-center mt-3 text-sm text-neutral-500 hover:text-neutral-900">Voltar à loja</a>
    </div>`);

    const operationId = res.operationId ?? "";
    const mtx = res.transactionId ?? "";
    let busy = false;
    $("#check")?.addEventListener("click", async () => {
      if (busy || !operationId) return;
      busy = true;
      const statusEl = $("#ref-status");
      if (statusEl) statusEl.textContent = "A verificar…";
      const st = await checkStatus({ operationId, merchantTransactionId: mtx, storeId });
      busy = false;
      if (st.status === "paid") { drawSuccess(st.invoiceUrl ?? null); return; }
      if (st.status === "cancelled" || st.status === "failed") {
        if (statusEl) statusEl.textContent = "Pagamento não concluído. Gere uma nova referência se necessário.";
        return;
      }
      if (statusEl) statusEl.textContent = "Ainda não recebemos a confirmação. Aguarde alguns minutos e tente de novo.";
    });
  }

  drawForm();
}
