/**
 * Variantes de disposição da lista de produtos (Fase 3). Controla o formato dos
 * cartões (proporção) e o número de colunas. Partilhado por todos os modelos.
 */
export type ProductVariant = "retrato" | "quadrado" | "alto";

export const PRODUCT_VARIANTS: { id: ProductVariant; label: string }[] = [
  { id: "retrato", label: "Retrato (3:4)" },
  { id: "quadrado", label: "Quadrado" },
  { id: "alto", label: "Alto (4:5)" },
];

/** Classes da grelha (colunas) conforme a variante. */
export function gridColsClass(v?: ProductVariant): string {
  const cols = v === "alto" ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return `grid grid-cols-2 md:grid-cols-3 ${cols} gap-x-5 gap-y-10`;
}

/** Classe de proporção do cartão conforme a variante. */
export function cardAspectClass(v?: ProductVariant): string {
  if (v === "quadrado") return "aspect-square";
  if (v === "alto") return "aspect-[4/5]";
  return "aspect-[3/4]";
}

/** Mini pré-visualização esquemática da variante (para o seletor). */
export function productPreview(v: ProductVariant): string {
  const ar = v === "quadrado" ? "aspect-square" : v === "alto" ? "aspect-[4/5]" : "aspect-[3/4]";
  const n = v === "alto" ? 3 : 4;
  const cells = Array.from({ length: n }).map(() => `<div class="${ar} rounded bg-gray-300"></div>`).join("");
  return `<div class="w-full h-full bg-white p-2 grid grid-cols-${n} gap-1 items-start">${cells}</div>`;
}
