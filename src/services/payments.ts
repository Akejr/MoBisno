/**
 * Domínio de pagamentos (módulo puro e testável) — integração MoMenu.
 *
 * Centraliza as regras de negócio dos pagamentos online (Multicaixa Express e
 * Referência Bancária) e o checkout: cálculo da taxa de processamento (2%),
 * validação de produtos/valores, métodos disponíveis e mapeamento dos estados
 * devolvidos pela API MoMenu para o estado interno da encomenda.
 *
 * Não tem dependências de infraestrutura. A iniciação real dos pagamentos vive
 * nas funções serverless (`/api/payment`), que guardam a chave MoMenu de cada
 * loja no servidor (nunca no frontend). Ver `api/payment.js`.
 *
 * Documentação da API: https://api.momenu.online/llms.txt
 */

import type { Result } from "../models/result.js";
import { ok, err } from "../models/result.js";

/** Métodos de pagamento suportados no checkout. */
export type PaymentMethod = "mcx" | "reference" | "whatsapp";

/** Estado de uma encomenda/transação. */
export type OrderStatus = "open" | "paid" | "failed" | "cancelled";

/** Taxa de processamento aplicada a todos os pagamentos online (2%). */
export const FEE_RATE = 0.02;

/** Valor mínimo por pagamento online, em Kwanzas. */
export const MIN_PAYMENT_KZ = 100;

/** Limite de IVA aceite pela API (0–14). Por omissão 0 (isento) quando omitido. */
export const VALID_IVA_RATES = [0, 2, 5, 7, 14] as const;

/** Item de produto enviado à API (fonte de verdade do valor da fatura). */
export interface PaymentProduct {
  id?: string;
  productName: string;
  productPrice: number;
  productQuantity: number;
  iva?: number;
}

/** Dados opcionais do cliente para a fatura. */
export interface PaymentCustomer {
  name?: string;
  nif?: string;
  phone?: string;
}

/** Arredonda para 2 casas decimais (Kwanzas), evitando ruído de vírgula flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Total dos produtos: SUM(productPrice × productQuantity). */
export function productsTotal(products: readonly PaymentProduct[]): number {
  return round2(products.reduce((sum, p) => sum + p.productPrice * p.productQuantity, 0));
}

/** Taxa de processamento (2%) sobre o valor total. */
export function computeFee(amount: number): number {
  return round2(amount * FEE_RATE);
}

/** Valor líquido (transferido para o comerciante): total − taxa. */
export function computeNet(amount: number): number {
  return round2(amount - computeFee(amount));
}

/** Verdadeiro se um item de produto é válido segundo as regras da API. */
export function isValidProduct(p: PaymentProduct): boolean {
  if (!p || typeof p.productName !== "string" || p.productName.trim() === "") return false;
  if (!Number.isFinite(p.productPrice) || p.productPrice <= 0) return false;
  if (!Number.isInteger(p.productQuantity) || p.productQuantity <= 0) return false;
  if (p.iva !== undefined && !(VALID_IVA_RATES as readonly number[]).includes(p.iva)) return false;
  return true;
}

/** Pedido de checkout normalizado (antes de chamar a API). */
export interface CheckoutRequest {
  method: Exclude<PaymentMethod, "whatsapp">;
  products: PaymentProduct[];
  amount?: number;
  /** Obrigatório para MCX. */
  phoneNumber?: string;
  customer?: PaymentCustomer;
}

/** Códigos de erro de validação locais (espelham os da API quando aplicável). */
export type PaymentValidationError =
  | "MISSING_PRODUCTS"
  | "INVALID_PRODUCT"
  | "BELOW_MINIMUM"
  | "AMOUNT_MISMATCH"
  | "MISSING_PHONE";

/**
 * Valida um pedido de checkout localmente (antes de gastar uma chamada à API).
 * Replica as regras-chave: produtos obrigatórios, item válido, mínimo de 100 KZ,
 * coerência amount↔produtos e telefone obrigatório no MCX.
 */
export function validateCheckout(req: CheckoutRequest): Result<{ amount: number }, PaymentValidationError> {
  if (!Array.isArray(req.products) || req.products.length === 0) return err("MISSING_PRODUCTS");
  if (!req.products.every(isValidProduct)) return err("INVALID_PRODUCT");

  const total = productsTotal(req.products);
  if (req.amount !== undefined && round2(req.amount) !== total) return err("AMOUNT_MISMATCH");
  if (total < MIN_PAYMENT_KZ) return err("BELOW_MINIMUM");
  if (req.method === "mcx" && !(req.phoneNumber && req.phoneNumber.trim() !== "")) return err("MISSING_PHONE");

  return ok({ amount: total });
}

/** Normaliza um número de telemóvel angolano para o formato 244XXXXXXXXX. */
export function normalizeAoPhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.startsWith("244")) return digits;
  if (digits.length === 9) return `244${digits}`;
  return digits;
}

/** Mapeia o `operationStatus` da API MoMenu para o estado interno da encomenda. */
export function mapMomenuStatus(operationStatus: string | number | undefined): OrderStatus {
  switch (String(operationStatus)) {
    case "1": return "paid";
    case "3": return "cancelled";
    case "4": return "failed";
    case "5": return "failed";
    default: return "open";
  }
}

/** Mapeia o `payment.status` do endpoint de status para o estado interno. */
export function mapStatusString(status: string | undefined): OrderStatus {
  switch ((status || "").toLowerCase()) {
    case "paid": return "paid";
    case "cancelled":
    case "canceled":
    case "expired": return "cancelled";
    case "failed":
    case "rejected": return "failed";
    default: return "open";
  }
}
