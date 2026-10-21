/**
 * HTML da página inicial da plataforma. **Puro**: sem DOM, sem sessão, sem rede.
 *
 * Vive à parte de `landing.ts` (a vista) porque é desenhado em dois sítios: no
 * navegador, pela vista, e no servidor, pela pré-renderização
 * (`web/ssr/entry.ts` → `api/_ssr/render.mjs`). O servidor escreve exatamente
 * este HTML e a SPA, ao arrancar, adota-o em vez de o reescrever. A vista
 * importava `composition.ts` (e com ele o cliente Supabase), que não pode entrar
 * no pacote do servidor; daí a separação.
 *
 * O HTML é sempre o de **visitante sem sessão**: o servidor não sabe quem está
 * a ver. Quem tem sessão vê os botões trocados para «Abrir Dashboard» assim que
 * a sessão é lida (`landing.ts`).
 *
 * ## O desenho
 *
 * Pouca informação, muito espaço, e uma ideia por secção. A prova do produto
 * está no topo e não num texto: um telemóvel com uma loja e, por cima dele, a
 * encomenda a chegar ao WhatsApp, composta pela função que a loja usa de
 * verdade (`buildCartWhatsAppMessage`). Depois, só o que decide a compra: como
 * se faz, o que vem incluído, como entra o dinheiro, quanto custa.
 *
 * O cabeçalho (`platformNavHtml`) e o rodapé são os partilhados por todas as
 * páginas da plataforma e não mudam aqui.
 *
 * ## O movimento nunca esconde nada sem JavaScript
 *
 * O servidor envia tudo no estado final, visível. O topo entra ao carregar, só
 * com CSS; as secções de baixo entram ao rolar, e quem as prepara é
 * `web/lib/landingMotion.ts`: esconde **só o que ainda está fora do ecrã** e
 * mostra-o quando lá chega. Todas as regras que escondem exigem a classe
 * `mb-armed`, que só esse módulo põe, e vivem dentro de
 * `prefers-reduced-motion: no-preference`. `tests/landingCopy.test.ts` guarda as
 * duas coisas.
 *
 * ## Regras do texto
 *
 * Frases curtas, concretas, na voz de quem vende. Sem travessões: partem a frase
 * a meio e dão aquele tom de texto gerado. Os números saem das constantes: o
 * preço e o período de `src/services/plans.ts`, a comissão de
 * `src/services/fees.ts`, as zonas de entrega de `src/services/delivery.ts`, o
 * que está «Em breve» de `src/services/comingSoon.ts`, as perguntas de
 * `platformFaq()`, as mesmas que o `FAQPage` do servidor declara.
 *
 * Qualquer CSS que uma secção precise tem de sair **no HTML** (como
 * `glowCardStyleTag()` e `LANDING_CSS`) ou ser Tailwind: uma folha injetada só
 * quando a SPA arranca fazia o primeiro ecrã do servidor aparecer desalinhado.
 */
import { platformNavHtml, platformFooterHtml, PLATFORM_ACCENT } from "../templates/platformChrome.js";
import { glowCardStyleTag } from "../lib/glowCards.js";
import { esc } from "../lib/dom.js";
import { PLAN_NAME, PLAN_PRICE_KZ, PLAN_PERIOD_DAYS, PLAN_HIGHLIGHTS } from "../../src/services/plans.js";
import { comingSoonList } from "../../src/services/comingSoon.js";
import { STORE_APEX, PLATFORM_CONTACT_EMAIL } from "../../src/services/domains.js";
import { DELIVERY_PROVINCE, LUANDA_AREAS } from "../../src/services/delivery.js";
import { buildCartWhatsAppMessage, type OrderLine } from "../../src/services/cartMessage.js";
import { discountAmount } from "../../src/services/discount.js";
import { formatKz } from "../../src/services/format.js";
import {
  PLATFORM_FEE_RATE, PLATFORM_FEE_LABEL, platformFee, netForOwner, feeForMethod,
} from "../../src/services/fees.js";
import { PAYMENTS_PROVIDER_READY } from "../../src/services/payments.js";
import { platformFaq, kzWhole, planPeriodLabel, DIGITAL_PAYMENTS_LABEL } from "../../src/services/seo.js";

const ACCENT = PLATFORM_ACCENT;

/**
 * Laranja escuro para **texto pequeno** sobre branco. O `PLATFORM_ACCENT` tem
 * contraste suficiente para um botão (texto branco sobre laranja) mas não para
 * uma linha de 12 px em laranja sobre branco. O mesmo valor de
 * `web/views/dashboard/ui.ts`.
 */
const ACCENT_INK = "#C2410C";
/** Laranja para texto pequeno sobre o fundo escuro. */
const ACCENT_ON_DARK = "#fb923c";
/** Fundo da secção escura e moldura do telemóvel. */
const INK = "#0b0b0f";
/** Fundo dos ícones. */
const SOFT = "#fff4ed";

/* ------------------------------- Vocabulário ------------------------------- */

const WRAP = "max-w-6xl mx-auto px-margin-mobile md:px-margin-desktop";
/** Título de secção. */
const H2 = "mt-4 text-[2.25rem] leading-[1.08] md:text-5xl font-black tracking-[-0.03em] text-gray-900";
/** Linha de apoio ao título. */
const LEAD = "mt-5 text-lg md:text-xl leading-relaxed text-gray-600";
/** Botão principal. Uma definição: todos os apelos saem iguais. */
const BTN_MAIN = "mb-go inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 font-semibold text-white shadow-[0_14px_30px_-12px_rgba(249,89,1,.75)] transition-transform active:scale-[.98]";
/** Botão secundário. */
const BTN_ALT = "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-7 py-3.5 font-semibold text-gray-800 transition-colors hover:bg-gray-50";

