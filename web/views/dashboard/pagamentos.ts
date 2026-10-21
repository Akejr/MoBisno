/**
 * Separador «Pagamentos» do Dashboard do Dono.
 *
 * Três partes, por esta ordem:
 *  1. **WhatsApp** — sempre ativo, em todas as lojas; só o número se configura.
 *  2. **Pagamentos digitais** (Multicaixa Express e Referência Bancária) — para
 *     empresas registadas. O Dono envia os dados e os documentos da empresa, a
 *     MôBisno aprova no Painel de Administração, e a aprovação liga
 *     `stores.digital_payments` (migração 0023). O estado não é do Dono: ele só
 *     envia, e alterar dados aprovados devolve o pedido a «Em análise».
 *  3. **Vendas e levantamentos** — só quando os pagamentos digitais estão
 *     visíveis na loja, ou quando já há vendas ou levantamentos para mostrar.
 *
 * Saíram daqui o interruptor «Pagamentos online», os campos da MoMenu e todas
 * as escritas do espelho `custom.payments`: quem decide se o checkout mostra os
 * pagamentos digitais é `digitalPaymentsVisible`, e mais ninguém.
 */
import { esc, formatKz, toast, withButton } from "../../lib/dom.js";
import { getCustomization, saveCustomization } from "../../supabase/customization.js";
import {
  deleteOrder, getOrderStats, getPaymentVerification, listOrders, submitPaymentVerification, uploadCompanyDocument,
} from "../../supabase/payments.js";
import { saveVeroCredentials } from "../../supabase/payments.js";
import {
  listWhatsappOrders, setWhatsappOrderHandled, deleteWhatsappOrder, pendingWhatsappCount,
  type WhatsappOrderRow,
} from "../../supabase/whatsappOrders.js";
import { committedWithdrawals, listWithdrawals, requestWithdrawal, type WithdrawalAccount } from "../../supabase/withdrawals.js";
import { PAYMENTS_PROVIDER_READY, isValidAoPhone } from "../../../src/services/payments.js";
import { digitalPaymentsVisible } from "../../../src/services/paymentVisibility.js";
import {
  COMPANY_DOCUMENTS, changeRequiresReview, formatIban, maskIban, validateVerification,
  type CompanyDocumentId, type VerificationField, type VerificationForm,
} from "../../../src/services/paymentVerification.js";
import type { DashCtx } from "./context.js";
import { BTN_SECONDARY, BTN_SM, card, cardHead, emptyState, icon, pageIntro, pill, plural } from "./ui.js";
import {
  DIGITAL_PAYMENTS_INTRO, FEE_NOTE, docSlotHtml, formatAoPhone, invoicingCardHtml, orderRowHtml, salesSummaryHtml,
  verificationErrorsHtml, verificationFormHtml, verificationNoticeHtml, verificationStatusPill,
  verificationSummaryHtml, whatsappCardHtml, whatsappOrdersHtml, whatsappPrefill, withdrawalRowHtml,
  type DocUploadState,
} from "./markup.js";
import { inputValue, setFieldError } from "./forms.js";

/** Teto de vendas lidas para a lista (as mais recentes). */
const ORDERS_LIMIT = 100;

/** Vendas por página. */
const PAGE = 8;

/** Campos do formulário, pela ordem do ecrã: é por esta ordem que o foco procura o primeiro erro. */
const VF_FIELDS: readonly VerificationField[] = ["companyName", "companyNif", "bankName", "beneficiaryName", "iban", "matricula", "certidao"];

/** Campos de texto do formulário (os documentos são carregados à parte). */
const VF_TEXT = ["companyName", "companyNif", "bankName", "beneficiaryName", "iban"] as const;

