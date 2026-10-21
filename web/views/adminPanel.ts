/**
 * Dashboard de Administração da plataforma (/adminPainel). Só para contas com
 * `is_admin`.
 *
 * Seis secções, uma por pergunta que o Administrador faz:
 *
 *  - «Visão geral» — como está a plataforma, e o que está à espera de mim?
 *  - «Aprovações» — que empresas pediram para receber pagamentos digitais?
 *  - «Contas» — quem tem subscrição; ativar e desativar à mão;
 *  - «Lojas» — que lojas estão no ar, fora do ar ou em rascunho;
 *  - «Modelos» — as lojas-modelo da galeria de modelos prontos;
 *  - «Pagamentos» — subscrições, encomendas das lojas e levantamentos.
 *
 * Endereços: `#/adminPainel/<secção>[/<sub>]` (o router passa-os a caminhos
 * limpos, `/adminPainel/...`). Os antigos `#/adminPainel/transacoes` e
 * `#/adminPainel/levantamentos` levam a «Pagamentos».
 *
 * Cada secção vive em `web/views/admin/<secção>.ts`, menos «Modelos», que fica
 * aqui (a deteção de modelos em falta é verificada neste ficheiro por
 * `tests/seedRename.test.ts`). Este ficheiro tem a guarda de acesso, a moldura
 * (navegação, cabeçalho, assistente) e o encaminhamento.
 *
 * **Acesso.** Nada de sensível é desenhado antes de `isCurrentUserAdmin()`
 * confirmar a conta. Os dados vêm das políticas RLS de admin (migração 0011);
 * não há chave de serviço no navegador.
 */
import { render, $, go, esc, toast, withBusy } from "../lib/dom.js";
import { appState, logout, currentOwnerId, STORE_APEX } from "../composition.js";
import {
  isCurrentUserAdmin, adminPendingCounts, adminStoresUsingTemplate,
  type AdminTemplateUsage, type AdminTemplateUser, type TemplateMatch,
} from "../supabase/admin.js";
import { listTemplateModels, createTemplateModel, deleteTemplateModel, seedDefaultModels, defaultFactoryModels, factoryModelNameKeys, type TemplateModel } from "../supabase/models.js";
import { ADMIN_HREFS } from "../../src/services/adminMetrics.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import { renderOverview } from "./admin/overview.js";
import { renderApprovals } from "./admin/approvals.js";
import { renderAccounts } from "./admin/accounts.js";
import { renderStores } from "./admin/stores.js";
import { renderPayments } from "./admin/payments.js";
import { openDialog } from "./admin/dialog.js";
import {
  btnClass, emptyState, icon, loadingBlock, noteBox, pill, plural, storeLink,
  type AdminView, type NavCounts,
} from "./admin/ui.js";

/* ================================ Secções ================================ */

type SectionId = "visao" | "aprovacoes" | "contas" | "lojas" | "modelos" | "pagamentos";

interface Section {
  readonly id: SectionId;
  readonly href: string;
  readonly icon: string;
  readonly label: string;
  /** Uma frase debaixo do título: para que serve a secção. */
  readonly subtitle: string;
  /** Contador da navegação que esta secção resolve. */
  readonly count?: keyof NavCounts;
}

const OVERVIEW: Section = {
  id: "visao", href: ADMIN_HREFS.visao, icon: "space_dashboard", label: "Visão geral",
  subtitle: "O essencial da plataforma, num relance.",
};

/**
 * As secções, por ordem, numa lista só: alimenta a barra lateral, os atalhos
 * do telemóvel e o título do cabeçalho.
 */
const SECTIONS: readonly Section[] = [
  OVERVIEW,
  {
    id: "aprovacoes", href: ADMIN_HREFS.aprovacoes, icon: "verified_user", label: "Aprovações",
    subtitle: "Empresas que pediram para receber por Multicaixa Express e Referência Bancária.", count: "approvals",
  },
  {
    id: "contas", href: ADMIN_HREFS.contas, icon: "group", label: "Contas",
    subtitle: "Donos de loja e as suas subscrições.",
  },
  {
    id: "lojas", href: ADMIN_HREFS.lojas, icon: "storefront", label: "Lojas",
    subtitle: "Todas as lojas da plataforma, com as lojas-modelo marcadas.",
  },
  {
    id: "modelos", href: ADMIN_HREFS.modelos, icon: "dashboard_customize", label: "Modelos",
    subtitle: "Lojas de demonstração da galeria de modelos prontos.",
  },
  {
    id: "pagamentos", href: ADMIN_HREFS.pagamentos, icon: "payments", label: "Pagamentos",
    subtitle: "Subscrições, encomendas das lojas e levantamentos.", count: "withdrawals",
  },
];

