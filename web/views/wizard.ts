/** Assistente de Criação — multi-step com a identidade visual da MôBisno (branco + #F95901). */
import { render, $, go, esc, toast } from "../lib/dom.js";
import { TEMPLATES, identifierService, authService, wizardFlow, appState, publishStore, currentSession, setOwnerPlan, getOwnerPlan, countPublishedStores } from "../composition.js";
import { openTemplatePreview, mountTemplateThumb } from "../lib/templatePreview.js";
import { DEFAULT_PLAN, getPlan, isPlanId, canPublishAnotherStore, formatLimit, type PlanId } from "../../src/services/plans.js";
import {
  validatePassoNomeTipo,
  resolvePassoSubdominio,
  validatePassoModelo,
  buildStoreTypeOptions,
  buildTemplateOptions,
  WIZARD_FIELDS,
} from "../../src/ui/wizardSteps.js";
import type { Session } from "../../src/services/authService.js";

const ACCENT = "#F95901";

const wiz: { step: number; data: Record<string, unknown>; subdomain: string; session: Session | null; preAuth: boolean; plan: PlanId } = {
  step: 1,
  data: {},
  subdomain: "",
  session: null,
  preAuth: false,
  plan: DEFAULT_PLAN,
};

/** Lê o plano escolhido na página de preços (ex.: /criar?plano=profissional). */
function syncPlanFromHash(): void {
  const m = (location.search + location.hash).match(/[?&]plano=([a-z]+)/i);
  if (m && isPlanId(m[1])) wiz.plan = m[1];
}

const STEP_DEFS = [
  { step: 1, title: "Dados" },
  { step: 2, title: "Modelo" },
  { step: 3, title: "Conta" },
  { step: 4, title: "Publicar" },
];

/** Passos visíveis no indicador (a conta é omitida quando já há sessão). */
function visibleSteps(): { step: number; title: string }[] {
  return STEP_DEFS.filter((s) => !(s.step === 3 && wiz.preAuth));
}

export function renderWizard(): void {
  syncPlanFromHash();
  injectStyle();
  if (wiz.step === 1) renderStep1();
  else if (wiz.step === 2) renderStep2();
  else if (wiz.step === 3) renderStep3();
  else renderStep4();
  wireShell();
}

/* -------------------------------- Estilos -------------------------------- */
function injectStyle(): void {
  if (document.getElementById("mb-wizard-style")) return;
  const st = document.createElement("style");
  st.id = "mb-wizard-style";
  st.textContent =
    ".mb-input{width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:.75rem;padding:.75rem 1rem;outline:none;transition:border-color .2s,box-shadow .2s;font-size:1rem;color:#111827}" +
    ".mb-input::placeholder{color:#9ca3af}" +
    ".mb-input:focus{border-color:#F95901;box-shadow:0 0 0 3px rgba(249,89,1,.15)}" +
    ".mb-step{animation:mbStepIn .35s cubic-bezier(.16,1,.3,1)}" +
    "@keyframes mbStepIn{from{opacity:0;transform:translateX(26px)}to{opacity:1;transform:translateX(0)}}" +
    ".mb-dot{transition:all .3s ease}" +
    ".tpl-acc-item{opacity:0;transform:translateX(-40px);animation:mbAccIn .6s ease forwards}" +
    "@keyframes mbAccIn{to{opacity:1;transform:translateX(0)}}";
  document.head.appendChild(st);
}

/* -------------------------------- Casca -------------------------------- */
function progress(): string {
  const steps = visibleSteps();
  const idx = steps.findIndex((s) => s.step === wiz.step);
  const pct = steps.length > 1 ? (idx / (steps.length - 1)) * 100 : 100;

  const dots = steps
    .map((s, i) => {
      const done = i < idx;
      const current = i === idx;
      const clickable = i <= idx;
      const dotStyle = done || current ? `background:${ACCENT}` : "background:#e5e7eb";
      const ring = current ? `box-shadow:0 0 0 4px rgba(249,89,1,.2)` : "";
      const labelCls = current ? "font-semibold" : "text-gray-400";
      const labelStyle = current ? `color:${ACCENT}` : "";
      return `<div class="flex flex-col items-center ${clickable ? "cursor-pointer" : "cursor-default"}" ${clickable ? `data-goto="${s.step}"` : ""}>
        <div class="mb-dot w-4 h-4 rounded-full" style="${dotStyle};${ring}"></div>
        <span class="text-xs mt-1.5 hidden sm:block ${labelCls}" style="${labelStyle}">${esc(s.title)}</span>
      </div>`;
    })
    .join("");

  return `<div class="mb-8">
    <div class="flex justify-between mb-2">${dots}</div>
    <div class="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all duration-300" style="width:${pct}%;background:${ACCENT}"></div>
    </div>
  </div>`;
}

