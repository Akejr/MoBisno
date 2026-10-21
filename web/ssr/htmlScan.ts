/**
 * Leitor mínimo de HTML, sem DOM — para fazer **no texto** o que as vistas da
 * SPA fazem ao DOM depois de o desenhar.
 *
 * Porque existe: o servidor não tem DOM, e há passos pós-desenho cujo resultado
 * aparece no primeiro ecrã (a marca dos botões com ícone e texto, o seletor de
 * ordenação da listagem, os botões de um produto esgotado). Para o HTML servido
 * já sair igual ao resultado final, esses passos são feitos sobre a cadeia — e,
 * quando também correm no navegador, pela mesma função.
 *
 * Âmbito, de propósito estreito: lê o HTML **bem formado** que os modelos
 * produzem. Respeita comentários, aspas nos atributos, elementos vazios
 * (`<img>`, `<input>`…), `/>` e o conteúdo cru de `<style>`/`<script>`/
 * `<textarea>`/`<title>`. Não reproduz as correções do analisador do navegador
 * para HTML malformado (fecho implícito de `<p>`, `<a>` dentro de `<a>`…).
 */

/** Posição de um atributo na cadeia. */
export interface AttrSpan {
  /** Início do nome do atributo. */
  readonly start: number;
  /** Fim do atributo (logo a seguir ao valor, ou ao nome se não tiver valor). */
  readonly end: number;
  /** Início e fim do valor, sem as aspas (iguais quando não há valor). */
  readonly valueStart: number;
  readonly valueEnd: number;
}

/** Um elemento aberto, tal como foi lido. */
export interface ScanElement {
  /** Nome da etiqueta, em minúsculas. */
  readonly name: string;
  /** Atributos (nomes em minúsculas; valores como estão no texto, por descodificar). */
  readonly attrs: ReadonlyMap<string, string>;
  /** Onde está cada atributo, para o poder substituir. */
  readonly attrSpans: ReadonlyMap<string, AttrSpan>;
  /** Índice do `<` da etiqueta de abertura. */
  readonly start: number;
  /** Índice do `>` (ou do `/` de `/>`) — onde se pode acrescentar um atributo. */
  readonly insertAt: number;
  /** Índice logo a seguir ao `>` da etiqueta de abertura (início do conteúdo). */
  readonly openEnd: number;
}

/** O que fazer em cada nó lido. Todos são opcionais. */
export interface ScanHandlers {
  /** Etiqueta de abertura. `stack` são os ascendentes (o mais interior no fim). */
  onOpen?(el: ScanElement, stack: readonly ScanElement[]): void;
  /** Nó de texto. `stack` são os ascendentes (o mais interior no fim). */
  onText?(text: string, stack: readonly ScanElement[]): void;
  /**
   * Fecho do elemento. `closeStart` é o índice do `</` da etiqueta de fecho
   * (fim do conteúdo); num elemento vazio é `openEnd`, e num fecho implícito é
   * a posição onde o fecho aconteceu.
   */
  onClose?(el: ScanElement, closeStart: number): void;
}

/** Elementos sem conteúdo nem etiqueta de fecho. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Elementos cujo conteúdo é texto cru até à etiqueta de fecho. */
const RAW = new Set(["script", "style", "textarea", "title"]);

const isNameChar = (c: string): boolean => /[A-Za-z0-9:_-]/.test(c);
const isSpace = (c: string): boolean => c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";

