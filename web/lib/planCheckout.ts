/**
 * Checkout de PLANO (a receita é da plataforma, paga via MoMenu com a chave da
 * plataforma — ver `api/payment.js` kind="plan"). Abre um modal para o dono
 * pagar a subscrição por Multicaixa Express ou Referência Bancária. Em MCX, o
 * plano é ativado no servidor assim que o pagamento é confirmado; na referência,
 * a ativação ocorre quando o pagamento é verificado/confirmado.
 *
 * Para testar sem cobrar, abra o painel com `?qa=1` no URL.
 */
import { esc, formatKz, toast } from "./dom.js";
import { initPayment, checkStatus } from "./paymentsApi.js";
import type { Plan } from "../../src/services/plans.js";

const ACCENT = "#F95901";

export function openPlanCheckout(opts: { ownerId: string; plan: Plan; onPaid: () => void }): void {
  const { ownerId, plan, onPaid } = opts;
  const qa = location.search.includes("qa=1");
  let method: "mcx" | "reference" = "mcx";

  document.getElementById("mb-plan-checkout")?.remove();
  const host = document.createElement("div");
  host.id = "mb-plan-checkout";
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4";
  host.innerHTML = `
    <div data-overlay class="absolute inset-0 bg-black/50 opacity-0 transition-opacity duration-200"></div>
    <div data-card class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 translate-y-3 opacity-0 transition-all duration-200"></div>`;
  document.body.appendChild(host);
  const overlay = host.querySelector<HTMLElement>("[data-overlay]")!;
  const card = host.querySelector<HTMLElement>("[data-card]")!;

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    card.style.opacity = "1";
    card.style.transform = "translateY(0)";
  });

  function close(): void {
    overlay.style.opacity = "0";
    card.style.opacity = "0";
    card.style.transform = "translateY(12px)";
    window.setTimeout(() => host.remove(), 200);
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
        <h3 class="text-lg font-black text-gray-900">Subscrever ${esc(plan.name)}</h3>
        <button data-close class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button>
      </div>
      <p class="text-gray-500 text-sm mb-4">Pagamento mensal de <b style="color:${ACCENT}">${esc(formatKz(plan.priceKz))}</b>.</p>
      <div class="space-y-2 mb-4">
        ${methodCard("mcx", "smartphone", "Multicaixa Express", "Ativação imediata.")}
        ${methodCard("reference", "receipt_long", "Referência Bancária", "Pague no ATM / Internet Banking.")}
      </div>
      <label class="block mb-4" data-phone-wrap>
        <span class="text-sm font-semibold text-gray-700">Telemóvel</span>
        <input id="plan-phone" type="tel" placeholder="9XX XXX XXX" class="mt-1 w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901]" />
      </label>
      ${qa ? `<p class="text-xs rounded-lg px-3 py-2 mb-3" style="background:rgba(0,0,0,.05)">Modo de teste (QA) ativo — sem cobrança real.</p>` : ""}
      <button id="plan-pay" class="w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]">bolt</span> Pagar e ativar</button>`;
    bindForm();
  }

  function bindForm(): void {
    card.querySelector("[data-close]")?.addEventListener("click", close);
    card.querySelectorAll<HTMLElement>("[data-m]").forEach((b) =>
      b.addEventListener("click", () => { method = (b.dataset.m as "mcx" | "reference"); drawForm(); }));
    const wrap = card.querySelector<HTMLElement>("[data-phone-wrap]");
    if (wrap) wrap.style.display = method === "mcx" ? "block" : "none";
    card.querySelector("#plan-pay")?.addEventListener("click", () => void pay());
  }

  async function pay(): Promise<void> {
    const phone = (card.querySelector("#plan-phone") as HTMLInputElement | null)?.value.trim() || "";
    if (method === "mcx" && phone.replace(/\D/g, "").length < 9) { toast("Indique um telemóvel válido.", "error"); return; }
    const btn = card.querySelector("#plan-pay") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; btn.textContent = "A processar…"; }

    const res = await initPayment({
      kind: "plan",
      ownerId,
      plan: plan.id,
      method,
      products: [{ productName: `Plano ${plan.name} (MôBisno)`, productPrice: plan.priceKz, productQuantity: 1 }],
      phoneNumber: method === "mcx" ? phone : undefined,
      qa,
      simulateResult: qa && method === "mcx" ? "success" : undefined,
    });

    if (!res.success) {
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">bolt</span> Pagar e ativar`; }
      toast(res.error || "Não foi possível processar o pagamento.", "error");
      return;
    }

    if (method === "mcx") { drawDone(); }
    else { drawReference(res); }
  }

  function drawDone(): void {
    card.innerHTML = `<div class="text-center py-6">
      <div class="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12);color:#059669"><span class="material-symbols-outlined" style="font-size:32px">check_circle</span></div>
      <h3 class="text-xl font-black mt-3">Plano ${esc(plan.name)} ativado!</h3>
      <p class="text-gray-500 text-sm mt-1">Obrigado. O seu plano já está ativo.</p>
      <button id="plan-finish" class="mt-5 w-full py-3 rounded-xl text-white font-bold" style="background:${ACCENT}">Concluir</button>
    </div>`;
    card.querySelector("#plan-finish")?.addEventListener("click", () => { close(); onPaid(); });
  }

  function drawReference(res: Awaited<ReturnType<typeof initPayment>>): void {
    const due = res.dueDate ? new Date(res.dueDate).toLocaleDateString("pt-PT") : null;
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2"><h3 class="text-lg font-black text-gray-900">Referência de pagamento</h3><button data-close class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button></div>
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-gray-500">Entidade</span><span class="font-black tracking-wider">${esc(res.entity ?? "—")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Referência</span><span class="font-black tracking-wider">${esc(res.referenceNumber ?? "—")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Montante</span><span class="font-black" style="color:${ACCENT}">${esc(formatKz(res.amount ?? plan.priceKz))}</span></div>
        ${due ? `<div class="flex justify-between"><span class="text-gray-500">Validade</span><span class="font-semibold">${esc(due)}</span></div>` : ""}
      </div>
      <p id="plan-ref-status" class="text-center text-sm text-gray-500 mt-3"></p>
      <button id="plan-check" class="mt-2 w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]">refresh</span> Já paguei — verificar</button>`;
    card.querySelector("[data-close]")?.addEventListener("click", close);
    const operationId = res.operationId ?? "";
    const mtx = res.transactionId ?? "";
    let busy = false;
    card.querySelector("#plan-check")?.addEventListener("click", async () => {
      if (busy || !operationId) return;
      busy = true;
      const st = await checkStatus({ operationId, merchantTransactionId: mtx, ownerId });
      busy = false;
      const el = card.querySelector("#plan-ref-status");
      if (st.status === "paid") { drawDone(); return; }
      if (el) el.textContent = st.status === "open"
        ? "Ainda sem confirmação. Aguarde e tente de novo."
        : "Pagamento não concluído.";
    });
  }

  drawForm();
}
