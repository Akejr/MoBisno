/**
 * Checkout da SUBSCRIÇÃO de uma loja (a receita é da plataforma). Abre um modal
 * para o Dono pagar 30 dias por Multicaixa Express ou Referência Bancária.
 *
 * Cada loja tem a sua subscrição (migração 0025): o pagamento leva o `storeId`,
 * e o servidor confirma que a loja é de quem paga. O preço mostrado é só para o
 * Dono ler: o servidor cobra `PLAN_PRICE_KZ` do seu espelho (`api/_shared.js`) e
 * lê o Dono do token da sessão. Em MCX a subscrição fica ativa assim que o
 * pagamento é confirmado; na referência, quando for paga (webhook ou «Já paguei
 * — verificar»).
 *
 * Só é aberto quando `PAYMENTS_PROVIDER_READY` está ligado; antes disso o
 * separador «Plano» explica que a ativação é feita pela equipa MôBisno.
 */
import { esc, formatKz, toast } from "./dom.js";
import { initPayment, checkStatus, type PaymentResult } from "./paymentsApi.js";
import { PLAN_PRICE_KZ, PLAN_PERIOD_DAYS } from "../../src/services/plans.js";
import { isValidAoPhone } from "../../src/services/payments.js";

const ACCENT = "#F95901";

export function openPlanCheckout(opts: { storeId: string; storeName: string; onPaid: () => void }): void {
  const { storeId, storeName, onPaid } = opts;
  let method: "mcx" | "reference" = "mcx";

  document.getElementById("mb-plan-checkout")?.remove();
  const host = document.createElement("div");
  host.id = "mb-plan-checkout";
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "Pagar a subscrição da loja");
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
    return `<button type="button" data-m="${id}" aria-pressed="${active}" class="w-full text-left rounded-xl border-2 p-3 flex items-center gap-3 transition-colors" style="border-color:${active ? ACCENT : "#e5e7eb"}">
      <span class="material-symbols-outlined" style="color:${ACCENT}" aria-hidden="true">${icon}</span>
      <span class="flex-1"><span class="block font-bold text-gray-900 text-sm">${esc(title)}</span><span class="block text-xs text-gray-500">${esc(desc)}</span></span>
      <span class="material-symbols-outlined" style="color:${active ? ACCENT : "#d4d4d8"}" aria-hidden="true">${active ? "radio_button_checked" : "radio_button_unchecked"}</span>
    </button>`;
  }

  function drawForm(): void {
    card.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-lg font-black text-gray-900">Subscrição da loja</h3>
        <button data-close type="button" aria-label="Fechar" class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button>
      </div>
      <p class="text-gray-500 text-sm mb-4"><b class="text-gray-900">${esc(storeName)}</b>: <b style="color:${ACCENT}">${esc(formatKz(PLAN_PRICE_KZ))}</b> por ${PLAN_PERIOD_DAYS} dias, com tudo incluído.</p>
      <div class="space-y-2 mb-4">
        ${methodCard("mcx", "smartphone", "Multicaixa Express", "Ativação imediata.")}
        ${methodCard("reference", "receipt_long", "Referência Bancária", "Pague no ATM ou no Internet Banking.")}
      </div>
      <label class="block mb-4" data-phone-wrap>
        <span class="text-sm font-semibold text-gray-700">Telemóvel</span>
        <input id="plan-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="9XX XXX XXX" class="mt-1 w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-base outline-none focus:border-[#F95901]" />
      </label>
      <button id="plan-pay" type="button" class="w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">bolt</span> Pagar e ativar</button>`;
    bindForm();
  }

  function bindForm(): void {
    card.querySelector("[data-close]")?.addEventListener("click", close);
    card.querySelectorAll<HTMLElement>("[data-m]").forEach((b) =>
      b.addEventListener("click", () => { method = b.dataset.m as "mcx" | "reference"; drawForm(); }));
    // O telemóvel é sempre pedido (ver `pay`): o fornecedor identifica o pagador
    // por ele ao criar a cobrança, antes de o método ser escolhido.
    const wrap = card.querySelector<HTMLElement>("[data-phone-wrap]");
    if (wrap) wrap.style.display = "block";
    card.querySelector("#plan-pay")?.addEventListener("click", () => void pay());
  }

  async function pay(): Promise<void> {
    const phone = (card.querySelector("#plan-phone") as HTMLInputElement | null)?.value.trim() || "";
    // O telemóvel é pedido em qualquer um dos métodos: o fornecedor identifica
    // o pagador por ele ao criar a cobrança, antes de o método ser escolhido.
    if (!isValidAoPhone(phone)) { toast("Indique um telemóvel válido.", "error"); return; }
    const btn = card.querySelector("#plan-pay") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; btn.textContent = "A processar…"; }

    const res = await initPayment({ kind: "plan", method, phone, storeId });

    if (!res.success || !res.id) {
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.innerHTML = `<span class="material-symbols-outlined text-[20px]" aria-hidden="true">bolt</span> Pagar e ativar`; }
      toast(res.error || "Não foi possível processar o pagamento.", "error");
      return;
    }
    /*
     * O Dono paga na página do fornecedor — é lá que escolhe entre Multicaixa
     * Express e Referência Bancária e autoriza. Volta a `/painel/plano`, com o
     * id do pagamento no endereço, e é aí que a subscrição é confirmada
     * (`web/views/dashboard/plano.ts`): este modal não decide nada.
     */
    if (res.hostedUrl) { window.location.href = res.hostedUrl; return; }
    if (res.status === "paid") drawDone();
    else drawReference(res);
  }

  function drawDone(): void {
    card.innerHTML = `<div class="text-center py-6">
      <div class="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12);color:#059669"><span class="material-symbols-outlined" style="font-size:32px" aria-hidden="true">check_circle</span></div>
      <h3 class="text-xl font-black mt-3">Subscrição ativada</h3>
      <p class="text-gray-500 text-sm mt-1">Obrigado. Já pode publicar a loja.</p>
      <button id="plan-finish" type="button" class="mt-5 w-full py-3 rounded-xl text-white font-bold" style="background:${ACCENT}">Concluir</button>
    </div>`;
    card.querySelector("#plan-finish")?.addEventListener("click", () => { close(); onPaid(); });
  }

  function drawReference(res: PaymentResult): void {
    const ref = res.reference;
    const due = ref?.dueDate ? new Date(ref.dueDate).toLocaleDateString("pt-PT") : null;
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2"><h3 class="text-lg font-black text-gray-900">Referência de pagamento</h3><button data-close type="button" aria-label="Fechar" class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button></div>
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-gray-500">Entidade</span><span class="font-black tracking-wider">${esc(ref?.entity ?? "—")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Referência</span><span class="font-black tracking-wider">${esc(ref?.number ?? "—")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Montante</span><span class="font-black" style="color:${ACCENT}">${esc(formatKz(res.amount ?? PLAN_PRICE_KZ))}</span></div>
        ${due ? `<div class="flex justify-between"><span class="text-gray-500">Validade</span><span class="font-semibold">${esc(due)}</span></div>` : ""}
      </div>
      <p id="plan-ref-status" class="text-center text-sm text-gray-500 mt-3" aria-live="polite"></p>
      <button id="plan-check" type="button" class="mt-2 w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">refresh</span> Já paguei — verificar</button>`;
    card.querySelector("[data-close]")?.addEventListener("click", close);
    let busy = false;
    card.querySelector("#plan-check")?.addEventListener("click", async () => {
      if (busy || !res.id) return;
      busy = true;
      const st = await checkStatus({ kind: "plan", id: res.id });
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
