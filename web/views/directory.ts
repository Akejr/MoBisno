/**
 * Diretório público de lojas (`mobisno.store/lojas`).
 *
 * Existe por uma razão de SEO concreta: cada loja nova vive num subdomínio
 * acabado de criar, sem uma única ligação a apontar-lhe. Um subdomínio órfão não
 * é descoberto pelo Google nem recebe autoridade, por muito bem otimizado que
 * esteja. Esta página, num domínio já indexado, dá a cada loja uma ligação
 * normal (seguida pelos rastreadores) e um ponto de entrada estável.
 *
 * ## A pré-visualização é a loja a sério
 *
 * Não é o banner nem a inicial do nome: é o **modelo renderizado com os dados
 * reais**, num `iframe` a 1280px encolhido para caber no cartão. Vê-se o
 * cabeçalho, o hero, a grelha de produtos — a loja como ela é. É o mesmo
 * mecanismo da galeria de modelos do editor (`storePreviewDoc`), e o `iframe` é
 * obrigatório por duas razões explicadas nesse módulo: isola os `<style>` de cada
 * modelo, e faz as medias queries responderem à largura do quadro em vez da
 * janela.
 *
 * Cada pré-visualização custa uma leitura da loja, por isso só é montada quando o
 * cartão **entra no ecrã** (`IntersectionObserver`). Com poucas lojas é
 * indiferente; com centenas é a diferença entre abrir e não abrir.
 *
 * ## Lojas-modelo ficam de fora
 *
 * São as demonstrações dos modelos, criadas pelo Administrador. Apareciam aqui
 * como se fossem lojas de clientes — conteúdo fino e quase duplicado entre si, a
 * diluir a página (`SEO.md` §7.2). A marca é `customization.__template`, a mesma
 * convenção de `listStores`, `adminOverview` e `isLojaModelo`.
 *
 * O HTML equivalente é gerado no servidor (`api/prerender.js` →
 * `renderDirectory`) para quem não executa JavaScript: lá as ligações são texto,
 * sem pré-visualização. O cromo do servidor é mais simples — `api/` não pode
 * importar daqui (ver `platformChrome.ts`).
 */
import { render, esc } from "../lib/dom.js";
import { supabase } from "../supabase/client.js";
import { applySeo } from "../lib/seo.js";
import { collectionJsonLd, breadcrumbJsonLd, truncate, PLATFORM_NAME } from "../../src/services/seo.js";
import { STORE_APEX, PLATFORM_APEX } from "../lib/routing.js";
import { platformNavHtml, platformFooterHtml, PLATFORM_ACCENT, mountSectionNav } from "../templates/platformChrome.js";
import { mountGlowCards, ensureGlowCardStyle } from "../lib/glowCards.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getTemplate } from "../templates/registry.js";
import { storePreviewDoc } from "../lib/storePreviewDoc.js";
import { mountAiAgent } from "../lib/aiAgent.js";

/** Largura do desenho pedido ao modelo. Encolhido depois para caber no cartão. */
const PREVIEW_WIDTH = 1280;
/** Altura da janela da pré-visualização. 4:3 — mostra o hero e o início dos produtos. */
const PREVIEW_HEIGHT = 960;

interface DirectoryStore {
  id: string;
  name: string;
  identifier: string;
  store_type: string | null;
  /** `customization.__template`. Presente ⇒ Loja_Modelo. */
  tpl: unknown;
  /** `customization.colors.primary` — a cor de marca da loja. */
  brand: unknown;
}

/** Cor de marca utilizável, ou o laranja da plataforma. */
function brandOf(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
    ? value.trim()
    : PLATFORM_ACCENT;
}

/**
 * Lojas de cliente publicadas e com conta ativa (a RLS já filtra as suspensas).
 *
 * Extrai `__template` e a cor de marca **na consulta**, em vez de trazer a
 * Personalização inteira: são até 500 lojas e esse JSON tem blocos, produtos
 * extra, variações. O filtro fica em JavaScript, e não no `.is()` da consulta,
 * para uma mudança de semântica do filtro nunca poder devolver um diretório
 * vazio sem ninguém notar — vazio não parece defeito, parece «ainda não há
 * lojas».
 */
