/**
 * Página de início de sessão — cartão dividido com a identidade MôBisno.
 *
 * Três vistas no mesmo cartão:
 *  - **Entrar** (email + palavra-passe);
 *  - **Redefinir a palavra-passe** — «Esqueci-me da palavra-passe» pede o email
 *    e o Supabase envia um link. A resposta é sempre a mesma frase neutra, para
 *    o ecrã não dizer quem tem conta;
 *  - **Definir nova palavra-passe** — onde o link do email aterra
 *    (`/login?redefinir=1`, ver `passwordResetRedirect`). Grava a palavra-passe
 *    nova na sessão de recuperação e segue para o Dashboard.
 *
 * Os botões de envio têm guarda contra duplo envio: enquanto o pedido corre, o
 * botão fica desativado e um segundo clique (ou Enter) é ignorado.
 */
import { render, $, go, esc, toast } from "../lib/dom.js";
import { authService, appState, currentSession } from "../composition.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import {
  hasActiveSession, isPasswordRecoveryUrl, onPasswordRecovery, requestPasswordReset, updatePassword,
} from "../supabase/auth.js";
import {
  PASSWORD_MIN_LENGTH, validatePasswordConfirmation, validatePasswordLength,
} from "../../src/ui/wizardSteps.js";

const ACCENT = "#F95901";
/** Laranja escuro para texto pequeno sobre branco (contraste AA). */
const ACCENT_INK = "#C2410C";

/** Raiz do cartão: quem chega tarde (o evento de recuperação) confirma que o ecrã ainda é este. */
const ROOT_ID = "mb-login";

/** Rótulos do ecrã, num só sítio. */
const LABELS = {
  signInTitle: "Bem-vindo de volta",
  signIn: "Entrar",
  forgot: "Esqueci-me da palavra-passe",
  resetTitle: "Redefinir a palavra-passe",
  resetSend: "Enviar link",
  resetSent: "Se existir uma conta com este email, enviámos um link para redefinir a palavra-passe.",
  newTitle: "Definir nova palavra-passe",
  newPassword: "Nova palavra-passe",
  newPasswordConfirm: "Confirmar a nova palavra-passe",
  newSave: "Guardar a nova palavra-passe",
  back: "Voltar a iniciar sessão",
} as const;

const INPUT_CLS =
  "flex h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all aria-[invalid=true]:border-red-500";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";
const SUBMIT_CLS =
  "w-full inline-flex items-center justify-center gap-2 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-transform hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed";
/** Botões com aspeto de ligação. Mantêm o contorno de foco do navegador (teclado). */
const LINK_CLS = "text-sm font-semibold hover:underline focus-visible:underline rounded";

type LoginView = "entrar" | "pedir" | "definir";

/** Vista em que o cartão está. */
let currentView: LoginView = "entrar";

/** Cancela a escuta do evento de recuperação da montagem anterior. */
let stopRecovery: (() => void) | null = null;

export function renderLogin(): void {
  stopRecovery?.();
  stopRecovery = null;

  render(`
  <div class="min-h-screen w-full flex items-center justify-center p-4 font-sans relative" style="background:linear-gradient(135deg,#fff7f2,#ffe9dd)">
    <a href="#/" class="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 bg-white/80 backdrop-blur border border-gray-200 rounded-full px-4 py-2 shadow-sm transition-colors">
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span> Voltar à home
    </a>
    <div class="w-full max-w-4xl overflow-hidden rounded-3xl flex bg-white shadow-2xl border border-gray-100 animate-entrance">

      <!-- Painel decorativo (esquerda) -->
      <div class="hidden md:block w-1/2 h-[600px] relative overflow-hidden border-r border-gray-100" style="background:linear-gradient(135deg,#fff3ec,#ffe2d3)">
        <canvas id="dotmap" class="absolute inset-0 w-full h-full" aria-hidden="true"></canvas>
        <div class="absolute inset-0 flex flex-col items-center justify-center p-8 z-10 text-center">
          <a href="#/" class="mb-6 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-lg" style="box-shadow:0 12px 30px -10px rgba(249,89,1,.45)">
            <img src="/favicon.svg" alt="MôBisno" class="w-10 h-10" />
          </a>
          <p class="text-3xl font-black mb-2 tracking-tight" style="color:${ACCENT}">MôBisno</p>
          <p class="text-sm text-gray-600 max-w-xs">Inicie sessão para gerir as suas lojas, produtos e vendas, tudo num só lugar.</p>
        </div>
      </div>

      <!-- Formulário (direita) -->
      <div id="${ROOT_ID}" class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
        <a href="#/" class="md:hidden inline-flex items-center gap-2 mb-6">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </a>
        <div id="login-head"></div>
        <!-- Regiões anunciadas: existem (e ficam visíveis, vazias) desde o início,
             para os leitores de ecrã as ouvirem mudar. Esconder com display:none
             tirava-as da árvore de acessibilidade. -->
        <div id="login-alert" role="alert"></div>
        <div id="login-status" role="status" aria-live="polite"></div>
        <div id="login-body"></div>
      </div>
    </div>
  </div>`);

  mountDotMap();
  mountAiAgent(document.getElementById("app"), { screen: "registo" });

  if (isPasswordRecoveryUrl(location.href)) void showSetPassword();
  else showSignIn(false);

  // O Supabase pode confirmar a sessão de recuperação (`PASSWORD_RECOVERY`)
  // depois de o ecrã já estar desenhado — por exemplo, se o endereço perdeu a
  // marca `?redefinir=1` pelo caminho.
  stopRecovery = onPasswordRecovery(() => {
    if (!document.getElementById(ROOT_ID)) {
      stopRecovery?.();
      stopRecovery = null;
      return;
    }
    if (currentView !== "definir") void showSetPassword();
  });
}

