/**
 * As lojas feitas com a MôBisno: quais se mostram, e como se mostra cada uma.
 *
 * Isto vivia dentro de `web/views/directory.ts`, quando `/lojas` era o único
 * sítio onde a vitrina aparecia. A página inicial passou a ter a sua secção de
 * exemplos, e duas listas da mesma coisa é a avaria conhecida: uma muda e a
 * outra fica para trás sem nada falhar. A lista, a ordem, a pré-visualização do
 * cartão e a janela que abre a loja inteira ficam todas aqui.
 *
 * ## A pré-visualização é a loja a sério
 *
 * Não é o banner nem a inicial do nome: é o **modelo renderizado com os dados
 * reais**, num `iframe` a 1280px encolhido para caber no cartão. Vê-se o
 * cabeçalho, o hero, a grelha de produtos, a loja como ela é. É o mesmo
 * mecanismo da galeria de modelos do editor (`storePreviewDoc`), e o `iframe` é
 * obrigatório por duas razões explicadas nesse módulo: isola os `<style>` de
 * cada modelo, e faz as medias queries responderem à largura do quadro em vez
 * da janela.
 *
 * Cada pré-visualização custa uma leitura da loja, por isso só é montada quando
 * o cartão **entra no ecrã** (`IntersectionObserver`). Com poucas lojas é
 * indiferente; com centenas é a diferença entre abrir e não abrir.
 *
 * ## Lojas-modelo ficam de fora
 *
 * São as demonstrações dos modelos, criadas pelo Administrador. Apareciam na
 * vitrina como se fossem lojas de clientes, conteúdo fino e quase duplicado
 * entre si, a diluir a página (`SEO.md` §7.2). A marca é
 * `customization.__template`, a mesma convenção de `listStores`,
 * `adminOverview` e `isLojaModelo`.
 */
import { esc } from "./dom.js";
import { supabase } from "../supabase/client.js";
import { STORE_APEX } from "./routing.js";
import { PLATFORM_ACCENT } from "../templates/platformChrome.js";
import { loadStorefront } from "./storeCache.js";
import { getTemplate } from "../templates/registry.js";
import { storePreviewDoc, loadPreviewDoc } from "./storePreviewDoc.js";
import { safeCssColor } from "../../src/services/storeCustom.js";

/** Largura do desenho pedido ao modelo. Encolhido depois para caber no cartão. */
export const PREVIEW_WIDTH = 1280;
/** Altura da janela da pré-visualização. 4:3 — mostra o hero e o início dos produtos. */
export const PREVIEW_HEIGHT = 960;

interface ShowcaseStoreRow {
  id: string;
  name: string;
  identifier: string;
  store_type: string | null;
  /** `customization.__template`. Presente ⇒ Loja_Modelo. */
  tpl: unknown;
  /** `customization.colors.primary` — a cor de marca da loja. */
  brand: unknown;
}

/**
 * Cor de marca utilizável, ou o laranja da plataforma. Entra num `style` de uma
 * página pública, por isso passa pela mesma validação de todas as cores do Dono
 * (`safeCssColor`).
 */
function brandOf(value: unknown): string {
  return safeCssColor(value, PLATFORM_ACCENT);
}

/**
 * Loja feita com a MôBisno que **não vive num subdomínio da plataforma** — tem
 * domínio próprio e por isso não aparece na consulta a `stores`.
 *
 * É uma lista curada, escrita à mão de propósito: são poucas e cada entrada é
 * uma decisão editorial (quem abre a página vê primeiro uma marca que já
 * reconhece). Aparecem antes das restantes.
 */
