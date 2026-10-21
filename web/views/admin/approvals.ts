/**
 * «Aprovações»: os pedidos de verificação de empresa para os pagamentos digitais.
 *
 * Para receber por Multicaixa Express e Referência Bancária, o Dono tem de ser
 * uma empresa registada: no separador «Pagamentos» do painel dele indica o nome e
 * o NIF da empresa, a conta bancária onde recebe, e envia a Matrícula e a
 * Certidão. O pedido chega aqui. Aprovar liga os pagamentos digitais da loja
 * (o gatilho `store_payments_sync_store` da migração 0023 muda
 * `stores.digital_payments`); rejeitar desliga-os e o Dono lê o motivo.
 *
 * Os pedidos em análise vêm primeiro, o mais antigo à frente, com os dados todos
 * à vista — é o que o Administrador tem de comparar com os documentos. Depois
 * vem o histórico, compacto, com os dados atrás de «Ver dados».
 *
 * Os documentos estão num bucket **privado**: cada «Ver matrícula» pede um URL
 * assinado de 5 minutos no momento do clique (`companyDocumentUrl`), nunca ao
 * carregar a lista.
 *
 * Depois de cada decisão a linha é relida, com o interruptor da loja, e a vista
 * diz se os pagamentos digitais ficaram ligados ou desligados — se o gatilho não
 * tiver corrido, diz isso em vez de dar a decisão por feita.
 */
import { esc, toast, withBusy } from "../../lib/dom.js";
import { companyDocumentUrl } from "../../supabase/payments.js";
import {
  adminApproveVerification, adminRejectVerification, getVerification, listVerifications,
  type AdminVerification,
} from "../../supabase/admin.js";
import {
  REJECTION_REASON_MAX, REJECTION_REASON_MIN, filterVerificationHistory, missingForApproval,
  splitVerificationQueue, validateRejectionReason, verificationActions, type HistoryFilter,
} from "../../../src/services/adminMetrics.js";
import {
  COMPANY_DOCUMENTS, VERIFICATION_STATUS_LABEL, formatIban, type CompanyDocumentId, type VerificationStatus,
} from "../../../src/services/paymentVerification.js";
import { PAYMENTS_PROVIDER_READY } from "../../../src/services/payments.js";
import { openDialog } from "./dialog.js";
import {
  announce, ago, bindChips, blockTitle, btnClass, emptyState, filterChips, fmtDate, fmtDateTime, icon,
  liveRegion, pill, storeLink, updateChipCounts, type AdminView, type Tone,
} from "./ui.js";

/** Rótulo de cada botão de documento. */
const DOC_BUTTON: Readonly<Record<CompanyDocumentId, string>> = {
  matricula: "Ver matrícula",
  certidao: "Ver certidão",
};

const STATUS_TONE: Readonly<Record<VerificationStatus, Tone>> = {
  none: "gray",
  pending: "amber",
  approved: "green",
  rejected: "red",
};

const LIVE = "ver-live";

function statusPill(status: VerificationStatus): string {
  return pill(VERIFICATION_STATUS_LABEL[status], STATUS_TONE[status]);
}

/** O estado do interruptor da loja, por extenso. */
function digitalPill(on: boolean): string {
  return on
    ? pill("Pagamentos digitais ligados", "green", "bolt")
    : pill("Pagamentos digitais desligados", "gray");
}

/** Linha de uma lista de definição. */
function field(label: string, value: string, mono = false, wide = false): string {
  return `<div class="min-w-0 ${wide ? "sm:col-span-2" : ""}">
    <dt class="text-xs font-medium text-gray-600">${esc(label)}</dt>
    <dd class="mt-0.5 text-sm text-gray-900 break-words ${mono ? "font-mono tracking-wide" : "font-medium"}">${value ? esc(value) : `<span class="text-gray-600">Não indicado</span>`}</dd>
  </div>`;
}

