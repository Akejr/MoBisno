/**
 * As encomendas e as vendas da loja, no «Início» do Dashboard do Dono.
 *
 * Estavam no separador «Pagamentos», que passou a ser só configuração (como os
 * clientes pagam e para onde vai o dinheiro). O que chegou, as encomendas por
 * WhatsApp e as vendas digitais, é a primeira coisa que o Dono quer ver ao
 * entrar, por isso vive no «Início».
 *
 * Duas partes:
 *  1. **Encomendas por WhatsApp**: sempre. Existem em toda a loja desde o
 *     primeiro dia, e numa loja sem pagamentos digitais são as únicas vendas.
 *  2. **Vendas e levantamentos** (Multicaixa Express e Referência Bancária): só
 *     quando os pagamentos digitais estão ligados na loja, ou quando há vendas
 *     **pagas** ou levantamentos para mostrar — o dinheiro que lá está não some
 *     por os pagamentos terem sido desligados. Tentativas falhadas ou por pagar
 *     não contam: punham os dois cartões, a zeros, numa loja que não recebe
 *     por Multicaixa.
 */
import { formatKz, toast, withButton } from "../../lib/dom.js";
import { deleteOrder, getOrderStats, listOrders, type OrderRow, type OrderStats, type PaymentVerification } from "../../supabase/payments.js";
import {
  listWhatsappOrders, setWhatsappOrderHandled, deleteWhatsappOrder, pendingWhatsappCount, type WhatsappOrderRow,
} from "../../supabase/whatsappOrders.js";
import {
  committedWithdrawals, listWithdrawals, requestWithdrawal, type WithdrawalAccount, type WithdrawalRow,
} from "../../supabase/withdrawals.js";
import { maskIban } from "../../../src/services/paymentVerification.js";
import { digitalPaymentsVisible } from "../../../src/services/paymentVisibility.js";
import type { Store } from "../../../src/models/index.js";
import type { DashCtx } from "./context.js";
import { BTN_SM, card, cardHead, emptyState, pill, plural } from "./ui.js";
import { orderRowHtml, salesSummaryHtml, whatsappOrdersHtml, withdrawalRowHtml } from "./markup.js";

/** Teto de vendas lidas para a lista (as mais recentes). */
const ORDERS_LIMIT = 100;

/** Vendas por página. */
const PAGE = 8;

/** O que se lê da base de dados para desenhar as encomendas e as vendas. */
export interface VendasLidas {
  waOrders: WhatsappOrderRow[];
  orders: OrderRow[];
  withdrawals: WithdrawalRow[];
  stats: OrderStats;
  committed: number;
}

/** O que a secção desenha, já com as decisões tomadas. */
export interface ModeloVendas extends VendasLidas {
  digitalVisible: boolean;
  mostrarVendas: boolean;
  available: number;
  conta: WithdrawalAccount | null;
}

/** Cinco leituras independentes, numa onda só. */
export async function loadVendas(store: Store): Promise<VendasLidas> {
  const [waOrders, orders, withdrawals, stats, committed] = await Promise.all([
    listWhatsappOrders(store.id),
    listOrders(store.id, ORDERS_LIMIT),
    listWithdrawals(store.id),
    getOrderStats(store.id),
    committedWithdrawals(store.id),
  ]);
  return { waOrders, orders, withdrawals, stats, committed };
}

/** As decisões da secção: o que se mostra, quanto se pode levantar e para onde. */
export function modeloVendas(store: Store, lidas: VendasLidas, verificacao: PaymentVerification): ModeloVendas {
  const { withdrawals, stats, committed } = lidas;
  const digitalVisible = digitalPaymentsVisible(store);
  const mostrarVendas = digitalVisible || stats.paidCount > 0 || withdrawals.length > 0;
  const available = Math.max(0, Math.round((stats.netReceived - committed) * 100) / 100);
  // O levantamento vai para a conta APROVADA. Com dados novos à espera de
  // aprovação, não há conta verificada para onde mandar o dinheiro.
  const conta: WithdrawalAccount | null = verificacao.status === "approved"
    ? { bankName: verificacao.bankName, beneficiaryName: verificacao.beneficiaryName, iban: verificacao.iban }
    : null;
  return { ...lidas, digitalVisible, mostrarVendas, available, conta };
}

