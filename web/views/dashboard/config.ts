/**
 * Separador «Configurações» do Dashboard do Dono.
 *
 * Ficou com o que ainda não existe e com o que não tem volta: as três
 * funcionalidades «Em breve» (domínio próprio, marketing e pixels, SMS de
 * confirmação — `src/services/comingSoon.ts`), sem campos, sem compras e sem
 * preços, e a zona de perigo para apagar a loja. As entregas, os códigos de
 * desconto e as avaliações passaram a ter separador próprio.
 */
import { go, toast, withBusy } from "../../lib/dom.js";
import { appState, deleteStore } from "../../composition.js";
import { getCustomization } from "../../supabase/customization.js";
import { getSmsCredits } from "../../supabase/sms.js";
import type { DashCtx } from "./context.js";
import { pageIntro } from "./ui.js";
import { configHtml, deleteStoreHtml } from "./markup.js";

export async function renderConfig(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store, ownerId } = ctx;
  // O saldo de SMS é só lido: «Em breve desliga, não apaga».
  const [custom, smsCredits] = await Promise.all([
    getCustomization(store.id),
    getSmsCredits(store.id),
  ]);

  const pintado = ctx.paint(`
    ${pageIntro("Estas três funcionalidades ainda não estão disponíveis. O que já tinha configurado fica guardado para quando abrirem.")}
    <div class="space-y-6">
      ${configHtml({ smsCredits, customDomain: custom.customDomain, metaPixelId: custom.marketing?.metaPixelId, gaId: custom.marketing?.gaId })}
      ${deleteStoreHtml(store.name)}
    </div>`);
  if (!pintado) return;

  // Apagar só acende quando o nome escrito é o da loja.
  const confirmacao = document.getElementById("delete-confirm") as HTMLInputElement | null;
  const botao = document.getElementById("delete-store") as HTMLButtonElement | null;
  const confere = (): boolean => (confirmacao?.value.trim() ?? "") === store.name.trim();
  confirmacao?.addEventListener("input", () => { if (botao) botao.disabled = !confere(); });
  botao?.addEventListener("click", async () => {
    if (!confere()) { toast("O nome não corresponde. A loja não foi apagada.", "error"); return; }
    const ok = await withBusy(() => deleteStore(ownerId, store.id), "A apagar a loja…");
    if (!ok) { toast("Não foi possível apagar a loja.", "error"); return; }
    toast("Loja apagada.");
    appState.storeId = null;
    go("#/painel");
  });
}