/** Os dados do pedido, os documentos e as decisões possíveis. */
function detailsHtml(v: AdminVerification): string {
  const missing = missingForApproval(v);
  const actions = verificationActions(v.status);
  const store = v.storeName || "sem nome";
  const docs = COMPANY_DOCUMENTS.map((d) => {
    const path = v.documents[d.id];
    return path
      ? `<button type="button" data-act="doc" data-doc="${d.id}" data-store="${esc(v.storeId)}" aria-label="${esc(`${DOC_BUTTON[d.id]} da loja ${store} (abre num novo separador)`)}" class="${btnClass("secondary", "sm")}">${icon("description")} ${esc(DOC_BUTTON[d.id])}${icon("open_in_new", "text-[14px]")}</button>`
      : `<span class="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600">${icon("block")} ${esc(d.label)} em falta</span>`;
  }).join("");

  const decide: string[] = [];
  if (actions.approve) {
    decide.push(`<button type="button" data-act="approve" data-store="${esc(v.storeId)}" aria-label="${esc(`Aprovar o pedido da loja ${store}`)}" class="${btnClass("success", "sm")}" ${missing.length ? "disabled" : ""}>${icon("check_circle")} Aprovar</button>`);
  }
  if (actions.reject) {
    decide.push(`<button type="button" data-act="reject" data-store="${esc(v.storeId)}" aria-label="${esc(`Rejeitar o pedido da loja ${store}`)}" class="${btnClass("dangerOutline", "sm")}">${icon("cancel")} Rejeitar</button>`);
  }

  return `<dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      ${field("Dono", v.ownerEmail)}
      ${field("Empresa", v.companyName)}
      ${field("NIF", v.companyNif, true)}
      ${field("Banco", v.bankName)}
      ${field("Titular da conta", v.beneficiaryName)}
      ${field("IBAN", v.iban ? formatIban(v.iban) : "", true, true)}
    </dl>
    <div class="mt-4">
      <p class="text-xs font-medium text-gray-600">Documentos da empresa</p>
      <div class="mt-1.5 flex flex-wrap gap-2">${docs}</div>
    </div>
    ${decide.length ? `<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
      ${decide.join("")}
      ${actions.approve && missing.length ? `<p class="text-sm text-gray-700">Não pode ser aprovado. Falta: ${esc(missing.join(", "))}.</p>` : ""}
    </div>` : ""}`;
}

/** Cabeçalho comum: a loja, a ligação para ela e os estados. */
function headerHtml(v: AdminVerification, titleId: string): string {
  return `<div class="flex flex-wrap items-start justify-between gap-2">
    <div class="min-w-0">
      <h3 id="${titleId}" class="font-bold text-gray-900 break-words">${esc(v.storeName || "Loja sem nome")}</h3>
      ${storeLink(v.storeIdentifier)}
    </div>
    <div class="flex flex-wrap items-center gap-1.5">${statusPill(v.status)}${digitalPill(v.digitalPayments)}</div>
  </div>`;
}

/** Pedido em análise: tudo à vista. */
function pendingCard(v: AdminVerification): string {
  const titleId = `ver-${v.storeId}-title`;
  const sent = v.submittedAt ? `Enviado ${ago(v.submittedAt)} · ${fmtDateTime(v.submittedAt)}` : "Data de envio desconhecida";
  return `<li>
    <article aria-labelledby="${esc(titleId)}" class="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
      ${headerHtml(v, esc(titleId))}
      <p class="mt-1 text-xs text-gray-600">${esc(sent)}</p>
      <div class="mt-4">${detailsHtml(v)}</div>
    </article>
  </li>`;
}

/** A decisão já tomada, numa frase. */
function decisionLine(v: AdminVerification): string {
  const who = v.reviewedByEmail ? ` · por ${v.reviewedByEmail}` : "";
  return `${VERIFICATION_STATUS_LABEL[v.status]} a ${fmtDate(v.reviewedAt ?? v.submittedAt)}${who}`;
}

