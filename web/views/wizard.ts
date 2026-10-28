/**
 * Assistente de Criação — formato de CHAT guiado pelo robô do MôBisno.
 * Identidade visual branco + #F95901, com animações. O assistente conduz o
 * utilizador: nome → email → palavra-passe → confirmação da palavra-passe →
 * resumo dos dados (confirmar ou corrigir) → cria conta → **telemóvel e código
 * por SMS** → nome da loja → tipo de negócio → descrição (título e descrição
 * para o Google) → subdomínio (recomenda/aprova) → cria a loja em rascunho →
 * galeria de modelos prontos.
 *
 * Qualquer passo pode ser repetido para corrigir um campo: `askName` e
 * `askEmail` recebem o passo seguinte, e uma correção regressa ao resumo em vez
 * de arrastar o utilizador pelos passos que já estavam bem.
 *
 * ## Porque é que o telemóvel vem DEPOIS de a conta existir
 *
 * O código é pedido e comparado pelo servidor, que identifica o Dono pelo token
 * da sessão (`api/phone-verify.js`). Antes de a conta existir não há sessão, e a
 * única forma de o navegador dizer «este número está confirmado» seria uma
 * afirmação que ele próprio escreve — ou seja, nenhuma confirmação.
 *
 * Quem não receber a SMS escolhe «Não recebi o código»: a conta e a loja ficam
 * criadas, e o número confirma-se depois no Dashboard. O que fica por fazer é
 * **publicar** — exigir a confirmação para criar deixaria o Dono sem nada.
 *
 * ## Sair a meio não apaga o que já foi escrito
 *
 * A fase da loja é gravada no navegador a cada resposta (`web/lib/wizardDraft.ts`)
 * e, ao voltar, o assistente pergunta se continua de onde ficou. Antes disto a
 * mala de dados vivia só em memória: fechar o separador ou recarregar a página
 * perdia o nome da loja, o tipo, o texto longo sobre o negócio e os textos para
 * o Google que o Dono já tinha corrigido.
 *
 * A fase da **conta** não é gravada, de propósito: são três respostas, uma
 * delas a palavra-passe, e a partir daí quem sobrevive é a sessão.
 *
 * Reutiliza a validação e os serviços do fluxo original (wizardSteps,
 * authService, wizardFlow, identifierService).
 */
import { render, $, go, esc } from "../lib/dom.js";
import { TEMPLATES, identifierService, authService, wizardFlow, appState, currentSession, STORE_APEX } from "../composition.js";
import {
  validatePassoNomeTipo, resolvePassoSubdominio, buildStoreTypeOptions, WIZARD_FIELDS,
  PASSWORD_MIN_LENGTH, validatePasswordLength, validatePasswordConfirmation,
  buildRegisterFixOptions, REGISTER_FIX_LABELS,
} from "../../src/ui/wizardSteps.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { confirmPhoneCode, readPhoneStatus, requestPhoneCode } from "../supabase/phone.js";
import { emailTaken } from "../supabase/auth.js";
import { isValidAoPhone, normalizeAoPhone } from "../../src/services/payments.js";
import {
  PHONE_CODE_LENGTH, cleanPhoneCode, formatPhoneForDisplay,
} from "../../src/services/phoneVerification.js";
import { generateSeoDescription, generateSeoTitle } from "../lib/seoGen.js";
import {
  saveWizardDraft, readWizardDraft, clearWizardDraft, type WizardStep,
} from "../lib/wizardDraft.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import type { AuthError, Session } from "../../src/services/authService.js";

const ACCENT = "#F95901";

const wiz: { data: Record<string, unknown>; session: Session | null; subdomain: string; storeId: string } = {
  data: {},
  session: null,
  subdomain: "",
  storeId: "",
};


/**
 * Modelo com que a loja nasce. `TEMPLATES` vem de `templateOptions()`, que já só
 * traz os modelos prontos — procurar aqui por `t.ready` era procurar um campo
 * que a opção não tem, e a resposta vinha sempre do `?? TEMPLATES[0]`.
 */
function defaultTemplateId(): string {
  return TEMPLATES[0]?.id ?? "galeria";
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* --------------------------------- Shell --------------------------------- */

function injectStyle(): void {
  if (document.getElementById("mb-chat-style")) return;
  const st = document.createElement("style");
  st.id = "mb-chat-style";
  st.textContent =
    "@keyframes mbBubbleIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}" +
    ".mb-bubble{animation:mbBubbleIn .35s cubic-bezier(.16,1,.3,1) both;max-width:80%}" +
    "@keyframes mbDot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}" +
    ".mb-dot{width:7px;height:7px;border-radius:9999px;background:#9ca3af;display:inline-block;animation:mbDot 1.2s infinite}" +
    ".mb-chip{transition:transform .15s ease, background .15s ease, color .15s ease, border-color .15s ease}" +
    ".mb-chip:hover{transform:translateY(-2px)}" +
    ".mb-cinput{width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:9999px;padding:.8rem 1.1rem;outline:none;transition:border-color .2s,box-shadow .2s;font-size:1rem;color:#111827}" +
    ".mb-cinput:focus{border-color:#F95901;box-shadow:0 0 0 3px rgba(249,89,1,.15)}" +
    ".mb-chat-root{height:100vh;height:100dvh}";
  document.head.appendChild(st);
}

function renderShell(): void {
  injectStyle();
  render(`
  <div class="mb-chat-root flex flex-col bg-gray-50 font-sans text-gray-900">
    <nav class="bg-white/90 backdrop-blur border-b border-gray-100 shrink-0">
      <div class="flex justify-between items-center px-4 md:px-8 py-3.5 max-w-3xl mx-auto w-full">
        <a href="#/" class="flex items-center gap-2"><img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" /></a>
        <a href="#/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined text-[18px]">close</span> Sair</a>
      </div>
    </nav>
    <main class="flex-grow overflow-hidden flex justify-center">
      <div class="w-full max-w-2xl flex flex-col h-full">
        <div id="chat" class="flex-grow overflow-y-auto px-4 md:px-6 py-6 space-y-4"></div>
        <div id="chat-input" class="shrink-0 px-4 md:px-6 py-4 bg-white border-t border-gray-100"></div>
      </div>
    </main>
  </div>`);

  // Rola SEMPRE para a mensagem mais recente (novas mensagens ou inputs).
  const chatEl = $("#chat");
  const inputEl = $("#chat-input");
  if (chatEl) {
    const obs = new MutationObserver(() => scrollDown());
    obs.observe(chatEl, { childList: true, subtree: true });
    if (inputEl) obs.observe(inputEl, { childList: true, subtree: true });
  }
}

/* ------------------------------- Mensagens ------------------------------- */

function scrollDown(): void {
  const c = $("#chat");
  if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
}

function botAvatar(): string {
  return `<div class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]">smart_toy</span></div>`;
}

function addTyping(): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-end gap-2";
  row.innerHTML = `${botAvatar()}<div class="mb-bubble bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex items-center gap-1">
    <span class="mb-dot"></span><span class="mb-dot" style="animation-delay:.15s"></span><span class="mb-dot" style="animation-delay:.3s"></span>
  </div>`;
  $("#chat")!.appendChild(row);
  scrollDown();
  return row;
}