/**
 * Ações do cabeçalho. São ligações reais (`/criar`, `/login`, `/painel`): sem
 * JavaScript continuam a funcionar, e com ele o interceptor de `web/main.ts`
 * navega sem recarregar.
 *
 * `whitespace-nowrap` e `shrink-0` impedem o rótulo de partir em duas linhas no
 * telemóvel. O `gap` não é estética: num `inline-flex` cada nó de texto vira um
 * item de flex e os espaços nas pontas são **descartados**, lia-se
 * «Criarminhaloja». O espaçamento tem de vir do `gap`.
 */
export function landingNavActions(loggedIn: boolean): string {
  return loggedIn
    ? `<a href="/painel" id="cta-painel" class="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${ACCENT}"><span class="material-symbols-outlined mb-ico text-[18px]" aria-hidden="true">dashboard</span><span class="hidden sm:inline">Abrir</span>Dashboard</a>`
    : `<a href="/login" id="cta-login" class="hidden sm:inline-flex items-center whitespace-nowrap shrink-0 text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg text-sm transition-colors">Login</a>
       <a href="/criar" id="cta-nav" class="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${ACCENT}">Criar<span class="hidden sm:inline">minha</span>loja</a>`;
}

/**
 * Ações do topo da página. `landing.ts` troca-as pelas de quem tem sessão; os
 * `id` são o que ela procura.
 */
export function landingHeroActions(loggedIn: boolean): string {
  return loggedIn
    ? `<a href="/painel" id="cta-hero-painel" class="${BTN_MAIN}" style="background:${ACCENT}"><span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">dashboard</span> Abrir Dashboard</a>`
    : `<a href="/criar" id="cta-hero" class="${BTN_MAIN}" style="background:${ACCENT}">Criar minha loja <span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">arrow_forward</span></a>
       <a href="/login" id="cta-hero-login" class="${BTN_ALT}">Já tenho conta</a>`;
}

/**
 * Ícone decorativo (o texto ao lado é que é lido).
 *
 * `mb-ico` trava a caixa a 1em (`web/lib/glowCards.ts`). Sem isso, enquanto a
 * fonte dos Material Symbols não chega, o navegador reserva o espaço da
 * **ligadura** escrita no elemento e a linha inteira aparece empurrada para a
 * direita até a fonte carregar.
 */
function icon(name: string, cls = "text-[22px]"): string {
  return `<span class="material-symbols-outlined mb-ico ${cls}" aria-hidden="true">${esc(name)}</span>`;
}

/** Etiqueta pequena por cima do título de uma secção. */
function eyebrow(text: string, onDark = false): string {
  return `<p class="text-xs font-bold uppercase tracking-[0.18em]" style="color:${onDark ? ACCENT_ON_DARK : ACCENT_INK}">${esc(text)}</p>`;
}

/* --------------------------------- Movimento -------------------------------- */

/** `id` da folha da página inicial. */
export const LANDING_STYLE_ID = "mb-landing-style";

const EASE_OUT = "cubic-bezier(.16,1,.3,1)";

/**
 * O CSS da página: o estado de repouso, os movimentos e quem os dispara.
 *
 * Três regras de que o resto depende:
 *
 *  - **Sem JavaScript, tudo à vista.** O que esconde para depois mostrar pede a
 *    classe `mb-armed`, que só `web/lib/landingMotion.ts` põe, e só em blocos que
 *    ainda estão fora do ecrã.
 *  - **«Reduzir movimento» desliga tudo.** Os movimentos, e as regras que
 *    escondem, estão dentro de `prefers-reduced-motion: no-preference`.
 *  - **Só `opacity` e `transform`.** Nada mexe na disposição da página, por isso
 *    nada salta (e o CLS fica a zero).
 *
 * O topo entra ao carregar com CSS puro, sem esperar pelo JavaScript: o título,
 * o texto e os botões ficam fixos (é o que o Google mede como primeiro ecrã) e
 * só o telemóvel e os cartões à volta dele entram.
 */
