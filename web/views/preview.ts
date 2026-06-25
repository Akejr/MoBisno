/**
 * Pré-visualização de um modelo em página inteira, com produtos de exemplo.
 * Rota de teste: `/preview/<templateId>` (ex.: /preview/galeria). Útil para
 * iterar no desenho de um modelo sem ter de criar uma loja.
 */
import { render, fadeInImages } from "../lib/dom.js";
import { getTemplate, TEMPLATE_REGISTRY } from "../templates/registry.js";
import { sampleStoreView } from "../lib/templatePreview.js";
import { updateCartBadge } from "../lib/cart.js";

export function renderTemplatePreview(templateId: string): void {
  const tpl = getTemplate(templateId);
  const view = sampleStoreView(tpl.id);
  const app = render(tpl.render(view, {}));
  app.style.setProperty("--brand", tpl.defaultBrand ?? "#4f46e5");
  fadeInImages(app);
  updateCartBadge("preview");

  // Barra fina no fundo a indicar que é uma pré-visualização (apenas teste).
  document.getElementById("mb-preview-bar")?.remove();
  const bar = document.createElement("div");
  bar.id = "mb-preview-bar";
  bar.style.cssText =
    "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:300;" +
    "background:#111;color:#fff;font:600 12px Inter,sans-serif;padding:8px 14px;border-radius:999px;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:8px;align-items:center";
  const others = TEMPLATE_REGISTRY.map((t) =>
    `<a href="/preview/${t.id}" style="color:${t.id === tpl.id ? "#fff" : "#9ca3af"};text-decoration:none">${t.name}</a>`,
  ).join('<span style="opacity:.4">·</span>');
  bar.innerHTML = `<span style="opacity:.7">Pré-visualização:</span> ${others}`;
  document.body.appendChild(bar);
}
