/**
 * Compra da criação de logótipo por IA (5.000 Kz). O logótipo escolhido já foi
 * carregado para o storage; aqui só se trata do pagamento (Multicaixa Express
 * ou Referência Bancária). Quando o pagamento é confirmado no servidor, o
 * logótipo é acrescentado a "Meus logótipos" (fulfillLogo). Para testar sem
 * cobrar, abra com `?qa=1`.
 */
import { esc, formatKz, toast } from "./dom.js";
import { initPayment, checkStatus } from "./paymentsApi.js";

const ACCENT = "#F95901";

/** Preço da criação de logótipo (Kz). */
export const LOGO_PRICE_KZ = 5000;

export function openLogoCheckout(opts: { ownerId: string; storeId: string; logoUrl: string; onClose?: () => void }): void {
  const { ownerId, storeId, logoUrl, onClose } = opts;
  const amount = LOGO_PRICE_KZ;
  const qa = location.search.includes("qa=1");
  let method: "mcx" | "reference" = "mcx";

  document.getElementById("mb-logo-checkout")?.remove();
  const host = document.createElement("div");
  host.id = "mb-logo-checkout";
  host.className = "fixed inset-0 z-[300] flex items-center justify-center p-4";
  host.innerHTML = `
    <div data-overlay class="absolute inset-0 bg-black/50 opacity-0 transition-opacity duration-200"></div>
    <div data-card class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 translate-y-3 opacity-0 transition-all duration-200"></div>`;
  document.body.appendChild(host);
  const overlay = host.querySelector<HTMLElement>("[data-overlay]")!;
  const card = host.querySelector<HTMLElement>("[data-card]")!;
  requestAnimationFrame(() => { overlay.style.opacity = "1"; card.style.opacity = "1"; card.style.transform = "translateY(0)"; });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    overlay.style.opacity = "0"; card.style.opacity = "0"; card.style.transform = "translateY(12px)";
    window.setTimeout(() => host.remove(), 200);
    onClose?.();
  }
  overlay.addEventListener("click", close);

  function methodCard(id: "mcx" | "reference", icon: string, title: string, desc: string): string {
    const active = method === id;
    return `<button type="button" data-m="${id}" class="w-full text-left rounded-xl border-2 p-3 flex items-center gap-3 transition-colors" style="border-color:${active ? ACCENT : "#e5e7eb"}">
      <span class="material-symbols-outlined" style="color:${ACCENT}">${icon}</span>
      <span class="flex-1"><span class="block font-bold text-gray-900 text-sm">${esc(title)}</span><span class="block text-xs text-gray-500">${esc(desc)}</span></span>
      <span class="material-symbols-outlined" style="color:${active ? ACCENT : "#d4d4d8"}">${active ? "radio_button_checked" : "radio_button_unchecked"}</span>
    </button>`;
  }

  function drawForm(): void {
    card.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-lg font-black text-gray-900">Criação de logótipo</h3>
        <button data-close class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="flex items-center gap-3 my-3">
        <div class="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0"><img src="${esc(logoUrl)}" class="max-w-full max-h-full object-contain" /></div>
        <p class="text-gray-500 text-sm">Logótipo escolhido · <b style="color:${ACCENT}">${esc(formatKz(amount))}</b></p>
      </div>
      <div class="space-y-2 mb-4">
        ${methodCard("mcx", "smartphone", "Multicaixa Express", "Pagamento imediato.")}
        ${methodCard("reference", "receipt_long", "Referência Bancária", "Pague no ATM / Internet Banking.")}
      </div>
      <label class="block mb-4" data-phone-wrap>
        <span class="text-sm font-semibold text-gray-700">Telemóvel</span>
        <input id="logo-phone" type="tel" placeholder="9XX XXX XXX" class="mt-1 w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901]" />
      </label>
      ${qa ? `<p class="text-xs rounded-lg px-3 py-2 mb-3" style="background:rgba(0,0,0,.05)">Modo de teste (QA) ativo — sem cobrança real.</p>` : ""}
      <button id="logo-pay" class="w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]">bolt</span> Pagar 5.000 Kz</button>`;
    bindForm();
  }

  function bindForm(): void {
    card.querySelector("[data-close]")?.addEventListener("click", close);
    card.querySelectorAll<HTMLElement>("[data-m]").forEach((b) =>
      b.addEventListener("click", () => { method = (b.dataset.m as "mcx" | "reference"); drawForm(); }));
    const wrap = card.querySelector<HTMLElement>("[data-phone-wrap]");
    if (wrap) wrap.style.display = method === "mcx" ? "block" : "none";
    card.querySelector("#logo-pay")?.addEventListener("click", () => void pay());
  }

  async function pay(): Promise<void> {
    const phone = (card.querySelector("#logo-phone") as HTMLInputElement | null)?.value.trim() || "";
    if (method === "mcx" && phone.replace(/\D/g, "").length < 9) { toast("Indique um telemóvel válido.", "error"); return; }
    const btn = card.querySelector("#logo-pay") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; btn.textContent = "A processar…"; }

    const res = await initPayment({
      kind: "logo",
      ownerId, storeId, logoUrl, method,
      products: [{ productName: "Criação de logótipo (MôBisno)", productPrice: amount, productQuantity: 1 }],
      phoneNumber: method === "mcx" ? phone : undefined,
      qa,
      simulateResult: qa && method === "mcx" ? "success" : undefined,
    });

    if (!res.success) {
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">bolt</span> Pagar 5.000 Kz`; }
      toast(res.error || "Não foi possível processar o pagamento.", "error");
      return;
    }
    if (method === "mcx") drawDone();
    else drawReference(res);
  }

  function drawDone(): void {
    card.innerHTML = `<div class="text-center py-6">
      <div class="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12);color:#059669"><span class="material-symbols-outlined" style="font-size:32px">check_circle</span></div>
      <h3 class="text-xl font-black mt-3">Pagamento recebido!</h3>
      <p class="text-gray-500 text-sm mt-1">O teu logótipo já está em <b>Criar logótipo › Meus logótipos</b>.</p>
      <button id="logo-finish" class="mt-5 w-full py-3 rounded-xl text-white font-bold" style="background:${ACCENT}">Concluir</button>
    </div>`;
    card.querySelector("#logo-finish")?.addEventListener("click", close);
  }

  function drawReference(res: Awaited<ReturnType<typeof initPayment>>): void {
    const due = res.dueDate ? new Date(res.dueDate).toLocaleDateString("pt-PT") : null;
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2"><h3 class="text-lg font-black text-gray-900">Referência de pagamento</h3><button data-close class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button></div>
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-gray-500">Entidade</span><span class="font-black tracking-wider">${esc(res.entity ?? "—")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Referência</span><span class="font-black tracking-wider">${esc(res.referenceNumber ?? "—")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Montante</span><span class="font-black" style="color:${ACCENT}">${esc(formatKz(res.amount ?? amount))}</span></div>
        ${due ? `<div class="flex justify-between"><span class="text-gray-500">Validade</span><span class="font-semibold">${esc(due)}</span></div>` : ""}
      </div>
      <p id="logo-ref-status" class="text-center text-sm text-gray-500 mt-3">Assim que o pagamento for confirmado, o logótipo aparece em "Meus logótipos".</p>
      <button id="logo-check" class="mt-2 w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]">refresh</span> Já paguei — verificar</button>
      <button id="logo-later" class="mt-2 w-full py-2.5 rounded-xl font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">Pagar mais tarde</button>`;
    card.querySelector("[data-close]")?.addEventListener("click", close);
    card.querySelector("#logo-later")?.addEventListener("click", close);
    const operationId = res.operationId ?? "";
    const mtx = res.transactionId ?? "";
    let busy = false;
    card.querySelector("#logo-check")?.addEventListener("click", async () => {
      if (busy || !operationId) return;
      busy = true;
      const st = await checkStatus({ operationId, merchantTransactionId: mtx, storeId });
      busy = false;
      const el = card.querySelector("#logo-ref-status");
      if (st.status === "paid") { drawDone(); return; }
      if (el) el.textContent = st.status === "open" ? "Ainda sem confirmação. Aguarde e tente de novo." : "Pagamento não concluído.";
    });
  }

  drawForm();
}
