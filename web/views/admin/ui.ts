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
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const BTN_SIZE = {
  md: "px-4 py-2.5 text-sm",
  sm: "px-3 py-1.5 text-sm",
} as const;

const BTN_KIND = {
  primary: "bg-orange-700 text-white hover:bg-orange-800",
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50",
  success: "bg-emerald-700 text-white hover:bg-emerald-800",
  danger: "bg-red-700 text-white hover:bg-red-800",
  dangerOutline: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  ghost: "text-gray-700 hover:bg-gray-100",
} as const;

/** Tipo de botão: a ação principal, a secundária, a que aprova, a que apaga… */
export type ButtonKind = keyof typeof BTN_KIND;

/** Classes de um botão. */
export function btnClass(kind: ButtonKind, size: keyof typeof BTN_SIZE = "md"): string {
  return `${BTN_BASE} ${BTN_SIZE[size]} ${BTN_KIND[kind]}`;
}

/** Ícone decorativo (escondido dos leitores de ecrã: o texto ao lado diz o mesmo). */
export function icon(name: string, cls = "text-[18px]"): string {
  return `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${esc(name)}</span>`;
}

/* ------------------------------------ Selos ------------------------------------ */

const TONES = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
} as const;

/** Cor de um selo. A cor acompanha sempre uma palavra; nunca a substitui. */
export type Tone = keyof typeof TONES;

/** Selo de estado («Publicada», «Em análise»…). */
export function pill(text: string, tone: Tone, iconName?: string): string {
  return `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${TONES[tone]}">${iconName ? icon(iconName, "text-[14px]") : ""}${esc(text)}</span>`;
}

/* ------------------------------------ Datas ------------------------------------ */

const DAY_MS = 86_400_000;

/** «12 jan. 2026», ou «—» sem data válida. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

/** «12 jan. 2026, 14:05», ou «—» sem data válida. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
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
  return `<div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-600">${icon(iconName, "text-[24px]")}</span>
    <p class="font-semibold text-gray-900">${esc(title)}</p>
    ${text ? `<p class="max-w-sm text-sm text-gray-600">${esc(text)}</p>` : ""}
  </div>`;
}

/** Nota informativa curta. `html` já vem escapado por quem chama. */
export function noteBox(html: string, iconName = "info"): string {
  return `<div class="flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
    ${icon(iconName, "text-[20px] text-gray-500 shrink-0")}
    <p class="min-w-0">${html}</p>
  </div>`;
}

/** Título de um bloco dentro de uma secção, com contagem opcional. */
export function blockTitle(id: string, title: string, count?: number, tone: Tone = "gray"): string {
  return `<h2 id="${esc(id)}" class="flex items-center gap-2 text-base font-bold text-gray-900">${esc(title)}${typeof count === "number" ? pill(String(count), tone) : ""}</h2>`;
}

/** Cartão de resumo pequeno (um número com rótulo). */
export function statCard(label: string, value: string, hint?: string): string {
  return `<div class="min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-3">
    <p class="text-sm text-gray-600">${esc(label)}</p>
    <p class="mt-1 text-xl font-black tracking-tight text-gray-900 break-words">${esc(value)}</p>
    ${hint ? `<p class="mt-0.5 text-xs text-gray-600">${esc(hint)}</p>` : ""}
  </div>`;
}

/** Ligação para a loja publicada, num novo separador. */
export function storeLink(identifier: string): string {
  if (!identifier) return `<span class="text-sm text-gray-600">Sem endereço</span>`;
  return `<a href="${esc(publicStoreUrl(identifier))}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sm text-orange-700 hover:underline break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] rounded">${esc(identifier)}.${esc(STORE_APEX)}${icon("open_in_new", "text-[14px]")}<span class="sr-only"> (abre num novo separador)</span></a>`;
}

/* --------------------------------- Pesquisa e filtros --------------------------------- */

/** Campo de pesquisa com rótulo para leitores de ecrã. */
export function searchField(id: string, label: string, placeholder: string): string {
  return `<div class="relative min-w-0 flex-1">
    <label for="${esc(id)}" class="sr-only">${esc(label)}</label>
    ${icon("search", "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-500")}
    <input id="${esc(id)}" type="search" autocomplete="off" placeholder="${esc(placeholder)}" class="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-[#F95901] focus:ring-2 focus:ring-orange-200" />
  </div>`;
}

/** Uma opção de um grupo de filtros. */
export interface ChipOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

const CHIP_ON = "inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-1";
const CHIP_OFF = "inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-1";

/** Grupo de filtros (botões com `aria-pressed`). */
export function filterChips(group: string, label: string, options: readonly ChipOption[], active: string): string {
  return `<div role="group" aria-label="${esc(label)}" class="flex flex-wrap gap-2" data-chips="${esc(group)}">
    ${options.map((o) => `<button type="button" data-chip="${esc(o.value)}" aria-pressed="${o.value === active}" class="${o.value === active ? CHIP_ON : CHIP_OFF}">${esc(o.label)}${typeof o.count === "number" ? `<span class="text-xs font-bold">${o.count}</span>` : ""}</button>`).join("")}
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
