/**
 * Encomendas por WhatsApp — as que o cliente envia pela conversa.
 *
 * ## Porque é que isto existe
 *
 * Uma loja sem pagamentos digitais vende **só** por WhatsApp, e até agora não
 * deixava rasto nenhum: o cliente clicava em «Finalizar via WhatsApp», a
 * conversa abria, e o Dono só sabia da encomenda se a mensagem chegasse mesmo.
 * Se o cliente desistisse a meio, ou escrevesse para o número errado, a venda
 * desaparecia sem ninguém saber que tinha existido.
 *
 * Agora, no momento em que o cliente decide encomendar, o carrinho e os dados de
 * contacto dele ficam gravados (`whatsapp_orders`, migração 0024) e aparecem no
 * painel do Dono — com o que ele escolheu, quanto era, para onde ia e como lhe
 * ligar de volta. É a lista que substitui, nessas lojas, os cartões de vendas
 * digitais que elas não têm.
 *
 * ## O que a base de dados garante
 *
 * O visitante só **insere** (não lê, não altera, não apaga) e apenas em lojas
 * publicadas; o `handled` e a data são postos pelo gatilho, não por ele. Ler é
 * do Dono da loja e do Administrador. Nada do que uma pessoa escreve no checkout
 * é visível a outra.
 */
import { supabase } from "./client.js";

/** Uma linha do carrinho, como ficou gravada. */
export interface WhatsappOrderItem {
  name: string;
  quantity: number;
  price: number;
  variantLabel?: string;
}

/** Dados de contacto que o cliente deixou. */
export interface WhatsappOrderCustomer {
  name?: string;
  phone?: string;
  email?: string;
  nif?: string;
  address?: string;
  area?: string;
}

/** De onde partiu o clique. */
export type WhatsappOrderOrigin = "checkout" | "carrinho" | "gaveta" | "produto";

export interface WhatsappOrderRow {
  id: string;
  storeId: string;
  customer: WhatsappOrderCustomer;
  items: WhatsappOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  origin: WhatsappOrderOrigin;
  handled: boolean;
  createdAt: string;
}

/** Máximo de linhas gravadas (a política da base de dados recusa acima disto). */
const MAX_ITEMS = 100;

/** Texto aparado e cortado; `undefined` quando fica vazio. */
function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim().replace(/\s+/g, " ").slice(0, max).trim();
  return t === "" ? undefined : t;
}

/** Número utilizável, ou 0. */
function amount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRow(r: any): WhatsappOrderRow {
  const c = r.customer && typeof r.customer === "object" ? r.customer : {};
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    customer: {
      name: c.name ?? undefined,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      nif: c.nif ?? undefined,
      address: c.address ?? undefined,
      area: c.area ?? undefined,
    },
    items: Array.isArray(r.items) ? r.items : [],
    subtotal: Number(r.subtotal ?? 0),
    deliveryFee: Number(r.delivery_fee ?? 0),
    discountAmount: Number(r.discount_amount ?? 0),
    total: Number(r.total ?? 0),
    origin: r.origin === "carrinho" || r.origin === "gaveta" || r.origin === "produto" ? r.origin : "checkout",
    handled: r.handled === true,
    createdAt: String(r.created_at ?? ""),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Grava a encomenda que o cliente acabou de enviar por WhatsApp.
 *
 * **Nunca pode atrapalhar a venda**: não lança e não espera pelo resultado para
 * a conversa abrir. Se a gravação falhar, o cliente encomenda como sempre — só
 * o Dono fica sem o registo.
 */
export async function recordWhatsappOrder(input: {
  storeId: string;
  items: readonly WhatsappOrderItem[];
  subtotal: number;
  deliveryFee?: number;
  discountAmount?: number;
  total: number;
  customer?: WhatsappOrderCustomer;
  origin?: WhatsappOrderOrigin;
}): Promise<void> {
  try {
    const items = input.items.slice(0, MAX_ITEMS).map((i) => {
      const linha: WhatsappOrderItem = {
        name: text(i.name, 160) ?? "Artigo",
        quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
        price: amount(i.price),
      };
      const v = text(i.variantLabel, 120);
      if (v) linha.variantLabel = v;
      return linha;
    });
    if (!items.length) return;

    const c = input.customer ?? {};
    const customer: WhatsappOrderCustomer = {};
    const name = text(c.name, 120);
    if (name) customer.name = name;
    const phone = text(c.phone, 20);
    if (phone) customer.phone = phone;
    const email = text(c.email, 160);
    if (email) customer.email = email;
    const nif = text(c.nif, 20);
    if (nif) customer.nif = nif;
    const address = text(c.address, 300);
    if (address) customer.address = address;
    const area = text(c.area, 60);
    if (area) customer.area = area;

    await supabase.from("whatsapp_orders").insert({
      store_id: input.storeId,
      customer,
      items,
      subtotal: amount(input.subtotal),
      delivery_fee: amount(input.deliveryFee),
      discount_amount: amount(input.discountAmount),
      total: amount(input.total),
      origin: input.origin ?? "checkout",
    });
  } catch {
    /* silencioso de propósito: ver o comentário da função */
  }
}

/** Encomendas por WhatsApp de uma loja, as mais recentes primeiro (do Dono). */
export async function listWhatsappOrders(storeId: string, limit = 50): Promise<WhatsappOrderRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_orders")
    .select("id, store_id, customer, items, subtotal, delivery_fee, discount_amount, total, origin, handled, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("listWhatsappOrders", error); return []; }
  return (data ?? []).map(toRow);
}

/** Marca (ou desmarca) uma encomenda como tratada. */
export async function setWhatsappOrderHandled(id: string, handled: boolean): Promise<boolean> {
  const { data, error } = await supabase
    .from("whatsapp_orders").update({ handled }).eq("id", id).select("id");
  if (error) { console.error("setWhatsappOrderHandled", error); return false; }
  return (data ?? []).length > 0;
}

/** Apaga o registo de uma encomenda por WhatsApp. */
export async function deleteWhatsappOrder(id: string): Promise<boolean> {
  const { data, error } = await supabase.from("whatsapp_orders").delete().eq("id", id).select("id");
  if (error) { console.error("deleteWhatsappOrder", error); return false; }
  return (data ?? []).length > 0;
}

/** Quantas estão por tratar (para o aviso do painel). */
export function pendingWhatsappCount(rows: readonly WhatsappOrderRow[]): number {
  return rows.reduce((n, r) => n + (r.handled ? 0 : 1), 0);
}
