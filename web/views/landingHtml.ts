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
 * Pouca informação, muito espaço, e uma ideia por secção: o topo com o
 * acordeão de imagens, como funciona, o que vem incluído, como entra o dinheiro,
 * quanto custa, e as perguntas. O cabeçalho (`platformNavHtml`) e o rodapé são
 * os partilhados por todas as páginas da plataforma e não mudam aqui.
 *
 * ## O movimento nunca esconde nada sem JavaScript
 *
 * O servidor envia tudo no estado final, visível. As secções entram ao rolar, e
 * quem as prepara é `web/lib/landingMotion.ts`: esconde **só o que ainda está
 * fora do ecrã** e mostra-o quando lá chega. Todas as regras que escondem exigem
 * a classe `mb-armed`, que só esse módulo põe, e vivem dentro de
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
import { platformNavHtml, platformNavActions, platformFooterHtml, PLATFORM_ACCENT } from "../templates/platformChrome.js";
import { glowCardStyleTag } from "../lib/glowCards.js";
import { esc } from "../lib/dom.js";
import { PLAN_NAME, PLAN_PRICE_KZ, PLAN_PERIOD_DAYS, PLAN_HIGHLIGHTS, PLAN_UNIT_LABEL } from "../../src/services/plans.js";
import { comingSoonList } from "../../src/services/comingSoon.js";
import { STORE_APEX, PLATFORM_CONTACT_EMAIL } from "../../src/services/domains.js";
import { DELIVERY_PROVINCE, LUANDA_AREAS } from "../../src/services/delivery.js";
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
/** Fundo dos ícones. */
const SOFT = "#fff4ed";

/**
 * O Vero é quem emite a Fatura-Recibo certificada pela AGT, com as credenciais
 * da empresa do Dono (ver o cartão «Fatura automática (Vero)» no separador
 * «Pagamentos» do painel). O nome é dito e tem ligação: é um terceiro, e quem
 * vende tem o direito de ir confirmar quem é.
 */
const VERO_URL = "https://vero.ao/";

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

/* --------------------------------- O topo --------------------------------- */