export const LANDING_CSS = [
  ".mb-typing{display:none}",
  "summary::-webkit-details-marker{display:none}",
  ".mb-go .mb-ico{transition:transform .3s ease}",
  ".mb-go:hover .mb-ico{transform:translateX(3px)}",
  "@keyframes mb-up{from{opacity:0;transform:translate3d(0,28px,0)}to{opacity:1;transform:none}}",
  "@keyframes mb-fade{from{opacity:0}to{opacity:1}}",
  "@keyframes mb-pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:none}}",
  "@keyframes mb-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
  "@keyframes mb-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-12px,0)}}",
  "@keyframes mb-dot{0%,80%,100%{opacity:.35;transform:none}40%{opacity:1;transform:translateY(-3px)}}",
  "@keyframes mb-typing{0%{opacity:0}12%{opacity:1}88%{opacity:1}100%{opacity:0}}",
  "@keyframes mb-drift{0%,100%{transform:translate3d(-6%,0,0) scale(1)}50%{transform:translate3d(6%,-4%,0) scale(1.12)}}",
  "@keyframes mb-pan{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}",
  "@media (prefers-reduced-motion:no-preference){",
  ".mb-float{animation:mb-float 7s ease-in-out infinite}",
  ".mb-drift{animation:mb-drift 18s ease-in-out infinite}",
  ".mb-pan{background-size:200% 200%;animation:mb-pan 16s ease-in-out infinite}",
  ".mb-dot{animation:mb-dot 1.2s ease-in-out infinite}",
  ".mb-dot:nth-child(2){animation-delay:.15s}",
  ".mb-dot:nth-child(3){animation-delay:.3s}",
  "details[open] .mb-answer{animation:mb-fade .35s ease both}",
  // O topo: entra ao carregar.
  `.mb-hero [data-enter]{animation:mb-up 1s ${EASE_OUT} both;animation-delay:var(--d,0ms)}`,
  ".mb-hero .mb-typing{display:flex;animation:mb-typing 1.5s ease both;animation-delay:var(--d,0ms)}",
  ".mb-hero [data-after]{animation:mb-fade .5s ease both;animation-delay:var(--d,0ms)}",
  // As secções: entram ao rolar (web/lib/landingMotion.ts).
  ".mb-armed[data-reveal],.mb-armed [data-reveal]{opacity:0;transform:translate3d(0,28px,0)}",
  `.mb-in[data-reveal],.mb-in [data-reveal]{animation:mb-up .9s ${EASE_OUT} both;animation-delay:var(--d,0ms)}`,
  ".mb-armed [data-pop]{opacity:0}",
  ".mb-in [data-pop]{animation:mb-pop .6s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--d,0ms)}",
  ".mb-armed [data-draw]{transform:scaleX(0)}",
  ".mb-in [data-draw]{animation:mb-draw 1.4s cubic-bezier(.65,0,.35,1) both;animation-delay:var(--d,0ms)}",
  "}",
].join("");

/** Quadrícula fina do fundo do topo, a desvanecer para os lados. */
const GRID_BG = "background-image:linear-gradient(to right,rgba(17,24,39,.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(17,24,39,.05) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 70% 20%,#000 20%,transparent 70%);mask-image:radial-gradient(ellipse 70% 60% at 70% 20%,#000 20%,transparent 70%)";

/* ------------------------------ A loja de exemplo ------------------------------ */

interface DemoProduct { readonly name: string; readonly price: number; readonly photo: string }

/** Os produtos da loja do telemóvel. Fotografias do Unsplash, no tamanho do cartão. */
const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { name: "Auscultadores", price: 24_900, photo: "photo-1505740420928-5e560c06d30e" },
  { name: "Relógio clássico", price: 32_000, photo: "photo-1523275335684-37898b6baf30" },
  { name: "Ténis de corrida", price: 18_500, photo: "photo-1542291026-7eec264c27ff" },
  { name: "Óculos de sol", price: 12_000, photo: "photo-1572635196237-14b3f281503f" },
];

function photoUrl(id: string): string {
  return `https://images.unsplash.com/${id}?w=240&h=240&fit=crop&auto=format&q=70`;
}

/** O que o cliente do exemplo pôs no carrinho: dois dos produtos da loja. */
const DEMO_LINES: readonly OrderLine[] = [DEMO_PRODUCTS[1], DEMO_PRODUCTS[2]]
  .filter((p): p is DemoProduct => !!p)
  .map((p) => ({ name: p.name, quantity: 1, price: p.price }));

/**
 * Zona de entrega do exemplo: a **primeira da lista canónica de Luanda**
 * (`src/services/delivery.ts`), não um nome escrito à mão.
 */
const DEMO_AREA = LUANDA_AREAS[0] ?? DELIVERY_PROVINCE;
const DEMO_FEE = 2_500;
const DEMO_CODE = "PRIMEIRA10";
const DEMO_DISCOUNT_PCT = 10;

/**
 * A encomenda de exemplo, composta pela **função verdadeira**
 * (`buildCartWhatsAppMessage`, a mesma que o checkout, o carrinho e a gaveta
 * usam) e com o desconto calculado como o checkout o calcula: sobre os
 * produtos mais a entrega (`web/views/checkout.ts`). Não é um texto a imitar o
 * produto. Se o formato da mensagem mudar, o exemplo muda com ele.
 *
 * Sem Combinação nas linhas de propósito: a mensagem escreve-a depois de um
 * travessão, e a página não tem nenhum.
 */
const DEMO_ORDER_MESSAGE = buildCartWhatsAppMessage(DEMO_LINES, formatKz, {
  delivery: { area: DEMO_AREA, fee: DEMO_FEE },
  discount: {
    code: DEMO_CODE,
    amount: discountAmount(
      { type: "percent", value: DEMO_DISCOUNT_PCT },
      DEMO_LINES.reduce((sum, l) => sum + l.price * l.quantity, 0) + DEMO_FEE,
    ),
  },
});

/**
 * Venda do exemplo da comissão. Exportada para o teste confirmar que o que fica
 * para levantar é calculado por `netForOwner`, e não escrito.
 */
export const DEMO_SALE_KZ = 20_000;

/** Comissão de uma venda por WhatsApp, em percentagem. Sobre 100 Kz, os Kz são a percentagem. */
const WHATSAPP_FEE_PCT = feeForMethod("whatsapp", 100);
/** Comissão de uma venda digital, em percentagem, para a contagem. */
const DIGITAL_FEE_PCT = Number((PLATFORM_FEE_RATE * 100).toFixed(2));

