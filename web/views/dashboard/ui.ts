/**
 * Peças visuais do Dashboard do Dono, partilhadas pelos nove separadores.
 *
 * Só texto HTML: sem dados, sem eventos e sem Supabase. É o que deixa todos os
 * separadores com o mesmo cartão, o mesmo botão e a mesma etiqueta — o painel
 * antigo tinha três desenhos de cartão e duas cores diferentes para «Ativo» — e
 * o que permite aos testes desenhar este HTML a sério.
 *
 * As classes estão escritas por extenso e nunca montadas aos bocados: o
 * Tailwind só gera as classes que encontra literalmente nos ficheiros de `web/`.
 */
import { esc, formatKz } from "../../lib/dom.js";

/** Laranja da plataforma: fundos, ícones e contornos. */
export const ACCENT = "#F95901";

/** Fundo suave do laranja (ícones em círculo, realces). */
export const ACCENT_TINT = "rgba(249,89,1,.1)";

/**
 * Laranja escuro para **texto** pequeno.
 *
 * O `ACCENT` tem 3,3:1 de contraste com o branco: chega para ícones, contornos e
 * letra grande, não para uma etiqueta de 12 px. Este tem 5,2:1 sobre branco e
 * 4,6:1 sobre o fundo suave das etiquetas.
 */
export const ACCENT_INK = "#C2410C";

/** Tons das etiquetas e dos avisos. Todos com contraste AA para texto pequeno. */
export type Tone = "success" | "warning" | "danger" | "neutral" | "accent" | "info";

