/**
 * Decisão ÚNICA de visibilidade dos pagamentos digitais (Multicaixa Express e
 * Referência Bancária) numa Loja.
 *
 * O WhatsApp está sempre disponível: qualquer loja nasce a vender por WhatsApp.
 * Os pagamentos digitais exigem duas coisas, e só as duas juntas:
 *
 *  1. **a Loja foi aprovada** — o Dono enviou os dados e os documentos da empresa
 *     no separador «Pagamentos» e a MôBisno aprovou. O sinal é a coluna
 *     `stores.digital_payments`, que só a aprovação liga (gatilho da migração
 *     0023): o Dono não a consegue escrever;
 *  2. **o fornecedor de pagamentos está ligado** (`PAYMENTS_PROVIDER_READY`).
 *
 * Substitui o espelho `customization.payments.onlineEnabled`, que o próprio Dono
 * escrevia na sua personalização — um interruptor que ele controlava a decidir o
 * que o checkout anunciava, enquanto o servidor decidia por outra coluna. As duas
 * chegaram a divergir.
 *
 * Consumida pelo checkout, pela gaveta do carrinho, pela página do carrinho e
 * pela página de produto («Comprar agora»). Nenhum outro sítio decide.
 */
import { PAYMENTS_PROVIDER_READY } from "./payments.js";

/**
 * Os pagamentos digitais aparecem nesta Loja?
 *
 * Total: aceita qualquer valor e nunca lança. Só o booleano `true` em
 * `digitalPayments` conta — sem coerção.
 *
 * @param store A Loja (só `digitalPayments` é lido).
 * @param providerReady Para testes; por omissão, o estado real do fornecedor.
 */
export function digitalPaymentsVisible(
  store: { digitalPayments?: unknown } | null | undefined,
  providerReady: boolean = PAYMENTS_PROVIDER_READY,
): boolean {
  return providerReady === true && !!store && store.digitalPayments === true;
}
