/**
 * Cliente do navegador para as funções serverless de pagamento (`/api/payment`,
 * `/api/payment-status`).
 *
 * O navegador já não diz preços: envia os ids dos produtos, as Combinação e as
 * quantidades, e o servidor calcula o montante a partir da base de dados
 * (`api/_payments.js`). O pagamento da subscrição vai com o token da sessão — o
 * servidor lê o Dono daí, nunca de um campo do corpo.
 *
 * Enquanto o fornecedor de pagamentos não estiver ligado, o servidor responde
 * `PAYMENTS_UNAVAILABLE` e a interface nem chega a chamar isto
 * (`PAYMENTS_PROVIDER_READY` em `src/services/payments.ts`).
 */
import { supabase } from "../supabase/client.js";
import type { DigitalPaymentMethod, OrderStatus, PaymentCustomer } from "../../src/services/payments.js";

/** Linha pedida: o Produto, a Combinação e a quantidade. Nada de preços. */
export interface OrderLineRequest {
  id: string;
  variantKey?: string;
  quantity: number;
}

export type InitPaymentInput =
  | {
      kind: "store";
      storeId: string;
      method: DigitalPaymentMethod;
      lines: OrderLineRequest[];
      customer?: PaymentCustomer;
      discountCode?: string;
      /** Total que o comprador viu. Se o servidor calcular outro, responde `PRICE_CHANGED`. */
      expectedTotal?: number;
      phone?: string;
    }
  | {
      kind: "plan";
      /** A loja cuja subscrição se paga: cada loja tem a sua (migração 0025). */
      storeId: string;
      method: DigitalPaymentMethod;
      phone?: string;
    };

export interface PaymentResult {
  success: boolean;
  error?: string;
  code?: string;
  kind?: "store" | "plan";
  /** Id interno: a encomenda ou o pagamento de plano. */
  id?: string;
  method?: DigitalPaymentMethod;
  status?: OrderStatus;
  amount?: number;
  /** Total recalculado pelo servidor, quando o código é `PRICE_CHANGED`. */
  total?: number;
  /**
   * Endereço do **checkout alojado** do fornecedor: é onde o cliente paga e
   * onde escolhe entre Multicaixa Express e Referência Bancária. Nenhum
   * pagamento está pago no momento em que é criado.
   */
  hostedUrl?: string | null;
  reference?: { entity: string; number: string; dueDate?: string } | null;
  invoiceUrl?: string | null;
}

export interface StatusResult {
  success: boolean;
  error?: string;
  code?: string;
  status?: OrderStatus;
  /**
   * Estado da janela de consulta do fornecedor. `"closed"` quer dizer que já
   * passaram os ~5 minutos em que ele responde: **não** quer dizer que não foi
   * pago. Uma Referência paga mais tarde é confirmada pelo aviso do fornecedor.
   */
  window?: "open" | "closed";
  /** Método que o cliente escolheu de facto na página do fornecedor. */
  method?: DigitalPaymentMethod;
  /** Código de desfecho do fornecedor (explica uma recusa). */
  statusCode?: string | null;
  /** Frase a mostrar ao comprador, quando o servidor a tem. */
  message?: string | null;
  /** Entidade e referência do ATM, quando o cliente escolheu Referência. */
  reference?: { entity: string; number: string; dueDate?: string } | null;
  invoiceUrl?: string | null;
  /** Estado da fatura: `pending` (a validar na AGT), `validated`, `rejected`… */
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
}

/** Cabeçalho com o token da sessão, quando há sessão. */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Inicia um pagamento (MCX imediato ou Referência). */
export async function initPayment(input: InitPaymentInput): Promise<PaymentResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (input.kind === "plan") Object.assign(headers, await authHeader());
    const r = await fetch("/api/payment", { method: "POST", headers, body: JSON.stringify(input) });
    return (await r.json()) as PaymentResult;
  } catch {
    return { success: false, error: "Não foi possível contactar o serviço de pagamentos.", code: "NETWORK" };
  }
}

/** Verifica o estado de um pagamento («Já paguei — verificar»). */
export async function checkStatus(params: { kind: "store" | "plan"; id: string }): Promise<StatusResult> {
  const qs = new URLSearchParams({ kind: params.kind, id: params.id });
  try {
    const r = await fetch(`/api/payment-status?${qs.toString()}`);
    return (await r.json()) as StatusResult;
  } catch {
    return { success: false, error: "Falha de rede.", code: "NETWORK" };
  }
}
