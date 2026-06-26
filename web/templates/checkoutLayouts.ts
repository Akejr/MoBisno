/**
 * Layouts de checkout (4 variantes) — partilhados pela página de checkout ao
 * vivo (`web/views/checkout.ts`) e pela pré-visualização no editor.
 *
 * Cada variante devolve o HTML interior do checkout (formulário + métodos +
 * resumo). Os métodos de pagamento são apresentados com logótipo (foto):
 * Multicaixa Express, Referência Bancária e WhatsApp (servidos de /integrations).
 *
 * Responsivo por omissão: grelhas que empilham no mobile, inputs a 16px (evita
 * o zoom automático do iOS) e alvos de toque generosos.
 *
 * Hooks usados pela página ao vivo:
 *  - `[data-method="mcx|reference|whatsapp"]` — cartões de método
 *  - `#c-name`, `#c-email`, `#c-phone`, `#c-nif` — dados do cliente
 *  - `#pay` + `[data-pay-label]` — botão de finalização
 *  - `#coupon` / `#coupon-apply` — cupão (decorativo, opcional)
 */
import { esc, formatKz } from "../lib/dom.js";

export type CheckoutVariant = "dividido" | "moderno" | "compacto" | "minimal";

export const CHECKOUT_VARIANTS: { id: CheckoutVariant; label: string }[] = [
  { id: "dividido", label: "Dividido" },
  { id: "moderno", label: "Etapas" },
  { id: "compacto", label: "Compacto" },
  { id: "minimal", label: "Minimal" },
];

export type CheckoutMethodId = "mcx" | "reference" | "whatsapp";

interface MethodInfo { id: CheckoutMethodId; logo: string; title: string; subtitle: string; }

export interface CheckoutLayoutCtx {
  storeName: string;
  items: { name: string; price: number; quantity: number; imageUrl?: string }[];
  total: number;
  /** Mostrar Multicaixa Express + Referência (loja com pagamentos online). */
  online: boolean;
  /** Método atualmente selecionado (estado ativo). */
  selected: CheckoutMethodId | null;
}

/** Texto de apoio do telefone, com destaques na cor da marca. */
const PHONE_HINT =
  'Para <b style="color:var(--brand)">Multicaixa Express</b>, receberá uma <b style="color:var(--brand)">notificação no aplicativo</b>.';

const INPUT_CLS =
  "mt-1.5 w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-[color:var(--brand)]";

function methodList(online: boolean): MethodInfo[] {
  const list: MethodInfo[] = [];
  if (online) {
    list.push({ id: "mcx", logo: "/integrations/Express.png", title: "Multicaixa Express", subtitle: "Instantâneo" });
    list.push({ id: "reference", logo: "/integrations/ATM.png", title: "Referência Bancária", subtitle: "ATM / Internet Banking" });
  }
  list.push({ id: "whatsapp", logo: "/integrations/Whatsapp.png", title: "WhatsApp", subtitle: "Combinar por mensagem" });
  return list;
}

const logoBox = (m: MethodInfo, size = 44): string =>
  `<img src="${esc(m.logo)}" alt="${esc(m.title)}" class="object-contain rounded-xl" style="width:${size}px;height:${size}px" onerror="this.style.display='none'" />`;

/** Cartão "azulejo" (logótipo em cima). Responsivo (3 por linha, compacto no mobile). */
function methodTile(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" class="group relative flex flex-col items-center justify-start text-center gap-2 rounded-2xl border-2 p-3 sm:p-4 min-h-[112px] transition-all" style="border-color:${active ? "var(--brand)" : "#e5e7eb"};background:${active ? "rgba(0,0,0,.02)" : "#fff"}">
    ${active ? `<span class="material-symbols-outlined absolute top-1.5 right-1.5 text-[18px]" style="color:var(--brand)">check_circle</span>` : ""}
    ${logoBox(m, 44)}
    <span class="font-bold text-neutral-900 text-[13px] sm:text-sm leading-tight">${esc(m.title)}</span>
    <span class="text-[11px] sm:text-xs text-neutral-400 leading-tight">${esc(m.subtitle)}</span>
  </button>`;
}

/** Linha (logótipo à esquerda, radio à direita). Alvo de toque alto. */
function methodRow(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" class="w-full flex items-center gap-3 sm:gap-4 py-3.5 text-left transition-colors">
    ${logoBox(m, 40)}
    <span class="flex-1 min-w-0"><span class="block font-semibold text-neutral-900">${esc(m.title)}</span><span class="block text-sm text-neutral-400 truncate">${esc(m.subtitle)}</span></span>
    <span class="material-symbols-outlined shrink-0" style="color:${active ? "var(--brand)" : "#d4d4d8"}">${active ? "radio_button_checked" : "radio_button_unchecked"}</span>
  </button>`;
}

