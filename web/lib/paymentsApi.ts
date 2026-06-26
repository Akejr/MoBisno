/**
 * Cliente do frontend para as funções serverless de pagamentos (`/api/...`).
 * A chave MoMenu vive só no servidor; aqui só passamos o `storeId` (ou os dados
 * do plano) e os dados do pedido.
 */
import type { PaymentProduct, PaymentCustomer } from "../../src/services/payments.js";

export interface InitPaymentInput {
  kind?: "store" | "plan" | "sms";
  storeId?: string;
  ownerId?: string;
  plan?: string;
  /** Quantidade de mensagens, quando kind="sms". */
  smsQuantity?: number;
  method: "mcx" | "reference";
  products: PaymentProduct[];
  amount?: number;
  phoneNumber?: string;
  customer?: PaymentCustomer;
  /** Id do código de desconto aplicado (incrementa os usos no servidor). */
  discountCodeId?: string;
  qa?: boolean;
  simulateResult?: string;
}

export interface PaymentResult {
  success: boolean;
  error?: string;
  code?: string;
  orderId?: string | null;
  kind?: string;
  method?: "mcx" | "reference";
  status?: "open" | "paid" | "failed" | "cancelled";
  transactionId?: string | null;
  operationId?: string | null;
  invoiceUrl?: string | null;
  entity?: string | null;
  referenceNumber?: string | null;
  dueDate?: string | null;
  amount?: number;
  fee?: number;
  net?: number;
}

export interface StatusResult {
  success: boolean;
  error?: string;
  code?: string;
  status?: "open" | "paid" | "failed" | "cancelled";
  message?: string | null;
  invoiceUrl?: string | null;
}

/** Inicia um pagamento (MCX imediato ou Referência). */
export async function initPayment(input: InitPaymentInput): Promise<PaymentResult> {
  try {
    const r = await fetch("/api/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await r.json()) as PaymentResult;
  } catch {
    return { success: false, error: "Não foi possível contactar o serviço de pagamentos.", code: "NETWORK" };
  }
}

/** Verifica o estado de uma referência (fallback do webhook). */
export async function checkStatus(params: {
  operationId: string;
  merchantTransactionId?: string;
  storeId?: string;
  ownerId?: string;
}): Promise<StatusResult> {
  const qs = new URLSearchParams();
  qs.set("operationId", params.operationId);
  if (params.merchantTransactionId) qs.set("merchantTransactionId", params.merchantTransactionId);
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.ownerId) qs.set("ownerId", params.ownerId);
  try {
    const r = await fetch(`/api/payment-status?${qs.toString()}`);
    return (await r.json()) as StatusResult;
  } catch {
    return { success: false, error: "Falha de rede.", code: "NETWORK" };
  }
}