export async function renderPagamentos(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store, ownerId } = ctx;
  // Seis leituras independentes, numa onda só.
  const [customLida, verificacao, orders, withdrawals, stats, committed, waOrders] = await Promise.all([
    getCustomization(store.id),
    getPaymentVerification(store.id),
    listOrders(store.id, ORDERS_LIMIT),
    listWithdrawals(store.id),
    getOrderStats(store.id),
    committedWithdrawals(store.id),
    listWhatsappOrders(store.id),
  ]);
  let custom = customLida;
  const digitalVisible = digitalPaymentsVisible(store);
  const mostrarVendas = digitalVisible || orders.length > 0 || withdrawals.length > 0;
  const available = Math.max(0, Math.round((stats.netReceived - committed) * 100) / 100);
  // O levantamento vai para a conta APROVADA. Com dados novos à espera de
  // aprovação, não há conta verificada para onde mandar o dinheiro.
  const conta: WithdrawalAccount | null = verificacao.status === "approved"
    ? { bankName: verificacao.bankName, beneficiaryName: verificacao.beneficiaryName, iban: verificacao.iban }
    : null;

  const vendasHtml = mostrarVendas ? `
    ${card(`
      ${cardHead({
        icon: "receipt_long", title: "Vendas", subtitle: "Pagamentos por Multicaixa Express e Referência Bancária.",
        aside: `<span id="orders-count" class="text-sm text-gray-500">${esc(plural(orders.length, "registo", "registos"))}</span>`,
      })}
      ${salesSummaryHtml({ stats, available, account: conta ? { bankName: conta.bankName, iban: conta.iban } : null })}
      <div class="mt-6 -mx-5 md:-mx-6 border-t border-gray-100">
        <ul id="orders-list"></ul>
        <div id="orders-pager" class="px-5 md:px-6 pt-3 flex flex-wrap items-center justify-between gap-2 text-sm empty:hidden"></div>
      </div>`)}
    ${card(`
      ${cardHead({ icon: "account_balance", title: "Levantamentos", subtitle: "Pedidos de transferência do saldo para a conta da empresa." })}
      ${withdrawals.length
        ? `<ul class="mt-4 -mx-5 md:-mx-6 border-t border-gray-100 divide-y divide-gray-100">${withdrawals.map(withdrawalRowHtml).join("")}</ul>`
        : emptyState({ icon: "account_balance", title: "Ainda não pediu nenhum levantamento", text: "Os pedidos aparecem aqui, com o estado de cada um." })}`)}` : "";

  /*
   * As encomendas por WhatsApp aparecem **sempre**, e primeiro: são as vendas
   * de toda a loja desde o primeiro dia, e numa loja sem pagamentos digitais são
   * as únicas que existem. Antes, uma loja dessas só via cartões de saldo e de
   * levantamentos que nunca iam ter um número diferente de zero.
   */
  const porTratar = pendingWhatsappCount(waOrders);
  const waHtml = card(`
    ${cardHead({
      icon: "chat", title: "Encomendas por WhatsApp",
      subtitle: "Quem tocou em «Finalizar via WhatsApp», e o que tinha no carrinho.",
      aside: porTratar > 0 ? pill(`${porTratar} por tratar`, "warning") : pill(plural(waOrders.length, "encomenda", "encomendas"), "neutral"),
    })}
    <div id="wa-list">${whatsappOrdersHtml(waOrders)}</div>`);

  // A faturação só faz sentido depois de a empresa estar aprovada: é a empresa
  // dela que emite a fatura.
  const faturacaoHtml = verificacao.status === "approved"
    ? invoicingCardHtml({ orgId: verificacao.veroOrgId, hasKey: verificacao.veroKeySaved, isTestKey: verificacao.veroTestKey })
    : "";

  const pintado = ctx.paint(`
    ${pageIntro("Como os clientes pagam e para onde vai o dinheiro.")}
    <div class="space-y-6">
      ${whatsappCardHtml(whatsappPrefill(custom))}
      ${waHtml}
      ${card(`
        ${cardHead({ icon: "credit_card", title: "Pagamentos digitais", subtitle: "Multicaixa Express e Referência Bancária", aside: verificationStatusPill(verificacao.status) })}
        <p class="mt-4 text-sm text-gray-700">${esc(DIGITAL_PAYMENTS_INTRO)}</p>
        <p class="mt-3 text-sm text-gray-700">${esc(FEE_NOTE)}</p>
        <div id="vf-body" class="mt-5"></div>`)}
      ${faturacaoHtml}
      ${vendasHtml}
    </div>`);
  if (!pintado) return;

  ligarWhatsapp();
  ligarEncomendasWhatsapp();
  ligarVerificacao();
  if (faturacaoHtml) ligarFaturacao();
  if (mostrarVendas) ligarVendas();

  /**
   * Lista das encomendas por WhatsApp: abrir o detalhe, marcar como tratada e
   * apagar. O estado em memória é a fonte da contagem, para o ecrã ficar
   * coerente sem recarregar.
   */
  function ligarEncomendasWhatsapp(): void {
    const lista = document.getElementById("wa-list");
    if (!lista) return;
    const redesenhar = (): void => {
      lista.innerHTML = whatsappOrdersHtml(waOrders);
    };
    lista.addEventListener("click", async (e) => {
      const alvo = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-wa-toggle],[data-wa-handled],[data-wa-del]");
      if (!alvo) return;
      const abrir = alvo.dataset.waToggle;
      if (abrir) {
        const aberto = alvo.getAttribute("aria-expanded") === "true";
        alvo.setAttribute("aria-expanded", String(!aberto));
        document.getElementById(`wa-detail-${abrir}`)?.classList.toggle("hidden", aberto);
        return;
      }
      const tratar = alvo.dataset.waHandled;
      if (tratar) {
        const linha = waOrders.find((o) => o.id === tratar);
        if (!linha) return;
        const novo = !linha.handled;
        const ok = await withButton(alvo, () => setWhatsappOrderHandled(tratar, novo), "A guardar…");
        if (!ok) { toast("Não foi possível guardar.", "error"); return; }
        linha.handled = novo;
        redesenhar();
        return;
      }
      const apagar = alvo.dataset.waDel;
      if (!apagar) return;
      if (!confirm("Apagar este registo de encomenda? A conversa no WhatsApp não é afetada, mas o registo desaparece para sempre.")) return;
      const ok = await withButton(alvo, () => deleteWhatsappOrder(apagar), "A apagar…");
      if (!ok) { toast("Não foi possível apagar.", "error"); return; }
      const i = waOrders.findIndex((o) => o.id === apagar);
      if (i >= 0) waOrders.splice(i, 1);
      toast("Registo apagado.");
      redesenhar();
    });
  }

  /**
   * Credenciais Vero da empresa: a chave só vai para cima quando o Dono escreve
   * uma nova (um campo vazio mantém a que está guardada, e o painel nunca a
   * recebe de volta).
   */
  function ligarFaturacao(): void {
    const erro = document.getElementById("vero-error");
    const limpar = (): void => { if (erro) erro.textContent = ""; };
    document.getElementById("vero-org")?.addEventListener("input", limpar);
    document.getElementById("vero-key")?.addEventListener("input", limpar);
    document.getElementById("vero-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgId = inputValue("vero-org").trim();
      const chave = inputValue("vero-key");
      if (orgId && !verificacao.veroKeySaved && chave.trim() === "") {
        if (erro) erro.textContent = "Indique também a chave secreta do Vero.";
        document.getElementById("vero-key")?.focus();
        return;
      }
      const botao = document.getElementById("save-vero") as HTMLButtonElement | null;
      const falha = await withButton(
        botao,
        () => saveVeroCredentials(store.id, { orgId, apiKey: chave.trim() === "" ? null : chave.trim() }),
        "A guardar…",
      );
      if (falha) { if (erro) erro.textContent = falha; return; }
      toast("Faturação guardada.");
      await renderPagamentos(ctx);
    });
    document.getElementById("clear-vero")?.addEventListener("click", async (e) => {
      if (!confirm("Desligar a faturação automática? As vendas continuam a funcionar, mas deixam de gerar fatura.")) return;
      const falha = await withButton(e.currentTarget as HTMLButtonElement, () => saveVeroCredentials(store.id, { orgId: "", apiKey: "" }), "A desligar…");
      if (falha) { toast(falha, "error"); return; }
      toast("Faturação desligada.");
      await renderPagamentos(ctx);
    });
  }

  /** Número de WhatsApp: validado e gravado no formato com indicativo. */
  function ligarWhatsapp(): void {
    document.getElementById("wa-phone")?.addEventListener("input", () => setFieldError("wa-phone", null));
    document.getElementById("wa-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const bruto = inputValue("wa-phone").trim();
      if (!isValidAoPhone(bruto)) {
        setFieldError("wa-phone", "Indique um número angolano válido: 9 algarismos, a começar por 9.");
        document.getElementById("wa-phone")?.focus();
        return;
      }
      const phone = formatAoPhone(bruto);
      const next = { ...custom, whatsapp: { ...(custom.whatsapp ?? {}), phone } };
      const botao = document.getElementById("save-wa") as HTMLButtonElement | null;
      const ok = await withButton(botao, () => saveCustomization(ownerId, store.id, next), "A guardar…");
      if (!ok) { toast("Não foi possível guardar o número.", "error"); return; }
      custom = next;
      const campo = document.getElementById("wa-phone") as HTMLInputElement | null;
      if (campo) campo.value = phone;
      toast("Número de WhatsApp guardado.");
    });
  }

  /**
   * Verificação de empresa: formulário, resumo e envio.
   *
   * O formulário aparece quando ainda não houve envio, quando foi rejeitado
   * (para corrigir e enviar de novo) e quando o Dono pede para alterar dados
   * aprovados. «Em análise» é só leitura: o pedido está nas mãos da MôBisno.
   */
  function ligarVerificacao(): void {
    const corpo = document.getElementById("vf-body");
    if (!corpo) return;
    const v = verificacao;
    let editando = false;
    const rascunhoInicial = (): VerificationForm => ({
      companyName: v.companyName, companyNif: v.companyNif, bankName: v.bankName,
      beneficiaryName: v.beneficiaryName, iban: v.iban,
      documents: { matricula: v.documents.matricula, certidao: v.documents.certidao },
    });
    const docsIniciais = (): Record<CompanyDocumentId, DocUploadState> => ({
      matricula: { busy: false, error: null, fileName: null },
      certidao: { busy: false, error: null, fileName: null },
    });
    let rascunho = rascunhoInicial();
    let docs = docsIniciais();

    const desenhar = (): void => {
      const formulario = v.status === "none" || v.status === "rejected" || editando;
      const aviso = verificationNoticeHtml(v, { providerReady: PAYMENTS_PROVIDER_READY, digitalVisible });
      corpo.innerHTML = formulario
        ? `${aviso && !editando ? `<div class="mb-5">${aviso}</div>` : ""}${verificationFormHtml({ draft: rascunho, status: v.status, docs, editing: editando })}`
        : `<div class="mb-5">${aviso}</div>
           ${verificationSummaryHtml(v)}
           ${v.status === "approved" ? `<div class="mt-5 flex flex-wrap items-center gap-3">
             <button type="button" id="vf-edit" aria-describedby="vf-edit-note" class="${BTN_SECONDARY}">${icon("edit", "text-[18px]")} Alterar dados</button>
             ${changeRequiresReview(v.status) ? `<p id="vf-edit-note" class="text-xs text-gray-600">Alterar dados aprovados volta a pôr o pedido «Em análise» até a MôBisno aprovar outra vez.</p>` : ""}
           </div>` : ""}`;
    };

    /** Redesenha só a caixa de um documento: o resto do formulário fica como está. */
    const redesenharDoc = (id: CompanyDocumentId): void => {
      const doc = COMPANY_DOCUMENTS.find((d) => d.id === id);
      const caixa = document.getElementById(`vf-${id}-slot`);
      if (doc && caixa) caixa.outerHTML = docSlotHtml(doc, rascunho.documents[id] ?? null, docs[id]);
    };

    /**
     * Carrega um documento assim que é escolhido. Cada envio é um ficheiro
     * novo no armazenamento privado; o caminho só entra no pedido ao enviar.
     */
    const carregar = async (id: CompanyDocumentId, file: File): Promise<void> => {
      docs[id] = { busy: true, error: null, fileName: null };
      redesenharDoc(id);
      const r = await uploadCompanyDocument(store.id, id, file);
      if (r.ok) {
        rascunho.documents[id] = r.path;
        docs[id] = { busy: false, error: null, fileName: file.name };
      } else {
        docs[id] = { busy: false, error: r.message, fileName: null };
      }
      redesenharDoc(id);
      document.getElementById(`vf-${id}`)?.focus();
    };

    const enviar = async (): Promise<void> => {
      if (Object.values(docs).some((d) => d.busy)) {
        toast("Aguarde que os documentos acabem de carregar.", "error");
        return;
      }
      for (const f of VF_FIELDS) setFieldError(`vf-${f}`, null);
      const resumo = document.getElementById("vf-summary");
      // Todos os erros de uma vez: o Dono corrige o formulário numa passagem.
      const r = validateVerification(rascunho);
      if (!r.ok) {
        for (const erro of r.errors) setFieldError(`vf-${erro.field}`, erro.message);
        if (resumo) resumo.innerHTML = verificationErrorsHtml(r.errors);
        const primeiro = VF_FIELDS.find((f) => r.errors.some((erro) => erro.field === f));
        if (primeiro) document.getElementById(`vf-${primeiro}`)?.focus();
        return;
      }
      if (resumo) resumo.innerHTML = "";
      if (editando && changeRequiresReview(v.status)
        && !confirm("Os dados aprovados vão voltar a ser analisados, e os pagamentos digitais ficam suspensos até a MôBisno aprovar outra vez. Enviar mesmo assim?")) {
        return;
      }
      const botao = document.getElementById("vf-submit") as HTMLButtonElement | null;
      const falha = await withButton(botao, () => submitPaymentVerification(store.id, r.value), "A enviar…");
      if (falha) { toast(falha, "error"); return; }
      toast("Pedido enviado. A equipa MôBisno vai analisar os dados da empresa.");
      await renderPagamentos(ctx);
    };

    desenhar();

    // Ouvintes no contentor: o formulário é redesenhado (alterar, cancelar) e eles ficam.
    corpo.addEventListener("click", (e) => {
      const alvo = (e.target as HTMLElement).closest<HTMLElement>("#vf-edit,#vf-cancel,[data-focus]");
      if (!alvo) return;
      if (alvo.id === "vf-edit") {
        editando = true;
        desenhar();
        document.getElementById("vf-companyName")?.focus();
      } else if (alvo.id === "vf-cancel") {
        editando = false;
        rascunho = rascunhoInicial();
        docs = docsIniciais();
        desenhar();
        document.getElementById("vf-edit")?.focus();
      } else if (alvo.dataset.focus) {
        document.getElementById(alvo.dataset.focus)?.focus();
      }
    });
    corpo.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      const campo = VF_TEXT.find((f) => t.id === `vf-${f}`);
      if (!campo) return;
      rascunho[campo] = t.value;
      setFieldError(t.id, null);
    });
    corpo.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "vf-iban") {
        // Em grupos de quatro ao sair do campo; durante a escrita, o cursor fica onde está.
        t.value = formatIban(t.value);
        rascunho.iban = t.value;
        return;
      }
      const doc = t.dataset.doc as CompanyDocumentId | undefined;
      const file = t.files?.[0];
      if (doc && file) void carregar(doc, file);
    });
    corpo.addEventListener("submit", (e) => {
      e.preventDefault();
      void enviar();
    });
  }

  /** Lista de vendas (paginada), apagar referências expiradas e pedir levantamento. */
  function ligarVendas(): void {
    const lista = document.getElementById("orders-list");
    const pager = document.getElementById("orders-pager");
    let pagina = 0;

    const desenhar = (): void => {
      if (!lista || !pager) return;
      if (!orders.length) {
        lista.innerHTML = `<li>${emptyState({
          icon: "receipt_long", title: "Ainda não há vendas",
          text: "Cada pagamento por Multicaixa Express ou Referência Bancária aparece aqui, com o valor líquido e a fatura.",
        })}</li>`;
        pager.innerHTML = "";
        return;
      }
      const paginas = Math.ceil(orders.length / PAGE);
      pagina = Math.max(0, Math.min(pagina, paginas - 1));
      lista.innerHTML = orders.slice(pagina * PAGE, pagina * PAGE + PAGE).map(orderRowHtml).join("");
      pager.innerHTML = paginas > 1 ? `
        <span class="text-gray-500">Página ${pagina + 1} de ${paginas}</span>
        <div class="flex gap-2">
          <button type="button" data-pg="prev" ${pagina === 0 ? "disabled" : ""} class="${BTN_SM}">Anterior</button>
          <button type="button" data-pg="next" ${pagina >= paginas - 1 ? "disabled" : ""} class="${BTN_SM}">Seguinte</button>
        </div>` : "";
    };

    /**
     * Apaga uma referência expirada e deixa o ecrã coerente sem recarregar: a
     * lista em memória é a fonte da contagem e da paginação. Só as expiradas são
     * apagáveis (`canDeleteOrder`), e a guarda de verdade é a política de
     * `delete` da base de dados (migração 0021).
     */
    const apagarVenda = async (btn: HTMLButtonElement): Promise<void> => {
      const id = btn.dataset.orderDel;
      if (!id) return;
      if (!confirm("Apagar este registo de referência expirada? A tentativa de compra deixa de aparecer nas suas vendas, para sempre, e não é possível recuperá-la.")) return;
      const apagado = await withButton(btn, () => deleteOrder(id), "A apagar…");
      if (!apagado) { toast("Não foi possível apagar este registo.", "error"); return; }
      const i = orders.findIndex((o) => o.id === id);
      if (i >= 0) orders.splice(i, 1);
      const contador = document.getElementById("orders-count");
      if (contador) contador.textContent = plural(orders.length, "registo", "registos");
      toast("Registo apagado.");
      desenhar();
    };

    desenhar();

    pager?.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pg]");
      if (!b || b.disabled) return;
      pagina += b.dataset.pg === "next" ? 1 : -1;
      desenhar();
      lista?.querySelector<HTMLElement>("[data-order-toggle]")?.focus();
    });
    lista?.addEventListener("click", (e) => {
      const alvo = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-order-toggle],[data-order-del]");
      if (!alvo) return;
      if (alvo.dataset.orderToggle) {
        const aberto = alvo.getAttribute("aria-expanded") === "true";
        alvo.setAttribute("aria-expanded", String(!aberto));
        document.getElementById(`order-detail-${alvo.dataset.orderToggle}`)?.classList.toggle("hidden", aberto);
        return;
      }
      void apagarVenda(alvo);
    });

    const levantar = document.getElementById("request-withdraw") as HTMLButtonElement | null;
    levantar?.addEventListener("click", async () => {
      if (available <= 0 || !conta) return;
      const destino = `${maskIban(conta.iban)}${conta.bankName ? ` (${conta.bankName})` : ""}`;
      if (!confirm(`Pedir o levantamento de ${formatKz(available)} para a conta ${destino}?`)) return;
      const ok = await withButton(levantar, () => requestWithdrawal(store.id, ownerId, available, conta), "A enviar o pedido…");
      if (!ok) { toast("Não foi possível enviar o pedido de levantamento.", "error"); return; }
      toast("Pedido de levantamento enviado. A equipa MôBisno trata dele.");
      await renderPagamentos(ctx);
    });
  }
}
