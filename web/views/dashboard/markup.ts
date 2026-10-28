/**
 * HTML dos separadores do Dashboard do Dono — funções puras, dados → texto.
 *
 * Nenhuma destas funções consulta o Supabase, mexe no DOM ou guarda estado: o
 * separador (o ficheiro com o nome dele, nesta pasta) lê os dados, chama a
 * função e liga os eventos. Separar assim tem dois ganhos concretos: o mesmo
 * desenho serve dois sítios (o funil aparece no «Início» e nas «Análises»), e os
 * testes desenham este HTML a sério, com dados de exemplo, em vez de procurarem
 * texto no código-fonte (`tests/dashboardSections.test.ts`).
 *
 * Por isso só há `import type` dos módulos de `web/supabase/`: um import de
 * valor traria o cliente do Supabase, que exige as variáveis do browser.
 */
import { esc, formatKz } from "../../lib/dom.js";
import {
  ACCENT, ACCENT_INK, ACCENT_TINT, BTN_DANGER, BTN_GHOST, BTN_ICON_DANGER, BTN_LINK, BTN_PRIMARY, BTN_SECONDARY,
  BTN_SM, BTN_SM_DANGER, BTN_SM_PRIMARY, HINT, INPUT, LABEL, SPIN, type Tone,
  card, cardHead, comingSoonBadge, emptyState, field, fmtDate, fmtDateTime, fmtShortDate, icon, kzRound, notice,
  pill, plural, segmented,
} from "./ui.js";
import { PLAN_HIGHLIGHTS, PLAN_NAME, PLAN_PERIOD_DAYS, PLAN_PRICE_KZ, PLAN_UNIT_LABEL } from "../../../src/services/plans.js";
import type { BillingState, PublishDecision } from "../../../src/services/billing.js";
import { formatPhoneForDisplay } from "../../../src/services/phoneVerification.js";
import { COMING_SOON_LABELS, isComingSoon, type ComingSoonFeature } from "../../../src/services/comingSoon.js";
import {
  COMPANY_DOCUMENTS, DOCUMENT_MAX_BYTES, VERIFICATION_STATUS_LABEL, changeRequiresReview, formatIban, maskIban,
  type CompanyDocumentId, type VerificationError, type VerificationForm, type VerificationStatus,
} from "../../../src/services/paymentVerification.js";
import { canDeleteOrder, isValidAoPhone, normalizeAoPhone, orderEffectiveStatus } from "../../../src/services/payments.js";
import { PLATFORM_CONTACT_EMAIL } from "../../../src/services/domains.js";
import { PLATFORM_FEE_LABEL } from "../../../src/services/fees.js";
import { WA_DEFAULT_PHONE, resolveWaPhone } from "../../../src/services/storeCustom.js";
import { DELIVERY_PROVINCE, LUANDA_AREAS, deliveredAreas, type DeliveryConfig } from "../../lib/areas.js";
import type { DiscountCode, discountState } from "../../supabase/discounts.js";
import type { Review } from "../../supabase/reviews.js";
import type { OrderRow, OrderStats, PaymentVerification } from "../../supabase/payments.js";
import type { WhatsappOrderRow } from "../../supabase/whatsappOrders.js";
import type { WithdrawalRow } from "../../supabase/withdrawals.js";

/* ================================= Início ================================= */

/** Contagens do funil de compra, de um mesmo período. */
export interface FunnelCounts {
  visits: number;
  views: number;
  carts: number;
  whatsapp: number;
}

/** Os quatro passos do funil, pela ordem em que o cliente os percorre. */
export const FUNNEL_STEPS: readonly { key: keyof FunnelCounts; label: string; icon: string }[] = [
  { key: "visits", label: "Visitas", icon: "group" },
  { key: "views", label: "Produtos vistos", icon: "visibility" },
  { key: "carts", label: "Adições ao carrinho", icon: "add_shopping_cart" },
  { key: "whatsapp", label: "Encomendas por WhatsApp", icon: "chat" },
];

/**
 * Frase da conversão de visitas em encomendas, ou `""` quando não há base.
 *
 * Sem visitas não há percentagem que signifique algo. Também não se escreve
 * nada quando há mais encomendas do que visitas — acontece com quem encomenda
 * duas vezes na mesma visita — porque «150% das visitas» é uma conta certa a
 * dizer uma coisa errada.
 */
export function funnelConversion(c: FunnelCounts): string {
  if (c.visits <= 0 || c.whatsapp > c.visits) return "";
  if (c.whatsapp === 0) return "Nenhuma visita terminou ainda numa encomenda por WhatsApp.";
  const pct = (c.whatsapp / c.visits) * 100;
  return `${pct < 1 ? "Menos de 1%" : `${Math.round(pct)}%`} das visitas terminaram numa encomenda por WhatsApp.`;
}

/**
 * Funil de compra: os quatro passos, com o número e uma barra.
 *
 * As barras são relativas ao maior dos quatro números, e não à primeira linha:
 * uma visita costuma abrir vários produtos, e uma barra de «Produtos vistos» a
 * 250% da de «Visitas» sairia do cartão. As barras são decorativas — o número
 * está escrito ao lado.
 */
export function funnelHtml(c: FunnelCounts): string {
  const total = FUNNEL_STEPS.reduce((s, f) => s + c[f.key], 0);
  if (total === 0) {
    return `<div class="rounded-xl border border-dashed border-gray-300 px-5 py-8 text-center">
      <span class="text-gray-400">${icon("monitoring", "text-[28px]")}</span>
      <p class="mt-2 font-bold text-gray-900">Ainda sem movimento nos últimos 30 dias</p>
      <p class="mt-1 text-sm text-gray-500 max-w-sm mx-auto">Os números aparecem assim que alguém abrir a loja. Partilhe o endereço com os seus clientes para começar.</p>
    </div>`;
  }
  const max = Math.max(1, ...FUNNEL_STEPS.map((f) => c[f.key]));
  const rows = FUNNEL_STEPS.map((f, i) => {
    const v = c[f.key];
    const largura = v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0;
    return `<li class="flex items-center gap-3" data-funnel-step="${esc(f.key)}">
      <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}">${icon(f.icon)}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-sm font-semibold text-gray-800 truncate">${esc(f.label)}</span>
          <span class="text-base font-black text-gray-900 tabular-nums">${v}</span>
        </div>
        <div class="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
          <div class="h-full rounded-full" style="width:${largura}%;background:${ACCENT};opacity:${(1 - i * 0.18).toFixed(2)}"></div>
        </div>
      </div>
    </li>`;
  }).join("");
  const taxa = funnelConversion(c);
  return `<ol class="space-y-4">${rows}</ol>
    ${taxa ? `<p class="mt-5 text-sm text-gray-600 flex items-start gap-2"><span style="color:${ACCENT}">${icon("insights", "text-[18px]")}</span><span>${esc(taxa)}</span></p>` : ""}`;
}

/**
 * A loja tem um número de WhatsApp dela?
 *
 * `resolveWaPhone` nunca devolve vazio: sem número, devolve o predefinido da
 * plataforma — que é um número angolano válido e, por isso, não pode contar como
 * «indicado pelo Dono».
 */
export function whatsappConfigured(custom: unknown): boolean {
  const phone = resolveWaPhone(custom);
  return phone !== WA_DEFAULT_PHONE && isValidAoPhone(phone);
}

/** Número a mostrar no campo do WhatsApp: vazio quando a loja ainda usa o predefinido. */
export function whatsappPrefill(custom: unknown): string {
  const phone = resolveWaPhone(custom);
  return phone === WA_DEFAULT_PHONE ? "" : phone;
}

/** A loja definiu onde entrega (pelo menos uma área com taxa)? */
export function deliveryConfigured(d: DeliveryConfig | undefined): boolean {
  return deliveredAreas(d).length > 0;
}

/** O que os «Próximos passos» precisam de saber da loja. Tudo dados reais. */
export interface StepsInput {
  products: number;
  hasLogo: boolean;
  whatsappOk: boolean;
  deliveryOk: boolean;
  published: boolean;
  accessActive: boolean;
  verification: VerificationStatus;
}

/** Um passo da lista. */
export interface NextStep {
  id: "produtos" | "personalizar" | "whatsapp" | "entrega" | "publicar" | "empresa";
  title: string;
  text: string;
  done: boolean;
  optional: boolean;
  /** Onde se faz. `null` quando a ação é o botão de publicar desta página. */
  href: string | null;
  cta: string;
  /** Estado intermédio (ex.: «Em análise»), nem feito nem por fazer. */
  status: string | null;
}

/**
 * Os «Próximos passos», calculados a partir do estado real da loja.
 *
 * Cada passo leva ao sítio onde se faz. O da subscrição muda de destino
 * conforme o que falta: sem subscrição vai ao «Plano»; com ela, é o próprio
 * botão de publicar.
 */
export function nextSteps(i: StepsInput): NextStep[] {
  const publicar = i.accessActive
    ? { href: null, cta: "Publicar a loja" }
    : { href: "#/painel/plano", cta: "Ativar a subscrição" };
  return [
    {
      id: "produtos", title: "Adicionar produtos",
      text: i.products > 0 ? `${plural(i.products, "produto", "produtos")} no catálogo.` : "Acrescente o que vende, com foto e preço.",
      done: i.products > 0, optional: false, href: "#/painel/produtos", cta: "Adicionar produtos", status: null,
    },
    {
      id: "personalizar", title: "Personalizar a loja",
      text: "Carregue o logótipo e ajuste as cores, os textos e as fotografias no editor.",
      done: i.hasLogo, optional: false, href: "#/personalizar", cta: "Abrir o editor", status: null,
    },
    {
      id: "whatsapp", title: "Número de WhatsApp",
      text: "É para este número que chegam as encomendas dos clientes.",
      done: i.whatsappOk, optional: false, href: "#/painel/pagamentos", cta: "Indicar o número", status: null,
    },
    {
      id: "entrega", title: "Taxa de entrega",
      text: `Defina quanto cobra pela entrega em ${DELIVERY_PROVINCE}.`,
      done: i.deliveryOk, optional: false, href: "#/painel/entregas", cta: "Definir a taxa", status: null,
    },
    {
      id: "publicar", title: "Ativar a subscrição e publicar",
      text: !i.accessActive
        ? "Publicar exige a subscrição ativa."
        : i.published ? "A loja está publicada." : "A subscrição está ativa: falta publicar a loja.",
      done: i.accessActive && i.published, optional: false, ...publicar, status: null,
    },
    {
      id: "empresa", title: "Verificar a empresa para pagamentos digitais",
      text: "Para empresas registadas: receber por Multicaixa Express e Referência Bancária.",
      done: i.verification === "approved", optional: true, href: "#/painel/pagamentos",
      cta: i.verification === "rejected" ? "Corrigir os dados" : "Enviar os dados",
      status: i.verification === "pending" || i.verification === "rejected" ? VERIFICATION_STATUS_LABEL[i.verification] : null,
    },
  ];
}