/** Os cartões: as encomendas por WhatsApp sempre, as vendas e os levantamentos quando há. */
export function vendasHtml(m: ModeloVendas): string {
  const porTratar = pendingWhatsappCount(m.waOrders);
  const whatsapp = card(`
    ${cardHead({
      icon: "chat", title: "Encomendas por WhatsApp",
      subtitle: "Quem tocou em «Finalizar via WhatsApp», e o que tinha no carrinho.",
      aside: porTratar > 0 ? pill(`${porTratar} por tratar`, "warning") : pill(plural(m.waOrders.length, "encomenda", "encomendas"), "neutral"),
    })}
    <div id="wa-list">${whatsappOrdersHtml(m.waOrders)}</div>`);
  if (!m.mostrarVendas) return whatsapp;
  return `${whatsapp}
    ${card(`
      ${cardHead({
        icon: "receipt_long", title: "Vendas", subtitle: "Pagamentos por Multicaixa Express e Referência Bancária.",
        aside: `<span id="orders-count" class="text-sm text-gray-500">${plural(m.orders.length, "registo", "registos")}</span>`,
      })}
      ${salesSummaryHtml({ stats: m.stats, available: m.available, account: m.conta ? { bankName: m.conta.bankName, iban: m.conta.iban } : null })}
      <div class="mt-6 -mx-5 md:-mx-6 border-t border-gray-100">
        <ul id="orders-list"></ul>
        <div id="orders-pager" class="px-5 md:px-6 pt-3 flex flex-wrap items-center justify-between gap-2 text-sm empty:hidden"></div>
      </div>`)}
    ${card(`
      ${cardHead({ icon: "account_balance", title: "Levantamentos", subtitle: "Pedidos de transferência do saldo para a conta da empresa." })}
      ${m.withdrawals.length
        ? `<ul class="mt-4 -mx-5 md:-mx-6 border-t border-gray-100 divide-y divide-gray-100">${m.withdrawals.map(withdrawalRowHtml).join("")}</ul>`
        : emptyState({ icon: "account_balance", title: "Ainda não pediu nenhum levantamento", text: "Os pedidos aparecem aqui, com o estado de cada um." })}`)}`;
}

/**
 * Liga as ações dos cartões. `rerender` volta a desenhar o separador depois de
 * pedir um levantamento, porque o saldo disponível muda.
 */
export function ligarVendas(ctx: DashCtx, m: ModeloVendas, rerender: () => Promise<void>): void {
  ligarEncomendasWhatsapp(m.waOrders);
  if (m.mostrarVendas) ligarListaDeVendas(ctx, m, rerender);
}

/**
 * Lista das encomendas por WhatsApp: abrir o detalhe, marcar como tratada e
 * apagar. O estado em memória é a fonte da contagem, para o ecrã ficar coerente
 * sem recarregar.
 */
function ligarEncomendasWhatsapp(waOrders: WhatsappOrderRow[]): void {
  const lista = document.getElementById("wa-list");
  if (!lista) return;
  const redesenhar = (): void => {
    lista.innerHTML = whatsappOrdersHtml(waOrders);
  };
  lista.addEventListener("click", async (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-wa-toggle],[data-wa-handled],[data-wa-del]");
    if (!alvo) return;
    const abrir = alvo.dataset.waToggle;
    if (abrir) {
      const aberto = alvo.getAttribute("aria-expanded") === "true";
      alvo.setAttribute("aria-expanded", String(!aberto));
      document.getElementById(`wa-detail-${abrir}`)?.classList.toggle("hidden", aberto);
      return;
    }
    const tratar = alvo.dataset.waHandled;
    if (tratar) {
      const linha = waOrders.find((o) => o.id === tratar);
      if (!linha) return;
      const novo = !linha.handled;
      const ok = await withButton(alvo, () => setWhatsappOrderHandled(tratar, novo), "A guardar…");
      if (!ok) { toast("Não foi possível guardar.", "error"); return; }
      linha.handled = novo;
      redesenhar();
      return;
    }
    const apagar = alvo.dataset.waDel;
    if (!apagar) return;
    if (!confirm("Apagar este registo de encomenda? A conversa no WhatsApp não é afetada, mas o registo desaparece para sempre.")) return;
    const ok = await withButton(alvo, () => deleteWhatsappOrder(apagar), "A apagar…");
    if (!ok) { toast("Não foi possível apagar.", "error"); return; }
    const i = waOrders.findIndex((o) => o.id === apagar);
    if (i >= 0) waOrders.splice(i, 1);
    toast("Registo apagado.");
    redesenhar();
  });
}

