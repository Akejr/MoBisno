/**
 * Pré-visualização PRIVADA da loja, antes de estar publicada.
 *
 * PORQUÊ EXISTE: com o preço único, criar a loja e vê-la é grátis; a subscrição
 * serve para a publicar. Mas uma loja por publicar é invisível na web — o
 * `storefrontResolver.resolve` devolve `not_found` e as políticas de leitura da
 * base de dados recusam-na. Sem esta vista, o Dono construía a loja às cegas e
 * só a via depois de pagar, que é exactamente a ordem errada.
 *
 * Mostra a loja **tal como ficará publicada** — mesmo modelo, mesmas cores,
 * mesmos produtos —, com uma barra por cima a dizer que só ele a vê.
 *
 * QUEM VÊ: só o dono. São três defesas independentes, e nenhuma delas é esta
 * vista: `resolveForOwner` compara o `ownerId`, o repositório filtra por dono, e
 * as políticas da base de dados impedem ler a loja de outra pessoa. Aqui apenas
 * se pede a sessão de quem está a ver.
 */
import { render, fadeInImages, esc } from "../lib/dom.js";
import { getTemplate } from "../templates/registry.js";
import { loadStorePreview } from "../lib/storeCache.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { mountParticlesHeroes } from "../lib/particlesHero.js";
import { mountTestimonials } from "../lib/testimonialsCarousel.js";
import { applyNoindexSeo } from "../lib/seo.js";
import { currentOwnerId } from "../composition.js";
import { go } from "../lib/dom.js";

const ACCENT = "#F95901";

/** Barra fixa que impede confundir a pré-visualização com a loja publicada. */
function previewBar(publicada: boolean): string {
  return `<div id="mb-preview-bar" style="position:sticky;top:0;z-index:60;background:#111827;color:#fff;font-family:Inter,system-ui,sans-serif">
    <div style="max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="material-symbols-outlined" style="font-size:19px;color:${ACCENT}">visibility</span>
      <span style="font-size:13px;font-weight:700">Pré-visualização</span>
      <span style="font-size:13px;opacity:.75;flex:1;min-width:180px">${publicada
        ? "Esta loja está publicada. Está a ver a versão atual."
        : "Só você vê esta página. Para a pôr online, ative a subscrição."}</span>
      <a href="#/painel" style="font-size:13px;font-weight:700;color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.25);border-radius:9px;padding:6px 12px">Voltar ao painel</a>
      ${publicada ? "" : `<a href="#/painel/plano" style="font-size:13px;font-weight:700;color:#fff;text-decoration:none;background:${ACCENT};border-radius:9px;padding:6px 12px">Ativar subscrição</a>`}
    </div>
  </div>`;
}

/** Ecrã de recusa: sem sessão, ou a loja não é de quem está a ver. */
function denied(mensagem: string): string {
  return `<div style="min-height:70vh;display:flex;align-items:center;justify-content:center;padding:32px;font-family:Inter,system-ui,sans-serif">
    <div style="text-align:center;max-width:380px">
      <span class="material-symbols-outlined" style="font-size:40px;color:#9ca3af">lock</span>
      <h1 style="font-size:20px;font-weight:800;margin:12px 0 6px;color:#111827">Pré-visualização indisponível</h1>
      <p style="font-size:14px;color:#6b7280;line-height:1.6">${esc(mensagem)}</p>
      <a href="#/painel" style="display:inline-block;margin-top:18px;background:${ACCENT};color:#fff;font-weight:700;font-size:14px;border-radius:11px;padding:10px 18px;text-decoration:none">Ir para o painel</a>
    </div>
  </div>`;
}

/** Desenha a pré-visualização privada da loja `identifier`. */
export async function renderStorePreview(identifier: string): Promise<void> {
  // Nunca indexável: é conteúdo por publicar, e num domínio que o Google
  // rastreia. Sem isto, um rascunho podia acabar nos resultados de pesquisa.
  applyNoindexSeo("Pré-visualização — MôBisno");

  const ownerId = await currentOwnerId();
  if (!ownerId) {
    render(denied("Precisa de entrar na sua conta para ver a pré-visualização."));
    return;
  }

  const { result, view, custom } = await loadStorePreview(identifier, ownerId);
  if (result.kind !== "render" || view.kind !== "render") {
    render(denied("Esta loja não existe ou não lhe pertence."));
    return;
  }

  const template = getTemplate(view.templateId);
  const app = render(previewBar(result.store.state === "Publicada") + template.render(view, custom));
  app.style.setProperty("--brand", brandOf(custom, view.templateId));
  app.style.setProperty("--brand-ink", readableInk(brandOf(custom, view.templateId)));
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  mountParticlesHeroes(app);
  mountTestimonials(app);

  // O carrinho e o checkout não são montados de propósito: isto é uma vista da
  // loja, não uma loja a funcionar. Comprar aqui gravaria encomendas a sério
  // numa loja que ainda não está aberta ao público.
  app.querySelectorAll<HTMLElement>("[data-add-cart],[data-cart-link]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
  });

  app.querySelector<HTMLElement>('[href="#/painel"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    go("#/painel");
  });
}