function payLabel(selected: CheckoutMethodId | null): string {
  if (selected === null) return "Selecione um método";
  if (selected === "whatsapp") return "Finalizar via WhatsApp";
  return "Comprar agora";
}

function payButton(selected: CheckoutMethodId | null): string {
  const disabled = selected === null;
  const icon = selected === null ? "lock" : selected === "whatsapp" ? "chat" : "bolt";
  return `<button id="pay" type="button" ${disabled ? "disabled" : ""} class="w-full py-4 rounded-xl font-bold inline-flex items-center justify-center gap-2 text-base transition-opacity active:scale-[.99]"
    style="${disabled ? "background:#e5e7eb;color:#9ca3af;cursor:not-allowed" : "background:var(--brand);color:#fff;box-shadow:0 10px 24px -10px var(--brand)"}">
    <span class="material-symbols-outlined">${icon}</span> <span data-pay-label>${esc(payLabel(selected))}</span>
  </button>`;
}

function field(id: string, label: string, ph: string, type = "text", hintHtml = ""): string {
  return `<label class="block"><span class="text-sm font-semibold text-neutral-700">${esc(label)}</span>
    <input id="${id}" type="${type}" placeholder="${esc(ph)}" class="${INPUT_CLS}" />
    ${hintHtml ? `<span class="block text-xs text-neutral-500 mt-1.5 leading-snug">${hintHtml}</span>` : ""}</label>`;
}

function customerFields(opts: { email?: boolean; compact?: boolean } = {}): string {
  if (opts.compact) {
    return `<div class="space-y-3">
      ${field("c-name", "Nome", "O seu nome")}
      ${field("c-phone", "Telemóvel", "9XX XXX XXX", "tel", PHONE_HINT)}
    </div>`;
  }
  return `<div class="space-y-4">
    ${field("c-name", "Nome completo", "Ex: Maria Silva")}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${opts.email ? field("c-email", "Email", "seu@email.com", "email") : field("c-nif", "NIF (opcional)", "Para a fatura")}
      ${field("c-phone", "Telefone", "923456789", "tel", PHONE_HINT)}
    </div>
    ${opts.email ? `<label class="block"><span class="text-sm font-semibold text-neutral-700">NIF (opcional)</span><input id="c-nif" type="text" placeholder="Para a fatura" class="${INPUT_CLS}" /></label>` : ""}
  </div>`;
}

function summaryLines(ctx: CheckoutLayoutCtx): string {
  return ctx.items.map((i) => {
    const thumb = i.imageUrl
      ? `<img src="${esc(i.imageUrl)}" class="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0" />`
      : `<div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-neutral-400 text-[20px]">image</span></div>`;
    return `<div class="flex items-center gap-3 py-2">
      ${thumb}
      <div class="flex-1 min-w-0"><p class="text-sm font-medium text-neutral-900 truncate">${esc(i.name)}</p><p class="text-xs text-neutral-400">Qtd: ${i.quantity}</p></div>
      <p class="text-sm font-semibold text-neutral-900 whitespace-nowrap">${esc(formatKz(i.price * i.quantity))}</p>
    </div>`;
  }).join("");
}