/**
 * «Próximos passos», compactos: a contagem, uma barra fina e só o que falta,
 * uma linha por passo. Cada linha é a própria ação (leva ao sítio onde se faz) e
 * a frase de apoio fica no `title`. Os feitos contam na barra e saem da lista:
 * era a lista inteira, com um parágrafo por passo, que ocupava o ecrã.
 */
export function nextStepsHtml(steps: readonly NextStep[]): string {
  const obrigatorios = steps.filter((s) => !s.optional);
  const feitos = obrigatorios.filter((s) => s.done).length;
  const pct = Math.round((feitos / Math.max(1, obrigatorios.length)) * 100);
  const pronto = feitos === obrigatorios.length;
  const linha = "group w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 transition-colors";
  const itens = steps.map((s, i) => {
    if (s.done) return "";
    const marca = `<span class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 border-gray-200 text-[11px] font-black text-gray-500">${i + 1}<span class="sr-only">. Por fazer:</span></span>`;
    const etiquetas = `${s.optional ? `<span class="text-xs text-gray-400 shrink-0">Opcional</span>` : ""}${s.status ? pill(s.status, s.status === VERIFICATION_STATUS_LABEL.rejected ? "danger" : "info") : ""}`;
    const corpo = `${marca}<span class="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">${esc(s.title)}</span>${etiquetas}`;
    const seta = `<span class="text-gray-300 group-hover:text-gray-500 shrink-0">${icon("chevron_right", "text-[18px]")}</span>`;
    // Em análise não há nada a fazer: o pedido está nas mãos da MôBisno.
    const acao = s.status === VERIFICATION_STATUS_LABEL.pending
      ? `<div class="flex items-center gap-3 px-2 py-2" title="${esc(s.text)}">${corpo}</div>`
      : s.href
        ? `<a href="${esc(s.href)}" title="${esc(s.text)}" class="${linha}">${corpo}${seta}</a>`
        : `<button type="button" data-step-publish title="${esc(s.text)}" class="${linha}">${corpo}${seta}</button>`;
    return `<li data-step="${esc(s.id)}" data-done="false">${acao}</li>`;
  }).join("");
  return `<div class="mt-3 flex items-center justify-between gap-3 flex-wrap">
      <p class="text-xs font-semibold text-gray-600">${feitos} de ${obrigatorios.length} passos feitos</p>
      ${pronto ? pill("A loja está pronta a vender", "success", "check_circle") : ""}
    </div>
    <div class="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-label="Passos feitos" aria-valuemin="0" aria-valuemax="${obrigatorios.length}" aria-valuenow="${feitos}">
      <div class="h-full rounded-full" style="width:${pct}%;background:${ACCENT}"></div>
    </div>
    ${itens ? `<ul class="mt-2 -mx-2">${itens}</ul>` : ""}`;
}

/**
 * O «Início» de uma loja que ainda não tem nada: nem produtos, nem encomendas,
 * nem uma única visita.
 *
 * Substitui a grelha dos três cartões, que nesse estado eram **três caixas a
 * dizer que não havia nada** — encomendas vazias, funil vazio — com a única
 * coisa que importava, a lista do que falta fazer, reduzida a uma coluna fina à
 * direita, com setas que não se leem como botões.
 *
 * Aqui os passos são o ecrã: cada um com o que é, porque serve, e um botão. O
 * primeiro que falta leva o botão principal — há sempre uma próxima coisa
 * óbvia. Os que já estão feitos ficam à vista, apagados: mostram o caminho
 * percorrido e o que ainda vem.
 */
export function onboardingHtml(o: { storeName: string; steps: readonly NextStep[] }): string {
  const obrigatorios = o.steps.filter((s) => !s.optional);
  const feitos = obrigatorios.filter((s) => s.done).length;
  const pct = Math.round((feitos / Math.max(1, obrigatorios.length)) * 100);
  const primeiroPorFazer = o.steps.find((s) => !s.done && !s.optional)?.id ?? null;

  const itens = o.steps.map((s, i) => {
    const principal = s.id === primeiroPorFazer;
    const marca = s.done
      ? `<span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style="background:#ecfdf5;color:#047857">${icon("check", "text-[20px]")}<span class="sr-only">Feito:</span></span>`
      : `<span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${principal ? "text-white" : "border-2 border-gray-200 text-gray-600"} text-sm font-black" ${principal ? `style="background:${ACCENT}"` : ""}>${i + 1}<span class="sr-only">. Por fazer:</span></span>`;
    const etiquetas = `${s.optional ? ` ${pill("Opcional", "neutral")}` : ""}${s.status ? ` ${pill(s.status, s.status === VERIFICATION_STATUS_LABEL.rejected ? "danger" : "info")}` : ""}`;
    // Em análise não há nada a fazer: o pedido está nas mãos da MôBisno.
    const acao = s.done || s.status === VERIFICATION_STATUS_LABEL.pending
      ? ""
      : s.href
        ? `<a href="${esc(s.href)}" class="${principal ? BTN_PRIMARY : BTN_SECONDARY}">${esc(s.cta)} ${icon("arrow_forward", "text-[18px]")}</a>`
        : `<button type="button" data-step-publish class="${principal ? BTN_PRIMARY : BTN_SECONDARY}">${esc(s.cta)} ${icon("arrow_forward", "text-[18px]")}</button>`;
    return `<li class="py-4 flex flex-col sm:flex-row sm:items-center gap-3" data-step="${esc(s.id)}" data-done="${s.done ? "true" : "false"}">
      <div class="flex items-start gap-3 min-w-0 flex-1">
        ${marca}
        <div class="min-w-0">
          <p class="text-sm font-bold ${s.done ? "text-gray-500" : "text-gray-900"} flex items-center gap-1.5 flex-wrap">${esc(s.title)}${etiquetas}</p>
          <p class="mt-0.5 text-sm text-gray-600">${esc(s.text)}</p>
        </div>
      </div>
      ${acao ? `<div class="shrink-0 sm:ml-4 pl-11 sm:pl-0">${acao}</div>` : ""}
    </li>`;
  }).join("");

  return card(`
    <div class="flex items-start gap-3">
      <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}">${icon("rocket_launch", "text-[24px]")}</span>
      <div class="min-w-0">
        <h2 class="text-lg font-black tracking-tight text-gray-900 break-words">Vamos pôr a ${esc(o.storeName)} a vender</h2>
        <p class="mt-0.5 text-sm text-gray-600">${feitos === 0
          ? "Comece pelos produtos. Leva poucos minutos e é o que a loja precisa para abrir."
          : `${feitos} de ${obrigatorios.length} passos feitos. Falta pouco.`}</p>
      </div>
    </div>
    <div class="mt-4 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-label="Passos feitos" aria-valuemin="0" aria-valuemax="${obrigatorios.length}" aria-valuenow="${feitos}">
      <div class="h-full rounded-full" style="width:${pct}%;background:${ACCENT}"></div>
    </div>
    <ul class="mt-2 divide-y divide-gray-100">${itens}</ul>
    <p class="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500 flex items-start gap-2">
      <span class="text-gray-400 shrink-0">${icon("chat", "text-[18px]")}</span>
      <span>As encomendas e as vendas aparecem aqui, neste ecrã, assim que o primeiro cliente comprar.</span>
    </p>`);
}

/** Estado da subscrição desta loja, numa frase. A ligação para o «Plano» fica com quem a mostra. */
export function subscriptionLine(b: BillingState): string {
  if (b.byAdmin) return "Conta de administração: publica sem subscrição.";
  if (b.accessActive) {
    const data = fmtDate(b.expiresAt);
    return data ? `Subscrição desta loja ativa até ${esc(data)}.` : "Subscrição desta loja ativa.";
  }
  return b.expired ? "A subscrição desta loja caducou." : "Esta loja não tem subscrição ativa.";
}

/** O que o cartão do estado da loja precisa. */
export interface StoreStatusInput {
  state: "Publicada" | "Rascunho";
  billing: BillingState;
  /**
   * Resultado de `canPublishStore(billing, phoneVerified)`. É a decisão
   * inteira, e não só o `allowed`, porque a frase depende do que falta: pagar a
   * subscrição e confirmar o telemóvel resolvem-se em sítios diferentes.
   */
  publish: PublishDecision;
  storeUrl: string;
  previewUrl: string;
  /**
   * Loja ainda sem nada: a faixa encolhe e **todas** as ações passam para o
   * cartão dos passos (`onboardingHtml`).
   *
   * Sem isto havia três instruções diferentes no mesmo ecrã — «falta prepará-la»,
   * «ative a subscrição para publicar» e «comece pelos produtos» — e o elemento
   * mais vistoso era um botão laranja **desligado**. Um ecrã com uma ação
   * principal não pode ter essa ação indisponível.
   */
  onboarding?: boolean;
}

/**
 * Aviso de que falta confirmar o telemóvel da conta.
 *
 * Aparece no «Início» de quem escolheu «Não recebi o código» no assistente de
 * criação. É um cartão e não uma linha porque é a única coisa que separa a loja
 * de poder ir para o ar — e porque o Dono saiu do assistente sem perceber
 * necessariamente o que ficou pendente.
 */
