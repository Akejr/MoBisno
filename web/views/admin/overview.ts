/**
 * «Visão geral» do Painel de Administração.
 *
 * Os cinco números que contam e o que está à espera de uma decisão — mais nada.
 * Cada número é uma ligação para a secção onde se age sobre ele; o detalhe
 * (listas, histórico, filtros) vive nessa secção, não aqui.
 *
 * Os números saem de `overviewKpis` e a lista de `attentionLists`
 * (`src/services/adminMetrics.ts`), sobre os mesmos dados: o número de um cartão
 * e o comprimento da lista correspondente nunca divergem. As lojas-modelo e as
 * contas de administração ficam fora de todos.
 */
import { esc, formatKz } from "../../lib/dom.js";
import {
  listAccounts, listAllWithdrawals, listPlanPayments, listStores, listVerifications,
} from "../../supabase/admin.js";
import {
  ADMIN_HREFS, attentionLists, overviewKpis, type AttentionItem,
} from "../../../src/services/adminMetrics.js";
import { PAYMENTS_PROVIDER_READY } from "../../../src/services/payments.js";
import { ago, emptyState, icon, noteBox, pill, plural, type AdminView } from "./ui.js";

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
    <a href="${esc(k.href)}" class="flex h-full flex-col rounded-2xl border bg-white p-4 transition-colors hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] focus-visible:ring-offset-2 ${k.urgent ? "border-orange-300" : "border-gray-200"}">
      <span class="flex items-center gap-2 text-sm font-medium text-gray-700">${icon(k.icon, "text-[20px] text-[#F95901]")}<span class="min-w-0">${esc(k.label)}</span></span>
      <span class="mt-2 text-xl xl:text-2xl font-black tracking-tight break-words ${k.urgent ? "text-orange-700" : "text-gray-900"}">${esc(k.value)}</span>
      <span class="mt-1 text-xs text-gray-600">${esc(k.hint)}</span>
    </a>
  </li>`;
}

function attentionRow(item: AttentionItem, iconName: string, aside: string): string {
  return `<li>
    <a href="${esc(item.href)}" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F95901]">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50">${icon(iconName, "text-[20px] text-[#F95901]")}</span>
      <span class="min-w-0 flex-1">
        <span class="block font-semibold text-gray-900 break-words">${esc(item.title)}</span>
        <span class="block text-sm text-gray-600 break-words">${esc(item.detail)}</span>
      </span>
      <span class="shrink-0 text-right text-sm text-gray-700">${aside}</span>
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
      <h3 class="flex items-center gap-2 text-sm font-bold text-gray-900">${esc(title)}${pill(String(items.length), "amber")}</h3>
      <a href="${esc(all.href)}" class="rounded text-sm font-semibold text-orange-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]">${esc(all.label)}</a>
    </div>
    <ul role="list" class="divide-y divide-gray-100">${items.slice(0, ATTENTION_ROWS).map((i) => attentionRow(i, iconName, aside(i))).join("")}</ul>
    ${rest > 0 ? `<p class="px-4 pb-3 text-sm text-gray-600">E mais ${rest}.</p>` : ""}
  </div>`;
}

/** Desenha a Visão geral. */
export async function renderOverview(view: AdminView): Promise<void> {
  view.loading();
  const now = Date.now();
  const [accounts, stores, withdrawals, transactions, verifications] = await Promise.all([
    listAccounts(),
    listStores(),
    listAllWithdrawals(),
    listPlanPayments(),
    listVerifications({ pendingOnly: true }),
  ]);
  if (!view.isCurrent()) return;

  const input = { now, accounts, stores, withdrawals, transactions, verifications };
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

  view.paint(`
    <section aria-labelledby="ov-kpis">
      <h2 id="ov-kpis" class="sr-only">Números principais</h2>
      <ul role="list" class="grid grid-cols-2 gap-3 lg:grid-cols-5">${cards.map(kpiCard).join("")}</ul>
      ${PAYMENTS_PROVIDER_READY ? "" : `<div class="mt-3">${noteBox(`Os pagamentos online ainda não estão ligados: a receita só conta subscrições pagas na plataforma. Para ativar uma subscrição paga por outro meio, use «Ativar» em <a href="${esc(ADMIN_HREFS.contas)}" class="font-semibold text-orange-700 underline">Contas</a>.`)}</div>`}
      ${ownStores > 0 ? `<div class="mt-3">${noteBox(`${plural(ownStores, "loja", "lojas")} da sua própria conta de administração não entra${ownStores === 1 ? "" : "m"} nestes números, para não contar como negócio. ${ownStores === 1 ? "Está" : "Estão"} em <a href="${esc(ADMIN_HREFS.lojas)}" class="font-semibold text-orange-700 underline">Lojas</a>.`, "shield_person")}</div>` : ""}
    </section>

    <section aria-labelledby="ov-attention" class="mt-8">
      <h2 id="ov-attention" class="mb-3 text-base font-bold text-gray-900">A precisar de atenção</h2>
      <div class="divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        ${groups.length
          ? groups.join("")
          : emptyState("task_alt", "Está tudo em dia.", "Não há verificações nem levantamentos à espera.")}
      </div>
    </section>`);
}
