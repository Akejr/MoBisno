/**
 * A marca `data-mb-icon-text` dos botões com ícone **e** texto, feita no texto
 * do HTML — a versão de servidor de `markIconTextButtons` (`web/lib/iconColor.ts`).
 *
 * Porque é precisa no servidor: com uma cor de texto (`colors.text`) ou de
 * ícones (`colors.icon`) definida — o caso dos modelos Lumière e Tech
 * Essentials, que já a trazem —, as regras `[data-ink]`/`[data-icons]` pintam os
 * ícones, e só a marca faz o ícone de um botão de marca voltar a herdar a cor do
 * botão. Sem ela no HTML servido, o primeiro ecrã mostrava o ícone de «Adicionar
 * ao carrinho» com a cor do texto (preto sobre botão preto, no Lumière) e só
 * depois de a SPA arrancar ficava branco.
 *
 * Mesma decisão que a travessia do navegador, sobre o mesmo critério: os
 * seletores de «botão» (`BUTTON_ANCESTORS`) e de ícone (`ICON_SELECTOR`) são
 * importados de `web/lib/fieldColors.ts`, não copiados. Um ícone não é descido,
 * o emblema do carrinho (`[data-cart-count]`) não conta como rótulo, e um texto
 * só de espaços não é texto. Onde o HTML for malformado e o navegador o ler de
 * outra maneira, a SPA volta a marcar sobre o DOM verdadeiro e corrige.
 */
import { BUTTON_ANCESTORS, ICON_SELECTOR } from "../lib/fieldColors.js";
import { ICON_TEXT_ATTR } from "../lib/iconColor.js";
import { scanHtml, classesOf, applyEdits, type ScanElement, type HtmlEdit } from "./htmlScan.js";

/**
 * Conteúdo que não é rótulo do botão. Espelha `NON_LABEL_SELECTOR` de
 * `web/lib/iconColor.ts`, que não é exportado — se lá mudar, mudar aqui.
 */
const NON_LABEL_ATTR = "data-cart-count";

/** Classe dos ícones, sem o ponto. */
const ICON_CLASS = ICON_SELECTOR.replace(/^\./, "");

/** Um seletor simples de `BUTTON_ANCESTORS`, convertido num teste sobre o elemento. */
type Matcher = (el: ScanElement) => boolean;

/**
 * Converte os seletores de `BUTTON_ANCESTORS`. Só há três formas — etiqueta,
 * `[atributo]` e `[atributo="valor"]` — e uma forma nova faz lançar, para a
 * divergência ser vista em vez de a marca deixar de sair em silêncio.
 */
function matcherOf(selector: string): Matcher {
  const s = selector.trim();
  if (/^[a-z][a-z0-9-]*$/i.test(s)) {
    const name = s.toLowerCase();
    return (el) => el.name === name;
  }
  const presence = /^\[([a-z0-9_:-]+)\]$/i.exec(s);
  if (presence) {
    const attr = presence[1]!.toLowerCase();
    return (el) => el.attrs.has(attr);
  }
  const equals = /^\[([a-z0-9_:-]+)="([^"]*)"\]$/i.exec(s);
  if (equals) {
    const attr = equals[1]!.toLowerCase();
    const value = equals[2]!;
    return (el) => el.attrs.get(attr) === value;
  }
  throw new Error(`iconText: seletor de botão não suportado: ${selector}`);
}

let matchers: Matcher[] | null = null;
function isButton(el: ScanElement): boolean {
  matchers ??= BUTTON_ANCESTORS.map(matcherOf);
  return matchers.some((m) => m(el));
}

/** Texto com conteúdo depois de aparado (o `&nbsp;` conta como espaço, como no DOM). */
function hasLabelText(raw: string): boolean {
  return raw.replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, " ").trim() !== "";
}

/**
 * Devolve `html` com `data-mb-icon-text=""` em cada botão que tem ícone e texto
 * próprios. Total: nunca lança por causa do HTML; perante um seletor de botão
 * desconhecido devolve o HTML sem marcas (a SPA marca à mesma).
 */
export function markIconTextButtonsHtml(html: string): string {
  try {
    matchers ??= BUTTON_ANCESTORS.map(matcherOf);
  } catch {
    return html;
  }

  const flags = new Map<ScanElement, { icon: boolean; text: boolean }>();
  const blockers = new Set<ScanElement>();
  const edits: HtmlEdit[] = [];

  /**
   * Sobe dos ascendentes mais interiores para os exteriores. Um ícone ou um
   * emblema do carrinho pelo meio impede o que está lá dentro de contar para os
   * de fora — é o «não descer» da travessia do navegador.
   */
  const propagate = (stack: readonly ScanElement[], kind: "icon" | "text"): void => {
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      const el = stack[k]!;
      const f = flags.get(el);
      if (f) f[kind] = true;
      if (blockers.has(el)) return;
    }
  };

  scanHtml(html, {
    onOpen(el, stack) {
      const icon = classesOf(el).includes(ICON_CLASS);
      if (icon) propagate(stack, "icon");
      if (icon || el.attrs.has(NON_LABEL_ATTR)) blockers.add(el);
      if (isButton(el)) flags.set(el, { icon: false, text: false });
    },
    onText(text, stack) {
      if (hasLabelText(text)) propagate(stack, "text");
    },
    onClose(el) {
      const f = flags.get(el);
      if (f && f.icon && f.text && !el.attrs.has(ICON_TEXT_ATTR)) {
        edits.push({ from: el.insertAt, to: el.insertAt, text: ` ${ICON_TEXT_ATTR}=""` });
      }
    },
  });

  return applyEdits(html, edits);
}
