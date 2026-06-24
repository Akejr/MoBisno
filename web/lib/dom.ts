/** Pequenos utilitários de DOM e navegação para a SPA. */
import { navigate } from "./routing.js";

/** Define o conteúdo HTML do contentor da app. */
export function render(html: string): HTMLElement {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app não encontrado");
  app.innerHTML = html;
  return app;
}

/** Atalho para querySelector tipado dentro do #app. */
export function $<T extends HTMLElement = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/** Navega para uma rota (URL limpa). Aceita também o formato antigo `#/x`. */
export function go(route: string): void {
  navigate(route);
}

/** Define o título da aba do navegador. */
export function setDocTitle(title: string): void {
  document.title = title;
}

/** Define o favicon da aba (logótipo da loja ou o da plataforma). */
export function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = /\.svg(\?|$)/i.test(href) ? "image/svg+xml" : "";
  link.href = href;
}

/** Escapa texto para inserção segura em HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formata um preço em Kwanza (pt-AO): "1.234,56 Kz". */
export function formatKz(price: number): string {
  const safe = Number.isFinite(price) ? price : 0;
  const cents = Math.round(Math.abs(safe) * 100);
  const whole = Math.floor(cents / 100).toString();
  const frac = (cents % 100).toString().padStart(2, "0");
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ".";
    grouped += whole[i];
  }
  return `${safe < 0 ? "-" : ""}${grouped},${frac} Kz`;
}

/** Lê um ficheiro do input como Uint8Array (para o FileService). */
export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

let toastTimer: number | undefined;

/** Mostra uma notificação breve (sucesso/erro) no canto. */
export function toast(message: string, kind: "success" | "error" = "success"): void {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "fixed bottom-6 right-6 z-[100] max-w-sm";
    document.body.appendChild(el);
  }
  const color = kind === "success" ? "bg-primary text-on-primary" : "bg-error text-on-error";
  el.innerHTML = `<div class="${color} px-5 py-3 rounded-xl shadow-lg font-label-md animate-entrance flex items-center gap-2">
    <span class="material-symbols-outlined text-[20px]">${kind === "success" ? "check_circle" : "error"}</span>
    <span>${esc(message)}</span></div>`;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { if (el) el.innerHTML = ""; }, 3500);
}

/* ----------------------------- Indicador de carregamento ----------------------------- */

let busyCount = 0;

function ensureOverlay(): HTMLElement {
  let el = document.getElementById("mb-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "mb-overlay";
    el.style.cssText =
      "position:fixed;inset:0;z-index:300;display:none;opacity:0;transition:opacity .2s ease;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.28);backdrop-filter:blur(2px)";
    el.innerHTML =
      `<div style="background:#fff;border-radius:16px;padding:20px 24px;display:flex;align-items:center;gap:14px;box-shadow:0 10px 40px rgba(0,0,0,.2)">
        <span style="width:22px;height:22px;border:3px solid #ffd9cc;border-top-color:#a73a00;border-radius:9999px;display:inline-block;animation:mb-spin .7s linear infinite"></span>
        <span data-msg style="font-family:Inter,sans-serif;color:#271812;font-weight:500"></span>
      </div>`;
    document.body.appendChild(el);
    const style = document.createElement("style");
    style.textContent =
      "@keyframes mb-spin{to{transform:rotate(360deg)}}" +
      ".mb-fade-img{opacity:0;transition:opacity .4s ease}.mb-fade-img.mb-loaded{opacity:1}" +
      ".mb-btn-busy{position:relative;opacity:.85;cursor:progress;display:inline-flex;align-items:center;gap:8px}" +
      ".mb-btn-spinner{width:16px;height:16px;border:2px solid currentColor;border-top-color:transparent;" +
      "border-radius:9999px;display:inline-block;animation:mb-spin .7s linear infinite;flex:0 0 auto}";
    document.head.appendChild(style);
  }
  return el;
}

/** Mostra o overlay de carregamento (com contagem para operações concorrentes). */
export function startBusy(message = "A atualizar…"): void {
  busyCount += 1;
  const el = ensureOverlay();
  el.querySelector<HTMLElement>("[data-msg]")!.textContent = message;
  el.style.display = "flex";
  requestAnimationFrame(() => { el.style.opacity = "1"; });
}

/** Esconde o overlay quando todas as operações terminam. */
export function stopBusy(): void {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount > 0) return;
  const el = document.getElementById("mb-overlay");
  if (!el) return;
  el.style.opacity = "0";
  window.setTimeout(() => { if (busyCount === 0) el.style.display = "none"; }, 200);
}

/** Executa uma operação assíncrona mostrando o indicador de carregamento. */
export async function withBusy<T>(fn: () => Promise<T>, message?: string): Promise<T> {
  startBusy(message);
  try { return await fn(); } finally { stopBusy(); }
}

/** Faz as imagens aparecerem com fade-in à medida que carregam. */
export function fadeInImages(root: ParentNode = document): void {
  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (img.dataset.mbFade) return;
    img.dataset.mbFade = "1";
    img.classList.add("mb-fade-img");
    const done = () => img.classList.add("mb-loaded");
    if (img.complete && img.naturalWidth > 0) done();
    else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
  });
}

/**
 * Executa uma operação assíncrona mostrando um spinner dentro do próprio botão
 * (desativando-o), restaurando o conteúdo original no fim. Bom para feedback
 * imediato em qualquer botão de ação.
 */
export async function withButton<T>(
  btn: HTMLButtonElement | null,
  fn: () => Promise<T>,
  busyLabel?: string,
): Promise<T> {
  if (!btn) return fn();
  const originalHtml = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.classList.add("mb-btn-busy");
  btn.innerHTML =
    `<span class="mb-btn-spinner" aria-hidden="true"></span>` +
    (busyLabel ? `<span>${esc(busyLabel)}</span>` : "");
  ensureOverlay(); // garante que as keyframes/estilos do spinner existem
  try {
    return await fn();
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = originalDisabled;
    btn.classList.remove("mb-btn-busy");
  }
}
