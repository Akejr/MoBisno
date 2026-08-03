/**
 * Painel de Administração da plataforma (/adminPainel). Apenas para contas com
 * `is_admin`. O admin vê e gere contas, lojas, levantamentos e pode abrir o
 * editor de qualquer loja. O acesso aos dados é garantido pelas políticas RLS
 * de admin (migração 0011).
 */
import { render, $, go, esc, toast, withBusy, formatKz } from "../lib/dom.js";
import { appState, logout, publicStoreUrl, currentOwnerId, STORE_APEX } from "../composition.js";
import {
  isCurrentUserAdmin, adminOverview, listAccounts, listStores, listAllWithdrawals,
  adminSetStoreState, adminDeleteStore, adminSetAccountPlan, adminDeleteAccount, adminProcessWithdrawal,
  listServiceTransactions, adminDeleteServiceTransaction, adminStoresUsingTemplate,
  adminStoreProductCounts,
  type AdminStore, type AdminAccount, type AdminWithdrawal, type AdminServiceTx,
  type AdminTemplateUsage, type AdminTemplateUser, type TemplateMatch,
} from "../supabase/admin.js";
import { listTemplateModels, createTemplateModel, deleteTemplateModel, seedDefaultModels, defaultFactoryModels, factoryModelNameKeys, type TemplateModel } from "../supabase/models.js";
import { getPlan, isPlanId, PLAN_ORDER, type PlanId } from "../../src/services/plans.js";
import {
  businessHealth, monthlyEvolution, attentionLists, ADMIN_HREFS, ATTENTION_WINDOW_DAYS, MONTHS_IN_EVOLUTION,
  type AdminMetricsInput, type AttentionItem, type MonthPoint,
} from "../../src/services/adminMetrics.js";

const ACCENT = "#F95901";
const ACCENT_TINT = "rgba(249,89,1,.1)";

/* --------------------------------- Utils --------------------------------- */

function tabOf(): string {
  const m = location.pathname.match(/^\/adminPainel\/?([a-z]*)/i);
  return (m && m[1]) ? m[1].toLowerCase() : "overview";
}

function badge(text: string, bg: string, color: string): string {
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap" style="background:${bg};color:${color}">${esc(text)}</span>`;
}

function stateBadge(state: string): string {
  return state === "Publicada"
    ? badge("Publicada", "#ecfdf5", "#047857")
    : badge("Rascunho", "#f3f4f6", "#6b7280");
}

function planBadge(plan: string): string {
  return badge(getPlan(plan).name, ACCENT_TINT, ACCENT);
}

function activeBadge(active: boolean): string {
  return active ? badge("Ativa", "#ecfdf5", "#047857") : badge("Inativa", "#f3f4f6", "#9ca3af");
}

/** Chips das funcionalidades ativas de uma loja. `compact` mostra só as ativas. */
function featureChips(f: AdminStore["features"], compact = false): string {
  const defs: { on: boolean; icon: string; label: string }[] = [
    { on: f.online, icon: "credit_card", label: "Express + Ref." },
    { on: f.sms, icon: "sms", label: "SMS" },
    { on: f.whatsapp, icon: "chat", label: "WhatsApp" },
    { on: f.delivery, icon: "local_shipping", label: "Entregas" },
  ];
  const list = compact ? defs.filter((d) => d.on) : defs;
  if (compact && list.length === 0) return `<span class="text-xs text-gray-300">Sem funcionalidades ativas</span>`;
  return `<div class="flex flex-wrap gap-1.5">${list.map((d) => {
    const style = d.on ? `background:${ACCENT_TINT};color:${ACCENT}` : "background:#f3f4f6;color:#9ca3af";
    return `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style="${style}" title="${esc(d.label)}${d.on ? " (ativo)" : " (inativo)"}"><span class="material-symbols-outlined text-[14px]">${d.icon}</span>${esc(d.label)}</span>`;
  }).join("")}</div>`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(s: string): string {
  return (s || "?").trim().charAt(0).toUpperCase() || "?";
}

function metric(icon: string, label: string, value: string, accent = false): string {
  const ic = accent ? `background:${ACCENT};color:#fff` : `background:${ACCENT_TINT};color:${ACCENT}`;
  return `<div class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="${ic}"><span class="material-symbols-outlined">${icon}</span></div>
    <div><p class="text-sm text-gray-500 mb-0.5">${esc(label)}</p><p class="text-2xl font-black text-gray-900">${esc(value)}</p></div>
  </div>`;
}

const WD_STATUS = {
  requested: { label: "Pendente", bg: "#fff7ed", color: "#c2410c" },
  approved: { label: "Aprovado", bg: "#eff6ff", color: "#1d4ed8" },
  paid: { label: "Pago", bg: "#ecfdf5", color: "#047857" },
  rejected: { label: "Rejeitado", bg: "#fef2f2", color: "#b91c1c" },
} as const;

function wdStatusBadge(s: string): string {
  const cfg = (WD_STATUS as Record<string, { label: string; bg: string; color: string }>)[s];
  return cfg ? badge(cfg.label, cfg.bg, cfg.color) : badge(s, "#f3f4f6", "#6b7280");
}

/* -------------------- Blocos da Visão geral (R7.1–R7.13) ------------------ */

/**
 * Cor da série «contas novas» na evolução mensal. Deliberadamente diferente de
 * `ACCENT`: as duas séries do mesmo gráfico têm de se distinguir sem legenda.
 */
const SERIES_ACCOUNTS = "#1d4ed8";

/** Nº de linhas apresentadas em cada lista de «A precisar de atenção». */
const ATTENTION_ROWS = 5;

/** Nº de linhas apresentadas em cada lista do histórico recente (R7.7). */
const HISTORY_ROWS = 6;

/**
 * Cartão de métrica com uma nota curta debaixo do número.
 *
 * A nota não é enfeite: é a guarda da armadilha de rótulos da decisão **D5**. A
 * «receita da Plataforma» (transações de serviço: planos, SMS, logótipos) e o
 * «volume de vendas das Lojas» (`orders`, dinheiro dos Donos) são grandezas
 * diferentes, e um número sozinho não as distingue. Um Administrador que as
 * confunda toma decisões erradas.
 */
function healthCard(icon: string, label: string, value: string, hint: string, accent = false): string {
  const ic = accent ? `background:${ACCENT};color:#fff` : `background:${ACCENT_TINT};color:${ACCENT}`;
  return `<div class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3 min-w-0">
    <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="${ic}"><span class="material-symbols-outlined">${icon}</span></div>
    <div class="min-w-0">
      <p class="text-sm text-gray-500 mb-0.5 break-words">${esc(label)}</p>
      <p class="text-2xl font-black text-gray-900 break-words">${esc(value)}</p>
      <p class="text-xs text-gray-400 mt-1 break-words">${esc(hint)}</p>
    </div>
  </div>`;
}

/** Cabeçalho de uma das três secções da Visão geral (R7.1). */
function sectionHeader(icon: string, title: string, subtitle: string): string {
  return `<div class="flex items-start gap-3 mb-4 min-w-0">
    <span class="material-symbols-outlined shrink-0" style="color:${ACCENT}">${icon}</span>
    <div class="min-w-0">
      <h3 class="text-lg font-black text-gray-900 break-words">${esc(title)}</h3>
      <p class="text-sm text-gray-500 break-words">${esc(subtitle)}</p>
    </div>
  </div>`;
}

/** Cartão com cabeçalho, contagem opcional e ligação para o separador que resolve. */
function overviewCard(title: string, countBadge: string, action: { href: string; label: string } | null, body: string): string {
  return `<div class="bg-white border border-gray-200 rounded-2xl overflow-hidden min-w-0">
    <div class="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap min-w-0">
      <div class="flex items-center gap-2 flex-wrap min-w-0">
        <h4 class="font-black text-gray-900 break-words min-w-0">${esc(title)}</h4>
        ${countBadge}
      </div>
      ${action ? `<a href="${esc(action.href)}" class="text-sm font-semibold hover:underline shrink-0" style="color:${ACCENT}">${esc(action.label)}</a>` : ""}
    </div>
    ${body}
  </div>`;
}

/**
 * Uma linha de «A precisar de atenção». **É toda ela uma ligação** para o ecrã
 * onde a ação se resolve (R7.5), com o `href` que o próprio item traz de
 * `attentionLists`.
 */
function attentionRow(item: AttentionItem): string {
  const amount = typeof item.amount === "number" && item.amount > 0
    ? `<span class="text-sm font-bold text-gray-900 break-words text-right shrink-0">${esc(formatKz(item.amount))}</span>`
    : "";
  return `<a href="${esc(item.href)}" class="flex items-start gap-3 px-4 md:px-5 py-3 hover:bg-gray-50 transition-colors min-w-0">
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-gray-900 break-words">${esc(item.title)}</p>
      <p class="text-xs text-gray-400 break-words">${esc(item.detail)}</p>
    </div>
    ${amount}
    <span class="material-symbols-outlined text-gray-300 text-[18px] shrink-0">chevron_right</span>
  </a>`;
}

/**
 * Uma das cinco listas de «A precisar de atenção» (R7.4).
 *
 * Sem itens, apresenta a mensagem de estado vazio **desta** lista (R7.6): cada
 * chamador passa o seu texto, porque «Sem pedidos pendentes» não descreve uma
 * Loja sem Produtos nem uma conta com o teste a terminar.
 */
function attentionCard(
  title: string,
  items: readonly AttentionItem[],
  empty: string,
  href: string,
  actionLabel: string,
): string {
  const count = items.length;
  const countBadge = count ? badge(String(count), "#fff7ed", "#c2410c") : badge("0", "#ecfdf5", "#047857");
  const rest = count - ATTENTION_ROWS;
  const body = count
    ? `<div class="divide-y divide-gray-50 min-w-0">${items.slice(0, ATTENTION_ROWS).map(attentionRow).join("")}</div>
       ${rest > 0
         ? `<a href="${esc(href)}" class="block px-4 md:px-5 py-3 text-sm font-semibold border-t border-gray-100 hover:bg-gray-50 break-words" style="color:${ACCENT}">Ver os restantes ${rest}</a>`
         : ""}`
    : `<p class="px-5 py-8 text-center text-sm text-gray-400 break-words">${esc(empty)}</p>`;
  return overviewCard(title, countBadge, { href, label: actionLabel }, body);
}

/** «AAAA-MM» → «mar. 25». UTC, a mesma base de `monthlyEvolution`. */
function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString("pt-PT", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/**
 * Evolução mensal da receita e do número de contas (R7.3).
 *
 * Duas barras por mês, no padrão de barras com `width`/`height` em percentagem
 * já usado na distribuição por plano e em `renderAnalises` de
 * `web/views/dashboard.ts` — sem biblioteca de gráficos. As duas séries têm
 * escalas próprias, porque Kwanzas e contas não se comparam no mesmo eixo; a
 * leitura exata está na tabela debaixo do gráfico, que é também o que torna a
 * evolução legível a 360 px, onde uma barra de 20 px de largura não é.
 */
function evolutionChart(points: readonly MonthPoint[]): string {
  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue));
  const maxAccounts = Math.max(1, ...points.map((p) => p.accounts));
  const cols = points.map((p) => {
    const hr = p.revenue > 0 ? Math.max(4, Math.round((p.revenue / maxRevenue) * 100)) : 2;
    const ha = p.accounts > 0 ? Math.max(4, Math.round((p.accounts / maxAccounts) * 100)) : 2;
    return `<div class="flex-1 min-w-0 flex flex-col items-center gap-1">
      <div class="w-full flex items-end justify-center gap-0.5" style="height:110px">
        <div class="w-1/2 rounded-t-md" style="height:${hr}%;background:${ACCENT}" title="Receita da Plataforma em ${esc(monthLabel(p.month))}: ${esc(formatKz(p.revenue))}"></div>
        <div class="w-1/2 rounded-t-md" style="height:${ha}%;background:${SERIES_ACCOUNTS}" title="Contas novas em ${esc(monthLabel(p.month))}: ${p.accounts}"></div>
      </div>
      <span class="text-[10px] text-gray-400 w-full text-center truncate">${esc(monthLabel(p.month))}</span>
    </div>`;
  }).join("");
  const rows = points.map((p) => `<div class="flex items-center justify-between gap-2 py-1.5 text-xs border-b border-gray-50 last:border-0 min-w-0">
      <span class="text-gray-500 shrink-0">${esc(monthLabel(p.month))}</span>
      <span class="flex-1 min-w-0 text-right font-semibold text-gray-900 break-words">${esc(formatKz(p.revenue))}</span>
      <span class="shrink-0 text-gray-400">${p.accounts} conta(s)</span>
    </div>`).join("");
  const legend = `<div class="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
    <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm shrink-0" style="background:${ACCENT}"></span> Receita da Plataforma</span>
    <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm shrink-0" style="background:${SERIES_ACCOUNTS}"></span> Contas novas</span>
  </div>`;
  return `<div class="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 min-w-0">
    <h4 class="font-black text-gray-900 break-words">Evolução mensal — ${points.length} meses mais recentes</h4>
    <p class="text-xs text-gray-400 mt-0.5 mb-3 break-words">Receita da Plataforma (transações de serviço pagas) e contas criadas em cada mês.</p>
    ${legend}
    <div class="flex items-end gap-1 min-w-0">${cols}</div>
    <div class="mt-4 min-w-0">${rows}</div>
  </div>`;
}

