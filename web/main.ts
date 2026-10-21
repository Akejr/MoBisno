/** Bootstrap + router (URLs limpas via History API) da SPA do MôBisno. */
import "./styles.css";
import { storeSubdomain, isStoreApexRoot, navigate, cleanPath, ROUTE_EVENT, PLATFORM_APEX, currentStoreIdentifier } from "./lib/routing.js";
import { setDocTitle, setFavicon, setSquareFavicon, esc } from "./lib/dom.js";
import { applyNoindexSeo } from "./lib/seo.js";
import { loadStorefront } from "./lib/storeCache.js";
import { STORE_DRAFT_LABEL } from "./views/storeHtml.js";
import { renderLanding } from "./views/landing.js";
import { renderLogin } from "./views/login.js";
import { renderStorefront } from "./views/storefront.js";
import { renderProductPage } from "./views/product.js";
import { renderCategoryPage } from "./views/category.js";
import { renderCartPage } from "./views/cart.js";
import { renderCheckoutPage } from "./views/checkout.js";
import { mountCartUI } from "./lib/cartDrawer.js";
import { mountSearchUI } from "./lib/search.js";
import { mountSectionsUI } from "./lib/sections.js";

// Vistas de dono/admin: carregadas sob demanda (code splitting) para aliviar o
// pacote inicial que o comprador descarrega no telemóvel.
const lazy = {
  wizard: () => import("./views/wizard.js").then((m) => m.renderWizard()),
  dashboard: () => import("./views/dashboard.js").then((m) => m.renderDashboard()),
  adminPanel: () => import("./views/adminPanel.js").then((m) => m.renderAdminPanel()),
  editor: () => import("./views/editor.js").then((m) => m.renderEditor()),
  preview: (id: string) => import("./views/preview.js").then((m) => m.renderTemplatePreview(id)),
  legal: (p: "termos" | "privacidade" | "politica") => import("./views/legal.js").then((m) => m.renderLegal(p)),
  directory: () => import("./views/directory.js").then((m) => m.renderDirectory()),
  presetGallery: () => import("./views/presetGallery.js").then((m) => m.renderPresetGallery()),
  presetGalleryTest: () => import("./views/presetGallery.js").then((m) => m.renderPresetGallery(true)),
  storePreview: (id: string) => import("./views/storePreview.js").then((m) => m.renderStorePreview(id)),
  // Ensaio do hero novo (`/start`). Pedaço separado: leva um sombreador WebGL que
  // não tem de pesar no pacote de quem só quer comprar numa loja.
  start: () => import("./views/start.js").then((m) => m.renderStart()),
};

const DEFAULT_TITLE = "MôBisno — Crie a sua loja online";

/**
 * Aplica o logótipo da loja ao favicon da aba.
 *
 * NÃO toca no título. Isto corre em paralelo com a vista da loja, que chama
 * `applySeo()` com o título bom (`Nome | Compras em Angola`, ou o que o dono
 * definiu). Enquanto esta função também escrevia o título, ganhava a última a
 * terminar — quase sempre esta, por ser mais leve — e o título acabava no nome
 * cru da loja. O snapshot que o Google guarda ficava com o pior dos dois.
 *
 * A exceção é a loja que não existe: aí não há vista a definir título nenhum.
 */
async function applyStoreBranding(identifier: string): Promise<void> {
  try {
    const { result, view, draft } = await loadStorefront(identifier);
    // Só se a página ainda for desta loja: a navegação pode ter mudado entretanto.
    if (currentStoreIdentifier()?.toLowerCase() === identifier.toLowerCase()) {
      syncDraftBar(draft === true);
    }
    if (result.kind === "render" && view.kind === "render") {
      const logo = result.logo?.url;
      // O logótipo do dono tem a proporção que ele quis: passa por
      // `setSquareFavicon`, que o encaixa num quadrado. O `favicon.svg` já é
      // quadrado e não precisa.
      if (logo) setSquareFavicon(logo);
      else setFavicon("/favicon.svg");
    } else {
      setDocTitle("Loja não encontrada — MôBisno");
      setFavicon("/favicon.svg");
    }
  } catch {
    /* mantém o branding atual em caso de falha */
  }
}

