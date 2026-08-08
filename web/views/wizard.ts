/**
 * Assistente de Criação — formato de CHAT guiado pelo robô do MôBisno.
 * Identidade visual branco + #F95901, com animações. O assistente conduz o
 * utilizador: nome → email → palavra-passe → confirmação da palavra-passe →
 * resumo dos dados (confirmar ou corrigir) → cria conta → nome da loja →
 * tipo de negócio → subdomínio (recomenda/aprova) → cria e publica → painel.
 *
 * Qualquer passo pode ser repetido para corrigir um campo: `askName` e
 * `askEmail` recebem o passo seguinte, e uma correção regressa ao resumo em vez
 * de arrastar o utilizador pelos passos que já estavam bem.
 *
 * Reutiliza a validação e os serviços do fluxo original (wizardSteps,
 * authService, wizardFlow, identifierService).
 */
import { render, $, go, esc } from "../lib/dom.js";
import { TEMPLATES, identifierService, authService, wizardFlow, appState, currentSession, adminPanelFor, STORE_APEX } from "../composition.js";
import { generateLogos, dataUrlToUint8Array, LOGO_PROPOSALS, type LogoResult, type LogoDirection } from "../lib/logoApi.js";
import { composeLogo, PREVIEW_SIZE, FINAL_SIZE } from "../lib/logoCompose.js";
import { openLogoCheckout, LOGO_PRICE_KZ } from "../lib/logoPurchase.js";
import { LOGO_POLICY } from "../../src/services/fileService.js";
import {
  validatePassoNomeTipo, resolvePassoSubdominio, buildStoreTypeOptions, WIZARD_FIELDS,
  PASSWORD_MIN_LENGTH, validatePasswordLength, validatePasswordConfirmation,
  buildRegisterFixOptions, REGISTER_FIX_LABELS,
} from "../../src/ui/wizardSteps.js";
import { getCustomization, saveCustomization } from "../supabase/customization.js";
import { generateSeoDescription, generateSeoTitle } from "../lib/seoGen.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import type { AuthError, Session } from "../../src/services/authService.js";

const ACCENT = "#F95901";

const wiz: { data: Record<string, unknown>; session: Session | null; subdomain: string; storeId: string } = {
  data: {},
  session: null,
  subdomain: "",
  storeId: "",
};


function defaultTemplateId(): string {
  return TEMPLATES.find((t) => t.ready)?.id ?? TEMPLATES[0]?.id ?? "galeria";
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

function clearInput(): void { $("#chat-input")!.innerHTML = ""; }

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
  $("#chat-input")!.innerHTML = `<div class="flex items-center justify-center gap-2 text-gray-500 text-sm py-2"><span class="mb-dot"></span><span class="mb-dot" style="animation-delay:.15s"></span><span class="mb-dot" style="animation-delay:.3s"></span> <span class="ml-1">${esc(label)}</span></div>`;
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
    askStoreName();
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

/** Pergunta o email, com a mesma validação de formato de sempre (`EMAIL_RE`). */
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
        clearInput();
        next();
      },
    });
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