/* ---------------- Verificação de uso de Modelo_De_Loja (R1.7) ------------- */

/**
 * Modelo_De_Loja que a decisão D7 retira da Plataforma. Quando se aciona a
 * eliminação de uma das suas Loja_Modelo, a verificação corre sobre o par
 * inteiro: é a fotografia que o Administrador tem de ler antes de confirmar
 * (tarefa 7.5).
 */
const TEMPLATES_A_REMOVER: readonly string[] = ["neonlab", "foodmart"];

/**
 * Nome apresentado das duas Loja_Modelo em causa, tal como o R1.6 e o R1.7 as
 * designam. Fica declarado aqui, e não derivado de `defaultFactoryModels()`,
 * porque a tarefa 7.6 remove essas entradas do Semeador e a verificação tem de
 * continuar a reconhecer as demos que ainda estejam em base de dados.
 */
const NOMES_A_REMOVER: readonly string[] = ["neon lab", "foodmart"];

function normTemplateId(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * A verificação bloqueante do R1.7 aplica-se a esta Loja_Modelo?
 *
 * O R1.7 é literalmente restrito: só a eliminação de uma Loja_Modelo «Neon Lab»
 * ou «FoodMart» exige a verificação em base de dados, e o R1.8 fala da
 * «verificação do critério 1.7». As restantes Loja_Modelo não estão nesse
 * âmbito.
 *
 * E não podem estar. O `template_id` de uma Loja_Modelo é o **modelo visual**
 * que ela demonstra (`galeria`, `lumiere`, …), não a identidade do modelo:
 * «Ekolo Sports» e «Vermelho Moderno» partilham `galeria`, o modelo visual
 * predefinido da Plataforma, que quase todas as Lojas de cliente também usam.
 * Correr `adminStoresUsingTemplate(["galeria"])` conta por isso essas Lojas de
 * cliente, o grupo nunca fica vazio e a eliminação da demo ficaria bloqueada
 * para sempre — sem fundamento, porque `applyModelToStore` **copia** a
 * Personalização para a Loja do cliente no momento em que o modelo é aplicado e
 * `__basedOn` já não é lido por nenhum caminho de loja. Apagar uma Loja_Modelo
 * não afeta nenhuma Loja de cliente.
 *
 * O risco real que o R1.8 protege é **retirar o modelo de `TEMPLATE_REGISTRY`**
 * (tarefa 7.6): aí sim, uma Loja de cliente com esse `template_id` passaria a
 * ser servida com o modelo errado. É por isso que a verificação só corre para os
 * modelos que a decisão D7 desregista.
 *
 * O emparelhamento aceita as duas identidades: o `template_id` de fábrica
 * (`neonlab`/`foodmart`, escrito por `createTemplateModel` e nunca editado pelo
 * painel) e o nome apresentado, que é a forma que o R1.6/R1.7 usam e que cobre
 * uma demo cujo `template_id` tenha sido mexido à mão.
 */
function requiresUsageCheck(m: TemplateModel): boolean {
  return TEMPLATES_A_REMOVER.includes(normTemplateId(m.templateId))
    || NOMES_A_REMOVER.includes(normTemplateId(m.name));
}

/** Confirmação simples: nome, irreversibilidade e cascata (R1.9). */
function deleteConfirmText(name: string): string {
  return `Eliminar definitivamente a loja-modelo "${name}"? Apaga também os produtos, banners e assets de demonstração. Esta ação é irreversível.`;
}

function matchLabel(m: TemplateMatch): string {
  return m === "templateId" ? "modelo aplicado" : "cópia do modelo";
}

/** Contagens da verificação, sempre visíveis antes de qualquer eliminação. */
function usageCountsHtml(usage: AdminTemplateUsage): string {
  const affected = usage.customerStores.length;
  return `<div class="flex flex-wrap gap-2 mb-3">
    ${badge(`${affected} loja(s) de cliente`, affected ? "#fef2f2" : "#ecfdf5", affected ? "#b91c1c" : "#047857")}
    ${badge(`${usage.models.length} loja(s)-modelo`, ACCENT_TINT, ACCENT)}
    ${badge(`verificado: ${usage.ids.join(", ") || "—"}`, "#f3f4f6", "#6b7280")}
  </div>`;
}

/** Uma Loja no resultado da verificação: nome, endereço, dono e estado. */
function usageStoreItem(s: AdminTemplateUser): string {
  const how = s.matchedBy.map(matchLabel).join(" e ") || "—";
  return `<li class="px-4 py-3 flex flex-col gap-1 min-w-0">
    <div class="flex items-start justify-between gap-2 flex-wrap">
      <p class="font-bold text-gray-900 break-words min-w-0">${esc(s.name || "—")}</p>
      ${stateBadge(s.state)}
    </div>
    <p class="text-xs text-gray-500 break-all">${esc(s.identifier)}.${esc(STORE_APEX)}</p>
    <p class="text-xs text-gray-500 break-all">${esc(s.ownerEmail || "dono sem email registado")}</p>
    <p class="text-xs text-gray-400 break-words">Modelo: ${esc(s.templateId || "—")}${s.basedOn ? ` · baseada em: ${esc(s.basedOn)}` : ""} · encontrada por: ${esc(how)}</p>
  </li>`;
}

function usageStoreList(items: AdminTemplateUser[], empty: string): string {
  if (!items.length) return `<p class="text-sm text-gray-500">${esc(empty)}</p>`;
  return `<ul class="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden min-w-0">${items.map(usageStoreItem).join("")}</ul>`;
}

const CHK_GHOST = "inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors";
const CHK_DANGER = "inline-flex items-center gap-1.5 text-sm font-bold text-white px-4 py-2 rounded-lg hover:opacity-95 transition-opacity";

/**
 * Bloco de verificação apresentado na própria vista (e não num `confirm`): a
 * lista de Lojas afetadas com nome, endereço, email do dono e estado não cabe
 * de forma legível numa caixa do navegador, e é precisamente essa lista que o
 * Administrador tem de ler antes de decidir.
 */
function checkPanel(
  tone: { bg: string; border: string; color: string; icon: string },
  title: string,
  body: string,
  actions: string,
): string {
  return `<div class="rounded-2xl border p-4 md:p-5 min-w-0" style="background:${tone.bg};border-color:${tone.border}">
    <div class="flex items-start gap-3 min-w-0">
      <span class="material-symbols-outlined shrink-0" style="color:${tone.color}">${tone.icon}</span>
      <div class="flex-1 min-w-0">
        <h4 class="font-black text-gray-900 break-words">${esc(title)}</h4>
        <div class="mt-2 text-sm text-gray-700 min-w-0">${body}</div>
        ${actions ? `<div class="mt-4 flex flex-wrap gap-2">${actions}</div>` : ""}
      </div>
    </div>
  </div>`;
}

/** Os quatro estados possíveis do diálogo de eliminação de uma Loja_Modelo. */
type ModelCheckView =
  | { kind: "loading"; model: TemplateModel; ids: string[] }
  | { kind: "error"; model: TemplateModel; message: string }
  | { kind: "blocked"; model: TemplateModel; usage: AdminTemplateUsage }
  | { kind: "clear"; model: TemplateModel; usage: AdminTemplateUsage };

function modelCheckHtml(v: ModelCheckView): string {
  const name = v.model.name || "sem nome";

  if (v.kind === "loading") {
    return checkPanel(
      { bg: "#ffffff", border: "#e5e7eb", color: ACCENT, icon: "database" },
      `A verificar quem usa «${name}»`,
      `<p>A contar em base de dados as Lojas com o modelo <b>${esc(v.ids.join(", "))}</b> e as Lojas baseadas nele. Nada é apagado antes de esta verificação terminar.</p>`,
      "",
    );
  }

  if (v.kind === "error") {
    return checkPanel(
      { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c", icon: "error" },
      "A verificação falhou — a eliminação não avança",
      `<p class="mb-2">Não foi possível contar as Lojas que usam «${esc(name)}», por isso a eliminação foi recusada e o modelo mantém-se registado.</p>
       <p class="mb-2 text-xs text-gray-600 break-words bg-white border border-gray-200 rounded-lg px-3 py-2">${esc(v.message)}</p>
       <p class="text-xs text-gray-600">Uma falha de leitura não é prova de que não existem Lojas afetadas. Corrija a falha e verifique de novo antes de apagar.</p>`,
      `<button id="chk-retry" class="${CHK_GHOST}"><span class="material-symbols-outlined text-[18px]">refresh</span> Verificar de novo</button>
       <button id="chk-close" class="${CHK_GHOST}"><span class="material-symbols-outlined text-[18px]">close</span> Fechar</button>`,
    );
  }

  if (v.kind === "blocked") {
    return checkPanel(
      { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c", icon: "block" },
      "Eliminação bloqueada — há lojas de cliente a usar este modelo",
      `${usageCountsHtml(v.usage)}
       <p class="mb-3">O modelo <b>${esc(name)}</b> <b>mantém-se registado</b> e nada foi apagado. Apagá-lo deixaria estas lojas de cliente a renderizar com o modelo errado.</p>
       <p class="font-bold text-gray-900 mb-2">Lojas de cliente afetadas</p>
       ${usageStoreList(v.usage.customerStores, "Nenhuma.")}
       <p class="font-bold text-gray-900 mt-4 mb-2">Lojas-modelo encontradas na mesma verificação</p>
       ${usageStoreList(v.usage.models, "Nenhuma.")}`,
      `<button id="chk-retry" class="${CHK_GHOST}"><span class="material-symbols-outlined text-[18px]">refresh</span> Verificar de novo</button>
       <button id="chk-close" class="${CHK_GHOST}"><span class="material-symbols-outlined text-[18px]">close</span> Fechar</button>`,
    );
  }

  const others = v.usage.models.filter((m) => m.id !== v.model.storeId);
  return checkPanel(
    { bg: "#fff7ed", border: "#fed7aa", color: ACCENT, icon: "warning" },
    `Confirmar a eliminação de «${name}»`,
    `${usageCountsHtml(v.usage)}
     <p class="mb-2">A verificação não encontrou <b>nenhuma loja de cliente</b> a usar este modelo, por isso a eliminação pode avançar.</p>
     <p class="mb-3"><b>A eliminação é irreversível.</b> Apaga a loja-modelo «${esc(name)}» e, em cascata, os respetivos produtos, banners e assets de demonstração. Nem a loja nem os dados voltam.</p>
     ${others.length
       ? `<p class="font-bold text-gray-900 mb-2">Esta ação apaga apenas «${esc(name)}». Mantêm-se registadas:</p>${usageStoreList(others, "Nenhuma.")}`
       : ""}`,
    `<button id="chk-confirm" class="${CHK_DANGER}" style="background:#b91c1c"><span class="material-symbols-outlined text-[18px]">delete_forever</span> Eliminar definitivamente</button>
     <button id="chk-cancel" class="${CHK_GHOST}"><span class="material-symbols-outlined text-[18px]">close</span> Cancelar</button>`,
  );
}

/* -------------------------- View-model agregado -------------------------- */

interface AccountVM extends AdminAccount {
  stores: AdminStore[];
  publishedCount: number;
  active: boolean;
}

function buildAccountVMs(accounts: AdminAccount[], stores: AdminStore[]): AccountVM[] {
  const byOwner = new Map<string, AdminStore[]>();
  for (const s of stores) {
    const arr = byOwner.get(s.ownerId) ?? [];
    arr.push(s);
    byOwner.set(s.ownerId, arr);
  }
  return accounts.map((a) => {
    const own = byOwner.get(a.id) ?? [];
    const publishedCount = own.filter((s) => s.state === "Publicada").length;
    return { ...a, stores: own, publishedCount, active: publishedCount > 0 };
  });
}

/* ================================ Render ================================= */

export async function renderAdminPanel(): Promise<void> {
  appState.editOwnerId = null;

  const admin = await isCurrentUserAdmin();
  if (!admin) {
    render(`<div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 bg-gray-50">
      <span class="material-symbols-outlined text-gray-400" style="font-size:56px;">shield_lock</span>
      <h1 class="text-2xl font-black text-gray-900">Acesso restrito</h1>
      <p class="text-gray-500">Esta área é exclusiva para administradores da plataforma.</p>
      <a href="#/painel" class="text-white px-6 py-3 rounded-xl font-semibold" style="background:${ACCENT}">Ir para o meu painel</a>
    </div>`);
    return;
  }

  const tab = tabOf();
  const title = tab === "contas" ? "Contas" : tab === "lojas" ? "Lojas" : tab === "modelos" ? "Modelos" : tab === "levantamentos" ? "Levantamentos" : tab === "transacoes" ? "Transações" : "Visão geral";

  function navItem(href: string, icon: string, label: string, active: boolean): string {
    const base = "rounded-xl px-4 py-3 mx-2 flex items-center gap-3 text-sm font-semibold transition-colors";
    const style = active ? `style="background:${ACCENT_TINT};color:${ACCENT}"` : "";
    const cls = active ? "" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
    return `<a href="${href}" class="${base} ${cls}" ${style}><span class="material-symbols-outlined">${icon}</span> ${label}</a>`;
  }

  function shell(content: string): string {
    return `
    <div class="flex min-h-screen w-full overflow-x-hidden bg-gray-50 font-sans text-gray-900">
      <aside class="hidden md:flex flex-col py-6 bg-white border-r border-gray-100 w-64 shrink-0 sticky top-0 h-screen">
        <div class="px-6 mb-1 flex items-center gap-2">
          <img src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </div>
        <span class="px-6 text-xs font-bold uppercase tracking-wider mb-6" style="color:${ACCENT}">Admin</span>
        <nav class="flex flex-col gap-1 px-2">
          ${navItem("#/adminPainel", "monitoring", "Visão geral", tab === "overview")}
          ${navItem("#/adminPainel/contas", "group", "Contas", tab === "contas")}
          ${navItem("#/adminPainel/lojas", "storefront", "Lojas", tab === "lojas")}
          ${navItem("#/adminPainel/modelos", "dashboard_customize", "Modelos", tab === "modelos")}
          ${navItem("#/adminPainel/transacoes", "receipt_long", "Transações", tab === "transacoes")}
          ${navItem("#/adminPainel/levantamentos", "account_balance_wallet", "Levantamentos", tab === "levantamentos")}
        </nav>
        <div class="mt-auto px-2 flex flex-col gap-1">
          <a href="#/painel" class="rounded-xl px-4 py-3 mx-0 flex items-center gap-3 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined">dashboard</span> O meu painel</a>
          <button id="logout" class="rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined">logout</span> Terminar sessão</button>
        </div>
      </aside>
      <div class="flex-1 min-w-0 flex flex-col">
        <header class="bg-white/90 backdrop-blur border-b border-gray-100 sticky top-0 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-3.5">
          <div class="flex items-center gap-3 min-w-0">
            <h2 class="text-xl font-black tracking-tight">${esc(title)}</h2>
          </div>
          <div class="flex items-center gap-2">
            <button id="refresh" class="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full p-2 transition-colors" title="Atualizar"><span class="material-symbols-outlined text-[20px]">refresh</span></button>
            <span class="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full" style="background:${ACCENT_TINT};color:${ACCENT}">Administração</span>
          </div>
        </header>
        <nav class="md:hidden flex gap-1 overflow-x-auto px-3 py-2 bg-white border-b border-gray-100 sticky top-[57px] z-30">
          ${["", "contas", "lojas", "modelos", "transacoes", "levantamentos"].map((t) => {
            const active = (t === "" ? "overview" : t) === tab;
            const label = t === "" ? "Visão geral" : t === "contas" ? "Contas" : t === "lojas" ? "Lojas" : t === "modelos" ? "Modelos" : t === "transacoes" ? "Transações" : "Levantamentos";
            return `<a href="#/adminPainel${t ? "/" + t : ""}" class="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors" style="${active ? `background:${ACCENT_TINT};color:${ACCENT}` : "color:#6b7280"}">${label}</a>`;
          }).join("")}
        </nav>
        <main class="flex-1 min-w-0 p-4 md:p-8"><div class="max-w-6xl mx-auto w-full">${content}</div></main>
      </div>
    </div>`;
  }

  function bindShell(): void {
    $("#logout")?.addEventListener("click", async () => { await logout(); go("#/"); });
    $("#refresh")?.addEventListener("click", () => { void renderAdminPanel(); });
  }

  function openStoreEditor(storeId: string, ownerId: string): void {
    appState.storeId = storeId;
    appState.editOwnerId = ownerId;
    // Ao sair do editor, o admin volta à sua tela (a aba atual), não ao painel do dono.
    appState.editorReturn = `#/adminPainel${tab === "overview" ? "" : "/" + tab}`;
    go("#/personalizar");
  }

  if (tab === "contas") { await renderContas(); return; }
  if (tab === "lojas") { await renderLojas(); return; }
  if (tab === "modelos") { await renderModelos(); return; }
  if (tab === "transacoes") { await renderTransacoes(); return; }
  if (tab === "levantamentos") { await renderLevantamentos(); return; }
  await renderOverview();

  /* ------------------------------- Visão geral ------------------------------ */
  /**
   * Três secções, por esta ordem (R7.1): **saúde do negócio**, **«A precisar de
   * atenção»** e **histórico recente**. As métricas e as listas são calculadas
   * por `src/services/adminMetrics.ts` — esta função lê os dados, escolhe os
   * rótulos e desenha; não agrega nada.
   *
   * `businessHealth`, `monthlyEvolution` e `attentionLists` recebem o **mesmo**
   * `input`, por isso o número da secção de saúde e o comprimento da lista
   * correspondente nunca divergem.
   *
   * **Rótulos, e não é detalhe (decisão D5):** `adminOverview().salesTotal` é o
   * **volume de vendas das Lojas** (encomendas pagas, dinheiro dos Donos);
   * `businessHealth().monthRevenue` é a **receita da Plataforma** (transações de
   * serviço: planos, SMS, logótipos). Ficam em blocos distintos, com nomes
   * distintos e com a diferença escrita por palavras.
   */
  async function renderOverview(): Promise<void> {
    // Estado de carregamento enquanto as seis leituras estão a correr (R7.10).
    render(shell(loadingBlock()));
    bindShell();

    // «Atualizar» chama `renderAdminPanel()`, que volta aqui e refaz estas seis
    // leituras: as três secções recarregam sempre juntas (R7.11).
    const [o, accounts, stores, withdrawals, transactions, productCounts] = await Promise.all([
      adminOverview(), listAccounts(), listStores(), listAllWithdrawals(),
      listServiceTransactions(), adminStoreProductCounts(),
    ]);

    const input: AdminMetricsInput = {
      now: Date.now(),
      accounts, stores, withdrawals, transactions, productCounts,
    };
    const health = businessHealth(input);
    const evolution = monthlyEvolution(input, MONTHS_IN_EVOLUTION);
    const attention = attentionLists(input);
    const attentionTotal = attention.withdrawalsToApprove.length + attention.paymentsStuck.length
      + attention.accountsExpiring7d.length + attention.storesWithoutProducts.length
      + attention.storesUnpublished.length;

    // Distribuição por plano das contas de cliente (contas de Administrador fora,
    // pelo mesmo critério do R7.8 aplicado por `adminMetrics`).
    const clientAccounts = accounts.filter((a) => !a.isAdmin);
    const planDist = PLAN_ORDER.map((id) => ({ id, n: clientAccounts.filter((a) => a.plan === id).length }));
    const planMax = Math.max(1, ...planDist.map((p) => p.n));

    const pct = (v: number): string => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

    /* --- Secção 1: saúde do negócio (R7.2, R7.3) --- */
    const healthGrid = `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
      ${healthCard("payments", "Receita da Plataforma (este mês)", formatKz(health.monthRevenue), "Transações de serviço pagas: planos, SMS e logótipos.", true)}
      ${healthCard("workspace_premium", "Assinaturas ativas", String(health.activeSubscriptions), "Contas com plano pago em vigor.")}
      ${healthCard("hourglass_bottom", "Contas em teste a expirar", String(health.trialsExpiring), `Teste a terminar nos próximos ${ATTENTION_WINDOW_DAYS} dias.`)}
      ${healthCard("trending_up", "Conversão de teste para pago", pct(health.trialConversion), "Contas que já pagaram um plano, sobre o total de contas.")}
      ${healthCard("public", "Lojas publicadas", String(health.publishedStores), "Lojas de cliente visíveis ao público.")}
      ${healthCard("block", "Lojas suspensas", String(health.suspendedStores), "Lojas cujo dono está sem acesso ativo.")}
    </div>`;

    const salesNote = `<div class="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 min-w-0">
      <h4 class="font-black text-gray-900 break-words">Volume de vendas das Lojas</h4>
      <p class="text-2xl font-black text-gray-900 mt-1 break-words">${esc(formatKz(o.salesTotal))}</p>
      <p class="text-xs text-gray-500 mt-2 break-words">Total das encomendas pagas nas Lojas dos clientes, desde sempre. <b>Não é receita da Plataforma</b>: este dinheiro é dos Donos das Lojas. A receita da Plataforma é a do primeiro cartão desta secção, «Receita da Plataforma (este mês)».</p>
      <div class="flex flex-wrap gap-2 mt-3">
        ${badge(`${o.accounts} conta(s) registada(s)`, "#f3f4f6", "#6b7280")}
        ${badge(`${o.stores} loja(s) registada(s)`, "#f3f4f6", "#6b7280")}
      </div>
    </div>`;

    const planCard = `<div class="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 min-w-0">
      <h4 class="font-black text-gray-900 break-words">Distribuição por plano</h4>
      <p class="text-xs text-gray-400 mt-0.5 mb-3 break-words">${clientAccounts.length} conta(s) de cliente.</p>
      <div class="space-y-3 min-w-0">
        ${planDist.map((p) => `
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 text-sm mb-1 min-w-0">
              <span class="font-semibold text-gray-700 break-words min-w-0">${esc(getPlan(p.id).name)}</span>
              <span class="text-gray-400 shrink-0">${p.n}</span>
            </div>
            <div class="h-2 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.round((p.n / planMax) * 100)}%;background:${ACCENT}"></div></div>
          </div>`).join("")}
      </div>
    </div>`;

    const secHealth = `<section class="mb-8 min-w-0">
      ${sectionHeader("monitoring", "Saúde do negócio", "Como está a Plataforma neste momento. As lojas-modelo e as contas de administração ficam fora destes números.")}
      ${healthGrid}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        ${evolutionChart(evolution)}
        <div class="grid grid-cols-1 gap-4 min-w-0">
          ${salesNote}
          ${planCard}
        </div>
      </div>
    </section>`;

    /* --- Secção 2: «A precisar de atenção» (R7.4, R7.5, R7.6) --- */
    const secAttention = `<section class="mb-8 min-w-0">
      ${sectionHeader("notifications_active", "A precisar de atenção", attentionTotal
        ? `${attentionTotal} item(ns) à espera de ação. Cada linha abre o separador onde se resolve.`
        : "Nada à espera de ação. Cada lista mostra o seu estado abaixo.")}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
        ${attentionCard(
          "Levantamentos por aprovar",
          attention.withdrawalsToApprove,
          "Nenhum pedido de levantamento à espera de aprovação.",
          ADMIN_HREFS.levantamentos,
          "Levantamentos",
        )}
        ${attentionCard(
          "Pagamentos pendentes ou falhados",
          attention.paymentsStuck,
          "Nenhum pagamento pendente, falhado ou expirado.",
          ADMIN_HREFS.transacoes,
          "Transações",
        )}
        ${attentionCard(
          `Contas a expirar (${ATTENTION_WINDOW_DAYS} dias)`,
          attention.accountsExpiring7d,
          `Nenhuma conta com o teste a terminar nos próximos ${ATTENTION_WINDOW_DAYS} dias.`,
          ADMIN_HREFS.contas,
          "Contas",
        )}
        ${attentionCard(
          "Lojas sem produtos",
          attention.storesWithoutProducts,
          "Todas as lojas já têm produtos.",
          ADMIN_HREFS.lojas,
          "Lojas",
        )}
        ${attentionCard(
          "Lojas não publicadas",
          attention.storesUnpublished,
          "Todas as lojas estão publicadas.",
          ADMIN_HREFS.lojas,
          "Lojas",
        )}
      </div>
    </section>`;

    /* --- Secção 3: histórico recente (R7.7) --- */
    const historyTxRow = (t: AdminServiceTx): string => {
      const icon = t.service === "plan" ? "workspace_premium" : t.service === "logo" ? "auto_awesome" : "sms";
      return `<a href="${esc(ADMIN_HREFS.transacoes)}" class="flex items-start gap-3 px-4 md:px-5 py-3 hover:bg-gray-50 transition-colors min-w-0">
        <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined text-[20px]">${icon}</span></div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-900 break-words">${esc(t.description)} · ${esc(formatKz(t.amount))}</p>
          <p class="text-xs text-gray-400 break-words">${esc(t.ownerEmail || t.ownerName || "dono desconhecido")} · ${esc(fmtDate(t.paidAt || t.createdAt))}</p>
        </div>
        <span class="shrink-0">${txStatusBadge(t.status)}</span>
      </a>`;
    };

    const historyAccountRow = (a: AdminAccount): string => `<a href="${esc(ADMIN_HREFS.contas)}" class="flex items-start gap-3 px-4 md:px-5 py-3 hover:bg-gray-50 transition-colors min-w-0">
      <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ACCENT}">${esc(initials(a.name || a.email))}</div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-900 break-words">${esc(a.name || a.email || "—")}</p>
        <p class="text-xs text-gray-400 break-words">${esc(a.email)} · criada a ${esc(fmtDate(a.createdAt))}</p>
      </div>
      <span class="shrink-0">${planBadge(a.plan)}</span>
    </a>`;

    const recentTx = transactions.slice(0, HISTORY_ROWS);
    const recentAccounts = accounts.slice(0, HISTORY_ROWS);

    const secHistory = `<section class="min-w-0">
      ${sectionHeader("history", "Histórico recente", `As ${HISTORY_ROWS} transações de serviço e as ${HISTORY_ROWS} contas mais recentes. As listas completas estão nos separadores.`)}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
        ${overviewCard(
          "Transações de serviço mais recentes",
          recentTx.length ? badge(String(transactions.length), ACCENT_TINT, ACCENT) : "",
          { href: ADMIN_HREFS.transacoes, label: "Ver todas" },
          recentTx.length
            ? `<div class="divide-y divide-gray-50 min-w-0">${recentTx.map(historyTxRow).join("")}</div>`
            : `<p class="px-5 py-8 text-center text-sm text-gray-400 break-words">Ainda não há transações de serviço.</p>`,
        )}
        ${overviewCard(
          "Contas mais recentes",
          recentAccounts.length ? badge(String(accounts.length), ACCENT_TINT, ACCENT) : "",
          { href: ADMIN_HREFS.contas, label: "Gerir contas" },
          recentAccounts.length
            ? `<div class="divide-y divide-gray-50 min-w-0">${recentAccounts.map(historyAccountRow).join("")}</div>`
            : `<p class="px-5 py-8 text-center text-sm text-gray-400 break-words">Ainda não há contas registadas.</p>`,
        )}
      </div>
    </section>`;

    render(shell(`${secHealth}${secAttention}${secHistory}`));
    bindShell();
  }

  /* --------------------------------- Modelos -------------------------------- */
  async function renderModelos(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

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

    function modelCard(m: TemplateModel): string {
      return `<div class="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
        <div class="p-5 border-b border-gray-100">
          <div class="w-10 h-10 rounded-full flex items-center justify-center mb-3" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">dashboard_customize</span></div>
          <h4 class="font-black text-gray-900">${esc(m.name)}</h4>
          <p class="text-sm text-gray-500 mt-1">${esc(m.description || "Sem descrição.")}</p>
        </div>
        <div class="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5 truncate"><span class="material-symbols-outlined text-[16px]">link</span> ${esc(m.identifier)}.${esc(STORE_APEX)}</div>
        <div class="mt-auto p-4 flex items-center gap-2 border-t border-gray-50">
          <button data-edit-model="${esc(m.storeId)}" data-owner="${esc(m.ownerId)}" class="flex-1 inline-flex items-center justify-center gap-1.5 text-white text-sm font-bold px-3 py-2 rounded-lg hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span> Editar</button>
          <a href="${esc(publicStoreUrl(m.identifier))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50" title="Ver loja-modelo"><span class="material-symbols-outlined text-[18px]">open_in_new</span></a>
          <button data-del-model="${esc(m.storeId)}" data-name="${esc(m.name)}" class="text-red-600 hover:bg-red-50 rounded-lg p-2 transition-colors" title="Eliminar modelo"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </div>
      </div>`;
    }

    render(shell(`
      <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 class="text-xl font-black text-gray-900">Modelos prontos</h3>
          <p class="text-sm text-gray-400">${models.length} modelo(s) · editáveis com o editor do site</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="seed-models" class="inline-flex items-center gap-2 text-gray-700 border border-gray-200 bg-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">download</span> Importar predefinidos</button>
          <button id="new-model" class="inline-flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:opacity-95 transition-opacity" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">add</span> Criar modelo</button>
        </div>
      </div>
      <div class="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 flex items-start gap-2">
        <span class="material-symbols-outlined text-[20px] shrink-0" style="color:${ACCENT}">info</span>
        <span>Cada modelo é uma loja de demonstração. Edita-a com o editor do site (fotos, imagens de produto, textos e cores) para aperfeiçoar o preview que os clientes veem na galeria de modelos prontos. Usa <b>Importar predefinidos</b> para trazer os modelos de fábrica (ex.: Vermelho Moderno) como lojas-modelo editáveis.</span>
      </div>
      <section id="model-check" class="mb-6 min-w-0"></section>
      ${models.length
        ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${models.map(modelCard).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
             <span class="material-symbols-outlined text-gray-300" style="font-size:48px">dashboard_customize</span>
             <p class="mt-2 mb-4">Ainda não há modelos. Importa os predefinidos ou cria um do zero.</p>
             <button id="seed-models-empty" class="inline-flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">download</span> Importar modelos predefinidos</button>
           </div>`}
    `));
    bindShell();

    async function seedModels(): Promise<void> {
      const adminId = await currentOwnerId();
      if (!adminId) { toast("Sessão inválida.", "error"); return; }
      const n = await withBusy(() => seedDefaultModels(adminId), "A importar modelos…");
      if (n > 0) { toast(`${n} modelo(s) importado(s).`); void renderModelos(); }
      else toast("Os modelos predefinidos já foram importados.", "info");
    }
    $("#seed-models")?.addEventListener("click", seedModels);
    $("#seed-models-empty")?.addEventListener("click", seedModels);

    $("#new-model")?.addEventListener("click", async () => {
      const name = prompt("Nome do modelo (ex.: Vermelho Moderno):")?.trim();
      if (!name) return;
      const description = prompt("Descrição curta (aparece na galeria):")?.trim() ?? "";
      const adminId = await currentOwnerId();
      if (!adminId) { toast("Sessão inválida.", "error"); return; }
      const model = await withBusy(() => createTemplateModel(adminId, name, description), "A criar modelo…");
      if (!model) { toast("Não foi possível criar o modelo.", "error"); return; }
      toast("Modelo criado. A abrir o editor…");
      openStoreEditor(model.storeId, model.ownerId);
    });

    document.querySelectorAll<HTMLElement>("[data-edit-model]").forEach((b) =>
      b.addEventListener("click", () => openStoreEditor(b.dataset.editModel!, b.dataset.owner!)));

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

    /** Apaga a Loja_Modelo em cascata: produtos, banners e assets (R1.9). */
    async function removeModel(m: TemplateModel): Promise<void> {
      const ok = await withBusy(() => deleteTemplateModel(m.storeId), "A eliminar…");
      if (ok) { toast("Modelo eliminado."); void renderModelos(); }
      else toast("Não foi possível eliminar.", "error");
    }

    /**
     * Caminho de confirmação simples, para as Loja_Modelo fora do âmbito do
     * R1.7: um `confirm` com o nome, a irreversibilidade e a cascata, e a
     * eliminação. Sem verificação bloqueante, porque o `template_id` destas
     * demos é um modelo visual partilhado com Lojas de cliente e contá-lo
     * bloquearia a eliminação sem razão (ver `requiresUsageCheck`).
     */
    async function deleteWithoutCheck(m: TemplateModel): Promise<void> {
      if (!confirm(deleteConfirmText(m.name))) return;
      await removeModel(m);
    }

    /** Eliminação em cascata (R1.9), só depois de uma verificação limpa. */
    async function doDelete(m: TemplateModel, usage: AdminTemplateUsage): Promise<void> {
      if (!confirm(deleteConfirmText(m.name))) return;

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

  /* --------------------------------- Contas --------------------------------- */
  async function renderContas(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const [accounts, stores] = await Promise.all([listAccounts(), listStores()]);
    const vms = buildAccountVMs(accounts, stores);

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 class="text-xl font-black text-gray-900">Contas</h3>
          <p class="text-sm text-gray-400" id="acc-count">${vms.length} conta(s)</p>
        </div>
      </div>
      <div class="flex flex-col lg:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="acc-search" type="search" placeholder="Pesquisar por nome ou email…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0 overflow-x-auto">
          <button data-fil="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Todas</button>
          <button data-fil="active" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Ativas</button>
          <button data-fil="inactive" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Inativas</button>
          <button data-fil="admin" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Admins</button>
        </div>
        <select id="acc-plan" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-44 shrink-0">
          <option value="">Todos os planos</option>
          ${PLAN_ORDER.map((id) => `<option value="${id}">${esc(getPlan(id).name)}</option>`).join("")}
        </select>
        <select id="acc-sort" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-44 shrink-0">
          <option value="recent">Mais recentes</option>
          <option value="name">Nome (A–Z)</option>
          <option value="stores">Mais lojas</option>
        </select>
      </div>
      <div id="acc-list"></div>`));
    bindShell();

    let q = "";
    let fil: "all" | "active" | "inactive" | "admin" = "all";
    let planF = "";
    let sort: "recent" | "name" | "stores" = "recent";

    const applyFil = (): void => {
      document.querySelectorAll<HTMLElement>("[data-fil]").forEach((b) => {
        const active = b.dataset.fil === fil;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#acc-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      let rows = vms.filter((a) => {
        if (fil === "active" && !a.active) return false;
        if (fil === "inactive" && a.active) return false;
        if (fil === "admin" && !a.isAdmin) return false;
        if (planF && a.plan !== planF) return false;
        if (ql && !`${a.name} ${a.email}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      rows = rows.slice().sort((a, b) => {
        if (sort === "name") return (a.name || a.email).localeCompare(b.name || b.email, "pt");
        if (sort === "stores") return b.stores.length - a.stores.length;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const count = $("#acc-count");
      if (count) count.textContent = `${rows.length} de ${vms.length} conta(s)`;

      el.innerHTML = rows.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
             <div class="hidden md:grid grid-cols-[1fr_120px_90px_110px_120px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400">
               <span>Conta</span><span>Plano</span><span>Lojas</span><span>Estado</span><span class="text-right">Ações</span>
             </div>
             <div class="divide-y divide-gray-100">${rows.map(accountRow).join("")}</div>
           </div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma conta corresponde aos filtros.</div>`;
      bindAccountRows(el, draw);
    }

    applyFil();
    draw();
    ($("#acc-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    ($("#acc-plan") as HTMLSelectElement | null)?.addEventListener("change", (e) => { planF = (e.target as HTMLSelectElement).value; draw(); });
    ($("#acc-sort") as HTMLSelectElement | null)?.addEventListener("change", (e) => { sort = (e.target as HTMLSelectElement).value as typeof sort; draw(); });
    document.querySelectorAll<HTMLElement>("[data-fil]").forEach((b) =>
      b.addEventListener("click", () => { fil = b.dataset.fil as typeof fil; applyFil(); draw(); }));

    function accountRow(a: AccountVM): string {
      const planOptions = PLAN_ORDER.map((id) => `<option value="${id}" ${a.plan === id ? "selected" : ""}>${esc(getPlan(id).name)}</option>`).join("");
      const storesList = a.stores.length
        ? a.stores.map((s) => `
            <div class="flex items-center gap-2 py-2 flex-wrap">
              <span class="material-symbols-outlined text-gray-300 text-[20px]">storefront</span>
              <span class="font-semibold text-gray-800 text-sm truncate min-w-0">${esc(s.name)}</span>
              ${stateBadge(s.state)}
              <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="text-xs font-semibold hover:underline" style="color:${ACCENT}">${esc(s.identifier)}.${esc(STORE_APEX)}</a>
              <div class="ml-auto flex items-center gap-1.5">
                <button data-edit-store="${esc(s.id)}" data-owner="${esc(a.id)}" class="inline-flex items-center gap-1 text-xs font-semibold text-white px-2.5 py-1 rounded-lg hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[16px]">palette</span> Editar</button>
                <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">open_in_new</span> Ver</a>
              </div>
              <div class="w-full pl-7">${featureChips(s.features)}</div>
            </div>`).join("")
        : `<p class="text-sm text-gray-400 py-2">Esta conta ainda não tem lojas.</p>`;

      return `<div data-acc-block="${esc(a.id)}">
        <div class="md:grid md:grid-cols-[1fr_120px_90px_110px_120px] md:items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors flex flex-wrap">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ACCENT}">${esc(initials(a.name || a.email))}</div>
            <div class="min-w-0">
              <p class="font-semibold text-gray-900 truncate flex items-center gap-1.5">${esc(a.name || "—")} ${a.isAdmin ? badge("Admin", "#eff6ff", "#1d4ed8") : ""}</p>
              <p class="text-xs text-gray-400 truncate">${esc(a.email)} · desde ${esc(fmtDate(a.createdAt))}</p>
            </div>
          </div>
          <div class="hidden md:block">${a.isAdmin ? planBadge(a.plan) : `<select data-plan-for="${esc(a.id)}" title="Alterar plano" class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#F95901]">${planOptions}</select>`}</div>
          <div class="hidden md:block text-sm text-gray-600">${a.stores.length} ${a.publishedCount ? `<span class="text-gray-400">(${a.publishedCount} pub.)</span>` : ""}</div>
          <div class="hidden md:block">${activeBadge(a.active)}</div>
          <div class="flex md:justify-end items-center gap-1 mt-2 md:mt-0 w-full md:w-auto">
            <button data-expand="${esc(a.id)}" class="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">expand_more</span> Lojas</button>
            ${a.isAdmin ? "" : `<button data-del-acc="${esc(a.id)}" data-email="${esc(a.email)}" class="text-red-600 hover:bg-red-50 rounded-lg p-1.5 transition-colors" title="Cancelar conta"><span class="material-symbols-outlined text-[18px]">person_remove</span></button>`}
          </div>
        </div>
        <div data-detail="${esc(a.id)}" class="hidden bg-gray-50 border-t border-gray-100 px-5 py-4">
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <label class="text-sm font-semibold text-gray-700 flex items-center gap-2">Plano:
              <select data-plan-for="${esc(a.id)}" ${a.isAdmin ? "disabled" : ""} class="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#F95901] disabled:bg-gray-100 disabled:text-gray-400">${planOptions}</select>
            </label>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl px-4 py-2 divide-y divide-gray-50">${storesList}</div>
        </div>
      </div>`;
    }

    function bindAccountRows(scope: HTMLElement, refresh: () => void): void {
      scope.querySelectorAll<HTMLElement>("[data-expand]").forEach((b) =>
        b.addEventListener("click", () => {
          const id = b.dataset.expand!;
          const det = scope.querySelector<HTMLElement>(`[data-detail="${id}"]`);
          if (!det) return;
          det.classList.toggle("hidden");
          const ic = b.querySelector(".material-symbols-outlined");
          if (ic) ic.textContent = det.classList.contains("hidden") ? "expand_more" : "expand_less";
        }));
      scope.querySelectorAll<HTMLElement>("[data-edit-store]").forEach((b) =>
        b.addEventListener("click", () => openStoreEditor(b.dataset.editStore!, b.dataset.owner!)));
      scope.querySelectorAll<HTMLSelectElement>("[data-plan-for]").forEach((sel) =>
        sel.addEventListener("change", async () => {
          const id = sel.dataset.planFor!;
          if (!isPlanId(sel.value)) return;
          const ok = await withBusy(() => adminSetAccountPlan(id, sel.value as PlanId), "A atualizar plano…");
          if (ok) {
            const vm = vms.find((v) => v.id === id);
            if (vm) (vm as AccountVM).plan = sel.value;
            toast("Plano atualizado.");
            draw();
          } else toast("Não foi possível atualizar.", "error");
        }));
      scope.querySelectorAll<HTMLElement>("[data-del-acc]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.delAcc!;
          const email = b.dataset.email ?? "";
          const typed = prompt(`Cancelar esta conta remove TODAS as lojas e dados.\nEscreva o email para confirmar:\n\n${email}`);
          if (typed === null) return;
          if (typed.trim() !== email) { toast("Email não corresponde.", "error"); return; }
          const ok = await withBusy(() => adminDeleteAccount(id), "A cancelar conta…");
          if (ok) {
            const i = vms.findIndex((v) => v.id === id);
            if (i >= 0) vms.splice(i, 1);
            toast("Conta cancelada.");
            refresh();
          } else toast("Não foi possível cancelar.", "error");
        }));
    }
  }

  /* --------------------------------- Lojas --------------------------------- */
  async function renderLojas(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const stores = await listStores();

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 class="text-xl font-black text-gray-900">Lojas</h3>
          <p class="text-sm text-gray-400" id="store-count">${stores.length} loja(s)</p>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="store-search" type="search" placeholder="Pesquisar por loja, dono ou endereço…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0">
          <button data-st="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Todas</button>
          <button data-st="published" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Publicadas</button>
          <button data-st="draft" class="px-3 py-1.5 rounded-lg font-semibold transition-colors">Rascunho</button>
        </div>
        <select id="store-feat" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-52 shrink-0">
          <option value="">Todas as funcionalidades</option>
          <option value="online">Com Express + Referência</option>
          <option value="sms">Com SMS de confirmação</option>
          <option value="whatsapp">Com WhatsApp</option>
          <option value="delivery">Com entregas</option>
        </select>
      </div>
      <div id="store-list"></div>`));
    bindShell();

    let q = "";
    let st: "all" | "published" | "draft" = "all";
    let feat: "" | "online" | "sms" | "whatsapp" | "delivery" = "";
    const applySt = (): void => {
      document.querySelectorAll<HTMLElement>("[data-st]").forEach((b) => {
        const active = b.dataset.st === st;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#store-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = stores.filter((s) => {
        if (st === "published" && s.state !== "Publicada") return false;
        if (st === "draft" && s.state === "Publicada") return false;
        if (feat && !s.features[feat]) return false;
        if (ql && !`${s.name} ${s.ownerEmail} ${s.ownerName} ${s.subdomain}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      const count = $("#store-count");
      if (count) count.textContent = `${rows.length} de ${stores.length} loja(s)`;
      el.innerHTML = rows.length
        ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${rows.map(storeCard).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma loja corresponde aos filtros.</div>`;
      bindStoreCards(el, draw);
    }

    applySt();
    draw();
    ($("#store-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    ($("#store-feat") as HTMLSelectElement | null)?.addEventListener("change", (e) => { feat = (e.target as HTMLSelectElement).value as typeof feat; draw(); });
    document.querySelectorAll<HTMLElement>("[data-st]").forEach((b) =>
      b.addEventListener("click", () => { st = b.dataset.st as typeof st; applySt(); draw(); }));

    function bindStoreCards(scope: HTMLElement, refresh: () => void): void {
      scope.querySelectorAll<HTMLElement>("[data-edit-store]").forEach((b) =>
        b.addEventListener("click", () => {
          const s = stores.find((x) => x.id === b.dataset.editStore);
          if (s) openStoreEditor(s.id, s.ownerId);
        }));
      scope.querySelectorAll<HTMLElement>("[data-toggle-store]").forEach((b) =>
        b.addEventListener("click", async () => {
          const s = stores.find((x) => x.id === b.dataset.toggleStore);
          if (!s) return;
          const next = s.state === "Publicada" ? "Rascunho" : "Publicada";
          const ok = await withBusy(() => adminSetStoreState(s.id, next), "A atualizar…");
          if (ok) { s.state = next; toast("Estado atualizado."); refresh(); } else toast("Falhou.", "error");
        }));
      scope.querySelectorAll<HTMLElement>("[data-del-store]").forEach((b) =>
        b.addEventListener("click", async () => {
          const s = stores.find((x) => x.id === b.dataset.delStore);
          if (!s) return;
          const typed = prompt(`Apagar a loja "${s.name}" remove tudo permanentemente.\nEscreva o nome para confirmar:`);
          if (typed === null) return;
          if (typed.trim() !== s.name.trim()) { toast("Nome não corresponde.", "error"); return; }
          const ok = await withBusy(() => adminDeleteStore(s.id), "A apagar loja…");
          if (ok) { const i = stores.indexOf(s); if (i >= 0) stores.splice(i, 1); toast("Loja apagada."); refresh(); } else toast("Falhou.", "error");
        }));
    }
  }

  function storeCard(s: AdminStore): string {
    return `<div class="bg-white border border-gray-200 rounded-2xl p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-black text-gray-900 truncate">${esc(s.name)}</p>
          <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="text-xs font-semibold hover:underline" style="color:${ACCENT}">${esc(s.identifier)}.${esc(STORE_APEX)}</a>
          <p class="text-xs text-gray-400 mt-1 truncate">${esc(s.ownerName || "—")} · ${esc(s.ownerEmail)}</p>
          <p class="text-xs text-gray-300 mt-0.5">Criada ${esc(fmtDate(s.createdAt))}</p>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0">${stateBadge(s.state)}${planBadge(s.plan)}</div>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-100">
        <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Funcionalidades</p>
        ${featureChips(s.features)}
      </div>
      <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
        <button data-edit-store="${esc(s.id)}" class="inline-flex items-center gap-1 text-sm font-semibold text-white px-3 py-1.5 rounded-lg transition-opacity hover:opacity-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">palette</span> Editar</button>
        <a href="${esc(publicStoreUrl(s.identifier))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">open_in_new</span> Ver</a>
        <button data-toggle-store="${esc(s.id)}" class="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"><span class="material-symbols-outlined text-[18px]">${s.state === "Publicada" ? "visibility_off" : "public"}</span> ${s.state === "Publicada" ? "Despublicar" : "Publicar"}</button>
        <button data-del-store="${esc(s.id)}" class="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>
    </div>`;
  }

  /* ------------------------------ Transações ------------------------------ */
  async function renderTransacoes(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const items = await listServiceTransactions();
    const sum = (st: string): number => items.filter((t) => t.status === st).reduce((s, t) => s + t.amount, 0);
    const totalPaid = sum("paid");
    const totalPending = sum("open");

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        ${metric("payments", "Recebido (completas)", formatKz(totalPaid), true)}
        ${metric("hourglass_top", "Pendente", formatKz(totalPending))}
        ${metric("workspace_premium", "Planos", String(items.filter((t) => t.service === "plan").length))}
        ${metric("sms", "Pacotes de SMS", String(items.filter((t) => t.service === "sms").length))}
      </section>
      <div class="flex flex-col lg:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="tx-search" type="search" placeholder="Pesquisar por email ou serviço…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0 overflow-x-auto">
          <button data-tf="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Todas</button>
          <button data-tf="paid" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Completas</button>
          <button data-tf="open" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Pendentes</button>
          <button data-tf="failed" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Falhadas</button>
        </div>
        <select id="tx-service" class="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F95901] sm:w-44 shrink-0">
          <option value="">Todos os serviços</option>
          <option value="plan">Planos</option>
          <option value="sms">Pacotes de SMS</option>
          <option value="logo">Logótipos</option>
        </select>
      </div>
      <div id="tx-list"></div>`));
    bindShell();

    let q = "";
    let tf: "all" | "paid" | "open" | "failed" = "all";
    let svc: "" | "plan" | "sms" | "logo" = "";
    const applyTf = (): void => {
      document.querySelectorAll<HTMLElement>("[data-tf]").forEach((b) => {
        const active = b.dataset.tf === tf;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#tx-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = items.filter((t) => {
        if (tf === "failed" ? !(t.status === "failed" || t.status === "cancelled") : tf !== "all" && t.status !== tf) return false;
        if (svc && t.service !== svc) return false;
        if (ql && !`${t.ownerEmail} ${t.ownerName} ${t.description}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      el.innerHTML = rows.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">${rows.map(txRow).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhuma transação corresponde aos filtros.</div>`;
      el.querySelectorAll<HTMLElement>("[data-tx-del]").forEach((b) =>
        b.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = b.dataset.txDel!;
          const svc = b.dataset.txSvc as AdminServiceTx["service"];
          if (!confirm("Apagar esta transação? Esta ação não pode ser anulada.")) return;
          const ok = await withBusy(() => adminDeleteServiceTransaction(id, svc), "A apagar transação…");
          if (ok) {
            const idx = items.findIndex((t) => t.id === id && t.service === svc);
            if (idx >= 0) items.splice(idx, 1);
            toast("Transação apagada.");
            draw();
          } else toast("Não foi possível apagar a transação.", "error");
        }));
    }

    applyTf();
    draw();
    ($("#tx-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    ($("#tx-service") as HTMLSelectElement | null)?.addEventListener("change", (e) => { svc = (e.target as HTMLSelectElement).value as typeof svc; draw(); });
    document.querySelectorAll<HTMLElement>("[data-tf]").forEach((b) =>
      b.addEventListener("click", () => { tf = b.dataset.tf as typeof tf; applyTf(); draw(); }));
  }

  function txStatusBadge(s: string): string {
    switch (s) {
      case "paid": return badge("Completa", "#ecfdf5", "#047857");
      case "open": return badge("Pendente", "#fff7ed", "#c2410c");
      case "failed": return badge("Falhada", "#fef2f2", "#b91c1c");
      case "cancelled": return badge("Cancelada", "#f3f4f6", "#6b7280");
      case "expired": return badge("Expirada", "#f3f4f6", "#6b7280");
      default: return badge(s, "#f3f4f6", "#6b7280");
    }
  }

  function txRow(t: AdminServiceTx): string {
    const icon = t.service === "plan" ? "workspace_premium" : t.service === "logo" ? "auto_awesome" : "sms";
    const method = t.method === "mcx" ? "Multicaixa Express" : t.method === "reference" ? "Referência" : t.method;
    return `<div class="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors flex-wrap">
      <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">${icon}</span></div>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-900 truncate">${esc(t.description)} · ${esc(formatKz(t.amount))}</p>
        <p class="text-xs text-gray-400 truncate">${esc(t.ownerName || t.ownerEmail)}${t.ownerName ? ` · ${esc(t.ownerEmail)}` : ""}${t.storeName ? ` · ${esc(t.storeName)}` : ""}</p>
        <p class="text-xs text-gray-300 truncate">${esc(method)} · ${esc(fmtDate(t.createdAt))}</p>
      </div>
      ${txStatusBadge(t.status)}
      <button data-tx-del="${esc(t.id)}" data-tx-svc="${esc(t.service)}" title="Apagar transação" class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"><span class="material-symbols-outlined text-[20px]">delete</span></button>
    </div>`;
  }

  /* ------------------------------ Levantamentos ------------------------------ */
  async function renderLevantamentos(): Promise<void> {
    render(shell(loadingBlock()));
    bindShell();

    const items = await listAllWithdrawals();
    const sum = (st: string): number => items.filter((w) => w.status === st).reduce((s, w) => s + w.amount, 0);
    const totalPending = sum("requested") + sum("approved");
    const totalPaid = sum("paid");

    const inputCls = "w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-[#F95901]";
    render(shell(`
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        ${metric("hourglass_top", "Por pagar", formatKz(totalPending), true)}
        ${metric("check_circle", "Já pago", formatKz(totalPaid))}
        ${metric("receipt_long", "Pedidos", String(items.length))}
        ${metric("schedule", "Pendentes", String(items.filter((w) => w.status === "requested").length))}
      </section>
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input id="wd-search" type="search" placeholder="Pesquisar por loja ou email…" class="${inputCls}" />
        </div>
        <div class="inline-flex bg-gray-100 rounded-xl p-1 gap-1 text-sm shrink-0 overflow-x-auto">
          <button data-wf="all" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Todos</button>
          <button data-wf="requested" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Pendentes</button>
          <button data-wf="approved" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Aprovados</button>
          <button data-wf="paid" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Pagos</button>
          <button data-wf="rejected" class="px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">Rejeitados</button>
        </div>
      </div>
      <div id="wd-list"></div>`));
    bindShell();

    let q = "";
    let wf: "all" | "requested" | "approved" | "paid" | "rejected" = "all";
    const applyWf = (): void => {
      document.querySelectorAll<HTMLElement>("[data-wf]").forEach((b) => {
        const active = b.dataset.wf === wf;
        b.style.background = active ? "#fff" : "transparent";
        b.style.color = active ? ACCENT : "#6b7280";
        b.style.boxShadow = active ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    };

    function draw(): void {
      const el = $("#wd-list");
      if (!el) return;
      const ql = q.trim().toLowerCase();
      const rows = items.filter((w) => {
        if (wf !== "all" && w.status !== wf) return false;
        if (ql && !`${w.storeName} ${w.ownerEmail}`.toLowerCase().includes(ql)) return false;
        return true;
      });
      el.innerHTML = rows.length
        ? `<div class="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">${rows.map(withdrawalRow).join("")}</div>`
        : `<div class="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">Nenhum pedido corresponde aos filtros.</div>`;
      el.querySelectorAll<HTMLElement>("[data-wd]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.wd!;
          const action = b.dataset.action as "approved" | "paid" | "rejected";
          const w = items.find((x) => x.id === id);
          if (!w) return;
          const ok = await withBusy(() => adminProcessWithdrawal(id, action), "A atualizar…");
          if (ok) { w.status = action; w.processedAt = new Date().toISOString(); toast("Levantamento atualizado."); draw(); }
          else toast("Falhou.", "error");
        }));
    }

    applyWf();
    draw();
    ($("#wd-search") as HTMLInputElement | null)?.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; draw(); });
    document.querySelectorAll<HTMLElement>("[data-wf]").forEach((b) =>
      b.addEventListener("click", () => { wf = b.dataset.wf as typeof wf; applyWf(); draw(); }));
  }

  function withdrawalRow(w: AdminWithdrawal): string {
    const actions = w.status === "requested" || w.status === "approved"
      ? `<div class="flex gap-1.5 flex-wrap">
          ${w.status === "requested" ? `<button data-wd="${esc(w.id)}" data-action="approved" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Aprovar</button>` : ""}
          <button data-wd="${esc(w.id)}" data-action="paid" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white" style="background:#047857">Marcar pago</button>
          <button data-wd="${esc(w.id)}" data-action="rejected" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Rejeitar</button>
        </div>`
      : "";
    return `<div class="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors flex-wrap">
      <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${ACCENT_TINT};color:${ACCENT}"><span class="material-symbols-outlined">payments</span></div>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-900">${esc(formatKz(w.amount))}</p>
        <p class="text-xs text-gray-400 truncate">${esc(w.storeName)} · ${esc(w.ownerEmail)} · ${esc(fmtDate(w.createdAt))}</p>
        ${w.iban ? `<p class="text-xs text-gray-400 truncate">${esc(w.beneficiaryName || "")} · ${esc(w.bankName || "")} · ${esc(w.iban)}</p>` : ""}
      </div>
      ${wdStatusBadge(w.status)}
      ${actions}
    </div>`;
  }

  function loadingBlock(): string {
    return `<div class="flex items-center justify-center py-20"><span class="material-symbols-outlined animate-spin text-gray-300" style="font-size:40px">progress_activity</span></div>`;
  }
}
