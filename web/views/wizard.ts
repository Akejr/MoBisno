/**
 * Assistente de Criação — formato de CHAT guiado pelo robô do MôBisno.
 * Identidade visual branco + #F95901, com animações. O assistente conduz o
 * utilizador: nome → email → palavra-passe (cria conta) → nome da loja →
 * tipo de negócio → subdomínio (recomenda/aprova) → cria e publica → painel.
 *
 * Reutiliza a validação e os serviços do fluxo original (wizardSteps,
 * authService, wizardFlow, identifierService).
 */
import { render, $, go, esc } from "../lib/dom.js";
import { TEMPLATES, identifierService, authService, wizardFlow, appState, publishStore, currentSession, setOwnerPlan, getOwnerPlan, countPublishedStores } from "../composition.js";
import { DEFAULT_PLAN, getPlan, isPlanId, canPublishAnotherStore, type PlanId } from "../../src/services/plans.js";
import { validatePassoNomeTipo, resolvePassoSubdominio, buildStoreTypeOptions, WIZARD_FIELDS } from "../../src/ui/wizardSteps.js";
import type { Session } from "../../src/services/authService.js";

const ACCENT = "#F95901";

const wiz: { data: Record<string, unknown>; session: Session | null; plan: PlanId; subdomain: string } = {
  data: {},
  session: null,
  plan: DEFAULT_PLAN,
  subdomain: "",
};

function syncPlanFromHash(): void {
  const m = (location.search + location.hash).match(/[?&]plano=([a-z]+)/i);
  if (m && isPlanId(m[1])) wiz.plan = m[1];
}

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
    ".mb-cinput:focus{border-color:#F95901;box-shadow:0 0 0 3px rgba(249,89,1,.15)}";
  document.head.appendChild(st);
}

function renderShell(): void {
  injectStyle();
  render(`
  <div class="h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
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
  zone.innerHTML = `<div class="flex flex-wrap gap-2 justify-center">${options
    .map((o) => `<button data-v="${esc(o.value)}" class="mb-chip border border-gray-200 bg-white text-gray-700 text-sm font-medium px-4 py-2 rounded-full hover:border-[color:var(--mb-accent)] hover:text-[color:var(--mb-accent)]" style="--mb-accent:${ACCENT}">${esc(o.label)}</button>`)
    .join("")}</div>`;
  zone.querySelectorAll<HTMLElement>("[data-v]").forEach((b) =>
    b.addEventListener("click", () => onPick(b.dataset.v!, b.textContent ?? b.dataset.v!)));
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
  syncPlanFromHash();
  wiz.data = { [WIZARD_FIELDS.templateId]: defaultTemplateId() };
  renderShell();
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
  await botSay("Olá! Sou o assistente do MôBisno e vou te ajudar a criar a tua loja de forma rápida.");
  askName();
}

function askName(): void {
  void (async () => {
    await botSay("Qual é o seu nome?");
    inputText({
      placeholder: "Ex: João Silva",
      onSubmit: (v) => {
        userSay(v);
        wiz.data[WIZARD_FIELDS.ownerName] = v;
        clearInput();
        askEmail();
      },
    });
  })();
}

function askEmail(): void {
  void (async () => {
    await botSay("E o teu email?");
    inputText({
      placeholder: "voce@exemplo.com",
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
        askPassword();
      },
    });
  })();
}

function askPassword(): void {
  void (async () => {
    await botSay("Agora cria uma palavra-passe (mínimo 6 caracteres) — vai ser a tua conta.");
    inputText({
      placeholder: "••••••••",
      type: "password",
      onSubmit: async (v) => {
        userSay("••••••••");
        clearInput();
        inputBusy("A criar a tua conta…");
        const email = String(wiz.data[WIZARD_FIELDS.email] ?? "");
        const name = String(wiz.data[WIZARD_FIELDS.ownerName] ?? "");
        const res = await authService.register({ email, password: v, name });
        if (!res.ok) {
          await botSay(res.error.reason);
          // Se o problema é do email, volta a perguntar o email; senão a palavra-passe.
          if (res.error.reason.toLowerCase().includes("email")) askEmail();
          else askPassword();
          return;
        }
        wiz.session = res.value;
        appState.session = res.value;
        appState.ownerId = res.value.ownerId;
        wiz.data[WIZARD_FIELDS.ownerId] = res.value.ownerId;
        await setOwnerPlan(wiz.plan);
        await botSay("Boa, conta criada! 🎉");
        askStoreName();
      },
    });
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
      askSubdomainRecommend();
    });
  })();
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
    await botSay(`Recomendo este endereço para a tua loja: ${r.subdomain}`);
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
        userSay(`${v}.mobisno.store`);
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
        await botSay(`Perfeito: ${r.subdomain}. Confirmas?`);
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
    inputBusy("A criar e publicar a tua loja…");
    // Limite do plano (contas existentes com várias lojas).
    if (wiz.session) {
      const plan = getPlan(await getOwnerPlan(wiz.session.ownerId));
      const published = await countPublishedStores(wiz.session.ownerId);
      if (!canPublishAnotherStore(plan, published)) {
        await botSay(`O teu plano ${plan.name} não permite publicar outra loja. Podes fazer upgrade no painel.`);
        clearInput();
        inputText({ placeholder: "Escreve qualquer coisa para ir ao painel", cta: "Ir ao painel", onSubmit: () => go("#/painel") });
        return;
      }
    }
    if (!wiz.session) { await botSay("Faltou criar a conta. Vamos recomeçar."); askName(); return; }

    const result = await wizardFlow.completeCreation(wiz.data, wiz.session);
    if (result.status !== "created") {
      await botSay(result.message || "Não foi possível criar a loja. Vamos tentar o endereço novamente.");
      askSubdomainCustom();
      return;
    }
    await publishStore(result.store.ownerId, result.store.id);
    appState.storeId = result.store.id;
    appState.storeIdentifier = result.store.identifier;
    appState.templateId = result.store.templateId;

    await botSay("Está tudo feito! ✨ A tua loja foi criada e publicada.");
    await botSay("Vou te direcionar ao painel, onde podes personalizar tudo no teu website.");
    clearInput();
    await wait(1400);
    // Reinicia o estado para uma próxima criação.
    wiz.data = {}; wiz.session = null; wiz.subdomain = ""; wiz.plan = DEFAULT_PLAN;
    go("#/painel");
  })();
}
