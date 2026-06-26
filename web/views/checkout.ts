/**
 * Checkout da loja — finalização a sério com três opções:
 *  - Multicaixa Express (imediato)
 *  - Referência Bancária (diferido, com verificação de estado)
 *  - WhatsApp (sempre disponível)
 *
 * As opções online só aparecem quando a loja tem `custom.payments.onlineEnabled`.
 * A iniciação real é feita pela função serverless `/api/payment` (a chave MoMenu
 * vive só no servidor). Para testar sem cobrar, abra com `?qa=1` no URL.
 */
import { render, $, esc, formatKz, fadeInImages, toast } from "../lib/dom.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getCart, cartTotal, clearCart, updateCartBadge, type CartItem } from "../lib/cart.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyTheme } from "../lib/theme.js";
import { initPayment, checkStatus } from "../lib/paymentsApi.js";
import type { PaymentProduct } from "../../src/services/payments.js";

type Method = "mcx" | "reference" | "whatsapp";

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
  const brand = brandOf(custom, result.store.templateId);
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;
  const cartHref = `${homeHref}/carrinho`;
  const online = !!custom.payments?.onlineEnabled;
  const qa = /[?&]qa=1\b/.test(location.search) || location.search.includes("qa=1");
  const waPhone = resolveWaPhone(custom);

  let method: Method = online ? "mcx" : "whatsapp";

  function products(): PaymentProduct[] {
    return getCart(storeId).map((i: CartItem) => ({
      id: i.productId,
      productName: i.name,
      productPrice: i.price,
      productQuantity: i.quantity,
    }));
  }

  function summaryHtml(): string {
    const items = getCart(storeId);
    return `<div class="bg-white border border-neutral-200 rounded-2xl p-5">
      <h2 class="font-bold text-neutral-900 mb-3">Resumo</h2>
      <div class="divide-y divide-neutral-100">
        ${items.map((i) => `<div class="flex items-center justify-between py-2 text-sm">
          <span class="text-neutral-600 truncate pr-2">${i.quantity}× ${esc(i.name)}</span>
          <span class="font-medium text-neutral-900 whitespace-nowrap">${esc(formatKz(i.price * i.quantity))}</span>
        </div>`).join("")}
      </div>
      <div class="flex items-center justify-between mt-3 pt-3 border-t border-neutral-200">
        <span class="text-neutral-600">Total</span>
        <span class="font-black text-2xl" style="color:var(--brand)">${esc(formatKz(cartTotal(storeId)))}</span>
      </div>
    </div>`;
  }

  function methodCard(id: Method, icon: string, title: string, desc: string): string {
    const active = method === id;
    return `<button type="button" data-method="${id}" class="w-full text-left rounded-2xl border-2 p-4 flex items-start gap-3 transition-colors" style="border-color:${active ? "var(--brand)" : "#e5e7eb"};background:${active ? "rgba(0,0,0,.02)" : "#fff"}">
      <span class="material-symbols-outlined" style="color:var(--brand)">${icon}</span>
      <span class="flex-1">
        <span class="block font-bold text-neutral-900">${esc(title)}</span>
        <span class="block text-sm text-neutral-500">${esc(desc)}</span>
      </span>
      <span class="material-symbols-outlined" style="color:${active ? "var(--brand)" : "#d4d4d8"}">${active ? "radio_button_checked" : "radio_button_unchecked"}</span>
    </button>`;
  }

  function field(id: string, label: string, value: string, ph: string, type = "text"): string {
    return `<label class="block">
      <span class="text-sm font-semibold text-neutral-700">${esc(label)}</span>
      <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" class="mt-1 w-full bg-white border border-neutral-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[color:var(--brand)]" />
    </label>`;
  }

  function shell(inner: string): void {
    const app = render(`
      <div class="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
        <header class="sticky top-0 z-50 bg-white border-b border-neutral-100">
          <div class="w-full max-w-[860px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <a href="${esc(cartHref)}" class="flex items-center gap-1 text-neutral-600 hover:text-neutral-900"><span class="material-symbols-outlined">arrow_back</span> Voltar ao carrinho</a>
            <span class="font-bold truncate">${esc(view.kind === "render" ? view.storeName : "")}</span>
          </div>
        </header>
        <main class="w-full max-w-[860px] mx-auto px-4 sm:px-6 py-8 flex-grow w-full">${inner}</main>
      </div>`);
    app.style.setProperty("--brand", brand);
    applyInk(app, custom);
    applyTheme(app, custom);
    fadeInImages(app);
    updateCartBadge(storeId);
  }

  function drawForm(): void {
    if (getCart(storeId).length === 0) {
      shell(`<div class="py-20 text-center text-neutral-500">
        <span class="material-symbols-outlined" style="font-size:56px;">shopping_cart</span>
        <p class="mt-3">O seu carrinho está vazio.</p>
        <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg text-white font-bold" style="background:var(--brand)">Continuar a comprar</a>
      </div>`);
      return;
    }

    const onlineCards = online
      ? `${methodCard("mcx", "smartphone", "Multicaixa Express", "Pagamento imediato pelo telemóvel.")}
         ${methodCard("reference", "receipt_long", "Referência Bancária", "Pague no ATM ou Internet Banking.")}`
      : "";

    shell(`
      <h1 class="text-3xl font-black mb-6">Finalizar compra</h1>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div class="lg:col-span-3 space-y-5">
          <div class="space-y-3">
            ${onlineCards}
            ${methodCard("whatsapp", "chat", "WhatsApp", "Combine o pagamento e a entrega por mensagem.")}
          </div>
          <div id="customer-fields" class="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
            ${field("c-name", "Nome (opcional)", "", "O seu nome")}
            ${field("c-phone", "Telemóvel", waPhone && waPhone.startsWith("+244") ? "" : "", "9XX XXX XXX", "tel")}
            <p class="text-xs text-neutral-400" data-nif-hint>Para fatura com NIF, adicione-o abaixo (opcional).</p>
            ${field("c-nif", "NIF (opcional)", "", "NIF para a fatura")}
          </div>
          ${qa ? `<p class="text-xs rounded-lg px-3 py-2" style="background:rgba(0,0,0,.05)">Modo de teste (QA) ativo — nenhum valor real é cobrado.</p>` : ""}
          <button id="pay" class="w-full py-3.5 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 text-base" style="background:var(--brand)">
            <span class="material-symbols-outlined">bolt</span> <span data-pay-label>Comprar agora</span>
          </button>
        </div>
        <div class="lg:col-span-2">${summaryHtml()}</div>
      </div>`);

    bindForm();
    updatePayLabel();
  }

  function updatePayLabel(): void {
    const label = $("[data-pay-label]");
    if (label) label.textContent = method === "whatsapp" ? "Finalizar via WhatsApp" : "Comprar agora";
    // Telefone obrigatório no MCX.
    const hintPhone = $("#c-phone")?.closest("label")?.querySelector("span");
    if (hintPhone) hintPhone.textContent = method === "mcx" ? "Telemóvel (obrigatório)" : "Telemóvel";
  }

  function bindForm(): void {
    document.querySelectorAll<HTMLElement>("[data-method]").forEach((b) =>
      b.addEventListener("click", () => { method = (b.dataset.method as Method) ?? "whatsapp"; drawForm(); }));
    $("#pay")?.addEventListener("click", () => void pay());
  }

  function customer(): { name?: string; nif?: string; phone?: string } {
    const name = ($("#c-name") as HTMLInputElement)?.value.trim() || undefined;
    const nif = ($("#c-nif") as HTMLInputElement)?.value.trim() || undefined;
    const phone = ($("#c-phone") as HTMLInputElement)?.value.trim() || undefined;
    return { name, nif, phone };
  }

  async function pay(): Promise<void> {
    const items = getCart(storeId);
    if (!items.length) { toast("O carrinho está vazio.", "error"); return; }

    if (method === "whatsapp") {
      const lines = items.map((i) => `• ${i.quantity}x ${i.name} (${formatKz(i.price * i.quantity)})`).join("\n");
      const msg = `Olá! Gostaria de encomendar:\n${lines}\n\nTotal: ${formatKz(cartTotal(storeId))}`;
      window.open(waLink(waPhone, msg), "_blank", "noopener");
      toast("A abrir o WhatsApp para finalizar…");
      return;
    }

    const btn = $("#pay") as HTMLButtonElement | null;
    const c = customer();
    if (method === "mcx" && !(c.phone && c.phone.replace(/\D/g, "").length >= 9)) {
      toast("Indique um número de telemóvel válido para o Multicaixa Express.", "error");
      return;
    }

    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; }
    const res = await initPayment({
      kind: "store",
      storeId,
      method,
      products: products(),
      phoneNumber: method === "mcx" ? c.phone : undefined,
      customer: c,
      qa,
      simulateResult: qa && method === "mcx" ? "success" : undefined,
    });
    if (btn) { btn.disabled = false; btn.style.opacity = "1"; }

    if (!res.success) {
      toast(res.error || "Não foi possível processar o pagamento.", "error");
      return;
    }

    if (method === "mcx") {
      clearCart(storeId);
      drawSuccess(res.invoiceUrl ?? null);
    } else {
      clearCart(storeId);
      drawReference(res);
    }
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