const TONES: Readonly<Record<Tone, { bg: string; fg: string; border: string }>> = {
  success: { bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" },
  warning: { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" },
  danger: { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
  neutral: { bg: "#f3f4f6", fg: "#4b5563", border: "#e5e7eb" },
  accent: { bg: "#fff4ed", fg: ACCENT_INK, border: "#fed7aa" },
  info: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
};

/*
 * Botões. O foco visível não está aqui: vem da folha do painel
 * (`web/views/dashboard.ts`, `mb-dash-style`), que o dá a todos os botões,
 * ligações e campos de uma vez — um botão novo não fica sem ele por esquecimento.
 */
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white bg-[#F95901] hover:bg-[#E04F00] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors";
export const BTN_DANGER =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
/** Botão pequeno, para ações dentro de uma linha de lista. */
export const BTN_SM =
  "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const BTN_SM_PRIMARY =
  "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white bg-[#F95901] hover:bg-[#E04F00] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const BTN_SM_DANGER =
  "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold border border-red-200 bg-white text-red-700 hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
/** Botão só de ícone: leva sempre `aria-label` no sítio onde é usado. */
export const BTN_ICON =
  "inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors";
export const BTN_ICON_DANGER =
  "inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-600 hover:bg-red-50 transition-colors";
/** Ligação com ar de ação (seta no fim), para os passos e os atalhos. */
export const BTN_LINK =
  "inline-flex items-center gap-1 text-sm font-bold text-[#C2410C] hover:underline";

/** Campo de texto. O contorno vermelho vem do `aria-invalid`, não de uma classe à parte. */
export const INPUT =
  "w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#F95901] focus:ring-2 focus:ring-[#F95901]/20 aria-[invalid=true]:border-red-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";
export const LABEL = "block text-sm font-semibold text-gray-800";
export const HINT = "mt-1 text-xs text-gray-500";

/** Ícone decorativo (escondido dos leitores de ecrã: o texto ao lado diz o mesmo). */
export function icon(name: string, cls = "text-[20px]"): string {
  return `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${esc(name)}</span>`;
}

/** Etiqueta de estado. O texto diz sempre o que a cor diz. */
export function pill(text: string, tone: Tone, iconName?: string): string {
  const t = TONES[tone];
  return `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap" style="background:${t.bg};color:${t.fg}">${iconName ? icon(iconName, "text-[15px]") : ""}${esc(text)}</span>`;
}

/** Etiqueta «Em breve» das funcionalidades por lançar. `what` é lido pelos leitores de ecrã. */
export function comingSoonBadge(what?: string): string {
  return `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap shrink-0" style="background:#fff4ed;color:${ACCENT_INK}">${icon("schedule", "text-[15px]")}${what ? `<span class="sr-only">${esc(what)}: </span>` : ""}Em breve</span>`;
}

/** Aviso dentro de um cartão. `text` é texto simples; `extra` é HTML já escapado. */
export function notice(tone: Tone, iconName: string, title: string, text: string, extra = ""): string {
  const t = TONES[tone];
  return `<div class="rounded-xl border p-4 flex items-start gap-3" style="background:${t.bg};border-color:${t.border}">
    <span class="material-symbols-outlined text-[20px] shrink-0" style="color:${t.fg}" aria-hidden="true">${esc(iconName)}</span>
    <div class="min-w-0 text-sm">
      ${title ? `<p class="font-bold" style="color:${t.fg}">${esc(title)}</p>` : ""}
      ${text ? `<p class="text-gray-700 ${title ? "mt-0.5" : ""}">${esc(text)}</p>` : ""}
      ${extra}
    </div>
  </div>`;
}

/** Cartão base. Todo o conteúdo do painel vive num destes. */
export function card(body: string, cls = ""): string {
  return `<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 md:p-6 min-w-0 ${cls}">${body}</section>`;
}

/** Cabeçalho de cartão: ícone, título (h2), subtítulo e um aparte à direita. */
export function cardHead(o: { icon: string; title: string; subtitle?: string; aside?: string; id?: string }): string {
  return `<div class="flex items-start justify-between gap-3 flex-wrap">
    <div class="flex items-start gap-3 min-w-0">
      <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}">${icon(o.icon)}</span>
      <div class="min-w-0">
        <h2 ${o.id ? `id="${esc(o.id)}"` : ""} class="font-black text-gray-900 leading-tight">${esc(o.title)}</h2>
        ${o.subtitle ? `<p class="text-sm text-gray-500 mt-0.5">${esc(o.subtitle)}</p>` : ""}
      </div>
    </div>
    ${o.aside ?? ""}
  </div>`;
}

/**
 * Frase de abertura do separador, com as ações principais ao lado.
 *
 * Não repete o título: o cabeçalho do painel já diz em que separador se está, e
 * o título outra vez por baixo era a primeira coisa a mais que se via.
 */
export function pageIntro(text: string, actions = ""): string {
  return `<div class="flex flex-wrap items-center justify-between gap-3 mb-6">
    <p class="text-gray-600 max-w-2xl">${esc(text)}</p>
    ${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ""}
  </div>`;
}

/** Estado vazio: o que falta e o que fazer, em vez de uma lista em branco. */
export function emptyState(o: { icon: string; title: string; text: string; actions?: string }): string {
  return `<div class="px-6 py-10 text-center">
    <span class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}">${icon(o.icon, "text-[28px]")}</span>
    <p class="mt-4 font-black text-gray-900">${esc(o.title)}</p>
    <p class="mt-1 text-sm text-gray-500 max-w-sm mx-auto">${esc(o.text)}</p>
    ${o.actions ? `<div class="mt-5 flex flex-wrap items-center justify-center gap-3">${o.actions}</div>` : ""}
  </div>`;
}

/**
 * Campo com rótulo, ajuda e erro ligados por `aria-describedby`.
 *
 * O erro só entra na descrição quando existe: um `aria-describedby` a apontar
 * para um parágrafo vazio fazia o leitor de ecrã ler um silêncio.
 */
export function field(o: {
  id: string;
  label: string;
  value?: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  attrs?: string;
  labelExtra?: string;
}): string {
  const hintId = o.hint ? `${o.id}-hint` : "";
  const errId = `${o.id}-err`;
  const describedBy = [hintId, o.error ? errId : ""].filter(Boolean).join(" ");
  return `<div class="min-w-0">
    <label for="${esc(o.id)}" class="${LABEL}">${esc(o.label)}${o.labelExtra ?? ""}${o.optional ? ` <span class="font-normal text-gray-500">(opcional)</span>` : ""}</label>
    <input id="${esc(o.id)}" name="${esc(o.id)}" type="${esc(o.type ?? "text")}" value="${esc(o.value ?? "")}"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}${o.error ? ` aria-invalid="true"` : ""}${describedBy ? ` aria-describedby="${describedBy}"` : ""} class="${INPUT} mt-1.5" ${o.attrs ?? ""} />
    ${o.hint ? `<p id="${hintId}" class="${HINT}">${esc(o.hint)}</p>` : ""}
    <p id="${errId}" class="mt-1 text-xs font-semibold text-red-700 ${o.error ? "" : "hidden"}">${esc(o.error ?? "")}</p>
  </div>`;
}

/**
 * Escolha entre poucas opções, em botões com `aria-pressed`.
 *
 * O realce do botão escolhido sai do próprio `aria-pressed` (variante
 * `aria-pressed:` do Tailwind): mudar a escolha é mudar o atributo, e o ecrã e o
 * leitor de ecrã ficam sempre de acordo.
 */
export function segmented(attr: string, options: readonly { value: string; label: string }[], active: string, ariaLabel: string): string {
  return `<div role="group" aria-label="${esc(ariaLabel)}" class="inline-flex flex-wrap bg-gray-100 rounded-xl p-1 gap-1 text-sm">
    ${options.map((o) => `<button type="button" data-${esc(attr)}="${esc(o.value)}" aria-pressed="${o.value === active ? "true" : "false"}" class="px-4 py-2 rounded-lg font-semibold text-gray-600 hover:text-gray-900 transition-colors aria-pressed:bg-white aria-pressed:text-[#C2410C] aria-pressed:shadow-sm">${esc(o.label)}</button>`).join("")}
  </div>`;
}

/** Esqueleto de carregamento de um separador. Quem pede menos movimento vê-o parado. */
export const SKELETON = `<div aria-busy="true" class="space-y-6">
  <p class="sr-only" role="status">A carregar…</p>
  <div class="animate-pulse motion-reduce:animate-none space-y-6" aria-hidden="true">
    <div class="h-5 w-72 max-w-full rounded-lg bg-gray-200"></div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="h-44 rounded-2xl bg-gray-200/70 lg:col-span-2"></div>
      <div class="h-44 rounded-2xl bg-gray-200/70"></div>
    </div>
    <div class="h-64 rounded-2xl bg-gray-200/70"></div>
  </div>
</div>`;

/** Indicador pequeno de espera, dentro de um botão ou de uma linha. */
export const SPIN = `<span class="material-symbols-outlined text-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true">progress_activity</span>`;

/** Data por extenso: «12 de agosto de 2026». Vazio se a data não for válida. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
}

/** Data curta: «12/08/2026». */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT");
}

/** Data e hora: «12/08/2026 · 14:30». */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-PT")} · ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Kwanzas sem os cêntimos quando o valor é redondo: «2.500 Kz».
 *
 * Parte do `formatKz` (o formato único da plataforma) e só tira o «,00» do fim;
 * um valor com cêntimos sai igual ao `formatKz`.
 */
export function kzRound(value: number): string {
  return formatKz(value).replace(/,00 Kz$/, " Kz");
}

/** «1 uso» / «3 usos». */
export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}