/** Lê a etiqueta de abertura que começa em `i` (`<` seguido de letra). */
function readStartTag(html: string, i: number): { el: ScanElement; selfClosing: boolean; next: number } | null {
  let j = i + 1;
  while (j < html.length && isNameChar(html[j]!)) j += 1;
  const name = html.slice(i + 1, j).toLowerCase();
  const attrs = new Map<string, string>();
  const attrSpans = new Map<string, AttrSpan>();
  for (;;) {
    while (j < html.length && isSpace(html[j]!)) j += 1;
    if (j >= html.length) return null;
    const c = html[j]!;
    if (c === ">") {
      return { el: { name, attrs, attrSpans, start: i, insertAt: j, openEnd: j + 1 }, selfClosing: false, next: j + 1 };
    }
    if (c === "/" && html[j + 1] === ">") {
      return { el: { name, attrs, attrSpans, start: i, insertAt: j, openEnd: j + 2 }, selfClosing: true, next: j + 2 };
    }
    if (c === "/") { j += 1; continue; }

    const nameStart = j;
    while (j < html.length && !isSpace(html[j]!) && html[j] !== "=" && html[j] !== ">" && !(html[j] === "/" && html[j + 1] === ">")) j += 1;
    const attrName = html.slice(nameStart, j).toLowerCase();
    let end = j;
    let valueStart = j;
    let valueEnd = j;
    let k = j;
    while (k < html.length && isSpace(html[k]!)) k += 1;
    if (html[k] === "=") {
      k += 1;
      while (k < html.length && isSpace(html[k]!)) k += 1;
      const q = html[k];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, k + 1);
        if (close === -1) return null;
        valueStart = k + 1;
        valueEnd = close;
        end = close + 1;
      } else {
        valueStart = k;
        while (k < html.length && !isSpace(html[k]!) && html[k] !== ">") k += 1;
        valueEnd = k;
        end = k;
      }
      j = end;
    }
    if (attrName && !attrs.has(attrName)) {
      attrs.set(attrName, html.slice(valueStart, valueEnd));
      attrSpans.set(attrName, { start: nameStart, end, valueStart, valueEnd });
    }
    if (j === nameStart) j += 1; // nunca ficar parado no mesmo carácter
  }
}

/**
 * Percorre `html` uma vez, do princípio ao fim, chamando os `handlers`.
 *
 * Total: nunca lança. Texto que não se deixa ler como etiqueta (um `<` solto)
 * é tratado como texto, como faz o navegador.
 */
export function scanHtml(html: string, handlers: ScanHandlers): void {
  const stack: ScanElement[] = [];
  const text = (t: string): void => { if (t && handlers.onText) handlers.onText(t, stack); };
  const close = (el: ScanElement, at: number): void => { handlers.onClose?.(el, at); };
  /** Cópia em minúsculas, para procurar o fecho dos elementos crus. Feita uma vez. */
  let lower: string | null = null;

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { text(html.slice(i)); break; }
    if (lt > i) text(html.slice(i, lt));
    i = lt;

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html[i + 1] === "/") {
      const m = /^<\/([A-Za-z][A-Za-z0-9:_-]*)[^>]*>/.exec(html.slice(i, i + 200));
      if (!m) { text("<"); i += 1; continue; }
      const name = m[1]!.toLowerCase();
      // Fecha até ao elemento com o mesmo nome; sem par aberto, a etiqueta é ignorada.
      let k = stack.length - 1;
      while (k >= 0 && stack[k]!.name !== name) k -= 1;
      if (k >= 0) {
        while (stack.length > k) close(stack.pop()!, i);
      }
      i += m[0].length;
      continue;
    }
    if (!/[A-Za-z]/.test(html[i + 1] ?? "")) { text("<"); i += 1; continue; }

    const tag = readStartTag(html, i);
    if (!tag) { text(html.slice(i)); break; }
    handlers.onOpen?.(tag.el, stack);
    i = tag.next;
    if (VOID.has(tag.el.name) || tag.selfClosing) { close(tag.el, tag.el.openEnd); continue; }
    stack.push(tag.el);

    if (RAW.has(tag.el.name)) {
      lower ??= html.toLowerCase();
      const end = lower.indexOf(`</${tag.el.name}`, i);
      const stop = end === -1 ? html.length : end;
      text(html.slice(i, stop));
      i = stop;
    }
  }
  while (stack.length) close(stack.pop()!, html.length);
}

/** As classes de um elemento, separadas. */
export function classesOf(el: ScanElement): string[] {
  return (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
}

/** Uma edição do texto: substitui `[from, to)` por `text` (inserção quando `from === to`). */
export interface HtmlEdit {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

/**
 * Aplica várias edições de uma vez. As posições referem-se à cadeia original;
 * são aplicadas do fim para o princípio para não se deslocarem umas às outras.
 * Edições sobrepostas não são suportadas (quem as gera não as produz).
 */
export function applyEdits(html: string, edits: readonly HtmlEdit[]): string {
  if (!edits.length) return html;
  const sorted = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);
  let out = html;
  for (const e of sorted) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}