export function phoneNoticeHtml(o: { phone: string | null }): string {
  const numero = o.phone ? formatPhoneForDisplay(o.phone) : "";
  return card(`${notice(
    "warning",
    "phone_iphone",
    "Confirme o seu telemóvel",
    numero
      ? `Enviamos um código por SMS para ${numero}. Enquanto o número não estiver confirmado, a loja não pode ser publicada.`
      : "Enviamos um código por SMS. Enquanto o número não estiver confirmado, a loja não pode ser publicada.",
    `<button type="button" id="verify-phone-card" class="${BTN_PRIMARY} mt-3">${icon("sms", "text-[18px]")} Confirmar o número</button>`,
  )}`);
}

/**
 * Estado da loja numa faixa só: Publicada ou Rascunho, o endereço, a
 * subscrição desta loja e a ação de publicar.
 *
 * Era um cartão alto, com um parágrafo por estado, que empurrava as encomendas
 * para baixo do ecrã. Publicar está sujeito a `canPublishStore`: sem
 * subscrição, o botão aparece desligado e a linha do endereço diz porquê e onde
 * se resolve. Esconder o botão deixava o Dono à procura dele.
 */
export function storeStatusHtml(o: StoreStatusInput): string {
  const publicada = o.state === "Publicada";
  const noAr = publicada && o.billing.accessActive;
  const estado = publicada ? pill("Publicada", "success", "public") : pill("Rascunho", "neutral", "edit_note");
  const frase = noAr
    ? "A loja está no ar."
    : publicada
      ? "Publicada, mas fora do ar: a subscrição desta loja não está ativa."
      : "Ainda só você a vê.";
  const destino = noAr ? o.storeUrl : o.previewUrl;
  const endereco = o.storeUrl.replace(/^https?:\/\//, "");
  const semPlano = !o.billing.accessActive && !o.billing.byAdmin;
  // Cada impedimento diz onde se resolve. «Não podes publicar» sem dizer
  // porquê deixava o Dono a procurar o botão que falta.
  const porQue = o.publish.reason === "telefone-por-confirmar"
    ? `<span id="publish-why">Confirme o número de telemóvel para publicar. <button type="button" id="verify-phone" class="${BTN_LINK}">Confirmar agora</button></span>`
    : `<span id="publish-why">Ative a subscrição para publicar. <a href="#/painel/plano" class="${BTN_LINK}">Ver o plano</a></span>`;
  const subscricao = !publicada && !o.publish.allowed
    ? porQue
    : `<span>${subscriptionLine(o.billing)}${semPlano ? ` <a href="#/painel/plano" class="${BTN_LINK}">${o.billing.expired ? "Renovar" : "Ver o plano"}</a>` : ""}</span>`;
  const acao = publicada
    ? `<button type="button" id="toggle-state" data-next="Rascunho" class="${BTN_SECONDARY}">${icon("visibility_off", "text-[18px]")} Despublicar</button>`
    : o.publish.allowed
      ? `<button type="button" id="toggle-state" data-next="Publicada" class="${BTN_PRIMARY}">${icon("rocket_launch", "text-[18px]")} Publicar a loja</button>`
      : `<button type="button" disabled aria-describedby="publish-why" class="${BTN_PRIMARY}">${icon("lock", "text-[18px]")} Publicar a loja</button>`;

  /*
   * Loja sem nada: uma linha e nada mais. O estado, o que isso significa, e o
   * endereço que abre a pré-visualização. Zero botões — publicar, copiar e
   * pré-visualizar vivem no cartão dos passos e no cabeçalho, e repeti-los aqui
   * era o que fazia o ecrã parecer cheio sem dizer mais nada.
   */
  if (o.onboarding) {
    return `<section aria-label="Estado da loja" class="rounded-2xl border border-gray-200 bg-white px-4 py-3 md:px-5 flex items-center gap-3">
      <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}">${icon("storefront", "text-[20px]")}</span>
      <div class="min-w-0">
        <p class="flex items-center gap-2 flex-wrap">${estado}<span class="text-sm text-gray-700">${esc(frase)}</span></p>
        <a href="${esc(o.previewUrl)}" target="_blank" rel="noopener" class="text-xs font-bold break-all hover:underline" style="color:${ACCENT_INK}">${esc(endereco)}<span class="sr-only"> (pré-visualizar, noutro separador)</span></a>
      </div>
    </section>`;
  }

  return `<section aria-label="Estado da loja" class="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 md:px-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}">${icon("storefront")}</span>
      <div class="min-w-0">
        <p class="flex items-center gap-2 flex-wrap">${estado}<span class="text-sm text-gray-700">${esc(frase)}</span></p>
        <p class="mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs text-gray-500 min-w-0">
          <a href="${esc(destino)}" target="_blank" rel="noopener" class="text-sm font-bold break-all hover:underline" style="color:${ACCENT_INK}">${esc(endereco)}<span class="sr-only"> (abre noutro separador)</span></a>
          <span aria-hidden="true" class="text-gray-300">·</span>
          ${subscricao}
        </p>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2 shrink-0">
      <button type="button" id="copy-url" class="${BTN_GHOST}">${icon("content_copy", "text-[18px]")} Copiar</button>
      <a href="${esc(destino)}" target="_blank" rel="noopener" class="${BTN_GHOST}">${icon(noAr ? "open_in_new" : "visibility", "text-[18px]")} ${noAr ? "Abrir" : "Pré-visualizar"}<span class="sr-only"> (abre noutro separador)</span></a>
      ${acao}
    </div>
  </section>`;
}

/* ============================ Taxa de entrega ============================ */

export type DeliveryMode = "single" | "perArea";

/** Modo gravado. Lojas antigas sem `mode` contam pelo campo que têm. */
export function deliveryModeOf(d: DeliveryConfig | undefined): DeliveryMode {
  return d?.mode ?? (d?.flatFee != null ? "single" : "perArea");
}

/** Taxa por extenso: zero é «grátis», não «0 Kz». */
function feeText(v: number): string {
  return v === 0 ? "grátis" : kzRound(v);
}

/** Uma área de Luanda: caixa para dizer «entrego aqui» e a taxa ao lado. */
function areaRowHtml(area: string, fee: number | undefined, i: number): string {
  const on = typeof fee === "number";
  const id = `area-${i}`;
  return `<div class="mb-area flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2" data-area="${esc(area)}">
    <input id="${id}-on" data-a-on type="checkbox" ${on ? "checked" : ""} class="w-4 h-4 rounded border-gray-300 text-[#F95901] focus:ring-[#F95901] shrink-0" />
    <label for="${id}-on" class="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate cursor-pointer select-none">${esc(area)}</label>
    <label for="${id}-fee" class="sr-only">Taxa de entrega em ${esc(area)}, em Kz</label>
    <input id="${id}-fee" data-a-fee type="number" inputmode="decimal" min="0" step="any" value="${on ? esc(fee) : ""}" placeholder="Kz" ${on ? "" : "disabled"} class="w-24 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:border-[#F95901] focus:ring-2 focus:ring-[#F95901]/20 aria-[invalid=true]:border-red-500 disabled:bg-gray-50 disabled:text-gray-400" />
  </div>`;
}

/**
 * Editor da taxa de entrega: «Valor único» ou «Por área», mais a entrega grátis.
 *
 * Os dois modos estão sempre no HTML e o escondido é só escondido: trocar de
 * modo e voltar não apaga o que o Dono já tinha escrito no outro.
 */
export function deliveryEditorHtml(d: DeliveryConfig | undefined): string {
  const mode = deliveryModeOf(d);
  const fees = d?.fees ?? {};
  return `<div class="space-y-6">
    <div>
      <p class="${LABEL}">Como cobra a entrega</p>
      <div class="mt-2">${segmented("dmode", [{ value: "single", label: "Valor único" }, { value: "perArea", label: "Por área" }], mode, "Como cobra a entrega")}</div>
    </div>
    <div id="del-single" class="${mode === "single" ? "" : "hidden"} max-w-sm">
      ${field({
        id: "del-flat", label: "Taxa de entrega (todas as áreas)", type: "number", value: d?.flatFee != null ? String(d.flatFee) : "",
        placeholder: "Valor em Kz", hint: "O cliente escolhe a área para a morada, mas paga o mesmo em todas. 0 = entrega grátis.",
        attrs: 'inputmode="decimal" min="0" step="any"',
      })}
    </div>
    <fieldset id="del-perarea" class="${mode === "perArea" ? "" : "hidden"}">
      <legend class="${LABEL}">Áreas de ${esc(DELIVERY_PROVINCE)} onde entrega</legend>
      <p class="${HINT}">Marque as áreas que serve e escreva a taxa de cada uma (0 = grátis). As áreas por marcar não aparecem ao cliente.</p>
      <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        ${LUANDA_AREAS.map((a, i) => areaRowHtml(a, typeof fees[a] === "number" ? fees[a] : undefined, i)).join("")}
      </div>
      <p id="del-areas-err" class="mt-2 text-xs font-semibold text-red-700 hidden"></p>
    </fieldset>
    <div class="max-w-sm">
      ${field({
        id: "del-free", label: "Entrega grátis acima de (Kz)", type: "number", value: d?.freeAbove != null ? String(d.freeAbove) : "",
        placeholder: "Valor em Kz", optional: true,
        hint: "Encomendas com subtotal igual ou acima deste valor não pagam entrega.",
        attrs: 'inputmode="decimal" min="0" step="any"',
      })}
    </div>
  </div>`;
}

/** O que o Dono escreveu no editor, ainda por validar. */
export interface DeliveryDraft {
  mode: DeliveryMode;
  flat: string;
  free: string;
  areas: readonly { area: string; on: boolean; fee: string }[];
}

/** Valor em Kz escrito pelo Dono: `null` se vazio, `"invalid"` se não for um número ≥ 0. */
function readAmount(raw: string): number | null | "invalid" {
  const t = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/** Resultado da validação do editor. */
export type DeliveryResult =
  | { ok: true; value: DeliveryConfig }
  | { ok: false; errors: Partial<Record<"flat" | "free" | "areas", string>>; badAreas: string[] };

/**
 * Valida o editor e devolve `custom.delivery` **na forma de sempre** — é a que o
 * checkout e o servidor leem: `{ mode: "single", flatFee, freeAbove }` ou
 * `{ mode: "perArea", fees, freeAbove }`, com `freeAbove` ausente quando não há.
 *
 * Devolve todos os erros de uma vez, como o resto dos formulários do painel.
 */
export function buildDelivery(d: DeliveryDraft): DeliveryResult {
  const errors: Partial<Record<"flat" | "free" | "areas", string>> = {};
  const badAreas: string[] = [];
  const free = readAmount(d.free);
  if (free === "invalid") errors.free = "Escreva um valor em Kz, ou deixe vazio.";
  const freeAbove = typeof free === "number" && free > 0 ? free : undefined;

  if (d.mode === "single") {
    const flat = readAmount(d.flat);
    if (flat === null) errors.flat = "Indique a taxa de entrega (0 se for grátis).";
    else if (flat === "invalid") errors.flat = "A taxa tem de ser um valor em Kz igual ou maior que zero.";
    if (Object.keys(errors).length || typeof flat !== "number") return { ok: false, errors, badAreas };
    return { ok: true, value: { mode: "single", flatFee: flat, freeAbove } };
  }

  const fees: Record<string, number> = {};
  for (const a of d.areas) {
    if (!a.on) continue;
    const fee = readAmount(a.fee);
    if (typeof fee === "number") fees[a.area] = fee;
    else badAreas.push(a.area);
  }
  if (!d.areas.some((a) => a.on)) errors.areas = "Marque pelo menos uma área onde entrega, ou escolha «Valor único».";
  else if (badAreas.length) errors.areas = `Escreva a taxa de ${badAreas.join(", ")} (0 se for grátis).`;
  if (Object.keys(errors).length) return { ok: false, errors, badAreas };
  return { ok: true, value: { mode: "perArea", fees, freeAbove } };
}

/** Resumo do que está gravado, como o cliente o vai encontrar no checkout. */
export function deliverySummaryHtml(d: DeliveryConfig | undefined): string {
  const areas = deliveredAreas(d);
  if (!areas.length) {
    return `<p class="text-sm text-gray-700">Ainda não definiu a taxa de entrega.</p>
      <p class="${HINT}">Depois de guardar, o resumo aparece aqui.</p>`;
  }
  const linhas: string[] = [];
  if (deliveryModeOf(d) === "single") {
    linhas.push(`Valor único: <strong>${esc(feeText(areas[0]!.fee))}</strong> em todas as áreas de ${esc(DELIVERY_PROVINCE)}.`);
  } else {
    const valores = areas.map((a) => a.fee);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    linhas.push(`Entrega em <strong>${esc(plural(areas.length, "área", "áreas"))}</strong>, ${min === max ? `por ${esc(feeText(min))}` : `de ${esc(feeText(min))} a ${esc(feeText(max))}`}.`);
  }
  if (d?.freeAbove && d.freeAbove > 0) linhas.push(`Grátis em encomendas a partir de <strong>${esc(kzRound(d.freeAbove))}</strong>.`);
  const lista = deliveryModeOf(d) === "perArea"
    ? `<ul class="mt-4 divide-y divide-gray-100 text-sm">${areas.map((a) => `<li class="flex items-center justify-between gap-3 py-1.5"><span class="text-gray-700">${esc(a.name)}</span><span class="font-semibold text-gray-900 tabular-nums">${esc(feeText(a.fee))}</span></li>`).join("")}</ul>`
    : "";
  return `<ul class="space-y-2 text-sm text-gray-700">${linhas.map((l) => `<li class="flex items-start gap-2"><span class="text-emerald-600 mt-0.5">${icon("check_circle", "text-[16px]")}</span><span>${l}</span></li>`).join("")}</ul>${lista}`;
}

/* =========================== Código de desconto =========================== */

/** Estado de um código, tal como `discountState` o decide. */
export type DiscountStateId = ReturnType<typeof discountState>;

/** Rótulo e tom de cada estado. */
export const DISCOUNT_STATE: Readonly<Record<DiscountStateId, { label: string; tone: Tone }>> = {
  ativo: { label: "Ativo", tone: "success" },
  inativo: { label: "Inativo", tone: "neutral" },
  caducado: { label: "Caducado", tone: "warning" },
  esgotado: { label: "Esgotado", tone: "danger" },
};

/** «10%» ou «2.500 Kz». */
export function discountValueText(d: Pick<DiscountCode, "type" | "value">): string {
  return d.type === "percent" ? `${d.value}%` : kzRound(d.value);
}

/** «3 de 10 usos» ou «3 usos · sem limite». */
export function discountUsageText(d: Pick<DiscountCode, "uses" | "maxUses">): string {
  return d.maxUses != null ? `${d.uses} de ${plural(d.maxUses, "uso", "usos")}` : `${plural(d.uses, "uso", "usos")} · sem limite`;
}

/** Formulário de criação. `minDate` é o dia de hoje (AAAA-MM-DD), para o calendário não oferecer o passado. */
export function discountFormHtml(minDate: string): string {
  return `<form id="dc-form" novalidate class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
    ${field({
      id: "dc-code", label: "Código", placeholder: "ex.: BEMVINDO10",
      hint: "Letras, algarismos, hífen ou sublinhado. O cliente escreve-o no checkout.",
      attrs: 'autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" style="text-transform:uppercase"',
    })}
    <div class="min-w-0">
      <label for="dc-type" class="${LABEL}">Tipo</label>
      <select id="dc-type" class="${INPUT} mt-1.5">
        <option value="percent">Percentagem</option>
        <option value="fixed">Valor fixo</option>
      </select>
    </div>
    ${field({
      id: "dc-value", label: "Valor", type: "number", placeholder: "ex.: 10",
      labelExtra: ` <span id="dc-value-unit" class="font-normal text-gray-500">(%)</span>`,
      attrs: 'inputmode="decimal" min="1" step="any"',
    })}
    ${field({
      id: "dc-max", label: "Limite de usos", type: "number", optional: true, placeholder: "Sem limite",
      hint: "Vazio = pode ser usado sem limite.", attrs: 'inputmode="numeric" min="1" step="1"',
    })}
    ${field({
      id: "dc-until", label: "Válido até", type: "date", optional: true,
      hint: "Vazio = sem data-limite. O código vale até ao fim desse dia.", attrs: `min="${esc(minDate)}"`,
    })}
    <div class="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3 pt-1">
      <button type="submit" id="dc-add" class="${BTN_PRIMARY}">${icon("add", "text-[18px]")} Criar código</button>
      <p id="dc-error" role="alert" class="text-sm font-semibold text-red-700"></p>
    </div>
  </form>`;
}

/** Lista dos códigos, com o estado de cada um (de `discountState`). */
export function discountListHtml(items: readonly { code: DiscountCode; state: DiscountStateId }[]): string {
  if (!items.length) {
    return emptyState({
      icon: "sell", title: "Ainda não criou nenhum código",
      text: "Crie o primeiro acima: por exemplo, BEMVINDO10 com 10% de desconto para quem compra pela primeira vez.",
    });
  }
  return `<ul class="divide-y divide-gray-100">${items.map(({ code: d, state }) => {
    const st = DISCOUNT_STATE[state];
    const validade = d.expiresAt ? `Válido até ${fmtShortDate(d.expiresAt)}` : "Sem data-limite";
    return `<li class="py-4 flex flex-col sm:flex-row sm:items-center gap-3" data-dc-row="${esc(d.id)}">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="font-mono font-black text-sm px-2.5 py-1 rounded-lg shrink-0" style="background:#fff4ed;color:${ACCENT_INK}">${esc(d.code)}</span>
        <div class="min-w-0">
          <p class="text-sm font-bold text-gray-900">${esc(discountValueText(d))} de desconto</p>
          <p class="text-xs text-gray-500">${esc(discountUsageText(d))} · ${esc(validade)}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${pill(st.label, st.tone)}
        <button type="button" data-dc-toggle="${esc(d.id)}" class="${BTN_SM}">${d.active ? "Desativar" : "Ativar"}</button>
        <button type="button" data-dc-del="${esc(d.id)}" aria-label="Apagar o código ${esc(d.code)}" title="Apagar" class="${BTN_ICON_DANGER}">${icon("delete")}</button>
      </div>
    </li>`;
  }).join("")}</ul>`;
}

/* =============================== Avaliações =============================== */

/** Estrelas com o valor dito por palavras (o leitor de ecrã não lê «★★★★☆»). */
function stars(n: number): string {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return `<span role="img" aria-label="${v} de 5 estrelas" class="tracking-tight" style="color:#d97706">${"★".repeat(v)}${"☆".repeat(5 - v)}</span>`;
}

function reviewItemHtml(r: Review, productName: string): string {
  const acao = r.approved
    ? `<button type="button" data-rv-hide="${esc(r.id)}" class="${BTN_SM}">${icon("visibility_off", "text-[16px]")} Esconder</button>`
    : `<button type="button" data-rv-approve="${esc(r.id)}" class="${BTN_SM_PRIMARY}">${icon("check", "text-[16px]")} Aprovar</button>`;
  return `<li class="py-4" data-rv-row="${esc(r.id)}">
    <div class="flex flex-col sm:flex-row sm:items-start gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-bold text-gray-900">${esc(r.author || "Cliente")}</span>
          ${stars(r.rating)}
        </div>
        <p class="text-xs text-gray-500 mt-0.5">${esc(productName)}${r.createdAt ? ` · ${esc(fmtShortDate(r.createdAt))}` : ""}</p>
        ${r.comment
          ? `<p class="mt-2 text-sm text-gray-700 whitespace-pre-line break-words">${esc(r.comment)}</p>`
          : `<p class="mt-2 text-sm text-gray-500 italic">Sem comentário.</p>`}
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${acao}
        <button type="button" data-rv-del="${esc(r.id)}" class="${BTN_SM_DANGER}">${icon("delete", "text-[16px]")} Apagar</button>
      </div>
    </div>
  </li>`;
}

/**
 * Moderação: as avaliações por aprovar primeiro, depois as publicadas.
 *
 * A base de dados só guarda «aprovada ou não»: uma avaliação escondida volta a
 * estar «por aprovar», e é aprovável outra vez com o mesmo botão.
 */
export function reviewsHtml(items: readonly Review[], productNames: ReadonlyMap<string, string>): string {
  if (!items.length) {
    return card(emptyState({
      icon: "reviews", title: "Ainda não há avaliações",
      text: "Quando um cliente avaliar um produto, a avaliação aparece aqui para a aprovar.",
    }));
  }
  const nome = (r: Review): string => productNames.get(r.productId) ?? "Produto removido";
  const pendentes = items.filter((r) => !r.approved);
  const publicadas = items.filter((r) => r.approved);
  return `<div class="space-y-6">
    ${card(`${cardHead({ icon: "pending_actions", title: "Por aprovar", subtitle: "Ainda não aparecem na loja.", aside: pill(`${pendentes.length} por aprovar`, pendentes.length ? "warning" : "neutral") })}
      ${pendentes.length
        ? `<ul class="mt-2 divide-y divide-gray-100">${pendentes.map((r) => reviewItemHtml(r, nome(r))).join("")}</ul>`
        : `<p class="mt-4 text-sm text-gray-500">Nada por aprovar. As avaliações novas aparecem aqui.</p>`}`)}
    ${card(`${cardHead({ icon: "verified", title: "Publicadas", subtitle: "Visíveis na página de cada produto.", aside: pill(`${publicadas.length}`, "neutral") })}
      ${publicadas.length
        ? `<ul class="mt-2 divide-y divide-gray-100">${publicadas.map((r) => reviewItemHtml(r, nome(r))).join("")}</ul>`
        : `<p class="mt-4 text-sm text-gray-500">Ainda não aprovou nenhuma avaliação.</p>`}`)}
  </div>`;
}

/* =============================== Pagamentos =============================== */

/** Cartão do WhatsApp: sempre ativo, só o número se configura. */
export function whatsappCardHtml(phone: string): string {
  return card(`
    ${cardHead({ icon: "chat", title: "WhatsApp", subtitle: "Encomendas por WhatsApp", aside: pill("Sempre ativo", "success", "check_circle") })}
    <p class="mt-4 text-sm text-gray-700">Todas as lojas vendem por WhatsApp: o cliente envia a encomenda para este número e combinam o pagamento e a entrega.</p>
    <form id="wa-form" novalidate class="mt-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div class="flex-1 min-w-0">${field({
        id: "wa-phone", label: "Número de WhatsApp", type: "tel", value: phone, placeholder: "9XX XXX XXX",
        hint: "Número angolano, com ou sem +244.", attrs: 'inputmode="tel" autocomplete="tel"',
      })}</div>
      <button type="submit" id="save-wa" class="${BTN_PRIMARY} sm:mt-7">${icon("save", "text-[18px]")} Guardar</button>
    </form>`);
}

/**
 * Número angolano no formato gravado desde sempre em `whatsapp.phone`
 * («+244 9XX XXX XXX»), a partir do que o Dono escreveu.
 *
 * Sem o indicativo, «923 456 789» ia parar ao `wa.me/923456789` — que não é o
 * número de ninguém. Quem chama valida antes com `isValidAoPhone`.
 */
export function formatAoPhone(raw: string): string {
  const d = normalizeAoPhone(raw);
  return /^2449\d{8}$/.test(d) ? `+244 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : raw.trim();
}

/** Resumo dos erros do formulário de verificação: um botão por erro, que leva ao campo. */
export function verificationErrorsHtml(errors: readonly VerificationError[]): string {
  if (!errors.length) return "";
  return `<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
    <p class="font-bold text-red-800">${errors.length === 1 ? "Há 1 campo por corrigir:" : `Há ${errors.length} campos por corrigir:`}</p>
    <ul class="mt-2 space-y-1">${errors.map((e) =>
      `<li><button type="button" data-focus="vf-${esc(e.field)}" class="text-left text-red-800 underline hover:no-underline">${esc(e.message)}</button></li>`).join("")}</ul>
  </div>`;
}

/** Tom da etiqueta de cada estado da verificação. */
const VERIFICATION_TONE: Readonly<Record<VerificationStatus, Tone>> = {
  none: "neutral",
  pending: "info",
  approved: "success",
  rejected: "danger",
};

/** Etiqueta do estado da verificação («Por enviar», «Em análise», «Aprovado», «Rejeitado»). */
export function verificationStatusPill(status: VerificationStatus): string {
  return pill(VERIFICATION_STATUS_LABEL[status], VERIFICATION_TONE[status]);
}

/** Formatos e tamanho aceites, a partir do domínio (nunca escritos à mão). */
export const DOCUMENT_FORMATS_TEXT = `PDF, JPG ou PNG até ${Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024))} MB.`;

/** Aviso do estado da verificação, por cima do formulário ou do resumo. */
export function verificationNoticeHtml(v: PaymentVerification, o: { providerReady: boolean; digitalVisible: boolean }): string {
  if (v.status === "pending") {
    return notice("info", "hourglass_top", "Em análise",
      "A equipa MôBisno está a analisar os dados e os documentos da empresa. A decisão aparece aqui, neste separador.");
  }
  if (v.status === "approved") {
    return notice("success", "verified", "Aprovado",
      o.digitalVisible
        ? "A empresa está verificada: os clientes já podem pagar por Multicaixa Express e Referência Bancária no checkout."
        : o.providerReady
          ? "A empresa está verificada. Os pagamentos digitais aparecem no checkout da loja dentro de momentos."
          : "A empresa está verificada. Os pagamentos digitais começam a funcionar no checkout da sua loja assim que o serviço de pagamentos estiver ligado. Até lá, as encomendas continuam a chegar por WhatsApp.");
  }
  if (v.status === "rejected") {
    return notice("danger", "error", "Rejeitado",
      "A equipa MôBisno não aprovou o pedido. Corrija o que está indicado e envie de novo.",
      v.rejectionReason ? `<p class="mt-2 text-gray-800"><span class="font-bold">Motivo:</span> ${esc(v.rejectionReason)}</p>` : "");
  }
  return "";
}

/** Resumo só de leitura do pedido enviado. */
export function verificationSummaryHtml(v: PaymentVerification): string {
  const linha = (rotulo: string, valor: string): string => `<div class="py-2.5 sm:grid sm:grid-cols-3 sm:gap-4">
    <dt class="text-sm text-gray-500">${esc(rotulo)}</dt>
    <dd class="mt-0.5 sm:mt-0 sm:col-span-2 text-sm font-semibold text-gray-900 break-words">${valor}</dd>
  </div>`;
  const docs = COMPANY_DOCUMENTS.map((d) => v.documents[d.id]
    ? `<span class="inline-flex items-center gap-1" style="color:#047857">${icon("check_circle", "text-[16px]")} ${esc(d.label)}</span>`
    : `<span class="inline-flex items-center gap-1 text-red-700">${icon("error", "text-[16px]")} Falta: ${esc(d.label)}</span>`).join("<br />");
  return `<dl class="divide-y divide-gray-100">
    ${linha("Nome da empresa", esc(v.companyName))}
    ${linha("NIF da empresa", esc(v.companyNif))}
    ${linha("Banco", esc(v.bankName))}
    ${linha("Titular da conta", esc(v.beneficiaryName))}
    ${linha("IBAN", `<span class="font-mono">${esc(formatIban(v.iban))}</span>`)}
    ${linha("Documentos", docs)}
    ${v.submittedAt ? linha("Enviado em", esc(fmtDateTime(v.submittedAt))) : ""}
    ${v.reviewedAt ? linha("Analisado em", esc(fmtDateTime(v.reviewedAt))) : ""}
  </dl>`;
}

/** Estado do carregamento de um documento, no formulário. */
export interface DocUploadState {
  busy: boolean;
  error: string | null;
  /** Nome do ficheiro carregado nesta visita (o de antes só tem caminho). */
  fileName: string | null;
}

/** Caixa de um documento: o campo de ficheiro e o que já foi carregado. */
export function docSlotHtml(doc: { id: CompanyDocumentId; label: string; hint: string }, path: string | null, st: DocUploadState): string {
  const id = `vf-${doc.id}`;
  const estado = st.busy
    ? `<span class="inline-flex items-center gap-1.5 text-sm text-gray-700">${SPIN} A carregar…</span>`
    : path
      ? `<span class="inline-flex items-center gap-1.5 text-sm font-semibold" style="color:#047857">${icon("check_circle", "text-[18px]")} ${st.fileName ? `Carregado: ${esc(st.fileName)}` : "Documento carregado"}</span>`
      : `<span class="text-sm text-gray-500">Ainda não carregado</span>`;
  const descr = [`${id}-hint`, `${id}-state`, st.error ? `${id}-err` : ""].filter(Boolean).join(" ");
  return `<div id="${id}-slot" class="rounded-xl border ${st.error ? "border-red-300" : "border-gray-200"} p-4 min-w-0">
    <label for="${id}" class="${LABEL}">${esc(doc.label)}</label>
    <p id="${id}-hint" class="${HINT}">${esc(doc.hint)} ${esc(DOCUMENT_FORMATS_TEXT)}</p>
    <input id="${id}" data-doc="${esc(doc.id)}" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" ${st.busy ? "disabled" : ""} aria-describedby="${descr}"${st.error ? ` aria-invalid="true"` : ""} class="mt-3 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-800 hover:file:bg-gray-200 file:cursor-pointer" />
    <p id="${id}-state" class="mt-2" aria-live="polite">${estado}</p>
    ${path && !st.busy ? `<p class="mt-1 text-xs text-gray-500">Escolher outro ficheiro substitui este no pedido.</p>` : ""}
    <p id="${id}-err" class="mt-2 text-xs font-semibold text-red-700 ${st.error ? "" : "hidden"}">${esc(st.error ?? "")}</p>
  </div>`;
}

/**
 * Formulário da verificação de empresa.
 *
 * Os erros não vêm desenhados aqui: chegam todos de uma vez de
 * `validateVerification`, e o separador escreve-os junto de cada campo
 * (`setFieldError`) e no resumo do topo. Desenhar o formulário de novo a cada
 * envio tirava o cursor do sítio onde o Dono estava a escrever.
 */
export function verificationFormHtml(o: {
  draft: VerificationForm;
  status: VerificationStatus;
  docs: Readonly<Record<CompanyDocumentId, DocUploadState>>;
  /** O Dono está a alterar dados já aprovados (tem botão «Cancelar»). */
  editing: boolean;
}): string {
  const d = o.draft;
  const aviso = o.editing && changeRequiresReview(o.status)
    ? notice("warning", "info", "Os dados voltam a ser analisados",
      "Se enviar dados novos, o pedido volta a «Em análise» e os pagamentos digitais ficam suspensos até a MôBisno aprovar outra vez.")
    : "";
  const enviar = o.status === "none" ? "Enviar para aprovação" : "Enviar de novo";
  return `<form id="vf-form" novalidate class="space-y-6">
    ${aviso}
    <div id="vf-summary" role="alert" class="empty:hidden"></div>
    <fieldset class="space-y-4">
      <legend class="text-sm font-black text-gray-900 uppercase tracking-wide">Empresa</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${field({ id: "vf-companyName", label: "Nome da empresa", value: d.companyName, hint: "Tal como está na matrícula.", attrs: 'autocomplete="organization" maxlength="120"' })}
        ${field({ id: "vf-companyNif", label: "NIF da empresa", value: d.companyNif, attrs: 'autocomplete="off" spellcheck="false" maxlength="20"' })}
      </div>
    </fieldset>
    <fieldset class="space-y-4">
      <legend class="text-sm font-black text-gray-900 uppercase tracking-wide">Conta bancária onde recebe</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${field({ id: "vf-bankName", label: "Banco", value: d.bankName, placeholder: "ex.: BAI, BFA, BIC", attrs: 'maxlength="60"' })}
        ${field({ id: "vf-beneficiaryName", label: "Titular da conta", value: d.beneficiaryName, hint: "O nome da empresa, como aparece no banco.", attrs: 'maxlength="120"' })}
      </div>
      ${field({
        id: "vf-iban", label: "IBAN", value: formatIban(d.iban), placeholder: "AO06 0000 0000 0000 0000 0000 0",
        hint: "25 caracteres, começa por AO06.", attrs: 'autocomplete="off" spellcheck="false" maxlength="40" style="text-transform:uppercase;font-family:ui-monospace,monospace"',
      })}
    </fieldset>
    <fieldset class="space-y-4">
      <legend class="text-sm font-black text-gray-900 uppercase tracking-wide">Documentos da empresa</legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${COMPANY_DOCUMENTS.map((doc) => docSlotHtml(doc, d.documents[doc.id] ?? null, o.docs[doc.id])).join("")}
      </div>
      <p class="text-xs text-gray-500 flex items-start gap-1.5">${icon("lock", "text-[16px]")} Os documentos ficam guardados em privado: só a equipa MôBisno os abre, para a verificação.</p>
    </fieldset>
    <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
      <button type="submit" id="vf-submit" class="${BTN_PRIMARY} mt-4">${icon("send", "text-[18px]")} ${esc(enviar)}</button>
      ${o.editing ? `<button type="button" id="vf-cancel" class="${BTN_SECONDARY} mt-4">Cancelar</button>` : ""}
    </div>
  </form>`;
}

/** Explicação dos pagamentos digitais, no topo do cartão. */
export const DIGITAL_PAYMENTS_INTRO =
  "Multicaixa Express e Referência Bancária são para empresas registadas. Envie os dados e os documentos da empresa: a equipa MôBisno analisa o pedido e, depois de o aprovar, os pagamentos digitais aparecem no checkout da sua loja.";

/**
 * A comissão, dita antes de o Dono começar a vender — e não descoberta por ele
 * no primeiro levantamento.
 *
 * A percentagem vem de `src/services/fees.ts`: escrevê-la à mão aqui era
 * garantir que um dia o painel mostraria uma comissão que já não era cobrada.
 */
export const FEE_NOTE =
  `A MôBisno fica com ${PLATFORM_FEE_LABEL} de cada venda recebida por Multicaixa Express ou Referência Bancária. `
  + "As vendas por WhatsApp não têm comissão nenhuma: esse dinheiro nunca passa pela MôBisno.";

/** Cor da faixa lateral de cada venda, pelo estado efetivo. */
const ORDER_STRIPE: Readonly<Record<string, string>> = {
  paid: "#10b981",
  open: "#f59e0b",
  failed: "#ef4444",
};

const METHOD_LABELS: Readonly<Record<string, string>> = {
  mcx: "Multicaixa Express",
  reference: "Referência Bancária",
  whatsapp: "WhatsApp",
};

/** Etiqueta do estado efetivo de uma venda (a referência fora de prazo é «Expirada»). */
export function orderStatusPill(status: string): string {
  switch (status) {
    case "paid": return pill("Paga", "success");
    case "open": return pill("Pendente", "warning");
    case "failed": return pill("Falhou", "danger");
    case "cancelled": return pill("Cancelada", "neutral");
    case "expired": return pill("Expirada", "neutral");
    default: return pill(status, "neutral");
  }
}

/**
 * Linha de venda: resumo que abre o detalhe.
 *
 * O resumo é um botão (`aria-expanded`), e não uma `div` clicável: abria-se com
 * o rato e não com o teclado. A ação de apagar só existe onde `canDeleteOrder` a
 * autoriza — hoje, só as referências expiradas — e vive no detalhe, longe do
 * dedo de quem só queria abrir a venda.
 */
export function orderRowHtml(o: OrderRow): string {
  const status = orderEffectiveStatus(o);
  const cliente = o.customer?.name || o.customer?.phone || "Cliente";
  const metodo = METHOD_LABELS[o.method] ?? o.method;
  const ref = o.referenceNumber ? `${o.referenceEntity ? `${o.referenceEntity} · ` : ""}${o.referenceNumber}` : "—";
  const apagavel = canDeleteOrder(o);
  const detalhe = `order-detail-${o.id}`;
  const item = (rotulo: string, valor: string): string =>
    `<div><dt class="text-xs text-gray-500">${esc(rotulo)}</dt><dd class="font-medium text-gray-900">${esc(valor)}</dd></div>`;
  const acoes = [
    o.invoiceUrl ? `<a href="${esc(o.invoiceUrl)}" target="_blank" rel="noopener" class="${BTN_LINK}">${icon("receipt_long", "text-[18px]")} Ver fatura</a>` : "",
    apagavel ? `<button type="button" data-order-del="${esc(o.id)}" class="${BTN_SM_DANGER}">${icon("delete", "text-[16px]")} Apagar registo</button>` : "",
  ].filter(Boolean).join("");
  return `<li class="border-b border-gray-100 last:border-0" style="border-left:3px solid ${ORDER_STRIPE[status] ?? "#d1d5db"}">
    <button type="button" data-order-toggle="${esc(o.id)}" aria-expanded="false" aria-controls="${esc(detalhe)}" class="w-full px-4 sm:px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
      <span class="flex-1 min-w-0">
        <span class="block font-semibold text-gray-900 text-sm truncate">${esc(cliente)}</span>
        <span class="block text-xs text-gray-500">${esc(fmtDateTime(o.createdAt))} · ${esc(metodo)}</span>
      </span>
      <span class="font-bold text-gray-900 text-sm whitespace-nowrap tabular-nums">${esc(formatKz(o.amount))}</span>
      ${orderStatusPill(status)}
      <span class="text-gray-400">${icon("expand_more")}</span>
    </button>
    <div id="${esc(detalhe)}" class="hidden px-4 sm:px-5 pb-4 pt-1 bg-gray-50">
      <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        ${item("Método", metodo)}
        ${item("Taxa", formatKz(o.fee))}
        ${item("Líquido", formatKz(o.net))}
        ${item("Referência", ref)}
        ${o.customer?.phone ? item("Telefone", o.customer.phone) : ""}
        ${o.customer?.nif ? item("NIF", o.customer.nif) : ""}
      </dl>
      ${apagavel ? `<p class="text-xs text-gray-600 mt-3">A referência passou a data-limite e já não pode ser paga. Apagar remove este registo para sempre.</p>` : ""}
      ${acoes ? `<div class="flex flex-wrap items-center gap-3 mt-3">${acoes}</div>` : ""}
    </div>
  </li>`;
}

/** Etiqueta do estado de um levantamento. */
export function withdrawalStatusPill(status: string): string {
  switch (status) {
    case "requested": return pill("Pendente", "warning");
    case "approved": return pill("Aprovado", "info");
    case "paid": return pill("Pago", "success");
    case "rejected": return pill("Rejeitado", "danger");
    default: return pill(status, "neutral");
  }
}

/** Linha de levantamento. */
export function withdrawalRowHtml(w: WithdrawalRow): string {
  return `<li class="px-4 sm:px-5 py-3 flex items-center gap-3">
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-gray-900 text-sm tabular-nums">${esc(formatKz(w.amount))}</p>
      <p class="text-xs text-gray-500">${esc(fmtDateTime(w.createdAt))}${w.iban ? ` · ${esc(maskIban(w.iban))}` : ""}</p>
    </div>
    ${withdrawalStatusPill(w.status)}
  </li>`;
}

/** Um número do resumo das vendas. */
function kpi(label: string, value: string, note: string, extra = ""): string {
  return `<div class="rounded-xl border border-gray-200 p-4 min-w-0 flex flex-col">
    <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">${esc(label)}</p>
    <p class="mt-1 text-xl font-black text-gray-900 tabular-nums break-words">${esc(value)}</p>
    ${note ? `<p class="mt-0.5 text-xs text-gray-500">${esc(note)}</p>` : ""}
    ${extra}
  </div>`;
}

/**
 * Resumo das vendas digitais, com o pedido de levantamento.
 *
 * O levantamento vai para a conta **aprovada** da empresa. Sem verificação
 * aprovada — ou com dados novos à espera de nova aprovação — o botão fica
 * desligado e a frase diz porquê.
 */
export function salesSummaryHtml(o: {
  stats: OrderStats;
  available: number;
  /** Conta aprovada para onde vai o levantamento, ou `null`. */
  account: { bankName: string; iban: string } | null;
}): string {
  const podeLevantar = o.available > 0 && o.account !== null;
  const nota = o.account
    ? `Para a conta ${maskIban(o.account.iban)}${o.account.bankName ? ` (${o.account.bankName})` : ""}.`
    : "Os levantamentos vão para a conta bancária aprovada da empresa.";
  const botao = `<button type="button" id="request-withdraw" ${podeLevantar ? "" : "disabled"} class="${BTN_PRIMARY} mt-3 w-full">${icon("account_balance_wallet", "text-[18px]")} Solicitar levantamento</button>`;
  return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
    ${kpi("Recebido (líquido)", formatKz(o.stats.netReceived), `Já sem a comissão de ${PLATFORM_FEE_LABEL} da MôBisno.`)}
    ${kpi("Disponível para levantar", formatKz(o.available), nota, botao)}
    ${kpi("Vendas pagas", String(o.stats.paidCount), `${formatKz(o.stats.totalSales)} no total.`)}
    ${kpi("Referências pendentes", String(o.stats.pendingCount), "Por pagar e ainda dentro do prazo.")}
  </div>`;
}