/** Pedido já decidido: compacto, com os dados atrás de «Ver dados». */
function historyRow(v: AdminVerification, open: boolean): string {
  const titleId = `ver-${v.storeId}-title`;
  const panelId = `ver-${v.storeId}-details`;
  return `<li class="px-4 py-3">
    ${headerHtml(v, esc(titleId))}
    <p class="mt-1 text-sm text-gray-700 break-words">${esc(v.companyName || "Empresa sem nome")} · ${esc(decisionLine(v))}</p>
    ${v.status === "rejected" && v.rejectionReason
      ? `<p class="mt-1 whitespace-pre-line text-sm text-gray-800 break-words"><span class="font-semibold">Motivo:</span> ${esc(v.rejectionReason)}</p>`
      : ""}
    <button type="button" data-act="toggle" data-store="${esc(v.storeId)}" aria-expanded="${open}" aria-controls="${esc(panelId)}" aria-label="${esc(`${open ? "Esconder dados" : "Ver dados"} da loja ${v.storeName || "sem nome"}`)}" class="${btnClass("ghost", "sm")} mt-2 -ml-3">
      ${icon(open ? "expand_less" : "expand_more")}<span>${open ? "Esconder dados" : "Ver dados"}</span>
    </button>
    <div id="${esc(panelId)}" class="mt-2 rounded-xl bg-gray-50 p-4" ${open ? "" : "hidden"}>${detailsHtml(v)}</div>
  </li>`;
}

/**
 * Abre um documento privado num novo separador.
 *
 * O separador abre-se **já**, dentro do clique: depois de esperar pelo URL
 * assinado, os navegadores (o Safari logo, os outros passados uns segundos)
 * tratariam a janela como um pop-up e bloqueavam-na. `opener = null` faz o mesmo
 * que `rel="noopener"`: o documento aberto não chega a esta página. Se o
 * separador não abrir, usa-se uma ligação normal com `rel="noopener noreferrer"`.
 */
