/**
 * «Visão geral» do Painel de Administração.
 *
 * Três blocos, por esta ordem:
 *
 *  1. **os cinco números que contam**, cada um uma ligação para a secção onde
 *     se age sobre ele;
 *  2. **«Transações»**: as subscrições e as vendas das lojas por categoria
 *     (concluídas, pendentes e canceladas), num período à escolha, com um
 *     gráfico e as mais recentes. O Administrador pediu para ver o movimento, e
 *     não só o total: cada quadro filtra a lista e realça a sua categoria no
 *     gráfico;
 *  3. **«A precisar de atenção»**: o que está à espera de uma decisão.
 *
 * Os números saem de `overviewKpis`, a lista de `attentionLists` e as
 * transações de `transactionOverview` (`src/services/adminMetrics.ts`), sobre os
 * mesmos dados: o número de um cartão e o comprimento da lista correspondente
 * nunca divergem, e a vista não soma nada por si. As lojas-modelo e as contas
 * de administração ficam fora de todos.
 */
import { esc, formatKz } from "../../lib/dom.js";
import {
  ADMIN_ORDERS_LIMIT, listAccounts, listAllWithdrawals, listPlanPayments, listStoreOrders, listStores, listVerifications,
} from "../../supabase/admin.js";
import {
  ADMIN_HREFS, ANGOLA_UTC_OFFSET_MINUTES, TX_CATEGORIES, TX_CATEGORY_LABELS, TX_DEFAULT_PERIOD, TX_PERIOD_LABELS, TX_PERIODS,
  attentionLists, overviewKpis, transactionOverview, txCategory, txStatusLabel,
  type AdminMetricsInput, type AttentionItem, type PlatformTx, type TransactionOverview, type TxBucket, type TxCategory,
  type TxKind, type TxPeriod,
} from "../../../src/services/adminMetrics.js";
import { PAYMENTS_PROVIDER_READY } from "../../../src/services/payments.js";
import { methodLabel } from "./payments.js";
import {
  ago, bindChips, btnClass, emptyState, filterChips, fmtDateTime, icon, noteBox, pill, plural, type AdminView, type Tone,
} from "./ui.js";

/** Linhas de cada lista de «A precisar de atenção» antes de «Ver todos». */
const ATTENTION_ROWS = 5;

interface Kpi {
  readonly href: string;
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  /** Pede ação: o cartão fica realçado. */
  readonly urgent?: boolean;
  /** Ocupa a largura toda no telemóvel. */
  readonly wide?: boolean;
}