function couponBlock(): string {
  return `<div class="mt-5 pt-5 border-t border-neutral-100">
    <p class="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Cupão de desconto</p>
    <div class="flex gap-2">
      <input id="coupon" type="text" placeholder="Insira o código" class="flex-1 bg-white border border-neutral-300 rounded-xl px-3.5 py-3 text-[16px] outline-none focus:border-[color:var(--brand)]" />
      <button id="coupon-apply" type="button" class="px-4 rounded-xl bg-neutral-100 text-neutral-700 font-semibold text-sm hover:bg-neutral-200 transition-colors shrink-0">Aplicar</button>
    </div>
  </div>`;
}

function secureNote(): string {
  return `<p class="text-center text-xs text-neutral-400 mt-3 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[15px]">verified_user</span> Pagamento 100% seguro e protegido</p>`;
}

/** Barra de confiança com os logótipos dos métodos (rodapé do checkout). */
function trustRow(methods: MethodInfo[]): string {
  return `<div class="mt-8 pt-6 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 text-xs text-neutral-400">
    <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">lock</span> Pagamento seguro e encriptado</span>
    <span class="flex items-center gap-2">${methods.map((m) => `<img src="${esc(m.logo)}" alt="${esc(m.title)}" class="h-6 w-auto object-contain" onerror="this.style.display='none'" />`).join("")}</span>
  </div>`;
}

/** Indicador de etapas (usado no layout "Etapas"). */
function stepDot(n: number, label: string, state: "done" | "active" | "todo"): string {
  const circle = state === "done"
    ? `<span class="w-7 h-7 rounded-full flex items-center justify-center text-white" style="background:var(--brand)"><span class="material-symbols-outlined text-[18px]">check</span></span>`
    : state === "active"
      ? `<span class="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-sm" style="background:var(--brand)">${n}</span>`
      : `<span class="w-7 h-7 rounded-full flex items-center justify-center bg-neutral-200 text-neutral-500 font-bold text-sm">${n}</span>`;
  const txt = state === "todo" ? "text-neutral-400" : "text-neutral-900 font-semibold";
  return `<span class="flex items-center gap-2"><span>${circle}</span><span class="hidden sm:inline text-sm ${txt}">${esc(label)}</span></span>`;
}