interface FeaturedStore {
  name: string;
  type: string;
  /** Endereço apresentado, sem esquema. */
  host: string;
  /** Endereço a abrir, com esquema. */
  url: string;
  brand: string;
  /**
   * Fotografia da loja, servida por nós (`web/public/previews/`).
   *
   * **Não é o site embutido, e é de propósito.** Embutir a página verdadeira
   * custava carregá-la inteira — JavaScript, tipos de letra, o carrossel do topo
   * a animar — a cada visita, e duas vezes quando a loja também aparece na janela
   * do hero. A fotografia é um pedido de ~100 kB que o navegador guarda em cache e
   * partilha entre o cartão e o hero.
   *
   * Refazer com `node scripts/preview-shot.mjs --url <endereço> --out <ficheiro>`
   * quando o site mudar de aspeto. Sem fotografia, fica a capa com a inicial.
   */
  image?: string;
}

const FEATURED_STORES: readonly FeaturedStore[] = [
  {
    name: "DOT Angola",
    type: "Gift cards e subscrições",
    host: "www.dotangola.com",
    url: "https://www.dotangola.com/",
    // `theme-color` do próprio site.
    brand: "#01042D",
    image: "/previews/dotangola.jpg",
  },
];

/**
 * O que um cartão precisa de saber, venha a loja da base de dados ou da lista
 * curada. `preview` diz **como** se desenha a pré-visualização: as lojas da
 * plataforma são renderizadas por nós a partir dos dados; as de domínio próprio
 * são uma fotografia.
 */
export interface ShowcaseCard {
  name: string;
  type: string;
  host: string;
  url: string;
  brand: string;
  preview:
    | { kind: "store"; identifier: string }
    | { kind: "image"; src: string }
    | { kind: "none" };
}

function cardOfStore(s: ShowcaseStoreRow): ShowcaseCard {
  return {
    name: s.name,
    type: s.store_type ?? "",
    host: `${s.identifier}.${STORE_APEX}`,
    url: `https://${encodeURIComponent(s.identifier)}.${STORE_APEX}/`,
    brand: brandOf(s.brand),
    preview: { kind: "store", identifier: s.identifier },
  };
}

function cardOfFeatured(f: FeaturedStore): ShowcaseCard {
  return {
    name: f.name, type: f.type, host: f.host, url: f.url, brand: f.brand,
    preview: f.image ? { kind: "image", src: f.image } : { kind: "none" },
  };
}

/**
 * Ordem editorial da vitrina: estes endereços vêm primeiro, nesta ordem. Na
 * página inicial são os que aparecem, porque a secção mostra só os primeiros; em
 * `/lojas` são os primeiros da grelha e o primeiro deles ocupa a janela da
 * frente do hero.
 *
 * É uma decisão de vitrina, não de dados — a loja escolhida é a que representa
 * melhor a plataforma neste momento. Mudar a vitrina é reordenar esta lista.
 *
 * Uma loja da plataforma que esteja aqui não custa nada a mostrar: temos os
 * dados e desenhamos o modelo. Uma loja de domínio próprio custa a fotografia
 * estática de `FEATURED_STORES` — razão a mais para a janela da frente ser de
 * uma loja nossa.
 *
 * Um endereço que não exista (loja não publicada, por exemplo) é ignorado sem
 * ruído: a lista continua na ordem que sobra.
 */
const PRIORITY_HOSTS: readonly string[] = [
  `juddycosmetics.${STORE_APEX}`,
  "www.dotangola.com",
];

/** Ordena pela vitrina. Estável: quem não está na lista mantém a ordem que trazia. */
function byPriority(a: ShowcaseCard, b: ShowcaseCard): number {
  const rank = (c: ShowcaseCard): number => {
    const i = PRIORITY_HOSTS.indexOf(c.host);
    return i === -1 ? PRIORITY_HOSTS.length : i;
  };
  return rank(a) - rank(b);
}

/**
 * Lojas de cliente publicadas e com conta ativa (a RLS já filtra as suspensas).
 *
 * Extrai `__template` e a cor de marca **na consulta**, em vez de trazer a
 * Personalização inteira: são até 500 lojas e esse JSON tem blocos, produtos
 * extra, variações. O filtro fica em JavaScript, e não no `.is()` da consulta,
 * para uma mudança de semântica do filtro nunca poder devolver uma vitrina
 * vazia sem ninguém notar — vazio não parece defeito, parece «ainda não há
 * lojas».
 */
