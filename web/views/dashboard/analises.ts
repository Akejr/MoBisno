/**
 * Separador «Análises» do Dashboard do Dono.
 *
 * Quem visita a loja, o que vê e quantas encomendas chegam por WhatsApp. Os
 * números vêm dos eventos da própria loja (`store_events`, ver
 * `web/supabase/analytics.ts`): visitas, produtos vistos, adições ao carrinho,
 * checkouts abertos e encomendas por WhatsApp.
 */
import { esc, fadeInImages } from "../../lib/dom.js";
import { productRepository } from "../../composition.js";
import { getStoreAnalytics } from "../../supabase/analytics.js";
import type { DashCtx } from "./context.js";
import { ACCENT, ACCENT_TINT, BTN_PRIMARY, BTN_SECONDARY, card, cardHead, icon, pageIntro } from "./ui.js";
import { funnelHtml } from "./markup.js";

export async function renderAnalises(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store, billing } = ctx;

  const [a, products] = await Promise.all([
    getStoreAnalytics(store.id),
    productRepository.listByStore(store.id),
  ]);

  /**
   * Animações do ecrã de Análises.
   *
   * Ficam numa folha injetada com `id` próprio, como em `web/views/start.ts`:
   * são `@keyframes` (traçado da linha, entrada das barras) que o Tailwind não
   * gera a partir do `content`, e uma classe inventada seria removida pelo
   * purge. Quem pede menos movimento vê tudo já no estado final — nunca uma
   * linha a meio de ser desenhada nem uma barra a zero.
   */
  function injectAnalyticsStyle(): void {
    if (document.getElementById("mb-analytics-style")) return;
    const st = document.createElement("style");
    st.id = "mb-analytics-style";
    st.textContent = `
      @keyframes mbAnaRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
      @keyframes mbAnaDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
      @keyframes mbAnaFade{from{opacity:0}to{opacity:1}}
      @keyframes mbAnaPop{from{opacity:0;transform:translate(-50%,50%) scale(.2)}to{opacity:1;transform:translate(-50%,50%) scale(1)}}
      @keyframes mbAnaBar{from{width:0}to{width:var(--mb-w,0%)}}
      @keyframes mbAnaHalo{0%{transform:translate(-50%,50%) scale(.9);opacity:.55}70%{transform:translate(-50%,50%) scale(2.1);opacity:0}100%{transform:translate(-50%,50%) scale(2.1);opacity:0}}
      .mb-ana-rise{opacity:0;animation:mbAnaRise .5s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--mb-i,0)*70ms)}
      .mb-ana-line{stroke-dasharray:1;stroke-dashoffset:1;animation:mbAnaDraw 1.1s cubic-bezier(.4,0,.2,1) .1s forwards}
      .mb-ana-area{opacity:0;animation:mbAnaFade .7s ease .45s forwards}
      .mb-ana-dot{opacity:0;animation:mbAnaPop .32s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.4s + var(--mb-i,0)*45ms)}
      .mb-ana-halo{opacity:0;animation:mbAnaHalo 2.4s ease-out 1.2s infinite backwards}
      .mb-ana-bar{width:0;animation:mbAnaBar .9s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(.15s + var(--mb-i,0)*60ms)}
      .mb-ana-col:hover{background:rgba(249,89,1,.06)}
      .mb-ana-col:focus-visible{outline:2px solid ${ACCENT};outline-offset:-2px}
      .mb-ana-tip{transition:opacity .12s ease}
      @media(prefers-reduced-motion:reduce){
        .mb-ana-rise,.mb-ana-area{animation:none;opacity:1;transform:none}
        .mb-ana-line{animation:none;stroke-dashoffset:0}
        .mb-ana-dot{animation:none;opacity:1;transform:translate(-50%,50%)}
        .mb-ana-halo{animation:none;opacity:0}
        .mb-ana-bar{animation:none;width:var(--mb-w,0%)}
        .mb-ana-tip{transition:none}
      }`;
    document.head.appendChild(st);
  }
  injectAnalyticsStyle();

  /** Quem pediu menos movimento não leva contagens nem transições em JS. */
  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const dayShort = (iso: string): string =>
    new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const dayLong = (iso: string): string =>
    new Date(iso).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

  /*
   * A comparação entre períodos sai da série diária, a única coisa em
   * `getStoreAnalytics` que dá para partir em dois períodos iguais: 14 dias =
   * 7 + 7. O número em destaque também vem dela (e não de `visits7`, que é
   * uma janela deslizante de 168 horas) para o valor e a variação terem a
   * mesma base — senão o Dono vê 12 visitas com «+40%» calculado sobre outra
   * contagem. As encomendas por WhatsApp também têm série diária, e por isso
   * também têm variação; as visualizações de produtos não têm, e não têm
   * variação: inventá-la era pior do que não a ter.
   */
  const dias = a.daily.length;
  const last7 = a.daily.slice(-7).reduce((s, d) => s + d.visits, 0);
  const prev7 = a.daily.slice(0, Math.max(0, dias - 7)).reduce((s, d) => s + d.visits, 0);
  const wLast7 = a.daily.slice(-7).reduce((s, d) => s + d.whatsapp, 0);
  const wPrev7 = a.daily.slice(0, Math.max(0, dias - 7)).reduce((s, d) => s + d.whatsapp, 0);
  const total14 = a.daily.reduce((s, d) => s + d.visits, 0);
  const maxV = Math.max(1, ...a.daily.map((d) => d.visits));
  const peak = a.daily.reduce((best, d, i) => (d.visits > (a.daily[best]?.visits ?? -1) ? i : best), 0);
  const mediaDia = Math.round((a.visits30 / 30) * 10) / 10;

  /**
   * Variação face ao período anterior, com seta e cor.
   *
   * Sem período anterior com dados não há percentagem que signifique algo
   * (dividir por zero dá infinito, e «+100%» sobre zero é uma invenção): esses
   * casos dizem-se por palavras.
   */
  function deltaPill(cur: number, prev: number, vazio = "sem visitas", primeiras = "primeiras visitas"): string {
    const wrap = (bg: string, color: string, iconName: string, text: string): string =>
      `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0" style="background:${bg};color:${color}">
        <span class="material-symbols-outlined text-[13px]" aria-hidden="true">${iconName}</span>${esc(text)}</span>`;
    if (cur === 0 && prev === 0) return wrap("#f3f4f6", "#4b5563", "remove", vazio);
    if (prev === 0) return wrap("#ecfdf5", "#047857", "arrow_upward", primeiras);
    if (cur === prev) return wrap("#f3f4f6", "#4b5563", "remove", "igual");
    const pct = Math.round(((cur - prev) / prev) * 100);
    return pct > 0
      ? wrap("#ecfdf5", "#047857", "arrow_upward", `+${pct}%`)
      : wrap("#fef2f2", "#b91c1c", "arrow_downward", `${pct}%`);
  }

  /** Cartão de número: valor com contagem de entrada, variação e nota de contexto. */
  function statCard(i: number, iconName: string, label: string, value: number, pillHtml: string, hint: string): string {
    return `<div class="mb-ana-rise bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col gap-3" style="--mb-i:${i}">
      <div class="flex items-start justify-between gap-2">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined" aria-hidden="true">${iconName}</span></div>
        ${pillHtml}
      </div>
      <div class="min-w-0">
        <p class="text-sm text-gray-600 mb-0.5">${esc(label)}</p>
        <p class="text-3xl font-black text-gray-900 tabular-nums" data-count-to="${value}">${reduceMotion ? value : 0}</p>
        <p class="text-xs text-gray-500 mt-1">${esc(hint)}</p>
      </div>
    </div>`;
  }

  /*
   * Gráfico à mão, sem biblioteca, no espírito de `evolutionChart` em
   * `web/views/adminPanel.ts`: aqui é área + linha porque catorze barras nuas
   * a 360 px não deixam ver a tendência, que é a leitura que interessa.
   *
   * A linha vai em SVG com `preserveAspectRatio="none"` (estica-se à largura
   * disponível, e o `vector-effect` impede o traço de engordar com ela); os
   * pontos, as colunas de leitura e os rótulos são HTML posicionado em
   * percentagem, porque um círculo SVG num sistema esticado sairia elipse.
   */
  const xOf = (i: number): number => ((i + 0.5) / Math.max(1, dias)) * 100;
  const yOf = (v: number): number => 100 - (v / maxV) * 94; // 6% de folga no topo: o ponto do pico não fica cortado
  const pontos = a.daily.map((d, i) => `${xOf(i).toFixed(2)},${yOf(d.visits).toFixed(2)}`);
  const linePath = `M${pontos.join(" L")}`;
  const areaPath = `${linePath} L${xOf(dias - 1).toFixed(2)},100 L${xOf(0).toFixed(2)},100 Z`;

  const ticks = [...new Set([maxV, Math.round(maxV / 2), 0])];
  const grade = ticks.map((v) => `<div class="absolute left-0 right-0 flex items-center gap-2" style="top:${yOf(v).toFixed(2)}%;transform:translateY(-50%)">
      <span class="w-8 shrink-0 text-right text-[10px] font-semibold text-gray-500 tabular-nums">${v}</span>
      <span class="flex-1 border-t border-dashed border-gray-200"></span>
    </div>`).join("");

  const dots = a.daily.map((d, i) => {
    const destaque = i === peak && d.visits > 0;
    const r = destaque ? 12 : 8;
    // O centrar é feito pelo `translate(-50%,50%)` das animações, e não por
    // margens negativas: assim o ponto fica no sítio com ou sem movimento.
    const halo = destaque
      ? `<span class="mb-ana-halo absolute rounded-full pointer-events-none" style="left:${xOf(i).toFixed(2)}%;bottom:${(100 - yOf(d.visits)).toFixed(2)}%;width:14px;height:14px;background:${ACCENT}"></span>`
      : "";
    const corpo = destaque
      ? `background:#fff;border:3px solid ${ACCENT};box-shadow:0 4px 12px -2px rgba(249,89,1,.55)`
      : `background:${ACCENT};border:2px solid #fff`;
    return `${halo}<span data-dot="${i}" class="mb-ana-dot absolute rounded-full pointer-events-none" style="--mb-i:${i};left:${xOf(i).toFixed(2)}%;bottom:${(100 - yOf(d.visits)).toFixed(2)}%;width:${r}px;height:${r}px;${corpo}"></span>`;
  }).join("");

  /*
   * Uma coluna invisível por dia, larga o suficiente para o rato e o dedo
   * acertarem, e focável pelo teclado. O `title` garante o valor mesmo antes
   * de o JavaScript ligar a dica.
   */
  const colunas = a.daily.map((d, i) => {
    const rotulo = `${dayLong(d.date)}: ${d.visits} visita(s), ${d.whatsapp} encomenda(s) por WhatsApp`;
    return `<button type="button" data-day="${i}" class="mb-ana-col flex-1 min-w-0 h-full rounded-md transition-colors" title="${esc(rotulo)}" aria-label="${esc(rotulo)}"></button>`;
  }).join("");

  const rotulosX = a.daily.map((d, i) => {
    // Catorze datas lado a lado ficam ilegíveis: mostra-se dia sim, dia não,
    // e o último dia (hoje) é sempre um dos mostrados.
    const mostrar = (dias - 1 - i) % 2 === 0;
    return `<span class="flex-1 min-w-0 text-center text-[10px] font-semibold ${i === peak && d.visits > 0 ? "" : "text-gray-500"}" ${i === peak && d.visits > 0 ? `style="color:#C2410C"` : ""}>${mostrar ? esc(dayShort(d.date)) : "&nbsp;"}</span>`;
  }).join("");

  const picoTexto = a.daily[peak] && a.daily[peak]!.visits > 0
    ? `Dia de maior tráfego: <strong class="font-bold" style="color:#C2410C">${esc(dayLong(a.daily[peak]!.date))}</strong>, com ${a.daily[peak]!.visits} visita(s).`
    : "Sem visitas registadas nos últimos 14 dias.";

  const chartCard = `
    <section class="mb-ana-rise bg-white border border-gray-200 rounded-2xl shadow-sm p-5 md:p-6 min-w-0" style="--mb-i:4">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div class="min-w-0">
          <h2 class="font-black text-gray-900">Visitas — últimos 14 dias</h2>
          <p class="text-sm text-gray-500 mt-0.5">${total14} visita(s) no período. Passe o rato num dia para ver o valor.</p>
        </div>
        <span class="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-1 shrink-0" style="background:#fff4ed;color:#C2410C">
          <span class="w-2 h-2 rounded-full" style="background:${ACCENT}"></span> Visitas por dia
        </span>
      </div>
      <div class="relative" style="height:190px">
        ${grade}
        <div id="ana-plot" class="absolute inset-y-0 left-10 right-0">
          <svg class="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="ana-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.28" />
                <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <path class="mb-ana-area" d="${areaPath}" fill="url(#ana-fill)" />
            <path class="mb-ana-line" d="${linePath}" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" vector-effect="non-scaling-stroke" />
          </svg>
          ${dots}
          <div class="absolute inset-0 flex items-stretch gap-0.5">${colunas}</div>
          <div id="ana-tip" class="mb-ana-tip absolute z-10 pointer-events-none rounded-xl px-3 py-2 text-white shadow-lg" style="opacity:0;visibility:hidden;background:#111827;transform:translateX(-50%)"></div>
        </div>
      </div>
      <div class="flex items-stretch gap-0.5 pl-10 mt-2">${rotulosX}</div>
      <p class="text-sm text-gray-600 mt-4">${picoTexto}</p>
    </section>`;

  /*
   * Funil de compra dos 30 dias, o mesmo desenho do «Início». Os checkouts
   * abertos ficam numa linha à parte e não como um passo do funil: uma
   * encomenda por WhatsApp pode sair da página do produto ou do carrinho sem
   * passar pelo checkout, e um passo que se pode saltar não é um passo.
   */
  const funilCard = `
    <section class="mb-ana-rise bg-white border border-gray-200 rounded-2xl shadow-sm p-5 md:p-6 min-w-0" style="--mb-i:5">
      ${cardHead({ icon: "filter_alt", title: "Funil de compra (30 dias)", subtitle: "Da visita à encomenda." })}
      <div class="mt-5">${funnelHtml({ visits: a.visits30, views: a.views30, carts: a.carts30, whatsapp: a.whatsapp30 })}</div>
      <p class="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">Checkouts abertos (30 dias): <strong class="text-gray-900 tabular-nums">${a.checkouts30}</strong></p>
    </section>`;

  const topMax = Math.max(1, ...a.topProducts.map((t) => t.count));
  const byId = new Map(products.map((p) => [p.id, p]));
  const topRows = a.topProducts.map((t, i) => {
    const p = byId.get(t.productId);
    const quota = Math.max(4, Math.round((t.count / topMax) * 100)); // 4%: uma barra de 1 px não se vê
    const foto = p?.imageUrl
      ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" class="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />`
      : `<span class="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-gray-300 text-[20px]" aria-hidden="true">image</span></span>`;
    return `<li class="flex items-center gap-3 px-5 py-3">
      ${foto}
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-semibold text-gray-800 truncate">${esc(p?.name ?? "Produto já removido")}</span>
          <span class="text-sm font-black text-gray-900 tabular-nums shrink-0">${t.count}</span>
        </div>
        <div class="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
          <div class="mb-ana-bar h-full rounded-full" style="--mb-w:${quota}%;--mb-i:${i};background:${ACCENT}"></div>
        </div>
      </div>
    </li>`;
  }).join("");

  const topCard = `
    <section class="mb-ana-rise bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" style="--mb-i:6">
      <div class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-black text-gray-900">Produtos mais vistos (30 dias)</h2>
        <span class="text-xs text-gray-500">${a.views30} visualização(ões) no total</span>
      </div>
      ${a.topProducts.length
        ? `<ol class="divide-y divide-gray-100">${topRows}</ol>`
        : `<div class="px-5 py-10 text-center">
            <span class="material-symbols-outlined text-gray-300" style="font-size:34px" aria-hidden="true">visibility_off</span>
            <p class="text-sm text-gray-600 mt-1">Ainda ninguém abriu a página de um produto.</p>
            <a href="#/painel/produtos" class="text-sm font-bold hover:underline" style="color:#C2410C">Ver os meus produtos</a>
          </div>`}
    </section>`;

  const fonte = `<p class="text-xs text-gray-500 mt-6">Os números vêm dos eventos da sua própria loja (visitas, produtos vistos, carrinho, checkout e encomendas por WhatsApp), não do Google Analytics.</p>`;

  const cabecalho = pageIntro("Quem visita a sua loja, o que vê e quantas encomendas chegam por WhatsApp.");

  /*
   * Loja sem um único evento em 30 dias não mostra quatro zeros: quatro zeros
   * lidos por quem acabou de criar a loja parecem avaria do painel. Mostra-se
   * o que falta fazer para os números começarem a existir, e o passo a seguir
   * depende do estado real da Loja.
   */
  if (a.visits30 === 0 && a.views30 === 0) {
    const publicada = store.state === "Publicada" && billing.accessActive;
    const passo = (n: number, feito: boolean, texto: string): string => `<li class="flex items-start gap-2.5">
      <span class="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5" style="background:${feito ? "#ecfdf5" : "#fff4ed"};color:${feito ? "#047857" : "#C2410C"}">${feito ? "&check;" : n}</span>
      <span class="text-sm ${feito ? "text-gray-500 line-through" : "text-gray-700"}">${feito ? `<span class="sr-only">Feito: </span>` : ""}${texto}</span>
    </li>`;
    ctx.paint(`${cabecalho}
      ${card(`<div class="text-center py-4">
        <div class="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style="background:${ACCENT_TINT};color:${ACCENT}">
          <span class="material-symbols-outlined" style="font-size:34px" aria-hidden="true">monitoring</span>
        </div>
        <h2 class="text-xl font-black text-gray-900 mt-4">Ainda não há visitas para mostrar</h2>
        <p class="text-gray-600 max-w-md mx-auto mt-1.5">Este ecrã enche-se sozinho: cada pessoa que abre a sua loja e cada produto que ela vê passam a contar aqui. Os primeiros números aparecem minutos depois da primeira visita.</p>
        <ul class="mt-6 mb-6 space-y-2.5 text-left max-w-sm mx-auto">
          ${passo(1, products.length > 0, "Ter produtos no catálogo")}
          ${passo(2, publicada, "Publicar a loja")}
          ${passo(3, false, "Partilhar o endereço com os seus clientes")}
        </ul>
        <div class="flex flex-wrap items-center justify-center gap-3">
          ${publicada
            ? `<a href="${esc(ctx.storeUrl)}" target="_blank" rel="noopener" class="${BTN_PRIMARY}">${icon("open_in_new", "text-[18px]")} Abrir a minha loja<span class="sr-only"> (abre noutro separador)</span></a>`
            : `<a href="#/painel" class="${BTN_PRIMARY}">${icon("rocket_launch", "text-[18px]")} Publicar a loja</a>`}
          <a href="#/painel/produtos" class="${BTN_SECONDARY}">${icon("inventory_2", "text-[18px]")} Gerir produtos</a>
        </div>
      </div>`)}
      ${fonte}`);
    return;
  }

  const pintado = ctx.paint(`${cabecalho}
    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      ${statCard(0, "group", "Visitas (7 dias)", last7, deltaPill(last7, prev7), `${prev7} nos 7 dias anteriores`)}
      ${statCard(1, "calendar_month", "Visitas (30 dias)", a.visits30, "", `Média de ${String(mediaDia).replace(".", ",")} por dia`)}
      ${statCard(2, "visibility", "Produtos vistos (7 dias)", a.views7, "", `${a.views30} nos últimos 30 dias`)}
      ${statCard(3, "chat", "Encomendas por WhatsApp (7 dias)", wLast7, deltaPill(wLast7, wPrev7, "sem encomendas", "primeiras encomendas"), `${a.whatsapp30} nos últimos 30 dias`)}
    </section>
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6 items-start">
      <div class="xl:col-span-2 min-w-0">${chartCard}</div>
      <div class="min-w-0">${funilCard}</div>
    </div>
    ${topCard}
    ${fonte}`);
  if (!pintado) return;
  bindAnalises();

  /** Contagem crescente dos números e dica do gráfico. */
  function bindAnalises(): void {
    const app = document.getElementById("app");
    if (!app) return;
    fadeInImages(app);

    if (!reduceMotion) {
      app.querySelectorAll<HTMLElement>("[data-count-to]").forEach((el) => {
        const alvo = Number(el.dataset.countTo ?? "0");
        if (!Number.isFinite(alvo) || alvo <= 0) { el.textContent = String(alvo || 0); return; }
        const inicio = performance.now();
        const passo = (agora: number): void => {
          const p = Math.min(1, (agora - inicio) / 750);
          el.textContent = String(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
    }

    const plot = document.getElementById("ana-plot");
    const tip = document.getElementById("ana-tip");
    if (!plot || !tip) return;
    const esconder = (): void => { tip.style.opacity = "0"; tip.style.visibility = "hidden"; };
    const realce = (i: number): void => {
      plot.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot) => {
        dot.style.transform = dot.dataset.dot === String(i) ? "translate(-50%,50%) scale(1.7)" : "translate(-50%,50%)";
      });
    };
    plot.querySelectorAll<HTMLElement>("[data-day]").forEach((col) => {
      const mostrar = (): void => {
        const i = Number(col.dataset.day);
        const d = a.daily[i];
        if (!d) return;
        tip.innerHTML = `<span class="block text-[10px] font-semibold text-white/70 whitespace-nowrap">${esc(dayLong(d.date))}</span>
          <span class="block text-sm font-black whitespace-nowrap">${d.visits} visita(s)</span>
          <span class="block text-[10px] font-semibold text-white/70 whitespace-nowrap">${d.whatsapp} encomenda(s) por WhatsApp</span>`;
        tip.style.left = `${xOf(i).toFixed(2)}%`;
        tip.style.bottom = `calc(${(100 - yOf(d.visits)).toFixed(2)}% + 16px)`;
        tip.style.visibility = "visible";
        tip.style.opacity = "1";
        realce(i);
      };
      col.addEventListener("pointerenter", mostrar);
      col.addEventListener("focus", mostrar);
      col.addEventListener("click", mostrar);
      col.addEventListener("blur", esconder);
    });
    plot.addEventListener("pointerleave", () => { esconder(); realce(-1); });
  }
}
