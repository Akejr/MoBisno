/**
 * A página de pagamento do fornecedor, num modal por cima da página.
 *
 * Usado pelo checkout das lojas e pela subscrição no painel. Antes, «Pagar»
 * levava a página inteira para o fornecedor e o cliente voltava pelo endereço de
 * regresso: saía da loja a meio da compra.
 *
 * ## Quem confirma o pagamento
 *
 * Nunca o modal. Enquanto está aberto, pergunta o estado ao servidor de poucos
 * em poucos segundos (`/api/payment-status`, a fonte de verdade); quando o
 * servidor diz «pago», fecha e avisa quem o abriu. Fechado à mão, pergunta uma
 * última vez antes de avisar.
 *
 * ## Quando o fornecedor não se deixa embutir
 *
 * Quem decide é a página dele, pelos cabeçalhos, e o servidor já os leu ao
 * criar a cobrança (`embeddable`, `api/_frame.js`):
 *
 *  - `true`: a página abre dentro do modal;
 *  - `null` (não se soube): abre dentro do modal, com a ligação para a abrir à
 *    parte à vista, para o caso de ficar em branco;
 *  - `false`: o modal fica, com o botão que abre o pagamento numa janela
 *    pequena à parte, e continua a perguntar o estado. Um `iframe` recusado
 *    ficava em branco, e isso era pior do que não haver modal.
 *
 * ## O regresso do fornecedor
 *
 * Depois de pagar, o fornecedor leva a página dele para o nosso endereço de
 * regresso. Dentro do modal (ou da janela à parte), esse endereço carregaria a
 * loja inteira numa caixa pequena. `paymentReturnInFrame` apanha esse caso logo
 * no arranque (`web/main.ts`): avisa a página de cima e não desenha nada.
 */
import { esc } from "./dom.js";
import { checkStatus, type StatusResult } from "./paymentsApi.js";

/** Tipo da mensagem que o endereço de regresso envia à página de cima. */
export const PAY_RETURN_MESSAGE = "mb-pagamento-regresso";

/** De quanto em quanto tempo se pergunta o estado, com o modal aberto. */
const POLL_MS = 4000;

export interface PayModalOptions {
  /** Página de pagamento do fornecedor. */
  url: string;
  kind: "store" | "plan";
  /** Id interno do pagamento (a encomenda ou o pagamento da subscrição). */
  id: string;
  /** O servidor leu os cabeçalhos da página: deixa-se embutir? */
  embeddable: boolean | null | undefined;
  /** Cor do botão de abrir à parte (a da loja, ou o laranja do painel). */
  accent?: string;
  /** O servidor confirmou o pagamento. O modal já fechou. */
  onPaid: (st: StatusResult) => void;
  /** Fechado sem pagamento confirmado. `st` é a última resposta, se houver. */
  onClosed: (st: StatusResult | null) => void;
}