/* ----------------------------------- Topo ----------------------------------- */

/** Cartão do código de desconto, ao lado do telemóvel. */
function discountChip(): string {
  return `
              <div data-enter style="--d:900ms" class="absolute -top-5 hidden sm:block sm:-left-16 lg:-left-20 xl:-left-28">
                <div class="flex items-center gap-2.5 rounded-2xl bg-white py-2.5 pl-2.5 pr-4 shadow-[0_20px_45px_-20px_rgba(17,24,39,.45)] ring-1 ring-black/5">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl" style="background:${SOFT};color:${ACCENT_INK}">${icon("sell", "text-[18px]")}</span>
                  <span class="leading-tight">
                    <span class="block font-mono text-[12px] font-bold text-gray-900">${esc(DEMO_CODE)}</span>
                    <span class="block text-[11px] font-semibold text-emerald-700">-${DEMO_DISCOUNT_PCT}% aplicado</span>
                  </span>
                </div>
              </div>`;
}

/**
 * A encomenda a chegar ao WhatsApp: três pontos a escrever e depois a mensagem.
 * A caixa da mensagem ocupa sempre o seu lugar (só a opacidade muda), por isso o
 * cartão não cresce quando ela aparece.
 */
function whatsappCard(): string {
  const dot = `<span class="mb-dot h-1.5 w-1.5 rounded-full bg-gray-400"></span>`;
  return `
              <div data-enter style="--d:1150ms" class="absolute -bottom-10 -right-4 w-[18rem] sm:-right-16 sm:w-[18.5rem] lg:-right-20">
                <div class="overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_-25px_rgba(17,24,39,.5)] ring-1 ring-black/5">
                  <div class="flex items-center gap-2.5 px-4 py-3">
                    <img src="/integrations/Whatsapp.png" alt="" class="h-8 w-8 object-contain" />
                    <span class="min-w-0 flex-1 leading-tight">
                      <span class="block text-[13px] font-bold text-gray-900">Nova encomenda</span>
                      <span class="block text-[11px] text-gray-500">WhatsApp · agora</span>
                    </span>
                  </div>
                  <div class="px-3 pb-3" style="background:#efeae2">
                    <div class="relative pt-3">
                      <span class="mb-typing absolute left-0 top-3 items-center gap-1 rounded-2xl rounded-tl-md bg-white px-3 py-2.5 shadow-sm" style="--d:1550ms">${dot}${dot}${dot}</span>
                      <p data-after style="--d:2950ms" class="whitespace-pre-line rounded-2xl rounded-tl-md bg-white px-3.5 py-3 text-[11px] leading-[1.55] text-gray-800 shadow-sm sm:text-[11.5px]">${esc(DEMO_ORDER_MESSAGE)}</p>
                    </div>
                  </div>
                </div>
              </div>`;
}

/**
 * O telemóvel com a loja, e os dois cartões que entram à volta dele. No
 * telemóvel verdadeiro só fica o da encomenda: o do código de desconto taparia
 * metade da loja num ecrã estreito.
 */
function heroVisual(): string {
  const produtos = DEMO_PRODUCTS.map((p, i) => `
                      <li data-enter style="--d:${380 + i * 110}ms" class="rounded-2xl border border-gray-100 bg-white p-1.5">
                        <div class="aspect-square overflow-hidden rounded-xl bg-gray-100"><img src="${esc(photoUrl(p.photo))}" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" /></div>
                        <p class="mt-1.5 truncate px-0.5 text-[11px] font-semibold text-gray-900">${esc(p.name)}</p>
                        <div class="flex items-center justify-between px-0.5 pb-0.5">
                          <span class="text-[11px] font-black" style="color:${ACCENT_INK}">${esc(kzWhole(p.price))}</span>
                          <span class="flex h-5 w-5 items-center justify-center rounded-full text-white" style="background:${ACCENT}">${icon("add", "text-[14px]")}</span>
                        </div>
                      </li>`).join("");
  return `
          <figure class="relative mx-auto w-[17rem] sm:w-[18.5rem]">
            <figcaption class="sr-only">Exemplo de uma loja aberta no telemóvel e da encomenda que chega ao WhatsApp, já escrita.</figcaption>
            <div aria-hidden="true">
              <div class="absolute -inset-16 rounded-full blur-3xl" style="background:radial-gradient(closest-side,rgba(249,89,1,.30),rgba(249,89,1,0))"></div>
              <div data-enter style="--d:120ms" class="relative">
                <div class="mb-float">
                  <div class="rounded-[2.75rem] p-2.5 ring-1 ring-black/10 shadow-[0_50px_100px_-40px_rgba(17,24,39,.65)]" style="background:${INK}">
                    <div class="relative overflow-hidden rounded-[2.2rem] bg-white">
                      <div class="absolute left-1/2 top-2.5 z-10 h-6 w-24 -translate-x-1/2 rounded-full" style="background:${INK}"></div>
                      <div class="px-4 pb-4 pt-11 text-white" style="background:${ACCENT}">
                        <div class="flex items-center justify-between">
                          <span class="text-[15px] font-black tracking-tight">A sua loja</span>
                          <span class="relative inline-flex">${icon("shopping_bag", "text-[22px]")}<span class="absolute -right-1.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black" style="color:${ACCENT_INK}">${DEMO_LINES.length}</span></span>
                        </div>
                        <div class="mt-3 flex items-center gap-2 rounded-full bg-white/20 px-3 py-2 text-[11px] text-white">${icon("search", "text-[15px]")}Pesquisar produtos</div>
                      </div>
                      <p class="px-4 pt-4 text-[12px] font-bold text-gray-900">Mais vendidos</p>
                      <ul class="grid grid-cols-2 gap-2.5 px-4 pb-5 pt-2.5">${produtos}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>${discountChip()}${whatsappCard()}
            </div>
          </figure>`;
}