/* ================================== Plano ================================== */

/** «mês» quando o período é o de um mês; senão, o número de dias. */
const PERIODO = PLAN_PERIOD_DAYS === 30 ? "mês" : `${PLAN_PERIOD_DAYS} dias`;

/** Preço do plano por extenso (ex.: «… Kz/mês»), sempre a partir de `PLAN_PRICE_KZ`. */
export const PLAN_PRICE_TEXT = `${kzRound(PLAN_PRICE_KZ)}/${PERIODO}`;

/** Ligação de email para pedir a ativação, com o identificador da loja no assunto. */
export function planActivationMailto(storeName: string, identifier: string): string {
  const assunto = `Ativar a subscrição ${PLAN_NAME} — loja ${identifier}`;
  const corpo = `Olá, equipa ${PLAN_NAME}.\r\n\r\nQuero ativar a subscrição da loja «${storeName}» (identificador: ${identifier}).\r\n\r\nObrigado.`;
  return `mailto:${PLATFORM_CONTACT_EMAIL}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/** Estado da subscrição em três peças: etiqueta, título e frase. */
function planState(b: BillingState): { pill: string; title: string; text: string } {
  if (b.byAdmin) {
    return {
      pill: pill("Conta de administração", "accent", "shield_person"),
      title: "Acesso permanente",
      text: "Esta conta administra a plataforma: publica lojas sem subscrição e sem cobrança.",
    };
  }
  if (b.accessActive) {
    const dias = b.daysRemaining ?? 0;
    const data = fmtDate(b.expiresAt);
    return {
      pill: pill("Ativa", "success", "check_circle"),
      title: data ? `Ativa até ${data}` : "Ativa",
      text: `${dias === 1 ? "Falta 1 dia" : `Faltam ${dias} dias`}. Renovar antes do fim não faz perder dias: o período novo começa quando este acabar.`,
    };
  }
  if (b.expired) {
    return {
      pill: pill("Caducada", "danger", "event_busy"),
      title: "A subscrição caducou",
      text: "Esta loja saiu do ar, mas os dados ficam guardados. Renove a subscrição para a voltar a pôr online.",
    };
  }
  return {
    pill: pill("Inativa", "neutral", "pause_circle"),
    title: "Sem subscrição ativa",
    text: "Pode criar e personalizar a loja à vontade. Para a publicar, ative a subscrição desta loja.",
  };
}

/**
 * Separador «Plano»: um só plano, um só preço, e como o ativar.
 *
 * Enquanto não houver serviço de pagamentos (`providerReady`), não há botão de
 * pagar: há a explicação honesta de que a ativação é feita pela equipa MôBisno e
 * o email para a pedir, com o identificador da loja já no assunto.
 */
export function planHtml(o: { billing: BillingState; providerReady: boolean; storeName: string; identifier: string }): string {
  const b = o.billing;
  const st = planState(b);
  const barra = !b.byAdmin && b.accessActive && b.daysRemaining != null
    ? `<div class="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-label="Dias restantes do período" aria-valuemin="0" aria-valuemax="${PLAN_PERIOD_DAYS}" aria-valuenow="${Math.min(PLAN_PERIOD_DAYS, b.daysRemaining)}">
        <div class="h-full rounded-full" style="width:${Math.max(2, Math.min(100, Math.round((b.daysRemaining / PLAN_PERIOD_DAYS) * 100)))}%;background:${ACCENT}"></div>
      </div>`
    : "";
  const mailto = planActivationMailto(o.storeName, o.identifier);
  const acao = b.byAdmin
    ? ""
    : o.providerReady
      ? `<button type="button" id="plan-pay" class="${BTN_PRIMARY}">${icon("bolt", "text-[18px]")} ${b.accessActive ? "Renovar a subscrição" : "Ativar a subscrição"}</button>
         <p class="mt-2 text-xs text-gray-500">Pagamento por Multicaixa Express ou Referência Bancária.</p>`
      : `${notice("info", "schedule", "Pagamento online da subscrição: em breve",
          "Até lá, quem ativa a subscrição é a equipa MôBisno. Escreva-nos com o identificador da loja e tratamos da ativação.",
          `<p class="mt-2 text-gray-700">Email: <a href="${esc(mailto)}" class="font-bold underline" style="color:${ACCENT_INK}">${esc(PLATFORM_CONTACT_EMAIL)}</a> · Loja: <span class="font-mono font-semibold">${esc(o.identifier)}</span></p>`)}
         <a href="${esc(mailto)}" id="plan-mailto" class="${BTN_PRIMARY} mt-4">${icon("mail", "text-[18px]")} Pedir a ativação por email</a>`;
  return `<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
    ${card(`
      ${cardHead({ icon: "workspace_premium", title: "A subscrição desta loja", aside: st.pill })}
      <p class="mt-5 text-lg font-black text-gray-900">${esc(st.title)}</p>
      <p class="mt-1 text-sm text-gray-600">${esc(st.text)}</p>
      ${barra}
      ${acao ? `<div class="mt-6">${acao}</div>` : ""}`, "lg:col-span-3")}
    ${card(`
      <p class="text-xs font-bold uppercase tracking-wider" style="color:${ACCENT_INK}">Plano ${esc(PLAN_NAME)}</p>
      <p class="mt-2 flex items-baseline gap-1 flex-wrap">
        <span class="text-3xl font-black tracking-tight text-gray-900">${esc(kzRound(PLAN_PRICE_KZ))}</span>
        <span class="text-sm font-semibold text-gray-500">/${esc(PERIODO)} ${esc(PLAN_UNIT_LABEL)}</span>
      </p>
      <p class="mt-1 text-sm text-gray-600">Cada loja tem a sua subscrição, com tudo incluído. Cada pagamento cobre ${PLAN_PERIOD_DAYS} dias.</p>
      <ul class="mt-5 space-y-2.5">${PLAN_HIGHLIGHTS.map((h) =>
        `<li class="flex items-start gap-2 text-sm text-gray-700"><span class="text-emerald-600 shrink-0">${icon("check_circle", "text-[18px]")}</span><span>${esc(h)}</span></li>`).join("")}</ul>`, "lg:col-span-2")}
  </div>`;
}

/* ============================== Configurações ============================== */

/** As três funcionalidades das Configurações, pela ordem do ecrã. */
export const CONFIG_SOON: readonly { feature: ComingSoonFeature; icon: string; title: string; text: string }[] = [
  { feature: "customDomain", icon: "language", title: "Domínio próprio", text: "Ligar um domínio seu (por exemplo, www.minhaloja.co.ao) à loja." },
  { feature: "marketing", icon: "ads_click", title: "Marketing e pixels", text: "Medir visitas e anúncios com o Meta Pixel (Facebook e Instagram) e o Google Analytics." },
  { feature: "sms", icon: "sms", title: "SMS de confirmação", text: "Enviar ao cliente um SMS com o resumo da encomenda, logo depois da compra." },
];

/**
 * Configurações: as três funcionalidades «Em breve», sem campos, sem compras e
 * sem preços.
 *
 * «Em breve desliga, não apaga» (`src/services/comingSoon.ts`): o que o Dono já
 * tinha gravado — um domínio, os IDs dos pixels, um saldo de SMS — é mostrado
 * como guardado, para não parecer perdido.
 */
export function configHtml(o: { smsCredits: number; customDomain?: string; metaPixelId?: string; gaId?: string }): string {
  const marketing = [o.metaPixelId ? `Meta Pixel ${o.metaPixelId}` : "", o.gaId ? `Google Analytics ${o.gaId}` : ""].filter(Boolean).join(" · ");
  const guardado: Readonly<Record<ComingSoonFeature, string>> = {
    customDomain: o.customDomain ? `Domínio guardado: ${o.customDomain}` : "",
    marketing: marketing ? `Guardado: ${marketing}` : "",
    sms: o.smsCredits > 0 ? `Saldo guardado: ${o.smsCredits} SMS` : "",
  };
  const itens = CONFIG_SOON.map((c) => {
    const breve = isComingSoon(c.feature);
    return `<li class="py-5 first:pt-0 last:pb-0 flex items-start gap-4" data-config="${esc(c.feature)}">
      <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-500">${icon(c.icon)}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="font-black text-gray-900">${esc(c.title)}</h2>
          ${breve ? comingSoonBadge(COMING_SOON_LABELS[c.feature]) : ""}
        </div>
        <p class="mt-0.5 text-sm text-gray-600">${esc(c.text)}</p>
        ${breve ? `<p class="mt-1 text-xs text-gray-500">Ainda não é possível ativar.</p>` : ""}
        ${guardado[c.feature] ? `<p class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700">${icon("inventory", "text-[16px]")} ${esc(guardado[c.feature])}</p>` : ""}
      </div>
    </li>`;
  }).join("");
  return card(`<ul class="divide-y divide-gray-100">${itens}</ul>`);
}

/**
 * Zona de perigo: apagar a loja, confirmado ao escrever o nome dela.
 *
 * O botão só acende quando o nome escrito coincide — é a mesma confirmação de
 * sempre (escrever o nome), sem a caixa do navegador por cima do ecrã.
 */
export function deleteStoreHtml(storeName: string): string {
  return `<section class="bg-white border border-red-200 rounded-2xl shadow-sm p-5 md:p-6" aria-labelledby="danger-title">
    <div class="flex items-start gap-3">
      <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-red-50 text-red-600">${icon("warning")}</span>
      <div class="min-w-0">
        <h2 id="danger-title" class="font-black text-red-700">Apagar a loja</h2>
        <p class="mt-1 text-sm text-gray-700">Remove <strong>para sempre</strong> os produtos, as imagens, os banners, a personalização e as configurações desta loja. <strong class="text-red-700">Não é possível desfazer.</strong></p>
      </div>
    </div>
    <div class="mt-5 max-w-md">
      <label for="delete-confirm" class="${LABEL}">Para confirmar, escreva o nome da loja: <span class="font-black">${esc(storeName)}</span></label>
      <input id="delete-confirm" type="text" autocomplete="off" spellcheck="false" class="${INPUT} mt-1.5" />
    </div>
    <button type="button" id="delete-store" disabled class="${BTN_DANGER} mt-4">${icon("delete_forever", "text-[18px]")} Apagar esta loja</button>
  </section>`;
}

/* ==================== Encomendas por WhatsApp (pedidos) ==================== */

/**
 * Encomendas que os clientes enviaram por WhatsApp.
 *
 * ## Porque é que esta lista existe
 *
 * Uma loja sem pagamentos digitais vende só por WhatsApp — e, até agora, o
 * painel dela mostrava cartões de vendas, saldo e levantamentos que nunca iam
 * ter um número diferente de zero. Pior: se a mensagem do cliente não chegasse,
 * a encomenda não existia em sítio nenhum.
 *
 * O que essa loja precisa de ver é **quem clicou em pagar por WhatsApp e o que
 * tinha no carrinho**. É esta lista (`whatsapp_orders`, migração 0024): o
 * carrinho, o total, os dados de contacto e o botão para responder — mesmo que
 * a conversa nunca tenha sido enviada.
 */
export function whatsappOrdersHtml(rows: readonly WhatsappOrderRow[]): string {
  if (!rows.length) {
    return emptyState({
      icon: "chat",
      title: "Ainda não há encomendas por WhatsApp",
      text: "Cada vez que um cliente toca em «Finalizar via WhatsApp», a encomenda dele aparece aqui — com o que escolheu, o total e o contacto — mesmo que a mensagem não chegue a ser enviada.",
    });
  }
  return `<ul class="mt-4 -mx-5 md:-mx-6 border-t border-gray-100 divide-y divide-gray-100">
    ${rows.map(whatsappOrderRowHtml).join("")}
  </ul>`;
}

/** De onde partiu o clique, por palavras. */
const WA_ORIGIN_LABEL: Readonly<Record<string, string>> = {
  checkout: "No checkout",
  carrinho: "Na página do carrinho",
  gaveta: "No mini-carrinho",
  produto: "Na página do produto",
};

/** Uma encomenda por WhatsApp: o carrinho, o contacto e o que fazer com ela. */
export function whatsappOrderRowHtml(o: WhatsappOrderRow): string {
  const cliente = o.customer.name || o.customer.phone || "Cliente sem nome";
  const detalhe = `wa-detail-${o.id}`;
  const artigos = o.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  // O número chega como `244XXXXXXXXX`: o `wa.me` quer-o sem o sinal.
  const telefone = (o.customer.phone ?? "").replace(/\D/g, "");
  const linhas = o.items.map((i) => `<li class="flex items-baseline justify-between gap-3 py-1">
      <span class="text-gray-700 min-w-0">${esc(i.quantity)}× ${esc(i.name)}${i.variantLabel ? `<span class="text-gray-500"> · ${esc(i.variantLabel)}</span>` : ""}</span>
      <span class="font-medium text-gray-900 tabular-nums whitespace-nowrap">${esc(formatKz((Number(i.price) || 0) * (Number(i.quantity) || 0)))}</span>
    </li>`).join("");
  const campo = (rotulo: string, valor?: string): string => (valor
    ? `<div><dt class="text-xs text-gray-500">${esc(rotulo)}</dt><dd class="font-medium text-gray-900 break-words">${esc(valor)}</dd></div>`
    : "");
  return `<li data-wa-row="${esc(o.id)}" class="${o.handled ? "opacity-60" : ""}" style="border-left:3px solid ${o.handled ? "#d1d5db" : ACCENT}">
    <button type="button" data-wa-toggle="${esc(o.id)}" aria-expanded="false" aria-controls="${esc(detalhe)}" class="w-full px-4 sm:px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
      <span class="flex-1 min-w-0">
        <span class="block font-semibold text-gray-900 text-sm truncate">${esc(cliente)}</span>
        <span class="block text-xs text-gray-500">${esc(fmtDateTime(o.createdAt))} · ${esc(plural(artigos, "artigo", "artigos"))}${o.customer.area ? ` · ${esc(o.customer.area)}` : ""}</span>
      </span>
      <span class="font-bold text-gray-900 text-sm tabular-nums whitespace-nowrap">${esc(formatKz(o.total))}</span>
      ${o.handled ? pill("Tratada", "neutral") : pill("Por tratar", "warning")}
      <span class="text-gray-400">${icon("expand_more", "text-[20px]")}</span>
    </button>
    <div id="${esc(detalhe)}" class="hidden px-4 sm:px-5 pb-4">
      <ul class="text-sm divide-y divide-gray-100 border-y border-gray-100 py-1">${linhas}</ul>
      <div class="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        ${o.deliveryFee > 0 ? `<span class="text-gray-600">Entrega: <strong class="text-gray-900">${esc(formatKz(o.deliveryFee))}</strong></span>` : ""}
        ${o.discountAmount > 0 ? `<span class="text-gray-600">Desconto: <strong class="text-emerald-700">−${esc(formatKz(o.discountAmount))}</strong></span>` : ""}
        <span class="text-gray-600">Total: <strong class="text-gray-900">${esc(formatKz(o.total))}</strong></span>
      </div>
      <dl class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        ${campo("Telemóvel", o.customer.phone)}
        ${campo("Email", o.customer.email)}
        ${campo("Morada", o.customer.address)}
        ${campo("NIF", o.customer.nif)}
        ${campo("Veio de", WA_ORIGIN_LABEL[o.origin] ?? o.origin)}
      </dl>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        ${telefone ? `<a href="https://wa.me/${esc(telefone)}" target="_blank" rel="noopener" class="${BTN_SM_PRIMARY}">${icon("chat", "text-[16px]")} Falar no WhatsApp</a>` : ""}
        <button type="button" data-wa-handled="${esc(o.id)}" class="${BTN_SM}">${icon(o.handled ? "undo" : "check", "text-[16px]")} ${o.handled ? "Marcar por tratar" : "Marcar como tratada"}</button>
        <button type="button" data-wa-del="${esc(o.id)}" class="${BTN_SM_DANGER}">${icon("delete", "text-[16px]")} Apagar</button>
      </div>
    </div>
  </li>`;
}

/* ======================= Fatura da empresa (Vero) ======================= */

/** Rótulo do estado de uma fatura, como o Dono o lê. */
export const INVOICE_STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: "A validar na AGT",
  validated: "Validada",
  rejected: "Recusada pela AGT",
  failed: "Falhou",
  skipped: "Sem faturação ligada",
};

/**
 * Cartão da faturação automática.
 *
 * ## Porque é que as credenciais são da loja, e não nossas
 *
 * **Quem vende é a empresa do Dono**, não a MôBisno — logo é ela que fatura ao
 * cliente final. No Vero, o emissor de um documento é a organização a que a
 * chave pertence; para a fatura sair em nome da empresa dele, a chave tem de ser
 * dele. Por isso estes dois campos: o identificador da organização e a chave
 * secreta, que ficam guardados ao lado dos dados bancários (sem leitura
 * pública) e nunca saem para o lado do cliente.
 *
 * Sem credenciais, a loja vende e recebe como sempre: só não emite fatura.
 */
export function invoicingCardHtml(o: { orgId: string; hasKey: boolean; isTestKey: boolean }): string {
  const ligada = o.orgId !== "" && o.hasKey;
  const estado = ligada
    ? (o.isTestKey ? pill("Chave de teste", "warning") : pill("Ligada", "success"))
    : pill("Por ligar", "neutral");
  return card(`
    ${cardHead({
      icon: "receipt_long", title: "Fatura automática (Vero)",
      subtitle: "Cada venda digital gera uma Fatura-Recibo emitida pela sua empresa.", aside: estado,
    })}
    <p class="mt-4 text-sm text-gray-700">Quem vende é a sua empresa, por isso é ela que fatura ao cliente — a MôBisno não aparece na fatura. Indique a organização e a chave do seu <strong>Vero</strong> e a fatura passa a ser emitida e enviada ao cliente sozinha, logo depois de cada pagamento.</p>
    ${o.isTestKey ? notice("warning", "science", "A chave é de teste", "Os documentos não chegam à AGT. Para faturar a sério, use a chave de produção (vero_live_sk_…).") : ""}
    <form id="vero-form" novalidate class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
      ${field({
        id: "vero-org", label: "Organização (Org ID)", value: o.orgId,
        placeholder: "org_…", hint: "Vero → Definições da organização.",
        attrs: 'autocomplete="off" spellcheck="false" maxlength="120"',
      })}
      ${field({
        id: "vero-key", label: "Chave secreta (API key)", value: "", type: "password",
        placeholder: o.hasKey ? "•••••••• (guardada)" : "vero_live_sk_…",
        hint: o.hasKey ? "Deixe vazio para manter a chave que já está guardada." : "Só a chave de servidor (sk). A chave pública não serve.",
        attrs: 'autocomplete="off" spellcheck="false" maxlength="200"', optional: o.hasKey,
      })}
      <div class="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" id="save-vero" class="${BTN_PRIMARY}">${icon("save", "text-[18px]")} Guardar</button>
        ${ligada ? `<button type="button" id="clear-vero" class="${BTN_SECONDARY}">${icon("link_off", "text-[18px]")} Desligar a faturação</button>` : ""}
        <p id="vero-error" role="alert" class="text-sm font-semibold text-red-700"></p>
      </div>
    </form>
    <p class="${HINT} mt-4">Sem isto, a loja vende e recebe como sempre — só não emite fatura. A fatura de uma venda que falhe pode ser emitida outra vez a partir da lista de vendas.</p>`);
}