function kpiCard(k: Kpi): string {
  return `<li class="min-w-0 ${k.wide ? "col-span-2 lg:col-span-1" : ""}">
    <a href="${esc(k.href)}" class="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-2">
      <span class="flex items-center justify-between gap-2 text-[13px] font-medium text-gray-500"><span class="min-w-0">${esc(k.label)}</span>${k.urgent ? `<span class="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden="true"></span>` : icon(k.icon, "text-[18px] text-gray-400")}</span>
      <span class="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-gray-900">${esc(k.value)}</span>
      <span class="mt-1 text-xs text-gray-500">${esc(k.hint)}</span>
    </a>
  </li>`;
}

function attentionRow(item: AttentionItem, iconName: string, aside: string): string {
  return `<li>
    <a href="${esc(item.href)}" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F95901]">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">${icon(iconName, "text-[17px]")}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-gray-900">${esc(item.title)}</span>
        <span class="block truncate text-[13px] text-gray-500">${esc(item.detail)}</span>
      </span>
      <span class="shrink-0 text-right text-[13px] text-gray-600">${aside}</span>
      ${icon("chevron_right", "text-[20px] text-gray-400 shrink-0")}
    </a>
  </li>`;
}

function attentionGroup(
  title: string,
  items: readonly AttentionItem[],
  all: { href: string; label: string },
  iconName: string,
  aside: (item: AttentionItem) => string,
): string {
  if (!items.length) return "";
  const rest = items.length - ATTENTION_ROWS;
  return `<div>
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-4">
      <h3 class="flex items-center gap-2 text-[13px] font-semibold text-gray-900">${esc(title)}${pill(String(items.length), "amber")}</h3>
      <a href="${esc(all.href)}" class="rounded text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]">${esc(all.label)}</a>
    </div>
    <ul role="list" class="divide-y divide-gray-100">${items.slice(0, ATTENTION_ROWS).map((i) => attentionRow(i, iconName, aside(i))).join("")}</ul>
    ${rest > 0 ? `<p class="px-4 pb-3 text-sm text-gray-600">E mais ${rest}.</p>` : ""}
  </div>`;
}

/* ------------------------------- Transações ------------------------------- */

/** Linhas de «Transações recentes» de cada vez. */
const TX_ROWS = 8;

/** O que está escolhido nas transações. */
interface TxState {
  period: TxPeriod;
  kind: TxKind | "all";
  category: TxCategory | "all";
  /** Linhas à vista na lista. */
  shown: number;
}

/**
 * Como se escreve e se pinta cada categoria. A cor acompanha sempre a palavra
 * (no quadro, na legenda e na dica de cada coluna); nunca a substitui.
 */
const CATEGORY: Readonly<Record<TxCategory, { one: string; many: string; bar: string }>> = {
  concluida: { one: "concluída", many: "concluídas", bar: "bg-emerald-500" },
  pendente: { one: "pendente", many: "pendentes", bar: "bg-amber-400" },
  cancelada: { one: "cancelada", many: "canceladas", bar: "bg-gray-300" },
};

/** Camadas de cada coluna, de cima para baixo: as concluídas assentam no eixo. */
const STACK: readonly TxCategory[] = ["cancelada", "pendente", "concluida"];

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** «nos últimos 30 dias». */
function periodSpan(period: TxPeriod): string {
  return `nos últimos ${TX_PERIOD_LABELS[period]}`;
}

/**
 * A data de Luanda de um instante, para ler com os `getUTC…`. Os intervalos do
 * gráfico são os de Luanda (`transactionOverview`), e os rótulos têm de ser os
 * mesmos, e não os do fuso do navegador. O fuso é fixo: é uma soma.
 */
function luanda(ms: number): Date {
  return new Date(ms + ANGOLA_UTC_OFFSET_MINUTES * 60_000);
}

/** Rótulo do eixo: «11 out», «hoje», ou o mês, «out». */
function axisLabel(b: TxBucket, unit: TransactionOverview["unit"], isLast: boolean): string {
  const d = luanda(b.start);
  const month = MONTHS_SHORT[d.getUTCMonth()] ?? "";
  if (unit === "month") return month;
  return isLast ? "hoje" : `${d.getUTCDate()} ${month}`;
}

/** O intervalo por extenso, para a dica da coluna: «Sábado, 17 de outubro», «Outubro de 2026». */
function bucketName(b: TxBucket, unit: TransactionOverview["unit"]): string {
  const d = luanda(b.start);
  const month = MONTHS_LONG[d.getUTCMonth()] ?? "";
  if (unit === "month") return `${month.charAt(0).toUpperCase()}${month.slice(1)} de ${d.getUTCFullYear()}`;
  return `${WEEKDAYS[d.getUTCDay()] ?? ""}, ${d.getUTCDate()} de ${month}`;
}

/** «3 concluídas, 1 pendente», ou «sem transações». */
function countsText(counts: Readonly<Record<TxCategory, number>>): string {
  const parts = TX_CATEGORIES
    .filter((c) => counts[c] > 0)
    .map((c) => `${counts[c]} ${counts[c] === 1 ? CATEGORY[c].one : CATEGORY[c].many}`);
  return parts.length ? parts.join(", ") : "sem transações";
}

/** Cor do selo de uma linha: a da categoria, e vermelho na falhada, que pede que se olhe. */
function statusTone(status: string): Tone {
  if (status === "failed") return "red";
  const c = txCategory(status);
  return c === "concluida" ? "green" : c === "pendente" ? "amber" : "gray";
}

/** Um quadro: o número, o valor e a parte do total. Carregar filtra a lista. */
function txTile(o: {
  value: TxCategory | "all";
  active: TxCategory | "all";
  label: string;
  count: number;
  amount: number;
  foot: string;
  bar?: string;
}): string {
  const on = o.value === o.active;
  return `<button type="button" data-tx-cat="${o.value}" data-tx-focus="cat-${o.value}" aria-pressed="${on}" class="relative flex min-w-0 flex-col items-start px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F95901] ${on ? "bg-gray-50" : "bg-white hover:bg-gray-50"}">
    <span class="flex items-center gap-2 text-[13px] font-medium ${on ? "text-gray-900" : "text-gray-600"}">${o.bar ? `<span class="h-2.5 w-2.5 shrink-0 rounded-sm ${o.bar}" aria-hidden="true"></span>` : ""}${esc(o.label)}</span>
    <span class="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-gray-900">${o.count}</span>
    <span class="mt-0.5 max-w-full truncate text-[13px] font-medium tabular-nums text-gray-700">${esc(formatKz(o.amount))}</span>
    <span class="mt-0.5 text-xs text-gray-500">${esc(o.foot)}</span>
    ${on ? `<span class="absolute inset-x-0 bottom-0 h-0.5 bg-gray-900" aria-hidden="true"></span>` : ""}
  </button>`;
}

function txTiles(ov: TransactionOverview, active: TxCategory | "all"): string {
  const s = ov.summary;
  const share = (n: number): string =>
    s.total.count ? `${Math.round((n / s.total.count) * 100)}% do total` : "Nenhuma no período";
  return `<div role="group" aria-label="Mostrar as transações pelo estado" class="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 lg:grid-cols-4">
    ${txTile({ value: "all", active, label: "Todas", count: s.total.count, amount: s.total.amount, foot: periodSpan(ov.period) })}
    ${TX_CATEGORIES.map((c) => txTile({
      value: c,
      active,
      label: TX_CATEGORY_LABELS[c],
      count: s[c].count,
      amount: s[c].amount,
      foot: share(s[c].count),
      bar: CATEGORY[c].bar,
    })).join("")}
  </div>`;
}

/**
 * O gráfico: uma coluna por dia (ou por mês), com as três categorias empilhadas.
 * Em HTML, e não em SVG: as colunas esticam com a largura sem deformar, e cada
 * uma tem a sua dica. Com uma categoria escolhida, as outras ficam esbatidas.
 */
function txChart(ov: TransactionOverview, state: TxState): string {
  const focus = state.category;
  const totals = ov.series.map((b) => b.concluida + b.pendente + b.cancelada);
  const max = Math.max(1, ...totals);
  const last = ov.series.length - 1;
  // Rótulos do eixo: todos em 7 dias e em 12 meses; em 30 dias, de 7 em 7 a contar de hoje.
  const step = ov.unit === "day" && ov.series.length > 7 ? 7 : 1;
  const gap = ov.series.length > 12 ? "gap-[2px] sm:gap-1" : "gap-1.5 sm:gap-2";
  const cols = ov.series.map((b, i) => {
    const total = totals[i] ?? 0;
    const layers = STACK
      .filter((c) => b[c] > 0)
      .map((c) => `<span class="block w-full ${CATEGORY[c].bar}" style="flex:${b[c]} 1 0%${focus !== "all" && focus !== c ? ";opacity:.25" : ""}"></span>`)
      .join("");
    const tip = `${bucketName(b, ov.unit)}: ${countsText(b)}${b.amount > 0 ? `. ${formatKz(b.amount)} pagos` : ""}`;
    return `<div class="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title="${esc(tip)}">${total
      ? `<div class="flex w-full max-w-[44px] flex-col overflow-hidden rounded-t-[3px]" style="height:${((total / max) * 100).toFixed(1)}%;min-height:3px">${layers}</div>`
      : ""}</div>`;
  }).join("");
  const labels = ov.series.map((b, i) => `<span class="relative h-3 min-w-0 flex-1">${(last - i) % step === 0
    ? `<span class="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">${esc(axisLabel(b, ov.unit, i === last))}</span>`
    : ""}</span>`).join("");
  const s = ov.summary;
  const all = countsText({ concluida: s.concluida.count, pendente: s.pendente.count, cancelada: s.cancelada.count });
  const per = ov.unit === "day" ? "dia" : "mês";
  const sales = ov.hasOrders && state.kind !== "plan";
  return `<figure class="px-4 pb-4 pt-4 sm:px-5">
    <figcaption class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span class="text-[13px] font-medium text-gray-600">Por ${per}, ${esc(periodSpan(ov.period))}</span>
      <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600" aria-hidden="true">${TX_CATEGORIES.map((c) => `<span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm ${CATEGORY[c].bar}"></span>${esc(TX_CATEGORY_LABELS[c])}</span>`).join("")}</span>
    </figcaption>
    <div role="img" aria-label="${esc(`Transações por ${per}, ${periodSpan(ov.period)}: ${all}.`)}">
      <div class="flex h-32 items-end border-b border-gray-200 sm:h-40 ${gap}">${cols}</div>
      <div class="mt-1.5 flex text-[11px] leading-3 tabular-nums text-gray-500 ${gap}">${labels}</div>
    </div>
    <p class="mt-4 text-xs text-gray-500">As canceladas incluem as falhadas e as expiradas.${sales ? " As vendas das lojas são dinheiro dos Donos: não entram na «Receita do mês»." : ""}</p>
  </figure>`;
}