async function listPublishedStores(): Promise<DirectoryStore[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, identifier, store_type, tpl:customization->__template, brand:customization->colors->primary")
    .eq("state", "Publicada")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("stores.directory", error);
    return [];
  }
  const rows = (data ?? []) as unknown as DirectoryStore[];
  return rows.filter((s) => s.tpl === undefined || s.tpl === null || s.tpl === false);
}

/**
 * Janela da pré-visualização, ainda vazia. A inicial sobre a cor de marca é o
 * estado de espera **e** o recurso final: se a loja não abrir, fica isto em vez
 * de um retângulo cinzento.
 */
function previewSlotHtml(s: DirectoryStore, brand: string): string {
  const initial = esc(s.name.trim().charAt(0).toUpperCase() || "M");
  return `<div data-preview-store="${esc(s.identifier)}" class="absolute inset-0 overflow-hidden bg-white">
    <div data-preview-fallback class="absolute inset-0 flex items-center justify-center" style="background:${esc(brand)}">
      <span class="text-white/90 font-black" style="font-size:clamp(36px,6vw,56px);line-height:1">${initial}</span>
    </div>
  </div>`;
}

/**
 * Monta as pré-visualizações reais dos cartões visíveis.
 *
 * O quadro leva `pointer-events:none`, `tabindex="-1"` e `aria-hidden`: é
 * decoração dentro de uma ligação. Sem isso, o clique caía dentro da loja
 * embutida em vez de abrir o cartão, e o leitor de ecrã lia a loja toda.
 */