/** Endereços dos separadores antigos → secção nova. */
const LEGACY_ROUTES: Readonly<Record<string, { section: SectionId; sub: string }>> = {
  overview: { section: "visao", sub: "" },
  transacoes: { section: "pagamentos", sub: "subscricoes" },
  levantamentos: { section: "pagamentos", sub: "levantamentos" },
};

/** Secção e sub-separador do endereço atual (`/adminPainel/<secção>/<sub>`). */
function routeOf(): { section: SectionId; sub: string } {
  const m = location.pathname.match(/^\/adminPainel(?:\/([a-z-]*))?(?:\/([a-z-]*))?/i);
  const first = (m?.[1] ?? "").toLowerCase();
  const sub = (m?.[2] ?? "").toLowerCase();
  const legacy = LEGACY_ROUTES[first];
  if (legacy) return legacy;
  const known = SECTIONS.find((s) => s.id === first && s.id !== "visao");
  return known ? { section: known.id, sub } : { section: "visao", sub: "" };
}

/** Endereço `#/adminPainel/...` de uma secção (para voltar do editor). */
function routeHref(section: Section, sub: string): string {
  return sub && section.id !== "visao" ? `${section.href}/${sub}` : section.href;
}

/* ============================= Estado do painel ============================= */

/** Cada pintura tem um número: uma leitura lenta não pinta por cima de um ecrã mais novo. */
let renderSeq = 0;
/** Contadores da navegação (o que está à espera de uma decisão). */
let navCounts: NavCounts | null = null;
/** Desmonta o assistente da pintura anterior (larga os ouvintes globais dele). */
let unmountAssistant: (() => void) | null = null;

function mountAssistant(): void {
  unmountAssistant?.();
  unmountAssistant = mountAiAgent(document.getElementById("app"), { screen: "admin" });
}

/* ================================= Moldura ================================= */

function navCountInner(key: keyof NavCounts): string {
  const n = navCounts?.[key] ?? 0;
  if (n <= 0) return "";
  return `<span aria-hidden="true">${n}</span><span class="sr-only">(${n} ${key === "approvals" ? "por aprovar" : "por tratar"})</span>`;
}

function navCountBadge(key: keyof NavCounts, compact: boolean): string {
  const hidden = (navCounts?.[key] ?? 0) > 0 ? "" : "hidden";
  return `<span data-nav-count="${key}" class="${hidden} ${compact ? "ml-0.5" : "ml-auto"} rounded-full bg-orange-700 px-1.5 py-0.5 text-xs font-bold leading-none text-white">${navCountInner(key)}</span>`;
}

/** Atualiza os contadores já desenhados (barra lateral e atalhos do telemóvel). */
function paintNavCounts(): void {
  document.querySelectorAll<HTMLElement>("[data-nav-count]").forEach((el) => {
    const key = el.dataset.navCount as keyof NavCounts;
    el.innerHTML = navCountInner(key);
    el.classList.toggle("hidden", (navCounts?.[key] ?? 0) <= 0);
  });
}

function navItem(s: Section, active: boolean): string {
  return `<a href="${esc(s.href)}" ${active ? 'aria-current="page"' : ""} class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] ${active ? "bg-orange-50 text-orange-800" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"}">
    ${icon(s.icon, active ? "text-[20px] text-[#F95901]" : "text-[20px] text-gray-500")}
    <span class="min-w-0 flex-1 truncate">${esc(s.label)}</span>
    ${s.count ? navCountBadge(s.count, false) : ""}
  </a>`;
}

function navChip(s: Section, active: boolean): string {
  return `<a href="${esc(s.href)}" ${active ? 'aria-current="page"' : ""} class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901] ${active ? "bg-orange-50 text-orange-800" : "text-gray-700 hover:bg-gray-100"}">${icon(s.icon)}${esc(s.label)}${s.count ? navCountBadge(s.count, true) : ""}</a>`;
}

const SIDE_LINK = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]";
const HEADER_ICON = "flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95901]";