function shell(inner: string, wide = false): string {
  const steps = visibleSteps();
  const idx = steps.findIndex((s) => s.step === wiz.step);
  const footer = `Passo ${idx + 1} de ${steps.length}: ${esc(steps[idx]?.title ?? "")}`;
  const maxw = wide ? "max-w-3xl" : "max-w-xl";

  return `
  <div class="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <a href="#/" id="brand" class="flex items-center gap-2">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </a>
        <a href="#/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <span class="material-symbols-outlined text-[18px]">close</span> Sair
        </a>
      </div>
    </nav>

    <main class="flex-grow flex items-start justify-center px-margin-mobile md:px-margin-desktop py-10">
      <div class="w-full ${maxw}">
        ${progress()}
        <div class="bg-white border border-gray-200 shadow-xl rounded-3xl overflow-hidden">
          <div class="mb-step p-7 md:p-10">${inner}</div>
        </div>
        <p class="mt-4 text-center text-sm text-gray-500">${footer}</p>
      </div>
    </main>
  </div>`;
}

/** Liga os elementos comuns da casca (logótipo + pontos de progresso). */
function wireShell(): void {
  document.querySelectorAll<HTMLElement>("[data-goto]").forEach((el) =>
    el.addEventListener("click", () => {
      const target = Number(el.dataset.goto);
      if (!Number.isNaN(target) && target < wiz.step) {
        wiz.step = target;
        renderWizard();
      }
    }),
  );
}

function header(icon: string, title: string, subtitle: string): string {
  return `<div class="mb-7">
    <h1 class="text-2xl md:text-3xl font-black tracking-tight">${esc(title)}</h1>
    <p class="text-gray-500 mt-2">${esc(subtitle)}</p>
  </div>`;
}

function errorBanner(messages: string[]): string {
  if (messages.length === 0) return "";
  return `<div class="rounded-xl px-4 py-3 mb-5 text-sm flex flex-col gap-1.5" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">
    ${messages.map((m) => `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">error</span>${esc(m)}</div>`).join("")}
  </div>`;
}

function btnPrimary(id: string, label: string, icon = "arrow_forward", type = "button"): string {
  return `<button id="${id}" type="${type}" class="inline-flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-xl shadow-lg active:scale-95 transition-transform hover:opacity-95" style="background:${ACCENT}">${esc(label)} <span class="material-symbols-outlined text-[18px]">${icon}</span></button>`;
}

function btnBack(id = "back"): string {
  return `<button id="${id}" type="button" class="inline-flex items-center gap-2 text-gray-700 font-semibold px-6 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Voltar</button>`;
}

