/**
 * Pesquisa de produtos da loja — abre um campo de escrita DENTRO do próprio
 * cabeçalho (consistente com a UI de cada modelo) e mostra os resultados num
 * painel logo abaixo. Ligada ao ícone de pesquisa (`[data-search-btn]`).
 */
import { esc, formatKz } from "./dom.js";
import { loadStorefront } from "./storeCache.js";
import { brandOf } from "./brand.js";
import { currentStoreIdentifier, storeSubdomain, storeBasePath } from "./routing.js";
import { appState } from "../composition.js";
import { productSlugPath } from "./slug.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

let mounted = false;

/**
 * Folha da pesquisa, injetada uma vez.
 *
 * ## O que ela resolve
 *
 * O `<input>` da pesquisa não tinha estilo próprio, e o plugin
 * `@tailwindcss/forms` (activo em `tailwind.config.js`) aplica a **todos** os
 * inputs uma moldura de 1px, fundo, cantos retos e `padding`. Resultado: uma
 * caixa cinzenta de bordo a bordo dentro do cabeçalho, em qualquer modelo. As
 * anulações têm de ser explícitas, e ficam aqui — não repetidas em `style`
 * inline, onde divergiriam.
 *
 * A cor de foco é `var(--brand)`, por isso a pesquisa acompanha a cor de cada
 * loja em vez de trazer um azul de sistema.
 */
const SEARCH_CSS =
  /*
   * O aspeto do campo é **do modelo**, por variáveis CSS que ele declara na sua
   * raiz. Um único desenho para os quatro estava errado: o Lumière é de cantos
   * retos e serifado, o Desportivo tem cantos de 8px e paleta `neutral`, o
   * Beauty é tonal sem molduras. Cada valor aqui é só a omissão de quem não
   * declarar nada.
   */
  ".mb-search-field{" +
    "height:var(--mb-search-h,44px);" +
    "border-radius:var(--mb-search-radius,9999px);" +
    "background:var(--mb-search-bg,#fff);" +
    "border:1px solid var(--mb-search-border,rgba(15,23,42,.12));" +
    "color:var(--mb-search-ink,#1c1b1b);" +
    "font-family:var(--mb-search-font,inherit);" +
    "transition:border-color .2s ease,box-shadow .2s ease,max-width .34s cubic-bezier(.22,.61,.36,1),opacity .22s ease;" +
  "}" +
  ".mb-search-field:focus-within{border-color:var(--brand,#1c1b1b);box-shadow:0 0 0 3px color-mix(in srgb, var(--brand,#1c1b1b) 18%, transparent)}" +
  // Anula o que o plugin de formulários impõe a qualquer input.
  ".mb-search-input{appearance:none;-webkit-appearance:none;background:transparent;border:0;border-radius:0;padding:0;box-shadow:none;outline:none;color:inherit;font:inherit;line-height:1.25;min-width:0}" +
  ".mb-search-input:focus{outline:none;box-shadow:none;border:0}" +
  // O «x» nativo do `type=search` no Chrome duplicava o botão de fechar.
  ".mb-search-input::-webkit-search-cancel-button,.mb-search-input::-webkit-search-decoration{-webkit-appearance:none;display:none}" +
  ".mb-search-input::placeholder{color:var(--mb-search-ph,rgba(15,23,42,.45))}" +
  /*
   * O campo abre-se **no lugar**, dentro do cabeçalho: cresce de zero até à
   * largura possível. O cabeçalho não é tapado — era isso que fazia desaparecer
   * o logótipo e os ícones.
   */
  ".mb-search-field{max-width:0;opacity:0;overflow:hidden}" +
  ".mb-search-field[data-open=\"1\"]{max-width:var(--mb-search-max,420px);opacity:1}" +
  /* O que desliza para o lado para dar espaço (as ligações do cabeçalho). */
  "[data-search-collapse]{transition:opacity .22s ease,transform .3s cubic-bezier(.22,.61,.36,1),max-width .34s cubic-bezier(.22,.61,.36,1);will-change:opacity,transform}" +
  "[data-search-collapse][data-collapsed=\"1\"]{opacity:0;transform:translateX(-14px);max-width:0;overflow:hidden;pointer-events:none}" +
  "[data-mb-search-row][data-active=\"1\"]{background:color-mix(in srgb, var(--brand,#1c1b1b) 8%, transparent)}" +
  // `sr-only` é do Tailwind, mas a barra é construída em JavaScript e pode ser
  // montada num documento onde o purge não a viu.
  ".mb-search-host .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}" +
  // Quem pede menos movimento vê o estado final, sem transições.
  "@media(prefers-reduced-motion:reduce){.mb-search-field,[data-search-collapse]{transition:none}}";