function shell(section: Section, content: string): string {
  return `
  <div class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
    <a href="#admin-main" data-skip class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[130] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:shadow">Saltar para o conteúdo</a>
    <aside class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-white py-5 md:flex">
      <div class="px-5"><img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" /></div>
      <p class="mt-1 px-5 text-xs font-bold uppercase tracking-wider text-orange-700">Administração</p>
      <nav aria-label="Secções da administração" class="mt-6 flex flex-col gap-0.5 px-3">
        ${SECTIONS.map((s) => navItem(s, s.id === section.id)).join("")}
      </nav>
      <div class="mt-auto flex flex-col gap-0.5 px-3">
        <a href="#/painel" class="${SIDE_LINK}">${icon("dashboard", "text-[20px] text-gray-500")} O meu painel</a>
        <button type="button" data-logout class="${SIDE_LINK}">${icon("logout", "text-[20px] text-gray-500")} Terminar sessão</button>
      </div>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="sticky top-0 z-40">
        <header class="flex items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8">
          <div class="min-w-0">
            <h1 class="truncate text-lg font-black tracking-tight md:text-xl">${esc(section.label)}</h1>
            <p class="hidden truncate text-sm text-gray-600 sm:block">${esc(section.subtitle)}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button type="button" id="admin-refresh" aria-label="Atualizar" title="Atualizar" class="${HEADER_ICON}">${icon("refresh", "text-[22px]")}</button>
            <a href="#/painel" aria-label="O meu painel" title="O meu painel" class="${HEADER_ICON} md:hidden">${icon("dashboard", "text-[22px]")}</a>
            <button type="button" data-logout aria-label="Terminar sessão" title="Terminar sessão" class="${HEADER_ICON} md:hidden">${icon("logout", "text-[22px]")}</button>
          </div>
        </header>
        <nav aria-label="Secções da administração" class="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 md:hidden">
          ${SECTIONS.map((s) => navChip(s, s.id === section.id)).join("")}
        </nav>
      </div>
      <main id="admin-main" tabindex="-1" class="min-w-0 flex-1 p-4 focus:outline-none md:p-8">
        <div class="mx-auto w-full max-w-5xl">${content}</div>
      </main>
    </div>
  </div>`;
}

function bindShell(): void {
  document.querySelectorAll<HTMLElement>("[data-logout]").forEach((b) =>
    b.addEventListener("click", async () => { await logout(); go("#/"); }));
  document.getElementById("admin-refresh")?.addEventListener("click", () => { void renderAdminPanel(); });
  // O salto vai pelo foco e não pelo `#`: um fragmento novo no endereço dispara
  // o router, que voltava a desenhar o painel inteiro.
  document.querySelector<HTMLAnchorElement>("[data-skip]")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("admin-main")?.focus();
  });
}

/** O que o painel dá a uma secção (ver `AdminView` em `web/views/admin/ui.ts`). */
function makeView(seq: number, section: Section, sub: string): AdminView {
  const current = (): boolean => seq === renderSeq;
  return {
    sub,
    loading() {
      if (!current()) return;
      render(shell(section, loadingBlock()));
      bindShell();
    },
    paint(html: string): boolean {
      if (!current()) return false;
      // O assistente é montado depois da secção: `render()` substitui o `#app`
      // inteiro, e com ele o mascote da pintura anterior.
      render(shell(section, html));
      bindShell();
      mountAssistant();
      return true;
    },
    isCurrent: current,
    openStoreEditor(storeId: string, ownerId: string) {
      appState.storeId = storeId;
      appState.editOwnerId = ownerId;
      // Ao sair do editor, o Administrador volta a este ecrã, não ao painel do dono.
      appState.editorReturn = routeHref(section, sub);
      go("#/personalizar");
    },
    navCounts: () => navCounts,
    setNavCounts(counts: Partial<NavCounts>) {
      navCounts = {
        approvals: counts.approvals ?? navCounts?.approvals ?? 0,
        withdrawals: counts.withdrawals ?? navCounts?.withdrawals ?? 0,
      };
      paintNavCounts();
    },
    reload() { void renderAdminPanel(); },
  };
}

/** Lê os contadores da navegação sem atrasar a secção. */
async function refreshNavCounts(seq: number): Promise<void> {
  try {
    const c = await adminPendingCounts();
    if (seq !== renderSeq) return;
    navCounts = { approvals: c.verifications, withdrawals: c.withdrawals };
    paintNavCounts();
  } catch (err) {
    console.error("refreshNavCounts", err);
  }
}