/* --------------------------------- Vistas --------------------------------- */

/** Desenha a vista pedida no cartão. `focar` leva o foco ao título (mudança de vista). */
function setView(view: LoginView, titulo: string, intro: string, corpo: string, focar: boolean): void {
  currentView = view;
  const head = $("#login-head");
  const body = $("#login-body");
  if (!head || !body) return;
  head.innerHTML = `<h1 id="login-title" tabindex="-1" class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 mb-1 outline-none">${esc(titulo)}</h1>
    <p class="text-gray-500 mb-8">${esc(intro)}</p>`;
  body.innerHTML = corpo;
  clearMessages();
  mountInputFocus();
  mountPasswordToggles();
  if (focar) $("#login-title")?.focus();
}

/** Campo de palavra-passe com o botão de mostrar/esconder. */
function passwordField(o: { id: string; label: string; autocomplete: string; hint?: string }): string {
  const hintId = o.hint ? `${o.id}-hint` : "";
  return `<div>
    <label for="${o.id}" class="${LABEL_CLS}">${esc(o.label)} <span aria-hidden="true" style="color:${ACCENT}">*</span></label>
    <div class="relative">
      <input id="${o.id}" type="password" required autocomplete="${o.autocomplete}" placeholder="••••••••"
        ${o.autocomplete === "new-password" ? `minlength="${PASSWORD_MIN_LENGTH}"` : ""}
        ${hintId ? `aria-describedby="${hintId}"` : ""}
        class="${INPUT_CLS} pr-11" />
      <button type="button" data-toggle-pass="${o.id}" aria-controls="${o.id}" aria-pressed="false" aria-label="Mostrar palavra-passe"
        class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-800 transition-colors">
        <span class="material-symbols-outlined text-[20px]" aria-hidden="true">visibility</span>
      </button>
    </div>
    ${o.hint ? `<p id="${hintId}" class="mt-1.5 text-xs text-gray-500">${esc(o.hint)}</p>` : ""}
  </div>`;
}

function submitButton(id: string, label: string, busy: string): string {
  return `<button type="submit" id="${id}" data-busy-label="${esc(busy)}" class="${SUBMIT_CLS}" style="background:${ACCENT}">
    ${esc(label)} <span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
  </button>`;
}

/** Vista «Entrar». */
function showSignIn(focar: boolean): void {
  setView("entrar", LABELS.signInTitle, "Aceda ao Dashboard da sua loja.", `
    <form id="login-form" class="space-y-5" novalidate aria-labelledby="login-title">
      <div>
        <label for="email" class="${LABEL_CLS}">Email <span aria-hidden="true" style="color:${ACCENT}">*</span></label>
        <input id="email" type="email" required autocomplete="email" inputmode="email" placeholder="voce@exemplo.com" class="${INPUT_CLS}" />
      </div>
      ${passwordField({ id: "pass", label: "Palavra-passe", autocomplete: "current-password" })}
      <div class="-mt-2 text-right">
        <button type="button" id="forgot" class="${LINK_CLS}" style="color:${ACCENT_INK}">${esc(LABELS.forgot)}</button>
      </div>
      ${submitButton("login-submit", LABELS.signIn, "A entrar…")}
    </form>
    <p class="text-center text-gray-500 text-sm mt-6">
      Ainda não tem conta? <a href="#/criar" class="font-semibold hover:underline" style="color:${ACCENT_INK}">Criar a minha loja</a>
    </p>`, focar);

  const form = $<HTMLFormElement>("#login-form");
  const email = $<HTMLInputElement>("#email");
  const pass = $<HTMLInputElement>("#pass");
  if (!form || !email || !pass) return;

  $("#forgot")?.addEventListener("click", () => showRequestReset(email.value));

  onSubmitOnce(form, async () => {
    clearMessages();
    const res = await authService.login({ email: email.value, password: pass.value });
    if (!res.ok) {
      // O erro diz que campos estão em causa; credenciais erradas marcam os dois.
      const campos = [
        ...(res.error.fields.includes("email") ? [email] : []),
        ...(res.error.fields.includes("password") ? [pass] : []),
      ];
      showError(res.error.reason, campos.length ? campos : [email]);
      return;
    }
    appState.session = res.value;
    appState.ownerId = res.value.ownerId;
    appState.storeId = null;
    toast("Sessão iniciada!");
    go("#/painel");
  });
}