/**
 * O topo. O título é o que o Dono escreveu, com o «em minutos» escrito à
 * máquina por `landing.ts`: o elemento `data-typed` tem de ser o **último** do
 * título, para crescer sem reposicionar nada.
 *
 * O texto fica fixo ao carregar; só o telemóvel entra. É o título que o Google
 * mede como primeiro ecrã, e um título a aparecer com atraso piorava essa
 * medida.
 */
function heroSection(): string {
  return `
      <section class="mb-hero relative w-full overflow-hidden">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0">
          <div class="absolute -right-40 -top-48 h-[40rem] w-[40rem] rounded-full blur-3xl" style="background:radial-gradient(closest-side,rgba(249,89,1,.22),rgba(249,89,1,0))"></div>
          <div class="absolute inset-0" style="${GRID_BG}"></div>
        </div>
        <div class="relative max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop pb-24 pt-12 md:pb-32 md:pt-20">
          <div class="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-10">
            <div class="text-center lg:text-left">
              <p class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-sm" style="color:${ACCENT_INK}">${icon("chat", "text-[16px]")}Já vende por WhatsApp?</p>
              <h1 class="mt-5 text-[2.125rem] leading-[1.05] sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl font-black tracking-[-0.035em] text-gray-900">Crie a sua loja<br/><span class="whitespace-nowrap">online <span data-typed class="whitespace-nowrap" style="color:${ACCENT}">em minutos</span></span></h1>
              <p class="mt-6 text-lg md:text-xl leading-relaxed text-gray-600 max-w-xl mx-auto lg:mx-0">Ponha o seu catálogo num link. O cliente escolhe sozinho, a qualquer hora, e a encomenda chega-lhe escrita ao WhatsApp.</p>
              <div id="hero-actions" class="mt-9 flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">${landingHeroActions(false)}</div>
              <p class="mt-5 text-sm text-gray-500">Sem programar. Grátis até publicar.</p>
            </div>
            <div class="relative pb-12 lg:pb-0">${heroVisual()}</div>
          </div>
        </div>
      </section>`;
}

/* ---------------------------------- Parceiros ---------------------------------- */

/**
 * Com que meios a loja trabalha. Uma linha, e nada mais. Os logótipos são
 * círculos pequenos: sozinhos não se leem, por isso cada um leva o nome.
 */
function partnersStrip(): string {
  const meios = [
    { src: "/integrations/Whatsapp.png", name: "WhatsApp" },
    { src: "/integrations/Express.png", name: "Multicaixa Express" },
    { src: "/integrations/ATM.png", name: "Referência Bancária" },
  ];
  return `
      <section aria-label="Encomendas e pagamentos" class="w-full border-y border-gray-100 bg-white">
        <div data-motion class="${WRAP} flex flex-col items-center justify-center gap-x-12 gap-y-5 py-9 md:flex-row">
          <p data-reveal class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Encomendas e pagamentos com</p>
          <ul class="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">${meios.map((m, i) => `
            <li data-reveal style="--d:${120 + i * 90}ms" class="flex items-center gap-2.5 text-sm font-semibold text-gray-700"><img src="${m.src}" alt="" loading="lazy" decoding="async" class="h-8 w-8 rounded-full" />${esc(m.name)}</li>`).join("")}
          </ul>
        </div>
      </section>`;
}

/* -------------------------------- Como funciona -------------------------------- */

/**
 * Três passos e uma linha que se desenha entre eles. A linha vai do centro do
 * primeiro número ao centro do último: as colunas têm `gap-10` (40 px), daí o
 * `80px` do cálculo.
 */
function stepsSection(): string {
  const passos = [
    { title: "Escolha um modelo", body: "Lojas prontas, feitas por tipo de negócio." },
    { title: "Ponha os produtos", body: "Fotografia, preço e stock. O resto já está feito." },
    { title: "Publique e partilhe", body: `A loja fica em nomedaloja.${STORE_APEX}.` },
  ];
  return `
      <section id="como-funciona" class="scroll-mt-20 w-full bg-gray-50 py-24 md:py-32">
        <div class="${WRAP}">
          <div data-motion data-reveal class="max-w-2xl">
            ${eyebrow("Como funciona")}
            <h2 class="${H2}">Três passos. Nenhum código.</h2>
            <p class="${LEAD}">Da conta criada à loja no ar, sem instalar nada.</p>
          </div>
          <div data-motion class="relative mt-16">
            <div aria-hidden="true" class="absolute top-[23px] hidden h-0.5 rounded-full bg-gray-200 md:block" style="left:24px;right:calc((100% - 80px) / 3 - 24px)">
              <div data-draw class="h-full w-full origin-left" style="background:linear-gradient(90deg,${ACCENT},#ffb38a)"></div>
            </div>
            <ol class="relative grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">${passos.map((p, i) => `
              <li>
                <span data-pop style="--d:${200 + i * 350}ms;background:${ACCENT}" class="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white shadow-[0_10px_30px_-10px_rgba(249,89,1,.8)]">${i + 1}</span>
                <h3 data-reveal style="--d:${300 + i * 350}ms" class="mt-6 text-xl font-bold tracking-tight text-gray-900">${esc(p.title)}</h3>
                <p data-reveal style="--d:${380 + i * 350}ms" class="mt-2 text-gray-600">${esc(p.body)}</p>
              </li>`).join("")}
            </ol>
          </div>
          <div data-motion data-reveal class="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a href="/criar" class="${BTN_MAIN}" style="background:${ACCENT}">Criar minha loja ${icon("arrow_forward", "text-[20px]")}</a>
            <p class="text-sm text-gray-500">Grátis até publicar.</p>
          </div>
        </div>
      </section>`;
}