/** Lista de vendas (paginada), apagar referências expiradas e pedir levantamento. */
function ligarListaDeVendas(ctx: DashCtx, m: ModeloVendas, rerender: () => Promise<void>): void {
  const { store, ownerId } = ctx;
  const { orders, available, conta } = m;
  const lista = document.getElementById("orders-list");
  const pager = document.getElementById("orders-pager");
  let pagina = 0;

  const desenhar = (): void => {
    if (!lista || !pager) return;
    if (!orders.length) {
      lista.innerHTML = `<li>${emptyState({
        icon: "receipt_long", title: "Ainda não há vendas",
        text: "Cada pagamento por Multicaixa Express ou Referência Bancária aparece aqui, com o valor líquido e a fatura.",
      })}</li>`;
      pager.innerHTML = "";
      return;
    }
    const paginas = Math.ceil(orders.length / PAGE);
    pagina = Math.max(0, Math.min(pagina, paginas - 1));
    lista.innerHTML = orders.slice(pagina * PAGE, pagina * PAGE + PAGE).map(orderRowHtml).join("");
    pager.innerHTML = paginas > 1 ? `
      <span class="text-gray-500">Página ${pagina + 1} de ${paginas}</span>
      <div class="flex gap-2">
        <button type="button" data-pg="prev" ${pagina === 0 ? "disabled" : ""} class="${BTN_SM}">Anterior</button>
        <button type="button" data-pg="next" ${pagina >= paginas - 1 ? "disabled" : ""} class="${BTN_SM}">Seguinte</button>
      </div>` : "";
  };

  /**
   * Apaga uma referência expirada e deixa o ecrã coerente sem recarregar: a
   * lista em memória é a fonte da contagem e da paginação. Só as expiradas são
   * apagáveis (`canDeleteOrder`), e a guarda de verdade é a política de
   * `delete` da base de dados (migração 0021).
   */
  const apagarVenda = async (btn: HTMLButtonElement): Promise<void> => {
    const id = btn.dataset.orderDel;
    if (!id) return;
    if (!confirm("Apagar este registo de referência expirada? A tentativa de compra deixa de aparecer nas suas vendas, para sempre, e não é possível recuperá-la.")) return;
    const apagado = await withButton(btn, () => deleteOrder(id), "A apagar…");
    if (!apagado) { toast("Não foi possível apagar este registo.", "error"); return; }
    const i = orders.findIndex((o) => o.id === id);
    if (i >= 0) orders.splice(i, 1);
    const contador = document.getElementById("orders-count");
    if (contador) contador.textContent = plural(orders.length, "registo", "registos");
    toast("Registo apagado.");
    desenhar();
  };

  desenhar();

  pager?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pg]");
    if (!b || b.disabled) return;
    pagina += b.dataset.pg === "next" ? 1 : -1;
    desenhar();
    lista?.querySelector<HTMLElement>("[data-order-toggle]")?.focus();
  });
  lista?.addEventListener("click", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-order-toggle],[data-order-del]");
    if (!alvo) return;
    if (alvo.dataset.orderToggle) {
      const aberto = alvo.getAttribute("aria-expanded") === "true";
      alvo.setAttribute("aria-expanded", String(!aberto));
      document.getElementById(`order-detail-${alvo.dataset.orderToggle}`)?.classList.toggle("hidden", aberto);
      return;
    }
    void apagarVenda(alvo);
  });

  const levantar = document.getElementById("request-withdraw") as HTMLButtonElement | null;
  levantar?.addEventListener("click", async () => {
    if (available <= 0 || !conta) return;
    const destino = `${maskIban(conta.iban)}${conta.bankName ? ` (${conta.bankName})` : ""}`;
    if (!confirm(`Pedir o levantamento de ${formatKz(available)} para a conta ${destino}?`)) return;
    const ok = await withButton(levantar, () => requestWithdrawal(store.id, ownerId, available, conta), "A enviar o pedido…");
    if (!ok) { toast("Não foi possível enviar o pedido de levantamento.", "error"); return; }
    toast("Pedido de levantamento enviado. A equipa MôBisno trata dele.");
    await rerender();
  });
}