async function openDocument(path: string): Promise<void> {
  const tab = window.open("", "_blank");
  if (tab) {
    tab.opener = null;
    try {
      tab.document.title = "A abrir o documento…";
      tab.document.body.textContent = "A abrir o documento…";
    } catch {
      // Sem acesso ao separador novo: não faz mal, o endereço chega já a seguir.
    }
  }
  const url = await companyDocumentUrl(path);
  if (!url) {
    tab?.close();
    toast("Não foi possível abrir o documento. Tente de novo.", "error");
    return;
  }
  if (tab && !tab.closed) {
    tab.location.replace(url);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Desenha a secção «Aprovações». */
export async function renderApprovals(view: AdminView): Promise<void> {
  view.loading();
  let rows = await listVerifications();
  if (!view.isCurrent()) return;

  let filter: HistoryFilter = "all";
  const open = new Set<string>();

  const painted = view.paint(`
    ${liveRegion(LIVE)}
    <div id="ver-root">
      <section aria-labelledby="ver-pending-title">
        <div class="mb-3" id="ver-pending-head"></div>
        <div id="ver-pending"></div>
      </section>
      <section aria-labelledby="ver-history-title" class="mt-10">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          ${blockTitle("ver-history-title", "Histórico")}
          <div id="ver-filter"></div>
        </div>
        <div id="ver-history"></div>
      </section>
    </div>`);
  if (!painted) return;

  const byId = (storeId: string): AdminVerification | undefined => rows.find((r) => r.storeId === storeId);

  function draw(): void {
    const { pending, history } = splitVerificationQueue(rows);
    view.setNavCounts({ approvals: pending.length });

    const head = document.getElementById("ver-pending-head");
    if (head) head.innerHTML = blockTitle("ver-pending-title", "Por aprovar", pending.length, pending.length ? "amber" : "gray");

    const pendingEl = document.getElementById("ver-pending");
    if (pendingEl) {
      pendingEl.innerHTML = pending.length
        ? `<ul role="list" class="space-y-4">${pending.map(pendingCard).join("")}</ul>`
        : `<div class="rounded-2xl border border-gray-200 bg-white">${emptyState("task_alt", "Não há pedidos por aprovar.", "Quando um Dono enviar os dados da empresa, o pedido aparece aqui.")}</div>`;
    }

    const counts = {
      all: history.length,
      approved: history.filter((v) => v.status === "approved").length,
      rejected: history.filter((v) => v.status === "rejected").length,
    };
    const filterEl = document.getElementById("ver-filter");
    if (filterEl && !filterEl.hasChildNodes()) {
      filterEl.innerHTML = filterChips("ver-history", "Filtrar o histórico", [
        { value: "all", label: "Todos", count: counts.all },
        { value: "approved", label: "Aprovados", count: counts.approved },
        { value: "rejected", label: "Rejeitados", count: counts.rejected },
      ], filter);
      bindChips("ver-history", (value) => { filter = value as HistoryFilter; draw(); });
    } else {
      updateChipCounts("ver-history", counts);
    }

    const shown = filterVerificationHistory(history, filter);
    const historyEl = document.getElementById("ver-history");
    if (historyEl) {
      historyEl.innerHTML = shown.length
        ? `<ul role="list" class="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">${shown.map((v) => historyRow(v, open.has(v.storeId))).join("")}</ul>`
        : `<div class="rounded-2xl border border-gray-200 bg-white">${emptyState("history", history.length ? "Nenhum pedido com este estado." : "Ainda não há decisões.")}</div>`;
    }
  }

  /** Relê o pedido depois de uma decisão e diz o que aconteceu aos pagamentos digitais. */
  async function afterDecision(storeId: string, expected: "approved" | "rejected"): Promise<void> {
    // A releitura corre num clique, fora do `try` de `renderAdminPanel`: uma
    // leitura falhada lança (`readOrThrow`) e, sem isto, o Administrador ficava
    // sem resposta nenhuma depois de decidir.
    let fresh: AdminVerification | null;
    try {
      fresh = await getVerification(storeId);
    } catch (err) {
      if (!view.isCurrent()) return;
      draw();
      const msg = `A decisão foi gravada, mas não foi possível reler o pedido. ${err instanceof Error ? err.message : "Atualize a página."}`;
      toast(msg, "error");
      announce(LIVE, msg);
      return;
    }
    if (!view.isCurrent()) return;
    if (!fresh) {
      draw();
      const msg = "A decisão foi gravada, mas não foi possível reler o pedido. Atualize a página.";
      toast(msg, "error");
      announce(LIVE, msg);
      return;
    }
    rows = rows.some((r) => r.storeId === storeId)
      ? rows.map((r) => (r.storeId === storeId ? fresh : r))
      : [...rows, fresh];
    draw();

    const name = fresh.storeName || "sem nome";
    const asExpected = expected === "approved" ? fresh.digitalPayments : !fresh.digitalPayments;
    const msg = expected === "approved"
      ? asExpected
        ? `Pedido da loja «${name}» aprovado. Os pagamentos digitais da loja foram ligados.`
        : `O pedido da loja «${name}» ficou aprovado, mas os pagamentos digitais continuam desligados. Confirme que a migração 0023 está aplicada.`
      : asExpected
        ? `Pedido da loja «${name}» rejeitado. Os pagamentos digitais da loja estão desligados.`
        : `O pedido da loja «${name}» ficou rejeitado, mas os pagamentos digitais continuam ligados. Confirme que a migração 0023 está aplicada.`;
    toast(msg, asExpected ? "success" : "error");
    announce(LIVE, msg);
  }

  async function approve(v: AdminVerification): Promise<void> {
    const missing = missingForApproval(v);
    if (missing.length) {
      toast(`Não pode ser aprovado. Falta: ${missing.join(", ")}.`, "error");
      return;
    }
    const confirmed = await openDialog({
      title: "Aprovar os pagamentos digitais?",
      body: `<p>A loja <strong>${esc(v.storeName || "sem nome")}</strong> passa a poder receber por Multicaixa Express e Referência Bancária, e o dinheiro das vendas vai para esta conta:</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-gray-50 px-4 py-3">
          <dt class="text-gray-600">Empresa</dt><dd class="font-semibold text-gray-900 break-words">${esc(v.companyName)}</dd>
          <dt class="text-gray-600">NIF</dt><dd class="font-mono text-gray-900 break-words">${esc(v.companyNif)}</dd>
          <dt class="text-gray-600">Titular</dt><dd class="font-semibold text-gray-900 break-words">${esc(v.beneficiaryName)}</dd>
          <dt class="text-gray-600">IBAN</dt><dd class="font-mono text-gray-900 break-words">${esc(formatIban(v.iban))}</dd>
        </dl>
        <p>Confirme que abriu a matrícula e a certidão e que os dados coincidem.</p>
        ${PAYMENTS_PROVIDER_READY ? "" : `<p class="text-gray-600">Os pagamentos online ainda não estão ligados na plataforma: até lá o checkout da loja continua só com WhatsApp, e a aprovação fica feita para quando estiverem.</p>`}`,
      confirmLabel: "Aprovar",
      tone: "success",
    });
    if (!confirmed) return;
    const result = await withBusy(() => adminApproveVerification(v.storeId), "A aprovar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    await afterDecision(v.storeId, "approved");
  }

  async function reject(v: AdminVerification): Promise<void> {
    const wasApproved = v.status === "approved";
    const answer = await openDialog({
      title: wasApproved ? "Rejeitar um pedido já aprovado?" : "Rejeitar o pedido?",
      body: `<p>Loja <strong>${esc(v.storeName || "sem nome")}</strong>${v.companyName ? ` · ${esc(v.companyName)}` : ""}.</p>
        <p>${wasApproved
          ? "A loja deixa de poder receber pagamentos digitais a partir de agora."
          : "Os pagamentos digitais da loja ficam desligados."} O Dono vê o motivo no painel dele e pode corrigir os dados e enviar de novo.</p>`,
      confirmLabel: "Rejeitar pedido",
      tone: "danger",
      fields: [{
        id: "reason",
        label: "Motivo da rejeição",
        kind: "textarea",
        hint: `Pelo menos ${REJECTION_REASON_MIN} caracteres. Diga o que está errado e o que o Dono deve corrigir.`,
        placeholder: "Ex.: O NIF indicado não coincide com o da certidão.",
        maxLength: REJECTION_REASON_MAX,
        counter: true,
        validate: (value) => {
          const checked = validateRejectionReason(value);
          return checked.ok ? null : checked.message;
        },
      }],
    });
    if (!answer) return;
    const result = await withBusy(() => adminRejectVerification(v.storeId, answer.values.reason ?? ""), "A rejeitar…");
    if (!result.ok) {
      toast(result.message, "error");
      announce(LIVE, result.message);
      return;
    }
    await afterDecision(v.storeId, "rejected");
  }

  document.getElementById("ver-root")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn || btn.disabled) return;
    const v = byId(btn.dataset.store ?? "");
    if (!v) return;
    const act = btn.dataset.act;
    if (act === "doc") {
      const path = v.documents[btn.dataset.doc as CompanyDocumentId];
      if (path) void openDocument(path);
    } else if (act === "approve") {
      void approve(v);
    } else if (act === "reject") {
      void reject(v);
    } else if (act === "toggle") {
      if (open.has(v.storeId)) open.delete(v.storeId);
      else open.add(v.storeId);
      draw();
      // O redesenho substitui o botão: o foco volta ao novo, no mesmo sítio.
      document.querySelector<HTMLButtonElement>(`button[data-act="toggle"][data-store="${CSS.escape(v.storeId)}"]`)?.focus();
    }
  });

  draw();
}
