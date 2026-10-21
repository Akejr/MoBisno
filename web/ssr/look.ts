/**
 * O «aspeto» que as vistas aplicam a `#app` depois de desenhar — calculado no
 * servidor, para o primeiro ecrã já sair com ele.
 *
 * Depois de `render()`, as vistas da loja escrevem em `#app` as cores de marca
 * (`--brand`, `--brand-ink`) e chamam `applyInk`, `applyTheme`,
 * `applyFieldColors` e `applyIconColor`. Sem isto no HTML servido, a página
 * aparecia com a letra, os cantos e as cores por omissão e mudava quando a SPA
 * arrancava — exatamente o salto que a pré-renderização existe para evitar.
 *
 * ## Sem espelhos
 *
 * As três primeiras funções correm **tal como estão**, contra um `#app` e um
 * `document` mínimos que só registam o que lhes é pedido: atributos,
 * propriedades CSS e as folhas de estilo que injetam no `<head>` (com o mesmo
 * `id`). O servidor escreve exatamente isso. Quando a SPA volta a chamar as
 * mesmas funções sobre o DOM verdadeiro, encontra as folhas pelo `id` (não as
 * repete) e escreve os mesmos valores — nada muda no ecrã.
 *
 * As cores por campo pintam elementos um a um (precisam de DOM); no servidor
 * vão pela folha equivalente que o próprio módulo publica (`fieldColorCss`),
 * marcada «só primeiro ecrã»: `render()` retira-a e a SPA pinta por cima, na
 * mesma tarefa, sem piscar.
 */
import { applyInk } from "../lib/ink.js";
import { applyTheme } from "../lib/theme.js";
import { applyIconColor } from "../lib/iconColor.js";
import { fieldColorCss } from "../lib/fieldColors.js";
import { storeBrand } from "../views/storeHtml.js";
import type { StoreRenderView, StoreCustomization } from "../templates/types.js";

/** Folha de estilo para o `<head>`. */
export interface LookStyle {
  /** `id` da SPA (a SPA não a repete). Ausente nas folhas só do primeiro ecrã. */
  id?: string;
  css: string;
  /** Só para o primeiro ecrã: `render()` retira-a (`data-mb-ssr-only`). */
  ssrOnly: boolean;
}

/** O que o servidor escreve em `#app` e no `<head>`. */
export interface StoreLook {
  /** Propriedades CSS do `style` de `#app`, pela ordem em que a SPA as escreve. */
  vars: [string, string][];
  /** Atributos de `#app` (`data-ink`, `data-theme`, `data-icons`). */
  attrs: [string, string][];
  styles: LookStyle[];
  /** Há cor de texto ou de ícones: os botões com ícone e texto têm de ser marcados. */
  markIconTextButtons: boolean;
}

/** Define `globalThis[name]` só durante `fn` (síncrona) e repõe o que lá estava. */
export function withGlobal<T>(name: string, value: unknown, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const before = Object.getOwnPropertyDescriptor(g, name);
  Object.defineProperty(g, name, { value, configurable: true, writable: true, enumerable: false });
  try {
    return fn();
  } finally {
    if (before) Object.defineProperty(g, name, before);
    else delete g[name];
  }
}

/**
 * Valor que pode ir para dentro de `style="…"` sem fechar a declaração nem o
 * atributo. A cor vem do JSON da personalização, que é editável à mão; um valor
 * com `;` ou `"` acrescentaria declarações à página. Fora disso a propriedade
 * não é escrita no servidor — a SPA aplica-a (ou recusa-a) à sua maneira.
 */
function safeCssValue(v: string): boolean {
  return v.length < 200 && !/[;{}<>"\\\n\r]/.test(v);
}

/** CSS que pode ir para dentro de `<style>` sem o fechar. */
export function safeStyleText(css: string): string {
  return css.replace(/</g, "\\3c ");
}

/**
 * Corre `applyInk`, `applyTheme` e `applyIconColor` contra um `#app` e um
 * `document` de registo, e devolve o que fizeram.
 */
export function storeLook(view: StoreRenderView, custom: StoreCustomization): StoreLook {
  const attrs = new Map<string, string>();
  const vars = new Map<string, string>();
  const styles: LookStyle[] = [];

  const { brand, ink } = storeBrand(view, custom);
  vars.set("--brand", brand);
  vars.set("--brand-ink", ink);

  const root = {
    setAttribute: (k: string, v: string): void => { attrs.set(k, String(v)); },
    removeAttribute: (k: string): void => { attrs.delete(k); },
    style: {
      setProperty: (k: string, v: string): void => { vars.set(k, String(v)); },
      removeProperty: (k: string): void => { vars.delete(k); },
    },
    // A travessia dos botões (`markIconTextButtons`) corre sobre um `#app` sem
    // filhos: a marca é feita no texto do HTML (`web/ssr/iconText.ts`).
    matches: (): boolean => false,
    querySelectorAll: (): unknown[] => [],
  };
  const fakeDocument = {
    getElementById: (id: string): unknown => styles.find((s) => s.id === id) ?? null,
    createElement: (): { id: string; textContent: string } => ({ id: "", textContent: "" }),
    head: {
      appendChild: (el: { id: string; textContent: string }): void => {
        styles.push({ id: el.id || undefined, css: el.textContent, ssrOnly: false });
      },
    },
  };

  withGlobal("document", fakeDocument, () => {
    const app = root as unknown as HTMLElement;
    applyInk(app, custom);
    applyTheme(app, custom);
    applyIconColor(app, custom);
  });

  const map = custom.fieldColors;
  if (map && typeof map === "object" && Object.values(map).some((c) => !!c)) {
    styles.push({ css: fieldColorCss(map), ssrOnly: true });
  }

  return {
    vars: [...vars].filter(([, v]) => safeCssValue(v)),
    attrs: [...attrs],
    styles,
    markIconTextButtons: attrs.has("data-ink") || attrs.has("data-icons"),
  };
}

/** Escapa um valor para dentro de um atributo HTML. */
function attrEsc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Atributos a acrescentar ao `<div id="app">` (com espaço à frente). */
export function lookAppAttrs(look: StoreLook): string {
  const style = look.vars.map(([k, v]) => `${k}:${v}`).join(";");
  const attrs = look.attrs
    .filter(([k]) => /^data-[a-z0-9-]+$/.test(k))
    .map(([k, v]) => ` ${k}="${attrEsc(v)}"`).join("");
  return `${style ? ` style="${attrEsc(style)}"` : ""}${attrs}`;
}

/** Folhas de estilo para o `<head>`. */
export function lookHeadHtml(styles: readonly LookStyle[]): string {
  return styles.map((s) => {
    const id = s.id && /^[a-z0-9-]+$/i.test(s.id) ? ` id="${s.id}"` : "";
    const only = s.ssrOnly ? " data-mb-ssr-only" : "";
    return `<style${id}${only}>${safeStyleText(s.css)}</style>`;
  }).join("");
}

/**
 * Folha «só primeiro ecrã» que esconde os cartões de fora da categoria aberta —
 * o que `mountCategoryFilter` (`web/views/category.ts`) faz à entrada, com o
 * mesmo critério: só há filtro quando a barra existe, e «todos os produtos» não
 * esconde nada.
 */
export function categoryHideStyle(label: string): LookStyle {
  const value = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
  return { css: `#app [data-product-category]:not([data-product-category="${value}"]){display:none}`, ssrOnly: true };
}
