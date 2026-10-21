/**
 * Separador «Avaliações» do Dashboard do Dono: a moderação.
 *
 * Desde a migração 0022 uma avaliação nova entra por aprovar e só aparece na
 * página do produto — e no `aggregateRating` que o Google lê — depois de o Dono
 * a aprovar aqui. Por isso as por aprovar vêm primeiro, com a contagem à vista.
 */
import { toast, withBusy, withButton } from "../../lib/dom.js";
import { productRepository } from "../../composition.js";
import { deleteReview, listStoreReviews, setReviewApproved, type Review } from "../../supabase/reviews.js";
import type { DashCtx } from "./context.js";
import { notice, pageIntro } from "./ui.js";
import { reviewsHtml } from "./markup.js";

export async function renderAvaliacoes(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store } = ctx;
  const [lidas, produtos] = await Promise.all([
    listStoreReviews(store.id),
    productRepository.listByStore(store.id),
  ]);
  let avaliacoes: Review[] = lidas;
  const nomes = new Map(produtos.map((p) => [p.id, p.name]));

  const pintado = ctx.paint(`
    ${pageIntro("O que os clientes dizem dos seus produtos. Aprove as que quer mostrar na loja.")}
    <div class="mb-6">${notice("info", "info", "", "As avaliações novas só aparecem na página do produto depois de as aprovar. Esconder uma avaliação tira-a da loja sem a apagar.")}</div>
    <div id="rv-list">${reviewsHtml(avaliacoes, nomes)}</div>`);
  if (!pintado) return;

  const lista = document.getElementById("rv-list");
  const redesenhar = (): void => { if (lista) lista.innerHTML = reviewsHtml(avaliacoes, nomes); };

  // Um ouvinte só para a lista inteira: redesenhar não deixa botões sem ligação.
  lista?.addEventListener("click", async (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-rv-approve],[data-rv-hide],[data-rv-del]");
    if (!alvo) return;
    const id = alvo.dataset.rvApprove ?? alvo.dataset.rvHide ?? alvo.dataset.rvDel ?? "";
    const r = avaliacoes.find((x) => x.id === id);
    if (!r) return;

    if (alvo.dataset.rvDel) {
      if (!confirm(`Apagar a avaliação de ${r.author || "Cliente"}? Não é possível recuperá-la.`)) return;
      const ok = await withBusy(() => deleteReview(id), "A apagar a avaliação…");
      if (!ok) { toast("Não foi possível apagar a avaliação.", "error"); return; }
      avaliacoes = avaliacoes.filter((x) => x.id !== id);
      toast("Avaliação apagada.");
      redesenhar();
      return;
    }

    const aprovar = Boolean(alvo.dataset.rvApprove);
    const ok = await withButton(alvo, () => setReviewApproved(id, aprovar), aprovar ? "A aprovar…" : "A esconder…");
    if (!ok) { toast("Não foi possível atualizar a avaliação.", "error"); return; }
    r.approved = aprovar;
    toast(aprovar ? "Avaliação aprovada: já aparece na página do produto." : "Avaliação escondida: saiu da loja.");
    redesenhar();
  });
}