/* -------------------------------- Funcionalidades -------------------------------- */

/** Seis coisas, uma linha cada. É tudo o que esta secção diz. */
const FEATURES: readonly { icon: string; title: string; body: string }[] = [
  { icon: "edit_square", title: "Editor ao vivo", body: "Mude cores e textos e veja na hora." },
  { icon: "inventory_2", title: "Stock e variações", body: "O que esgota deixa de se vender." },
  { icon: "local_shipping", title: "Entregas por zona", body: `${LUANDA_AREAS.length} zonas de ${DELIVERY_PROVINCE}, com a taxa já somada.` },
  { icon: "sell", title: "Códigos de desconto", body: "Com validade e usos contados." },
  { icon: "travel_explore", title: "Encontrada no Google", body: "Cada produto tem a sua página." },
  { icon: "monitoring", title: "Visitas e produtos", body: "Saiba o que os clientes mais veem." },
];

function featuresSection(): string {
  return `
      <section id="funcionalidades" class="scroll-mt-20 w-full bg-white py-24 md:py-32">
        <div class="${WRAP}">
          <div data-motion data-reveal class="max-w-2xl">
            ${eyebrow("Funcionalidades")}
            <h2 class="${H2}">Tudo o que o WhatsApp não faz sozinho.</h2>
            <p class="${LEAD}">Catálogo, stock, entregas e descontos, ligados às conversas que já tem.</p>
          </div>
          <div data-motion class="mt-14">
            <ul data-reveal class="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-3">${FEATURES.map((f, i) => `
              <li class="bg-white p-7 md:p-9">
                <span data-pop style="--d:${250 + i * 90}ms;background:${SOFT};color:${ACCENT_INK}" class="inline-flex h-11 w-11 items-center justify-center rounded-xl">${icon(f.icon, "text-[22px]")}</span>
                <h3 class="mt-5 text-lg font-bold tracking-tight text-gray-900">${esc(f.title)}</h3>
                <p class="mt-1.5 text-gray-600">${esc(f.body)}</p>
              </li>`).join("")}
            </ul>
          </div>
        </div>
      </section>`;
}

/* --------------------------------- Pagamentos --------------------------------- */

/** Logótipo de um meio de pagamento (já é um círculo). O título do cartão diz qual é. */
function payTile(src: string): string {
  return `<img src="${src}" alt="" loading="lazy" decoding="async" class="h-12 w-12 rounded-full ring-2 ring-white/10" />`;
}

/**
 * A mesma venda nos dois caminhos: o que se vende, a comissão e o que fica.
 * Lado a lado, a diferença entre os dois cartões lê-se sem texto nenhum.
 */
function saleExample(o: { fee: number; keep: number; keepLabel: string; countKeep: boolean }): string {
  const fica = o.countKeep
    ? `<span data-count="${o.keep}" data-count-format="kz">${esc(kzWhole(o.keep))}</span>`
    : esc(kzWhole(o.keep));
  return `
                <div class="mt-auto pt-8">
                  <dl class="space-y-2.5 rounded-2xl bg-black/30 p-5 text-sm ring-1 ring-white/10">
                    <div class="flex items-center justify-between gap-4"><dt class="text-white/60">Exemplo de venda</dt><dd class="font-semibold tabular-nums">${esc(kzWhole(DEMO_SALE_KZ))}</dd></div>
                    <div class="flex items-center justify-between gap-4"><dt class="text-white/60">Comissão</dt><dd class="font-semibold tabular-nums">${o.fee > 0 ? "-" : ""}${esc(kzWhole(o.fee))}</dd></div>
                    <div class="flex items-center justify-between gap-4 border-t border-white/10 pt-2.5"><dt class="font-semibold">${esc(o.keepLabel)}</dt><dd class="text-base font-black tabular-nums" style="color:${ACCENT_ON_DARK}">${fica}</dd></div>
                  </dl>
                </div>`;
}

/**
 * Como entra o dinheiro, no fundo escuro: os dois caminhos lado a lado, e a
 * conta de uma venda digital feita pelas funções da comissão.
 *
 * A condição dos pagamentos digitais (empresa registada e aprovação) vem sempre
 * junto deles, e vira «Em breve» se o fornecedor não estiver ligado.
 */
