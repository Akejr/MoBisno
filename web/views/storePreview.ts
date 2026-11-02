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
 * QUEM VÊ: o Dono dela, e um Administrador da plataforma.
 *
 * Para o Dono são três defesas independentes, e nenhuma delas é esta vista:
 * `resolveForOwner` compara o `ownerId`, o repositório filtra por dono, e as
 * políticas da base de dados impedem ler a loja de outra pessoa.
 *
 * O Administrador entra por outra porta, `resolveForAdmin`, que não compara
 * donos — é `isCurrentUserAdmin()` que a abre, e as políticas `is_admin()` da
 * base de dados que a sustentam. Precisava dela: aprova pagamentos, ativa
 * subscrições e responde por lojas que não conseguia ver de outra forma (o
 * editor abre-as, mas mostra a loja com as ferramentas de edição por cima, e
 * não o que o cliente vai encontrar). A faixa do topo diz-lhe que a loja é de
 * outra pessoa.
 */
import { render, fadeInImages, esc } from "../lib/dom.js";
import { loadStorePreview } from "../lib/storeCache.js";
import { isCurrentUserAdmin } from "../supabase/viewer.js";
import { ADMIN_HREFS } from "../../src/services/adminMetrics.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { mountParticlesHeroes } from "../lib/particlesHero.js";
import { mountTestimonials } from "../lib/testimonialsCarousel.js";
import { updateCartBadge } from "../lib/cart.js";
import { applyNoindexSeo } from "../lib/seo.js";
import { currentOwnerId } from "../composition.js";
import { go } from "../lib/dom.js";
import { storeHomeHtml, storeBrand, STORE_DRAFT_LABEL } from "./storeHtml.js";

const ACCENT = "#F95901";

/** Para onde volta quem está a ver: o Dono ao painel dele, o Administrador às «Lojas». */
function backTo(admin: boolean): { href: string; label: string } {
  return admin
    ? { href: ADMIN_HREFS.lojas, label: "Voltar à Administração" }
    : { href: "#/painel", label: "Voltar ao Dashboard" };
}

/**
 * Barra fixa que impede confundir a pré-visualização com a loja publicada.
 *
 * Ao Administrador diz também **de quem é a loja que ele está a ver**: sem isso,
 * uma loja de outra pessoa aberta num separador parecia a loja dele, e
 * «Ativar subscrição» levava-o ao plano da conta errada (por isso esse botão só
 * aparece ao Dono).
 */
function previewBar(o: { publicada: boolean; admin: boolean; storeName: string }): string {
  const voltar = backTo(o.admin);
  const titulo = o.admin ? "Pré-visualização de administração" : o.publicada ? "Pré-visualização" : STORE_DRAFT_LABEL;
  const frase = o.admin
    ? `Loja de outro Dono, ${o.publicada ? "publicada" : "por publicar"}. Está a vê-la como um cliente a veria, e o Dono não é avisado.`
    : o.publicada
      ? "Esta loja está publicada. Está a ver a versão atual."
      : "Só você vê esta página. Para a pôr online, ative a subscrição.";
  return `<div id="mb-preview-bar" role="status" style="position:sticky;top:0;z-index:60;background:#111827;color:#fff;font-family:Inter,system-ui,sans-serif">
    <div style="max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="material-symbols-outlined" style="font-size:19px;color:${ACCENT}" aria-hidden="true">${o.admin ? "shield_person" : "visibility"}</span>
      <span style="font-size:13px;font-weight:700">${esc(titulo)}</span>
      ${o.admin ? `<span style="font-size:12px;font-weight:700;background:rgba(255,255,255,.14);border-radius:999px;padding:3px 9px">${esc(o.storeName)}</span>` : ""}
      <span style="font-size:13px;opacity:.75;flex:1;min-width:180px">${esc(frase)}</span>
      <a href="${esc(voltar.href)}" data-preview-back style="font-size:13px;font-weight:700;color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.25);border-radius:9px;padding:6px 12px">${esc(voltar.label)}</a>
      ${o.publicada || o.admin ? "" : `<a href="#/painel/plano" style="font-size:13px;font-weight:700;color:#fff;text-decoration:none;background:${ACCENT};border-radius:9px;padding:6px 12px">Ativar subscrição</a>`}
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
      <a href="#/painel" style="display:inline-block;margin-top:18px;background:${ACCENT};color:#fff;font-weight:700;font-size:14px;border-radius:11px;padding:10px 18px;text-decoration:none">Ir para o Dashboard</a>
    </div>
  </div>`;
}

/** Desenha a pré-visualização privada da loja `identifier`. */
export async function renderStorePreview(identifier: string): Promise<void> {
  // Nunca indexável: é conteúdo por publicar, e num domínio que o Google
  // rastreia. Sem isto, um rascunho podia acabar nos resultados de pesquisa.
  applyNoindexSeo("Pré-visualização | MôBisno");

  const ownerId = await currentOwnerId();
  if (!ownerId) {
    render(denied("Precisa de entrar na sua conta para ver a pré-visualização."));
    return;
  }

  /*
   * Primeiro como Dono. A pergunta «quem está a ver administra a plataforma?»
   * custa uma consulta, e só se faz quando a loja NÃO é de quem está a ver: o
   * caminho normal, o Dono a ver a loja dele, não a paga.
   */
  let loaded = await loadStorePreview(identifier, ownerId);
  let admin = false;
  if (loaded.result.kind !== "render") {
    admin = await isCurrentUserAdmin();
    if (admin) loaded = await loadStorePreview(identifier, ownerId, { admin: true });
  }
  const { result, view, custom } = loaded;
  if (result.kind !== "render" || view.kind !== "render") {
    render(denied(admin ? "Esta loja não existe." : "Esta loja não existe ou não lhe pertence."));
    return;
  }

  const app = render(previewBar({
    publicada: result.store.state === "Publicada",
    admin,
    storeName: result.store.name,
  }) + storeHomeHtml(view, custom));
  const { brand, ink } = storeBrand(view, custom);
  app.style.setProperty("--brand", brand);
  app.style.setProperty("--brand-ink", ink);
  applyInk(app, custom);
  applyTheme(app, custom);
  applyFieldColors(app, custom);
  applyIconColor(app, custom);
  fadeInImages(app);
  mountParticlesHeroes(app);
  mountTestimonials(app);
  updateCartBadge(result.store.id);

  // Os produtos, as categorias e o carrinho funcionam dentro da
  // pré-visualização: as ligações levam a `/loja/<id>/…`, que para o próprio
  // Dono (e para um Administrador) resolve o rascunho (`resolveWithDraft` em
  // `web/lib/storeCache.ts`), e fora do índice. Mais ninguém o consegue abrir. O
  // checkout de um rascunho só pode encomendar por WhatsApp: os pagamentos
  // digitais exigem a loja publicada e aprovada, no servidor.

  app.querySelector<HTMLElement>("[data-preview-back]")?.addEventListener("click", (e) => {
    e.preventDefault();
    go(backTo(admin).href);
  });
}