/** Vista «Redefinir a palavra-passe»: pede o email. `aviso` é mostrado como erro (link inválido). */
function showRequestReset(emailInicial = "", aviso?: string): void {
  setView("pedir", LABELS.resetTitle,
    "Indique o email da sua conta. Enviamos-lhe um link para escolher uma palavra-passe nova.", `
    <form id="reset-form" class="space-y-5" novalidate aria-labelledby="login-title">
      <div>
        <label for="reset-email" class="${LABEL_CLS}">Email <span aria-hidden="true" style="color:${ACCENT}">*</span></label>
        <input id="reset-email" type="email" required autocomplete="email" inputmode="email" placeholder="voce@exemplo.com" class="${INPUT_CLS}" value="${esc(emailInicial.trim())}" />
      </div>
      ${submitButton("reset-submit", LABELS.resetSend, "A enviar…")}
    </form>
    <p class="text-center text-sm mt-6">
      <button type="button" id="back-to-login" class="${LINK_CLS}" style="color:${ACCENT_INK}">${esc(LABELS.back)}</button>
    </p>`, true);

  if (aviso) showError(aviso, []);

  const form = $<HTMLFormElement>("#reset-form");
  const email = $<HTMLInputElement>("#reset-email");
  if (!form || !email) return;
  $("#back-to-login")?.addEventListener("click", () => showSignIn(true));

  onSubmitOnce(form, async () => {
    clearMessages();
    const r = await requestPasswordReset(email.value, location.origin);
    if (!r.ok) {
      showError(r.reason, [email]);
      return;
    }
    // Frase neutra: a mesma quer a conta exista quer não.
    showStatus(`${LABELS.resetSent} Abra-o neste navegador; se não o encontrar, veja a pasta de spam.`);
  });
}

/**
 * Vista «Definir nova palavra-passe», onde aterra o link do email.
 *
 * O formulário só aparece com uma sessão de recuperação: `hasActiveSession`
 * espera que o cliente do Supabase acabe de ler o link. Sem sessão, o link já
 * não serve (expirou, foi usado, ou foi aberto noutro navegador — o fluxo PKCE
 * guarda a chave no navegador onde o pedido foi feito).
 */
async function showSetPassword(): Promise<void> {
  setView("definir", LABELS.newTitle, `Escolha uma palavra-passe nova, com pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`, "", false);
  showStatus("A validar o link…");

  const temSessao = await hasActiveSession();
  // O Dono pode ter mudado de vista (ou de ecrã) enquanto se esperava.
  if (currentView !== "definir" || !document.getElementById(ROOT_ID)) return;
  if (!temSessao) {
    showRequestReset("", "O link para redefinir a palavra-passe já não é válido. Abra-o no mesmo navegador onde o pediu, ou peça um novo abaixo.");
    return;
  }

  setView("definir", LABELS.newTitle, `Escolha uma palavra-passe nova, com pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`, `
    <form id="new-password-form" class="space-y-5" novalidate aria-labelledby="login-title">
      ${passwordField({ id: "new-pass", label: LABELS.newPassword, autocomplete: "new-password", hint: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.` })}
      ${passwordField({ id: "new-pass-confirm", label: LABELS.newPasswordConfirm, autocomplete: "new-password" })}
      ${submitButton("new-password-submit", LABELS.newSave, "A guardar…")}
    </form>
    <p class="text-center text-sm mt-6">
      <button type="button" id="back-to-login" class="${LINK_CLS}" style="color:${ACCENT_INK}">${esc(LABELS.back)}</button>
    </p>`, true);

  const form = $<HTMLFormElement>("#new-password-form");
  const nova = $<HTMLInputElement>("#new-pass");
  const confirmacao = $<HTMLInputElement>("#new-pass-confirm");
  if (!form || !nova || !confirmacao) return;
  $("#back-to-login")?.addEventListener("click", () => showSignIn(true));

  onSubmitOnce(form, async () => {
    clearMessages();
    if (validatePasswordLength(nova.value).status === "invalid") {
      showError(`A palavra-passe tem de ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`, [nova]);
      return;
    }
    if (validatePasswordConfirmation(nova.value, confirmacao.value).status === "invalid") {
      // As duas de novo: o Dono não tem de adivinhar qual estava errada.
      nova.value = "";
      confirmacao.value = "";
      showError("As duas palavras-passe não são iguais. Escreva as duas de novo.", [nova, confirmacao]);
      return;
    }
    const r = await updatePassword(nova.value);
    if (!r.ok) {
      showError(r.reason, [nova]);
      return;
    }
    const sess = await currentSession();
    if (sess) {
      appState.session = sess;
      appState.ownerId = sess.ownerId;
      appState.storeId = null;
    }
    toast("Palavra-passe alterada.");
    go("/painel");
  });
}

/* ------------------------------- Mensagens -------------------------------- */

/** Limpa os avisos e as marcas de campo inválido. */
function clearMessages(): void {
  const alert = $("#login-alert");
  const status = $("#login-status");
  if (alert) alert.innerHTML = "";
  if (status) status.innerHTML = "";
  document.querySelectorAll<HTMLInputElement>(`#${ROOT_ID} input[aria-invalid]`).forEach(unmarkInvalid);
}

