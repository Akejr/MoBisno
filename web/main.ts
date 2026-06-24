/** Bootstrap + router (hash-based) da SPA de pré-visualização do MôBisno. */
import { seedDemoStore, PLATFORM_APEX } from "./composition.js";
import { renderLanding } from "./views/landing.js";
import { renderLogin } from "./views/login.js";
import { renderWizard } from "./views/wizard.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderStorefront } from "./views/storefront.js";
import { renderProductPage } from "./views/product.js";
import { renderCategoryPage } from "./views/category.js";
import { renderCartPage } from "./views/cart.js";
import { renderEditor } from "./views/editor.js";
import { mountCartUI } from "./lib/cartDrawer.js";
import { mountSearchUI } from "./lib/search.js";
import { mountSectionsUI } from "./lib/sections.js";

/**
 * Identificador de loja a partir do subdomínio em produção
 * (`nomedaloja.mobisno.store`). Devolve `null` no domínio raiz, em `www`/`app`
 * e em ambientes sem subdomínio (localhost, *.vercel.app).
 */
function storeIdentifierFromHost(): string | null {
  const host = location.hostname.toLowerCase();
  if (!host.endsWith(`.${PLATFORM_APEX}`)) return null;
  const sub = host.slice(0, host.length - PLATFORM_APEX.length - 1);
  if (!sub || sub === "www" || sub === "app" || sub.includes(".")) return null;
  return sub;
}

function route(): void {
  const hash = location.hash || "#/";
  window.scrollTo(0, 0);

  // Modo subdomínio: nomedaloja.mobisno.store → renderiza a loja publicada.
  // As sub-páginas (produto/categoria/carrinho) continuam a usar `#/loja/...`.
  const sub = storeIdentifierFromHost();
  if (sub && (hash === "#/" || hash === "#")) {
    void renderStorefront(sub);
    return;
  }

  if (hash.startsWith("#/criar")) {
    renderWizard();
  } else if (hash.startsWith("#/login")) {
    renderLogin();
  } else if (hash.startsWith("#/painel")) {
    void renderDashboard();
  } else if (hash.startsWith("#/personalizar")) {
    void renderEditor();
  } else if (hash.startsWith("#/loja/")) {
    const rest = hash.slice("#/loja/".length);
    const productMatch = rest.match(/^([^/]+)\/produto\/(.+)$/);
    const categoryMatch = rest.match(/^([^/]+)\/categoria\/(.+)$/);
    const cartMatch = rest.match(/^([^/]+)\/carrinho$/);
    if (productMatch) {
      void renderProductPage(decodeURIComponent(productMatch[1]), decodeURIComponent(productMatch[2]));
    } else if (categoryMatch) {
      void renderCategoryPage(decodeURIComponent(categoryMatch[1]), decodeURIComponent(categoryMatch[2]));
    } else if (cartMatch) {
      void renderCartPage(decodeURIComponent(cartMatch[1]));
    } else {
      const identifier = decodeURIComponent(rest);
      void renderStorefront(identifier);
    }
  } else {
    void renderLanding();
  }
}

async function boot(): Promise<void> {
  await seedDemoStore();
  mountCartUI();
  mountSearchUI();
  mountSectionsUI();
  window.addEventListener("hashchange", route);
  route();
}

void boot();