function createAccount(): void {
  void (async () => {
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
    askStoreName();
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

function askStoreName(): void {
  void (async () => {
    await botSay("Qual vai ser o nome da tua loja?");
    inputText({
      placeholder: "Ex: Boutique Luanda",
      onSubmit: (v) => {
        userSay(v);
        wiz.data[WIZARD_FIELDS.name] = v;
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
        clearInput();
        askSeoPreview();
      },
    });
  })();
}

/** Gera título + descrição de SEO por IA e mostra a pré-visualização do Google. */
function askSeoPreview(): void {
  void (async () => {
    inputBusy("A criar a melhor descrição para o Google…");
    const storeName = String(wiz.data[WIZARD_FIELDS.name] ?? "A minha loja");
    const storeType = String(wiz.data[WIZARD_FIELDS.storeType] ?? "");
    const about = String(wiz.data.aboutStore ?? "");
    const [description, title] = await Promise.all([
      generateSeoDescription({ storeName, storeType, about }),
      generateSeoTitle({ storeName, storeType, about }),
    ]);
    wiz.data.seoTitle = title;
    wiz.data.seoDescription = description;
    clearInput();
    showSeoPreview();
  })();
}

/** Mostra o cartão de pré-visualização + pergunta de confirmação. */
function showSeoPreview(): void {
  void (async () => {
    await botSay("Prontinho! A tua loja vai aparecer assim no Google:");
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
        if (value === "edit") seoEditForm();
        else askSubdomainRecommend();
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

    await botSay("Está tudo feito! ✨ A tua loja está criada. Podes vê-la e personalizá-la à vontade — para a pôres online, ativas a subscrição no Dashboard.");
    askLogo(result.store.ownerId, result.store.id);
  })();
}

/* ------------------------------ Logótipo ------------------------------ */

/**
 * Estado do Gerador_De_Logotipos dentro do wizard.
 *
 * `busy` é a guarda de R2.7: enquanto há um pedido em curso, qualquer nova
 * submissão (incluindo um duplo clique em «Tentar de novo») é rejeitada.
 * `description` guarda a descrição do pedido para o «Tentar de novo» repetir
 * exactamente o mesmo pedido (R2.8).
 */
const logoGen: { busy: boolean; description: string } = { busy: false, description: "" };

/**
 * Cabeçalho da secção de criação de logótipos, com o selo «Beta» (R2.9).
 * Aparece em todos os cartões da secção: oferta, propostas e falhas.
 */
function logoSectionHeader(): string {
  return `<div class="flex items-center gap-2 flex-wrap pb-2 mb-2.5 border-b border-gray-100">
    <span class="material-symbols-outlined text-[18px]" style="color:${ACCENT}">auto_awesome</span>
    <h4 class="font-black text-gray-900 text-sm">Criar logótipo</h4>
    <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style="background:rgba(249,89,1,.12);color:${ACCENT}"><span class="material-symbols-outlined text-[12px]">science</span> Beta</span>
  </div>`;
}

/** Pergunta se o dono já tem logótipo; se não, oferece criar por IA (pago). */
function askLogo(ownerId: string, storeId: string): void {
  void (async () => {
    await botSay("Antes de escolheres o modelo: já tens um logótipo para a tua loja?");
    inputChips(
      [
        { value: "sim", label: "Sim, já tenho" },
        { value: "nao", label: "Ainda não tenho" },
      ],
      async (value, label) => {
        userSay(label);
        clearInput();
        if (value === "sim") {
          await botSay("Perfeito! Podes carregá-lo a qualquer momento no editor da loja. 👍");
          goToModels();
        } else {
          offerLogo(ownerId, storeId);
        }
      },
    );
  })();
}

/** Oferece gerar as propostas de logótipo por IA (custo 5.000 Kz). */
function offerLogo(ownerId: string, storeId: string): void {
  void (async () => {
    botCard(`${logoSectionHeader()}
      <p class="text-sm text-gray-800 leading-relaxed">Queres que eu crie um logótipo profissional agora, com IA? Gero ${LOGO_PROPOSALS} propostas em PNG com fundo transparente e ficas com a que escolheres — por ${LOGO_PRICE_KZ.toLocaleString("pt-PT")} Kz.</p>`);
    await wait(220);
    inputChips(
      [
        { value: "sim", label: "✨ Sim, criar logótipo" },
        { value: "nao", label: "Agora não" },
      ],
      async (value, label) => {
        userSay(label);
        clearInput();
        if (value === "sim") generateWizardLogos(ownerId, storeId);
        else {
          await botSay("Sem problema! Podes criá-lo mais tarde no Dashboard, em \"Criar logótipo\". 🙂");
          goToModels();
        }
      },
    );
  })();
}

/** Compõe a descrição a enviar ao servidor a partir dos dados do wizard. */
function wizardLogoDescription(): string {
  const storeName = String(wiz.data[WIZARD_FIELDS.name] ?? "A minha loja");
  const about = String(wiz.data.aboutStore ?? "");
  return `${storeName}. ${about}`.trim();
}

/** Primeira geração: fixa a descrição e arranca o pedido. */
function generateWizardLogos(ownerId: string, storeId: string): void {
  void runLogoGeneration(wizardLogoDescription(), ownerId, storeId);
}

/**
 * Pede as propostas e trata as **três variantes** de `LogoResult` (D3).
 *
 * Enquanto espera, a zona de entrada mostra o estado de progresso e qualquer
 * submissão adicional é rejeitada pela guarda `logoGen.busy` (R2.7).
 */
async function runLogoGeneration(description: string, ownerId: string, storeId: string): Promise<void> {
  if (logoGen.busy) return; // R2.7 — pedido em curso: submissão rejeitada.
  logoGen.busy = true;
  logoGen.description = description; // R2.8 — «Tentar de novo» repete esta descrição.
  inputBusy(`A criar ${LOGO_PROPOSALS} propostas de logótipo…`);

  let result: LogoResult;
  try {
    result = await generateLogos(description);
  } finally {
    logoGen.busy = false;
  }
  clearInput();

  if (result.kind === "ok" && result.directions.length > 0) {
    await showLogoOptions(result, ownerId, storeId);
    return;
  }
  showLogoFailure(logoFailureText(result), ownerId, storeId);
}

/**
 * Texto que o Dono lê em cada situação de falha.
 *
 * - `ok` sem propostas: o servidor respondeu, mas não veio nada;
 * - `server-error`: o `error` do servidor tal como vem, com `detail` quando
 *   existe (R2.4); com `error` vazio, texto genérico com o `status` à mão;
 * - `network-error`: distingue falha de comunicação de ausência de propostas
 *   (R2.5); o `message` é diagnóstico técnico, mostrado à parte.
 */
function logoFailureText(result: LogoResult): { text: string; detail?: string } {
  if (result.kind === "ok") {
    return { text: `O servidor respondeu, mas não veio nenhuma proposta (0 de ${result.requested}). Podes tentar de novo com a mesma descrição.` };
  }
  if (result.kind === "server-error") {
    const text = result.error
      ? `O servidor não conseguiu criar os logótipos: ${result.error}`
      : `O servidor não conseguiu criar os logótipos e não indicou o motivo (erro ${result.status}).`;
    return result.detail ? { text, detail: `Detalhe: ${result.detail}` } : { text };
  }
  return {
    text: "Não consegui falar com o servidor, por isso não sei se havia propostas para criar. Verifica a ligação à internet e tenta de novo.",
    detail: `Detalhe técnico: ${result.message}`,
  };
}

/** Cartão de falha com o motivo, mais as ações «Tentar de novo» e continuar. */
function showLogoFailure(msg: { text: string; detail?: string }, ownerId: string, storeId: string): void {
  botCard(`${logoSectionHeader()}
    <div class="flex gap-2 items-start">
      <span class="material-symbols-outlined text-[20px] shrink-0" style="color:#dc2626">error</span>
      <div class="min-w-0">
        <p class="text-sm text-gray-800 leading-relaxed" style="overflow-wrap:anywhere">${esc(msg.text)}</p>
        ${msg.detail ? `<p class="text-xs text-gray-500 mt-1.5 leading-relaxed" style="overflow-wrap:anywhere">${esc(msg.detail)}</p>` : ""}
      </div>
    </div>`);
  inputChips(
    [
      { value: "retry", label: "🔄 Tentar de novo" },
      { value: "skip", label: "Continuar sem logótipo" },
    ],
    async (value, label) => {
      userSay(label);
      clearInput();
      if (value === "retry") {
        // R2.8 — repete o pedido com exactamente a mesma descrição.
        await runLogoGeneration(logoGen.description, ownerId, storeId);
        return;
      }
      await botSay("Sem problema! Podes criá-lo mais tarde no Dashboard, em \"Criar logótipo\". 🙂");
      goToModels();
    },
  );
}

/**
 * Mostra as propostas recebidas num cartão do chat, com botão «Escolher» em
 * cada uma. Todas as propostas devolvidas aparecem, em PNG com fundo
 * transparente sobre o fundo axadrezado (R2.2); quando ficaram propostas em
 * falta, o cartão diz quantas (R2.3).
 */
async function showLogoOptions(
  result: { directions: LogoDirection[]; brief: { brandName: string }; requested: number; missing: number },
  ownerId: string,
  storeId: string,
): Promise<void> {
  // As direções são receitas: o PNG de cada proposta é composto aqui, com o
  // nome da marca desenhado por nós (ver `web/lib/logoCompose.ts`).
  const images = await Promise.all(
    result.directions.map((d) => composeLogo(result.brief.brandName, d, PREVIEW_SIZE)),
  );
  const row = document.createElement("div");
  row.className = "flex items-end gap-2";
  const checker = "background-image:linear-gradient(45deg,#eef1f4 25%,transparent 25%),linear-gradient(-45deg,#eef1f4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f4 75%),linear-gradient(-45deg,transparent 75%,#eef1f4 75%);background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0;background-color:#fff;";
  const cells = images.map((src, i) => `
    <div class="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div class="aspect-square flex items-center justify-center p-2" style="${checker}"><img src="${src}" alt="Proposta ${i + 1}" class="max-w-full max-h-full object-contain" oncontextmenu="return false" draggable="false" /></div>
      <button data-wlogo-pick="${i}" class="w-full py-2 text-xs font-bold text-white hover:opacity-95 transition-opacity" style="background:${ACCENT}">Escolher</button>
    </div>`).join("");
  const recebidas = images.length === 1 ? "1 proposta" : `${images.length} propostas`;
  const intro = result.missing > 0
    ? `Recebi ${recebidas} de ${result.requested} — ${result.missing === 1 ? "faltou 1" : `faltaram ${result.missing}`}. Escolhe a tua preferida:`
    : `Aqui estão as ${images.length} propostas. Escolhe a tua preferida:`;
  row.innerHTML = `${botAvatar()}<div class="mb-bubble bg-white border border-gray-100 rounded-2xl rounded-bl-md p-3 shadow-sm" style="max-width:96%">
    ${logoSectionHeader()}
    <p class="text-sm text-gray-800 leading-relaxed mb-2.5">${esc(intro)}</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">${cells}</div>
    ${result.missing > 0 ? `<button data-wlogo-retry class="mt-2.5 w-full py-2 text-xs font-bold rounded-xl border transition-colors hover:bg-gray-50" style="border-color:${ACCENT};color:${ACCENT}">Tentar de novo com a mesma descrição</button>` : ""}
  </div>`;
  $("#chat")!.appendChild(row);
  scrollDown();
  row.querySelectorAll<HTMLElement>("[data-wlogo-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      const chosen = result.directions[Number(b.dataset.wlogoPick)];
      if (!chosen) return;
      // Recomposto em alta resolução: mesmo desenho, ficheiro melhor.
      void composeLogo(result.brief.brandName, chosen, FINAL_SIZE)
        .then((src) => { if (src) void pickWizardLogo(src, ownerId, storeId); });
    }));
  // Propostas em falta: repetir o pedido é uma opção sem perder as recebidas.
  row.querySelector<HTMLElement>("[data-wlogo-retry]")?.addEventListener("click", () => {
    if (logoGen.busy) return; // R2.7
    userSay("Tentar de novo");
    void runLogoGeneration(logoGen.description, ownerId, storeId);
  });
}

/** Carrega o logótipo escolhido, inicia o pagamento e continua a conversa. */
async function pickWizardLogo(dataUrl: string, ownerId: string, storeId: string): Promise<void> {
  userSay("Escolhi este logótipo. ✨");
  inputBusy("A preparar o teu logótipo…");
  let logoUrl = "";
  try {
    const content = dataUrlToUint8Array(dataUrl);
    const fileService = adminPanelFor(storeId).services.fileService;
    const validation = fileService.validate({ content, fileName: "logotipo.png" }, LOGO_POLICY);
    if (!validation.ok) {
      clearInput();
      await botSay("Não consegui preparar esse logótipo. Podes tentar outro mais tarde no Dashboard.");
      goToModels();
      return;
    }
    const stored = await fileService.store(storeId, "logo", validation.value);
    logoUrl = stored.url;
    // R2.10 — a proposta escolhida fica guardada em `customization.logos`,
    // a mesma lista que o separador «Criar logótipo › Meus logótipos» lê.
    try {
      const fresh = await getCustomization(storeId);
      const logos = Array.isArray(fresh.logos) ? fresh.logos : [];
      await saveCustomization(ownerId, storeId, { ...fresh, logos: [...logos, logoUrl] });
    } catch { /* o ficheiro já está guardado; não bloquear o fluxo */ }
  } catch {
    clearInput();
    await botSay("Houve um problema a preparar o logótipo. Podes tentar mais tarde no Dashboard.");
    goToModels();
    return;
  }
  clearInput();
  await botSay(`Boa escolha! Só falta o pagamento de ${LOGO_PRICE_KZ.toLocaleString("pt-PT")} Kz. Vou abrir o pagamento — assim que for processado, o teu logótipo aparece em "Criar logótipo › Meus logótipos".`);
  openLogoCheckout({ ownerId, storeId, logoUrl });
  goToModels();
}

/** Leva o dono à galeria de modelos prontos (por agora só usamos modelos). */
function goToModels(): void {
  void (async () => {
    await botSay("Agora escolhe o modelo da tua loja — vou levar-te à galeria de modelos prontos. 🎨");
    clearInput();
    await wait(900);
    // Reinicia o estado para uma próxima criação.
    wiz.data = {}; wiz.session = null; wiz.subdomain = ""; wiz.storeId = "";
    go("#/modelos");
  })();
}
