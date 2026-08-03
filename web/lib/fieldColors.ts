/**
 * Cores de texto por-campo. Permite ao dono pintar um texto específico
 * (ex.: só o título do hero) de uma cor diferente da cor global (ink).
 * Aplica-se pelo atributo `data-edit="<caminho>"` presente nos textos editáveis
 * dos modelos, tanto no editor como na loja publicada.
 *
 * Este módulo é o **único** sítio que decide quais os elementos que recebem a
 * cor de um campo (decisão D8: regra partilhada num só módulo). A loja publicada
 * usa `applyFieldColors`; o editor usa `paintFieldColor` (resposta imediata ao
 * arrastar o seletor) e `fieldColorCss` (folha de estilo do preview). Assim os
 * três sítios não podem divergir.
 *
 * Regra dos ícones: nos modelos, o ícone de um botão é **irmão** do rótulo
 * editável (`<a><span data-edit="hero.ctaLabel">Ver produtos</span><span
 * class="material-symbols-outlined">arrow_forward</span></a>`), por isso nunca
 * herdava a cor do campo. Quando o texto editável é o rótulo de um botão, os
 * ícones desse botão passam a receber a mesma cor.
 */
import type { StoreCustomization } from "../templates/types.js";

/**
 * Ascendentes tratados como «botão». `a`, `button` e `[role="button"]` cobrem
 * hoje todos os casos dos modelos (nenhum marcador de CTA vive num `div`), mas
 * os marcadores próprios ficam listados para o comportamento não se perder se
 * algum deles passar a assentar noutro elemento: `data-hero-cta` (heroes,
 * lumiere), `data-add-cart` e `data-edit-whatsapp` (páginas de produto) e os
 * CTAs do foodmart (`data-fm-banner-cta`, `data-fm-ad-cta`, `data-fm-promo-cta`).
 */
export const BUTTON_ANCESTORS: readonly string[] = [
  "a",
  "button",
  '[role="button"]',
  "[data-hero-cta]",
  "[data-add-cart]",
  "[data-edit-whatsapp]",
  "[data-fm-banner-cta]",
  "[data-fm-ad-cta]",
  "[data-fm-promo-cta]",
];

/** Seletor único dos ascendentes «botão». */
export const BUTTON_ANCESTOR_SELECTOR = BUTTON_ANCESTORS.join(",");

/** Seletor dos ícones dos modelos (Material Symbols). */
export const ICON_SELECTOR = ".material-symbols-outlined";

/** Seletor dos elementos editáveis de um caminho de campo. */
export function fieldSelector(path: string): string {
  return `[data-edit="${CSS.escape(path)}"]`;
}

/**
 * Diz se o ícone pertence a **outro** campo com cor própria: nesse caso é esse
 * campo que manda, e não o rótulo do botão. Sobe do ícone até ao botão
 * (inclusive) à procura do primeiro `data-edit`.
 */
function iconOwnedByOtherField(
  icon: HTMLElement,
  button: HTMLElement,
  path: string,
  map: Record<string, string> | undefined,
): boolean {
  const stop = button.parentElement;
  let node: HTMLElement | null = icon;
  while (node && node !== stop) {
    const owner = node.getAttribute("data-edit");
    if (owner) return owner !== path && (!map || !!map[owner]);
    node = node.parentElement;
  }
  return false;
}

/**
 * Elementos que recebem a cor do campo `path` dentro de `root`: o texto editável
 * e, quando esse texto é o rótulo de um botão, os ícones desse botão. `map`
 * (as cores por-campo em vigor) serve para não roubar um ícone que já pertença a
 * outro campo com cor própria; sem `map`, a regra é conservadora e o ícone de
 * outro `data-edit` fica sempre de fora.
 */
export function fieldColorTargets(
  root: HTMLElement | null,
  path: string,
  map?: Record<string, string> | undefined,
): HTMLElement[] {
  if (!root) return [];
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>(fieldSelector(path)).forEach((label) => {
    if (!out.includes(label)) out.push(label);
    const button = label.closest<HTMLElement>(BUTTON_ANCESTOR_SELECTOR);
    if (!button) return; // Ex.: `hero.title` num `<h1>` — não pinta ícone nenhum.
    button.querySelectorAll<HTMLElement>(ICON_SELECTOR).forEach((icon) => {
      if (iconOwnedByOtherField(icon, button, path, map)) return;
      if (!out.includes(icon)) out.push(icon);
    });
  });
  return out;
}

/**
 * Pinta (ou limpa, com `color = null`) a cor do campo `path` em `root`.
 * Usa `!important` **inline** porque a cor global de ícones
 * (`web/lib/iconColor.ts`) já é `!important` numa folha de estilo: inline vence
 * folha de estilo com a mesma força, logo a intenção mais específica (este
 * botão) ganha à mais geral (todos os ícones). Limpar remove a propriedade
 * inline em vez de escrever uma cor de substituição, para o ícone voltar à cor
 * global de ícones (ou à herdada, incluindo as zonas `.mb-dark`).
 */
export function paintFieldColor(
  root: HTMLElement | null,
  path: string,
  color: string | null,
  map?: Record<string, string> | undefined,
): void {
  for (const el of fieldColorTargets(root, path, map)) {
    if (color) el.style.setProperty("color", color, "important");
    else el.style.removeProperty("color");
  }
}

/** Aplica as cores por-campo definidas em `custom.fieldColors` ao contentor. */
export function applyFieldColors(root: HTMLElement | null, custom: StoreCustomization | undefined): void {
  if (!root) return;
  const map = custom?.fieldColors;
  if (!map) return;
  for (const [path, color] of Object.entries(map)) {
    if (!color) continue;
    paintFieldColor(root, path, color, map);
  }
}

/**
 * Folha de estilo equivalente, para contextos sem JavaScript de pintura (o
 * preview em iframe do editor) e como reforço depois de reconstruções do
 * preview. É só reforço: o resultado é garantido pela pintura em JavaScript,
 * porque a regra dos ícones depende de `:has()`. `:not([data-edit] *)` evita
 * roubar o ícone de outro campo — o ícone do próprio campo é coberto pela regra
 * anterior.
 */
export function fieldColorCss(map: Record<string, string> | undefined): string {
  return Object.entries(map ?? {})
    .filter(([, c]) => !!c)
    .map(([p, c]) => {
      const f = `[data-edit="${p}"]`;
      return (
        `${f}{color:${c} !important}` +
        `${f} ${ICON_SELECTOR}{color:${c} !important}` +
        `:is(${BUTTON_ANCESTOR_SELECTOR}):has(${f}) ${ICON_SELECTOR}:not([data-edit] *){color:${c} !important}`
      );
    })
    .join("");
}