function mountStorePreviews(root: ParentNode): void {
  const slots = Array.from(root.querySelectorAll<HTMLElement>("[data-preview-store]"));
  if (slots.length === 0) return;

  const fit = (slot: HTMLElement, frame: HTMLIFrameElement): void => {
    const k = slot.clientWidth / PREVIEW_WIDTH;
    if (k > 0) frame.style.transform = `scale(${k})`;
  };

  const fill = async (slot: HTMLElement): Promise<void> => {
    if (slot.dataset.previewDone === "1") return;
    slot.dataset.previewDone = "1";
    const identifier = slot.dataset.previewStore;
    if (!identifier) return;
    try {
      const { view, custom } = await loadStorefront(identifier);
      if (view.kind !== "render") return; // fica o recurso
      const html = getTemplate(view.templateId).render(view, custom);
      if (!html) return;
      const frame = document.createElement("iframe");
      frame.title = `Pré-visualização da loja ${view.storeName}`;
      frame.setAttribute("tabindex", "-1");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("scrolling", "no");
      frame.style.cssText = `border:0;background:#fff;width:${PREVIEW_WIDTH}px;height:${PREVIEW_HEIGHT}px;`
        + "transform-origin:top left;pointer-events:none;position:absolute;top:0;left:0";
      frame.srcdoc = storePreviewDoc(html, custom);
      slot.appendChild(frame);
      fit(slot, frame);
      // A capa de recurso sai só depois de o quadro existir, para não haver um
      // instante de branco entre as duas.
      slot.querySelector<HTMLElement>("[data-preview-fallback]")?.remove();
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => fit(slot, frame)).observe(slot);
      }
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
 * Cartão de uma loja. `bento-item` dá-lhe o brilho da casa; o `--i` escalona a
 * entrada, para a grelha aparecer em cascata em vez de num bloco.
 */
function storeCard(s: DirectoryStore, index: number): string {
  const url = `https://${encodeURIComponent(s.identifier)}.${STORE_APEX}/`;
  const brand = brandOf(s.brand);
  return `
    <li class="mb-rise" style="--i:${index}">
      <a href="${esc(url)}" target="_blank" rel="noopener"
         class="bento-item group block !p-0 h-full"
         aria-label="Abrir a loja ${esc(s.name)} num novo separador">
        <div class="relative aspect-[4/3] overflow-hidden rounded-t-[calc(1rem-1px)] bg-white">
          ${previewSlotHtml(s, brand)}
          <span class="absolute top-0 inset-x-0 h-1.5 z-10" style="background:${esc(brand)}"></span>
          <span class="absolute inset-0 z-10 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></span>
          <span class="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur px-3 py-1.5 text-xs font-bold text-gray-900 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            <span class="material-symbols-outlined text-[15px]">open_in_new</span> Visitar loja
          </span>
        </div>
        <div class="p-4">
          <span class="block font-bold text-gray-900 break-words">${esc(s.name)}</span>
          ${s.store_type ? `<span class="block text-sm text-gray-500 mt-0.5">${esc(s.store_type)}</span>` : ""}
          <span class="block text-xs text-gray-400 mt-2 truncate">${esc(s.identifier)}.${STORE_APEX}</span>
        </div>
      </a>
    </li>`;
}

/** Cartão do esqueleto: a forma exacta do real, para não haver salto. */
function skeletonCard(_: unknown, index: number): string {
  return `<li class="bento-item !p-0" style="--i:${index}">
    <div class="aspect-[4/3] bg-gray-100 animate-pulse rounded-t-[calc(1rem-1px)]"></div>
    <div class="p-4 space-y-2">
      <div class="h-4 w-2/3 rounded bg-gray-100 animate-pulse"></div>
      <div class="h-3 w-1/3 rounded bg-gray-100 animate-pulse"></div>
    </div>
  </li>`;
}

/**
 * Pré-visualização grande no hero, com a moldura de um navegador.
 *
 * Adapta-se ao que existe: uma loja mostra uma janela; duas ou mais mostram a
 * segunda atrás, inclinada. Antes exigia três lojas e, com duas, o hero ficava
 * com metade direita vazia — era o que estava feio.
 */
function heroPreviewHtml(stores: DirectoryStore[]): string {
  if (stores.length === 0) return "";
  const chrome = (s: DirectoryStore, front: boolean): string => {
    const brand = brandOf(s.brand);
    const pos = front
      ? "relative z-20"
      : "absolute inset-0 z-10 translate-x-6 translate-y-6 rotate-3 opacity-70 hidden sm:block";
    return `<div class="${pos} rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-2xl">
      <div class="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
        <span class="ml-2 truncate text-[11px] text-gray-500">${esc(s.identifier)}.${STORE_APEX}</span>
      </div>
      <div class="relative aspect-[4/3] bg-white">${previewSlotHtml(s, brand)}</div>
    </div>`;
  };
  const back = stores[1] ? chrome(stores[1], false) : "";
  return `
    <div class="w-full lg:w-[46%] mt-10 lg:mt-0">
      <div class="relative mx-auto w-full max-w-[520px]">
        ${back}
        ${chrome(stores[0]!, true)}
      </div>
    </div>`;
}

/** Chip com a contagem, no topo do hero. */
function countChip(n: number): string {
  const label = n === 1 ? "1 loja publicada" : `${n} lojas publicadas`;
  return `<span class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-gray-700 shadow-sm">
    <span class="w-2 h-2 rounded-full" style="background:${PLATFORM_ACCENT}"></span> ${esc(label)}
  </span>`;
}

/** Texto de leitura do hero. Nunca a descrição de SEO, que vai cortada aos 160. */
function leadFor(n: number): string {
  if (n === 0) return "Ainda não há lojas publicadas. A sua pode ser a primeira — escolha um modelo, adicione os produtos e publique no mesmo dia.";
  if (n === 1) return "A primeira loja já está online. Veja como fica, e crie a sua com endereço próprio, pagamentos em Kwanzas e encomendas pelo WhatsApp.";
  return "Lojas reais de empreendedores angolanos, com endereço próprio, pagamentos em Kwanzas e encomendas pelo WhatsApp. Entre em qualquer uma para ver como fica.";
}

const GRID_CLS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch";

/**
 * Estrutura da página, **sem costura entre secções**.
 *
 * Antes havia uma faixa cinzenta com `border-t` a cortar a página em dois. Agora
 * o fundo é um só degradê contínuo de branco para cinzento muito claro, e a
 * grelha só se distingue por um cabeçalho e pelo espaço — as secções encaixam em
 * vez de se separarem.
 */
function page(o: { lead: string; chip: string; preview: string; grid: string; heading: string }): string {
  return `
  <div class="min-h-screen flex flex-col font-sans text-gray-900" style="background:linear-gradient(180deg,#ffffff 0%,#ffffff 42%,#f7f7f8 78%,#f4f4f5 100%)">
    ${platformNavHtml()}
    <main class="flex-grow flex flex-col">
      <section class="relative overflow-hidden">
        <div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(1100px circle at 12% -10%, rgba(249,89,1,.13), transparent 58%)"></div>
        <div class="relative max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop pt-12 md:pt-16 pb-10 md:pb-14">
          <div class="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-14">
            <div class="w-full lg:w-1/2 text-center lg:text-left">
              ${o.chip}
              <h1 class="mt-5 text-4xl md:text-6xl font-black leading-[1.05] tracking-tight">Lojas criadas<br class="hidden sm:block"/> na MôBisno</h1>
              <p class="mt-6 text-lg text-gray-600 max-w-xl mx-auto lg:mx-0">${esc(o.lead)}</p>
              <!-- items-center: sem isto a coluna do telemovel estica os botoes a
                   largura toda (em flex-col o alinhamento por omissao e stretch). -->
              <div class="mt-8 flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
                <a href="/criar" class="inline-flex items-center justify-center gap-2 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transition-all active:scale-95" style="background:${PLATFORM_ACCENT}">Criar a minha loja <span class="material-symbols-outlined text-[20px]">arrow_forward</span></a>
                <a href="/" class="inline-flex items-center justify-center border border-gray-300 text-gray-800 font-semibold px-8 py-3 rounded-lg hover:bg-gray-50 transition-colors">Como funciona</a>
              </div>
            </div>
            ${o.preview}
          </div>
        </div>
      </section>
      <section class="relative">
        <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop pb-16 md:pb-20">
          <h2 class="text-2xl md:text-3xl font-black tracking-tight">${esc(o.heading)}</h2>
          <p class="text-gray-500 mt-1 mb-7">Cada cartão mostra a loja tal como está. Clique para a abrir num novo separador.</p>
          ${o.grid}
        </div>
      </section>
    </main>
    ${platformFooterHtml()}
  </div>`;
}

export async function renderDirectory(): Promise<void> {
  // Pintado **antes de qualquer `await`**, de propósito. O `route()` de
  // `web/main.ts` faz `window.scrollTo(0, 0)` de imediato, e a vista só pintava
  // depois das consultas: a página anterior saltava para o topo e ficava lá
  // durante a espera. Com o esqueleto síncrono, o salto e a pintura acontecem no
  // mesmo frame.
  ensureGlowCardStyle();
  render(page({
    lead: "A carregar as lojas publicadas na plataforma…",
    chip: "",
    preview: "",
    heading: "Todas as lojas",
    grid: `<ul class="${GRID_CLS}">${Array.from({ length: 6 }, skeletonCard).join("")}</ul>`,
  }));

  const stores = await listPublishedStores();

  const canonical = `https://${PLATFORM_APEX}/lojas`;
  const description = truncate(
    `${stores.length} lojas online angolanas criadas com a MôBisno. Compre em Kwanzas com Multicaixa Express, Referência Bancária ou WhatsApp, com entrega em Luanda e em todo o país.`,
    160,
  );

  const grid = stores.length
    ? `<ul class="${GRID_CLS}">${stores.map(storeCard).join("")}</ul>`
    : `<div class="text-center py-12 rounded-2xl border border-dashed border-gray-300 bg-white/60">
         <span class="material-symbols-outlined text-gray-300" style="font-size:56px">storefront</span>
         <p class="text-gray-700 font-bold mt-3">Ainda não há lojas publicadas</p>
         <p class="text-gray-500 text-sm mt-1">Assim que a primeira for publicada, aparece aqui.</p>
       </div>`;

  const app = render(page({
    lead: leadFor(stores.length),
    chip: countChip(stores.length),
    preview: heroPreviewHtml(stores),
    heading: stores.length === 1 ? "A loja" : "Todas as lojas",
    grid,
  }));
  mountGlowCards(app);
  mountStorePreviews(app);
  // «Funcionalidades», «Integrações» e «Preços» vivem na home: navegam para lá e
  // rolam ao chegar.
  mountSectionNav(app);
  mountAiAgent(app, { screen: "lojas" });

  applySeo({
    title: "Lojas Online em Angola — Diretório MôBisno",
    description,
    canonical,
    type: "website",
    siteName: PLATFORM_NAME,
    jsonLd: [
      collectionJsonLd({
        name: "Lojas online em Angola",
        url: canonical,
        description,
        items: stores.map((s) => ({
          name: s.name,
          url: `https://${s.identifier}.${STORE_APEX}/`,
        })),
      }),
      breadcrumbJsonLd([
        { name: PLATFORM_NAME, url: `https://${PLATFORM_APEX}/` },
        { name: "Lojas", url: canonical },
      ]),
    ],
  });
}