async function listPublishedStores(): Promise<ShowcaseStoreRow[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, identifier, store_type, tpl:customization->__template, brand:customization->colors->primary")
    .eq("state", "Publicada")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("stores.showcase", error);
    return [];
  }
  const rows = (data ?? []) as unknown as ShowcaseStoreRow[];
  return rows.filter((s) => s.tpl === undefined || s.tpl === null || s.tpl === false);
}

/**
 * A vitrina completa, na ordem editorial: as lojas publicadas na plataforma e
 * as de domínio próprio, no mesmo saco.
 */
export async function loadShowcaseCards(): Promise<ShowcaseCard[]> {
  return [
    ...(await listPublishedStores()).map(cardOfStore),
    ...FEATURED_STORES.map(cardOfFeatured),
  ].sort(byPriority);
}

/**
 * Janela da pré-visualização, ainda vazia. A inicial sobre a cor de marca é o
 * estado de espera **e** o recurso final: se a loja não abrir, fica isto em vez
 * de um retângulo cinzento.
 */
export function previewSlotHtml(c: ShowcaseCard): string {
  const initial = esc(c.name.trim().charAt(0).toUpperCase() || "M");
  const attr = c.preview.kind === "store" ? `data-preview-store="${esc(c.preview.identifier)}"` : "";
  // A fotografia vem no HTML, não por JavaScript: é um `<img>` normal, com
  // `loading="lazy"` a cargo do navegador. `onerror` remove-a se faltar, e a capa
  // com a inicial — que está por baixo — volta a aparecer em vez de um espaço
  // branco. `object-top` mostra o topo da página, que é a parte que interessa.
  const img = c.preview.kind === "image"
    ? `<img src="${esc(c.preview.src)}" alt="Pré-visualização da loja ${esc(c.name)}" loading="lazy" decoding="async"
           class="absolute inset-0 w-full h-full object-cover object-top" onerror="this.remove()" />`
    : "";
  return `<div ${attr} class="absolute inset-0 overflow-hidden bg-white">
    <div data-preview-fallback class="absolute inset-0 flex items-center justify-center" style="background:${esc(c.brand)}">
      <span class="text-white/90 font-black" style="font-size:clamp(36px,6vw,56px);line-height:1">${initial}</span>
    </div>
    ${img}
  </div>`;
}

/** Quadro vazio, com a geometria e as protecções comuns às pré-visualizações. */
function makeFrame(title: string, cssText: string, decorativo: boolean): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("scrolling", decorativo ? "no" : "auto");
  if (decorativo) {
    // É decoração dentro de uma ligação: sem isto o clique caía dentro da loja
    // embutida em vez de abrir o cartão, e o leitor de ecrã lia a loja toda.
    frame.setAttribute("tabindex", "-1");
    frame.setAttribute("aria-hidden", "true");
  }
  frame.style.cssText = `border:0;background:#fff;${cssText}`;
  return frame;
}

/**
 * Monta as pré-visualizações reais dos cartões visíveis.
 */
export function mountStorePreviews(root: ParentNode): void {
  const slots = Array.from(root.querySelectorAll<HTMLElement>("[data-preview-store]"));
  if (slots.length === 0) return;

  const fit = (slot: HTMLElement, frame: HTMLIFrameElement): void => {
    const k = slot.clientWidth / PREVIEW_WIDTH;
    if (k > 0) frame.style.transform = `scale(${k})`;
  };

  const attach = (slot: HTMLElement, frame: HTMLIFrameElement): void => {
    slot.appendChild(frame);
    fit(slot, frame);
    // A capa de recurso sai só depois de o quadro existir, para não haver um
    // instante de branco entre as duas.
    slot.querySelector<HTMLElement>("[data-preview-fallback]")?.remove();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => fit(slot, frame)).observe(slot);
    }
  };

  const fill = async (slot: HTMLElement): Promise<void> => {
    if (slot.dataset.previewDone === "1") return;
    slot.dataset.previewDone = "1";

    const identifier = slot.dataset.previewStore;
    if (!identifier) return;
    try {
      const doc = await previewDocOf(identifier);
      if (!doc) return; // fica o recurso
      const frame = makeFrame(
        `Pré-visualização da loja ${doc.storeName}`,
        `width:${PREVIEW_WIDTH}px;height:${PREVIEW_HEIGHT}px;transform-origin:top left;pointer-events:none;position:absolute;top:0;left:0`,
        true,
      );
      // `sandbox` sem scripts, antes do `srcdoc`: o conteúdo é de um Dono
      // qualquer e o `iframe` teria a origem — e a sessão — da plataforma.
      loadPreviewDoc(frame, doc.html);
      attach(slot, frame);
    } catch {
      /* a capa com a inicial fica — nunca um espaço vazio */
    }
  };

  if (typeof IntersectionObserver === "undefined") {
    slots.forEach((s) => void fill(s));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      void fill(e.target as HTMLElement);
    }
  }, { rootMargin: "300px" });
  slots.forEach((s) => io.observe(s));
}

