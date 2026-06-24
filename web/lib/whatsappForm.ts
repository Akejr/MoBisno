/**
 * Modal de edição do botão "Comprar via WhatsApp" (número + mensagem).
 *
 * A mensagem é editada num campo rich-text onde os campos obrigatórios
 * ({produto} e {preco}) aparecem como "chips" na cor da loja e não podem ser
 * apagados — se forem removidos, são automaticamente repostos.
 */
import { esc } from "./dom.js";
import { WA_DEFAULT_TEMPLATE, WA_TOKENS, WA_TOKEN_LABELS, ensureTokens, type WaToken } from "./whatsapp.js";

interface WhatsappFormOptions {
  phone: string;
  template: string;
  /** Cor de destaque (para os chips dos tokens). */
  brand: string;
  onSave: (phone: string, template: string) => void | Promise<void>;
}

function chip(token: WaToken, brand: string): string {
  return `<span contenteditable="false" data-token="${token}" class="mb-token" style="color:${esc(brand)};background:${esc(brand)}1f;border:1px solid ${esc(brand)}55;border-radius:6px;padding:0 6px;font-weight:600;white-space:nowrap;">${esc(WA_TOKEN_LABELS[token])}</span>`;
}

/** Converte o conteúdo do editor de volta para um modelo com tokens {produto}/{preco}. */
function serialize(el: HTMLElement): string {
  let out = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      if (node.dataset.token) out += `{${node.dataset.token}}`;
      else if (node.tagName === "BR") out += "\n";
      else out += node.textContent ?? "";
    }
  });
  return out;
}

/** Constrói o HTML interno do editor a partir de um modelo (texto + chips). */
function templateToHtml(template: string, brand: string): string {
  const parts = template.split(/(\{produto\}|\{preco\})/g);
  return parts
    .map((part) => {
      if (part === "{produto}") return chip("produto", brand);
      if (part === "{preco}") return chip("preco", brand);
      return esc(part);
    })
    .join("");
}

export function openWhatsappForm(opts: WhatsappFormOptions): void {
  const brand = opts.brand || "#DC2626";
  const initialTemplate = ensureTokens(opts.template?.trim() ? opts.template : WA_DEFAULT_TEMPLATE);

  const host = document.createElement("div");
  host.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 animate-entrance";
  host.innerHTML = `
    <div class="bg-surface w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
        <h3 class="text-headline-md font-bold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined">chat</span> Botão de WhatsApp</h3>
        <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="p-6 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-label-sm text-on-surface-variant">Número de WhatsApp (com código do país)</label>
          <input data-phone type="tel" value="${esc(opts.phone)}" placeholder="+244 9XX XXX XXX" class="bg-surface border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-label-sm text-on-surface-variant">Mensagem</label>
          <div data-msg contenteditable="true" spellcheck="false" class="min-h-[96px] bg-surface border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary leading-relaxed whitespace-pre-wrap"></div>
          <p class="text-label-sm text-on-surface-variant mt-1">Os campos <strong>nome do produto</strong> e <strong>preço</strong> são obrigatórios e não podem ser apagados.</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-6 pb-6">
        <button type="button" data-close class="px-4 py-2 rounded-full text-on-surface-variant hover:bg-surface-container-high text-label-md">Cancelar</button>
        <button type="button" data-save class="px-6 py-2 rounded-full bg-primary text-on-primary font-bold text-label-md flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">check</span> Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(host);

  const close = () => host.remove();
  host.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  host.addEventListener("click", (e) => { if (e.target === host) close(); });

  const msgEl = host.querySelector<HTMLElement>("[data-msg]")!;
  msgEl.innerHTML = templateToHtml(initialTemplate, brand);

  // Garante que os tokens obrigatórios existem; repõe os que forem removidos.
  function ensureChips(): void {
    WA_TOKENS.forEach((tok) => {
      if (!msgEl.querySelector(`[data-token="${tok}"]`)) {
        msgEl.appendChild(document.createTextNode(" "));
        const tmp = document.createElement("div");
        tmp.innerHTML = chip(tok, brand);
        if (tmp.firstChild) msgEl.appendChild(tmp.firstChild);
      }
    });
  }
  msgEl.addEventListener("input", ensureChips);

  host.querySelector("[data-save]")!.addEventListener("click", async () => {
    ensureChips();
    const phone = host.querySelector<HTMLInputElement>("[data-phone]")!.value.trim();
    const template = ensureTokens(serialize(msgEl).replace(/\u00a0/g, " ").trim());
    await opts.onSave(phone, template);
    close();
  });
}