function txRow(tx: PlatformTx): string {
  const plan = tx.kind === "plan";
  // No telemóvel, o método sai: a linha corta no fim, e a data é o que não pode ficar cortado.
  const detail = `${esc(tx.who)}<span class="hidden sm:inline"> · ${esc(methodLabel(tx.method))}</span> · ${esc(fmtDateTime(new Date(tx.createdAt).toISOString()))}`;
  const title = plan
    ? `Subscrição${tx.store ? `<span class="font-normal text-gray-500"> · ${esc(tx.store)}</span>` : ""}`
    : `<span class="font-normal text-gray-500">Venda · </span>${esc(tx.store)}`;
  return `<li class="flex items-center gap-3 px-4 py-3">
    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">${icon(plan ? "workspace_premium" : "shopping_bag", "text-[17px]")}</span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-gray-900">${title}</span>
      <span class="block truncate text-[13px] text-gray-500">${detail}</span>
    </span>
    <span class="flex shrink-0 flex-col items-end gap-1">
      <span class="text-sm font-semibold tabular-nums text-gray-900">${esc(formatKz(tx.amount))}</span>
      ${pill(txStatusLabel(tx.status), statusTone(tx.status))}
    </span>
  </li>`;
}

function txList(ov: TransactionOverview, state: TxState): string {
  const shown = ov.items.slice(0, state.shown);
  const rest = ov.items.length - shown.length;
  const href = state.kind === "order" ? ADMIN_HREFS.encomendas : state.kind === "plan" ? ADMIN_HREFS.subscricoes : ADMIN_HREFS.pagamentos;
  const heading = state.category === "all" ? "Transações recentes" : `${TX_CATEGORY_LABELS[state.category]} recentes`;
  const none = state.category === "all" ? "Nenhuma transação" : `Nenhuma transação ${CATEGORY[state.category].one}`;
  return `<div class="border-t border-gray-200">
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-4">
      <h3 class="flex items-center gap-2 text-[13px] font-semibold text-gray-900">${esc(heading)}${pill(String(ov.items.length), "gray")}</h3>
      <a href="${esc(href)}" class="rounded text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]">Ver em Pagamentos</a>
    </div>
    ${shown.length
      ? `<ul role="list" tabindex="-1" data-tx-focus="list" class="divide-y divide-gray-100 focus:outline-none">${shown.map(txRow).join("")}</ul>`
      : emptyState("receipt_long", `${none} ${periodSpan(ov.period)}.`)}
    ${rest > 0 ? `<div class="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
      <span class="text-[13px] tabular-nums text-gray-500">${shown.length} de ${ov.items.length}</span>
      <button type="button" data-tx-more data-tx-focus="more" class="${btnClass("secondary", "sm")}">Mostrar mais</button>
    </div>` : ""}
  </div>`;
}

