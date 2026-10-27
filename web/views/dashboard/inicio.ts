/**
 * Separador «Início» do Dashboard do Dono.
 *
 * O que o Dono quer saber ao entrar, por esta ordem: a loja está no ar? Que
 * encomendas chegaram? O que falta fazer? Por isso: uma faixa com o estado da
 * loja (com o botão de publicar), as encomendas e as vendas (`vendas.ts`), e ao
 * lado os «Próximos passos» e o funil dos últimos 30 dias, os dois compactos.
 *
 * As encomendas e as vendas vieram do separador «Pagamentos», que passou a ser
 * só configuração.
 *
 * Quem saltou a confirmação do telemóvel no assistente de criação encontra aqui
 * o aviso que falta fechar: sem o número confirmado, a loja não vai para o ar
 * (migração 0026).
 */
import { esc, go, toast, withBusy } from "../../lib/dom.js";
import { assetRepository, getOwnerName, productRepository, setStoreState } from "../../composition.js";
import { getCustomization } from "../../supabase/customization.js";
import { getStoreAnalytics } from "../../supabase/analytics.js";
import { getPaymentVerification } from "../../supabase/payments.js";
import { canPublishStore } from "../../../src/services/billing.js";
import { openPhoneVerify } from "../../lib/phoneVerify.js";
import type { DashCtx } from "./context.js";
import { BTN_LINK, card, cardHead, icon } from "./ui.js";
import {
  deliveryConfigured, funnelHtml, nextSteps, nextStepsHtml, phoneNoticeHtml, storeStatusHtml, whatsappConfigured,
} from "./markup.js";
import { copyText } from "./forms.js";
import { ligarVendas, loadVendas, modeloVendas, vendasHtml } from "./vendas.js";

export async function renderInicio(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store, billing, ownerId } = ctx;
  // Sete leituras independentes, numa onda só: o ecrã custa o tempo da mais lenta.
  const [products, ownerName, analytics, custom, logo, verification, lidas] = await Promise.all([
    productRepository.listByStore(store.id),
    getOwnerName(ownerId),
    getStoreAnalytics(store.id),
    getCustomization(store.id),
    assetRepository.findLogo(store.id),
    getPaymentVerification(store.id),
    loadVendas(store),
  ]);

  const publicar = canPublishStore(billing, ctx.phoneVerified);
  const passos = nextSteps({
    products: products.length,
    hasLogo: logo !== null,
    whatsappOk: whatsappConfigured(custom),
    deliveryOk: deliveryConfigured(custom.delivery),
    published: store.state === "Publicada",
    accessActive: billing.accessActive,
    verification: verification.status,
  });
  const vendas = modeloVendas(store, lidas, verification);
  const primeiroNome = ownerName.trim().split(/\s+/)[0] || store.name;

  const pintado = ctx.paint(`
    <section class="mb-5">
      <h2 class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 break-words">Olá, ${esc(primeiroNome)}</h2>
      <p class="mt-1 text-gray-600">O resumo da loja <strong class="text-gray-900">${esc(store.name)}</strong>.</p>
    </section>
    ${storeStatusHtml({ state: store.state, billing, publish: publicar, storeUrl: ctx.storeUrl, previewUrl: ctx.previewUrl })}
    ${ctx.phoneVerified ? "" : `<div class="mt-6">${phoneNoticeHtml({ phone: ctx.phone })}</div>`}
    <div class="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <div class="xl:col-span-2 space-y-6 min-w-0">${vendasHtml(vendas)}</div>
      <div class="space-y-6 min-w-0">
        ${card(`${cardHead({ icon: "checklist", title: "Próximos passos" })}${nextStepsHtml(passos)}`)}
        ${card(`
          ${cardHead({
            icon: "filter_alt", title: "Funil de compra", subtitle: "Últimos 30 dias",
            aside: `<a href="#/painel/analises" class="${BTN_LINK}">Ver análises ${icon("arrow_forward", "text-[16px]")}</a>`,
          })}
          <div class="mt-5">${funnelHtml({ visits: analytics.visits30, views: analytics.views30, carts: analytics.carts30, whatsapp: analytics.whatsapp30 })}</div>`)}
      </div>
    </div>`);
  if (!pintado) return;

  document.getElementById("copy-url")?.addEventListener("click", async () => {
    if (await copyText(ctx.storeUrl)) toast("Endereço copiado.");
    else toast(`Copie o endereço à mão: ${ctx.storeUrl.replace(/^https?:\/\//, "")}`, "error");
  });
  const botao = document.getElementById("toggle-state") as HTMLButtonElement | null;
  botao?.addEventListener("click", () => void mudarEstado(ctx, botao.dataset.next === "Publicada"));
  document.querySelectorAll<HTMLButtonElement>("[data-step-publish]").forEach((b) =>
    b.addEventListener("click", () => void mudarEstado(ctx, true)));
  // Dois caminhos para o mesmo modal: o aviso em cartão e a frase da faixa de
  // estado. Confirmado, o painel é redesenhado — o botão de publicar acende.
  for (const id of ["verify-phone", "verify-phone-card"]) {
    document.getElementById(id)?.addEventListener("click", () =>
      openPhoneVerify({ phone: ctx.phone, onVerified: () => { void ctx.reload(); } }));
  }
  ligarVendas(ctx, vendas, () => renderInicio(ctx));
}

/**
 * Publica ou despublica a loja.
 *
 * Publicar passa por `canPublishStore` antes de ir à base de dados: o gatilho
 * `stores_publish_requires_plan` recusaria na mesma, mas com um erro do Postgres
 * em vez de uma frase — e sem levar o Dono ao ecrã onde se resolve.
 */
async function mudarEstado(ctx: DashCtx, publicar: boolean): Promise<void> {
  if (publicar) {
    const decisao = canPublishStore(ctx.billing, ctx.phoneVerified);
    if (!decisao.allowed) {
      // O telemóvel resolve-se aqui mesmo, no modal; a subscrição é noutro ecrã.
      if (decisao.reason === "telefone-por-confirmar") {
        toast("Confirme o número de telemóvel para publicar a loja.", "error");
        openPhoneVerify({ phone: ctx.phone, onVerified: () => { void ctx.reload(); } });
        return;
      }
      toast("Ative a subscrição desta loja para a publicar.", "error");
      go("#/painel/plano");
      return;
    }
  } else if (!confirm("Despublicar a loja? Deixa de estar visível para os clientes até a voltar a publicar.")) {
    return;
  }
  const ok = await withBusy(
    () => setStoreState(ctx.ownerId, ctx.store.id, publicar ? "Publicada" : "Rascunho"),
    publicar ? "A publicar…" : "A despublicar…",
  );
  if (!ok) { toast("Não foi possível mudar o estado da loja.", "error"); return; }
  toast(publicar ? "Loja publicada." : "Loja despublicada.");
  await ctx.reload();
}