/* -------------------------------- Passo 1 -------------------------------- */
function renderStep1(): void {
  const name = esc(wiz.data[WIZARD_FIELDS.name] ?? "");
  const selectedType = String(wiz.data[WIZARD_FIELDS.storeType] ?? "");
  const ident = esc(wiz.data[WIZARD_FIELDS.identifier] ?? "");
  const typeOptions = buildStoreTypeOptions(selectedType)
    .map((o) => `<option value="${esc(o.value)}" ${o.selected ? "selected" : ""}>${esc(o.label)}</option>`)
    .join("");

  render(shell(`
    ${header("storefront", "Dados da loja", "Vamos dar vida à sua ideia.")}
    <div class="mb-6 -mt-2 flex items-center gap-2 text-sm">
      <span class="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-full" style="background:rgba(249,89,1,.1);color:${ACCENT}"><span class="material-symbols-outlined text-[18px]">workspace_premium</span> Plano ${esc(getPlan(wiz.plan).name)}</span>
      <a href="#/#precos" class="text-gray-400 hover:text-gray-700 transition-colors">alterar</a>
    </div>
    <div id="errs"></div>
    <form id="f1" class="space-y-5">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700" for="name">Nome da loja</label>
        <input id="name" value="${name}" class="mb-input" placeholder="Ex: Boutique Luanda" />
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700" for="type">Tipo de negócio</label>
        <select id="type" class="mb-input">
          <option value="" ${selectedType ? "" : "selected"} disabled>Selecione uma categoria...</option>
          ${typeOptions}
        </select>
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700" for="ident">Subdomínio desejado <span class="text-gray-400 font-normal">(opcional)</span></label>
        <div class="flex rounded-xl border border-gray-200 overflow-hidden focus-within:border-[#F95901]" style="transition:border-color .2s">
          <input id="ident" value="${ident}" class="flex-1 min-w-0 w-full px-4 py-3 bg-transparent border-0 focus:ring-0 outline-none text-right text-gray-900" placeholder="a-sua-loja" />
          <span class="inline-flex items-center px-4 bg-gray-50 text-gray-500 select-none border-l border-gray-200 whitespace-nowrap">.mobisno.store</span>
        </div>
      </div>
      <div class="pt-2 flex justify-end">${btnPrimary("f1-next", "Próximo", "arrow_forward", "submit")}</div>
    </form>`));

  $("#f1")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      ...wiz.data,
      [WIZARD_FIELDS.name]: ($("#name") as HTMLInputElement).value,
      [WIZARD_FIELDS.storeType]: ($("#type") as HTMLSelectElement).value,
      [WIZARD_FIELDS.identifier]: ($("#ident") as HTMLInputElement).value,
    };

    const nameRes = validatePassoNomeTipo(data);
    if (nameRes.status === "invalid") {
      wiz.data = data;
      $("#errs")!.innerHTML = errorBanner(nameRes.fieldErrors.map((f) => f.message));
      return;
    }
    wiz.data = nameRes.data;

    const sub = await resolvePassoSubdominio(wiz.data, identifierService);
    if (sub.status === "invalid") {
      $("#errs")!.innerHTML = errorBanner(sub.fieldErrors.map((f) => f.message));
      return;
    }
    wiz.data = sub.data;
    wiz.subdomain = sub.value.subdomain;
    toast(`Endereço disponível: ${sub.value.subdomain}`);
    wiz.step = 2;
    renderWizard();
  });
}

