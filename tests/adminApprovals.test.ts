/**
 * As decisões do Administrador no Painel_Admin, como funções puras
 * (`src/services/adminMetrics.ts`):
 *
 *  - **aprovar e rejeitar** uma verificação de empresa — o que se grava em
 *    `store_payments`, e que um motivo de rejeição curto não passa;
 *  - **a fila de aprovações** — em análise primeiro, o mais antigo à frente;
 *  - **ativar e desativar** uma subscrição à mão — com a semântica de
 *    `planActivationPatch` (os meses somam-se ao fim do período em curso);
 *  - **os números da Visão geral** — `overviewKpis`, sem lojas-modelo nem contas
 *    de administração.
 *
 * `web/supabase/admin.ts` grava exatamente o que estas funções devolvem; não pode
 * ser importado daqui (o cliente do Supabase precisa do navegador), por isso a
 * regra testa-se onde vive.
 */
import { describe, it, expect } from "vitest";
import {
  ACTIVATION_MONTHS,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  accountStatus,
  activationPatch,
  activationQuote,
  approvalPatch,
  deactivationPatch,
  filterVerificationHistory,
  isActivationMonths,
  missingForApproval,
  normalizeRejectionReason,
  overviewKpis,
  rejectionPatch,
  sortVerificationQueue,
  splitVerificationQueue,
  storeStatus,
  validateRejectionReason,
  verificationActions,
  type AdminMetricsInput,
  type VerificationLike,
} from "../src/services/adminMetrics.js";
import { planActivationPatch, resolveBilling } from "../src/services/billing.js";
import { PLAN_PERIOD_DAYS, PLAN_PRICE_KZ } from "../src/services/plans.js";

const AGORA = "2025-01-15T12:00:00.000Z";
const AGORA_MS = Date.parse(AGORA);
const DIA_MS = 86_400_000;
const ADMIN_ID = "3f0c9a52-6f1e-4c55-9d8e-2b7a4c1d9e01";

// ---------------------------------------------------------------------------
// Aprovar
// ---------------------------------------------------------------------------

