/**
 * Peças de interface partilhadas pelas secções do Painel de Administração.
 *
 * O painel é para ler depressa: pouco texto por ecrã, estados com cor **e** com
 * palavra (nunca só cor), uma ação principal por linha. Estas funções devolvem
 * HTML em texto — o padrão das vistas, que desenham com `render()` de
 * `web/lib/dom.ts` — e escapam tudo o que interpolam.
 *
 * **Contraste.** O laranja da marca (`#F95901`) sobre branco fica em 3,2:1, que
 * não chega para texto pequeno (o nível AA pede 4,5:1). Por isso é a cor dos
 * ícones, dos indicadores e do anel de foco; o texto e os botões laranja usam o
 * tom escuro (`orange-700`, 5,2:1; `orange-800`, 7,3:1). Texto secundário fica
 * em `gray-600` ou mais escuro — o `gray-400` que o painel antigo usava para
 * texto não passava.
 *
 * As classes do Tailwind estão escritas por extenso de propósito: o Tailwind só
 * gera as classes que encontra literalmente nos ficheiros de `web/`.
 *
 * ## O desenho: neutro, e a cor só onde diz alguma coisa
 *
 * O painel tinha laranja em tudo: nas ligações, nos filtros escolhidos, no menu,
 * nos botões principais. Quando tudo é laranja, nada chama a atenção, e o ecrã
 * parecia um protótipo. Agora é cinzento e branco, com o texto a pesar o que
 * deve; a cor fica para os estados (os selos) e para o que pede uma decisão (os
 * contadores da navegação). As ações secundárias de uma linha são botões só com
 * ícone, com o nome no `aria-label` e no `title`.
 */
import { esc } from "../../lib/dom.js";
import { publicStoreUrl, STORE_APEX } from "../../composition.js";
import type { AccountStatus } from "../../../src/services/adminMetrics.js";

/* ------------------------------ Contrato das secções ------------------------------ */

/** Contadores da navegação: o que está à espera de uma decisão. */
export interface NavCounts {
  /** Pedidos de verificação de empresa em análise. */
  approvals: number;
  /** Levantamentos pedidos e ainda não tratados. */
  withdrawals: number;
}

/**
 * O que o painel dá a cada secção. A secção lê os dados, chama `paint()` com o
 * seu conteúdo e liga os seus eventos; a moldura (navegação, cabeçalho,
 * assistente) é do painel.
 */
export interface AdminView {
  /** Segundo segmento do endereço (`/adminPainel/<secção>/<sub>`), em minúsculas, ou "". */
  readonly sub: string;
  /** Mostra o painel com o indicador de carregamento no lugar do conteúdo. */
  loading(): void;
  /** Desenha o painel com este conteúdo. Devolve `false` se o ecrã já mudou entretanto. */
  paint(html: string): boolean;
  /** Este ecrã ainda é o atual? Depois de um `await`, pode já não ser. */
  isCurrent(): boolean;
  /** Abre o editor de uma loja; ao sair, o Administrador volta a este ecrã. */
  openStoreEditor(storeId: string, ownerId: string): void;
  /** Contadores atuais da navegação (`null` enquanto não foram lidos). */
  navCounts(): NavCounts | null;
  /** Atualiza os contadores da navegação. */
  setNavCounts(counts: Partial<NavCounts>): void;
  /** Volta a ler os dados e a desenhar a secção atual. */
  reload(): void;
}

/* ------------------------------------ Botões ------------------------------------ */

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const BTN_SIZE = {
  md: "h-9 px-3.5 text-sm",
  sm: "h-8 px-2.5 text-[13px]",
} as const;

const BTN_KIND = {
  primary: "bg-gray-900 text-white shadow-sm hover:bg-gray-800",
  secondary: "bg-white text-gray-700 border border-gray-300 shadow-sm hover:bg-gray-50 hover:text-gray-900",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  dangerOutline: "bg-white text-red-700 border border-gray-300 shadow-sm hover:border-red-200 hover:bg-red-50",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
} as const;

/** Tipo de botão: a ação principal, a secundária, a que aprova, a que apaga… */
export type ButtonKind = keyof typeof BTN_KIND;

/** Classes de um botão. */
export function btnClass(kind: ButtonKind, size: keyof typeof BTN_SIZE = "md"): string {
  return `${BTN_BASE} ${BTN_SIZE[size]} ${BTN_KIND[kind]}`;
}

/**
 * Botão só com ícone, para as ações secundárias de uma linha. O nome vai no
 * `aria-label` (leitores de ecrã) e no `title` (quem passa o rato).
 */
export function iconButton(o: {
  act: string; id: string; label: string; icon: string; danger?: boolean; extra?: string;
}): string {
  const tom = o.danger
    ? "text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900";
  return `<button type="button" data-act="${esc(o.act)}" data-id="${esc(o.id)}"${o.extra ? ` ${o.extra}` : ""} aria-label="${esc(o.label)}" title="${esc(o.label)}" class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-2 ${tom}">${icon(o.icon, "text-[18px]")}</button>`;
}