/** Renderiza o checkout (conteúdo interior) na variante escolhida. */
export function renderCheckout(variant: CheckoutVariant, ctx: CheckoutLayoutCtx): string {
  const methods = methodList(ctx.online);
  const tiles = methods.map((m) => methodTile(m, ctx.selected === m.id)).join("");
  const rows = methods.map((m) => methodRow(m, ctx.selected === m.id)).join("");
  const totalKz = esc(formatKz(ctx.total));
  const cols = Math.min(methods.length, 3);

  if (variant === "moderno") {
    const checkItems = ctx.items.map((i) => `<div class="flex items-center gap-2.5 py-3">
      <span class="material-symbols-outlined text-[20px] shrink-0" style="color:#16a34a">check_circle</span>
      <span class="flex-1 min-w-0 text-sm font-medium text-neutral-800 truncate">${i.quantity}× ${esc(i.name)}</span>
      <span class="text-sm font-semibold text-neutral-900 whitespace-nowrap">${esc(formatKz(i.price * i.quantity))}</span>
    </div>`).join("");

    return `<div>
      <div class="flex items-center justify-center gap-2 sm:gap-4 mb-8">
        ${stepDot(1, "Dados", "done")}
        <span class="h-px w-6 sm:w-12 bg-neutral-300"></span>
        ${stepDot(2, "Pagamento", "active")}
        <span class="h-px w-6 sm:w-12 bg-neutral-300"></span>
        ${stepDot(3, "Confirmação", "todo")}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        <div class="lg:col-span-7 order-2 lg:order-1">
          <h1 class="text-2xl md:text-3xl font-black text-neutral-900">Detalhes de Pagamento</h1>
          <p class="text-neutral-500 mt-1 mb-6 text-sm">Conclua a compra escolhendo a forma de pagamento.</p>
          ${customerFields({ email: true })}
          <h2 class="mt-8 mb-3 font-bold text-neutral-900">Forma de pagamento</h2>
          <div class="grid grid-cols-${cols} gap-2 sm:gap-3">${tiles}</div>
          <div class="mt-6">${payButton(ctx.selected)}</div>
        </div>
        <div class="lg:col-span-5 order-1 lg:order-2">
          <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm lg:sticky lg:top-6">
            <h2 class="text-lg sm:text-xl font-black text-neutral-900 mb-4">Resumo do Pedido</h2>
            <div class="rounded-xl bg-neutral-50 px-4 divide-y divide-neutral-200/60">${checkItems}</div>
            <div class="mt-4 flex gap-2">
              <input id="coupon" type="text" placeholder="Código promocional" class="flex-1 bg-white border border-neutral-300 rounded-xl px-3.5 py-3 text-[16px] outline-none focus:border-[color:var(--brand)]" />
              <button id="coupon-apply" type="button" class="px-5 rounded-xl text-white font-semibold text-sm shrink-0" style="background:var(--brand)">Aplicar</button>
            </div>
            <div class="mt-5 space-y-2.5 text-sm">
              <div class="flex justify-between"><span class="text-neutral-500">Subtotal</span><span class="font-medium text-neutral-900">${totalKz}</span></div>
              <div class="flex items-baseline justify-between pt-3 border-t border-neutral-100"><span class="font-bold text-neutral-900">Total</span><span class="text-2xl font-black tracking-tight" style="color:var(--brand)">${totalKz}</span></div>
            </div>
          </div>
        </div>
      </div>
      ${trustRow(methods)}
    </div>`;
  }

  if (variant === "compacto") {
    const thumbs = ctx.items.slice(0, 4).map((i) => i.imageUrl
      ? `<img src="${esc(i.imageUrl)}" class="w-11 h-11 rounded-xl object-cover border-2 border-white shadow-sm" />`
      : `<div class="w-11 h-11 rounded-xl bg-neutral-100 border-2 border-white shadow-sm flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400 text-[18px]">image</span></div>`).join("");
    const rowsBoxed = methods.map((m) => methodRow(m, ctx.selected === m.id)).join("");
    return `<div class="max-w-5xl mx-auto space-y-5">
      <div class="rounded-2xl border border-neutral-200 bg-white px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
        <div class="flex -space-x-3 shrink-0">${thumbs}</div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-neutral-900 leading-tight truncate">A sua encomenda</p>
          <p class="text-sm text-neutral-400">${ctx.items.length} artigo(s)</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-neutral-400">Total</p>
          <p class="font-black text-xl sm:text-2xl tracking-tight" style="color:var(--brand)">${totalKz}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
          <h2 class="font-black text-neutral-900 mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]" style="color:var(--brand)">person</span> Dados</h2>
          ${customerFields({})}
        </div>
        <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
          <h2 class="font-black text-neutral-900 mb-1 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]" style="color:var(--brand)">credit_card</span> Pagamento</h2>
          <div class="divide-y divide-neutral-100">${rowsBoxed}</div>
        </div>
      </div>
      ${payButton(ctx.selected)}
      ${secureNote()}
    </div>`;
  }

  if (variant === "minimal") {
    return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start max-w-5xl mx-auto">
      <div class="order-2 lg:order-1">
        <section class="mb-10 sm:mb-12">
          <h2 class="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-5">Os seus dados</h2>
          ${customerFields({})}
        </section>
        <section>
          <h2 class="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-1">Forma de pagamento</h2>
          <div class="divide-y divide-neutral-200">${rows}</div>
        </section>
      </div>
      <div class="order-1 lg:order-2 lg:border-l lg:border-neutral-200 lg:pl-20 lg:sticky lg:top-6">
        <h2 class="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-5">Resumo</h2>
        <div class="divide-y divide-neutral-100">${summaryLines(ctx)}</div>
        <div class="flex items-baseline justify-between mt-6 pt-6 border-t-2 border-neutral-900">
          <span class="font-bold text-neutral-900">Total</span>
          <span class="text-3xl font-black tracking-tight" style="color:var(--brand)">${totalKz}</span>
        </div>
        <div class="mt-7">${payButton(ctx.selected)}</div>
        ${secureNote()}
      </div>
    </div>`;
  }

  // "dividido" (omissão) — modelo de referência (2 colunas), resumo primeiro no mobile.
  return `<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
    <div class="lg:col-span-3 space-y-6 order-2 lg:order-1">
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <h2 class="font-black text-neutral-900 mb-5 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">person</span> Dados Pessoais</h2>
        ${customerFields({ email: true })}
      </div>
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <h2 class="font-black text-neutral-900 mb-5 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">lock</span> Forma de Pagamento</h2>
        <div class="grid grid-cols-${cols} gap-2 sm:gap-3">${tiles}</div>
        <div class="mt-5">${payButton(ctx.selected)}</div>
        ${secureNote()}
      </div>
    </div>
    <div class="lg:col-span-2 order-1 lg:order-2">
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 class="font-black text-neutral-900 mb-4">Resumo do Pedido</h2>
        <div class="divide-y divide-neutral-100">${summaryLines(ctx)}</div>
        <div class="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200">
          <span class="font-bold text-neutral-900">Total</span>
          <span class="font-black text-2xl" style="color:var(--brand)">${totalKz}</span>
        </div>
        ${couponBlock()}
        <p class="text-center text-xs text-neutral-400 mt-5 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[15px]">help</span> Precisa de ajuda com o pedido?</p>
      </div>
    </div>
  </div>`;
}

/* ---- Blocos reutilizáveis (usados pelo fluxo por etapas em checkout.ts) ---- */

export type CheckoutMethodInfo = MethodInfo;
export const checkoutMethods = methodList;
export const renderMethodTile = methodTile;
export const renderMethodRow = methodRow;
export const renderCustomerFields = customerFields;
export const renderPayButton = payButton;

/** Indicador de etapas (1 Dados • 2 Pagamento • 3 Confirmação). */
export function renderStepper(active: number): string {
  const dot = (n: number, label: string): string =>
    stepDot(n, label, n < active ? "done" : n === active ? "active" : "todo");
  return `<div class="flex items-center justify-center gap-2 sm:gap-4">
    ${dot(1, "Dados")}<span class="h-px w-6 sm:w-12 bg-neutral-300"></span>
    ${dot(2, "Pagamento")}<span class="h-px w-6 sm:w-12 bg-neutral-300"></span>
    ${dot(3, "Confirmação")}
  </div>`;
}

/** Cartão "Resumo do Pedido" (itens com visto + cupão + subtotal/total). */
export function renderOrderSummaryCard(ctx: CheckoutLayoutCtx): string {
  const totalKz = esc(formatKz(ctx.total));
  const checkItems = ctx.items.map((i) => `<div class="flex items-center gap-2.5 py-3">
    <span class="material-symbols-outlined text-[20px] shrink-0" style="color:#16a34a">check_circle</span>
    <span class="flex-1 min-w-0 text-sm font-medium text-neutral-800 truncate">${i.quantity}× ${esc(i.name)}</span>
    <span class="text-sm font-semibold text-neutral-900 whitespace-nowrap">${esc(formatKz(i.price * i.quantity))}</span>
  </div>`).join("");
  return `<div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm lg:sticky lg:top-6">
    <h2 class="text-lg sm:text-xl font-black text-neutral-900 mb-4">Resumo do Pedido</h2>
    <div class="rounded-xl bg-neutral-50 px-4 divide-y divide-neutral-200/60">${checkItems}</div>
    <div class="mt-4 flex gap-2">
      <input id="coupon" type="text" placeholder="Código promocional" class="flex-1 bg-white border border-neutral-300 rounded-xl px-3.5 py-3 text-[16px] outline-none focus:border-[color:var(--brand)]" />
      <button id="coupon-apply" type="button" class="px-5 rounded-xl text-white font-semibold text-sm shrink-0" style="background:var(--brand)">Aplicar</button>
    </div>
    <div class="mt-5 space-y-2.5 text-sm">
      <div class="flex justify-between"><span class="text-neutral-500">Subtotal</span><span class="font-medium text-neutral-900">${totalKz}</span></div>
      <div class="flex items-baseline justify-between pt-3 border-t border-neutral-100"><span class="font-bold text-neutral-900">Total</span><span class="text-2xl font-black tracking-tight" style="color:var(--brand)">${totalKz}</span></div>
    </div>
  </div>`;
}
