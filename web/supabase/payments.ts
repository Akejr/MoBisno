/**
 * Pagamentos de uma loja (Supabase): a verificação de empresa para os
 * pagamentos digitais e as encomendas.
 *
 * `store_payments` guarda, por loja, os dados da empresa (nome e NIF), a conta
 * bancária onde recebe, os caminhos dos documentos (Matrícula e Certidão) e o
 * estado da verificação. Só o Dono e o Administrador leem a linha (RLS). O
 * estado não é do Dono: o gatilho `store_payments_guard` (migração 0023) impede-o
 * de se aprovar e devolve o pedido a «em análise» quando ele muda dados já
 * aprovados.
 *
 * Os documentos vão para o bucket **privado** `company-documents`, numa pasta
 * por loja (`<storeId>/…`). Não há URL pública: o Administrador abre-os por URL
 * assinado, válido por poucos minutos.
 *
 * `orders` é de leitura para o Dono, mais a eliminação das referências expiradas
 * (`orders_owner_delete`, migração 0021). Criar e confirmar encomendas é das
 * funções serverless (`api/_payments.js`).
 */
import { supabase } from "./client.js";
import { canDeleteOrder, isReferenceExpired, orderEffectiveStatus, type OrderLifecycle } from "../../src/services/payments.js";
import {
  asVerificationStatus, checkDocument, type CompanyDocumentId, type ValidVerification, type VerificationStatus,
} from "../../src/services/paymentVerification.js";

/*
 * As regras de ciclo de vida (expirada / apagável) vivem em
 * `src/services/payments.ts`: são puras, não precisam do Supabase e assim podem
 * ser testadas com exemplos — este módulo não pode ser importado num teste
 * porque `./client.js` exige as variáveis de ambiente do browser.
 */
export { canDeleteOrder, isReferenceExpired, orderEffectiveStatus, type OrderLifecycle };

/** Bucket privado dos documentos das empresas. */
export const COMPANY_DOCUMENTS_BUCKET = "company-documents";

/** Pedido de verificação de uma loja, tal como está gravado. */
export interface PaymentVerification {
  status: VerificationStatus;
  companyName: string;
  companyNif: string;
  bankName: string;
  beneficiaryName: string;
  iban: string;
  /** Caminho de cada documento no bucket privado (ou `null`). */
  documents: Record<CompanyDocumentId, string | null>;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  /**
   * Faturação da **empresa do Dono** (Vero): a organização e se já há chave
   * guardada.
   *
   * A chave secreta nunca sai da base de dados para o painel — só se sabe se
   * existe. É a mesma razão por que a leitura de `store_payments` não é pública:
   * com essa chave, qualquer pessoa emitia documentos fiscais em nome da empresa
   * dele.
   */
  veroOrgId: string;
  veroKeySaved: boolean;
  /** A chave guardada é de teste (`vero_test_sk_`): não chega à AGT. */
  veroTestKey: boolean;
}

export const EMPTY_VERIFICATION: PaymentVerification = {
  status: "none",
  companyName: "",
  companyNif: "",
  bankName: "",
  beneficiaryName: "",
  iban: "",
  documents: { matricula: null, certidao: null },
  rejectionReason: null,
  submittedAt: null,
  reviewedAt: null,
  veroOrgId: "",
  veroKeySaved: false,
  veroTestKey: false,
};

const VERIFICATION_COLUMNS =
  "store_id, company_name, company_nif, bank_name, beneficiary_name, iban, doc_matricula, doc_certidao, verification_status, rejection_reason, submitted_at, reviewed_at, vero_org_id, vero_key_set, vero_key_test";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Linha de `store_payments` → pedido de verificação. */
