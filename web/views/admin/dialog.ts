/**
 * Caixa de diálogo acessível do Painel de Administração.
 *
 * Substitui o `confirm()` e o `prompt()` do navegador quando a decisão precisa
 * de contexto (os dados de uma empresa antes de a aprovar) ou de uma resposta (o
 * motivo de uma rejeição, a duração de uma ativação):
 *
 *  - `role="dialog"` com `aria-modal`, título e descrição ligados por `aria-*`;
 *  - o resto da página fica `inert` enquanto o diálogo está aberto, o foco entra
 *    no diálogo, fica preso nele (Tab e Shift+Tab dão a volta) e volta ao botão
 *    que o abriu quando fecha;
 *  - Esc, «Cancelar» e um clique fora fecham sem fazer nada;
 *  - os erros de validação aparecem junto do campo, com `aria-invalid` e
 *    `aria-describedby`, e o foco vai para o primeiro campo com erro.
 *
 * Sem campos, o foco inicial fica em «Cancelar»: Enter num diálogo que liga
 * pagamentos ou apaga dados não deve confirmar por engano.
 *
 * Vive fora do `#app` (no `body`): uma nova pintura do painel não o apaga a meio.
 */
import { esc } from "../../lib/dom.js";
import { btnClass } from "./ui.js";

/** Um campo de texto do diálogo. */
export interface DialogField {
  readonly id: string;
  readonly label: string;
  readonly kind?: "text" | "textarea";
  readonly value?: string;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly maxLength?: number;
  /** Mostra o nº de caracteres escritos. */
  readonly counter?: boolean;
  /** Frase do erro, ou `null` quando o valor serve. */
  readonly validate?: (value: string) => string | null;
}

/** Uma opção de uma escolha única. */
export interface DialogChoice {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
}

/** O que mostrar e perguntar. */
export interface DialogOptions {
  readonly title: string;
  /** Conteúdo em HTML — quem chama escapa o que interpola. */
  readonly body?: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: "primary" | "success" | "danger";
  readonly fields?: readonly DialogField[];
  readonly choice?: {
    readonly legend: string;
    readonly options: readonly DialogChoice[];
    readonly value?: string;
    /** Frase que acompanha a opção escolhida, atualizada ao mudar. HTML já escapado. */
    readonly describe?: (value: string) => string;
  };
}

/** A resposta: os valores dos campos e a opção escolhida. */
export interface DialogResult {
  readonly values: Readonly<Record<string, string>>;
  readonly choice: string | null;
}

const INPUT_CLASS =
  "block w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-[#F95901] focus:ring-2 focus:ring-orange-200 aria-[invalid=true]:border-red-600";

let dialogSeq = 0;

/** Nº de caracteres como o vê quem escreve (um emoji conta um). */
function chars(text: string): number {
  return Array.from(text).length;
}

function fieldHtml(f: DialogField, prefix: string): string {
  const id = `${prefix}-f-${f.id}`;
  const described = [f.hint ? `${id}-hint` : "", f.counter ? `${id}-count` : "", `${id}-err`].filter(Boolean).join(" ");
  const attrs = `id="${id}" name="${esc(f.id)}" data-dlg-field="${esc(f.id)}" aria-describedby="${described}"${
    f.maxLength ? ` maxlength="${f.maxLength}"` : ""}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""} class="${INPUT_CLASS}"`;
  const control = f.kind === "textarea"
    ? `<textarea ${attrs} rows="4">${esc(f.value ?? "")}</textarea>`
    : `<input type="text" autocomplete="off" ${attrs} value="${esc(f.value ?? "")}" />`;
  return `<div class="mt-4">
    <label for="${id}" class="block text-sm font-semibold text-gray-900">${esc(f.label)}</label>
    ${f.hint ? `<p id="${id}-hint" class="mt-0.5 text-xs text-gray-600">${esc(f.hint)}</p>` : ""}
    <div class="mt-1.5">${control}</div>
    <div class="mt-1 flex items-start justify-between gap-3">
      <p id="${id}-err" class="text-xs font-medium text-red-700" data-dlg-err="${esc(f.id)}"></p>
      ${f.counter ? `<p id="${id}-count" class="shrink-0 text-xs text-gray-600" data-dlg-count="${esc(f.id)}"></p>` : ""}
    </div>
  </div>`;
}

function choiceHtml(c: NonNullable<DialogOptions["choice"]>, prefix: string, value: string): string {
  return `<fieldset class="mt-4">
    <legend class="text-sm font-semibold text-gray-900">${esc(c.legend)}</legend>
    <div class="mt-2 grid grid-cols-2 gap-2">
      ${c.options.map((o) => `<label class="flex cursor-pointer flex-col rounded-xl border border-gray-300 px-3 py-2.5 transition-colors hover:bg-gray-50 has-[:checked]:border-[#F95901] has-[:checked]:bg-orange-50 focus-within:ring-2 focus-within:ring-[#F95901]">
        <span class="flex items-center gap-2">
          <input type="radio" name="${prefix}-choice" value="${esc(o.value)}" ${o.value === value ? "checked" : ""} class="h-4 w-4 border-gray-400 text-orange-700 focus:ring-[#F95901]" />
          <span class="text-sm font-semibold text-gray-900">${esc(o.label)}</span>
        </span>
        ${o.detail ? `<span class="mt-0.5 pl-6 text-xs text-gray-600">${esc(o.detail)}</span>` : ""}
      </label>`).join("")}
    </div>
    ${c.describe ? `<p class="mt-3 text-sm text-gray-800" aria-live="polite" data-dlg-desc>${c.describe(value)}</p>` : ""}
  </fieldset>`;
}

