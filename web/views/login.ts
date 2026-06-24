/** Página de início de sessão — cartão dividido com a identidade MôBisno. */
import { render, $, go, esc, toast } from "../lib/dom.js";
import { authService, appState } from "../composition.js";

const ACCENT = "#F95901";

export function renderLogin(): void {
  render(`
  <div class="min-h-screen w-full flex items-center justify-center p-4 font-sans relative" style="background:linear-gradient(135deg,#fff7f2,#ffe9dd)">
    <a href="#/" class="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 bg-white/80 backdrop-blur border border-gray-200 rounded-full px-4 py-2 shadow-sm transition-colors">
      <span class="material-symbols-outlined text-[18px]">arrow_back</span> Voltar à home
    </a>
    <div class="w-full max-w-4xl overflow-hidden rounded-3xl flex bg-white shadow-2xl border border-gray-100 animate-entrance">

      <!-- Painel decorativo (esquerda) -->
      <div class="hidden md:block w-1/2 h-[600px] relative overflow-hidden border-r border-gray-100" style="background:linear-gradient(135deg,#fff3ec,#ffe2d3)">
        <canvas id="dotmap" class="absolute inset-0 w-full h-full"></canvas>
        <div class="absolute inset-0 flex flex-col items-center justify-center p-8 z-10 text-center">
          <a href="#/" class="mb-6 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-lg" style="box-shadow:0 12px 30px -10px rgba(249,89,1,.45)">
            <img src="/favicon.svg" alt="MôBisno" class="w-10 h-10" />
          </a>
          <h2 class="text-3xl font-black mb-2 tracking-tight" style="color:${ACCENT}">MôBisno</h2>
          <p class="text-sm text-gray-600 max-w-xs">Inicie sessão para gerir as suas lojas, produtos e vendas — tudo num só lugar.</p>
        </div>
      </div>

      <!-- Formulário (direita) -->
      <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
        <a href="#/" class="md:hidden inline-flex items-center gap-2 mb-6">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </a>
        <h1 class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 mb-1">Bem-vindo de volta</h1>
        <p class="text-gray-500 mb-8">Aceda ao painel da sua loja.</p>

        <div id="errs"></div>
        <form id="f" class="space-y-5">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1.5">Email <span style="color:${ACCENT}">*</span></label>
            <input id="email" type="email" required placeholder="voce@exemplo.com"
              class="flex h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all" style="--tw-ring-color:${ACCENT}" />
          </div>
          <div>
            <label for="pass" class="block text-sm font-medium text-gray-700 mb-1.5">Palavra-passe <span style="color:${ACCENT}">*</span></label>
            <div class="relative">
              <input id="pass" type="password" required placeholder="••••••••"
                class="flex h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 pr-11 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all" />
              <button id="toggle-pass" type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-700 transition-colors" aria-label="Mostrar palavra-passe">
                <span class="material-symbols-outlined text-[20px]">visibility</span>
              </button>
            </div>
          </div>
          <button type="submit" class="w-full inline-flex items-center justify-center gap-2 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-transform hover:opacity-95" style="background:${ACCENT}">
            Entrar <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </form>

        <p class="text-center text-gray-500 text-sm mt-6">
          Ainda não tem conta? <a href="#/criar" class="font-semibold hover:underline" style="color:${ACCENT}">Criar a minha loja</a>
        </p>
      </div>
    </div>
  </div>`);

  mountDotMap();
  mountInputFocus();

  $("#toggle-pass")?.addEventListener("click", () => {
    const input = $("#pass") as HTMLInputElement;
    const icon = $("#toggle-pass")!.querySelector(".material-symbols-outlined")!;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    icon.textContent = show ? "visibility_off" : "visibility";
  });

  $("#f")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = ($("#email") as HTMLInputElement).value;
    const password = ($("#pass") as HTMLInputElement).value;
    const res = await authService.login({ email, password });
    if (!res.ok) {
      $("#errs")!.innerHTML = `<div class="rounded-xl px-4 py-3 mb-5 text-sm flex items-center gap-2" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca"><span class="material-symbols-outlined text-[18px]">error</span>${esc(res.error.reason)}</div>`;
      return;
    }
    appState.session = res.value;
    appState.ownerId = res.value.ownerId;
    appState.storeId = null;
    toast("Sessão iniciada!");
    go("#/painel");
  });
}