/** Só endereços https saem para o fornecedor. */
function httpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Abre uma janela pequena à parte com o pagamento. Tem de vir de um clique. */
function abrirAParte(url: string): Window | null {
  const w = 480;
  const h = 760;
  const left = Math.max(0, Math.round((window.screen.width - w) / 2));
  const top = Math.max(0, Math.round((window.screen.height - h) / 2));
  return window.open(url, "mb-pagamento", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
}

export function openPayModal(opts: PayModalOptions): void {
  const url = httpsUrl(opts.url);
  if (!url) { opts.onClosed(null); return; }
  const accent = opts.accent || "#F95901";
  const embutido = opts.embeddable !== false;

  document.getElementById("mb-pay-modal")?.remove();
  const host = document.createElement("div");
  host.id = "mb-pay-modal";
  host.className = "fixed inset-0 z-[300] flex items-end justify-center bg-black/60 sm:items-center sm:p-6";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "Pagamento");

  const corpo = embutido
    ? `<iframe title="Pagamento" src="${esc(url)}" class="block h-full w-full border-0 bg-white" allow="payment" referrerpolicy="no-referrer-when-downgrade"></iframe>`
    : `<div class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span class="material-symbols-outlined text-[44px] text-gray-400" aria-hidden="true">open_in_new</span>
        <p class="text-base font-semibold text-gray-900">A página de pagamento abre numa janela à parte.</p>
        <p class="text-sm text-gray-600">Pague lá e volte aqui: esta página confirma sozinha.</p>
        <button type="button" data-abrir class="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white" style="background:${esc(accent)}">Abrir o pagamento</button>
      </div>`;

  host.innerHTML = `
    <div class="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(780px,92vh)] sm:max-w-[480px] sm:rounded-2xl">
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <span class="inline-flex items-center gap-2 text-sm font-semibold text-gray-900"><span class="material-symbols-outlined text-[18px] text-emerald-600" aria-hidden="true">lock</span>Pagamento seguro</span>
        <button type="button" data-fechar aria-label="Fechar o pagamento" class="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </div>
      <div class="relative min-h-0 flex-1 bg-gray-50">${corpo}</div>
      <div class="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 text-xs text-gray-600">
        <span data-estado aria-live="polite">${embutido ? "Quando o pagamento ficar confirmado, esta janela fecha sozinha." : "À espera do pagamento…"}</span>
        ${embutido ? `<button type="button" data-abrir class="shrink-0 font-semibold underline underline-offset-2 hover:text-gray-900">Não abriu? Abrir à parte</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(host);
  const bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  let fechado = false;
  let ultimo: StatusResult | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let janela: Window | null = null;

  const limpar = (): void => {
    fechado = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = bodyOverflow;
    host.remove();
    try { janela?.close(); } catch { /* outra origem: fica com o cliente */ }
  };

  const pago = (st: StatusResult): void => { limpar(); opts.onPaid(st); };

  /** Uma pergunta ao servidor. Devolve `true` se o pagamento ficou resolvido. */
  const perguntar = async (): Promise<boolean> => {
    const st = await checkStatus({ kind: opts.kind, id: opts.id });
    if (fechado) return true;
    ultimo = st;
    if (st.success && st.status === "paid") { pago(st); return true; }
    if (st.success && (st.status === "failed" || st.status === "cancelled")) {
      limpar();
      opts.onClosed(st);
      return true;
    }
    return false;
  };

  const ciclo = (): void => {
    timer = setTimeout(() => {
      void (async () => {
        if (fechado) return;
        // A janela do fornecedor (~5 min) fechou: mais perguntas não dizem nada
        // de novo. Uma Referência paga mais tarde chega pelo aviso do fornecedor.
        if (await perguntar() || fechado || ultimo?.window === "closed") return;
        ciclo();
      })();
    }, POLL_MS);
  };

  const fechar = async (): Promise<void> => {
    if (fechado) return;
    const estado = host.querySelector<HTMLElement>("[data-estado]");
    if (estado) estado.textContent = "A confirmar…";
    if (await perguntar()) return;
    const st = ultimo;
    limpar();
    opts.onClosed(st);
  };

  // O endereço de regresso, dentro do modal ou na janela à parte, avisa por
  // aqui. Só da nossa origem, e só deste pagamento; e mesmo assim não decide
  // nada: faz o servidor ser perguntado já.
  function onMessage(e: MessageEvent): void {
    if (e.origin !== location.origin) return;
    const d = e.data as { type?: unknown; id?: unknown } | null;
    if (!d || d.type !== PAY_RETURN_MESSAGE || d.id !== opts.id) return;
    void fechar();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") void fechar();
  }

  window.addEventListener("message", onMessage);
  document.addEventListener("keydown", onKey);
  host.querySelector("[data-fechar]")?.addEventListener("click", () => void fechar());
  host.querySelectorAll("[data-abrir]").forEach((b) => b.addEventListener("click", () => {
    janela = abrirAParte(url);
    const estado = host.querySelector<HTMLElement>("[data-estado]");
    if (estado) estado.textContent = "Pague na janela que abriu. Esta confirma sozinha.";
  }));
  (host.querySelector("[data-fechar]") as HTMLElement | null)?.focus();
  ciclo();
}

/**
 * Corre no arranque da SPA. Se esta página é o endereço de regresso do
 * fornecedor e está dentro do modal (ou da janela à parte), avisa a página que
 * a abriu e não desenha a loja. Devolve `true` nesse caso.
 */
export function paymentReturnInFrame(): boolean {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    return false;
  }
  const id = params.get("pagamento");
  if (!id) return false;
  const pai = window.parent !== window ? window.parent : window.opener && window.opener !== window ? (window.opener as Window) : null;
  if (!pai) return false;
  try {
    pai.postMessage({ type: PAY_RETURN_MESSAGE, id, falhou: params.get("falhou") === "1" }, location.origin);
  } catch {
    return false;
  }
  document.body.innerHTML = `<div style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#374151;font-size:15px">A confirmar o pagamento…</div>`;
  // Na janela à parte, fecha-se: a página de cima é que mostra o resultado.
  if (window.parent === window) window.setTimeout(() => window.close(), 300);
  return true;
}
