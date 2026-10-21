/**
 * Domínio de pagamentos (módulo puro e testável), independente do fornecedor.
 *
 * ## O que mudou
 *
 * A integração com a MoMenu saiu. O que fica aqui é o que vale para qualquer
 * fornecedor: os métodos que o checkout conhece, os estados de uma encomenda, o
 * total de uma encomenda e o ciclo de vida das referências bancárias.
 *
 * A ligação ao fornecedor novo é **um adaptador** em `api/_provider.js` — o
 * único ficheiro que fala com a API de pagamentos. Enquanto não houver
 * adaptador, `PAYMENTS_PROVIDER_READY` é `false`: o checkout das lojas mostra só
 * o WhatsApp, e o pagamento da subscrição dentro da plataforma fica indisponível
 * (o administrador ativa as subscrições à mão).
 */

/** Métodos de pagamento conhecidos pelo checkout. */
export type PaymentMethod = "mcx" | "reference" | "whatsapp";

/** Métodos de pagamento digital (os que passam pelo fornecedor). */
export type DigitalPaymentMethod = "mcx" | "reference";

/** Estado gravado de uma encomenda ou transação. */
export type OrderStatus = "open" | "paid" | "failed" | "cancelled";

/**
 * O fornecedor de pagamentos está ligado?
 *
 * **Ligado: a Wiza** (`api/_wizapay.js`, através de `api/_provider.js`).
 *
 * É a única bandeira que decide, no navegador, se os pagamentos digitais
 * aparecem: no checkout das lojas aprovadas e no separador «Plano» do Dashboard.
 * A decisão final é sempre do servidor, que responde `PAYMENTS_UNAVAILABLE`
 * quando as credenciais não estão configuradas — esta bandeira só evita mostrar
 * botões que iriam falhar.
 */
export const PAYMENTS_PROVIDER_READY = true;

/**
 * Montante mínimo de um pagamento digital, em Kz.
 *
 * Abaixo disto o fornecedor aceita a cobrança, o cliente paga e **o valor não é
 * creditado** — por isso o checkout recusa antes de criar a cobrança, e o
 * servidor volta a validar (`api/_wizapay.js`). Espelhado lá.
 */
export const MIN_PAYMENT_KZ = 100;

/** Linha de uma encomenda tal como o checkout a envia ao servidor. */
export interface PaymentProduct {
  id?: string;
  productName: string;
  productPrice: number;
  productQuantity: number;
  /** Combinação vendida (cor, tamanho…) — ver `src/services/variations.ts`. */
  variantKey?: string;
}

/** Dados do cliente final que acompanham a encomenda. */
export interface PaymentCustomer {
  name?: string;
  nif?: string;
  phone?: string;
  email?: string;
  /** Morada de entrega (rua, número, ponto de referência). */
  address?: string;
  /** Área de entrega escolhida (ex.: «Talatona»). */
  area?: string;
}

/** Arredonda para 2 casas decimais (Kwanzas), evitando ruído de vírgula flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Total dos produtos: SUM(productPrice × productQuantity). */
export function productsTotal(products: readonly PaymentProduct[]): number {
  return round2(products.reduce((sum, p) => sum + p.productPrice * p.productQuantity, 0));
}

/** Verdadeiro se uma linha de encomenda tem nome, preço positivo e quantidade inteira positiva. */
export function isValidProduct(p: PaymentProduct): boolean {
  if (!p || typeof p.productName !== "string" || p.productName.trim() === "") return false;
  if (!Number.isFinite(p.productPrice) || p.productPrice <= 0) return false;
  if (!Number.isInteger(p.productQuantity) || p.productQuantity <= 0) return false;
  return true;
}

/** Normaliza um número de telemóvel angolano para o formato 244XXXXXXXXX. */
export function normalizeAoPhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.startsWith("244")) return digits;
  if (digits.length === 9) return `244${digits}`;
  return digits;
}

/** Telemóvel angolano utilizável (9 algarismos, a começar por 9, com ou sem 244). */
export function isValidAoPhone(input: string): boolean {
  return /^2449\d{8}$/.test(normalizeAoPhone(input));
}

/* ===================== Ciclo de vida de uma encomenda ===================== */

/**
 * Os campos de uma encomenda que decidem o seu ciclo de vida.
 *
 * Só isto: o estado gravado, o método, a data-limite da referência e o momento
 * do pagamento. Chega para decidir se uma encomenda expirou e se pode ser
 * apagada, e permite que estas regras vivam aqui — puras, sem Supabase e sem
 * DOM — em vez de dentro da vista que as apresenta.
 */
export interface OrderLifecycle {
  status: string;
  method: string;
  /** Data-limite da referência bancária (ISO), quando aplicável. */
  dueDate: string | null;
  /** Momento do pagamento, quando existe. */
  paidAt?: string | null;
}

/**
 * Uma referência bancária por pagar (`open`) cuja data-limite já passou é
 * considerada **expirada** — deixa de ficar "pendente" para sempre.
 *
 * `agora` é parâmetro (e não `Date.now()` escrito no meio do cálculo) para a
 * regra ser testável com exemplos em vez de depender do relógio do teste.
 */
export function isReferenceExpired(row: OrderLifecycle, agora: number = Date.now()): boolean {
  if (row.status !== "open" || row.method !== "reference" || !row.dueDate) return false;
  const t = Date.parse(row.dueDate);
  return Number.isFinite(t) && t < agora;
}

/** Estado efetivo de uma encomenda (com "expired" derivado da data-limite). */
export function orderEffectiveStatus(row: OrderLifecycle, agora: number = Date.now()): string {
  return isReferenceExpired(row, agora) ? "expired" : row.status;
}

/**
 * Uma encomenda pode ser apagada pelo Dono?
 *
 * **Só as referências expiradas.** São o único desfecho que já não muda de
 * ideias: o prazo passou, a referência deixou de ser pagável, e a linha ficava
 * na lista de Vendas para sempre sem nunca virar dinheiro.
 *
 * Uma encomenda paga nunca é apagável, e a condição diz isso duas vezes — pelo
 * estado e pelo `paidAt`. A guarda de verdade é a política de `delete` da base
 * de dados (migração `0021_orders_owner_delete.sql`), que repete a mesma
 * condição; esta função existe para a interface só oferecer o que a base de
 * dados aceita.
 */
export function canDeleteOrder(row: OrderLifecycle, agora: number = Date.now()): boolean {
  if (row.status === "paid" || row.paidAt) return false;
  return isReferenceExpired(row, agora);
}
