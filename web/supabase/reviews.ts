/** Avaliações de produtos (estrelas + comentário). Submissão pública; o Dono modera. */
import { supabase } from "./client.js";

export interface Review {
  id: string;
  storeId: string;
  productId: string;
  author: string;
  rating: number;
  comment: string;
  approved: boolean;
  createdAt: string;
}

export interface RatingSummary { average: number; count: number; }

function toReview(r: Record<string, unknown>): Review {
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    productId: String(r.product_id),
    author: String(r.author_name ?? ""),
    rating: Number(r.rating ?? 0),
    comment: String(r.comment ?? ""),
    approved: r.approved === true,
    createdAt: String(r.created_at ?? ""),
  };
}

/** Avaliações aprovadas de um produto (mais recentes primeiro). */
export async function listProductReviews(productId: string): Promise<Review[]> {
  const { data } = await supabase
    .from("reviews")
    .select("id, store_id, product_id, author_name, rating, comment, approved, created_at")
    .eq("product_id", productId)
    .eq("approved", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toReview);
}

/** Resumo (média + total) de avaliações aprovadas de um produto. */
export function summarize(reviews: Review[]): RatingSummary {
  if (!reviews.length) return { average: 0, count: 0 };
  const sum = reviews.reduce((s, r) => s + r.rating, 0);
  return { average: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
}

/** Submete uma avaliação. Devolve erro legível ou null em sucesso. */
export async function submitReview(
  storeId: string,
  productId: string,
  input: { author: string; rating: number; comment?: string },
): Promise<string | null> {
  const author = input.author.trim();
  if (author.length < 1) return "Indique o seu nome.";
  if (!(input.rating >= 1 && input.rating <= 5)) return "Escolha de 1 a 5 estrelas.";
  const { error } = await supabase.from("reviews").insert({
    store_id: storeId, product_id: productId, author_name: author, rating: Math.round(input.rating),
    comment: (input.comment ?? "").trim() || null,
  });
  if (error) { console.error("submitReview", error); return "Não foi possível enviar a avaliação."; }
  return null;
}

/** Todas as avaliações de uma loja (Dono — moderação). */
export async function listStoreReviews(storeId: string): Promise<Review[]> {
  const { data } = await supabase
    .from("reviews")
    .select("id, store_id, product_id, author_name, rating, comment, approved, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toReview);
}

export async function setReviewApproved(id: string, approved: boolean): Promise<boolean> {
  const { error } = await supabase.from("reviews").update({ approved }).eq("id", id);
  return !error;
}

export async function deleteReview(id: string): Promise<boolean> {
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  return !error;
}