function ensureSearchStyle(): void {
  if (document.getElementById("mb-search-style")) return;
  const st = document.createElement("style");
  st.id = "mb-search-style";
  st.textContent = SEARCH_CSS;
  document.head.appendChild(st);
}

/** Identificador da loja ativa (subdomínio, `/loja/<id>` ou estado da app). */
function currentIdentifier(): string | null {
  return currentStoreIdentifier()
    ?? storeSubdomain()
    ?? appState.storeIdentifier
    ?? null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function openSearch(identifier: string, btn: HTMLElement): Promise<void> {
  const header = btn.closest("header, nav") as HTMLElement | null;
  if (!header) return;
  // Já aberto neste cabeçalho? Foca o campo.
  const existing = header.querySelector<HTMLInputElement>("[data-mb-search-bar] [data-q]");
  if (existing) { existing.focus(); return; }

  header.style.position = header.style.position || "relative";
  ensureSearchStyle();

  /*
   * O campo abre-se **dentro** do cabeçalho, ao lado do ícone, e o cabeçalho
   * mantém tudo — logótipo, ícones e o resto. Antes era uma barra
   * `absolute inset-0` a tapar o cabeçalho inteiro: ao pesquisar, desaparecia
   * tudo, e é isso que isto resolve.
   *
   * `[data-search-host]` é o grupo de ícones onde o campo cresce, declarado por
   * cada modelo. Sem ele, cresce ao lado do próprio botão — funciona em qualquer
   * cabeçalho, mesmo num modelo que ainda não tenha declarado nada.
   */
  const host = (header.querySelector<HTMLElement>("[data-search-host]") ?? btn.parentElement) as HTMLElement;
  host.classList.add("mb-search-host");

  const field = document.createElement("div");
  field.setAttribute("data-mb-search-bar", "");
  field.setAttribute("role", "search");
  field.className = "mb-search-field flex items-center gap-2 px-3 min-w-0";
  field.innerHTML = `
    <span class="material-symbols-outlined shrink-0 text-[20px]" style="color:var(--brand,#1c1b1b)" aria-hidden="true">search</span>
    <label class="sr-only" for="mb-search-q">Pesquisar produtos</label>
    <input id="mb-search-q" data-q type="search" role="combobox" aria-expanded="false" aria-controls="mb-search-results" aria-autocomplete="list"
           autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"
           placeholder="Pesquisar produtos…" class="mb-search-input flex-1 text-base" />
    <button data-close type="button" aria-label="Fechar pesquisa" class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-60"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">close</span></button>`;
  // Entra antes do botão de pesquisa: o campo cresce da esquerda do ícone, que é
  // de onde a pessoa vem.
  host.insertBefore(field, btn);

  /*
   * As ligações do cabeçalho deslizam para o lado em vez de sumirem de vez.
   * Cada modelo marca o que pode encolher com `[data-search-collapse]`; num
   * cabeçalho sem marca nada desliza e o campo cresce só até onde couber.
   */
  const collapsibles = [...header.querySelectorAll<HTMLElement>("[data-search-collapse]")];
  collapsibles.forEach((el) => { el.dataset.collapsed = "1"; });

  /** Largura que o campo pode ocupar, com o que desliza já recolhido. */
  const larguraDisponivel = (): number => {
    const h = host.getBoundingClientRect();
    const livre = header.getBoundingClientRect().width - 32;
    return Math.max(220, Math.min(420, Math.round(livre - (h.width - field.getBoundingClientRect().width))));
  };
  field.style.setProperty("--mb-search-max", `${larguraDisponivel()}px`);
  // Abre no fotograma seguinte, para a transição de `max-width` ter de onde partir.
  requestAnimationFrame(() => { field.dataset.open = "1"; });

  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 z-[64]";
  backdrop.style.background = "rgba(0,0,0,.18)";
  backdrop.style.display = "none";

  /*
   * Painel de resultados: **escondido até haver pesquisa**, alinhado ao campo e
   * com os cantos do campo.
   *
   * Três defeitos que isto corrige, e os três vinham de eu não derivar nada do
   * campo real:
   *
   * 1. mostrava os primeiros produtos antes de a pessoa escrever uma letra;
   * 2. era posicionado **antes** de o campo expandir — nessa altura o campo tem
   *    largura zero junto ao botão, à direita, e o painel ficava lá enquanto o
   *    campo crescia para a esquerda;
   * 3. tinha uma classe de cantos arredondados escrita à mão, o que dava um
   *    painel redondo debaixo de um campo reto. O painel está no `body`, logo
   *    **não herda** as variáveis do modelo: o raio é copiado do campo já
   *    desenhado.
   */
  const panel = document.createElement("div");
  panel.className = "fixed z-[65]";
  panel.style.display = "none";
  panel.innerHTML = `<div id="mb-search-results" data-results role="listbox" aria-label="Resultados da pesquisa" class="overflow-y-auto overflow-x-hidden" style="background:#fff;max-height:min(70vh,520px);box-shadow:0 24px 50px -20px rgba(0,0,0,.28)"></div>`;
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const caixa = panel.firstElementChild as HTMLElement;
  const input = field.querySelector<HTMLInputElement>("[data-q]")!;
  const results = panel.querySelector<HTMLElement>("[data-results]")!;

  const positionPanel = (): void => {
    if (panel.style.display === "none") return;
    const f = field.getBoundingClientRect();
    const estreito = window.innerWidth < 640;
    panel.style.top = `${Math.round(f.bottom + 8)}px`;
    if (estreito) {
      panel.style.left = "12px";
      panel.style.width = `${Math.round(window.innerWidth - 24)}px`;
    } else {
      // Alinhado à esquerda do campo, com a largura dele — e sem sair do ecrã.
      const largura = Math.max(f.width, 320);
      panel.style.left = `${Math.round(Math.min(f.left, window.innerWidth - largura - 12))}px`;
      panel.style.width = `${Math.round(largura)}px`;
    }
    // Os cantos do painel são os do campo: o modelo manda nos dois.
    const raio = getComputedStyle(field).borderRadius;
    caixa.style.borderTopLeftRadius = "0";
    caixa.style.borderTopRightRadius = "0";
    caixa.style.borderBottomLeftRadius = raio;
    caixa.style.borderBottomRightRadius = raio;
    if (raio === "0px" || raio.startsWith("2px")) {
      // Modelos de cantos retos: o painel também é reto em cima e em baixo.
      caixa.style.borderRadius = raio;
    }
  };

  /** Mostra ou esconde o painel, mantendo o `aria-expanded` verdadeiro. */
  const mostrarPainel = (mostrar: boolean): void => {
    panel.style.display = mostrar ? "block" : "none";
    input.setAttribute("aria-expanded", mostrar ? "true" : "false");
    // O véu acompanha o painel. Escurecer a loja só porque o campo abriu, sem
    // nada para mostrar, é peso sem função — e era o que se via.
    backdrop.style.display = mostrar ? "block" : "none";
    if (mostrar) positionPanel();
  };

  /**
   * Fecha com a animação ao contrário: o campo encolhe, as ligações voltam ao
   * lugar, e só depois o campo sai do DOM. Removê-lo de imediato dava um salto.
   */
  const close = (): void => {
    panel.remove(); backdrop.remove();
    window.removeEventListener("scroll", positionPanel, true);
    window.removeEventListener("resize", positionPanel);
    document.removeEventListener("keydown", onKey);
    field.dataset.open = "0";
    collapsibles.forEach((el) => { delete el.dataset.collapsed; });
    const semMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semMovimento) { field.remove(); return; }
    // `transitionend` pode não chegar (o elemento pode ser desmontado antes);
    // o temporizador é a rede de segurança para o campo não ficar preso.
    let saiu = false;
    const sair = (): void => { if (saiu) return; saiu = true; field.remove(); };
    field.addEventListener("transitionend", sair, { once: true });
    setTimeout(sair, 420);
  };
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }

  field.querySelector("[data-close]")!.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); close(); });
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", positionPanel, true);
  window.addEventListener("resize", positionPanel);

  setTimeout(() => input.focus(), 30);

  // Carrega os produtos da loja (cache) e liga o filtro.
  const loaded = await loadStorefront(identifier);
  if (!header.isConnected || !field.isConnected) return; // fechou entretanto
  if (loaded.result.kind !== "render") { close(); return; }
  const products = loaded.view.kind === "render" ? loaded.view.products : [];
  const brand = brandOf(loaded.custom, loaded.result.store.templateId);
  const homeHref = storeBasePath(identifier);
  field.style.setProperty("--brand", brand);

  function row(p: StoreProductView): string {
    const thumb = p.imageUrl
      ? `<img src="${esc(p.imageUrl)}" alt="" class="w-12 h-12 rounded-lg object-cover shrink-0" />`
      : `<div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-neutral-400" aria-hidden="true">image</span></div>`;
    // O realce vem da cor da loja. Era um `hover:bg-[…]` com o creme do
    // Lumière escrito à mão, aplicado aos quatro modelos.
    return `<a href="${esc(homeHref)}/produto/${productSlugPath(p)}" data-result data-mb-search-row role="option" aria-selected="false" class="flex items-center gap-3 py-3 px-3 transition-colors">
      ${thumb}
      <div class="min-w-0 flex-1"><p class="font-medium text-neutral-900 truncate">${esc(p.name)}</p><p class="text-sm text-neutral-500 truncate">${p.category ? esc(p.category) + " · " : ""}${esc(formatKz(p.price))}</p></div>
      <span class="material-symbols-outlined text-neutral-400 shrink-0" aria-hidden="true">arrow_forward</span>
    </a>`;
  }

  /** Índice do resultado em foco (navegação por teclado). -1 = nenhum. */
  let activo = -1;

  function linhas(): HTMLElement[] {
    return [...results.querySelectorAll<HTMLElement>("[data-mb-search-row]")];
  }

  /** Marca visualmente o resultado em foco e mantém-no à vista. */
  function realcar(i: number): void {
    const rows = linhas();
    activo = rows.length === 0 ? -1 : ((i % rows.length) + rows.length) % rows.length;
    rows.forEach((r, j) => {
      const on = j === activo;
      r.dataset.active = on ? "1" : "0";
      r.setAttribute("aria-selected", on ? "true" : "false");
      if (on) r.scrollIntoView({ block: "nearest" });
    });
  }

  function draw(q: string): void {
    const nq = normalize(q.trim());
    // Sem pesquisa não há resultados. Mostrava os primeiros oito produtos assim
    // que o campo abria, o que não é uma pesquisa: é um catálogo por cima da
    // loja, e tapava-a sem ninguém ter pedido nada.
    if (nq === "") { activo = -1; results.innerHTML = ""; mostrarPainel(false); return; }
    const list = products.filter((p) =>
      normalize(p.name).includes(nq) || normalize(p.category ?? "").includes(nq) || normalize(p.description).includes(nq));
    results.innerHTML = list.length
      ? `<div class="py-1 divide-y divide-black/5">${list.map(row).join("")}</div>`
      : `<div class="text-center text-neutral-400 py-14"><span class="material-symbols-outlined" style="font-size:40px;" aria-hidden="true">search_off</span><p class="mt-2">Nenhum produto encontrado.</p></div>`;
    results.querySelectorAll("[data-result]").forEach((a, j) => {
      a.addEventListener("click", close);
      a.addEventListener("mouseenter", () => realcar(j));
    });
    activo = -1;
    mostrarPainel(true);
  }

  /*
   * O painel segue o campo enquanto ele cresce.
   *
   * Era aqui que estava a má posição: o retângulo do campo era lido **uma vez**,
   * antes da animação, quando o campo tem largura zero encostado ao botão à
   * direita. Depois crescia para a esquerda e o painel ficava para trás. Com o
   * observador, cada fotograma da expansão reposiciona o painel.
   */
  if ("ResizeObserver" in window) new ResizeObserver(positionPanel).observe(field);
  field.addEventListener("transitionend", positionPanel);

  input.addEventListener("input", () => draw(input.value));
  /*
   * Teclado: setas para percorrer, Enter para abrir o resultado em foco. Sem
   * isto a pesquisa só servia a rato — e num campo de pesquisa a expectativa de
   * qualquer pessoa é escrever, descer e carregar em Enter.
   */
  input.addEventListener("keydown", (e) => {
    const rows = linhas();
    if (e.key === "ArrowDown") { e.preventDefault(); realcar(activo + 1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); realcar(activo <= 0 ? rows.length - 1 : activo - 1); return; }
    if (e.key === "Enter") {
      const alvo = rows[activo] ?? rows[0];
      if (alvo) { e.preventDefault(); alvo.click(); }
    }
  });
  // Não desenha nada de início: o painel só aparece quando houver o que mostrar.
}

/** Liga o ícone de pesquisa do cabeçalho ([data-search-btn]). */
export function mountSearchUI(): void {
  if (mounted) return;
  mounted = true;
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-search-btn]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (location.pathname.startsWith("/personalizar")) return; // no editor, só preview
    const identifier = currentIdentifier();
    if (identifier) void openSearch(identifier, btn);
  }, true);
}