/**
 * Documento da loja, pronto a entrar num `iframe`, ou `null` se a loja não
 * abrir (apagada, despublicada, ou sem conteúdo).
 */
async function previewDocOf(identifier: string): Promise<{ html: string; storeName: string } | null> {
  const { view, custom } = await loadStorefront(identifier);
  if (view.kind !== "render") return null;
  const html = getTemplate(view.templateId).render(view, custom);
  if (!html) return null;
  return { html: storePreviewDoc(html, custom), storeName: view.storeName };
}

/* ------------------------------ Cartão e janela ------------------------------ */

/**
 * Cartão da vitrina com o botão «Ver», tal como a página inicial o mostra. O
 * botão é uma **ligação verdadeira** para a loja: sem JavaScript abre a loja, e
 * com ele abre a janela de pré-visualização (`mountShowcaseCards`).
 */
export function showcaseCardHtml(c: ShowcaseCard, index: number): string {
  const podeAbrir = c.preview.kind !== "none";
  const acao = podeAbrir
    ? `data-showcase-open="${index}"`
    : `target="_blank" rel="noopener"`;
  return `
              <li class="overflow-hidden rounded-2xl border border-gray-200 bg-white" style="--d:${120 + index * 90}ms">
                <div class="relative aspect-[4/3] overflow-hidden bg-white">
                  ${previewSlotHtml(c)}
                  <span class="absolute inset-x-0 top-0 z-10 h-1.5" style="background:${esc(c.brand)}"></span>
                </div>
                <div class="p-5">
                  <h3 class="truncate font-bold text-gray-900">${esc(c.name)}</h3>
                  <p class="mt-0.5 truncate text-xs text-gray-500">${esc(c.host)}</p>
                  <a href="${esc(c.url)}" ${acao} class="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50">
                    <span class="material-symbols-outlined mb-ico text-[18px]" aria-hidden="true">visibility</span>Ver a loja
                  </a>
                </div>
              </li>`;
}

/** Cartões de espera, com a forma exacta dos reais para não haver salto. */
export function showcaseSkeletonHtml(n: number): string {
  return Array.from({ length: n }, () => `
              <li class="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div class="aspect-[4/3] animate-pulse bg-gray-100"></div>
                <div class="space-y-2 p-5">
                  <div class="h-4 w-2/3 animate-pulse rounded bg-gray-100"></div>
                  <div class="h-3 w-1/3 animate-pulse rounded bg-gray-100"></div>
                </div>
              </li>`).join("");
}

/** Nada para mostrar. Diz-se, em vez de ficar uma fila de caixas vazias. */
export function showcaseEmptyHtml(): string {
  return `
              <li class="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center sm:col-span-2 lg:col-span-3">
                <p class="font-bold text-gray-900">Ainda não há lojas publicadas</p>
                <p class="mt-1 text-sm text-gray-500">A sua pode ser a primeira.</p>
              </li>`;
}

