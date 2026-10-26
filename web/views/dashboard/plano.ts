/**
 * Separador «Plano» do Dashboard do Dono.
 *
 * Cada loja tem a sua subscrição (`src/services/plans.ts`, migração 0025): este
 * ecrã é o da loja escolhida no seletor. Diz o estado da subscrição dela e como
 * a ativar. Enquanto não houver serviço de pagamentos
 * (`PAYMENTS_PROVIDER_READY`), a ativação é feita pela equipa MôBisno e o ecrã
 * diz isso, com o email para a pedir.
 */
import { openPlanCheckout } from "../../lib/planCheckout.js";
import { checkStatus } from "../../lib/paymentsApi.js";
import { toast } from "../../lib/dom.js";
import { PAYMENTS_PROVIDER_READY } from "../../../src/services/payments.js";
import type { DashCtx } from "./context.js";
import { pageIntro } from "./ui.js";
import { planHtml } from "./markup.js";

/** Forma de um identificador de pagamento, para não consultar lixo. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O pagamento que o Dono acabou de fazer na página do fornecedor, lido do
 * endereço de regresso (`/painel/plano?pagamento=<id>&tipo=plan&loja=<id>`). A
 * loja do endereço é a que o painel abre (`web/views/dashboard.ts`).
 *
 * O endereço **não prova nada** — é trivial de abrir à mão. Serve só para saber
 * o que perguntar ao servidor, que é quem decide.
 */
function pagamentoDeRegresso(): string | null {
  try {
    const p = new URLSearchParams(location.search).get("pagamento") ?? "";
    return UUID.test(p) ? p : null;
  } catch {
    return null;
  }
}

/** Tira o parâmetro do endereço, para um recarregamento não repetir a consulta. */
function limparEndereco(): void {
  try {
    history.replaceState(history.state, "", location.pathname);
  } catch { /* nada a fazer */ }
}

export async function renderPlano(ctx: DashCtx): Promise<void> {
  const { billing, store } = ctx;
  const pintado = ctx.paint(`
    ${pageIntro(`Cada loja tem a sua subscrição. Esta é a da loja «${store.name}»: criar, personalizar e pré-visualizar não custa nada, e a subscrição serve para a pôr online.`)}
    ${planHtml({ billing, providerReady: PAYMENTS_PROVIDER_READY, storeName: store.name, identifier: store.identifier })}`);
  if (!pintado) return;

  document.getElementById("plan-pay")?.addEventListener("click", () => {
    if (!PAYMENTS_PROVIDER_READY) return;
    openPlanCheckout({ storeId: store.id, storeName: store.name, onPaid: () => { void ctx.reload(); } });
  });

  /*
   * Regresso da página de pagamento. O servidor confirma com o fornecedor e,
   * se estiver pago, soma os 30 dias à loja — uma só vez, mesmo que o Dono
   * recarregue (`activated_at`, migração 0023). Só depois se recarrega o
   * painel, para o estado da subscrição já aparecer novo.
   */
  const pendente = pagamentoDeRegresso();
  if (!pendente) return;
  limparEndereco();
  toast("A confirmar o pagamento…");
  const st = await checkStatus({ kind: "plan", id: pendente });
  if (st.success && st.status === "paid") {
    toast("Subscrição ativada. Já pode publicar a loja.");
    void ctx.reload();
    return;
  }
  if (st.success && (st.status === "failed" || st.status === "cancelled")) {
    toast(st.message || "O pagamento não foi concluído.", "error");
    return;
  }
  toast(st.message || "Ainda não recebemos a confirmação. Se pagou por referência, a subscrição é ativada quando o banco processar.", "error");
}