describe("approvalPatch — o que a aprovação grava", () => {
  it("aprova, assina com o Administrador e a hora, e limpa o motivo de uma rejeição anterior", () => {
    expect(approvalPatch(ADMIN_ID, AGORA)).toEqual({
      ok: true,
      patch: {
        verification_status: "approved",
        reviewed_at: AGORA,
        reviewed_by: ADMIN_ID,
        rejection_reason: null,
      },
    });
  });

  it("aceita o momento como número ou `Date`, e grava sempre ISO", () => {
    const porNumero = approvalPatch(ADMIN_ID, AGORA_MS);
    const porData = approvalPatch(ADMIN_ID, new Date(AGORA_MS));
    expect(porNumero.ok && porNumero.patch.reviewed_at).toBe(AGORA);
    expect(porData.ok && porData.patch.reviewed_at).toBe(AGORA);
  });

  it("sem Administrador identificado não há aprovação", () => {
    for (const semId of [null, undefined, "", "   ", 42]) {
      const r = approvalPatch(semId, AGORA);
      expect(r.ok, String(semId)).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/sessão/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Rejeitar
// ---------------------------------------------------------------------------

describe("validateRejectionReason — o Dono tem de perceber o que corrigir", () => {
  it(`exige pelo menos ${REJECTION_REASON_MIN} caracteres, depois de aparar`, () => {
    expect(REJECTION_REASON_MIN).toBe(10);
    // 9 caracteres: recusado, e a mensagem diz quantos tem.
    const curto = validateRejectionReason("NIF errad");
    expect(curto.ok).toBe(false);
    if (!curto.ok) expect(curto.message).toBe("O motivo tem de ter pelo menos 10 caracteres (tem 9).");
    // 10 caracteres exatos: aceite.
    expect(validateRejectionReason("NIF errado")).toEqual({ ok: true, value: "NIF errado" });
    // Espaços nas pontas não contam para o mínimo.
    expect(validateRejectionReason("    NIF errad    ").ok).toBe(false);
  });

  it("um motivo vazio, só de espaços ou que não é texto é recusado com a frase própria", () => {
    for (const vazio of ["", "    ", "\n\n\t", null, undefined, 123]) {
      const r = validateRejectionReason(vazio);
      expect(r.ok, JSON.stringify(vazio)).toBe(false);
      if (!r.ok) expect(r.message).toBe("Escreva o motivo da rejeição: o Dono vai lê-lo no painel dele.");
    }
  });

  it(`recusa mais de ${REJECTION_REASON_MAX} caracteres`, () => {
    expect(validateRejectionReason("a".repeat(REJECTION_REASON_MAX)).ok).toBe(true);
    const longo = validateRejectionReason("a".repeat(REJECTION_REASON_MAX + 1));
    expect(longo.ok).toBe(false);
  });

  it("conta caracteres como quem escreve: acentos e emoji contam um", () => {
    // 10 letras com acento: não pode ser recusado por contar unidades de código.
    expect(validateRejectionReason("ÁÉÍÓÚáéíóú").ok).toBe(true);
    // 9 emoji (18 unidades UTF-16) continuam a ser 9 caracteres.
    expect(validateRejectionReason("🙂".repeat(9)).ok).toBe(false);
  });

  it("normaliza espaços sem apagar as mudanças de linha", () => {
    expect(normalizeRejectionReason("  A certidão   está\tcaducada.\r\n\r\n\r\n\r\nEnvie   outra.  "))
      .toBe("A certidão está caducada.\n\nEnvie outra.");
  });
});

describe("rejectionPatch — o que a rejeição grava", () => {
  it("rejeita com o motivo normalizado, assinado com o Administrador e a hora", () => {
    expect(rejectionPatch(ADMIN_ID, "  O NIF não coincide com o da certidão.  ", AGORA)).toEqual({
      ok: true,
      patch: {
        verification_status: "rejected",
        reviewed_at: AGORA,
        reviewed_by: ADMIN_ID,
        rejection_reason: "O NIF não coincide com o da certidão.",
      },
    });
  });

  it("sem motivo válido não há rejeição", () => {
    const r = rejectionPatch(ADMIN_ID, "curto", AGORA);
    expect(r).toEqual({ ok: false, message: "O motivo tem de ter pelo menos 10 caracteres (tem 5)." });
  });

  it("sem Administrador identificado não há rejeição, nem com um motivo válido", () => {
    expect(rejectionPatch("", "O NIF não coincide com o da certidão.", AGORA).ok).toBe(false);
  });
});

describe("missingForApproval — espelho da restrição da base de dados", () => {
  const completo = {
    companyName: "Kianda Comércio, Lda",
    companyNif: "5417123456",
    bankName: "BAI",
    beneficiaryName: "Kianda Comércio, Lda",
    iban: "AO06004400006729503010102",
    documents: { matricula: "loja/matricula-1.pdf", certidao: "loja/certidao-1.pdf" },
  };

  it("um pedido completo não tem nada em falta", () => {
    expect(missingForApproval(completo)).toEqual([]);
  });

  it("diz o que falta, pela ordem do formulário, documentos incluídos", () => {
    expect(missingForApproval({ ...completo, companyNif: "  ", iban: null, documents: { matricula: "x.pdf", certidao: null } }))
      .toEqual(["NIF", "IBAN", "Certidão da empresa"]);
    expect(missingForApproval(null)).toEqual([
      "Nome da empresa", "NIF", "Banco", "Titular da conta", "IBAN", "Matrícula da empresa", "Certidão da empresa",
    ]);
  });
});

describe("verificationActions — as decisões que fazem sentido em cada estado", () => {
  it("em análise aprova-se ou rejeita-se; aprovado só se rejeita; rejeitado só se aprova", () => {
    expect(verificationActions("pending")).toEqual({ approve: true, reject: true });
    expect(verificationActions("approved")).toEqual({ approve: false, reject: true });
    expect(verificationActions("rejected")).toEqual({ approve: true, reject: false });
    expect(verificationActions("none")).toEqual({ approve: false, reject: false });
    expect(verificationActions("qualquer coisa")).toEqual({ approve: false, reject: false });
  });
});

// ---------------------------------------------------------------------------
// A fila de aprovações
// ---------------------------------------------------------------------------

describe("sortVerificationQueue — em análise primeiro, o mais antigo à frente", () => {
  const pedidos: VerificationLike[] = [
    { storeId: "aprovado-antigo", status: "approved", submittedAt: "2024-12-01T00:00:00.000Z", reviewedAt: "2024-12-02T00:00:00.000Z" },
    { storeId: "pendente-recente", status: "pending", submittedAt: "2025-01-14T00:00:00.000Z" },
    { storeId: "rejeitado-recente", status: "rejected", submittedAt: "2025-01-05T00:00:00.000Z", reviewedAt: "2025-01-06T00:00:00.000Z" },
    { storeId: "por-enviar", status: "none" },
    { storeId: "pendente-sem-data", status: "pending", submittedAt: null },
    { storeId: "pendente-antigo", status: "pending", submittedAt: "2025-01-02T00:00:00.000Z" },
    { storeId: "pendente-maiusculas", status: "PENDING", submittedAt: "2025-01-08T00:00:00.000Z" },
  ];

  it("ordena os em análise do mais antigo para o mais recente, com os sem data no fim, e depois o histórico", () => {
    expect(sortVerificationQueue(pedidos).map((p) => p.storeId)).toEqual([
      "pendente-antigo",
      "pendente-maiusculas",
      "pendente-recente",
      "pendente-sem-data",
      // Histórico: a decisão mais recente primeiro.
      "rejeitado-recente",
      "aprovado-antigo",
    ]);
  });

  it("os pedidos «por enviar» não entram em nenhum dos dois grupos", () => {
    const { pending, history } = splitVerificationQueue(pedidos);
    expect(pending.map((p) => p.storeId)).not.toContain("por-enviar");
    expect(history.map((p) => p.storeId)).not.toContain("por-enviar");
    expect(pending).toHaveLength(4);
    expect(history).toHaveLength(2);
  });

  it("a ordem é total: a mesma entrada, por qualquer ordem, dá sempre a mesma fila", () => {
    const empate: VerificationLike[] = [
      { storeId: "b", status: "pending", submittedAt: "2025-01-10T00:00:00.000Z" },
      { storeId: "a", status: "pending", submittedAt: "2025-01-10T00:00:00.000Z" },
      { storeId: "c", status: "pending", submittedAt: "2025-01-10T00:00:00.000Z" },
    ];
    const esperado = ["a", "b", "c"];
    expect(sortVerificationQueue(empate).map((p) => p.storeId)).toEqual(esperado);
    expect(sortVerificationQueue([...empate].reverse()).map((p) => p.storeId)).toEqual(esperado);
  });

  it("não altera a lista recebida e aceita entradas degeneradas", () => {
    const copia = pedidos.map((p) => ({ ...p }));
    sortVerificationQueue(pedidos);
    expect(pedidos).toEqual(copia);
    expect(sortVerificationQueue(null)).toEqual([]);
    expect(sortVerificationQueue([null, { status: "pending" }] as never)).toEqual([]);
  });

  it("o histórico filtra-se pelo estado da decisão, mantendo a ordem", () => {
    const { history } = splitVerificationQueue(pedidos);
    expect(filterVerificationHistory(history, "all").map((p) => p.storeId)).toEqual(["rejeitado-recente", "aprovado-antigo"]);
    expect(filterVerificationHistory(history, "approved").map((p) => p.storeId)).toEqual(["aprovado-antigo"]);
    expect(filterVerificationHistory(history, "rejected").map((p) => p.storeId)).toEqual(["rejeitado-recente"]);
  });
});

// ---------------------------------------------------------------------------
// Ativar e desativar a subscrição à mão
// ---------------------------------------------------------------------------

describe("activationPatch — a semântica de planActivationPatch", () => {
  it("as durações são 1, 3, 6 e 12 meses", () => {
    expect([...ACTIVATION_MONTHS]).toEqual([1, 3, 6, 12]);
    for (const m of ACTIVATION_MONTHS) expect(isActivationMonths(m)).toBe(true);
    for (const outro of [0, 2, -1, 1.5, 24, "3", null]) expect(isActivationMonths(outro)).toBe(false);
  });

  it("sem subscrição em vigor, os meses contam a partir de agora", () => {
    for (const planExpiresAt of [null, "2025-01-01T00:00:00.000Z", "não é data"]) {
      const r = activationPatch({ planExpiresAt }, 3, AGORA);
      expect(r).toEqual({ ok: true, patch: { plan_expires_at: new Date(AGORA_MS + 3 * PLAN_PERIOD_DAYS * DIA_MS).toISOString() } });
    }
  });

  it("com subscrição em vigor, os meses somam-se ao fim do período atual — ninguém perde dias", () => {
    const fim = "2025-02-01T00:00:00.000Z";
    const r = activationPatch({ planExpiresAt: fim }, 6, AGORA);
    expect(r).toEqual({ ok: true, patch: { plan_expires_at: new Date(Date.parse(fim) + 6 * PLAN_PERIOD_DAYS * DIA_MS).toISOString() } });
  });

  it("é exatamente `planActivationPatch`, para todas as durações e estados", () => {
    for (const planExpiresAt of [null, "2025-01-10T00:00:00.000Z", "2025-03-01T00:00:00.000Z"]) {
      for (const m of ACTIVATION_MONTHS) {
        const r = activationPatch({ planExpiresAt }, m, AGORA);
        expect(r.ok && r.patch).toEqual(planActivationPatch({ planExpiresAt }, AGORA_MS, m));
      }
    }
  });

  it("recusa uma duração fora da lista, em vez de a arredondar", () => {
    for (const outro of [0, 2, 1.5, -12, "12", undefined]) {
      expect(activationPatch({ planExpiresAt: null }, outro, AGORA)).toEqual({
        ok: false,
        message: "Escolha uma duração de 1, 3, 6 ou 12 meses.",
      });
    }
  });

  it("nunca grava a concessão de cem anos de antes: 12 meses é o máximo", () => {
    const r = activationPatch({ planExpiresAt: null }, 12, AGORA);
    expect(r.ok && Date.parse(r.patch.plan_expires_at) - AGORA_MS).toBe(12 * PLAN_PERIOD_DAYS * DIA_MS);
  });

  it("o preço de cada duração sai do plano único", () => {
    expect(activationQuote(1)).toEqual({ months: 1, days: PLAN_PERIOD_DAYS, amountKz: PLAN_PRICE_KZ });
    expect(activationQuote(12)).toEqual({ months: 12, days: 12 * PLAN_PERIOD_DAYS, amountKz: 12 * PLAN_PRICE_KZ });
  });
});

describe("deactivationPatch — o período termina agora", () => {
  it("grava o momento atual, e a conta deixa de estar ativa nesse instante", () => {
    const patch = deactivationPatch(AGORA);
    expect(patch).toEqual({ plan_expires_at: AGORA });
    const depois = resolveBilling({ planExpiresAt: patch.plan_expires_at }, AGORA_MS);
    expect(depois.accessActive).toBe(false);
    expect(depois.suspended).toBe(true);
    expect(accountStatus({ planExpiresAt: patch.plan_expires_at }, AGORA).kind).toBe("expired");
  });
});

describe("accountStatus — o selo de cada conta em «Contas»", () => {
  it("distingue administrador, ativa, a terminar, expirada e sem subscrição", () => {
    expect(accountStatus({ isAdmin: true, planExpiresAt: null }, AGORA).kind).toBe("admin");
    expect(accountStatus({ planExpiresAt: "2025-03-01T00:00:00.000Z" }, AGORA)).toEqual({
      kind: "active",
      expiresAt: "2025-03-01T00:00:00.000Z",
      daysRemaining: 45,
      expiredAt: null,
    });
    expect(accountStatus({ planExpiresAt: "2025-01-18T12:00:00.000Z" }, AGORA).kind).toBe("expiring");
    expect(accountStatus({ planExpiresAt: "2025-01-02T00:00:00.000Z" }, AGORA)).toEqual({
      kind: "expired",
      expiresAt: null,
      daysRemaining: null,
      expiredAt: "2025-01-02T00:00:00.000Z",
    });
    expect(accountStatus({ planExpiresAt: null }, AGORA).kind).toBe("none");
    expect(accountStatus({ planExpiresAt: "lixo" }, AGORA).kind).toBe("none");
    expect(accountStatus(null, AGORA).kind).toBe("none");
  });
});

describe("storeStatus — o que o público vê", () => {
  it("publicada e com dono ativo está no ar; sem dono ativo está fora do ar; o resto é rascunho", () => {
    expect(storeStatus("Publicada", true)).toBe("online");
    expect(storeStatus("Publicada", false)).toBe("offline");
    expect(storeStatus("Rascunho", true)).toBe("draft");
    expect(storeStatus("Rascunho", false)).toBe("draft");
    expect(storeStatus(null, true)).toBe("draft");
  });
});

// ---------------------------------------------------------------------------
// Os números da Visão geral
// ---------------------------------------------------------------------------

describe("overviewKpis — os cinco números do topo, sem lojas-modelo nem administração", () => {
  const instantaneo: AdminMetricsInput = {
    now: AGORA,
    accounts: [
      { id: "ana", planExpiresAt: "2025-03-01T00:00:00.000Z" },
      { id: "bento", planExpiresAt: "2025-01-18T00:00:00.000Z" },
      { id: "carla", planExpiresAt: "2024-12-01T00:00:00.000Z" },
      { id: "dino", planExpiresAt: null },
      // Administrador: não é cliente.
      { id: "admin", isAdmin: true, planExpiresAt: null },
    ],
    stores: [
      { id: "l-ana", ownerId: "ana", identifier: "kianda", state: "Publicada" },
      { id: "l-bento", ownerId: "bento", identifier: "ekolo", state: "Publicada" },
      // Publicada de uma conta caducada: conta como publicada e está fora do ar.
      { id: "l-carla", ownerId: "carla", identifier: "nzila", state: "Publicada" },
      // Rascunho de uma conta sem subscrição: nem publicada, nem suspensa.
      { id: "l-dino", ownerId: "dino", identifier: "muxima", state: "Rascunho" },
      // Lojas-modelo pelas três marcas: nenhuma conta.
      { id: "m-1", ownerId: "admin", identifier: "modelo-lumiere", state: "Publicada" },
      { id: "m-2", ownerId: "carla", identifier: "loja-x", state: "Publicada", customization: { __template: true } },
      { id: "m-3", ownerId: "dino", identifier: "loja-y", state: "Publicada", isModel: true },
    ],
    transactions: [
      { id: "p-1", service: "plan", ownerId: "ana", status: "paid", amount: 10_000, paidAt: "2025-01-03T00:00:00.000Z" },
      { id: "p-2", service: "plan", ownerId: "bento", status: "paid", amount: "30000", paidAt: "2025-01-04T00:00:00.000Z" },
      // Por pagar, do mês passado e de outro serviço: nenhum é receita do mês.
      { id: "p-3", service: "plan", ownerId: "dino", status: "open", amount: 10_000, createdAt: "2025-01-05T00:00:00.000Z" },
      { id: "p-4", service: "plan", ownerId: "carla", status: "paid", amount: 10_000, paidAt: "2024-11-01T00:00:00.000Z" },
      { id: "p-5", service: "sms", ownerId: "ana", status: "paid", amount: 2_500, paidAt: "2025-01-06T00:00:00.000Z" },
    ],
    verifications: [
      { storeId: "l-bento", status: "pending", submittedAt: "2025-01-10T00:00:00.000Z" },
      { storeId: "l-dino", status: "pending", submittedAt: "2025-01-11T00:00:00.000Z" },
      { storeId: "l-ana", status: "approved", reviewedAt: "2025-01-02T00:00:00.000Z" },
      { storeId: "m-1", status: "pending", submittedAt: "2025-01-01T00:00:00.000Z" },
    ],
    withdrawals: [
      { id: "w-1", storeId: "l-ana", status: "requested", amount: 5_000 },
      { id: "w-2", storeId: "l-bento", status: "approved", amount: 5_000 },
      { id: "w-3", storeId: "m-2", status: "requested", amount: 5_000 },
    ],
  };

  it("devolve os valores exatos", () => {
    expect(overviewKpis(instantaneo)).toEqual({
      accounts: 4,
      publishedStores: 3,
      suspendedStores: 1,
      activeSubscriptions: 2,
      monthRevenue: 40_000,
      pendingVerifications: 2,
      pendingWithdrawals: 1,
    });
  });

  it("acrescentar uma loja-modelo com pedido e levantamento próprios não move nenhum número", () => {
    const comModelo: AdminMetricsInput = {
      ...instantaneo,
      stores: [{ id: "m-novo", ownerId: "ana", identifier: "modelo-novo", state: "Publicada" }, ...(instantaneo.stores ?? [])],
      verifications: [{ storeId: "m-novo", status: "pending", submittedAt: "2024-01-01T00:00:00.000Z" }, ...(instantaneo.verifications ?? [])],
      withdrawals: [{ id: "w-m", storeId: "m-novo", status: "requested", amount: 1 }, ...(instantaneo.withdrawals ?? [])],
    };
    expect(overviewKpis(comModelo)).toEqual(overviewKpis(instantaneo));
  });

  it("com o instantâneo vazio ou degenerado devolve zeros, sem lançar", () => {
    const zeros = {
      accounts: 0, publishedStores: 0, suspendedStores: 0, activeSubscriptions: 0,
      monthRevenue: 0, pendingVerifications: 0, pendingWithdrawals: 0,
    };
    expect(overviewKpis({})).toEqual(zeros);
    expect(overviewKpis(null as never)).toEqual(zeros);
    expect(overviewKpis({ accounts: "x", stores: 3, verifications: {} } as never)).toEqual(zeros);
  });
});