/** O conteúdo do cartão das transações: os quadros, o gráfico e a lista. */
function txBody(ov: TransactionOverview, state: TxState): string {
  if (ov.summary.total.count === 0) {
    return `${txTiles(ov, state.category)}${emptyState(
      "monitoring",
      `Sem transações ${periodSpan(ov.period)}.`,
      ov.period === "12m" ? undefined : "Escolha um período maior para ver mais.",
    )}`;
  }
  return `${txTiles(ov, state.category)}${txChart(ov, state)}${txList(ov, state)}`;
}

function txSection(ov: TransactionOverview, state: TxState, notes: readonly string[]): string {
  return `<section aria-labelledby="ov-tx" class="mt-8">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="ov-tx" class="text-base font-bold text-gray-900">Transações</h2>
      <div class="flex max-w-full flex-wrap items-center gap-2">
        ${ov.hasOrders ? filterChips("tx-kind", "Origem das transações", [
          { value: "all", label: "Tudo" },
          { value: "plan", label: "Subscrições" },
          { value: "order", label: "Vendas das lojas" },
        ], state.kind) : ""}
        ${filterChips("tx-period", "Período das transações", TX_PERIODS.map((p) => ({ value: p, label: TX_PERIOD_LABELS[p] })), state.period)}
      </div>
    </div>
    ${notes.map((n) => `<div class="mb-3">${n}</div>`).join("")}
    <div id="ov-tx-body" class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">${txBody(ov, state)}</div>
  </section>`;
}