/** Ícone decorativo (escondido dos leitores de ecrã: o texto ao lado diz o mesmo). */
export function icon(name: string, cls = "text-[18px]"): string {
  // O tamanho vai também em linha: a folha dos Material Symbols carrega depois
  // da nossa e o `font-size: 24px` dela ganhava ao `text-[18px]`, com a mesma
  // especificidade. Os ícones dos selos e das ligações saíam do tamanho de um
  // título.
  const px = /text-\[(\d+)px\]/.exec(cls)?.[1];
  return `<span class="material-symbols-outlined ${cls}"${px ? ` style="font-size:${px}px"` : ""} aria-hidden="true">${esc(name)}</span>`;
}

/* ------------------------------------ Selos ------------------------------------ */

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-gray-50 text-gray-600 ring-gray-500/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  orange: "bg-orange-50 text-orange-800 ring-orange-600/20",
} as const;

/** Cor de um selo. A cor acompanha sempre uma palavra; nunca a substitui. */
export type Tone = keyof typeof TONES;

/** Selo de estado («Publicada», «Em análise»…). */
export function pill(text: string, tone: Tone, iconName?: string): string {
  return `<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap ring-1 ring-inset ${TONES[tone]}">${iconName ? icon(iconName, "text-[13px]") : ""}${esc(text)}</span>`;
}

/* ------------------------------------ Datas ------------------------------------ */

const DAY_MS = 86_400_000;

/** «12 jan. 2026», ou «—» sem data válida. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

/** «12 jan. 2026, 14:05», ou «—» sem data válida. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Dias de calendário (no fuso do navegador) entre duas datas: `to - from`. */
function calendarDays(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

/** Há quanto tempo: «hoje», «ontem», «há 3 dias». Vazio sem data válida. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const days = calendarDays(t, now);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

/** Quanto falta: «Termina hoje», «Termina amanhã», «Termina em 3 dias». */
export function endsIn(iso: string | null | undefined, now = Date.now()): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const days = calendarDays(now, t);
  if (days <= 0) return "Termina hoje";
  if (days === 1) return "Termina amanhã";
  return `Termina em ${days} dias`;
}

/* ------------------------------------ Texto ------------------------------------ */

/** «1 loja» / «3 lojas». */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** «1 mês» / «3 meses». */
export function monthsLabel(months: number): string {
  return months === 1 ? "1 mês" : `${months} meses`;
}

