/**
 * Layouts de checkout (4 variantes) — partilhados pela página de checkout ao
 * vivo (`web/views/checkout.ts`) e pela pré-visualização no editor.
 *
 * Cada variante devolve o HTML interior do checkout (formulário + métodos +
 * resumo). Os métodos de pagamento são apresentados com logótipo (foto):
 * Multicaixa Express, Referência Bancária e WhatsApp (servidos de /integrations).
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
  { id: "moderno", label: "Moderno" },
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

function methodList(online: boolean): MethodInfo[] {
  const list: MethodInfo[] = [];
  if (online) {
    list.push({ id: "mcx", logo: "/integrations/Express.png", title: "Multicaixa Express", subtitle: "Instantâneo" });
    list.push({ id: "reference", logo: "/integrations/ATM.png", title: "Referência Bancária", subtitle: "ATM / Internet Banking" });
  }
  list.push({ id: "whatsapp", logo: "/integrations/Whatsapp.png", title: "WhatsApp", subtitle: "Combinar por mensagem" });
  return list;
}

const logoBox = (m: MethodInfo, size = 48): string =>
  `<img src="${esc(m.logo)}" alt="${esc(m.title)}" class="object-contain rounded-xl" style="width:${size}px;height:${size}px" onerror="this.style.display='none'" />`;

/** Cartão "azulejo" (logótipo em cima) — usado em Dividido e Moderno. */
function methodTile(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" class="group relative flex flex-col items-center text-center gap-2 rounded-2xl border-2 p-4 transition-all" style="border-color:${active ? "var(--brand)" : "#e5e7eb"};background:${active ? "rgba(0,0,0,.02)" : "#fff"}">
    ${active ? `<span class="material-symbols-outlined absolute top-2 right-2 text-[18px]" style="color:var(--brand)">check_circle</span>` : ""}
    ${logoBox(m, 48)}
    <span class="font-bold text-neutral-900 text-sm leading-tight">${esc(m.title)}</span>
    <span class="text-xs text-neutral-400">${esc(m.subtitle)}</span>
  </button>`;
}

/** Linha (logótipo à esquerda, radio à direita) — usado em Minimal. */
function methodRow(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" class="w-full flex items-center gap-4 py-4 text-left transition-colors">
    ${logoBox(m, 40)}
    <span class="flex-1 min-w-0"><span class="block font-semibold text-neutral-900">${esc(m.title)}</span><span class="block text-sm text-neutral-400">${esc(m.subtitle)}</span></span>
    <span class="material-symbols-outlined" style="color:${active ? "var(--brand)" : "#d4d4d8"}">${active ? "radio_button_checked" : "radio_button_unchecked"}</span>
  </button>`;
}

