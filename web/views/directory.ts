/**
 * Diretório público de lojas (`mobisno.store/lojas`).
 *
 * Existe por uma razão de SEO concreta: cada loja nova vive num subdomínio
 * acabado de criar, sem uma única ligação a apontar-lhe. Um subdomínio órfão não
 * é descoberto pelo Google nem recebe autoridade, por muito bem otimizado que
 * esteja. Esta página, num domínio já indexado, dá a cada loja uma ligação
 * normal (seguida pelos rastreadores) e um ponto de entrada estável.
 *
 * ## A vitrina é partilhada com a página inicial
 *
 * Que lojas se mostram, por que ordem, e como se desenha a pré-visualização de
 * cada uma está em `web/lib/storeShowcase.ts` (inclui as lojas-modelo que ficam
 * de fora e o `iframe` sem scripts). Esta página mostra-as todas; a secção
 * «Lojas criadas na MôBisno» da página inicial mostra as primeiras. Duas listas
 * da mesma coisa era a avaria à espera de acontecer: uma mudava e a outra ficava
 * para trás sem nada falhar.
 *
 * O HTML equivalente é gerado no servidor (`api/prerender.js` →
 * `renderDirectory`) para quem não executa JavaScript: lá as ligações são texto,
 * sem pré-visualização. O cromo do servidor é mais simples — `api/` não pode
 * importar daqui (ver `platformChrome.ts`).
 */
import { render, esc } from "../lib/dom.js";
import { applySeo } from "../lib/seo.js";
import { collectionJsonLd, breadcrumbJsonLd, truncate, PLATFORM_NAME } from "../../src/services/seo.js";
import { PLATFORM_APEX } from "../lib/routing.js";
import { platformNavHtml, platformFooterHtml, PLATFORM_ACCENT, mountSectionNav } from "../templates/platformChrome.js";
import { mountGlowCards, ensureGlowCardStyle } from "../lib/glowCards.js";
import {
  loadShowcaseCards, previewSlotHtml, mountStorePreviews, type ShowcaseCard,
} from "../lib/storeShowcase.js";
import { mountAiAgent } from "../lib/aiAgent.js";

/**
 * Cartão de uma loja. `bento-item` dá-lhe o brilho da casa; o `--i` escalona a
 * entrada, para a grelha aparecer em cascata em vez de num bloco.
 */
function storeCard(c: ShowcaseCard, index: number): string {
  return `
    <li class="mb-rise" style="--i:${index}">
      <a href="${esc(c.url)}" target="_blank" rel="noopener"
         class="bento-item group block !p-0 h-full"
         aria-label="Abrir a loja ${esc(c.name)} num novo separador">
        <div class="relative aspect-[4/3] overflow-hidden rounded-t-[calc(1rem-1px)] bg-white">
          ${previewSlotHtml(c)}
          <span class="absolute top-0 inset-x-0 h-1.5 z-10" style="background:${esc(c.brand)}"></span>
          <span class="absolute inset-0 z-10 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></span>
          <span class="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur px-3 py-1.5 text-xs font-bold text-gray-900 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            <span class="material-symbols-outlined text-[15px]">open_in_new</span> Visitar loja
          </span>
        </div>
        <div class="p-4">
          <span class="block font-bold text-gray-900 break-words">${esc(c.name)}</span>
          ${c.type ? `<span class="block text-sm text-gray-500 mt-0.5">${esc(c.type)}</span>` : ""}
          <span class="block text-xs text-gray-400 mt-2 truncate">${esc(c.host)}</span>
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
function heroPreviewHtml(cards: ShowcaseCard[]): string {
  if (cards.length === 0) return "";
  const chrome = (c: ShowcaseCard, front: boolean): string => {
    const pos = front
      ? "relative z-20"
      : "absolute inset-0 z-10 translate-x-6 translate-y-6 rotate-3 opacity-70 hidden sm:block";
    return `<div class="${pos} rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-2xl">
      <div class="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
        <span class="ml-2 truncate text-[11px] text-gray-500">${esc(c.host)}</span>
      </div>
      <div class="relative aspect-[4/3] bg-white">${previewSlotHtml(c)}</div>
    </div>`;
  };
  const back = cards[1] ? chrome(cards[1], false) : "";
  return `
    <div class="w-full lg:w-[46%] mt-10 lg:mt-0">
      <div class="relative mx-auto w-full max-w-[520px]">
        ${back}
        ${chrome(cards[0]!, true)}
      </div>
    </div>`;
}

/**
 * Texto de leitura do hero. Nunca a descrição de SEO, que vai cortada aos 160.
 *
 * A contagem («2 lojas publicadas») saiu do topo do hero: com poucas lojas, um
 * número pequeno em destaque diz «isto ainda não pegou», que é o contrário do
 * que a página existe para mostrar.
 */
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
function page(o: { lead: string; preview: string; grid: string; heading: string }): string {
  return `
  <div class="min-h-screen flex flex-col font-sans text-gray-900" style="background:linear-gradient(180deg,#ffffff 0%,#ffffff 42%,#f7f7f8 78%,#f4f4f5 100%)">
    ${platformNavHtml()}
    <main class="flex-grow flex flex-col">
      <section class="relative overflow-hidden">
        <div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(1100px circle at 12% -10%, rgba(249,89,1,.13), transparent 58%)"></div>
        <div class="relative max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop pt-12 md:pt-16 pb-10 md:pb-14">
          <div class="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-14">
            <div class="w-full lg:w-1/2 text-center lg:text-left">
              <h1 class="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight">Lojas criadas<br class="hidden sm:block"/> na MôBisno</h1>
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
    preview: "",
    heading: "Todas as lojas",
    grid: `<ul class="${GRID_CLS}">${Array.from({ length: 6 }, skeletonCard).join("")}</ul>`,
  }));

  // As lojas da base de dados e as de domínio próprio entram no mesmo saco, e a
  // ordem é a da vitrina: a primeira é a que ocupa a janela da frente do hero
  // (`web/lib/storeShowcase.ts`).
  const cards = await loadShowcaseCards();

  const canonical = `https://${PLATFORM_APEX}/lojas`;
  const description = truncate(
    `${cards.length} lojas online angolanas criadas com a MôBisno. Compre em Kwanzas com Multicaixa Express, Referência Bancária ou WhatsApp, com entrega em Luanda e em todo o país.`,
    160,
  );

  const grid = cards.length
    ? `<ul class="${GRID_CLS}">${cards.map(storeCard).join("")}</ul>`
    : `<div class="text-center py-12 rounded-2xl border border-dashed border-gray-300 bg-white/60">
         <span class="material-symbols-outlined text-gray-300" style="font-size:56px">storefront</span>
         <p class="text-gray-700 font-bold mt-3">Ainda não há lojas publicadas</p>
         <p class="text-gray-500 text-sm mt-1">Assim que a primeira for publicada, aparece aqui.</p>
       </div>`;

  const app = render(page({
    lead: leadFor(cards.length),
    preview: heroPreviewHtml(cards),
    heading: cards.length === 1 ? "A loja" : "Todas as lojas",
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
        items: cards.map((c) => ({ name: c.name, url: c.url })),
      }),
      breadcrumbJsonLd([
        { name: PLATFORM_NAME, url: `https://${PLATFORM_APEX}/` },
        { name: "Lojas", url: canonical },
      ]),
    ],
  });
}