/**
 * Abre o diálogo e espera pela resposta. `null` quando o Administrador cancela.
 */
export function openDialog(opts: DialogOptions): Promise<DialogResult | null> {
  return new Promise((resolve) => {
    const prefix = `adm-dlg-${++dialogSeq}`;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fields = opts.fields ?? [];
    const firstChoice = opts.choice ? (opts.choice.value ?? opts.choice.options[0]?.value ?? "") : "";
    const tone = opts.tone ?? "primary";

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[120] flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4";
    overlay.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="${prefix}-title"${opts.body ? ` aria-describedby="${prefix}-body"` : ""} class="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
      <form novalidate class="p-5 sm:p-6">
        <h2 id="${prefix}-title" class="text-lg font-bold text-gray-900">${esc(opts.title)}</h2>
        ${opts.body ? `<div id="${prefix}-body" class="mt-2 space-y-2 text-sm text-gray-700">${opts.body}</div>` : ""}
        ${opts.choice ? choiceHtml(opts.choice, prefix, firstChoice) : ""}
        ${fields.map((f) => fieldHtml(f, prefix)).join("")}
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-dlg-cancel class="${btnClass("secondary")}">${esc(opts.cancelLabel ?? "Cancelar")}</button>
          <button type="submit" data-dlg-confirm class="${btnClass(tone)}">${esc(opts.confirmLabel)}</button>
        </div>
      </form>
    </div>`;

    const dialog = overlay.firstElementChild as HTMLElement;
    const form = overlay.querySelector("form") as HTMLFormElement;
    const app = document.getElementById("app");
    const previousOverflow = document.body.style.overflow;

    const control = (id: string): HTMLInputElement | HTMLTextAreaElement | null =>
      overlay.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-dlg-field="${CSS.escape(id)}"]`);

    const chosen = (): string | null =>
      overlay.querySelector<HTMLInputElement>(`input[name="${prefix}-choice"]:checked`)?.value ?? null;

    /** Elementos que recebem foco com Tab, pela ordem do documento. */
    const tabbables = (): HTMLElement[] =>
      Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select")).filter((el) => {
        if ((el as HTMLButtonElement).disabled) return false;
        // Num grupo de opções só a escolhida está na ordem do Tab.
        if (el instanceof HTMLInputElement && el.type === "radio") return el.checked;
        return true;
      });

    const showCount = (f: DialogField): void => {
      const el = control(f.id);
      const slot = overlay.querySelector<HTMLElement>(`[data-dlg-count="${CSS.escape(f.id)}"]`);
      if (el && slot) slot.textContent = f.maxLength ? `${chars(el.value)} / ${f.maxLength}` : `${chars(el.value)}`;
    };

    /** Valida um campo e mostra (ou limpa) o erro. Devolve se o valor serve. */
    const check = (f: DialogField): boolean => {
      const el = control(f.id);
      const slot = overlay.querySelector<HTMLElement>(`[data-dlg-err="${CSS.escape(f.id)}"]`);
      const message = el && f.validate ? f.validate(el.value) : null;
      if (el) el.setAttribute("aria-invalid", message ? "true" : "false");
      if (slot) slot.textContent = message ?? "";
      return !message;
    };

    let closed = false;
    const close = (result: DialogResult | null): void => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      app?.removeAttribute("inert");
      // O botão que abriu o diálogo pode já não existir (a lista foi redesenhada).
      const back = opener && document.contains(opener) ? opener : document.getElementById("admin-main");
      back?.focus();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(null);
        return;
      }
      if (e.key !== "Tab") return;
      const list = tabbables();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        list[list.length - 1]?.focus();
      } else if (!e.shiftKey && (i === -1 || i === list.length - 1)) {
        e.preventDefault();
        list[0]?.focus();
      }
    };

    // Fechar ao clicar fora — mas só se o clique começou fora: arrastar uma
    // seleção de texto do campo para fora não deve fechar o diálogo.
    let downOutside = false;
    overlay.addEventListener("mousedown", (e) => { downOutside = e.target === overlay; });
    overlay.addEventListener("click", (e) => { if (downOutside && e.target === overlay) close(null); });

    overlay.querySelector("[data-dlg-cancel]")?.addEventListener("click", () => close(null));

    for (const f of fields) {
      const el = control(f.id);
      if (f.counter) showCount(f);
      el?.addEventListener("input", () => {
        if (f.counter) showCount(f);
        // Depois do primeiro erro, a mensagem acompanha o que se escreve.
        if (el.getAttribute("aria-invalid") === "true") check(f);
      });
    }

    if (opts.choice?.describe) {
      const describe = opts.choice.describe;
      overlay.querySelectorAll<HTMLInputElement>(`input[name="${prefix}-choice"]`).forEach((radio) =>
        radio.addEventListener("change", () => {
          const desc = overlay.querySelector<HTMLElement>("[data-dlg-desc]");
          if (desc) desc.innerHTML = describe(radio.value);
        }));
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const invalid = fields.filter((f) => !check(f));
      if (invalid.length) {
        const first = invalid[0];
        if (first) control(first.id)?.focus();
        return;
      }
      const values: Record<string, string> = {};
      for (const f of fields) values[f.id] = control(f.id)?.value ?? "";
      close({ values, choice: chosen() });
    });

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    app?.setAttribute("inert", "");
    document.addEventListener("keydown", onKey, true);

    const firstField = fields[0] ? control(fields[0].id) : null;
    const checkedRadio = overlay.querySelector<HTMLInputElement>(`input[name="${prefix}-choice"]:checked`);
    (firstField ?? checkedRadio ?? overlay.querySelector<HTMLElement>("[data-dlg-cancel]"))?.focus();
  });
}
