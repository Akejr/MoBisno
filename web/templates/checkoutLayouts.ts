/**
 * Layouts de checkout (4 variantes) — partilhados pela página de checkout ao
 * vivo (`web/views/checkout.ts`) e pela pré-visualização no editor.
 *
 * Cada variante devolve o HTML interior do checkout (formulário + métodos +
 * código de desconto + resumo). Os métodos de pagamento são apresentados com
 * logótipo: Multicaixa Express e Referência Bancária só quando a loja os tem
 * (`online`, decidido por `digitalPaymentsVisible`), e o WhatsApp sempre.
 *
 * Responsivo por omissão: grelhas que empilham no mobile, inputs a 16px (evita
 * o zoom automático do iOS) e alvos de toque generosos.
 *
 * Acessibilidade: cada campo tem `<label for>`; um erro é ligado ao campo por
 * `aria-describedby` e marca-o com `aria-invalid`; os métodos são botões com
 * `aria-pressed`; os ícones decorativos têm `aria-hidden`. Os botões de marca
 * usam `var(--brand)` no fundo e `var(--brand-ink)` no texto — nunca branco
 * fixo, que desaparece numa cor de marca clara.
 *
 * Hooks usados pela página ao vivo:
 *  - `[data-method="mcx|reference|whatsapp"]` — cartões de método
 *  - `[data-buyer="<campo>"]` (`#c-name`, `#c-phone`, `#c-email`, `#c-nif`,
 *    `#c-area`, `#c-street`, `#c-number`, `#c-reference`) — dados do comprador
 *  - `#pay` + `[data-pay-label]` — botão de finalização; `#pay-feedback` — avisos
 *  - `#coupon` / `#coupon-apply` / `#coupon-remove` / `#coupon-msg` — código de desconto
 */
import { esc, formatKz } from "../lib/dom.js";
import { DELIVERY_PROVINCE } from "../lib/areas.js";
import { BUYER_LIMITS, type BuyerDetails, type BuyerField } from "../../src/services/delivery.js";

export type CheckoutVariant = "dividido" | "moderno" | "compacto" | "minimal";

export const CHECKOUT_VARIANTS: { id: CheckoutVariant; label: string }[] = [
  { id: "dividido", label: "Dividido" },
  { id: "moderno", label: "Etapas" },
  { id: "compacto", label: "Compacto" },
  { id: "minimal", label: "Minimal" },
];

export type CheckoutMethodId = "mcx" | "reference" | "whatsapp";

interface MethodInfo { id: CheckoutMethodId; logo: string; title: string; subtitle: string; }

/** Estado do campo de código de desconto. */
export interface CouponState {
  /** Texto escrito no campo. */
  value?: string;
  /** Mensagem por baixo do campo (resultado da validação). */
  message?: string | null;
  /** A mensagem é um erro: marca o campo com `aria-invalid`. */
  error?: boolean;
  /** Validação em curso: o botão «Aplicar» não aceita segundo clique. */
  busy?: boolean;
}

export interface CheckoutLayoutCtx {
  storeName: string;
  /**
   * Linhas do carrinho. `price` é o preço efetivo da linha (já resolvido pela
   * Combinação) e `variantLabel` a etiqueta da Combinação escolhida, quando
   * existe (R4.14, R4.15).
   */
  items: { name: string; price: number; quantity: number; imageUrl?: string; variantLabel?: string }[];
  /** Subtotal dos artigos (sem entrega). */
  total: number;
  /**
   * Mostrar Multicaixa Express + Referência Bancária. Na página ao vivo é
   * `digitalPaymentsVisible(store)` — a única decisão.
   */
  online: boolean;
  /** Método atualmente selecionado (estado ativo). */
  selected: CheckoutMethodId | null;
  /** O carrinho tem ≥1 produto físico (mostra morada + entrega). */
  physical: boolean;
  /** Áreas onde a loja entrega (nome + taxa a pagar). */
  areas: { name: string; fee: number }[];
  /** Área de entrega escolhida. */
  selectedArea: string | null;
  /** Taxa de entrega da área escolhida (Kz). */
  deliveryFee: number;
  /** Desconto aplicado (Kz) por um código válido, ou 0. */
  discount?: number;
  /** Código de desconto aplicado, ou null. */
  discountCode?: string | null;
  /** Valores já escritos pelo comprador — o formulário é redesenhado sem os perder. */
  buyer?: BuyerDetails;
  /** Erros por campo, ligados ao campo por `aria-describedby`. */
  errors?: Partial<Record<BuyerField, string>>;
  /** Estado do código de desconto. */
  coupon?: CouponState;
  /** Entrega grátis a partir deste subtotal (Kz); 0 ou ausente = sem entrega grátis. */
  freeDeliveryFrom?: number;
  /** Pagamento em curso: o botão de pagar fica ocupado. */
  busy?: boolean;
}