/** Repõe o título e o favicon da plataforma (páginas que não são loja). */
function resetBranding(): void {
  setDocTitle(DEFAULT_TITLE);
  setFavicon("/favicon.svg");
}

/** Faixa das páginas de um rascunho, abertas pelo próprio Dono. */
const DRAFT_BAR_ID = "mb-draft-bar";

/**
 * Mostra (ou retira) a faixa «Pré-visualização — esta loja ainda não está
 * publicada» nas páginas de uma loja por publicar.
 *
 * Vive fora de `#app`, presa ao fundo do ecrã: cada vista reescreve `#app`, e a
 * faixa tem de sobreviver à navegação entre o início, os produtos, as
 * categorias e o carrinho do rascunho. Só aparece a quem a loja resolve como
 * rascunho — o próprio Dono (`loadStorefront`).
 */
function syncDraftBar(draft: boolean): void {
  const atual = document.getElementById(DRAFT_BAR_ID);
  if (!draft) { atual?.remove(); return; }
  if (atual) return;
  const bar = document.createElement("div");
  bar.id = DRAFT_BAR_ID;
  bar.setAttribute("role", "status");
  bar.style.cssText =
    "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:300;display:flex;align-items:center;gap:10px;" +
    "max-width:calc(100vw - 24px);padding:8px 8px 8px 14px;border-radius:999px;background:#111827;color:#fff;" +
    "font:600 12px/1.35 Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
  bar.innerHTML =
    `<span class="material-symbols-outlined" aria-hidden="true" style="font-size:16px;color:#F95901">visibility</span>` +
    `<span>${esc(STORE_DRAFT_LABEL)}</span>` +
    `<a href="/painel" style="color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:4px 10px;white-space:nowrap">Voltar ao Dashboard</a>`;
  document.body.appendChild(bar);
}

/**
 * Primeira rota da página. Nela a página já está no ecrã — veio pronta do
 * servidor — e o visitante pode já ter rolado: voltar ao topo era um salto.
 */
let primeiraRota = true;

