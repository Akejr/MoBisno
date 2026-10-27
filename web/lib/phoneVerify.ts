/**
 * Confirmação do telemóvel da conta, em modal — o caminho de quem saltou o
 * passo no assistente de criação.
 *
 * Quem escolheu «Não recebi o código» ficou com a conta criada e a loja por
 * publicar. É aqui que fecha isso, a partir do aviso no «Início» do Dashboard.
 * As regras (quantos reenvios, quanto tempo entre eles) são as mesmas de
 * `src/services/phoneVerification.ts`, e quem as impõe é o servidor
 * (`api/phone-verify.js`): este modal não decide nada.
 *
 * O mesmo desenho de `web/lib/planCheckout.ts`: véu, cartão, três ecrãs
 * (número → código → confirmado) e `onVerified` só quando o servidor confirma.
 */
import { esc, toast } from "./dom.js";
import { confirmPhoneCode, requestPhoneCode } from "../supabase/phone.js";
import { isValidAoPhone, normalizeAoPhone } from "../../src/services/payments.js";
import { PHONE_CODE_LENGTH, cleanPhoneCode, formatPhoneForDisplay } from "../../src/services/phoneVerification.js";

const ACCENT = "#F95901";

/** Botão principal do modal. */
const BTN = "w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60";
/** Botão secundário. */
const BTN_ALT = "w-full py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 disabled:opacity-60 disabled:hover:bg-white";