/**
 * Painel de falha de uma secção, **com a causa**.
 *
 * A causa é o que faltava. Quando uma leitura falha, a secção não pode dizer
 * «não há nada» nem «verifique a ligação»: a frase de `readFailureMessage`
 * nomeia o que falta à base de dados, e é com ela que o Administrador sabe que
 * tem uma migração por aplicar em vez de uma plataforma vazia.
 */
function errorState(cause: string): string {
  const texto = cause.trim() || "Verifique a ligação à internet e tente de novo.";
  return `<div class="rounded-2xl border border-gray-200 bg-white pb-8">
    ${emptyState("cloud_off", "Não foi possível carregar esta secção.", texto)}
    <div class="flex justify-center"><button type="button" id="admin-retry" class="${btnClass("primary")}">${icon("refresh")} Tentar de novo</button></div>
  </div>`;
}

/* ================================== Render ================================== */

export async function renderAdminPanel(): Promise<void> {
  appState.editOwnerId = null;
  const seq = ++renderSeq;

  // Ao entrar, enquanto a conta é verificada: só um indicador, sem a moldura —
  // nada da administração é desenhado antes de `is_admin` estar confirmado.
  if (!document.getElementById("admin-main")) {
    render(`<div class="flex min-h-screen items-center justify-center bg-gray-50">${loadingBlock()}</div>`);
  }

  const admin = await isCurrentUserAdmin();
  if (seq !== renderSeq) return;
  if (!admin) {
    unmountAssistant?.();
    unmountAssistant = null;
    render(`<div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      ${icon("shield_lock", "text-[56px] text-gray-500")}
      <h1 class="text-2xl font-black text-gray-900">Acesso restrito</h1>
      <p class="text-gray-600">Esta área é exclusiva para administradores da plataforma.</p>
      <a href="#/painel" class="${btnClass("primary")}">Ir para o meu painel</a>
    </div>`);
    return;
  }

  const route = routeOf();
  const section = SECTIONS.find((s) => s.id === route.section) ?? OVERVIEW;
  const view = makeView(seq, section, route.sub);
  void refreshNavCounts(seq);

  try {
    if (section.id === "aprovacoes") await renderApprovals(view);
    else if (section.id === "contas") await renderAccounts(view);
    else if (section.id === "lojas") await renderStores(view);
    else if (section.id === "modelos") await renderModelos(view);
    else if (section.id === "pagamentos") await renderPayments(view);
    else await renderOverview(view);
  } catch (err) {
    console.error("renderAdminPanel", err);
    if (view.paint(errorState(err instanceof Error ? err.message : ""))) {
      document.getElementById("admin-retry")?.addEventListener("click", () => { void renderAdminPanel(); });
    }
  }
}

/* ================================= Modelos ================================= */

/* ---------------- Verificação de uso de Modelo_De_Loja (R1.7) ------------- */

/**
 * Modelo_De_Loja que a decisão D7 retira da Plataforma. Quando se aciona a
 * eliminação de uma das suas Loja_Modelo, a verificação corre sobre o par
 * inteiro: é a fotografia que o Administrador tem de ler antes de confirmar.
 */
const TEMPLATES_A_REMOVER: readonly string[] = ["neonlab", "foodmart"];

/**
 * Nome apresentado das duas Loja_Modelo em causa. Fica declarado aqui, e não
 * derivado de `defaultFactoryModels()`, porque essas entradas saíram do
 * Semeador e a verificação tem de continuar a reconhecer as demos que ainda
 * estejam em base de dados.
 */
const NOMES_A_REMOVER: readonly string[] = ["neon lab", "foodmart"];