/** Total a pagar (subtotal + entrega − desconto, quando aplicável). */
function grandTotal(ctx: CheckoutLayoutCtx): number {
  const gross = ctx.total + (ctx.physical ? ctx.deliveryFee : 0);
  return Math.max(0, gross - (ctx.discount ?? 0));
}

/** Taxa legível: «2.500,00 Kz» ou «grátis». */
function feeText(fee: number): string {
  return fee > 0 ? formatKz(fee) : "grátis";
}

/** Linhas de totais (subtotal + entrega + desconto + total) para os resumos. */
function orderTotals(ctx: CheckoutLayoutCtx): string {
  const grand = grandTotal(ctx);
  const discount = ctx.discount ?? 0;
  const hasArea = ctx.physical && ctx.selectedArea !== null;
  // A Loja não definiu áreas: o servidor não cobra entrega e a loja combina-a.
  const noAreas = ctx.physical && ctx.areas.length === 0;
  const needsArea = ctx.physical && ctx.areas.length > 0 && ctx.selectedArea === null;
  const show = hasArea || noAreas || discount > 0;
  const feeTxt = ctx.deliveryFee > 0 ? esc(formatKz(ctx.deliveryFee)) : "Grátis";
  return `<div class="space-y-2.5 text-sm">
    ${show ? `<div class="flex justify-between gap-3"><span class="text-neutral-600">Subtotal</span><span class="font-medium text-neutral-900">${esc(formatKz(ctx.total))}</span></div>` : ""}
    ${hasArea ? `<div class="flex justify-between gap-3"><span class="text-neutral-600">Entrega · ${esc(ctx.selectedArea ?? "")}</span><span class="font-medium text-neutral-900">${feeTxt}</span></div>` : ""}
    ${noAreas ? `<div class="flex justify-between gap-3"><span class="text-neutral-600">Entrega</span><span class="font-medium text-neutral-900">A combinar com a loja</span></div>` : ""}
    ${discount > 0 ? `<div class="flex justify-between gap-3"><span class="text-neutral-600">Desconto${ctx.discountCode ? ` · ${esc(ctx.discountCode)}` : ""}</span><span class="font-semibold text-green-700">−${esc(formatKz(discount))}</span></div>` : ""}
    ${needsArea ? `<p class="text-xs text-neutral-600">Escolha a área de entrega para calcular a taxa.</p>` : ""}
    <div class="flex items-baseline justify-between ${show ? "pt-3 border-t border-neutral-100" : ""}"><span class="font-bold text-neutral-900">Total</span><span class="text-2xl font-black tracking-tight" style="color:var(--brand)">${esc(formatKz(grand))}</span></div>
  </div>`;
}

/** Texto de apoio do telemóvel. O do Multicaixa Express só quando o método existe. */
const PHONE_HINT = "A loja usa este número para falar consigo sobre a encomenda.";
const PHONE_HINT_ONLINE =
  "Se pagar com Multicaixa Express, use o número da sua aplicação: é lá que recebe o pedido de pagamento.";

/**
 * Classe dos campos. A borda `neutral-500` dá o contraste de 3:1 que um campo
 * precisa para se ver; `aria-[invalid=true]` pinta o erro a partir do próprio
 * atributo, por isso tirar o `aria-invalid` tira também a borda vermelha.
 */
const INPUT_CLS =
  "mt-1.5 w-full bg-white border border-neutral-500 rounded-xl px-3.5 py-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand)] aria-[invalid=true]:border-red-700";

/** Campo só de leitura (a província, fixa nesta fase). */
const INPUT_READONLY_CLS =
  "mt-1.5 w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-3 text-[16px] text-neutral-700 outline-none";

/** Cor das mensagens de erro (vermelho 700: 6,5:1 sobre branco). Inline para a cor de texto da loja não a apagar. */
const ERROR_STYLE = "color:#b91c1c";

/** Cor das mensagens de sucesso (verde 700: 5:1 sobre branco). */
const SUCCESS_STYLE = "color:#15803d";