/**
 * Mostra um erro na região anunciada (`role="alert"`), marca os campos em causa
 * e leva o foco ao primeiro, para quem usa teclado ou leitor de ecrã continuar
 * dali.
 */
function showError(message: string, campos: HTMLInputElement[]): void {
  const alert = $("#login-alert");
  if (alert) {
    alert.innerHTML = `<div class="rounded-xl px-4 py-3 mb-5 text-sm flex items-start gap-2" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">error</span><span>${esc(message)}</span></div>`;
  }
  for (const campo of campos) {
    campo.setAttribute("aria-invalid", "true");
    // O erro passa a fazer parte da descrição do campo (sem perder a dica).
    const ids = (campo.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes("login-alert")) campo.setAttribute("aria-describedby", [...ids, "login-alert"].join(" "));
    campo.addEventListener("input", () => unmarkInvalid(campo), { once: true });
  }
  campos[0]?.focus();
}

function unmarkInvalid(campo: HTMLInputElement): void {
  campo.removeAttribute("aria-invalid");
  const ids = (campo.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== "login-alert");
  if (ids.length) campo.setAttribute("aria-describedby", ids.join(" "));
  else campo.removeAttribute("aria-describedby");
}

/** Mostra uma mensagem informativa na região `role="status"`. */
function showStatus(message: string): void {
  const status = $("#login-status");
  if (status) {
    status.innerHTML = `<div class="rounded-xl px-4 py-3 mb-5 text-sm flex items-start gap-2" style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0">
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">info</span><span>${esc(message)}</span></div>`;
  }
}

/* -------------------------------- Formulários ------------------------------- */

/**
 * Liga o envio de um formulário a `acao`, com **guarda contra duplo envio**:
 * enquanto a ação corre, o botão fica desativado, com `aria-busy` e o texto de
 * espera, e um segundo envio (duplo clique, Enter repetido) é ignorado. Um
 * segundo «Entrar» abria duas sessões; um segundo «Enviar link» gastava o
 * limite de emails do Supabase.
 */
function onSubmitOnce(form: HTMLFormElement, acao: () => Promise<void>): void {
  let ocupado = false;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (ocupado) return;
    ocupado = true;
    const botao = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const original = botao?.innerHTML ?? "";
    if (botao) {
      botao.disabled = true;
      botao.setAttribute("aria-busy", "true");
      botao.textContent = botao.dataset.busyLabel ?? botao.textContent ?? "";
    }
    void acao()
      .catch((err: unknown) => {
        console.error("login", err);
        showError("Não foi possível concluir o pedido. Verifique a ligação e tente de novo.", []);
      })
      .finally(() => {
        ocupado = false;
        if (botao?.isConnected) {
          botao.disabled = false;
          botao.removeAttribute("aria-busy");
          botao.innerHTML = original;
        }
      });
  });
}

/** Botões de mostrar/esconder a palavra-passe da vista atual. */
function mountPasswordToggles(): void {
  document.querySelectorAll<HTMLButtonElement>(`#${ROOT_ID} [data-toggle-pass]`).forEach((botao) => {
    botao.addEventListener("click", () => {
      const input = document.getElementById(botao.dataset.togglePass ?? "") as HTMLInputElement | null;
      if (!input) return;
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      botao.setAttribute("aria-pressed", String(mostrar));
      botao.setAttribute("aria-label", mostrar ? "Esconder palavra-passe" : "Mostrar palavra-passe");
      const icone = botao.querySelector(".material-symbols-outlined");
      if (icone) icone.textContent = mostrar ? "visibility_off" : "visibility";
    });
  });
}

/** Aplica realce laranja ao focar os campos (foco consistente sem classes JIT). */
function mountInputFocus(): void {
  document.querySelectorAll<HTMLInputElement>(`#${ROOT_ID} input`).forEach((el) => {
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
