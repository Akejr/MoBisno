/**
 * Documento HTML completo com a pré-visualização de uma loja, para `iframe`.
 *
 * Estava privado em `web/views/presetGallery.ts` (`buildStoreDoc`) e saiu para
 * aqui quando o diretório de lojas passou a precisar do mesmo: mostrar a loja
 * **como ela é**, e não uma foto de banner.
 *
 * ## Porque é que tem de ser um `iframe`
 *
 * Duas razões, e as duas doem se forem ignoradas:
 *
 *  1. **Estilos.** O HTML de um modelo traz blocos `<style>` próprios (lumiere,
 *     tech essentials, heroes, gallery, menu mobile). Injetado diretamente na
 *     página, o CSS de cada loja escapa e passa a competir com o da página e com
 *     o das outras lojas. Numa grelha com várias, o resultado é imprevisível.
 *  2. **Pontos de quebra.** Dentro de um `iframe` as medias queries respondem à
 *     largura **dele**, não à da janela. É isso que permite pedir um desenho de
 *     computador (1280px) e encolhê-lo, em vez de apanhar o desenho de telemóvel
 *     esticado.
 *
 * ## Porque é que o `iframe` não corre scripts
 *
 * Um `iframe` com `srcdoc` tem a **origem da página que o cria** — a da
 * plataforma, com a sessão do Supabase no `localStorage`. E o que lá dentro se
 * desenha é conteúdo do Dono: o diretório `/lojas` mostra as lojas de toda a
 * gente, o Administrador abre o editor das lojas dos outros. Um `<script>` ou um
 * `onerror` que lá chegasse corria com a sessão de quem está a ver. Por isso
 * todas as pré-visualizações levam `sandbox` **sem `allow-scripts`**
 * (`loadPreviewDoc`), e `allow-scripts` nunca se junta a `allow-same-origin` —
 * juntos, o documento podia simplesmente tirar a si próprio o `sandbox`.
 *
 * Sem scripts, nada pode depender deles lá dentro: os estilos são a folha
 * **compilada** desta página (`pageStylesHtml`), não o Tailwind de CDN que se
 * gerava a si próprio em JavaScript; e os mapas embutidos, que precisam de
 * JavaScript e herdariam o `sandbox`, dão lugar a um marcador estático
 * (`inertEmbedsHtml`).
 */
import { esc } from "./dom.js";
import { readableInk } from "./brand.js";
import { safeCssColor } from "../../src/services/storeCustom.js";
import type { StoreCustomization } from "../templates/types.js";

/** Laranja da plataforma, quando a loja não define cor de marca. */
const FALLBACK_BRAND = "#F95901";

/**
 * `sandbox` de uma pré-visualização: todas as restrições, sem exceção. Origem
 * opaca, sem scripts, sem formulários, sem janelas novas e sem navegar a página
 * de cima. Uma ligação clicada lá dentro não leva a lado nenhum — o documento
 * traz `<base target="_blank">` e as janelas novas estão bloqueadas —, que é o
 * que se quer de uma pré-visualização.
 */
export const PREVIEW_SANDBOX = "";

/**
 * Para a pré-visualização **navegável** de um modelo (`templatePreview.ts`), em
 * que é a página de cima que intercepta os cliques e troca o documento. Precisa
 * de ler o DOM do `iframe`, logo de `allow-same-origin` — e continua **sem**
 * `allow-scripts`: nada do que está lá dentro corre.
 */
export const PREVIEW_SANDBOX_SAME_ORIGIN = "allow-same-origin";

/**
 * Carrega um documento numa pré-visualização, já com o `sandbox`.
 *
 * É a única porta por onde o `web/` escreve `srcdoc` (há teste que o garante).
 * O `sandbox` é posto **antes** do `srcdoc`: as restrições só valem a partir da
 * navegação seguinte, e é o `srcdoc` que a dispara.
 */
export function loadPreviewDoc(frame: HTMLIFrameElement, doc: string, opts: { sameOrigin?: boolean } = {}): void {
  frame.setAttribute("sandbox", opts.sameOrigin ? PREVIEW_SANDBOX_SAME_ORIGIN : PREVIEW_SANDBOX);
  frame.srcdoc = doc;
}

/**
 * As folhas de estilo desta página, prontas a entrar no `<head>` de uma
 * pré-visualização.
 *
 * - `<link rel="stylesheet">`: reescritas só com o `href` absoluto. Sai o
 *   `crossorigin` (numa origem opaca o pedido CORS falharia; sem ele a folha
 *   carrega na mesma), sai o `media="print"` + `onload` com que as fontes são
 *   carregadas sem bloquear (o `onload` não corre lá dentro e a folha ficaria
 *   para sempre só de impressão).
 * - `<style>` do `<head>`: o Tailwind compilado em desenvolvimento (o Vite
 *   injeta-o assim) e as folhas que os módulos de `web/lib` lá põem (tinta,
 *   ícones, tema). Os do `<body>` ficam de fora — são da página, não da loja.
 * - `<link rel="preconnect">`.
 */