function methodList(online: boolean): MethodInfo[] {
  const list: MethodInfo[] = [];
  if (online) {
    list.push({ id: "mcx", logo: "/integrations/Express.png", title: "Multicaixa Express", subtitle: "Instantâneo" });
    list.push({ id: "reference", logo: "/integrations/ATM.png", title: "Referência Bancária", subtitle: "ATM / Internet Banking" });
  }
  list.push({ id: "whatsapp", logo: "/integrations/Whatsapp.png", title: "WhatsApp", subtitle: "Combinar por mensagem" });
  return list;
}

/** Logótipo do método. Decorativo (`alt=""`): o nome do método está escrito ao lado. */
const logoBox = (m: MethodInfo, size = 44): string =>
  `<img src="${esc(m.logo)}" alt="" class="object-contain rounded-xl" style="width:${size}px;height:${size}px" onerror="this.style.display='none'" />`;

/** Cartão "azulejo" (logótipo em cima). Responsivo (3 por linha, compacto no mobile). */
function methodTile(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" aria-pressed="${active ? "true" : "false"}" class="group relative flex flex-col items-center justify-start text-center gap-2 rounded-2xl border-2 p-3 sm:p-4 min-h-[112px] transition-all" style="border-color:${active ? "var(--brand)" : "#d4d4d8"};background:${active ? "rgba(0,0,0,.02)" : "#fff"}">
    ${active ? `<span aria-hidden="true" class="material-symbols-outlined absolute top-1.5 right-1.5 text-[18px]" style="color:var(--brand)">check_circle</span>` : ""}
    ${logoBox(m, 44)}
    <span class="font-bold text-neutral-900 text-[13px] sm:text-sm leading-tight">${esc(m.title)}</span>
    <span class="text-[11px] sm:text-xs text-neutral-600 leading-tight">${esc(m.subtitle)}</span>
  </button>`;
}

/** Linha (logótipo à esquerda, radio à direita). Alvo de toque alto. */
function methodRow(m: MethodInfo, active: boolean): string {
  return `<button type="button" data-method="${m.id}" aria-pressed="${active ? "true" : "false"}" class="w-full flex items-center gap-3 sm:gap-4 py-3.5 text-left transition-colors">
    ${logoBox(m, 40)}
    <span class="flex-1 min-w-0"><span class="block font-semibold text-neutral-900">${esc(m.title)}</span><span class="block text-sm text-neutral-600 truncate">${esc(m.subtitle)}</span></span>
    <span aria-hidden="true" class="material-symbols-outlined shrink-0" style="color:${active ? "var(--brand)" : "#d4d4d8"}">${active ? "radio_button_checked" : "radio_button_unchecked"}</span>
  </button>`;
}

/** Grupo de métodos com nome acessível. */
function methodGroup(cls: string, inner: string): string {
  return `<div role="group" aria-label="Forma de pagamento" class="${cls}">${inner}</div>`;
}

function payLabel(selected: CheckoutMethodId | null, busy: boolean): string {
  if (busy) return "A processar…";
  if (selected === null) return "Selecione um método";
  if (selected === "whatsapp") return "Finalizar via WhatsApp";
  return "Comprar agora";
}

/**
 * Botão de finalização + caixa de avisos do pagamento (`#pay-feedback`).
 *
 * Ocupado (`busy`), o botão fica `aria-disabled` em vez de `disabled`: um botão
 * desativado perde o foco, e o leitor de ecrã deixava de saber onde estava. A
 * página recusa o segundo clique pela própria bandeira de pagamento em curso.
 */
function payButton(selected: CheckoutMethodId | null, busy = false): string {
  const disabled = selected === null;
  const icon = selected === null ? "lock" : selected === "whatsapp" ? "chat" : "bolt";
  const label = payLabel(selected, busy);
  const style = disabled
    ? "background:#e5e7eb;color:#4b5563;cursor:not-allowed"
    : `background:var(--brand);color:var(--brand-ink,#fff);box-shadow:0 10px 24px -10px var(--brand)${busy ? ";opacity:.75;cursor:progress" : ""}`;
  return `<button id="pay" type="button" ${disabled ? "disabled" : ""} ${busy ? 'aria-disabled="true" aria-busy="true"' : ""} aria-label="${esc(label)}" class="w-full py-4 rounded-xl font-bold inline-flex items-center justify-center gap-2 text-base transition-opacity active:scale-[.99]"
    style="${style}">
    <span class="material-symbols-outlined">${icon}</span> <span data-pay-label>${esc(label)}</span>
  </button>
  <div id="pay-feedback" class="mt-3"></div>`;
}

interface FieldSpec {
  field: Exclude<BuyerField, "area">;
  label: string;
  type?: "text" | "tel" | "email";
  placeholder?: string;
  autocomplete?: string;
  inputmode?: "text" | "tel" | "email";
  required?: boolean;
  hint?: string;
}

/** Mensagem de erro de um campo, com o id que o `aria-describedby` do campo aponta. */
function fieldError(id: string, message: string): string {
  return `<p id="${id}" class="mt-1.5 text-xs font-semibold" style="${ERROR_STYLE}">${esc(message)}</p>`;
}

/** Um campo de texto do comprador: rótulo, campo, ajuda e erro ligados por id. */
function inputField(spec: FieldSpec, ctx: CheckoutLayoutCtx): string {
  const id = `c-${spec.field}`;
  const value = ctx.buyer?.[spec.field] ?? "";
  const error = ctx.errors?.[spec.field];
  const hintId = spec.hint ? `${id}-hint` : "";
  const errorId = error ? `${id}-error` : "";
  const describedBy = [hintId, errorId].filter((x) => x !== "").join(" ");
  const attrs = [
    `id="${id}"`,
    `name="${spec.field}"`,
    `data-buyer="${spec.field}"`,
    `type="${spec.type ?? "text"}"`,
    `value="${esc(value)}"`,
    `maxlength="${BUYER_LIMITS[spec.field]}"`,
    spec.autocomplete ? `autocomplete="${spec.autocomplete}"` : "",
    spec.inputmode ? `inputmode="${spec.inputmode}"` : "",
    spec.placeholder ? `placeholder="${esc(spec.placeholder)}"` : "",
    spec.required ? "required" : "",
    error ? 'aria-invalid="true"' : "",
    describedBy ? `aria-describedby="${describedBy}"` : "",
  ].filter((a) => a !== "").join(" ");
  return `<div class="min-w-0">
    <label for="${id}" class="block text-sm font-semibold text-neutral-700">${esc(spec.label)}</label>
    <input ${attrs} class="${INPUT_CLS}" />
    ${spec.hint ? `<p id="${hintId}" class="text-xs text-neutral-600 mt-1.5 leading-snug">${esc(spec.hint)}</p>` : ""}
    ${error ? fieldError(errorId, error) : ""}
  </div>`;
}

/** Seletor da área de entrega, com a taxa de cada área à vista. */
function areaField(ctx: CheckoutLayoutCtx): string {
  if (!ctx.areas.length) {
    return `<div class="min-w-0">
      <p class="block text-sm font-semibold text-neutral-700">Área</p>
      <p class="mt-1.5 text-sm text-neutral-600 leading-snug">A loja combina a área e o custo da entrega consigo.</p>
    </div>`;
  }
  const error = ctx.errors?.area;
  const chosen = ctx.selectedArea ?? ctx.buyer?.area ?? null;
  const options = ctx.areas
    .map((a) => `<option value="${esc(a.name)}"${chosen === a.name ? " selected" : ""}>${esc(a.name)} · ${esc(feeText(a.fee))}</option>`)
    .join("");
  return `<div class="min-w-0">
    <label for="c-area" class="block text-sm font-semibold text-neutral-700">Área</label>
    <select id="c-area" name="area" data-buyer="area" required${error ? ' aria-invalid="true" aria-describedby="c-area-error"' : ""} class="${INPUT_CLS}">
      <option value=""${chosen ? "" : " selected"} disabled>Selecione a área</option>
      ${options}
    </select>
    ${error ? fieldError("c-area-error", error) : ""}
  </div>`;
}

/** Nota da entrega grátis, quando a loja a oferece. */
function freeDeliveryNote(ctx: CheckoutLayoutCtx): string {
  const from = ctx.freeDeliveryFrom ?? 0;
  if (!(from > 0) || !ctx.areas.length) return "";
  const text = ctx.total >= from
    ? "A sua encomenda tem entrega grátis."
    : `Entrega grátis em encomendas a partir de ${formatKz(from)}.`;
  return `<p class="mt-3 text-xs font-medium text-neutral-600">${esc(text)}</p>`;
}

/** Morada de entrega (produtos físicos): província, área, rua, número e ponto de referência. */
function addressBlock(ctx: CheckoutLayoutCtx, columns: boolean): string {
  const grid = columns ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "space-y-4";
  return `<fieldset class="pt-1 min-w-0">
    <legend class="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-1.5"><span aria-hidden="true" class="material-symbols-outlined text-[18px]" style="color:var(--brand)">local_shipping</span> Morada de entrega</legend>
    <div class="${grid}">
      <div class="min-w-0"><label for="c-province" class="block text-sm font-semibold text-neutral-700">Província</label>
        <input id="c-province" value="${esc(DELIVERY_PROVINCE)}" disabled class="${INPUT_READONLY_CLS}" /></div>
      ${areaField(ctx)}
    </div>
    <div class="mt-4 space-y-4">
      ${inputField({ field: "street", label: "Rua ou bairro", placeholder: "Ex.: Rua Direita do Kilamba", autocomplete: "address-line1", required: true }, ctx)}
      <div class="${grid}">
        ${inputField({ field: "number", label: "Número (opcional)", placeholder: "Casa, prédio, andar", autocomplete: "address-line2" }, ctx)}
        ${inputField({ field: "reference", label: "Ponto de referência (opcional)", placeholder: "Ex.: junto à farmácia", autocomplete: "off" }, ctx)}
      </div>
    </div>
    ${freeDeliveryNote(ctx)}
  </fieldset>`;
}

/**
 * Dados do comprador: nome e telemóvel (obrigatórios), email e NIF
 * (opcionais) e, com produtos físicos, a morada de entrega.
 *
 * `columns: false` empilha tudo — para colunas estreitas («Compacto»).
 */
function customerFields(ctx: CheckoutLayoutCtx, opts: { columns?: boolean } = {}): string {
  const columns = opts.columns !== false;
  const grid = columns ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "space-y-4";
  const name = inputField({ field: "name", label: "Nome", placeholder: "Ex.: Maria Silva", autocomplete: "name", required: true }, ctx);
  const phone = inputField({
    field: "phone", label: "Telemóvel", type: "tel", placeholder: "9XX XXX XXX", autocomplete: "tel",
    inputmode: "tel", required: true, hint: ctx.online ? PHONE_HINT_ONLINE : PHONE_HINT,
  }, ctx);
  const email = inputField({ field: "email", label: "Email (opcional)", type: "email", placeholder: "nome@exemplo.com", autocomplete: "email", inputmode: "email" }, ctx);
  const nif = inputField({ field: "nif", label: "NIF (opcional)", placeholder: "Para a fatura", autocomplete: "off" }, ctx);
  return `<div class="space-y-4">
    <div class="${grid}">${name}${phone}</div>
    <div class="${grid}">${email}${nif}</div>
    ${ctx.physical ? addressBlock(ctx, columns) : ""}
  </div>`;
}

/** Etiqueta da Combinação de uma linha, quando existe (R4.14). */
function variantLine(label?: string): string {
  return label && label.trim()
    ? `<p class="text-xs text-neutral-600 truncate">${esc(label.trim())}</p>`
    : "";
}

/** A mesma etiqueta, inline, para os resumos de uma só linha por item. */
function variantInline(label?: string): string {
  return label && label.trim()
    ? `<span class="font-normal text-neutral-600"> · ${esc(label.trim())}</span>`
    : "";
}

/** Itens com visto (usado pelo resumo do pedido e pelo layout "Etapas"). */
function checkItemsHtml(ctx: CheckoutLayoutCtx): string {
  return ctx.items.map((i) => `<div class="flex items-center gap-2.5 py-3">
    <span aria-hidden="true" class="material-symbols-outlined text-[20px] shrink-0" style="color:#16a34a">check_circle</span>
    <span class="flex-1 min-w-0 text-sm font-medium text-neutral-800 truncate">${esc(i.quantity)}× ${esc(i.name)}${variantInline(i.variantLabel)}</span>
    <span class="text-sm font-semibold text-neutral-900 whitespace-nowrap">${esc(formatKz(i.price * i.quantity))}</span>
  </div>`).join("");
}

function summaryLines(ctx: CheckoutLayoutCtx): string {
  return ctx.items.map((i) => {
    const thumb = i.imageUrl
      ? `<img src="${esc(i.imageUrl)}" alt="" class="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0" />`
      : `<div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0"><span aria-hidden="true" class="material-symbols-outlined text-neutral-400 text-[20px]">image</span></div>`;
    return `<div class="flex items-center gap-3 py-2">
      ${thumb}
      <div class="flex-1 min-w-0"><p class="text-sm font-medium text-neutral-900 truncate">${esc(i.name)}</p>${variantLine(i.variantLabel)}<p class="text-xs text-neutral-600">Qtd: ${esc(i.quantity)}</p></div>
      <p class="text-sm font-semibold text-neutral-900 whitespace-nowrap">${esc(formatKz(i.price * i.quantity))}</p>
    </div>`;
  }).join("");
}

/**
 * Código de desconto — presente em **todos** os layouts.
 *
 * A mensagem (`#coupon-msg`) existe sempre, mesmo vazia, para o
 * `aria-describedby` do campo nunca apontar para nada. `brand` pinta o botão
 * «Aplicar» com a cor da loja; sem ele o botão é neutro.
 */
function couponBlock(ctx: CheckoutLayoutCtx, opts: { brand?: boolean; wrapperClass?: string } = {}): string {
  const c = ctx.coupon ?? {};
  const applied = ctx.discountCode ?? null;
  const value = c.value ?? applied ?? "";
  const message = c.message ?? "";
  const invalid = c.error === true && message !== "";
  const busy = c.busy === true;
  const btnCls = opts.brand
    ? "px-5 rounded-xl font-semibold text-sm shrink-0"
    : "px-4 rounded-xl bg-neutral-100 text-neutral-800 font-semibold text-sm hover:bg-neutral-200 transition-colors shrink-0";
  const btnStyle = opts.brand ? ' style="background:var(--brand);color:var(--brand-ink,#fff)"' : "";
  return `<div class="${opts.wrapperClass ?? "mt-5 pt-5 border-t border-neutral-100"}">
    <label for="coupon" class="block text-xs font-bold text-neutral-600 uppercase tracking-wider mb-2">Código de desconto</label>
    <div class="flex gap-2">
      <input id="coupon" type="text" value="${esc(value)}" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ex.: VERAO10" aria-describedby="coupon-msg"${invalid ? ' aria-invalid="true"' : ""} class="flex-1 min-w-0 bg-white border border-neutral-500 rounded-xl px-3.5 py-3 text-[16px] text-neutral-900 outline-none focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand)] aria-[invalid=true]:border-red-700" />
      <button id="coupon-apply" type="button"${busy ? ' aria-disabled="true" aria-busy="true"' : ""} class="${btnCls}"${btnStyle}>${busy ? "A validar…" : "Aplicar"}</button>
    </div>
    <p id="coupon-msg" class="text-xs font-medium mt-1.5" style="${invalid ? ERROR_STYLE : SUCCESS_STYLE}">${esc(message)}</p>
    ${applied ? `<button id="coupon-remove" type="button" class="mt-1 text-xs font-semibold underline text-neutral-700 hover:text-neutral-900">Remover código ${esc(applied)}</button>` : ""}
  </div>`;
}

/** Nota por baixo do botão: segurança do pagamento, ou como segue a encomenda por WhatsApp. */
function secureNote(ctx: CheckoutLayoutCtx): string {
  const [icon, text] = ctx.online
    ? ["verified_user", "Pagamento 100% seguro e protegido"]
    : ["chat", "A loja confirma a encomenda consigo por WhatsApp."];
  return `<p class="text-center text-xs text-neutral-600 mt-3 flex items-center justify-center gap-1"><span aria-hidden="true" class="material-symbols-outlined text-[15px]">${icon}</span> ${esc(text)}</p>`;
}

/** Barra de confiança com os logótipos dos métodos (rodapé do checkout). Só com pagamentos digitais. */
function trustRow(ctx: CheckoutLayoutCtx, methods: MethodInfo[]): string {
  if (!ctx.online) return "";
  return `<div class="mt-8 pt-6 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 text-xs text-neutral-600">
    <span class="flex items-center gap-1.5"><span aria-hidden="true" class="material-symbols-outlined text-[16px]">lock</span> Pagamento seguro e encriptado</span>
    <span class="flex items-center gap-2">${methods.map((m) => `<img src="${esc(m.logo)}" alt="${esc(m.title)}" class="h-6 w-auto object-contain" onerror="this.style.display='none'" />`).join("")}</span>
  </div>`;
}

/** Indicador de etapas (usado no layout "Etapas"). */
function stepDot(n: number, label: string, state: "done" | "active" | "todo"): string {
  const circle = state === "done"
    ? `<span aria-hidden="true" class="w-7 h-7 rounded-full flex items-center justify-center" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[18px]" style="color:var(--brand-ink,#fff)">check</span></span>`
    : state === "active"
      ? `<span aria-hidden="true" class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm" style="background:var(--brand);color:var(--brand-ink,#fff)">${n}</span>`
      : `<span aria-hidden="true" class="w-7 h-7 rounded-full flex items-center justify-center bg-neutral-200 text-neutral-700 font-bold text-sm">${n}</span>`;
  const txt = state === "todo" ? "text-neutral-600" : "text-neutral-900 font-semibold";
  return `<li class="flex items-center gap-2"${state === "active" ? ' aria-current="step"' : ""}>${circle}<span class="sr-only sm:not-sr-only text-sm ${txt}">${n}. ${esc(label)}</span></li>`;
}

/** Separador entre etapas (decorativo). */
const STEP_SEP = `<li aria-hidden="true" class="h-px w-6 sm:w-12 bg-neutral-300"></li>`;

/** Lista de etapas com o passo ativo marcado por `aria-current`. */
function stepperHtml(active: number): string {
  const dot = (n: number, label: string): string =>
    stepDot(n, label, n < active ? "done" : n === active ? "active" : "todo");
  return `<ol aria-label="Passos da encomenda" class="flex items-center justify-center gap-2 sm:gap-4">
    ${dot(1, "Dados")}${STEP_SEP}
    ${dot(2, "Pagamento")}${STEP_SEP}
    ${dot(3, "Confirmação")}
  </ol>`;
}

/** Renderiza o checkout (conteúdo interior) na variante escolhida. */
export function renderCheckout(variant: CheckoutVariant, ctx: CheckoutLayoutCtx): string {
  const methods = methodList(ctx.online);
  const tiles = methods.map((m) => methodTile(m, ctx.selected === m.id)).join("");
  const rows = methods.map((m) => methodRow(m, ctx.selected === m.id)).join("");
  const grand = esc(formatKz(grandTotal(ctx)));
  const cols = Math.min(methods.length, 3);
  const pay = payButton(ctx.selected, ctx.busy === true);

  if (variant === "moderno") {
    return `<div>
      <div class="mb-8">${stepperHtml(2)}</div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        <div class="lg:col-span-7 order-2 lg:order-1">
          <h1 class="text-2xl md:text-3xl font-black text-neutral-900">Detalhes de Pagamento</h1>
          <p class="text-neutral-600 mt-1 mb-6 text-sm">Conclua a compra escolhendo a forma de pagamento.</p>
          ${customerFields(ctx)}
          <h2 class="mt-8 mb-3 font-bold text-neutral-900">Forma de pagamento</h2>
          ${methodGroup(`grid grid-cols-${cols} gap-2 sm:gap-3`, tiles)}
          <div class="mt-6">${pay}</div>
          ${secureNote(ctx)}
        </div>
        <div class="lg:col-span-5 order-1 lg:order-2">${renderOrderSummaryCard(ctx)}</div>
      </div>
      ${trustRow(ctx, methods)}
    </div>`;
  }

  if (variant === "compacto") {
    const thumbs = ctx.items.slice(0, 4).map((i) => i.imageUrl
      ? `<img src="${esc(i.imageUrl)}" alt="" class="w-11 h-11 rounded-xl object-cover border-2 border-white shadow-sm" />`
      : `<div class="w-11 h-11 rounded-xl bg-neutral-100 border-2 border-white shadow-sm flex items-center justify-center"><span aria-hidden="true" class="material-symbols-outlined text-neutral-400 text-[18px]">image</span></div>`).join("");
    return `<div class="max-w-5xl mx-auto space-y-5">
      <h1 class="sr-only">Finalizar encomenda</h1>
      <div class="rounded-2xl border border-neutral-200 bg-white px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
        <div class="flex -space-x-3 shrink-0">${thumbs}</div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-neutral-900 leading-tight truncate">A sua encomenda</p>
          <p class="text-sm text-neutral-600">${esc(ctx.items.length)} artigo(s)</p>
          ${ctx.physical && ctx.selectedArea ? `<p class="text-xs text-neutral-600 mt-0.5">Entrega · ${esc(ctx.selectedArea)}: ${ctx.deliveryFee > 0 ? esc(formatKz(ctx.deliveryFee)) : "Grátis"}</p>` : ""}
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-neutral-600">Total</p>
          <p class="font-black text-xl sm:text-2xl tracking-tight" style="color:var(--brand)">${grand}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
          <h2 class="font-black text-neutral-900 mb-4 flex items-center gap-2"><span aria-hidden="true" class="material-symbols-outlined text-[20px]" style="color:var(--brand)">person</span> Dados</h2>
          ${customerFields(ctx, { columns: false })}
        </div>
        <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
          <h2 class="font-black text-neutral-900 mb-1 flex items-center gap-2"><span aria-hidden="true" class="material-symbols-outlined text-[20px]" style="color:var(--brand)">credit_card</span> Pagamento</h2>
          ${methodGroup("divide-y divide-neutral-100", rows)}
          ${couponBlock(ctx)}
          <div class="mt-5 pt-5 border-t border-neutral-100">${orderTotals(ctx)}</div>
        </div>
      </div>
      ${pay}
      ${secureNote(ctx)}
    </div>`;
  }

  if (variant === "minimal") {
    return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start max-w-5xl mx-auto">
      <h1 class="sr-only">Finalizar encomenda</h1>
      <div class="order-2 lg:order-1">
        <section class="mb-10 sm:mb-12">
          <h2 class="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-600 mb-5">Os seus dados</h2>
          ${customerFields(ctx)}
        </section>
        <section>
          <h2 class="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-600 mb-1">Forma de pagamento</h2>
          ${methodGroup("divide-y divide-neutral-200", rows)}
        </section>
      </div>
      <div class="order-1 lg:order-2 lg:border-l lg:border-neutral-200 lg:pl-20 lg:sticky lg:top-6">
        <h2 class="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-600 mb-5">Resumo</h2>
        <div class="divide-y divide-neutral-100">${summaryLines(ctx)}</div>
        ${couponBlock(ctx, { wrapperClass: "mt-6" })}
        <div class="mt-6 pt-6 border-t-2 border-neutral-900">${orderTotals(ctx)}</div>
        <div class="mt-7">${pay}</div>
        ${secureNote(ctx)}
      </div>
    </div>`;
  }

  // "dividido" (omissão) — modelo de referência (2 colunas), resumo primeiro no mobile.
  return `<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
    <h1 class="sr-only">Finalizar encomenda</h1>
    <div class="lg:col-span-3 space-y-6 order-2 lg:order-1">
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <h2 class="font-black text-neutral-900 mb-5 flex items-center gap-2"><span aria-hidden="true" class="material-symbols-outlined text-[20px]">person</span> Dados Pessoais</h2>
        ${customerFields(ctx)}
      </div>
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <h2 class="font-black text-neutral-900 mb-5 flex items-center gap-2"><span aria-hidden="true" class="material-symbols-outlined text-[20px]">lock</span> Forma de Pagamento</h2>
        ${methodGroup(`grid grid-cols-${cols} gap-2 sm:gap-3`, tiles)}
        <div class="mt-5">${pay}</div>
        ${secureNote(ctx)}
      </div>
    </div>
    <div class="lg:col-span-2 order-1 lg:order-2">
      <div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 class="font-black text-neutral-900 mb-4">Resumo do Pedido</h2>
        <div class="divide-y divide-neutral-100">${summaryLines(ctx)}</div>
        <div class="mt-4 pt-4 border-t border-neutral-200">${orderTotals(ctx)}</div>
        ${couponBlock(ctx)}
        <p class="text-center text-xs text-neutral-600 mt-5 flex items-center justify-center gap-1"><span aria-hidden="true" class="material-symbols-outlined text-[15px]">help</span> Precisa de ajuda com o pedido?</p>
      </div>
    </div>
  </div>`;
}

/* ---- Blocos reutilizáveis (usados pelo fluxo por etapas em checkout.ts) ---- */

export type CheckoutMethodInfo = MethodInfo;
export const checkoutMethods = methodList;
export const renderMethodTile = methodTile;
export const renderMethodRow = methodRow;
export const renderMethodGroup = methodGroup;
export const renderCustomerFields = customerFields;
export const renderPayButton = payButton;
export const renderSecureNote = secureNote;

/**
 * Total a pagar, tal como os layouts o apresentam. É este valor que segue em
 * `expectedTotal`: o total que o comprador viu.
 */
export const checkoutTotal = grandTotal;

/** Indicador de etapas (1 Dados • 2 Pagamento • 3 Confirmação). */
export function renderStepper(active: number): string {
  return stepperHtml(active);
}

/** Cartão "Resumo do Pedido" (itens com visto + código de desconto + subtotal/total). */
export function renderOrderSummaryCard(ctx: CheckoutLayoutCtx): string {
  const checkItems = checkItemsHtml(ctx);
  return `<div class="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm lg:sticky lg:top-6">
    <h2 class="text-lg sm:text-xl font-black text-neutral-900 mb-4">Resumo do Pedido</h2>
    <div class="rounded-xl bg-neutral-50 px-4 divide-y divide-neutral-200/60">${checkItems}</div>
    ${couponBlock(ctx, { brand: true, wrapperClass: "mt-4" })}
    <div class="mt-5">${orderTotals(ctx)}</div>
  </div>`;
}