function paymentsSection(): string {
  const condicao = `${PAYMENTS_PROVIDER_READY ? "" : "Em breve. "}Para empresas registadas, depois de aprovarmos a Matrícula e a Certidão.`;
  const card = "flex h-full flex-col rounded-3xl bg-white/[0.04] p-8 ring-1 ring-white/10 md:p-10";
  const feeWhatsapp = feeForMethod("whatsapp", DEMO_SALE_KZ);
  const whatsapp = `
              <article class="${card}">
                <div class="flex gap-2">${payTile("/integrations/Whatsapp.png")}</div>
                <p class="mt-10 flex items-baseline gap-3"><span class="text-6xl font-black tracking-tight tabular-nums">${WHATSAPP_FEE_PCT}%</span><span class="text-white/60">de comissão</span></p>
                <h3 class="mt-6 text-xl font-bold">WhatsApp</h3>
                <p class="mt-2 text-white/70">Desde o primeiro dia, em todas as lojas. O cliente paga-lhe diretamente.</p>${saleExample({ fee: feeWhatsapp, keep: DEMO_SALE_KZ - feeWhatsapp, keepLabel: "Fica consigo", countKeep: false })}
              </article>`;
  const digital = `
              <article class="${card}">
                <div class="flex gap-2">${payTile("/integrations/Express.png")}${payTile("/integrations/ATM.png")}</div>
                <p class="mt-10 flex items-baseline gap-3"><span data-count="${DIGITAL_FEE_PCT}" data-count-format="pct" class="text-6xl font-black tracking-tight tabular-nums">${esc(PLATFORM_FEE_LABEL)}</span><span class="text-white/60">por venda</span></p>
                <h3 class="mt-6 text-xl font-bold">${esc(DIGITAL_PAYMENTS_LABEL)}</h3>
                <p class="mt-2 text-white/70">${esc(condicao)}</p>${saleExample({ fee: platformFee(DEMO_SALE_KZ), keep: netForOwner(DEMO_SALE_KZ), keepLabel: "Fica para levantar", countKeep: true })}
              </article>`;
  return `
      <section id="pagamentos" class="scroll-mt-20 relative w-full overflow-hidden py-24 text-white md:py-32" style="background:${INK}">
        <div aria-hidden="true" class="mb-drift pointer-events-none absolute inset-x-0 -top-56 mx-auto h-[36rem] w-[56rem] max-w-none rounded-full blur-3xl" style="background:radial-gradient(closest-side,rgba(249,89,1,.45),rgba(249,89,1,0))"></div>
        <div class="relative ${WRAP}">
          <div data-motion data-reveal class="mx-auto max-w-3xl text-center">
            ${eyebrow("Pagamentos", true)}
            <h2 class="mt-4 text-[2.25rem] leading-[1.08] md:text-5xl font-black tracking-[-0.03em] text-white">Comece pelo WhatsApp. Cresça com o Multicaixa.</h2>
            <p class="mt-5 text-lg md:text-xl leading-relaxed text-white/70">Só há comissão quando o pagamento passa pela MôBisno.</p>
          </div>
          <div data-motion class="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div data-reveal>${whatsapp}
            </div>
            <div data-reveal style="--d:150ms">${digital}
            </div>
          </div>
          <p data-motion data-reveal class="mt-10 flex items-center justify-center gap-2 text-center text-sm text-white/60">${icon("receipt_long", "text-[18px]")}A fatura de cada venda sai em nome da sua empresa.</p>
        </div>
      </section>`;
}

/* ----------------------------------- Preço ----------------------------------- */

/**
 * O único cartão de preço: um plano, um preço, tudo incluído. O que está «Em
 * breve» cabe numa linha: uma lista do que **não** existe não merece o mesmo
 * peso do que existe.
 */
function pricingSection(): string {
  const incluido = PLAN_HIGHLIGHTS.map((f) => `
                  <li class="flex items-start gap-3 text-[15px] text-gray-700"><span class="mt-0.5 shrink-0" style="color:${ACCENT}">${icon("check_circle", "text-[20px]")}</span><span>${esc(f)}</span></li>`).join("");
  const soon = comingSoonList();
  const breve = soon.length
    ? `<p class="mt-8 border-t border-gray-100 pt-6 text-xs leading-relaxed text-gray-500">Em breve, e ainda não incluído: ${esc(soon.join(", "))}.</p>`
    : "";
  return `
      <section id="precos" class="scroll-mt-20 w-full bg-white py-24 md:py-32">
        <div class="max-w-5xl mx-auto px-margin-mobile md:px-margin-desktop">
          <div data-motion data-reveal class="mx-auto max-w-2xl text-center">
            ${eyebrow("Preço")}
            <h2 class="${H2}">Um só plano. Tudo incluído.</h2>
            <p class="${LEAD}">Criar e ver a loja é grátis. Só paga para a publicar.</p>
          </div>
          <div data-motion data-reveal class="mt-14">
            <div class="grid overflow-hidden rounded-[2rem] bg-white ring-1 ring-gray-200 shadow-[0_40px_90px_-50px_rgba(17,24,39,.45)] md:grid-cols-5">
              <div class="flex flex-col bg-gray-50 p-8 md:col-span-2 md:p-10">
                <h3 class="text-lg font-bold text-gray-900">${esc(PLAN_NAME)}</h3>
                <p class="mt-6 flex flex-wrap items-baseline gap-x-2"><span data-price class="text-5xl font-black tracking-tight text-gray-900">${esc(kzWhole(PLAN_PRICE_KZ))}</span><span data-period class="text-gray-500">${esc(planPeriodLabel())}</span></p>
                <p class="mt-3 text-sm text-gray-500">Cada pagamento cobre ${esc(PLAN_PERIOD_DAYS)} dias.</p>
                <a href="/criar" class="${BTN_MAIN} mt-8 w-full md:mt-auto" style="background:${ACCENT}">Criar minha loja ${icon("arrow_forward", "text-[20px]")}</a>
              </div>
              <div class="p-8 md:col-span-3 md:p-10">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">O que inclui</p>
                <ul class="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">${incluido}
                </ul>
                ${breve}
              </div>
            </div>
          </div>
        </div>
      </section>`;
}

