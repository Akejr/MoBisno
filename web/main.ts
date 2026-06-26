/** Bootstrap + router (URLs limpas via History API) da SPA do MôBisno. */
import { seedDemoStore } from "./composition.js";
import { storeSubdomain, navigate, cleanPath, ROUTE_EVENT } from "./lib/routing.js";
import { setDocTitle, setFavicon } from "./lib/dom.js";
import { loadStorefront } from "./lib/storeCache.js";
import { renderLanding } from "./views/landing.js";
import { renderLogin } from "./views/login.js";
import { renderWizard } from "./views/wizard.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderAdminPanel } from "./views/adminPanel.js";
import { renderStorefront } from "./views/storefront.js";
import { renderProductPage } from "./views/product.js";
import { renderCategoryPage } from "./views/category.js";
import { renderCartPage } from "./views/cart.js";
import { renderCheckoutPage } from "./views/checkout.js";
import { renderEditor } from "./views/editor.js";
import { renderTemplatePreview } from "./views/preview.js";
import { mountCartUI } from "./lib/cartDrawer.js";
import { mountSearchUI } from "./lib/search.js";
import { mountSectionsUI } from "./lib/sections.js";

const DEFAULT_TITLE = "MôBisno — Crie a sua loja online";

/** Aplica o nome e o logótipo da loja à aba do navegador (título + favicon). */
async function applyStoreBranding(identifier: string): Promise<void> {
  try {
    const { result, view } = await loadStorefront(identifier);
    if (result.kind === "render" && view.kind === "render") {
      setDocTitle(view.storeName);
      setFavicon(result.logo?.url || "/favicon.svg");
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

function route(): void {
  const path = location.pathname || "/";
  window.scrollTo(0, 0);
  if (path !== "/preview" && !path.startsWith("/preview/")) {
    document.getElementById("mb-preview-bar")?.remove();
  }

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
    renderTemplatePreview(decodeURIComponent(path.replace(/^\/preview\/?/, "")) || "galeria");
  } else if (path.startsWith("/criar")) {
    resetBranding();
    renderWizard();
  } else if (path.startsWith("/login")) {
    resetBranding();
    renderLogin();
  } else if (path.startsWith("/adminPainel")) {
    resetBranding();
    void renderAdminPanel();
  } else if (path.startsWith("/painel")) {
    resetBranding();
    void renderDashboard();
  } else if (path.startsWith("/personalizar")) {
    resetBranding();
    void renderEditor();
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
  // Migra URLs antigas com hash (`#/x`) para caminhos limpos.
  if (location.hash.startsWith("#/")) {
    history.replaceState({}, "", cleanPath(location.hash) + location.search);
  }

  await seedDemoStore();
  mountCartUI();
  mountSearchUI();
  mountSectionsUI();
  mountLinkInterceptor();

  window.addEventListener("popstate", route);
  window.addEventListener(ROUTE_EVENT, route);
  route();
}

void boot();
