/**
 * Checkout da SUBSCRIÇÃO de uma loja (a receita é da plataforma). Um modal com
 * o preço, e daí direto para a página de pagamento.
 *
 * ## Porque é que já não há aqui escolha de método
 *
 * Havia dois cartões, «Multicaixa Express» e «Referência Bancária», e a escolha
 * não ia a sítio nenhum: `wizaCreateCharge` (`api/_wizapay.js`) **não recebe o
 * método**. Quem o escolhe é o cliente, na página da Wiza, que mostra sempre os
 * dois. Pedir a mesma decisão duas vezes, e na primeira sem efeito, é pedir ao
 * Dono para adivinhar qual delas conta.
 *
 * O que fica gravado no momento da cobrança é a **intenção**; o método real
 * chega com a confirmação do fornecedor.
 *
 * ## E porque é que também já não pede o telemóvel
 *
 * A Wiza exige um telemóvel para criar a cobrança, mas a plataforma já o tem: o
 * Dono confirma um número por SMS antes de poder publicar, e o servidor lê-o de
 * `profiles.phone` (`api/payment.js`). Pedi-lo aqui era pedir o que já se sabe,
 * e deixava pagar com um número diferente do da conta.
 *
 * O campo continua a existir para um caso só: uma conta que ficou confirmada
 * sem número gravado (migração 0027). Aparece quando o servidor responde
 * `PHONE_REQUIRED`, e não antes.
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
  /**
   * Intenção registada na cobrança. Não decide o que a Wiza mostra — ela
   * apresenta sempre os dois métodos — e é substituída pelo método real quando o
   * pagamento é confirmado.
   */
  const method = "mcx" as const;

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



  /**
   * O telemóvel só é pedido depois de o servidor dizer que a conta não tem
   * nenhum gravado. Por omissão, o número é o da conta e o Dono não o vê.
   */
  let pedirTelemovel = false;

  const campoTelemovel = `
      <label class="block mt-4">
        <span class="text-sm font-semibold text-gray-700">Telemóvel</span>
        <input id="plan-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="9XX XXX XXX" class="mt-1.5 w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-base outline-none focus:border-[#F95901] focus:ring-2 focus:ring-[#F95901]/20" />
        <span class="mt-1.5 block text-xs text-gray-500">A sua conta não tem um número confirmado. É por este número que o pagamento é identificado.</span>
      </label>`;

  function drawForm(): void {
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-lg font-black text-gray-900">Ativar a subscrição</h3>
        <button data-close type="button" aria-label="Fechar" class="text-gray-400 hover:text-gray-700 shrink-0"><span class="material-symbols-outlined">close</span></button>
      </div>
      <p class="mt-0.5 text-sm text-gray-600">Loja <strong class="text-gray-900">${esc(storeName)}</strong></p>
      <div class="mt-4 flex items-baseline justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <span class="text-sm text-gray-600">${PLAN_PERIOD_DAYS} dias, com tudo incluído</span>
        <strong class="text-xl font-black tracking-tight" style="color:${ACCENT}">${esc(formatKz(PLAN_PRICE_KZ))}</strong>
      </div>
      ${pedirTelemovel ? campoTelemovel : ""}
      <button id="plan-pay" type="button" class="mt-5 w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}">Continuar para o pagamento <span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span></button>
      <p class="mt-3 text-center text-xs text-gray-500">Abre a página de pagamento, onde escolhe Multicaixa Express ou Referência Bancária.</p>`;
    bindForm();
  }

  function bindForm(): void {
    card.querySelector("[data-close]")?.addEventListener("click", close);
    (card.querySelector("#plan-phone") as HTMLInputElement | null)?.focus();
    card.querySelector("#plan-pay")?.addEventListener("click", () => void pay());
  }

  async function pay(): Promise<void> {
    const campo = card.querySelector("#plan-phone") as HTMLInputElement | null;
    const phone = campo?.value.trim() || "";
    // Só há o que validar quando o campo existe — e ele só existe depois de um
    // `PHONE_REQUIRED`. Sem campo, o telemóvel é o que o Dono confirmou por SMS,
    // e quem o lê é o servidor.
    if (campo && !isValidAoPhone(phone)) { toast("Indique um telemóvel válido.", "error"); return; }
    const btn = card.querySelector("#plan-pay") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; btn.textContent = "A processar…"; }

    const res = await initPayment({ kind: "plan", method, storeId, ...(phone ? { phone } : {}) });

    if (!res.success || !res.id) {
      /*
       * A conta não tem número gravado: é agora, e só agora, que o pedimos. O
       * campo traz a explicação, e o Dono volta a tocar no mesmo botão.
       */
      if (res.code === "PHONE_REQUIRED" && !campo) { pedirTelemovel = true; drawForm(); return; }
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.innerHTML = `Continuar para o pagamento <span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>`; }
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
        <div class="flex justify-between"><span class="text-gray-500">Entidade</span><span class="font-black tracking-wider">${esc(ref?.entity ?? "-")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Referência</span><span class="font-black tracking-wider">${esc(ref?.number ?? "-")}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Montante</span><span class="font-black" style="color:${ACCENT}">${esc(formatKz(res.amount ?? PLAN_PRICE_KZ))}</span></div>
        ${due ? `<div class="flex justify-between"><span class="text-gray-500">Validade</span><span class="font-semibold">${esc(due)}</span></div>` : ""}
      </div>
      <p id="plan-ref-status" class="text-center text-sm text-gray-500 mt-3" aria-live="polite"></p>
      <button id="plan-check" type="button" class="mt-2 w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">refresh</span> Já paguei, verificar</button>`;
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
