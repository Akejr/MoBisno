/** Analytics simples por loja: visitas e visualizações de produto. */
import { supabase } from "./client.js";

export interface StoreAnalytics {
  visits7: number;
  visits30: number;
  views7: number;
  views30: number;
  /** Série dos últimos 14 dias: visitas por dia (ISO date → count). */
  daily: { date: string; visits: number }[];
  /** Produtos mais vistos (30 dias): productId → contagem. */
  topProducts: { productId: string; count: number }[];
}

/** Regista um evento (fire-and-forget; nunca quebra a navegação). */
export async function trackStoreEvent(storeId: string, type: "visit" | "product_view", productId?: string): Promise<void> {
  try {
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
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const now = Date.now();
  const within = (iso: string, days: number): boolean => now - new Date(iso).getTime() <= days * DAY;

  let visits7 = 0, visits30 = 0, views7 = 0, views30 = 0;
  const dayMap = new Map<string, number>();
  const prodMap = new Map<string, number>();

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    dayMap.set(d, 0);
  }

  for (const r of rows) {
    if (r.type === "visit") {
      visits30++;
      if (within(r.created_at, 7)) visits7++;
      const d = String(r.created_at).slice(0, 10);
      if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
    } else if (r.type === "product_view") {
      views30++;
      if (within(r.created_at, 7)) views7++;
      if (r.product_id) prodMap.set(r.product_id, (prodMap.get(r.product_id) ?? 0) + 1);
    }
  }

  const topProducts = [...prodMap.entries()]
    .map(([productId, count]) => ({ productId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const daily = [...dayMap.entries()].map(([date, visits]) => ({ date, visits }));
  return { visits7, visits30, views7, views30, daily, topProducts };
}