/** Pílula compacta (logótipo pequeno) — usado em Compacto. */
function methodPill(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" class="flex items-center gap-2 rounded-full border-2 px-3 py-2 transition-colors" style="border-color:${active ? "var(--brand)" : "#e5e7eb"};background:${active ? "rgba(0,0,0,.02)" : "#fff"}">
    ${logoBox(m, 24)}
    <span class="text-sm font-semibold text-neutral-800 whitespace-nowrap">${esc(m.title)}</span>
  </button>`;
}

function payLabel(selected: CheckoutMethodId | null): string {
  if (selected === null) return "Selecione um método";
  if (selected === "whatsapp") return "Finalizar via WhatsApp";
  return "Comprar agora";
}

function payButton(selected: CheckoutMethodId | null, full = true): string {
  const disabled = selected === null;
  const icon = selected === null ? "lock" : selected === "whatsapp" ? "chat" : "bolt";
  return `<button id="pay" type="button" ${disabled ? "disabled" : ""} class="${full ? "w-full" : ""} py-3.5 rounded-xl font-bold inline-flex items-center justify-center gap-2 text-base transition-opacity"
    style="${disabled ? "background:#e5e7eb;color:#9ca3af;cursor:not-allowed" : "background:var(--brand);color:#fff"}">
    <span class="material-symbols-outlined">${icon}</span> <span data-pay-label>${esc(payLabel(selected))}</span>
  </button>`;
}

function customerFields(opts: { email?: boolean; compact?: boolean } = {}): string {
  const inputCls = "mt-1 w-full bg-white border border-neutral-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[color:var(--brand)]";
  const f = (id: string, label: string, ph: string, type = "text", hint = ""): string =>
    `<label class="block"><span class="text-sm font-semibold text-neutral-700">${esc(label)}</span>
      <input id="${id}" type="${type}" placeholder="${esc(ph)}" class="${inputCls}" />
      ${hint ? `<span class="block text-xs text-neutral-400 mt-1">${esc(hint)}</span>` : ""}</label>`;
  if (opts.compact) {
    return `<div class="space-y-3">
      ${f("c-name", "Nome", "O seu nome")}
      ${f("c-phone", "Telemóvel", "9XX XXX XXX", "tel")}
    </div>`;
  }
  return `<div class="space-y-4">
    ${f("c-name", "Nome completo", "Ex: Maria Silva")}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${opts.email ? f("c-email", "Email", "seu@email.com", "email") : f("c-nif", "NIF (opcional)", "Para a fatura")}
      ${f("c-phone", "Telefone", "923456789", "tel", "Para Multicaixa Express, o código vai por SMS para este número.")}
    </div>
    ${opts.email ? `<label class="block"><span class="text-sm font-semibold text-neutral-700">NIF (opcional)</span><input id="c-nif" type="text" placeholder="Para a fatura" class="${inputCls}" /></label>` : ""}
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
      <input id="coupon" type="text" placeholder="Insira o código" class="flex-1 bg-white border border-neutral-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[color:var(--brand)]" />
      <button id="coupon-apply" type="button" class="px-4 rounded-xl bg-neutral-100 text-neutral-700 font-semibold text-sm hover:bg-neutral-200 transition-colors">Aplicar</button>
    </div>
  </div>`;
}

function secureNote(): string {
  return `<p class="text-center text-xs text-neutral-400 mt-3 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[15px]">verified_user</span> Pagamento 100% seguro e protegido</p>`;
}

/** Renderiza o checkout (conteúdo interior) na variante escolhida. */
export function renderCheckout(variant: CheckoutVariant, ctx: CheckoutLayoutCtx): string {
  const methods = methodList(ctx.online);
  const tiles = methods.map((m) => methodTile(m, ctx.selected === m.id)).join("");
  const rows = methods.map((m) => methodRow(m, ctx.selected === m.id)).join("");
  const pills = methods.map((m) => methodPill(m, ctx.selected === m.id)).join("");
  const totalKz = esc(formatKz(ctx.total));

  if (variant === "moderno") {
    return `<div class="max-w-xl mx-auto">
      <div class="rounded-3xl overflow-hidden shadow-xl border border-neutral-100 bg-white">
        <div class="p-6 text-white" style="background:linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 60%, #000))">
          <p class="text-white/80 text-sm">Total a pagar</p>
          <p class="text-4xl font-black mt-1">${totalKz}</p>
        </div>
        <div class="p-6 space-y-6">
          <div>
            <h2 class="font-black text-neutral-900 mb-3 flex items-center gap-2"><span class="material-symbols-outlined" style="color:var(--brand)">person</span> Os seus dados</h2>
            ${customerFields({ email: true })}
          </div>
          <div>
            <h2 class="font-black text-neutral-900 mb-3 flex items-center gap-2"><span class="material-symbols-outlined" style="color:var(--brand)">credit_card</span> Forma de pagamento</h2>
            <div class="grid grid-cols-${Math.min(methods.length, 3)} gap-3">${tiles}</div>
          </div>
          ${payButton(ctx.selected)}
          ${secureNote()}
        </div>
      </div>
    </div>`;
  }

  if (variant === "compacto") {
    return `<div class="max-w-md mx-auto space-y-5">
      <div class="rounded-2xl border border-neutral-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <span class="text-sm text-neutral-500">${ctx.items.length} artigo(s)</span>
          <span class="font-black text-xl" style="color:var(--brand)">${totalKz}</span>
        </div>
      </div>
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
        ${customerFields({ compact: true })}
        <div>
          <p class="text-sm font-semibold text-neutral-700 mb-2">Como quer pagar?</p>
          <div class="flex flex-wrap gap-2">${pills}</div>
        </div>
        ${payButton(ctx.selected)}
      </div>
      ${secureNote()}
    </div>`;
  }

  if (variant === "minimal") {
    return `<div class="max-w-lg mx-auto">
      <h1 class="text-3xl font-black mb-8">Finalizar</h1>
      <section class="mb-8">
        <h2 class="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Os seus dados</h2>
        ${customerFields({})}
      </section>
      <section class="mb-8">
        <h2 class="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Forma de pagamento</h2>
        <div class="divide-y divide-neutral-100">${rows}</div>
      </section>
      <div class="flex items-center justify-between py-4 border-t-2 border-neutral-900 mb-6">
        <span class="font-bold text-neutral-900">Total</span>
        <span class="font-black text-2xl" style="color:var(--brand)">${totalKz}</span>
      </div>
      ${payButton(ctx.selected)}
      ${secureNote()}
    </div>`;
  }

  // "dividido" (omissão) — recriação do modelo de referência (2 colunas).
  return `<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
    <div class="lg:col-span-3 space-y-6">
      <div class="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 class="font-black text-neutral-900 mb-5 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">person</span> Dados Pessoais</h2>
        ${customerFields({ email: true })}
      </div>
      <div class="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 class="font-black text-neutral-900 mb-5 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">lock</span> Forma de Pagamento</h2>
        <div class="grid grid-cols-${Math.min(methods.length, 3)} gap-3">${tiles}</div>
        <div class="mt-5">${payButton(ctx.selected)}</div>
        ${secureNote()}
      </div>
    </div>
    <div class="lg:col-span-2">
      <div class="rounded-2xl border border-neutral-200 bg-white p-6 lg:sticky lg:top-6">
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
