/**
 * Ajudas de formulário dos separadores do Dashboard do Dono (estas sim, com DOM).
 *
 * Os erros são escritos no sítio, sem redesenhar o formulário: redesenhar a cada
 * envio tirava o cursor de onde o Dono estava e apagava a escolha de ficheiros.
 */

/**
 * Mostra (ou limpa) o erro de um campo: o texto em `#<id>-err`, o
 * `aria-invalid` e o `aria-describedby` do campo — o leitor de ecrã lê o erro
 * quando o foco lá chega, e deixa de o ler quando é corrigido.
 */
export function setFieldError(id: string, message: string | null): void {
  const input = document.getElementById(id);
  const errId = `${id}-err`;
  const err = document.getElementById(errId);
  if (err) {
    err.textContent = message ?? "";
    err.classList.toggle("hidden", !message);
  }
  if (!input) return;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  const ids = new Set((input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  if (message) ids.add(errId);
  else ids.delete(errId);
  if (ids.size) input.setAttribute("aria-describedby", [...ids].join(" "));
  else input.removeAttribute("aria-describedby");
}

/** Valor de um campo pelo `id` (vazio se não existir). */
export function inputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return el?.value ?? "";
}

/**
 * Copia texto para a área de transferência.
 *
 * `navigator.clipboard` não existe em contexto não seguro nem em navegadores
 * antigos: devolve `false` em vez de falhar em silêncio, e quem chama mostra o
 * texto para copiar à mão.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Dia de hoje no fuso de quem usa o painel, no formato do `<input type="date">`. */
export function todayLocalIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Quem pediu menos movimento no sistema. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