/** Aplica realce laranja ao focar os campos (foco consistente sem classes JIT). */
function mountInputFocus(): void {
  document.querySelectorAll<HTMLInputElement>("#f input").forEach((el) => {
    el.addEventListener("focus", () => {
      el.style.borderColor = ACCENT;
      el.style.boxShadow = "0 0 0 3px rgba(249,89,1,.15)";
      el.style.background = "#fff";
    });
    el.addEventListener("blur", () => {
      el.style.borderColor = "";
      el.style.boxShadow = "";
      el.style.background = "";
    });
  });
}

/** Mapa de pontos animado (recriação vanilla do componente, em tom laranja). */
function mountDotMap(): void {
  const canvas = document.getElementById("dotmap") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  interface Dot { x: number; y: number; radius: number; opacity: number; }
  interface Route { start: { x: number; y: number; delay: number }; end: { x: number; y: number }; }

  let dots: Dot[] = [];
  let raf = 0;
  let start = Date.now();
  let w = 0;
  let h = 0;

  const routes: Route[] = [
    { start: { x: 0.18, y: 0.30, delay: 0 }, end: { x: 0.40, y: 0.18 } },
    { start: { x: 0.40, y: 0.18, delay: 2 }, end: { x: 0.62, y: 0.26 } },
    { start: { x: 0.12, y: 0.12, delay: 1 }, end: { x: 0.34, y: 0.40 } },
    { start: { x: 0.70, y: 0.16, delay: 0.5 }, end: { x: 0.46, y: 0.42 } },
  ];

  function buildDots(): void {
    dots = [];
    const gap = 13;
    for (let x = 0; x < w; x += gap) {
      for (let y = 0; y < h; y += gap) {
        const inShape =
          (x < w * 0.25 && x > w * 0.05 && y < h * 0.4 && y > h * 0.1) ||
          (x < w * 0.25 && x > w * 0.15 && y < h * 0.8 && y > h * 0.4) ||
          (x < w * 0.45 && x > w * 0.3 && y < h * 0.35 && y > h * 0.15) ||
          (x < w * 0.5 && x > w * 0.35 && y < h * 0.65 && y > h * 0.35) ||
          (x < w * 0.7 && x > w * 0.45 && y < h * 0.5 && y > h * 0.1) ||
          (x < w * 0.8 && x > w * 0.65 && y < h * 0.8 && y > h * 0.6);
        if (inShape && Math.random() > 0.35) {
          dots.push({ x, y, radius: 1, opacity: Math.random() * 0.45 + 0.2 });
        }
      }
    }
  }

  function frame(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(249,89,1,${d.opacity})`;
      ctx.fill();
    }
    const t = (Date.now() - start) / 1000;
    for (const r of routes) {
      const elapsed = t - r.start.delay;
      if (elapsed <= 0) continue;
      const progress = Math.min(elapsed / 3, 1);
      const sx = r.start.x * w, sy = r.start.y * h;
      const ex = r.end.x * w, ey = r.end.y * h;
      const x = sx + (ex - sx) * progress;
      const y = sy + (ey - sy) * progress;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(249,89,1,.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = "#ff7e33"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = "rgba(249,89,1,.35)"; ctx.fill();
      if (progress === 1) { ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill(); }
    }
    if (t > 15) start = Date.now();
    raf = requestAnimationFrame(frame);
  }

  const resize = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    w = parent.clientWidth;
    h = parent.clientHeight;
    canvas.width = w;
    canvas.height = h;
    buildDots();
  };

  if ("ResizeObserver" in window && canvas.parentElement) {
    new ResizeObserver(resize).observe(canvas.parentElement);
  }
  resize();
  cancelAnimationFrame(raf);
  start = Date.now();
  frame();
}