/* -------------------------------- Passo 2 -------------------------------- */
function renderStep2(): void {
  const selected = String(wiz.data[WIZARD_FIELDS.templateId] ?? "");
  const options = buildTemplateOptions(TEMPLATES, selected);
  const initial = Math.max(0, options.findIndex((t) => t.selected));

  const panels = options.map((t, idx) => `
    <div data-acc data-index="${idx}" data-id="${esc(t.id)}" class="tpl-acc-item relative h-full rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-700 ease-in-out" style="flex:1 1 0%;min-width:54px;border-color:#e5e7eb;animation-delay:${idx * 110}ms">
      <div data-thumb="${esc(t.id)}" class="absolute inset-0 bg-white"></div>
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,.05) 55%)"></div>
      <button data-preview="${esc(t.id)}" data-prevbtn="${idx}" class="absolute top-3 right-3 hidden items-center gap-1 text-xs font-semibold text-gray-800 bg-white/95 backdrop-blur rounded-full px-3 py-1.5 shadow hover:bg-white transition-colors"><span class="material-symbols-outlined text-[16px]">visibility</span> Ver completo</button>
      <div class="absolute left-0 right-0 bottom-0 p-4 flex items-center gap-3 pointer-events-none">
        <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border-2 border-white/30 backdrop-blur" style="background:rgba(20,20,20,.75)"><span class="material-symbols-outlined text-white text-[22px]">storefront</span></div>
        <div data-info="${idx}" class="overflow-hidden whitespace-nowrap transition-all duration-500" style="opacity:0;transform:translateX(20px)">
          <div class="text-white font-bold text-lg leading-tight">${esc(t.name)}</div>
          <div class="text-white/75 text-sm">Modelo pronto a usar</div>
        </div>
      </div>
    </div>`).join("");

  render(shell(`
    ${header("dashboard_customize", "Escolher modelo", "Toque num modelo para o expandir. Use \"Ver completo\" para o navegar como uma loja pronta.")}
    <div id="errs"></div>
    <div id="tpl-acc" class="flex w-full h-[320px] sm:h-[440px] gap-2 mb-7 items-stretch">${panels}</div>
    <div class="flex justify-between">
      ${btnBack("back")}
      ${btnPrimary("next", "Próximo")}
    </div>`, true));

  document.querySelectorAll<HTMLElement>("[data-thumb]").forEach((c) => mountTemplateThumb(c, c.dataset.thumb!, "cover"));

  const panelEls = Array.from(document.querySelectorAll<HTMLElement>("[data-acc]"));
  function setActive(active: number): void {
    panelEls.forEach((el, idx) => {
      const on = idx === active;
      el.style.flex = on ? "7 1 0%" : "1 1 0%";
      el.style.borderColor = on ? ACCENT : "#e5e7eb";
      el.style.boxShadow = on ? "0 20px 50px -20px rgba(0,0,0,.45)" : "none";
      el.style.zIndex = on ? "10" : "1";
      const info = el.querySelector<HTMLElement>(`[data-info="${idx}"]`);
      if (info) { info.style.opacity = on ? "1" : "0"; info.style.transform = on ? "translateX(0)" : "translateX(20px)"; }
      const prev = el.querySelector<HTMLElement>(`[data-prevbtn="${idx}"]`);
      if (prev) { prev.style.display = on ? "inline-flex" : "none"; prev.style.pointerEvents = on ? "auto" : "none"; }
    });
    wiz.data = { ...wiz.data, [WIZARD_FIELDS.templateId]: panelEls[active]?.dataset.id };
  }

  panelEls.forEach((el, idx) =>
    el.addEventListener("click", () => setActive(idx)),
  );
  document.querySelectorAll<HTMLElement>("[data-preview]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openTemplatePreview(el.dataset.preview!);
    }),
  );
  setActive(initial);

  $("#back")?.addEventListener("click", () => { wiz.step = 1; renderWizard(); });
  $("#next")?.addEventListener("click", async () => {
    const res = validatePassoModelo(wiz.data, TEMPLATES);
    if (res.status === "invalid") {
      $("#errs")!.innerHTML = errorBanner(res.fieldErrors.map((f) => f.message));
      return;
    }
    wiz.data = res.data;
    // Se já existe sessão, salta o passo da conta (uma conta pode ter várias lojas).
    const sess = await currentSession();
    if (sess) {
      wiz.session = sess;
      wiz.preAuth = true;
      wiz.data = { ...wiz.data, [WIZARD_FIELDS.ownerId]: sess.ownerId };
      appState.session = sess;
      appState.ownerId = sess.ownerId;
      wiz.step = 4;
    } else {
      wiz.preAuth = false;
      wiz.step = 3;
    }
    renderWizard();
  });
}

/* -------------------------------- Passo 3 -------------------------------- */
function renderStep3(): void {
  const email = esc(wiz.data[WIZARD_FIELDS.email] ?? "");
  const ownerName = esc(wiz.data[WIZARD_FIELDS.ownerName] ?? "");
  render(shell(`
    ${header("person", "Crie a sua conta", "Necessária para concluir a criação da loja.")}
    <div id="errs"></div>
    <form id="f3" class="space-y-5">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700" for="oname">O seu nome</label>
        <input id="oname" value="${ownerName}" class="mb-input" placeholder="Ex: João Silva" />
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700" for="email">Email</label>
        <input id="email" type="email" value="${email}" class="mb-input" placeholder="voce@exemplo.com" />
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700" for="pass">Palavra-passe</label>
        <input id="pass" type="password" class="mb-input" placeholder="mínimo 6 caracteres" />
      </div>
      <div class="pt-2 flex justify-between">
        ${btnBack("back")}
        ${btnPrimary("f3-next", "Criar conta", "arrow_forward", "submit")}
      </div>
    </form>`));

  $("#back")?.addEventListener("click", () => { wiz.step = 2; renderWizard(); });
  $("#f3")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ownerName = ($("#oname") as HTMLInputElement).value;
    const email = ($("#email") as HTMLInputElement).value;
    const password = ($("#pass") as HTMLInputElement).value;
    wiz.data = { ...wiz.data, [WIZARD_FIELDS.ownerName]: ownerName, [WIZARD_FIELDS.email]: email };

    const res = await authService.register({ email, password, name: ownerName });
    if (!res.ok) {
      $("#errs")!.innerHTML = errorBanner([res.error.reason]);
      return;
    }
    wiz.session = res.value;
    appState.session = res.value;
    appState.ownerId = res.value.ownerId;
    wiz.data = { ...wiz.data, [WIZARD_FIELDS.ownerId]: res.value.ownerId };
    // Persiste o plano escolhido na nova conta.
    await setOwnerPlan(wiz.plan);
    wiz.step = 4;
    renderWizard();
  });
}