/** Texto para pesquisa: minúsculas e sem acentos («Lumière» encontra «lumiere»). */
export function fold(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Inicial para o avatar de uma conta. */
export function initials(text: string | null | undefined): string {
  return (text ?? "").trim().charAt(0).toUpperCase() || "?";
}

/* ----------------------------------- Blocos ----------------------------------- */

/** Indicador de carregamento, anunciado aos leitores de ecrã. */
export function loadingBlock(): string {
  return `<div class="flex flex-col items-center justify-center gap-3 py-24 text-gray-600" role="status">
    ${icon("progress_activity", "animate-spin text-[36px] text-gray-400")}
    <span class="text-sm">A carregar…</span>
  </div>`;
}

/** Estado vazio de uma lista. */
export function emptyState(iconName: string, title: string, text?: string): string {
  return `<div class="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
    <span class="mb-1 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm">${icon(iconName, "text-[20px]")}</span>
    <p class="text-sm font-semibold text-gray-900">${esc(title)}</p>
    ${text ? `<p class="max-w-sm text-[13px] text-gray-500">${esc(text)}</p>` : ""}
  </div>`;
}

/** Nota informativa curta. `html` já vem escapado por quem chama. */
export function noteBox(html: string, iconName = "info"): string {
  return `<div class="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[13px] text-gray-600">
    ${icon(iconName, "text-[18px] text-gray-400 shrink-0")}
    <p class="min-w-0">${html}</p>
  </div>`;
}

/** Título de um bloco dentro de uma secção, com contagem opcional. */
export function blockTitle(id: string, title: string, count?: number, tone: Tone = "gray"): string {
  return `<h2 id="${esc(id)}" class="flex items-center gap-2 text-sm font-semibold text-gray-900">${esc(title)}${typeof count === "number" ? pill(String(count), tone) : ""}</h2>`;
}

/** Cartão de resumo pequeno (um número com rótulo). */
export function statCard(label: string, value: string, hint?: string): string {
  return `<div class="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <p class="text-[13px] font-medium text-gray-500">${esc(label)}</p>
    <p class="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-gray-900 break-words">${esc(value)}</p>
    ${hint ? `<p class="mt-1 text-xs text-gray-500">${esc(hint)}</p>` : ""}
  </div>`;
}

/**
 * Ligação para a loja publicada, num novo separador.
 *
 * Corta com reticências quando não cabe, e o ícone fica sempre à vista. Tinha
 * `break-all`, que numa coluna estreita partia o endereço letra a letra; o
 * endereço inteiro está no `title`.
 */
export function storeLink(identifier: string): string {
  if (!identifier) return `<span class="text-sm text-gray-600">Sem endereço</span>`;
  const endereco = `${identifier}.${STORE_APEX}`;
  return `<a href="${esc(publicStoreUrl(identifier))}" target="_blank" rel="noopener noreferrer" title="${esc(endereco)}" class="inline-flex min-w-0 max-w-full items-center gap-1 rounded text-[13px] text-gray-600 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]"><span class="truncate">${esc(endereco)}</span>${icon("open_in_new", "text-[13px] shrink-0 text-gray-400")}<span class="sr-only"> (abre num novo separador)</span></a>`;
}

/* --------------------------------- Pesquisa e filtros --------------------------------- */

/** Campo de pesquisa com rótulo para leitores de ecrã. */
export function searchField(id: string, label: string, placeholder: string): string {
  return `<div class="relative min-w-0 flex-1">
    <label for="${esc(id)}" class="sr-only">${esc(label)}</label>
    ${icon("search", "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400")}
    <input id="${esc(id)}" type="search" autocomplete="off" placeholder="${esc(placeholder)}" class="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200" />
  </div>`;
}

/** Uma opção de um grupo de filtros. */
export interface ChipOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

/*
 * Os filtros são um controlo segmentado: uma faixa só, com o escolhido em
 * destaque. Eram seis pastilhas soltas, com borda laranja na escolhida.
 */
const CHIP_ON = "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1 text-[13px] font-medium text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]";
const CHIP_OFF = "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]";

/** Grupo de filtros (botões com `aria-pressed`). */
export function filterChips(group: string, label: string, options: readonly ChipOption[], active: string): string {
  return `<div role="group" aria-label="${esc(label)}" class="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm" data-chips="${esc(group)}">
    ${options.map((o) => `<button type="button" data-chip="${esc(o.value)}" aria-pressed="${o.value === active}" class="${o.value === active ? CHIP_ON : CHIP_OFF}">${esc(o.label)}${typeof o.count === "number" ? `<span class="tabular-nums text-[11px] opacity-70">${o.count}</span>` : ""}</button>`).join("")}
  </div>`;
}

/**
 * Liga um grupo de filtros desenhado por {@link filterChips}: marca o escolhido
 * e chama `onChange` com o valor.
 */
export function bindChips(group: string, onChange: (value: string) => void): void {
  const root = document.querySelector<HTMLElement>(`[data-chips="${group}"]`);
  if (!root) return;
  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-chip]");
    if (!btn || !root.contains(btn)) return;
    const value = btn.dataset.chip ?? "";
    root.querySelectorAll<HTMLButtonElement>("[data-chip]").forEach((b) => {
      const on = b === btn;
      b.setAttribute("aria-pressed", String(on));
      b.className = on ? CHIP_ON : CHIP_OFF;
    });
    onChange(value);
  });
}

/** Atualiza as contagens de um grupo de filtros já desenhado. */
export function updateChipCounts(group: string, counts: Readonly<Record<string, number>>): void {
  document.querySelectorAll<HTMLElement>(`[data-chips="${group}"] [data-chip]`).forEach((b) => {
    const n = counts[b.dataset.chip ?? ""];
    const slot = b.querySelector("span");
    if (slot && typeof n === "number") slot.textContent = String(n);
  });
}

/* ----------------------------------- Anúncios ----------------------------------- */

/** Região que anuncia o resultado das ações aos leitores de ecrã. */
export function liveRegion(id: string): string {
  return `<p id="${esc(id)}" role="status" aria-live="polite" class="sr-only"></p>`;
}

/** Anuncia uma frase na região {@link liveRegion}. */
export function announce(id: string, text: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  // Esvaziar primeiro: a mesma frase duas vezes seguidas também é anunciada.
  el.textContent = "";
  window.setTimeout(() => { el.textContent = text; }, 50);
}

/**
 * Selo do estado de uma subscrição: «Ativa até…», «Termina em…», «Expirou a…»,
 * «Sem subscrição» ou «Administrador». Serve a conta («Contas») e cada loja
 * («Lojas»); o estado sai sempre de `accountStatus`.
 */
export function planPill(st: AccountStatus): string {
  switch (st.kind) {
    case "admin": return pill("Administrador", "blue", "shield_person");
    case "active": return pill(`Ativa até ${fmtDate(st.expiresAt)}`, "green");
    case "expiring": return pill(endsIn(st.expiresAt), "amber", "schedule");
    case "expired": return pill(`Expirou a ${fmtDate(st.expiredAt)}`, "gray");
    default: return pill("Sem subscrição", "gray");
  }
}