function route(): void {
  const path = location.pathname || "/";
  if (primeiraRota) primeiraRota = false;
  else window.scrollTo(0, 0);
  if (path !== "/preview" && !path.startsWith("/preview/")) {
    document.getElementById("mb-preview-bar")?.remove();
  }
  // A faixa de rascunho só fica nas páginas de uma loja; `applyStoreBranding`
  // volta a decidir quando a loja carrega.
  if (!currentStoreIdentifier() || path.startsWith("/previsualizar/")) syncDraftBar(false);

  // --- Modo subdomínio: nomedaloja.mobisno.store ---
  const sub = storeSubdomain();
  if (sub) {
    const productMatch = path.match(/^\/produto\/(.+)$/);
    const categoryMatch = path.match(/^\/categoria\/(.+)$/);
    if (path === "/carrinho") void renderCartPage(sub);
    else if (path === "/checkout") void renderCheckoutPage(sub);
    else if (productMatch) void renderProductPage(sub, decodeURIComponent(productMatch[1]));
    else if (categoryMatch) void renderCategoryPage(sub, decodeURIComponent(categoryMatch[1]));
    else void renderStorefront(sub);
    void applyStoreBranding(sub);
    return;
  }

  // --- Domínio principal (mobisno.store / localhost / *.vercel.app) ---
  if (path.startsWith("/preview/") || path === "/preview") {
    resetBranding();
    void lazy.preview(decodeURIComponent(path.replace(/^\/preview\/?/, "")) || "galeria");
  } else if (path.startsWith("/criar")) {
    resetBranding();
    applyNoindexSeo("Criar loja — MôBisno");
    void lazy.wizard();
  } else if (path.startsWith("/login")) {
    resetBranding();
    applyNoindexSeo("Entrar — MôBisno");
    renderLogin();
  } else if (path === "/lojas") {
    resetBranding();
    void lazy.directory();
  } else if (path === "/start") {
    // Página de entrada para anúncios. `noindex` de propósito: o tráfego é pago e
    // a mensagem repete a da homepage — indexá-la punha-a a competir com a home
    // nos resultados de pesquisa.
    resetBranding();
    applyNoindexSeo("MôBisno — Cria a tua loja online em minutos");
    void lazy.start();
  } else if (path === "/termos" || path === "/privacidade" || path === "/politica") {
    resetBranding();
    void lazy.legal(path.slice(1) as "termos" | "privacidade" | "politica");
  } else if (path.toLowerCase().startsWith("/adminpainel")) {
    resetBranding();
    applyNoindexSeo("Administração — MôBisno");
    void lazy.adminPanel();
  } else if (path.startsWith("/previsualizar/")) {
    // Pré-visualização privada da loja por publicar. Fica no domínio da
    // plataforma (não no subdomínio da loja) porque a loja em rascunho não é
    // servida em subdomínio nenhum — é essa a definição de «por publicar».
    resetBranding();
    void lazy.storePreview(decodeURIComponent(path.slice("/previsualizar/".length)));
  } else if (path.startsWith("/painel")) {
    resetBranding();
    applyNoindexSeo("Dashboard — MôBisno");
    void lazy.dashboard();
  } else if (path.startsWith("/personalizar")) {
    resetBranding();
    applyNoindexSeo("Personalizar loja — MôBisno");
    void lazy.editor();
  } else if (path.startsWith("/modelos")) {
    resetBranding();
    applyNoindexSeo("Modelos prontos — MôBisno");
    void lazy.presetGallery();
  } else if (path.startsWith("/teste-modelos")) {
    resetBranding();
    applyNoindexSeo("Teste de Modelos — MôBisno");
    void lazy.presetGalleryTest();
  } else if (path.startsWith("/loja/")) {
    const rest = path.slice("/loja/".length);
    const productMatch = rest.match(/^([^/]+)\/produto\/(.+)$/);
    const categoryMatch = rest.match(/^([^/]+)\/categoria\/(.+)$/);
    const cartMatch = rest.match(/^([^/]+)\/carrinho$/);
    const checkoutMatch = rest.match(/^([^/]+)\/checkout$/);
    if (productMatch) {
      void renderProductPage(decodeURIComponent(productMatch[1]), decodeURIComponent(productMatch[2]));
      void applyStoreBranding(decodeURIComponent(productMatch[1]));
    } else if (categoryMatch) {
      void renderCategoryPage(decodeURIComponent(categoryMatch[1]), decodeURIComponent(categoryMatch[2]));
      void applyStoreBranding(decodeURIComponent(categoryMatch[1]));
    } else if (cartMatch) {
      void renderCartPage(decodeURIComponent(cartMatch[1]));
      void applyStoreBranding(decodeURIComponent(cartMatch[1]));
    } else if (checkoutMatch) {
      void renderCheckoutPage(decodeURIComponent(checkoutMatch[1]));
      void applyStoreBranding(decodeURIComponent(checkoutMatch[1]));
    } else {
      const identifier = decodeURIComponent(rest);
      void renderStorefront(identifier);
      void applyStoreBranding(identifier);
    }
  } else {
    resetBranding();
    void renderLanding();
  }
}

/**
 * Interceta cliques em ligações internas (`/...` ou as antigas `#/...`) e
 * navega via History API, mantendo a URL limpa. Ignora links externos,
 * `target=_blank`, âncoras de página (`#`, `#precos`) e cliques com modificador.
 */
function mountLinkInterceptor(): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href) return;

    let path: string | null = null;
    if (href.startsWith("#/")) path = href;
    else if (href.startsWith("/") && !href.startsWith("//")) path = href;
    else return; // externo, mailto, tel, "#", "#precos", http(s)://outro

    e.preventDefault();
    navigate(path);
  });
}

async function boot(): Promise<void> {
  // Apex do domínio das lojas (sualoja.digital) → redireciona para o painel.
  if (isStoreApexRoot()) {
    location.replace(`https://${PLATFORM_APEX}${location.pathname}${location.search}`);
    return;
  }

  // Migra URLs antigas com hash (`#/x`) para caminhos limpos.
  if (location.hash.startsWith("#/")) {
    history.replaceState({}, "", cleanPath(location.hash) + location.search);
  }

  mountCartUI();
  mountSearchUI();
  mountSectionsUI();
  mountLinkInterceptor();

  window.addEventListener("popstate", route);
  window.addEventListener(ROUTE_EVENT, route);
  route();
}

void boot();