async function botSay(text: string): Promise<void> {
  const typing = addTyping();
  await wait(Math.min(1100, 450 + text.length * 14));
  typing.remove();
  const row = document.createElement("div");
  row.className = "flex items-end gap-2";
  row.innerHTML = `${botAvatar()}<div class="mb-bubble bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm text-gray-800 leading-relaxed">${esc(text)}</div>`;
  $("#chat")!.appendChild(row);
  scrollDown();
  await wait(180);
}

function userSay(text: string): void {
  const row = document.createElement("div");
  row.className = "flex items-end gap-2 justify-end";
  row.innerHTML = `<div class="mb-bubble text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm leading-relaxed" style="background:${ACCENT}">${esc(text)}</div>`;
  $("#chat")!.appendChild(row);
  scrollDown();
}

/** Mensagem do robô com conteúdo HTML livre (ex.: cartão de pré-visualização). */
function botCard(innerHtml: string): void {
  const row = document.createElement("div");
  row.className = "flex items-end gap-2";
  row.innerHTML = `${botAvatar()}<div class="mb-bubble bg-white border border-gray-100 rounded-2xl rounded-bl-md p-3 shadow-sm" style="max-width:92%">${innerHtml}</div>`;
  $("#chat")!.appendChild(row);
  scrollDown();
}