export function toVerification(r: any): PaymentVerification {
  if (!r) return { ...EMPTY_VERIFICATION, documents: { ...EMPTY_VERIFICATION.documents } };
  return {
    status: asVerificationStatus(r.verification_status),
    companyName: r.company_name ?? "",
    companyNif: r.company_nif ?? "",
    bankName: r.bank_name ?? "",
    beneficiaryName: r.beneficiary_name ?? "",
    iban: r.iban ?? "",
    documents: { matricula: r.doc_matricula ?? null, certidao: r.doc_certidao ?? null },
    rejectionReason: r.rejection_reason ?? null,
    submittedAt: r.submitted_at ?? null,
    reviewedAt: r.reviewed_at ?? null,
    veroOrgId: r.vero_org_id ?? "",
    // Colunas derivadas (migração 0024): o navegador pergunta **se** há chave,
    // nunca pela chave. `vero_api_key` não está no `select` de propósito.
    veroKeySaved: r.vero_key_set === true,
    veroTestKey: r.vero_key_test === true,
  };
}

/**
 * Guarda (ou apaga) as credenciais Vero da empresa da loja.
 *
 * `apiKey` a `null` mantém a que já estava — o formulário mostra a chave como
 * guardada e não a devolve, por isso um campo vazio significa «não mexer».
 * `""` desliga a faturação.
 *
 * Devolve `null` em sucesso, ou a frase do erro.
 */
export async function saveVeroCredentials(
  storeId: string,
  input: { orgId: string; apiKey: string | null },
): Promise<string | null> {
  const orgId = input.orgId.trim();
  if (orgId !== "" && !/^[\w-]{3,120}$/.test(orgId)) {
    return "O identificador da organização só tem letras, algarismos, hífen ou sublinhado.";
  }
  const row: Record<string, unknown> = { store_id: storeId, vero_org_id: orgId || null, updated_at: new Date().toISOString() };
  if (input.apiKey !== null) {
    const key = input.apiKey.trim();
    if (key !== "" && !key.startsWith("vero_")) {
      return "A chave do Vero começa por «vero_». A chave pública (pk) não serve: é preciso a de servidor (sk).";
    }
    row.vero_api_key = key || null;
  }
  const { error } = await supabase.from("store_payments").upsert(row, { onConflict: "store_id" });
  if (error) {
    console.error("saveVeroCredentials", error);
    return "Não foi possível guardar. Tente de novo.";
  }
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Lê o pedido de verificação de uma loja (vazio se ainda não existe). */
export async function getPaymentVerification(storeId: string): Promise<PaymentVerification> {
  const { data, error } = await supabase
    .from("store_payments")
    .select(VERIFICATION_COLUMNS)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) console.error("getPaymentVerification", error);
  return toVerification(data);
}

/**
 * Envia (ou reenvia) o pedido de verificação: grava os dados validados e põe o
 * estado em «em análise». Devolve `null` em sucesso, ou a frase do erro.
 */