/* ------------------------------- A secção ------------------------------- */

/** Desenha a Visão geral. */
export async function renderOverview(view: AdminView): Promise<void> {
  view.loading();
  const now = Date.now();
  const [accounts, stores, withdrawals, transactions, verifications, sales] = await Promise.all([
    listAccounts(),
    listStores(),
    listAllWithdrawals(),
    listPlanPayments(),
    listVerifications({ pendingOnly: true }),
    // As vendas só servem as transações. Se não se lerem, o resto da Visão
    // geral aparece na mesma, e uma nota diz o que ficou de fora.
    listStoreOrders().catch((err: unknown) => {
      console.error("listStoreOrders", err);
      return null;
    }),
  ]);
  if (!view.isCurrent()) return;

  const input: AdminMetricsInput = {
    now, accounts, stores, withdrawals, transactions, orders: sales?.orders ?? [], verifications,
  };
  const kpis = overviewKpis(input);
  const attention = attentionLists(input);
  view.setNavCounts({ approvals: kpis.pendingVerifications, withdrawals: kpis.pendingWithdrawals });

  /**
   * As lojas da própria equipa, que os números desta secção não contam.
   *
   * `buildScope` (`src/services/adminMetrics.ts`) deixa de fora as lojas de uma
   * conta de administração: são de teste, e contá-las dava uma leitura falsa do
   * negócio. Mas um Administrador que criou lojas com a própria conta vê os
   * cartões a zero e conclui que o painel está roto. Dizer-lho é mais barato do
   * que mudar a regra, que está certa.
   */
  const adminIds = new Set(accounts.filter((a) => a.isAdmin).map((a) => a.id));
  const ownStores = stores.filter((s) => !s.isModel && adminIds.has(s.ownerId)).length;

  const month = new Date(now).toLocaleDateString("pt-PT", { month: "long" });
  const cards: Kpi[] = [
    {
      href: ADMIN_HREFS.contas,
      icon: "group",
      label: "Contas",
      value: String(kpis.accounts),
      hint: "Donos de loja registados",
    },
    {
      href: ADMIN_HREFS.lojasPublicadas,
      icon: "storefront",
      label: "Lojas publicadas",
      value: String(kpis.publishedStores),
      hint: kpis.publishedStores === 0
        ? "Ainda nenhuma no ar"
        : kpis.suspendedStores > 0
          ? `${kpis.suspendedStores} fora do ar (sem subscrição)`
          : "Todas no ar",
    },
    {
      href: ADMIN_HREFS.contasAtivas,
      icon: "workspace_premium",
      label: "Subscrições ativas",
      value: String(kpis.activeSubscriptions),
      hint: `De ${plural(kpis.accounts, "conta", "contas")}`,
    },
    {
      href: ADMIN_HREFS.subscricoes,
      icon: "payments",
      label: "Receita do mês",
      value: formatKz(kpis.monthRevenue),
      hint: `Subscrições pagas em ${month}`,
    },
    {
      href: ADMIN_HREFS.aprovacoes,
      icon: "verified_user",
      label: "Verificações por aprovar",
      value: String(kpis.pendingVerifications),
      hint: kpis.pendingVerifications > 0 ? "Empresas à espera de resposta" : "Nenhuma à espera",
      urgent: kpis.pendingVerifications > 0,
      wide: true,
    },
  ];

  const groups = [
    attentionGroup(
      "Verificações por aprovar",
      attention.verificationsToReview,
      { href: ADMIN_HREFS.aprovacoes, label: "Ver todas as verificações" },
      "verified_user",
      (i) => esc(i.at ? `Enviado ${ago(i.at, now)}` : ""),
    ),
    attentionGroup(
      "Levantamentos pedidos",
      attention.withdrawalsToApprove,
      { href: ADMIN_HREFS.levantamentos, label: "Ver todos os levantamentos" },
      "account_balance_wallet",
      (i) => `<span class="font-semibold text-gray-900">${esc(formatKz(i.amount ?? 0))}</span>`,
    ),
  ].filter(Boolean);

  const tx: TxState = { period: TX_DEFAULT_PERIOD, kind: "all", category: "all", shown: TX_ROWS };
  const txNotes = [
    sales ? "" : noteBox("Não foi possível ler as vendas das lojas: as transações mostram só as subscrições.", "warning"),
    sales?.truncated ? noteBox(`Das vendas das lojas, só entram as ${ADMIN_ORDERS_LIMIT} mais recentes.`) : "",
  ].filter(Boolean);

  const painted = view.paint(`
    <section aria-labelledby="ov-kpis">
      <h2 id="ov-kpis" class="sr-only">Números principais</h2>
      <ul role="list" class="grid grid-cols-2 gap-3 lg:grid-cols-5">${cards.map(kpiCard).join("")}</ul>
      ${PAYMENTS_PROVIDER_READY ? "" : `<div class="mt-3">${noteBox(`Os pagamentos online ainda não estão ligados: a receita só conta subscrições pagas na plataforma. Para ativar uma subscrição paga por outro meio, use «Ativar» em <a href="${esc(ADMIN_HREFS.contas)}" class="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500">Contas</a>.`)}</div>`}
      ${ownStores > 0 ? `<div class="mt-3">${noteBox(`${plural(ownStores, "loja", "lojas")} da sua própria conta de administração não entra${ownStores === 1 ? "" : "m"} nestes números, para não contar como negócio. ${ownStores === 1 ? "Está" : "Estão"} em <a href="${esc(ADMIN_HREFS.lojas)}" class="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500">Lojas</a>.`, "shield_person")}</div>` : ""}
    </section>

    ${txSection(transactionOverview(input, tx), tx, txNotes)}

    <section aria-labelledby="ov-attention" class="mt-8">
      <h2 id="ov-attention" class="mb-3 text-base font-bold text-gray-900">A precisar de atenção</h2>
      <div class="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        ${groups.length
          ? groups.join("")
          : emptyState("task_alt", "Está tudo em dia.", "Não há verificações nem levantamentos à espera.")}
      </div>
    </section>`);
  if (!painted) return;

  const body = document.getElementById("ov-tx-body");
  if (!body) return;

  /**
   * Volta a desenhar o cartão das transações com o que está escolhido. O foco
   * fica onde estava: o quadro carregado é outro elemento depois de desenhar, e
   * sem isto o teclado voltava ao início da página.
   */
  const drawTx = (): void => {
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && body.contains(active) ? active.dataset.txFocus : undefined;
    body.innerHTML = txBody(transactionOverview(input, tx), tx);
    if (!focusKey) return;
    (body.querySelector<HTMLElement>(`[data-tx-focus="${focusKey}"]`) ?? body.querySelector<HTMLElement>('[data-tx-focus="list"]'))?.focus();
  };

  bindChips("tx-period", (value) => {
    tx.period = TX_PERIODS.find((p) => p === value) ?? TX_DEFAULT_PERIOD;
    tx.shown = TX_ROWS;
    drawTx();
  });
  bindChips("tx-kind", (value) => {
    tx.kind = value === "plan" || value === "order" ? value : "all";
    tx.shown = TX_ROWS;
    drawTx();
  });
  body.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const tile = target.closest<HTMLElement>("[data-tx-cat]");
    if (tile) {
      tx.category = TX_CATEGORIES.find((c) => c === tile.dataset.txCat) ?? "all";
      tx.shown = TX_ROWS;
      drawTx();
    } else if (target.closest("[data-tx-more]")) {
      tx.shown += TX_ROWS;
      drawTx();
    }
  });
}