/** Slug provisório do endereço, derivado do nome da loja (para a pré-visualização). */
function previewSlug(): string {
  const s = String(wiz.data[WIZARD_FIELDS.name] ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "aloja";
}

/** Cartão que imita o resultado no Google (título + URL + descrição). */
function googlePreviewCard(title: string, description: string): string {
  const url = `${previewSlug()}.${STORE_APEX}`;
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;font-family:arial,sans-serif">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
      <div style="width:28px;height:28px;border-radius:9999px;background:#f1f3f4;display:flex;align-items:center;justify-content:center"><span class="material-symbols-outlined" style="font-size:17px;color:#5f6368">storefront</span></div>
      <div style="line-height:1.2;min-width:0"><div style="font-size:14px;color:#202124;font-weight:500">${esc(String(wiz.data[WIZARD_FIELDS.name] ?? "A minha loja"))}</div><div style="font-size:12px;color:#4d5156;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(url)}</div></div>
    </div>
    <div style="color:#1a0dab;font-size:20px;line-height:1.3;font-family:arial,sans-serif">${esc(title)}</div>
    <div style="color:#4d5156;font-size:14px;line-height:1.58;margin-top:3px">${esc(description)}</div>
  </div>`;
}

/* --------------------------------- Inputs -------------------------------- */

/**
 * Temporizador do botão de reenvio do código.
 *
 * Vive fora dos passos porque `clearInput()` apaga o HTML da zona de entrada
 * sem parar nada: sem isto, o intervalo continuava a contar sobre um botão que
 * já não existe, e a contagem seguinte ficava com duas a escrever no mesmo
 * sítio.
 */
let tickTimer: ReturnType<typeof setInterval> | null = null;

function stopTick(): void {
  if (tickTimer !== null) { clearInterval(tickTimer); tickTimer = null; }
}

function clearInput(): void { stopTick(); $("#chat-input")!.innerHTML = ""; }

function inputText(opts: { placeholder: string; type?: string; cta?: string; onSubmit: (v: string) => void }): void {
  const zone = $("#chat-input")!;
  zone.innerHTML = `<form class="flex items-center gap-2">
    <input class="mb-cinput" type="${opts.type ?? "text"}" placeholder="${esc(opts.placeholder)}" autocomplete="off" />
    <button type="submit" class="shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center shadow-sm hover:opacity-95 transition-opacity" style="background:${ACCENT}" title="${esc(opts.cta ?? "Enviar")}"><span class="material-symbols-outlined">arrow_upward</span></button>
  </form>`;
  const form = zone.querySelector("form")!;
  const input = zone.querySelector("input")!;
  input.focus();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    opts.onSubmit(v);
  });
}

function inputChips(options: { value: string; label: string }[], onPick: (value: string, label: string) => void): void {
  const zone = $("#chat-input")!;
  // Opções no laranja principal da plataforma (preenchidas), para destacar.
  zone.innerHTML = `<div class="flex flex-wrap gap-2 justify-center">${options
    .map((o) => `<button data-v="${esc(o.value)}" class="mb-chip text-white text-sm font-semibold px-4 py-2 rounded-full shadow-sm hover:opacity-95" style="background:${ACCENT}">${esc(o.label)}</button>`)
    .join("")}</div>`;
  zone.querySelectorAll<HTMLElement>("[data-v]").forEach((b) =>
    b.addEventListener("click", () => onPick(b.dataset.v!, b.textContent ?? b.dataset.v!)));
}

/** Campo de texto multilinha (para descrições detalhadas). */
function inputTextarea(opts: { placeholder: string; cta?: string; onSubmit: (v: string) => void }): void {
  const zone = $("#chat-input")!;
  zone.innerHTML = `<form class="flex items-end gap-2">
    <textarea class="mb-cinput" rows="3" style="border-radius:1.25rem;resize:none" placeholder="${esc(opts.placeholder)}"></textarea>
    <button type="submit" class="shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center shadow-sm hover:opacity-95 transition-opacity" style="background:${ACCENT}" title="${esc(opts.cta ?? "Enviar")}"><span class="material-symbols-outlined">arrow_upward</span></button>
  </form>`;
  const form = zone.querySelector("form")!;
  const ta = zone.querySelector("textarea")!;
  ta.focus();
  // Enter envia; Shift+Enter quebra linha.
  ta.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter" && !(e as KeyboardEvent).shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ta.value.trim();
    if (!v) return;
    opts.onSubmit(v);
  });
}

function inputYesNo(onYes: () => void, onNo: () => void): void {
  const zone = $("#chat-input")!;
  zone.innerHTML = `<div class="flex gap-3 justify-center">
    <button data-yes class="mb-chip inline-flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-full shadow-sm" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">check</span> Sim</button>
    <button data-no class="mb-chip inline-flex items-center gap-2 text-gray-700 font-semibold px-7 py-3 rounded-full border border-gray-200 bg-white hover:bg-gray-50"><span class="material-symbols-outlined text-[18px]">edit</span> Não</button>
  </div>`;
  zone.querySelector("[data-yes]")!.addEventListener("click", onYes);
  zone.querySelector("[data-no]")!.addEventListener("click", onNo);
}

function inputBusy(label: string): void {
  clearInput();
  $("#chat-input")!.innerHTML = `<div class="flex items-center justify-center gap-2 text-gray-500 text-sm py-2"><span class="mb-dot"></span><span class="mb-dot" style="animation-delay:.15s"></span><span class="mb-dot" style="animation-delay:.3s"></span> <span class="ml-1">${esc(label)}</span></div>`;
}

/** Classes de um chip secundário (contorno, sobre branco). */
const CHIP_ALT = "mb-chip inline-flex items-center gap-1.5 text-gray-700 text-sm font-semibold px-4 py-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60 disabled:hover:bg-white";

/**
 * Entrada do código de confirmação: a caixa dos algarismos e, debaixo, o que se
 * pode fazer enquanto a SMS não chega.
 *
 * Os reenvios abrem por tempo (`resendInMs`): o botão nasce fechado, conta até
 * zero e abre sozinho. Esgotados os reenvios, o botão desaparece e fica
 * «Não recebi o código», que segue sem confirmar.
 *
 * A contagem escreve no **nó de texto** do botão, e não em `textContent` do
 * elemento. Não é preciosismo: o `MutationObserver` da moldura observa
 * `childList` com `subtree` e rola o chat a cada mutação. Substituir o conteúdo
 * do botão a cada segundo punha a conversa a rolar sozinha de segundo a segundo;
 * alterar um nó de texto é uma mutação de `characterData`, que não é observada.
 */
function inputCode(opts: {
  /** Espera até o reenvio abrir, ou `null` quando já não há reenvios. */
  resendInMs: number | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onGiveUp: () => void;
  onChangePhone: () => void;
}): void {
  const zone = $("#chat-input")!;
  stopTick();
  const semReenvio = opts.resendInMs === null;
  zone.innerHTML = `<form class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <label for="otp" class="sr-only">Código recebido por SMS</label>
      <input id="otp" class="mb-cinput" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${PHONE_CODE_LENGTH}" placeholder="${"•".repeat(PHONE_CODE_LENGTH)}" style="letter-spacing:.4em;text-align:center;font-weight:800" />
      <button type="submit" class="shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center shadow-sm hover:opacity-95 transition-opacity" style="background:${ACCENT}" title="Confirmar"><span class="material-symbols-outlined">arrow_upward</span></button>
    </div>
    <div class="flex flex-wrap gap-2 justify-center">
      ${semReenvio
        ? `<button type="button" data-giveup class="${CHIP_ALT}"><span class="material-symbols-outlined text-[18px]">sms_failed</span> Não recebi o código</button>`
        : `<button type="button" data-resend disabled class="${CHIP_ALT}"><span class="material-symbols-outlined text-[18px]">refresh</span> <span data-tick>Reenviar código</span></button>`}
      <button type="button" data-phone class="${CHIP_ALT}"><span class="material-symbols-outlined text-[18px]">edit</span> Trocar o número</button>
    </div>
  </form>`;

  const form = zone.querySelector("form")!;
  const input = zone.querySelector<HTMLInputElement>("#otp")!;
  input.focus();
  // Só algarismos, e o código completo envia sozinho: é o que o teclado do
  // telemóvel sugere ao ler a SMS, e poupa um toque no botão.
  input.addEventListener("input", () => {
    const limpo = cleanPhoneCode(input.value);
    if (limpo !== input.value) input.value = limpo;
    if (limpo.length === PHONE_CODE_LENGTH) form.requestSubmit();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = cleanPhoneCode(input.value);
    if (v.length !== PHONE_CODE_LENGTH) return;
    opts.onSubmit(v);
  });

  zone.querySelector("[data-phone]")!.addEventListener("click", opts.onChangePhone);
  zone.querySelector("[data-giveup]")?.addEventListener("click", opts.onGiveUp);

  const botao = zone.querySelector<HTMLButtonElement>("[data-resend]");
  const alvo = zone.querySelector<HTMLElement>("[data-tick]")?.firstChild ?? null;
  if (!botao || opts.resendInMs === null) return;
  botao.addEventListener("click", () => { if (!botao.disabled) opts.onResend(); });

  const abreEm = Date.now() + opts.resendInMs;
  const pintar = (): void => {
    const faltaS = Math.ceil((abreEm - Date.now()) / 1000);
    if (faltaS <= 0) {
      stopTick();
      botao.disabled = false;
      if (alvo) alvo.nodeValue = "Reenviar código";
      return;
    }
    if (alvo) alvo.nodeValue = `Reenviar código em ${faltaS}s`;
  };
  pintar();
  tickTimer = setInterval(pintar, 250);
}

/* --------------------------------- Fluxo --------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function renderWizard(): void {
  wiz.data = { [WIZARD_FIELDS.templateId]: defaultTemplateId() };
  renderShell();
  // O robô da criação segue um guião: pergunta e espera resposta. Quem quer saber
  // o preço ou se pode criar mais do que uma loja não tem onde perguntar — é o
  // assistente que responde a isso. Desviado do fundo para não tapar o botão de
  // enviar da conversa.
  mountAiAgent(document.getElementById("app"), { screen: "criar", bottom: 96 });
  void start();
}

async function start(): Promise<void> {
  const sess = await currentSession();
  if (sess) {
    wiz.session = sess;
    appState.session = sess;
    appState.ownerId = sess.ownerId;
    wiz.data[WIZARD_FIELDS.ownerId] = sess.ownerId;
    await botSay(`Olá de novo! Sou o assistente do MôBisno e vou ajudar-te a criar uma nova loja.`);
    // Quem já tem conta mas nunca confirmou o número confirma-o agora: a loja
    // que está a criar não poderia ser publicada.
    const tel = await readPhoneStatus(sess.ownerId);
    if (!tel.verified) {
      askPhone("Antes disso, falta confirmar o teu número de telemóvel — é o que permite pôr a loja online. Qual é o número?");
      return;
    }
    continuarLoja();
    return;
  }
  await botSay("Olá! Sou o assistente do MôBisno e vou ajudar-te a criar a tua loja de forma rápida.");
  askName();
}

/**
 * Palavra-passe escolhida, guardada só entre a confirmação e a criação da conta.
 * Nunca entra em `wiz.data` (a mala que segue para o resto do assistente) e é
 * limpa assim que a conta existe.
 */
let pendingPassword = "";

/**
 * Pergunta o nome. `next` permite reaproveitar o passo como **correção**: quem
 * vem do resumo volta ao resumo, sem repetir os passos seguintes.
 */
function askName(next: () => void = askEmail, intro?: string): void {
  void (async () => {
    await botSay(intro ?? "Qual é o teu nome?");
    inputText({
      placeholder: "Ex: João Silva",
      onSubmit: (v) => {
        userSay(v);
        wiz.data[WIZARD_FIELDS.ownerName] = v;
        clearInput();
        next();
      },
    });
  })();
}

/**
 * Pergunta o email, valida o formato (`EMAIL_RE`) e **verifica logo** se já tem
 * conta.
 *
 * ## Porque é que a verificação é aqui
 *
 * Era no fim. Quem escrevia um email que já tinha conta passava pelo nome, pela
 * palavra-passe, pela confirmação da palavra-passe e pelo resumo — e só então
 * ouvia «já existe uma conta associada a este email». O percurso inteiro para
 * nada, e com a palavra-passe escrita duas vezes.
 *
 * A verificação falha para o lado de **seguir** (`null` quando não foi possível
 * verificar): a última palavra continua a ser o registo, que recusa com
 * `EMAIL_JA_REGISTADO`. Uma conta criada entre os dois momentos também cai lá.
 */
function askEmail(next: () => void = askPassword, intro?: string): void {
  void (async () => {
    await botSay(intro ?? "E o teu email?");
    inputText({
      placeholder: "tu@exemplo.com",
      type: "email",
      onSubmit: async (v) => {
        if (!EMAIL_RE.test(v)) {
          userSay(v);
          await botSay("Esse email não parece válido. Podes escrever de novo?");
          return;
        }
        userSay(v);
        wiz.data[WIZARD_FIELDS.email] = v;
        inputBusy("A verificar o email…");
        const ocupado = await emailTaken(v);
        clearInput();
        if (ocupado === true) { emailJaTemConta(next); return; }
        next();
      },
    });
  })();
}

/**
 * O email já tem conta, e sabe-se antes de a pessoa escrever mais nada. As duas
 * saídas verdadeiras, com os mesmos rótulos do fim do registo: entrar na conta
 * que já existe, ou usar outro email.
 */
function emailJaTemConta(next: () => void): void {
  void (async () => {
    await botSay("Já existe uma conta com este email.");
    inputChips(
      [
        { value: "entrar", label: REGISTER_FIX_LABELS.entrar },
        { value: "email", label: REGISTER_FIX_LABELS.email },
      ],
      async (value, label) => {
        userSay(label);
        clearInput();
        if (value === "entrar") {
          await botSay("Certo, levo-te ao início de sessão. Depois de entrares, voltas aqui para criar a loja.");
          go("#/login");
          return;
        }
        askEmail(next, "Qual é o outro email?");
      },
    );
  })();
}

/**
 * Pede a palavra-passe e valida o comprimento **antes** da confirmação, para
 * não obrigar a escrever duas vezes uma que ia ser recusada.
 */
function askPassword(intro?: string): void {
  void (async () => {
    await botSay(intro ?? `Agora cria uma palavra-passe (mínimo ${PASSWORD_MIN_LENGTH} caracteres) — vai ser a tua conta.`);
    inputText({
      placeholder: "••••••••",
      type: "password",
      onSubmit: async (v) => {
        userSay("••••••••");
        const check = validatePasswordLength(v);
        if (check.status === "invalid") {
          await botSay(check.message);
          return;
        }
        clearInput();
        askPasswordConfirm(v);
      },
    });
  })();
}

/**
 * Pede a mesma palavra-passe outra vez. Se não coincidirem, pede as **duas** de
 * novo — assim o Dono não fica a adivinhar qual delas estava errada.
 */
function askPasswordConfirm(password: string): void {
  void (async () => {
    await botSay("Escreve a mesma palavra-passe outra vez, para confirmar.");
    inputText({
      placeholder: "••••••••",
      type: "password",
      onSubmit: async (v) => {
        userSay("••••••••");
        clearInput();
        const check = validatePasswordConfirmation(password, v);
        if (check.status === "invalid") {
          await botSay(check.message);
          askPassword("Escreve a palavra-passe que queres para a tua conta.");
          return;
        }
        pendingPassword = password;
        askConfirmAccount();
      },
    });
  })();
}

/** Cartão com os dados da conta que estão a valer neste momento. */
function accountSummaryCard(): string {
  const linha = (rotulo: string, valor: string): string =>
    `<div class="flex items-baseline gap-2 py-1"><span class="text-[11px] font-bold uppercase tracking-wide text-gray-500 shrink-0" style="min-width:48px">${esc(rotulo)}</span><span class="text-sm text-gray-900 font-medium" style="word-break:break-word">${esc(valor)}</span></div>`;
  return `<div class="text-left">
    <div class="flex items-center gap-2 pb-2 mb-1.5 border-b border-gray-100">
      <span class="material-symbols-outlined text-[18px]" style="color:${ACCENT}">badge</span>
      <h4 class="font-black text-gray-900 text-sm">Os teus dados</h4>
    </div>
    ${linha("Nome", String(wiz.data[WIZARD_FIELDS.ownerName] ?? ""))}
    ${linha("Email", String(wiz.data[WIZARD_FIELDS.email] ?? ""))}
  </div>`;
}

/**
 * Resumo antes de criar a conta: o Dono confirma ou corrige cada campo. É
 * também o ponto de regresso das correções, por isso o cartão aparece sempre
 * com os valores em vigor — o que ficou atrás no chat não se confunde com eles.
 */
function askConfirmAccount(): void {
  void (async () => {
    await botSay("Antes de criar a conta, confere o que tenho — é isto que vai ficar a valer:");
    botCard(accountSummaryCard());
    inputChips(
      [
        { value: "ok", label: "Está tudo certo" },
        { value: "nome", label: REGISTER_FIX_LABELS.nome },
        { value: "email", label: REGISTER_FIX_LABELS.email },
      ],
      (value, label) => {
        userSay(label);
        clearInput();
        if (value === "nome") { correctName(); return; }
        if (value === "email") { correctEmail(); return; }
        createAccount();
      },
    );
  })();
}

/** Volta a pedir só o email e regressa ao resumo. */
function correctEmail(): void {
  const antigo = String(wiz.data[WIZARD_FIELDS.email] ?? "");
  askEmail(askConfirmAccount, antigo
    ? `Certo. Escreve o email correto — o anterior (${antigo}) deixa de valer.`
    : "Certo. Qual é o teu email?");
}

/** Volta a pedir só o nome e regressa ao resumo. */
function correctName(): void {
  const antigo = String(wiz.data[WIZARD_FIELDS.ownerName] ?? "");
  askName(askConfirmAccount, antigo
    ? `Certo. Escreve o nome correto — o anterior (${antigo}) deixa de valer.`
    : "Certo. Qual é o teu nome?");
}

/**
 * Há um registo a correr. A conversa já tira os botões do ecrã ao escolher,
 * mas a guarda fica explícita: um segundo «Está tudo certo» (duplo toque, ou
 * um clique que chega antes de o ecrã mudar) nunca faz uma segunda chamada a
 * `register` enquanto a primeira não terminou.
 */
let registering = false;

function createAccount(): void {
  if (registering) return;
  registering = true;
  void (async () => {
    try {
      inputBusy("A criar a tua conta…");
      const email = String(wiz.data[WIZARD_FIELDS.email] ?? "");
      const name = String(wiz.data[WIZARD_FIELDS.ownerName] ?? "");
      const res = await authService.register({ email, password: pendingPassword, name });
      clearInput();
      if (!res.ok) {
        await botSay(res.error.reason);
        offerRegisterFix(res.error);
        return;
      }
      pendingPassword = "";
      wiz.session = res.value;
      appState.session = res.value;
      appState.ownerId = res.value.ownerId;
      wiz.data[WIZARD_FIELDS.ownerId] = res.value.ownerId;
      await botSay("Boa, conta criada! 🎉");
      askPhone();
    } finally {
      registering = false;
    }
  })();
}

/**
 * O registo falhou: mostra a mensagem e deixa o Dono escolher o que corrigir.
 * As escolhas vêm do erro estruturado (`code` e `fields`), não de procurar
 * palavras na mensagem — a decisão de para onde voltar é dele, não uma adivinha.
 */
function offerRegisterFix(error: AuthError): void {
  void (async () => {
    await botSay("Não vou adivinhar onde está o problema. Diz-me o que queres corrigir:");
    inputChips(
      buildRegisterFixOptions(error).map((o) => ({ value: o.value, label: o.label })),
      async (value, label) => {
        userSay(label);
        clearInput();
        if (value === "entrar") {
          await botSay("Certo, levo-te ao início de sessão. Depois de entrares, voltas aqui para criar a loja.");
          go("#/login");
          return;
        }
        if (value === "email") { correctEmail(); return; }
        if (value === "nome") { correctName(); return; }
        askPassword("Certo, escolhe outra palavra-passe.");
      },
    );
  })();
}

/* --------------------- Confirmação do telemóvel por SMS -------------------- */

/**
 * Momento em que o reenvio abre, e quantas SMS já saíram neste desafio.
 *
 * Guardados fora dos passos para a contagem **sobreviver** a um código errado:
 * sem isto, cada tentativa falhada voltava a abrir o botão de reenviar, e a
 * espera de 20 s deixava de existir.
 */
let codeResendAt: number | null = null;

/** Telemóvel escrito, já normalizado. */
function phoneEscrito(): string {
  return String(wiz.data[WIZARD_FIELDS.phone] ?? "");
}

/** Pede o número. `intro` permite reaproveitar o passo como correção. */
function askPhone(intro?: string): void {
  void (async () => {
    await botSay(intro ?? "Agora o teu telemóvel. Envio-te um código por SMS para confirmar que o número é teu — é por ele que as encomendas te vão chegar.");
    inputText({
      placeholder: "9XX XXX XXX",
      type: "tel",
      onSubmit: async (v) => {
        userSay(v);
        if (!isValidAoPhone(v)) {
          await botSay("Esse número não parece válido. Escreve os nove algarismos do telemóvel, a começar por 9.");
          return;
        }
        wiz.data[WIZARD_FIELDS.phone] = normalizeAoPhone(v);
        clearInput();
        await enviarCodigo(true);
      },
    });
  })();
}

/**
 * Pede o código ao servidor e abre o ecrã de confirmação.
 *
 * Nenhuma falha prende o Dono: um número recusado volta ao passo do número, e
 * um serviço de SMS indisponível oferece seguir sem confirmar. Era o risco
 * óbvio de pôr uma SMS no caminho da criação de conta — se a SMS não sai,
 * ninguém cria conta.
 */
async function enviarCodigo(primeiro: boolean): Promise<void> {
  const phone = phoneEscrito();
  inputBusy(primeiro ? "A enviar o código…" : "A enviar outro código…");
  const r = await requestPhoneCode(phone);
  clearInput();

  if (r.success) {
    if (r.alreadyVerified) {
      await botSay("Este número já está confirmado. 👍");
      continuarLoja();
      return;
    }
    codeResendAt = typeof r.resendInMs === "number" ? Date.now() + r.resendInMs : null;
    await botSay(primeiro
      ? `Enviei um código para ${formatPhoneForDisplay(phone)}. Escreve-o aqui — chega em poucos segundos.`
      : "Enviei outro código. Escreve-o aqui.");
    askPhoneCode();
    return;
  }

  if (r.code === "BAD_PHONE") {
    await botSay(r.error ?? "Esse número não é válido.");
    askPhone("Qual é o número correto?");
    return;
  }
  // `TOO_SOON` e `MAX_SENDS` são respostas ao reenvio: o código anterior ainda
  // vale, e o ecrã de confirmação continua a ser o sítio certo.
  if (r.code === "TOO_SOON" || r.code === "MAX_SENDS") {
    codeResendAt = r.code === "TOO_SOON" && typeof r.waitMs === "number" ? Date.now() + r.waitMs : null;
    await botSay(r.error ?? "Aguarde um pouco para pedir outro código.");
    askPhoneCode();
    return;
  }
  // Serviço de SMS em baixo, sem saldo ou por configurar. Dizer a verdade e
  // deixar escolher: tentar outra vez, ou seguir e confirmar depois.
  await botSay(r.error ?? "Não foi possível enviar a SMS agora.");
  inputChips(
    [
      { value: "retry", label: "Tentar de novo" },
      { value: "phone", label: "Trocar o número" },
      { value: "skip", label: "Continuar sem confirmar" },
    ],
    async (value, label) => {
      userSay(label);
      clearInput();
      if (value === "retry") { await enviarCodigo(primeiro); return; }
      if (value === "phone") { askPhone("Qual é o número?"); return; }
      seguirSemConfirmar();
    },
  );
}

/** Ecrã de confirmação, com o estado do reenvio que estiver em vigor. */
function askPhoneCode(): void {
  inputCode({
    resendInMs: codeResendAt === null ? null : Math.max(0, codeResendAt - Date.now()),
    onSubmit: (code) => {
      userSay(code);
      void confirmarCodigo(code);
    },
    onResend: () => { clearInput(); void enviarCodigo(false); },
    onGiveUp: () => { userSay("Não recebi o código"); clearInput(); seguirSemConfirmar(); },
    onChangePhone: () => { clearInput(); askPhone("Certo. Qual é o número correto?"); },
  });
}

/** Confirma o código escrito. Um código errado volta ao mesmo ecrã, com a espera intacta. */
async function confirmarCodigo(code: string): Promise<void> {
  inputBusy("A confirmar o código…");
  const r = await confirmPhoneCode(code);
  clearInput();
  if (r.success) {
    await botSay("Número confirmado. ✅");
    continuarLoja();
    return;
  }
  await botSay(r.error ?? "Não foi possível confirmar o código.");
  // Sem tentativas ou com o código caducado, insistir no mesmo código não leva
  // a nada: o reenvio é o caminho, e abre já.
  if (r.code === "MAX_ATTEMPTS" || r.code === "EXPIRED" || r.code === "NO_CHALLENGE") codeResendAt = Date.now();
  askPhoneCode();
}

/** Segue sem confirmar: a conta fica, e publicar é que exige o número confirmado. */
function seguirSemConfirmar(): void {
  void (async () => {
    codeResendAt = null;
    await botSay("Sem problema, seguimos. A tua conta está criada e podes montar a loja à vontade.");
    await botSay("Para a pôres online é que precisas de confirmar o número — fazes isso no Dashboard, no aviso que vai estar no «Início».");
    continuarLoja();
  })();
}

/* ---------------------------------- A loja ---------------------------------- */

/**
 * Grava o que já foi respondido, com a pergunta que falta.
 *
 * Sem `ownerId` não grava: a fase da conta não é guardada, e antes dela não há
 * dono a quem o rascunho pertença.
 */
function guardarRascunho(step: WizardStep): void {
  saveWizardDraft({ ownerId: String(wiz.data[WIZARD_FIELDS.ownerId] ?? ""), step, data: wiz.data });
}

/**
 * Entra na fase da loja. Havendo um rascunho desta conta, pergunta primeiro se
 * continua de onde ficou — recomeçar sem avisar é que apagava o trabalho.
 *
 * É chamada de **todos** os sítios onde a conversa chega à loja: com sessão já
 * iniciada, com o número confirmado agora, com o número já confirmado antes, e
 * de quem escolheu seguir sem confirmar.
 */
function continuarLoja(): void {
  const ownerId = String(wiz.data[WIZARD_FIELDS.ownerId] ?? "");
  const rascunho = ownerId ? readWizardDraft(ownerId) : null;
  if (!rascunho) { askStoreName(); return; }
  void (async () => {
    const nome = String(rascunho.data[WIZARD_FIELDS.name] ?? "").trim();
    await botSay(nome
      ? `Tínhamos ficado a meio da loja «${nome}». Queres continuar de onde ficaste?`
      : "Tinhas uma loja a meio por aqui. Queres continuar de onde ficaste?");
    inputChips(
      [
        { value: "sim", label: "Continuar" },
        { value: "novo", label: "Começar de novo" },
      ],
      (value, label) => {
        userSay(label);
        clearInput();
        if (value === "novo") { clearWizardDraft(); askStoreName(); return; }
        wiz.data = { ...wiz.data, ...rascunho.data };
        retomar(rascunho.step);
      },
    );
  })();
}

/** Retoma no passo gravado. */
function retomar(step: WizardStep): void {
  if (step === "type") { askType(); return; }
  if (step === "about") { askAbout(); return; }
  if (step === "seo") {
    // Textos que já existem não se voltam a gerar: o Dono pode tê-los corrigido
    // à mão, e pedi-los outra vez à IA apagava-lhe a correção.
    const jaTem = String(wiz.data.seoTitle ?? "").trim() || String(wiz.data.seoDescription ?? "").trim();
    if (jaTem) showSeoPreview();
    else askSeoPreview();
    return;
  }
  if (step === "subdomain") { askSubdomainRecommend(); return; }
  askStoreName();
}

function askStoreName(): void {
  void (async () => {
    await botSay("Qual vai ser o nome da tua loja?");
    inputText({
      placeholder: "Ex: Boutique Luanda",
      onSubmit: (v) => {
        userSay(v);
        wiz.data[WIZARD_FIELDS.name] = v;
        guardarRascunho("type");
        clearInput();
        askType();
      },
    });
  })();
}

function askType(): void {
  void (async () => {
    await botSay("Gostei do nome! Agora escolhe o tipo de negócio da tua loja:");
    const options = buildStoreTypeOptions().map((o) => ({ value: o.value, label: o.label }));
    inputChips(options, async (value, label) => {
      userSay(label);
      wiz.data[WIZARD_FIELDS.storeType] = value;
      clearInput();
      // Valida nome + tipo em conjunto.
      const res = validatePassoNomeTipo(wiz.data);
      if (res.status === "invalid") {
        await botSay(res.fieldErrors[0]?.message ?? "Algo não está certo, vamos tentar de novo.");
        if (res.fieldErrors.some((f) => f.field === WIZARD_FIELDS.name)) { askStoreName(); return; }
        askType();
        return;
      }
      wiz.data = { ...wiz.data, ...res.data };
      guardarRascunho("about");
      askAbout();
    });
  })();
}

/**
 * Pede ao dono para descrever a loja em detalhe. O texto alimenta a IA que gera
 * a melhor descrição de SEO (visibilidade no Google e nas partilhas).
 */
function askAbout(): void {
  void (async () => {
    await botSay("Conta-me tudo sobre a tua loja: o que vendes, o que te torna especial, para quem é, onde entregas… quanto mais detalhado, melhor.");
    await botSay("Vou usar estas informações para criar a melhor descrição da tua loja para o Google e as redes sociais — isto ajuda mesmo a apareceres nas pesquisas. 😉");
    inputTextarea({
      placeholder: "Ex: Vendemos cosméticos naturais feitos em Angola, com entrega em Luanda…",
      onSubmit: (v) => {
        userSay(v);
        wiz.data.aboutStore = v;
        guardarRascunho("seo");
        clearInput();
        askSeoPreview();
      },
    });
  })();
}

/**
 * Gera título + descrição de SEO por IA e mostra a pré-visualização do Google.
 *
 * `byAi` diz se foi mesmo a IA a escrever. Quando não foi — o modelo não
 * respondeu —, o texto sai do que o Dono escreveu e o assistente **di-lo**.
 * Prometer «a melhor descrição para o Google» e entregar em silêncio um resumo
 * do texto dele foi o que esteve a acontecer enquanto o modelo configurado não
 * existia.
 */
function askSeoPreview(): void {
  void (async () => {
    inputBusy("A criar a melhor descrição para o Google…");
    const storeName = String(wiz.data[WIZARD_FIELDS.name] ?? "A minha loja");
    const storeType = String(wiz.data[WIZARD_FIELDS.storeType] ?? "");
    const about = String(wiz.data.aboutStore ?? "");
    const [descricao, titulo] = await Promise.all([
      generateSeoDescription({ storeName, storeType, about }),
      generateSeoTitle({ storeName, storeType, about }),
    ]);
    wiz.data.seoTitle = titulo.text;
    wiz.data.seoDescription = descricao.text;
    wiz.data.seoByAi = descricao.byAi && titulo.byAi;
    // Gravado já: sair agora não obriga a esperar outra vez pela IA.
    guardarRascunho("seo");
    clearInput();
    showSeoPreview();
  })();
}

/** Mostra o cartão de pré-visualização + pergunta de confirmação. */
function showSeoPreview(): void {
  void (async () => {
    await botSay(wiz.data.seoByAi === false
      ? "A IA não respondeu agora, por isso parti do teu texto. Podes editar à vontade — é assim que a loja vai aparecer no Google:"
      : "Prontinho! A tua loja vai aparecer assim no Google:");
    botCard(googlePreviewCard(String(wiz.data.seoTitle ?? ""), String(wiz.data.seoDescription ?? "")));
    await botSay("Concordas? Podes editar o título e a descrição se quiseres.");
    inputChips(
      [
        { value: "ok", label: "👍 Sim, está ótimo" },
        { value: "edit", label: "✏️ Editar título e descrição" },
      ],
      (value, label) => {
        userSay(label);
        clearInput();
        if (value === "edit") { seoEditForm(); return; }
        guardarRascunho("subdomain");
        askSubdomainRecommend();
      },
    );
  })();
}

/** Formulário para editar manualmente o título e a descrição de SEO. */
function seoEditForm(): void {
  const zone = $("#chat-input")!;
  zone.innerHTML = `<form class="flex flex-col gap-3">
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Título (aparece no Google)</label>
      <input data-seo-title class="mb-cinput" style="border-radius:.75rem" maxlength="70" value="${esc(String(wiz.data.seoTitle ?? ""))}" placeholder="Título da loja" />
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Descrição (até 160 caracteres)</label>
      <textarea data-seo-desc class="mb-cinput" rows="3" style="border-radius:1.25rem;resize:none" maxlength="180" placeholder="Descrição da loja">${esc(String(wiz.data.seoDescription ?? ""))}</textarea>
    </div>
    <button type="submit" class="self-end inline-flex items-center gap-2 text-white font-semibold px-5 py-2.5 rounded-full shadow-sm hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">check</span> Guardar</button>
  </form>`;
  const form = zone.querySelector("form")!;
  const titleEl = zone.querySelector("[data-seo-title]") as HTMLInputElement;
  const descEl = zone.querySelector("[data-seo-desc]") as HTMLTextAreaElement;
  titleEl.focus();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = titleEl.value.trim();
    const d = descEl.value.trim();
    if (t) wiz.data.seoTitle = t;
    if (d) wiz.data.seoDescription = d;
    guardarRascunho("seo");
    clearInput();
    userSay("Atualizei o título e a descrição.");
    showSeoPreview();
  });
}

async function resolveSub(): Promise<{ ok: true; subdomain: string } | { ok: false; message: string; field: string }> {
  const res = await resolvePassoSubdominio(wiz.data, identifierService);
  if (res.status === "invalid") {
    const fe = res.fieldErrors[0];
    return { ok: false, message: fe?.message ?? "Endereço inválido.", field: fe?.field ?? WIZARD_FIELDS.identifier };
  }
  wiz.data = { ...wiz.data, ...res.data };
  wiz.subdomain = res.value.subdomain;
  return { ok: true, subdomain: res.value.subdomain };
}

function askSubdomainRecommend(): void {
  void (async () => {
    inputBusy("A preparar o teu endereço…");
    // Recomendação derivada do nome (sem identifier definido).
    delete wiz.data[WIZARD_FIELDS.identifier];
    const r = await resolveSub();
    clearInput();
    if (!r.ok) {
      await botSay(r.message);
      askSubdomainCustom();
      return;
    }
    await botSay(`Recomendo este endereço para a tua loja: ${r.subdomain.split(".")[0]}.${STORE_APEX}`);
    await botSay("É assim que as pessoas vão ver o link da tua loja. Aprovas?");
    inputYesNo(
      () => { userSay("Sim, aprovo"); clearInput(); createStore(); },
      () => { userSay("Não, quero outro"); clearInput(); askSubdomainCustom(); },
    );
  })();
}

function askSubdomainCustom(): void {
  void (async () => {
    await botSay("Sem problema! Qual vai ser o endereço desejado? (só letras minúsculas, números e hífen)");
    inputText({
      placeholder: "a-sua-loja",
      onSubmit: async (v) => {
        userSay(`${v}.${STORE_APEX}`);
        wiz.data[WIZARD_FIELDS.identifier] = v;
        clearInput();
        inputBusy("A verificar o endereço…");
        const r = await resolveSub();
        clearInput();
        if (!r.ok) {
          await botSay(r.message);
          askSubdomainCustom();
          return;
        }
        await botSay(`Perfeito: ${r.subdomain.split(".")[0]}.${STORE_APEX}. Confirmas?`);
        inputYesNo(
          () => { userSay("Sim, confirmo"); clearInput(); createStore(); },
          () => { userSay("Não, quero outro"); clearInput(); askSubdomainCustom(); },
        );
      },
    });
  })();
}

function createStore(): void {
  void (async () => {
    inputBusy("A criar a tua loja…");
    // Deixou de haver limite de lojas por escalão: não há escalões.
    if (!wiz.session) { await botSay("Faltou criar a conta. Vamos recomeçar."); askName(); return; }

    const result = await wizardFlow.completeCreation(wiz.data, wiz.session);
    if (result.status !== "created") {
      await botSay(result.message || "Não foi possível criar a loja. Vamos tentar o endereço novamente.");
      askSubdomainCustom();
      return;
    }
    // A loja NASCE EM RASCUNHO. Publicar exige subscrição ativa, e é imposto
    // pela base de dados (gatilho `stores_publish_requires_plan`, migração
    // 0019): tentar publicar aqui rebentaria com uma exceção do Postgres.
    appState.storeId = result.store.id;
    appState.storeIdentifier = result.store.identifier;
    appState.templateId = result.store.templateId;
    wiz.storeId = result.store.id; // Guarda para aplicar preset depois

    // Guarda o título + descrição de SEO aprovados pelo dono (pré-visualização).
    const seoTitle = String(wiz.data.seoTitle ?? "").trim();
    const seoDescription = String(wiz.data.seoDescription ?? "").trim();
    if (seoTitle || seoDescription) {
      try {
        const c = await getCustomization(result.store.id);
        c.seo = { ...(c.seo ?? {}), ...(seoTitle ? { title: seoTitle } : {}), ...(seoDescription ? { description: seoDescription } : {}) };
        await saveCustomization(result.store.ownerId, result.store.id, c);
      } catch { /* SEO é opcional; não bloquear a criação */ }
    }

    // A loja existe: o rascunho do navegador já não tem nada a salvar, e
    // deixá-lo faria o próximo «criar loja» oferecer-se para continuar uma loja
    // que está criada.
    clearWizardDraft();
    await botSay("Está tudo feito! ✨ A tua loja está criada. Podes vê-la e personalizá-la à vontade — para a pôres online, ativas a subscrição no Dashboard.");
    goToModels();
  })();
}

/** Leva o dono à galeria de modelos prontos (por agora só usamos modelos). */
function goToModels(): void {
  void (async () => {
    await botSay("Agora escolhe o modelo da tua loja — vou levar-te à galeria de modelos prontos. 🎨");
    clearInput();
    await wait(900);
    // Reinicia o estado para uma próxima criação.
    wiz.data = {}; wiz.session = null; wiz.subdomain = ""; wiz.storeId = "";
    codeResendAt = null;
    go("#/modelos");
  })();
}