export function pageStylesHtml(doc: Document = document): string {
  const out: string[] = [];
  doc.head.querySelectorAll('link[rel="preconnect"], link[rel="stylesheet"], style').forEach((el) => {
    if (el instanceof HTMLLinkElement) {
      if (!el.href) return;
      const rel = el.rel === "preconnect" ? "preconnect" : "stylesheet";
      out.push(`<link rel="${rel}" href="${esc(el.href)}">`);
      return;
    }
    // Um `</style` dentro do texto fecharia o bloco antes do tempo; `\/` em CSS
    // é a mesma barra.
    out.push(`<style>${(el.textContent ?? "").replace(/<\/style/gi, "<\\/style")}</style>`);
  });
  return out.join("\n");
}

/** Cabeça comum a todas as pré-visualizações: codificação, viewport, alvo das ligações e estilos. */
export function previewHeadHtml(): string {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<base target="_blank">${pageStylesHtml()}`;
}

/**
 * Troca os `iframe` embutidos no HTML de um modelo (os mapas) por um marcador
 * estático do mesmo tamanho.
 *
 * Um `iframe` dentro de uma pré-visualização herda o `sandbox` dela, e os mapas
 * da Google e do OpenStreetMap não desenham nada sem JavaScript: ficava um
 * retângulo em branco, que parece avaria. O marcador mantém a `class` e o
 * `style` do mapa (largura, altura, cantos) e diz o que ali vai aparecer.
 *
 * Corre num documento inerte (`createHTMLDocument`), como
 * `markIconTextButtonsInHtml`: nada é pedido à rede e nada corre.
 */
export function inertEmbedsHtml(html: string): string {
  if (!/<iframe\b/i.test(html)) return html;
  const inert = document.implementation.createHTMLDocument("");
  inert.body.innerHTML = html;
  inert.body.querySelectorAll("iframe").forEach((frame) => {
    const box = inert.createElement("div");
    const cls = frame.getAttribute("class");
    if (cls) box.setAttribute("class", cls);
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", frame.getAttribute("title") || "Mapa");
    box.setAttribute("style", `${frame.getAttribute("style") ?? ""};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#eceef1;color:#6b7280;font:500 13px/1.3 Inter,sans-serif;text-align:center`);
    const icon = inert.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("style", "font-size:40px;color:#9ca3af");
    icon.textContent = "map";
    const note = inert.createElement("span");
    note.textContent = "O mapa aparece na loja publicada";
    box.append(icon, note);
    frame.replaceWith(box);
  });
  return inert.body.innerHTML;
}

/**
 * Variáveis de tema por estilo. Espelha `web/lib/theme.ts` — se lá mudarem,
 * mudar aqui. (Vinha assim de `presetGallery.ts`; o `editorial` não estava na
 * tabela original e continua a herdar o comportamento por omissão.)
 */
const THEME_VARS: Record<string, { radius: string; head: string }> = {
  moderno: { radius: "1rem", head: "Inter, sans-serif" },
  classico: { radius: "0.35rem", head: "'Noto Serif', serif" },
  minimal: { radius: "0px", head: "Inter, sans-serif" },
};

/** Estilos de tema que existem; qualquer outro valor gravado é ignorado. */
const THEME_IDS: readonly string[] = ["moderno", "classico", "minimal", "editorial"];

/**
 * Constrói o documento da pré-visualização.
 *
 * As cores da Personalização entram em CSS e passam por `safeCssColor`; o tema
 * só entra se for um dos que existem. Uma «cor» como `red;}</style><script>`
 * fica pela cor por omissão.
 *
 * @param html HTML do modelo já renderizado (`getTemplate(id).render(view, custom)`).
 * @param custom Personalização da loja, para a cor de marca, a tinta e o tema.
 * @param emptyHtml O que mostrar quando `html` vem vazio.
 */
export function storePreviewDoc(
  html: string,
  custom: StoreCustomization,
  emptyHtml = `<div style="padding:3rem;text-align:center;color:#9ca3af;font-family:sans-serif">Esta loja ainda não tem conteúdo.</div>`,
): string {
  const primary = safeCssColor(custom.colors?.primary, FALLBACK_BRAND);
  const ink = safeCssColor(custom.colors?.text, "");
  const rawStyle = custom.theme?.style;
  const style = typeof rawStyle === "string" && THEME_IDS.includes(rawStyle) ? rawStyle : undefined;
  const tv = style ? THEME_VARS[style] : undefined;
  const vars = `--brand:${primary};--brand-ink:${readableInk(primary)};`
    + (ink ? `--ink:${ink};` : "")
    + (tv ? `--mb-radius:${tv.radius};--mb-head-font:${tv.head};` : "");
  const attrs = `${ink ? " data-ink" : ""}${style ? ` data-theme="${style}"` : ""}`;
  return `<!doctype html><html lang="pt"><head>${previewHeadHtml()}`
    + `<style>html,body{margin:0;padding:0;background:#fff}</style></head>`
    + `<body><div${attrs} style="${esc(vars)}">${inertEmbedsHtml(html || emptyHtml)}</div></body></html>`;
}
