/**
 * Analytics simples por loja: o funil de compra.
 *
 * Eventos gravados em `store_events` (migração 0017; tipos alargados na 0022):
 *  - `visit` — visita à página inicial da loja (uma por sessão do navegador);
 *  - `product_view` — página de um produto aberta;
 *  - `add_to_cart` — produto adicionado ao carrinho;
 *  - `whatsapp_order` — encomenda enviada por WhatsApp;
 *  - `checkout_start` — checkout aberto.
 */
import { supabase } from "./client.js";

export type StoreEventType = "visit" | "product_view" | "add_to_cart" | "whatsapp_order" | "checkout_start";

export interface StoreAnalytics {
  visits7: number;
  visits30: number;
  views7: number;
  views30: number;
  /** Adições ao carrinho nos últimos 30 dias. */
  carts30: number;
  /** Encomendas enviadas por WhatsApp nos últimos 30 dias. */
  whatsapp30: number;
  /** Encomendas por WhatsApp nos últimos 7 dias. */
  whatsapp7: number;
  /** Checkouts abertos nos últimos 30 dias. */
  checkouts30: number;
  /** Série dos últimos 14 dias: visitas por dia (ISO date → count). */
  daily: { date: string; visits: number; whatsapp: number }[];
  /** Produtos mais vistos (30 dias): productId → contagem. */
  topProducts: { productId: string; count: number }[];
}

/**
 * Regista um evento (fire-and-forget; nunca quebra a navegação).
 *
 * A visita conta **uma vez por sessão do navegador**: navegar entre a página
 * inicial e um produto e voltar não é uma visita nova. Antes cada regresso à
 * página inicial contava outra vez.
 */
export async function trackStoreEvent(storeId: string, type: StoreEventType, productId?: string): Promise<void> {
  try {
    if (type === "visit") {
      const key = `mb-visit:${storeId}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch { /* sem sessionStorage: conta na mesma */ }
    }
    await supabase.from("store_events").insert({ store_id: storeId, type, product_id: productId ?? null });
  } catch {
    /* silencioso */
  }
}

const DAY = 86_400_000;

/** Agrega os eventos da loja para o painel do Dono. */
export async function getStoreAnalytics(storeId: string): Promise<StoreAnalytics> {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { data } = await supabase
    .from("store_events")
    .select("type, product_id, created_at")
    .eq("store_id", storeId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20000);

  const rows = data ?? [];
  const now = Date.now();
  const within = (iso: string, days: number): boolean => now - new Date(iso).getTime() <= days * DAY;

  const out: StoreAnalytics = {
    visits7: 0, visits30: 0, views7: 0, views30: 0, carts30: 0,
    whatsapp30: 0, whatsapp7: 0, checkouts30: 0, daily: [], topProducts: [],
  };
  const dayMap = new Map<string, { visits: number; whatsapp: number }>();
  const prodMap = new Map<string, number>();

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    dayMap.set(d, { visits: 0, whatsapp: 0 });
  }

  for (const r of rows) {
    const day = dayMap.get(String(r.created_at).slice(0, 10));
    if (r.type === "visit") {
      out.visits30++;
      if (within(r.created_at, 7)) out.visits7++;
      if (day) day.visits++;
    } else if (r.type === "product_view") {
      out.views30++;
      if (within(r.created_at, 7)) out.views7++;
      if (r.product_id) prodMap.set(r.product_id, (prodMap.get(r.product_id) ?? 0) + 1);
    } else if (r.type === "add_to_cart") {
      out.carts30++;
    } else if (r.type === "whatsapp_order") {
      out.whatsapp30++;
      if (within(r.created_at, 7)) out.whatsapp7++;
      if (day) day.whatsapp++;
    } else if (r.type === "checkout_start") {
      out.checkouts30++;
    }
  }

  out.topProducts = [...prodMap.entries()]
    .map(([productId, count]) => ({ productId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  out.daily = [...dayMap.entries()].map(([date, v]) => ({ date, visits: v.visits, whatsapp: v.whatsapp }));
  return out;
}