/** Cartões do acordeão de imagens do topo. */
export const ACCORDION_ITEMS: readonly { title: string; imageUrl: string }[] = [
  { title: "Sem código", imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1200&auto=format&fit=crop" },
  { title: "Editor visual ao vivo", imageUrl: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=1200&auto=format&fit=crop" },
  { title: `Endereço .${STORE_APEX}`, imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop" },
  { title: "Pagamentos e entregas", imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200&auto=format&fit=crop" },
  { title: "Encomendas por WhatsApp", imageUrl: "https://images.unsplash.com/photo-1611746872915-64382b5c76da?q=80&w=1200&auto=format&fit=crop" },
];

/** Classes da legenda de um cartão do acordeão. */
const CAP_BASE = "absolute text-white text-base font-semibold whitespace-nowrap transition-all duration-500 ease-in-out drop-shadow";
/** Legenda do cartão aberto (horizontal, em baixo). */
export const CAP_ACTIVE = `${CAP_BASE} bottom-5 left-1/2 -translate-x-1/2 rotate-0`;
/** Legenda de um cartão fechado (na vertical). */
export const CAP_IDLE = `${CAP_BASE} bottom-24 left-1/2 -translate-x-1/2 rotate-90`;
/** Largura do cartão aberto e de um fechado. */
export const ACC_OPEN_WIDTH = "20rem";
export const ACC_IDLE_WIDTH = "3.5rem";
/**
 * Cartão aberto à entrada: o último. O HTML já sai assim: antes saíam todos
 * fechados e o último abria quando a vista arrancava, um salto no primeiro ecrã.
 */
export const ACC_INITIAL = ACCORDION_ITEMS.length - 1;

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
  // A definição é a do cromo partilhado: as outras páginas da plataforma usam o
  // mesmo cabeçalho, e o defeito do «Criarloja» estava nas duas cópias.
  return platformNavActions(loggedIn);
}

/**
 * Ações do topo da página. `landing.ts` troca-as pelas de quem tem sessão; os
 * `id` são o que ela procura.
 */
export function landingHeroActions(loggedIn: boolean): string {
  /*
   * O segundo botão era «Já tenho conta», a apontar para o `/login`. Quem chega
   * à página inicial sem conta não quer entrar: quer ver se isto serve para o
   * negócio dele. Por isso leva agora às lojas que já existem, e vai nos dois
   * estados — com sessão também se quer ver como ficam as lojas dos outros. O
   * login continua no cabeçalho.
   */
  const exemplos = `<a href="/" data-goto="${SHOWCASE_SECTION_ID}" id="cta-hero-exemplos" class="${BTN_ALT}">${icon("storefront", "text-[20px]")} Ver lojas de exemplo</a>`;
  return loggedIn
    ? `<a href="/painel" id="cta-hero-painel" class="${BTN_MAIN}" style="background:${ACCENT}"><span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">dashboard</span> Abrir Dashboard</a>
       ${exemplos}`
    : `<a href="/criar" id="cta-hero" class="${BTN_MAIN}" style="background:${ACCENT}">Criar minha loja <span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">arrow_forward</span></a>
       ${exemplos}`;
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
function eyebrow(text: string): string {
  return `<p class="text-xs font-bold uppercase tracking-[0.18em]" style="color:${ACCENT_INK}">${esc(text)}</p>`;
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
 */
export const LANDING_CSS = [
  "summary::-webkit-details-marker{display:none}",
  ".mb-go .mb-ico{transition:transform .3s ease}",
  ".mb-go:hover .mb-ico{transform:translateX(3px)}",
  "@keyframes mb-up{from{opacity:0;transform:translate3d(0,28px,0)}to{opacity:1;transform:none}}",
  "@keyframes mb-fade{from{opacity:0}to{opacity:1}}",
  "@keyframes mb-pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:none}}",
  "@keyframes mb-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
  "@media (prefers-reduced-motion:no-preference){",
  "details[open] .mb-answer{animation:mb-fade .35s ease both}",
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

/**
 * O topo. O título é o que o Dono escreveu, com o «em minutos» escrito à
 * máquina por `landing.ts`: o elemento `data-typed` tem de ser o **último** do
 * título, para crescer sem reposicionar nada. Ao lado, o acordeão de imagens,
 * que a vista abre ao passar o rato ou ao tocar.
 */
function heroSection(): string {
  const accordion = ACCORDION_ITEMS.map((it, idx) => {
    const open = idx === ACC_INITIAL;
    return `
              <div data-acc data-index="${idx}" class="relative h-[360px] sm:h-[440px] rounded-2xl overflow-hidden cursor-pointer transition-all duration-700 ease-in-out shrink-0" style="width:${open ? ACC_OPEN_WIDTH : ACC_IDLE_WIDTH}">
                <img src="${esc(it.imageUrl)}" alt="" class="absolute inset-0 w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/400x450/1a1a1a/ffffff?text=MôBisno'" />
                <div class="absolute inset-0 bg-black/40"></div>
                <span data-cap class="${open ? CAP_ACTIVE : CAP_IDLE}">${esc(it.title)}</span>
              </div>`;
  }).join("");
  return `
      <section class="relative w-full overflow-hidden">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0">
          <div class="absolute -right-40 -top-48 h-[40rem] w-[40rem] rounded-full blur-3xl" style="background:radial-gradient(closest-side,rgba(249,89,1,.22),rgba(249,89,1,0))"></div>
          <div class="absolute inset-0" style="${GRID_BG}"></div>
        </div>
        <div class="relative max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-12 md:py-20">
          <div class="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div class="w-full lg:w-1/2 text-center lg:text-left">
              <h1 class="text-[2.25rem] leading-[1.05] sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl font-black tracking-[-0.035em] text-gray-900">Crie a sua loja<br/><span class="whitespace-nowrap">online <span data-typed class="whitespace-nowrap" style="color:${ACCENT}">em minutos</span></span></h1>
              <p class="mt-6 text-lg md:text-xl leading-relaxed text-gray-600 max-w-xl mx-auto lg:mx-0">Uma loja online para quem vende em Angola. Produtos, preços, encomendas e pagamentos, tudo organizado numa única plataforma.</p>
              <div id="hero-actions" class="mt-9 flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">${landingHeroActions(false)}</div>
              <p class="mt-5 text-sm text-gray-500">Sem programar. Grátis até publicar.</p>
            </div>
            <div class="w-full lg:w-1/2">
              <div id="accordion" class="flex flex-row items-center justify-center lg:justify-end gap-3 overflow-x-auto p-2">${accordion}
              </div>
            </div>
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
          <div data-motion data-reveal class="mt-14">
            <a href="/criar" class="${BTN_MAIN}" style="background:${ACCENT}">Criar minha loja ${icon("arrow_forward", "text-[20px]")}</a>
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
            <h2 class="${H2}">Tudo o que precisa para vender além das redes sociais.</h2>
            <p class="${LEAD}">Continue a divulgar no Instagram, Facebook e WhatsApp. Na sua loja, os clientes encontram produtos, consultam preços e fazem encomendas com stock, entregas e pagamentos organizados.</p>
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

/* ------------------------------ Lojas de exemplo ------------------------------ */

/** `id` da secção das lojas de exemplo. É aqui que o botão do topo rola. */
export const SHOWCASE_SECTION_ID = "lojas-exemplo";
/** `id` da grelha que a vista enche com as lojas que estão online. */
export const SHOWCASE_GRID_ID = "lojas-exemplo-grelha";
/** Quantas lojas a secção mostra. As restantes estão em `/lojas`. */
export const SHOWCASE_COUNT = 3;

/**
 * As lojas que já existem, para quem quer ver antes de criar.
 *
 * A grelha sai **vazia** do servidor, de propósito. As lojas publicadas mudam, e
 * este HTML é pré-renderizado e guardado em cache: a lista é carregada pela
 * vista (`web/views/landing.ts` → `web/lib/storeShowcase.ts`), que mete os
 * cartões de espera antes de consultar. Quem não executa JavaScript fica com o
 * título e a ligação para `/lojas`, que é a página onde o servidor escreve a
 * lista toda.
 *
 * O fundo é o creme do exemplo da comissão, e não o cinzento das outras secções:
 * entre as funcionalidades (branco) e os pagamentos (cinzento), uma terceira
 * faixa cinzenta deixava de se distinguir da seguinte.
 */
function examplesSection(): string {
  return `
      <section id="${SHOWCASE_SECTION_ID}" class="scroll-mt-20 w-full py-24 md:py-32" style="background:#fffaf6">
        <div class="${WRAP}">
          <div data-motion data-reveal class="max-w-2xl">
            ${eyebrow("Exemplos")}
            <h2 class="${H2}">Lojas criadas na MôBisno.</h2>
            <p class="${LEAD}">Lojas reais de quem vende em Angola. Abra qualquer uma e veja como fica por dentro.</p>
          </div>
          <div data-motion class="mt-14">
            <ul id="${SHOWCASE_GRID_ID}" data-reveal class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"></ul>
          </div>
          <div data-motion data-reveal class="mt-10">
            <a href="/lojas" class="${BTN_ALT}">Ver todas as lojas ${icon("arrow_forward", "text-[20px]")}</a>
          </div>
        </div>
      </section>`;
}

/* --------------------------------- Pagamentos --------------------------------- */

/**
 * Venda do exemplo da comissão. Exportada para o teste confirmar que o que fica
 * para levantar é calculado por `netForOwner`, e não escrito.
 */
export const DEMO_SALE_KZ = 20_000;

/** Comissão de uma venda por WhatsApp, em percentagem. Sobre 100 Kz, os Kz são a percentagem. */
const WHATSAPP_FEE_PCT = feeForMethod("whatsapp", 100);
/** Comissão de uma venda digital, em percentagem, para a contagem. */
const DIGITAL_FEE_PCT = Number((PLATFORM_FEE_RATE * 100).toFixed(2));

/** Logótipo de um meio de pagamento (já é um círculo). O título ao lado diz qual é. */
function payLogo(src: string): string {
  return `<img src="${src}" alt="" loading="lazy" decoding="async" class="h-11 w-11 rounded-full ring-4 ring-white" />`;
}

/** Uma linha da tabela dos dois caminhos: quem, em que condições, e a comissão. */
function payRow(o: { logos: string; title: string; body: string; value: string; unit: string }): string {
  return `
                <div class="flex items-center gap-4 p-6 md:gap-6 md:p-8">
                  <span class="flex shrink-0 -space-x-3">${o.logos}</span>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-base font-bold text-gray-900 md:text-lg">${esc(o.title)}</h3>
                    <p class="mt-1 text-sm text-gray-600">${esc(o.body)}</p>
                  </div>
                  <p class="shrink-0 text-right">${o.value}<span class="block text-xs font-semibold text-gray-500">${esc(o.unit)}</span></p>
                </div>`;
}

/**
 * Como entra o dinheiro: os dois caminhos numa tabela só, e a conta de uma
 * venda pelo Multicaixa feita pelas funções da comissão, com a barra do que fica
 * para o Dono. A condição dos pagamentos digitais (empresa registada e
 * aprovação) vem sempre junto deles, e vira «Em breve» se o fornecedor não
 * estiver ligado.
 */
function paymentsSection(): string {
  const venda = DEMO_SALE_KZ;
  const fee = platformFee(venda);
  const net = netForOwner(venda);
  const parteDoDono = ((net / venda) * 100).toFixed(1);
  const condicao = `${PAYMENTS_PROVIDER_READY ? "" : "Em breve. "}Para empresas registadas, depois de aprovarmos a Matrícula e a Certidão.`;
  const numero = "block text-3xl font-black tracking-tight tabular-nums text-gray-900 md:text-4xl";
  return `
      <section id="pagamentos" class="scroll-mt-20 w-full bg-gray-50 py-24 md:py-32">
        <div class="${WRAP} grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div data-motion data-reveal class="lg:col-span-5">
            ${eyebrow("Pagamentos")}
            <h2 class="${H2}">Receba como os seus clientes já pagam.</h2>
            <p class="${LEAD}">Comece pelo WhatsApp, sem comissão. Com a empresa aprovada, junte o Multicaixa Express e a Referência Bancária.</p>
            <p class="mt-6 flex items-start gap-2 text-sm text-gray-500">${icon("receipt_long", "text-[18px]")}<span>Cada pagamento digital leva faturação eletrónica certificada pela AGT, emitida pelo <a href="${VERO_URL}" target="_blank" rel="noopener" class="font-bold text-gray-900 underline decoration-2 underline-offset-2">Vero</a> em nome da sua empresa.</span></p>
          </div>
          <div data-motion class="lg:col-span-7">
            <div data-reveal class="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-gray-200 shadow-[0_40px_90px_-50px_rgba(17,24,39,.45)]">${payRow({
              logos: payLogo("/integrations/Whatsapp.png"),
              title: "WhatsApp",
              body: "Em todas as lojas, desde o primeiro dia. O cliente paga-lhe diretamente.",
              value: `<span class="${numero}">${WHATSAPP_FEE_PCT}%</span>`,
              unit: "de comissão",
            })}
              <div class="border-t border-gray-100"></div>${payRow({
              logos: `${payLogo("/integrations/Express.png")}${payLogo("/integrations/ATM.png")}`,
              title: DIGITAL_PAYMENTS_LABEL,
              body: condicao,
              value: `<span data-count="${DIGITAL_FEE_PCT}" data-count-format="pct" class="${numero}">${esc(PLATFORM_FEE_LABEL)}</span>`,
              unit: "por venda",
            })}
              <div class="border-t border-gray-100 p-6 md:p-8" style="background:#fffaf6">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Exemplo: uma venda pelo Multicaixa</p>
                <div aria-hidden="true" class="mt-4 flex h-2.5 overflow-hidden rounded-full bg-gray-200">
                  <div data-draw style="--d:450ms;width:${parteDoDono}%;background:linear-gradient(90deg,${ACCENT},#ff8a4c)" class="h-full origin-left rounded-full"></div>
                </div>
                <dl class="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt class="text-gray-500">Venda</dt><dd class="mt-0.5 font-bold tabular-nums text-gray-900">${esc(kzWhole(venda))}</dd></div>
                  <div><dt class="text-gray-500">Comissão</dt><dd class="mt-0.5 font-bold tabular-nums text-gray-900">-${esc(kzWhole(fee))}</dd></div>
                  <div class="text-right"><dt class="text-gray-500">Para levantar</dt><dd class="mt-0.5 font-black tabular-nums" style="color:${ACCENT_INK}"><span data-count="${net}" data-count-format="kz">${esc(kzWhole(net))}</span></dd></div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>`;
}

/* ----------------------------------- Preço ----------------------------------- */

/**
 * O único cartão de preço: um plano, um preço por loja, tudo incluído. O que
 * está «Em breve» cabe numa linha: uma lista do que **não** existe não merece o
 * mesmo peso do que existe.
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
                <p class="mt-6 flex flex-wrap items-baseline gap-x-2"><span data-price class="text-5xl font-black tracking-tight text-gray-900">${esc(kzWhole(PLAN_PRICE_KZ))}</span><span data-period class="text-gray-500">${esc(planPeriodLabel())} ${esc(PLAN_UNIT_LABEL)}</span></p>
                <p class="mt-3 text-sm text-gray-500">Cada loja tem a sua subscrição. Cada pagamento cobre ${esc(PLAN_PERIOD_DAYS)} dias.</p>
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

    <main class="flex-grow flex flex-col">${heroSection()}${partnersStrip()}${stepsSection()}${featuresSection()}${examplesSection()}${paymentsSection()}${pricingSection()}${faqSection()}
    </main>

    ${platformFooterHtml()}
  </div>`;
}