export function openPhoneVerify(opts: { phone?: string | null; onVerified: () => void }): void {
  let phone = opts.phone ? normalizeAoPhone(opts.phone) : "";
  /** Momento em que o reenvio abre, ou `null` quando já não há reenvios. */
  let resendAt: number | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  document.getElementById("mb-phone-verify")?.remove();
  const host = document.createElement("div");
  host.id = "mb-phone-verify";
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "Confirmar o número de telemóvel");
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

  function stopTick(): void {
    if (tick !== null) { clearInterval(tick); tick = null; }
  }

  function close(): void {
    stopTick();
    overlay.style.opacity = "0";
    card.style.opacity = "0";
    card.style.transform = "translateY(12px)";
    window.setTimeout(() => host.remove(), 200);
  }
  overlay.addEventListener("click", close);
  // Fechar o modal **é** o «não recebi o código» aqui: nada se perde, e o aviso
  // no «Início» continua a lá estar para voltar a tentar.
  document.addEventListener("keydown", function onKey(e) {
    if (e.key !== "Escape") return;
    document.removeEventListener("keydown", onKey);
    close();
  });

  /** Cabeçalho com o botão de fechar. */
  function head(title: string): string {
    return `<div class="flex items-start justify-between gap-3 mb-1">
      <h3 class="text-lg font-black text-gray-900">${esc(title)}</h3>
      <button data-close type="button" aria-label="Fechar" class="text-gray-400 hover:text-gray-700 shrink-0"><span class="material-symbols-outlined">close</span></button>
    </div>`;
  }

  function bindClose(): void {
    card.querySelector("[data-close]")?.addEventListener("click", close);
  }

  /* ------------------------------- 1. O número ------------------------------- */

  function drawPhone(aviso?: string): void {
    stopTick();
    card.innerHTML = `${head("Confirmar o telemóvel")}
      <p class="text-sm text-gray-600">Enviamos um código por SMS. É o que confirma que o número é seu, e sem isso a loja não pode ir para o ar.</p>
      ${aviso ? `<p role="alert" class="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">${esc(aviso)}</p>` : ""}
      <form class="mt-4 space-y-3">
        <div>
          <label for="pv-phone" class="block text-sm font-semibold text-gray-700 mb-1.5">Número de telemóvel</label>
          <input id="pv-phone" type="tel" inputmode="numeric" autocomplete="tel" value="${esc(phone ? phone.replace(/^244/, "") : "")}" placeholder="9XX XXX XXX" class="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#F95901] focus:ring-2 focus:ring-[#F95901]/20" />
          <p class="mt-1.5 text-xs text-gray-500">Nove algarismos, a começar por 9.</p>
        </div>
        <button type="submit" id="pv-send" class="${BTN}" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">sms</span> Enviar código</button>
      </form>`;
    bindClose();
    const input = card.querySelector<HTMLInputElement>("#pv-phone")!;
    input.focus();
    card.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!isValidAoPhone(v)) { drawPhone("Esse número não é válido. Escreva os nove algarismos, a começar por 9."); return; }
      phone = normalizeAoPhone(v);
      void enviar(true);
    });
  }

  /* -------------------------------- 2. Enviar -------------------------------- */

  function drawBusy(label: string): void {
    stopTick();
    card.innerHTML = `<div class="py-10 text-center text-gray-500" role="status">
      <span class="material-symbols-outlined animate-spin motion-reduce:animate-none text-gray-300" style="font-size:36px" aria-hidden="true">progress_activity</span>
      <p class="mt-2 text-sm">${esc(label)}</p>
    </div>`;
  }

  async function enviar(primeiro: boolean): Promise<void> {
    if (busy) return;
    busy = true;
    drawBusy(primeiro ? "A enviar o código…" : "A enviar outro código…");
    const r = await requestPhoneCode(phone);
    busy = false;
    if (r.success) {
      if (r.alreadyVerified) { drawDone(); return; }
      resendAt = typeof r.resendInMs === "number" ? Date.now() + r.resendInMs : null;
      drawCode();
      return;
    }
    if (r.code === "TOO_SOON") {
      resendAt = typeof r.waitMs === "number" ? Date.now() + r.waitMs : null;
      drawCode(r.error);
      return;
    }
    if (r.code === "MAX_SENDS") {
      resendAt = null;
      drawCode(r.error);
      return;
    }
    drawPhone(r.error ?? "Não foi possível enviar a SMS agora.");
  }

  /* -------------------------------- 3. O código ------------------------------- */

  function drawCode(aviso?: string): void {
    stopTick();
    const semReenvio = resendAt === null;
    card.innerHTML = `${head("Escreva o código")}
      <p class="text-sm text-gray-600">Enviámos um código de ${PHONE_CODE_LENGTH} algarismos para <strong class="text-gray-900">${esc(formatPhoneForDisplay(phone))}</strong>.</p>
      ${aviso ? `<p role="alert" class="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">${esc(aviso)}</p>` : ""}
      <form class="mt-4 space-y-3">
        <label for="pv-code" class="sr-only">Código recebido por SMS</label>
        <input id="pv-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${PHONE_CODE_LENGTH}" placeholder="${"•".repeat(PHONE_CODE_LENGTH)}" class="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-3 text-center text-lg font-extrabold outline-none focus:border-[#F95901] focus:ring-2 focus:ring-[#F95901]/20" style="letter-spacing:.4em" />
        <button type="submit" id="pv-check" class="${BTN}" style="background:${ACCENT}">Confirmar</button>
      </form>
      <div class="mt-3 space-y-2">
        ${semReenvio ? "" : `<button type="button" id="pv-resend" disabled class="${BTN_ALT}">Reenviar código</button>`}
        <button type="button" id="pv-other" class="${BTN_ALT}">Trocar o número</button>
      </div>`;
    bindClose();
    const input = card.querySelector<HTMLInputElement>("#pv-code")!;
    const form = card.querySelector("form")!;
    input.focus();
    input.addEventListener("input", () => {
      const limpo = cleanPhoneCode(input.value);
      if (limpo !== input.value) input.value = limpo;
      if (limpo.length === PHONE_CODE_LENGTH) form.requestSubmit();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = cleanPhoneCode(input.value);
      if (v.length === PHONE_CODE_LENGTH) void confirmar(v);
    });
    card.querySelector("#pv-other")?.addEventListener("click", () => drawPhone());

    const botao = card.querySelector<HTMLButtonElement>("#pv-resend");
    if (!botao || resendAt === null) return;
    botao.addEventListener("click", () => { if (!botao.disabled) void enviar(false); });
    const abreEm = resendAt;
    const pintar = (): void => {
      const faltaS = Math.ceil((abreEm - Date.now()) / 1000);
      if (faltaS <= 0) {
        stopTick();
        botao.disabled = false;
        botao.textContent = "Reenviar código";
        return;
      }
      botao.textContent = `Reenviar código em ${faltaS}s`;
    };
    pintar();
    tick = setInterval(pintar, 250);
  }

  async function confirmar(code: string): Promise<void> {
    if (busy) return;
    busy = true;
    drawBusy("A confirmar o código…");
    const r = await confirmPhoneCode(code);
    busy = false;
    if (r.success) { drawDone(); return; }
    // Sem tentativas ou com o código caducado, insistir no mesmo código não
    // leva a nada: o reenvio abre já.
    if (r.code === "MAX_ATTEMPTS" || r.code === "EXPIRED" || r.code === "NO_CHALLENGE") resendAt = Date.now();
    drawCode(r.error ?? "Não foi possível confirmar o código.");
  }

  /* ------------------------------- 4. Confirmado ------------------------------ */

  function drawDone(): void {
    stopTick();
    card.innerHTML = `<div class="text-center py-6">
      <div class="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style="background:rgba(16,185,129,.12);color:#059669"><span class="material-symbols-outlined" style="font-size:32px" aria-hidden="true">verified</span></div>
      <h3 class="text-xl font-black mt-3">Número confirmado</h3>
      <p class="text-gray-500 text-sm mt-1">Já pode publicar a loja, com a subscrição ativa.</p>
      <button id="pv-finish" type="button" class="mt-5 ${BTN}" style="background:${ACCENT}">Concluir</button>
    </div>`;
    card.querySelector("#pv-finish")?.addEventListener("click", () => {
      close();
      toast("Número de telemóvel confirmado.");
      opts.onVerified();
    });
  }

  // Abre sempre no número, mesmo quando já há um gravado: cada SMS custa, e
  // enviar uma só porque o modal abriu era gastar sem ninguém pedir.
  drawPhone();
}