/**
 * Desenha os cartões e liga o botão «Ver a loja» à janela de pré-visualização.
 *
 * O `preventDefault` só acontece aqui: a ligação continua a apontar para a loja,
 * e é isso que a faz funcionar sem JavaScript e abrir num separador novo com o
 * clique do meio.
 */
export function mountShowcaseCards(grid: HTMLElement, cards: readonly ShowcaseCard[]): void {
  grid.innerHTML = cards.map(showcaseCardHtml).join("");
  mountStorePreviews(grid);
  cards.forEach((c, i) => {
    grid.querySelector<HTMLElement>(`[data-showcase-open="${i}"]`)?.addEventListener("click", (e) => {
      e.preventDefault();
      openStorePreview(c);
    });
  });
}

/** `id` da janela de pré-visualização. Uma de cada vez. */
const MODAL_ID = "mb-store-preview";

/**
 * Abre a loja inteira numa janela sobre a página.
 *
 * É a loja de verdade, desenhada a partir dos dados dela e rolável dentro do
 * quadro, com o mesmo `sandbox` sem scripts das outras pré-visualizações. Não é
 * a loja publicada embutida: a página da MôBisno não a pode embutir, e o que
 * interessa mostrar é o conteúdo, não a barra do navegador.
 *
 * Quem quiser a loja a sério tem «Abrir a loja», que a abre num separador novo.
 */
export function openStorePreview(c: ShowcaseCard): void {
  document.getElementById(MODAL_ID)?.remove();

  const host = document.createElement("div");
  host.id = MODAL_ID;
  host.className = "fixed inset-0 z-[200] flex flex-col bg-black/70";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", `Pré-visualização da loja ${c.name}`);
  host.innerHTML = `
    <div class="flex shrink-0 items-center justify-between gap-3 bg-neutral-900 px-3 py-3 text-white sm:px-5">
      <div class="flex min-w-0 items-center gap-2">
        <span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">storefront</span>
        <span class="truncate font-bold">${esc(c.name)}</span>
        <span class="hidden truncate text-xs text-white/60 sm:inline">${esc(c.host)}</span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <a href="${esc(c.url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/20">
          <span class="material-symbols-outlined mb-ico text-[18px]" aria-hidden="true">open_in_new</span>Abrir a loja
        </a>
        <button type="button" data-close aria-label="Fechar a pré-visualização" class="inline-flex items-center rounded-full px-2 py-1.5 transition-colors hover:bg-white/10"><span class="material-symbols-outlined mb-ico" aria-hidden="true">close</span></button>
      </div>
    </div>
    <div data-stage class="flex-1 overflow-auto bg-neutral-200">
      <p data-note class="py-20 text-center text-sm font-semibold text-neutral-600" aria-live="polite">A abrir a loja…</p>
    </div>`;
  document.body.appendChild(host);

  const stage = host.querySelector<HTMLElement>("[data-stage]")!;
  const note = (texto: string): void => {
    const p = host.querySelector<HTMLElement>("[data-note]");
    if (p) p.textContent = texto;
  };

  const close = (): void => {
    document.removeEventListener("keydown", onKey);
    host.remove();
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  host.querySelector("[data-close]")?.addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  void (async () => {
    try {
      if (c.preview.kind === "image") {
        const img = document.createElement("img");
        img.src = c.preview.src;
        img.alt = `Pré-visualização da loja ${c.name}`;
        img.className = "block w-full";
        host.querySelector("[data-note]")?.remove();
        stage.appendChild(img);
        return;
      }
      if (c.preview.kind !== "store") { note("Esta loja abre no próprio site."); return; }

      const doc = await previewDocOf(c.preview.identifier);
      if (!host.isConnected) return;
      if (!doc) { note("Não foi possível abrir a pré-visualização desta loja."); return; }
      const frame = makeFrame(`Loja ${doc.storeName}`, "width:100%;height:100%;display:block", false);
      loadPreviewDoc(frame, doc.html);
      host.querySelector("[data-note]")?.remove();
      stage.appendChild(frame);
    } catch {
      note("Não foi possível abrir a pré-visualização desta loja.");
    }
  })();
}