/* -------------------------------- Passo 4 -------------------------------- */
function renderStep4(): void {
  const name = esc(wiz.data[WIZARD_FIELDS.name] ?? "");
  const tpl = TEMPLATES.find((t) => t.id === wiz.data[WIZARD_FIELDS.templateId]);
  render(shell(`
    <div class="text-center mb-7">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style="background:rgba(249,89,1,.1);color:${ACCENT}"><span class="material-symbols-outlined text-3xl" style="font-variation-settings:'FILL' 1;">rocket_launch</span></div>
      <h1 class="text-2xl md:text-3xl font-black tracking-tight">Tudo pronto!</h1>
      <p class="text-gray-500 mt-2">Reveja e publique a sua loja.</p>
    </div>
    <div id="errs"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-7">
      <div class="bg-gray-50 rounded-2xl border border-gray-100 p-5 flex flex-col gap-3">
        <h2 class="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-200 pb-2"><span class="material-symbols-outlined" style="color:${ACCENT}">summarize</span> Resumo</h2>
        <div class="flex justify-between text-sm"><span class="text-gray-500">Nome:</span><span class="font-semibold text-gray-900">${name}</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-500">Modelo:</span><span class="font-semibold text-gray-900">${esc(tpl?.name ?? "—")}</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-500">Tipo:</span><span class="font-semibold text-gray-900">${esc(wiz.data[WIZARD_FIELDS.storeType] ?? "—")}</span></div>
      </div>
      <div class="rounded-2xl border border-gray-100 p-5 flex flex-col items-center justify-center gap-3" style="background:rgba(249,89,1,.06)">
        <span class="text-xs uppercase tracking-wider font-bold" style="color:${ACCENT}">O seu endereço web</span>
        <div class="bg-white border rounded-xl py-3 px-4 flex items-center gap-2 w-full" style="border-color:rgba(249,89,1,.3)">
          <span class="material-symbols-outlined text-gray-400 text-sm">lock</span>
          <span class="truncate font-semibold" style="color:${ACCENT}">${esc(wiz.subdomain)}</span>
        </div>
      </div>
    </div>
    <div class="flex justify-between">
      ${btnBack("back")}
      <button id="publish" class="inline-flex items-center gap-2 text-white font-bold px-8 py-3.5 rounded-xl shadow-lg active:scale-95 transition-transform hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">check_circle</span> Publicar loja</button>
    </div>`));

  $("#back")?.addEventListener("click", () => { wiz.step = wiz.preAuth ? 2 : 3; renderWizard(); });
  $("#publish")?.addEventListener("click", async () => {
    if (!wiz.session) { $("#errs")!.innerHTML = errorBanner(["Sessão em falta. Volte ao passo da conta."]); return; }
    // Limite de lojas publicadas conforme o plano da conta.
    const plan = getPlan(await getOwnerPlan(wiz.session.ownerId));
    const published = await countPublishedStores(wiz.session.ownerId);
    if (!canPublishAnotherStore(plan, published)) {
      $("#errs")!.innerHTML = errorBanner([
        `O plano ${plan.name} permite ${formatLimit(plan.limits.maxPublishedStores)} loja(s) publicada(s). Faça upgrade do plano no painel para publicar outra loja.`,
      ]);
      return;
    }
    const result = await wizardFlow.completeCreation(wiz.data, wiz.session);
    if (result.status !== "created") {
      $("#errs")!.innerHTML = errorBanner([result.message]);
      return;
    }
    // Publica a loja (passa de Rascunho a Publicada).
    await publishStore(result.store.ownerId, result.store.id);
    appState.storeId = result.store.id;
    appState.storeIdentifier = result.store.identifier;
    appState.templateId = result.store.templateId;
    toast("Loja criada e publicada!");
    // Reinicia o estado do assistente para uma próxima criação.
    wiz.step = 1; wiz.data = {}; wiz.subdomain = ""; wiz.session = null; wiz.preAuth = false; wiz.plan = DEFAULT_PLAN;
    go("#/painel");
  });
}