export async function submitPaymentVerification(storeId: string, v: ValidVerification): Promise<string | null> {
  const row = {
    store_id: storeId,
    company_name: v.companyName,
    company_nif: v.companyNif,
    bank_name: v.bankName,
    beneficiary_name: v.beneficiaryName,
    iban: v.iban,
    doc_matricula: v.documents.matricula,
    doc_certidao: v.documents.certidao,
    verification_status: "pending",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("store_payments").upsert(row, { onConflict: "store_id" });
  if (error) {
    console.error("submitPaymentVerification", error);
    return "Não foi possível enviar o pedido. Tente de novo.";
  }
  return null;
}

/**
 * Carrega um documento da empresa para o bucket privado. Devolve o caminho
 * gravado, ou a frase do erro.
 *
 * Cada envio é um ficheiro **novo** (nome aleatório, sem substituir): é a mudança
 * de caminho em `store_payments` que devolve um pedido aprovado a «em análise».
 */
export async function uploadCompanyDocument(
  storeId: string,
  doc: CompanyDocumentId,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkDocument(bytes);
  if (!check.ok) return { ok: false, message: check.message };
  const ext = check.format === "jpeg" ? "jpg" : check.format;
  const path = `${storeId}/${doc}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(COMPANY_DOCUMENTS_BUCKET)
    .upload(path, new Blob([bytes], { type: check.contentType }), { contentType: check.contentType, upsert: false });
  if (error) {
    console.error("uploadCompanyDocument", error);
    return { ok: false, message: "Não foi possível carregar o documento. Tente de novo." };
  }
  return { ok: true, path };
}

/** URL temporário (5 minutos) para abrir um documento privado. */
export async function companyDocumentUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).createSignedUrl(path, 300);
  if (error) { console.error("companyDocumentUrl", error); return null; }
  return data?.signedUrl ?? null;
}

/* -------------------------------- Encomendas -------------------------------- */

export interface OrderRow {
  id: string;
  method: "mcx" | "reference" | "whatsapp";
  status: "open" | "paid" | "failed" | "cancelled";
  amount: number;
  fee: number;
  net: number;
  subtotal: number | null;
  deliveryFee: number;
  discountAmount: number;
  invoiceUrl: string | null;
  referenceNumber: string | null;
  referenceEntity: string | null;
  /** Data-limite da referência bancária (ISO), quando aplicável. */
  dueDate: string | null;
  customer: { name?: string; nif?: string; phone?: string; email?: string; address?: string; area?: string } | null;
  products: { productName?: string; productQuantity?: number; productPrice?: number }[];
  createdAt: string;
  paidAt: string | null;
}

export interface OrderStats {
  totalSales: number;   // soma de `amount` das encomendas pagas
  netReceived: number;  // soma de `net` (depois da comissão do fornecedor)
  totalFees: number;    // soma das comissões
  paidCount: number;
  pendingCount: number; // referências por pagar (ainda dentro do prazo)
}

/** Lê as encomendas de uma loja (mais recentes primeiro). */
export async function listOrders(storeId: string, limit = 50): Promise<OrderRow[]> {
  const { data } = await supabase
    .from("orders")
    .select("id, method, status, amount, fee, net, subtotal, delivery_fee, discount_amount, invoice_url, reference_number, reference_entity, reference_due_date, customer, products, created_at, paid_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    method: r.method,
    status: r.status,
    amount: Number(r.amount),
    fee: Number(r.fee),
    net: Number(r.net),
    subtotal: r.subtotal == null ? null : Number(r.subtotal),
    deliveryFee: Number(r.delivery_fee ?? 0),
    discountAmount: Number(r.discount_amount ?? 0),
    invoiceUrl: r.invoice_url,
    referenceNumber: r.reference_number,
    referenceEntity: r.reference_entity,
    dueDate: r.reference_due_date ?? null,
    customer: r.customer,
    products: Array.isArray(r.products) ? r.products : [],
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
}

/**
 * Apaga uma encomenda e diz se a linha **desapareceu mesmo**.
 *
 * O `.select("id")` não é enfeite: sem política de `delete` que cubra a linha, o
 * Supabase devolve zero linhas afetadas e **nenhum erro**. A política é a guarda:
 * aceita só referências expiradas e por pagar.
 */
export async function deleteOrder(orderId: string): Promise<boolean> {
  const { data, error } = await supabase.from("orders").delete().eq("id", orderId).select("id");
  if (error) { console.error("deleteOrder", error); return false; }
  return (data ?? []).length > 0;
}

/** Resumo financeiro de uma loja (calculado a partir das encomendas). */
export async function getOrderStats(storeId: string): Promise<OrderStats> {
  const { data } = await supabase
    .from("orders")
    .select("status, method, amount, fee, net, reference_due_date")
    .eq("store_id", storeId);
  const rows = data ?? [];
  const stats: OrderStats = { totalSales: 0, netReceived: 0, totalFees: 0, paidCount: 0, pendingCount: 0 };
  for (const r of rows) {
    if (r.status === "paid") {
      stats.totalSales += Number(r.amount);
      stats.netReceived += Number(r.net);
      stats.totalFees += Number(r.fee);
      stats.paidCount += 1;
    } else if (r.status === "open" && r.method === "reference"
      && !isReferenceExpired({ status: r.status, method: r.method, dueDate: r.reference_due_date ?? null })) {
      stats.pendingCount += 1;
    }
  }
  return stats;
}
