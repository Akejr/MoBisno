/**
 * Garantias/benefícios da página de produto (ícone + texto). Lista editável e
 * partilhada pelos modelos. Hooks `data-edit-perks` / `data-edit-perk-item` /
 * `data-perk-text` usados pelo editor.
 */
import { esc } from "../lib/dom.js";
import type { StoreCustomization } from "./types.js";

export const DEFAULT_PERKS: { icon: string; text: string }[] = [
  { icon: "local_shipping", text: "Entrega em toda Angola" },
  { icon: "verified", text: "Produto original garantido" },
  { icon: "payments", text: "Pagamento na entrega ou Multicaixa" },
];

/** Lista resolvida de garantias (customizadas ou as por omissão). */
export function perksList(custom?: StoreCustomization): { icon: string; text: string }[] {
  const list = (custom?.productPerks ?? []).filter((p) => (p?.text ?? "").trim() !== "");
  return (list.length ? list : DEFAULT_PERKS).map((p) => ({ icon: p.icon || "check_circle", text: p.text || "" }));
}

/** Itens `<li>` da lista de garantias (a embrulhar num `<ul data-edit-perks>`). */
export function perksItemsHtml(custom: StoreCustomization | undefined, brandVar: string): string {
  return perksList(custom)
    .map((p, i) =>
      `<li data-edit-perk-item="${i}" class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${brandVar}">${esc(p.icon)}</span> <span data-perk-text>${esc(p.text)}</span></li>`,
    )
    .join("");
}