/* ----------------------------- Perguntas frequentes ----------------------------- */

/**
 * As perguntas do `FAQPage` (`platformFaq()`), em acordeão. O `details` é
 * nativo, funciona sem JavaScript, e o texto da resposta continua no HTML, que é
 * a condição que o Google impõe para o bloco de FAQ.
 */
function faqSection(): string {
  const items = platformFaq().map((f, i) => `
            <details class="group border-b border-gray-200 py-5"${i === 0 ? " open" : ""}>
              <summary class="flex cursor-pointer list-none items-start justify-between gap-6">
                <h3 class="text-base font-semibold text-gray-900 md:text-lg">${esc(f.question)}</h3>
                <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-gray-600 ring-1 ring-gray-200 transition-transform duration-300 group-open:rotate-45">${icon("add", "text-[18px]")}</span>
              </summary>
              <p class="mb-answer mt-3 pr-12 text-[15px] leading-relaxed text-gray-600">${esc(f.answer)}</p>
            </details>`).join("");
  return `
      <section id="perguntas" class="scroll-mt-20 w-full bg-gray-50 py-24 md:py-32">
        <div class="${WRAP} grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div data-motion data-reveal class="lg:col-span-4">
            ${eyebrow("Dúvidas")}
            <h2 class="${H2}">Perguntas frequentes</h2>
            <p class="${LEAD}">Não encontrou a resposta? Escreva para <a href="mailto:${esc(PLATFORM_CONTACT_EMAIL)}" class="font-semibold underline decoration-2 underline-offset-4" style="color:${ACCENT_INK}">${esc(PLATFORM_CONTACT_EMAIL)}</a>.</p>
          </div>
          <div class="lg:col-span-8">${items}
          </div>
        </div>
      </section>`;
}

/* --------------------------------- Apelo final --------------------------------- */

/**
 * O último apelo, num painel cor de laranja queimado. Todos os tons do degradê
 * dão pelo menos 4,5:1 ao texto branco (o mais claro, `#cf440e`, dá 4,7), por
 * isso o contraste aguenta com o degradê a deslizar. A mancha desfocada é preta
 * de propósito: uma branca clareava o fundo por trás do texto no telemóvel.
 *
 * As ligações para o diretório e para os modelos são a prova verdadeira: lojas
 * publicadas e modelos que se abrem sem conta e sem pagar. Nenhuma contagem
 * inventada, nenhum testemunho, nenhum logótipo de quem nunca cá esteve.
 */
function finalCtaSection(): string {
  return `
      <section id="comecar" class="w-full bg-white py-24 md:py-32">
        <div class="${WRAP}">
          <div data-motion data-reveal>
            <div class="mb-pan relative overflow-hidden rounded-[2.5rem] px-6 py-20 text-center text-white md:px-16 md:py-24" style="background-image:linear-gradient(120deg,#cf440e 0%,#a8380a 30%,#c8420d 60%,#b23a0a 100%)">
              <div aria-hidden="true" class="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full ring-1 ring-white/20"></div>
              <div aria-hidden="true" class="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full ring-1 ring-white/20"></div>
              <div aria-hidden="true" class="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-black/10 blur-3xl"></div>
              <div class="relative">
                <h2 class="mx-auto max-w-3xl text-4xl font-black tracking-[-0.03em] md:text-6xl">Ponha o seu catálogo num link.</h2>
                <p class="mx-auto mt-6 max-w-xl text-lg text-white md:text-xl">Crie a loja hoje. Só paga quando a quiser online.</p>
                <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a href="/criar" class="mb-go inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 font-bold shadow-lg transition-transform active:scale-[.98]" style="color:${ACCENT_INK}">Criar minha loja ${icon("arrow_forward", "text-[20px]")}</a>
                  <a href="/lojas" class="inline-flex items-center justify-center rounded-xl px-7 py-3.5 font-semibold text-white ring-1 ring-inset ring-white/60 transition-colors hover:bg-white/10">Ver lojas criadas</a>
                </div>
                <p class="mt-6 text-sm text-white">Ou abra um dos <a href="/modelos" class="font-semibold text-white underline underline-offset-4">modelos prontos</a> antes de decidir.</p>
              </div>
            </div>
          </div>
        </div>
      </section>`;
}

/** HTML completo da página inicial, para quem ainda não tem sessão. */
export function landingHtml(): string {
  return `
  ${glowCardStyleTag()}
  <style id="${LANDING_STYLE_ID}">${LANDING_CSS}</style>
  <div class="min-h-screen flex flex-col bg-white font-sans text-gray-900">
    ${platformNavHtml({
      brandHtml: `<a href="/" id="brand" class="flex items-center gap-2" aria-label="MôBisno, início">
          <img id="brand-logo" src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </a>`,
      actionsHtml: landingNavActions(false),
    })}

    <main class="flex-grow flex flex-col">${heroSection()}${partnersStrip()}${stepsSection()}${featuresSection()}${paymentsSection()}${pricingSection()}${faqSection()}${finalCtaSection()}
    </main>

    ${platformFooterHtml()}
  </div>`;
}