function normTemplateId(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * A verificação bloqueante do R1.7 aplica-se a esta Loja_Modelo?
 *
 * Só à eliminação de uma Loja_Modelo «Neon Lab» ou «FoodMart». O `template_id`
 * de uma Loja_Modelo é o **modelo visual** que ela demonstra (`galeria`,
 * `lumiere`, …), partilhado com as Lojas de cliente: contar quem usa `galeria`
 * bloquearia para sempre a eliminação de qualquer demo, sem fundamento —
 * `applyModelToStore` **copia** a Personalização para a Loja do cliente, por isso
 * apagar uma Loja_Modelo não afeta nenhuma Loja de cliente. O risco real é
 * retirar um modelo de `TEMPLATE_REGISTRY`, e é só para esses que a verificação
 * corre.
 */
function requiresUsageCheck(m: TemplateModel): boolean {
  return TEMPLATES_A_REMOVER.includes(normTemplateId(m.templateId))
    || NOMES_A_REMOVER.includes(normTemplateId(m.name));
}

/** Confirmação simples: nome, irreversibilidade e cascata (R1.9). */
function deleteConfirmText(name: string): string {
  return `Eliminar definitivamente a loja-modelo «${name}»? Apaga também os produtos, banners e imagens de demonstração. Esta ação é irreversível.`;
}

function matchLabel(m: TemplateMatch): string {
  return m === "templateId" ? "modelo aplicado" : "cópia do modelo";
}

/** Contagens da verificação, sempre visíveis antes de qualquer eliminação. */
function usageCountsHtml(usage: AdminTemplateUsage): string {
  const affected = usage.customerStores.length;
  return `<div class="mb-3 flex flex-wrap gap-2">
    ${pill(`${affected} loja(s) de cliente`, affected ? "red" : "green")}
    ${pill(`${usage.models.length} loja(s)-modelo`, "orange")}
    ${pill(`verificado: ${usage.ids.join(", ") || "—"}`, "gray")}
  </div>`;
}

/** Uma Loja no resultado da verificação: nome, endereço, dono e estado. */
function usageStoreItem(s: AdminTemplateUser): string {
  const how = s.matchedBy.map(matchLabel).join(" e ") || "—";
  return `<li class="flex min-w-0 flex-col gap-1 px-4 py-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <p class="min-w-0 font-bold text-gray-900 break-words">${esc(s.name || "—")}</p>
      ${s.state === "Publicada" ? pill("Publicada", "green") : pill("Rascunho", "gray")}
    </div>
    <p class="text-xs text-gray-600 break-all">${esc(s.identifier)}.${esc(STORE_APEX)}</p>
    <p class="text-xs text-gray-600 break-all">${esc(s.ownerEmail || "dono sem email registado")}</p>
    <p class="text-xs text-gray-600 break-words">Modelo: ${esc(s.templateId || "—")}${s.basedOn ? ` · baseada em: ${esc(s.basedOn)}` : ""} · encontrada por: ${esc(how)}</p>
  </li>`;
}

function usageStoreList(items: AdminTemplateUser[], empty: string): string {
  if (!items.length) return `<p class="text-sm text-gray-600">${esc(empty)}</p>`;
  return `<ul role="list" class="min-w-0 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">${items.map(usageStoreItem).join("")}</ul>`;
}

const CHECK_TONES = {
  neutral: { box: "border-gray-200 bg-white", icon: "text-[#F95901]" },
  danger: { box: "border-red-200 bg-red-50", icon: "text-red-700" },
  warning: { box: "border-orange-200 bg-orange-50", icon: "text-orange-700" },
} as const;

/**
 * Bloco de verificação apresentado na própria vista (e não num diálogo): a
 * lista de Lojas afetadas com nome, endereço, email do dono e estado é
 * precisamente o que o Administrador tem de ler antes de decidir.
 */
function checkPanel(tone: keyof typeof CHECK_TONES, iconName: string, title: string, body: string, actions: string): string {
  const t = CHECK_TONES[tone];
  return `<div class="min-w-0 rounded-2xl border p-4 md:p-5 ${t.box}">
    <div class="flex min-w-0 items-start gap-3">
      ${icon(iconName, `text-[24px] shrink-0 ${t.icon}`)}
      <div class="min-w-0 flex-1">
        <h3 class="font-bold text-gray-900 break-words">${esc(title)}</h3>
        <div class="mt-2 min-w-0 text-sm text-gray-800">${body}</div>
        ${actions ? `<div class="mt-4 flex flex-wrap gap-2">${actions}</div>` : ""}
      </div>
    </div>
  </div>`;
}

/** Os quatro estados possíveis da eliminação de uma Loja_Modelo. */
type ModelCheckView =
  | { kind: "loading"; model: TemplateModel; ids: string[] }
  | { kind: "error"; model: TemplateModel; message: string }
  | { kind: "blocked"; model: TemplateModel; usage: AdminTemplateUsage }
  | { kind: "clear"; model: TemplateModel; usage: AdminTemplateUsage };

function modelCheckHtml(v: ModelCheckView): string {
  const name = v.model.name || "sem nome";
  const retry = `<button type="button" id="chk-retry" class="${btnClass("secondary", "sm")}">${icon("refresh")} Verificar de novo</button>`;
  const closeBtn = `<button type="button" id="chk-close" class="${btnClass("secondary", "sm")}">${icon("close")} Fechar</button>`;

  if (v.kind === "loading") {
    return checkPanel("neutral", "database", `A verificar quem usa «${name}»`,
      `<p>A contar em base de dados as Lojas com o modelo <strong>${esc(v.ids.join(", "))}</strong> e as Lojas baseadas nele. Nada é apagado antes de esta verificação terminar.</p>`,
      "");
  }

  if (v.kind === "error") {
    return checkPanel("danger", "error", "A verificação falhou — a eliminação não avança",
      `<p class="mb-2">Não foi possível contar as Lojas que usam «${esc(name)}», por isso a eliminação foi recusada e o modelo mantém-se registado.</p>
       <p class="mb-2 break-words rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">${esc(v.message)}</p>
       <p class="text-xs text-gray-700">Uma falha de leitura não é prova de que não existem Lojas afetadas. Corrija a falha e verifique de novo antes de apagar.</p>`,
      `${retry}${closeBtn}`);
  }

  if (v.kind === "blocked") {
    return checkPanel("danger", "block", "Eliminação bloqueada — há lojas de cliente a usar este modelo",
      `${usageCountsHtml(v.usage)}
       <p class="mb-3">O modelo <strong>${esc(name)}</strong> <strong>mantém-se registado</strong> e nada foi apagado. Apagá-lo deixaria estas lojas de cliente com o modelo errado.</p>
       <p class="mb-2 font-bold text-gray-900">Lojas de cliente afetadas</p>
       ${usageStoreList(v.usage.customerStores, "Nenhuma.")}
       <p class="mb-2 mt-4 font-bold text-gray-900">Lojas-modelo encontradas na mesma verificação</p>
       ${usageStoreList(v.usage.models, "Nenhuma.")}`,
      `${retry}${closeBtn}`);
  }

  const others = v.usage.models.filter((m) => m.id !== v.model.storeId);
  return checkPanel("warning", "warning", `Confirmar a eliminação de «${name}»`,
    `${usageCountsHtml(v.usage)}
     <p class="mb-2">A verificação não encontrou <strong>nenhuma loja de cliente</strong> a usar este modelo, por isso a eliminação pode avançar.</p>
     <p class="mb-3"><strong>A eliminação é irreversível.</strong> Apaga a loja-modelo «${esc(name)}» e, em cascata, os produtos, banners e imagens de demonstração.</p>
     ${others.length
       ? `<p class="mb-2 font-bold text-gray-900">Esta ação apaga apenas «${esc(name)}». Mantêm-se registadas:</p>${usageStoreList(others, "Nenhuma.")}`
       : ""}`,
    `<button type="button" id="chk-confirm" class="${btnClass("danger", "sm")}">${icon("delete_forever")} Eliminar definitivamente</button>
     <button type="button" id="chk-cancel" class="${btnClass("secondary", "sm")}">${icon("close")} Cancelar</button>`);
}

function modelCard(m: TemplateModel): string {
  const name = m.name || "Modelo sem nome";
  return `<li class="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
    <div class="flex-1 p-5">
      <span class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">${icon("dashboard_customize", "text-[22px] text-[#F95901]")}</span>
      <h3 class="font-bold text-gray-900 break-words">${esc(name)}</h3>
      <p class="mt-1 text-sm text-gray-600">${esc(m.description || "Sem descrição.")}</p>
      <div class="mt-2">${storeLink(m.identifier)}</div>
    </div>
    <div class="flex items-center gap-2 border-t border-gray-100 p-4">
      <button type="button" data-edit-model="${esc(m.storeId)}" data-owner="${esc(m.ownerId)}" aria-label="Editar o modelo ${esc(name)}" class="${btnClass("primary", "sm")} flex-1">${icon("palette")} Editar</button>
      <button type="button" data-del-model="${esc(m.storeId)}" aria-label="Eliminar o modelo ${esc(name)}" title="Eliminar modelo" class="${btnClass("dangerOutline", "sm")}">${icon("delete")}</button>
    </div>
  </li>`;
}

async function renderModelos(view: AdminView): Promise<void> {
  view.loading();

  let models = await listTemplateModels();

  // Importa automaticamente os modelos de fábrica em falta (ex.: Lumière Chic),
  // já com os produtos fictícios, para o admin só precisar de editar.
  //
  // Um modelo de fábrica só está «em falta» quando não existe loja-modelo com
  // o nome atual nem com nenhum dos nomes anteriores. Sem a segunda condição,
  // renomear um modelo de fábrica fazia esta deteção chamar o Semeador sem
  // necessidade só por o administrador abrir o separador «Modelos».
  const haveNames = new Set(models.map((m) => m.name.trim().toLowerCase()));
  const missing = defaultFactoryModels().filter(
    (fm) => !factoryModelNameKeys(fm).some((key) => haveNames.has(key)),
  );
  if (missing.length) {
    const adminId = await currentOwnerId();
    if (adminId) {
      await seedDefaultModels(adminId);
      models = await listTemplateModels();
    }
  }
  if (!view.isCurrent()) return;

  const painted = view.paint(`
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-600">${esc(plural(models.length, "modelo", "modelos"))} · editáveis com o editor do site</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="seed-models" class="${btnClass("secondary")}">${icon("download")} Importar predefinidos</button>
        <button type="button" id="new-model" class="${btnClass("primary")}">${icon("add")} Criar modelo</button>
      </div>
    </div>
    ${noteBox("Cada modelo é uma loja de demonstração. Edite-a com o editor do site (fotos, imagens de produto, textos e cores) para melhorar o que os clientes veem na galeria de modelos prontos. «Importar predefinidos» traz os modelos de fábrica como lojas-modelo editáveis.")}
    <section id="model-check" aria-live="polite" class="my-6 min-w-0"></section>
    ${models.length
      ? `<ul role="list" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">${models.map(modelCard).join("")}</ul>`
      : `<div class="rounded-2xl border border-gray-200 bg-white pb-8">
           ${emptyState("dashboard_customize", "Ainda não há modelos.", "Importe os predefinidos ou crie um do zero.")}
           <div class="flex justify-center"><button type="button" id="seed-models-empty" class="${btnClass("primary")}">${icon("download")} Importar modelos predefinidos</button></div>
         </div>`}`);
  if (!painted) return;

  async function seedModels(): Promise<void> {
    const adminId = await currentOwnerId();
    if (!adminId) { toast("Sessão inválida. Volte a entrar.", "error"); return; }
    const n = await withBusy(() => seedDefaultModels(adminId), "A importar modelos…");
    if (n > 0) { toast(`${n} modelo(s) importado(s).`); void renderModelos(view); }
    else toast("Os modelos predefinidos já foram importados.");
  }
  $("#seed-models")?.addEventListener("click", () => { void seedModels(); });
  $("#seed-models-empty")?.addEventListener("click", () => { void seedModels(); });

  $("#new-model")?.addEventListener("click", async () => {
    const answer = await openDialog({
      title: "Criar modelo",
      body: "<p>O modelo nasce como uma loja de demonstração publicada, e abre-se no editor para o completar.</p>",
      confirmLabel: "Criar e abrir o editor",
      fields: [
        {
          id: "name",
          label: "Nome do modelo",
          placeholder: "Ex.: Vermelho Moderno",
          maxLength: 60,
          validate: (value) => (value.trim() ? null : "Escreva o nome do modelo."),
        },
        {
          id: "description",
          label: "Descrição curta (opcional)",
          hint: "Aparece na galeria de modelos prontos.",
          maxLength: 160,
        },
      ],
    });
    if (!answer) return;
    const name = (answer.values.name ?? "").trim();
    const description = (answer.values.description ?? "").trim();
    const adminId = await currentOwnerId();
    if (!adminId) { toast("Sessão inválida. Volte a entrar.", "error"); return; }
    const model = await withBusy(() => createTemplateModel(adminId, name, description), "A criar o modelo…");
    if (!model) { toast("Não foi possível criar o modelo.", "error"); return; }
    toast("Modelo criado. A abrir o editor…");
    view.openStoreEditor(model.storeId, model.ownerId);
  });

  document.querySelectorAll<HTMLElement>("[data-edit-model]").forEach((b) =>
    b.addEventListener("click", () => view.openStoreEditor(b.dataset.editModel ?? "", b.dataset.owner ?? "")));

  /* ---- Eliminação de uma Loja_Modelo: verificar primeiro, apagar depois ---- */

  function closeCheck(): void {
    const host = $("#model-check");
    if (host) host.innerHTML = "";
  }

  function paintCheck(v: ModelCheckView): void {
    const host = $("#model-check");
    if (!host) return;
    host.innerHTML = modelCheckHtml(v);
    host.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#chk-close")?.addEventListener("click", closeCheck);
    $("#chk-cancel")?.addEventListener("click", closeCheck);
    $("#chk-retry")?.addEventListener("click", () => { void startCheck(v.model); });
    if (v.kind === "clear") {
      $("#chk-confirm")?.addEventListener("click", () => { void doDelete(v.model, v.usage); });
    }
  }

  /**
   * Corre a verificação em base de dados (R1.7). Não apaga nada. Só é chamada
   * para as Loja_Modelo no âmbito do R1.7 — ver `requiresUsageCheck`.
   */
  async function startCheck(m: TemplateModel): Promise<void> {
    const ids = [...TEMPLATES_A_REMOVER];
    paintCheck({ kind: "loading", model: m, ids });
    try {
      const usage = await withBusy(() => adminStoresUsingTemplate(ids), "A verificar lojas afetadas…");
      // Grupo de lojas de cliente não vazio ⇒ a eliminação não avança (R1.8).
      paintCheck(usage.customerStores.length
        ? { kind: "blocked", model: m, usage }
        : { kind: "clear", model: m, usage });
    } catch (err) {
      // `adminStoresUsingTemplate` lança em erro de leitura de propósito: um
      // resultado vazio por falha seria indistinguível de «nenhuma Loja
      // afetada». Sem verificação lida, não se apaga.
      paintCheck({ kind: "error", model: m, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Confirmação da eliminação, com o nome, a irreversibilidade e a cascata (R1.9). */
  async function confirmDelete(m: TemplateModel): Promise<boolean> {
    const answer = await openDialog({
      title: "Eliminar a loja-modelo?",
      body: `<p>${esc(deleteConfirmText(m.name))}</p>`,
      confirmLabel: "Eliminar definitivamente",
      tone: "danger",
    });
    return answer !== null;
  }

  /** Apaga a Loja_Modelo em cascata: produtos, banners e assets (R1.9). */
  async function removeModel(m: TemplateModel): Promise<void> {
    const ok = await withBusy(() => deleteTemplateModel(m.storeId), "A eliminar…");
    if (ok) { toast("Modelo eliminado."); void renderModelos(view); }
    else toast("Não foi possível eliminar.", "error");
  }

  /**
   * Caminho de confirmação simples, para as Loja_Modelo fora do âmbito do
   * R1.7: o nome, a irreversibilidade e a cascata, e a eliminação.
   */
  async function deleteWithoutCheck(m: TemplateModel): Promise<void> {
    if (!(await confirmDelete(m))) return;
    await removeModel(m);
  }

  /** Eliminação em cascata (R1.9), só depois de uma verificação limpa. */
  async function doDelete(m: TemplateModel, usage: AdminTemplateUsage): Promise<void> {
    if (!(await confirmDelete(m))) return;

    // Reverificação imediatamente antes de apagar: o painel pode ter ficado
    // aberto tempo suficiente para uma Loja de cliente entrar no grupo.
    let fresh: AdminTemplateUsage;
    try {
      fresh = await withBusy(() => adminStoresUsingTemplate(usage.ids), "A confirmar a verificação…");
    } catch (err) {
      paintCheck({ kind: "error", model: m, message: err instanceof Error ? err.message : String(err) });
      toast("Eliminação cancelada: a verificação falhou.", "error");
      return;
    }
    if (fresh.customerStores.length) {
      paintCheck({ kind: "blocked", model: m, usage: fresh });
      toast("Eliminação cancelada: há lojas de cliente a usar este modelo.", "error");
      return;
    }

    await removeModel(m);
  }

  document.querySelectorAll<HTMLElement>("[data-del-model]").forEach((b) =>
    b.addEventListener("click", () => {
      const m = models.find((x) => x.storeId === b.dataset.delModel);
      if (!m) { toast("Modelo não encontrado. Atualize a página.", "error"); return; }
      // Âmbito do R1.7: só «Neon Lab» e «FoodMart» passam pela verificação.
      if (requiresUsageCheck(m)) { void startCheck(m); return; }
      closeCheck();
      void deleteWithoutCheck(m);
    }));
}
