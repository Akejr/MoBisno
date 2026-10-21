/**
 * Métricas do Painel_Admin (`src/services/adminMetrics.ts`): exemplos pequenos,
 * nomeados e escritos à mão, com valores esperados **exatos**.
 *
 * Import estático direto: `src/services/adminMetrics.ts` é puro e não toca em
 * `document`, `window` nem `localStorage`.
 *
 * ## O que este ficheiro faz que o `tests/adminMetrics.property.test.ts` não faz
 *
 * A propriedade cobre a **invariância** face às lojas-modelo e os **limites** das
 * métricas sobre entradas arbitrárias: relações, não valores. Passa mesmo que a
 * receita voltasse a somar SMS ou que um rascunho contasse como loja suspensa —
 * nada disso viola nenhuma invariante.
 *
 * Este ficheiro fixa os **valores** e as três regras do módulo:
 *  1. a receita é só de subscrições (as linhas antigas de SMS e logótipos não
 *     contam);
 *  2. uma loja suspensa é uma loja **publicada** de uma conta sem subscrição;
 *  3. uma loja-modelo é reconhecida pela marca `__template`, pelo prefixo
 *     `modelo-` ou por `isModel` — e fica fora de tudo.
 *
 * As regras das ações do Administrador (aprovar, rejeitar, ativar) e os números
 * da Visão geral estão em `tests/adminApprovals.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_HREFS,
  ATTENTION_WINDOW_DAYS,
  MONTHS_IN_EVOLUTION,
  accountStatus,
  attentionLists,
  businessHealth,
  isLojaModelo,
  monthlyEvolution,
  type AdminMetricsInput,
  type AttentionItem,
} from "../src/services/adminMetrics.js";

/**
 * Momento de referência fixo, escolhido a meio de janeiro **de propósito**: a
 * janela de seis meses atravessa a mudança de ano, e por isso a aritmética de
 * meses (`Date.UTC(ano, mês - n, 1)`) tem de recuar o ano sozinha.
 */
const AGORA = "2025-01-15T12:00:00.000Z";

/** Os seis meses que a janela de {@link AGORA} tem de produzir, por extenso. */
const MESES_ESPERADOS = ["2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01"];

// ---------------------------------------------------------------------------
// Receita: só subscrições
// ---------------------------------------------------------------------------

describe("monthlyEvolution — janela de 6 meses com buracos", () => {
  /**
   * Receita paga em dois meses só (setembro de 2024 e janeiro de 2025), contas
   * criadas num terceiro (novembro de 2024), uma compra antiga de SMS (que já
   * não é receita) e duas entradas **fora** da janela.
   */
  const instantaneo: AdminMetricsInput = {
    now: AGORA,
    accounts: [
      { id: "conta-nov-1", email: "ana@exemplo.ao", createdAt: "2024-11-03T08:00:00.000Z" },
      { id: "conta-nov-2", email: "bento@exemplo.ao", createdAt: "2024-11-28T23:59:00.000Z" },
      // Fora da janela: conta antiga, não entra em nenhum dos seis pontos.
      { id: "conta-antiga", email: "cesaria@exemplo.ao", createdAt: "2023-05-20T10:00:00.000Z" },
    ],
    transactions: [
      { id: "tx-set-1", service: "plan", status: "paid", amount: 5000, paidAt: "2024-09-02T09:00:00.000Z" },
      // Compra antiga de SMS: o serviço saiu do produto e já não é receita.
      { id: "tx-set-2", service: "sms", status: "paid", amount: "2500", paidAt: "2024-09-27T21:00:00.000Z" },
      // Montante em texto: é assim que uma coluna `numeric` chega do Supabase.
      { id: "tx-jan-1", service: "plan", status: "paid", amount: "12000", paidAt: "2025-01-04T11:00:00.000Z" },
      // Fora da janela: pago em julho de 2024, um mês antes do primeiro ponto.
      { id: "tx-jul-1", service: "plan", status: "paid", amount: 999_999, paidAt: "2024-07-31T23:00:00.000Z" },
    ],
  };

  it("devolve exatamente 6 pontos, do mais antigo para o mais recente, com as chaves esperadas", () => {
    const serie = monthlyEvolution(instantaneo);

    expect(serie).toHaveLength(MONTHS_IN_EVOLUTION);
    expect(MONTHS_IN_EVOLUTION).toBe(6);
    expect(serie.map((p) => p.month)).toEqual(MESES_ESPERADOS);
  });

  it("os meses sem dados vêm a zero e presentes; a compra de SMS não conta", () => {
    expect(monthlyEvolution(instantaneo)).toEqual([
      { month: "2024-08", revenue: 0, accounts: 0 },
      // 5 000 da subscrição; os 2 500 de SMS ficam de fora.
      { month: "2024-09", revenue: 5000, accounts: 0 },
      { month: "2024-10", revenue: 0, accounts: 0 },
      { month: "2024-11", revenue: 0, accounts: 2 },
      { month: "2024-12", revenue: 0, accounts: 0 },
      { month: "2025-01", revenue: 12000, accounts: 0 },
    ]);
  });

  it("um pagamento fora da janela não aparece em nenhum ponto", () => {
    const serie = monthlyEvolution(instantaneo);

    expect(serie.map((p) => p.month)).not.toContain("2024-07");
    expect(serie.reduce((soma, p) => soma + p.revenue, 0)).toBe(17_000);
    expect(serie.reduce((soma, p) => soma + p.accounts, 0)).toBe(2);
  });

  it("o `now` explícito tem precedência sobre `input.now` e desloca a janela", () => {
    const serie = monthlyEvolution(instantaneo, undefined, "2025-02-15T12:00:00.000Z");

    expect(serie.map((p) => p.month)).toEqual(["2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02"]);
  });
});

describe("businessHealth — receita do mês corrente", () => {
  it("conta só subscrições `paid` com `paidAt` no mês do momento de referência", () => {
    const saude = businessHealth({
      now: AGORA,
      transactions: [
        { id: "tx-1", service: "plan", status: "paid", amount: 10_000, paidAt: "2025-01-05T10:00:00.000Z" },
        // `open`: ainda não há dinheiro nenhum recebido.
        { id: "tx-2", service: "plan", status: "open", amount: 99_999, createdAt: "2025-01-06T10:00:00.000Z" },
        // `failed` **com** `paidAt` gravado: o estado manda, não a data.
        { id: "tx-3", service: "plan", status: "failed", amount: 88_888, paidAt: "2025-01-07T10:00:00.000Z" },
        // Pago no mês anterior: entra na evolução, não na receita do mês.
        { id: "tx-4", service: "plan", status: "paid", amount: 7_000, paidAt: "2024-12-30T10:00:00.000Z" },
        // Linhas antigas de serviços que saíram do produto: pagas e no mês, mas não são receita.
        { id: "tx-5", service: "sms", status: "paid", amount: 3_000, paidAt: "2025-01-08T10:00:00.000Z" },
        { id: "tx-6", service: "logo", status: "paid", amount: 15_000, paidAt: "2025-01-09T10:00:00.000Z" },
        { id: "tx-7", status: "paid", amount: 4_000, paidAt: "2025-01-10T10:00:00.000Z" },
      ],
    });

    expect(saude.monthRevenue).toBe(10_000);
  });

  it("os pagamentos de uma conta de Administrador não são receita", () => {
    const saude = businessHealth({
      now: AGORA,
      accounts: [{ id: "admin-1", isAdmin: true }],
      transactions: [
        { id: "tx-admin", service: "plan", ownerId: "admin-1", status: "paid", amount: 10_000, paidAt: "2025-01-05T10:00:00.000Z" },
      ],
    });

    expect(saude.monthRevenue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lojas suspensas: só as publicadas de contas sem subscrição
// ---------------------------------------------------------------------------

describe("businessHealth — lojas suspensas", () => {
  const instantaneo: AdminMetricsInput = {
    now: AGORA,
    accounts: [
      { id: "conta-ativa", planExpiresAt: "2025-03-01T00:00:00.000Z" },
      { id: "conta-caducada", planExpiresAt: "2025-01-01T00:00:00.000Z" },
      { id: "conta-nunca", planExpiresAt: null },
    ],
    stores: [
      // No ar: dono com subscrição.
      { id: "l-ativa-pub", ownerId: "conta-ativa", state: "Publicada" },
      // Fora do ar: publicadas, donos sem subscrição.
      { id: "l-caducada-pub", ownerId: "conta-caducada", state: "Publicada" },
      { id: "l-nunca-pub", ownerId: "conta-nunca", state: "Publicada" },
      // Rascunhos de contas sem subscrição: nunca estiveram no ar, não estão suspensos.
      { id: "l-caducada-rasc", ownerId: "conta-caducada", state: "Rascunho" },
      { id: "l-nunca-rasc", ownerId: "conta-nunca", state: "Rascunho" },
      // Dono desconhecido: conta como publicada, mas sem faturação não é suspensa.
      { id: "l-orfa-pub", ownerId: "conta-que-nao-existe", state: "Publicada" },
    ],
  };

  it("contam só as lojas publicadas cujo dono está sem subscrição", () => {
    const saude = businessHealth(instantaneo);

    expect(saude.publishedStores).toBe(4);
    expect(saude.suspendedStores).toBe(2);
    expect(saude.activeSubscriptions).toBe(1);
  });

  it("um rascunho nunca é suspenso, por muito que a conta esteja sem subscrição", () => {
    const soRascunhos = businessHealth({
      ...instantaneo,
      stores: (instantaneo.stores ?? []).filter((s) => s.state === "Rascunho"),
    });

    expect(soRascunhos.suspendedStores).toBe(0);
    expect(soRascunhos.publishedStores).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lojas-modelo: três marcas, todas fora
// ---------------------------------------------------------------------------

describe("isLojaModelo — a marca, o prefixo e o `isModel`", () => {
  it("reconhece as três marcas e nenhuma loja de cliente", () => {
    expect(isLojaModelo({ id: "a", customization: { __template: { name: "Lumière Chic" } } })).toBe(true);
    expect(isLojaModelo({ id: "b", identifier: "modelo-lumiere-chic" })).toBe(true);
    expect(isLojaModelo({ id: "c", identifier: "MODELO-Ekolo" })).toBe(true);
    expect(isLojaModelo({ id: "d", isModel: true })).toBe(true);

    expect(isLojaModelo({ id: "e", identifier: "kianda-moda" })).toBe(false);
    // `modelo` a meio do identificador não é o prefixo reservado.
    expect(isLojaModelo({ id: "f", identifier: "loja-modelo" })).toBe(false);
    expect(isLojaModelo({ id: "g", customization: { __template: false, __basedOn: "lumiere" } })).toBe(false);
    expect(isLojaModelo({ id: "h", isModel: false, customization: null })).toBe(false);
    expect(isLojaModelo(null)).toBe(false);
  });

  it("uma loja-modelo só pelo prefixo `modelo-` fica fora de todas as contagens", () => {
    const comModelo = businessHealth({
      now: AGORA,
      accounts: [{ id: "conta-caducada", planExpiresAt: "2025-01-01T00:00:00.000Z" }],
      stores: [
        { id: "l-cliente", ownerId: "conta-caducada", identifier: "kianda", state: "Publicada" },
        // Sem `customization` (como `listStores` a lia), mas com o prefixo reservado.
        { id: "l-modelo", ownerId: "conta-caducada", identifier: "modelo-kianda", state: "Publicada" },
      ],
    });

    expect(comModelo.publishedStores).toBe(1);
    expect(comModelo.suspendedStores).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// «A precisar de atenção»
// ---------------------------------------------------------------------------

describe("attentionLists — verificações e levantamentos à espera", () => {
  const instantaneo: AdminMetricsInput = {
    now: AGORA,
    accounts: [
      { id: "conta-1", email: "gil@exemplo.ao" },
      { id: "admin-1", email: "admin@mobisno.ao", isAdmin: true },
    ],
    stores: [
      { id: "loja-a", name: "Kianda Moda", ownerId: "conta-1", state: "Publicada" },
      { id: "loja-b", name: "Ekolo Casa", ownerId: "conta-1", state: "Rascunho" },
      { id: "modelo-x", name: "Lumière (modelo)", ownerId: "admin-1", identifier: "modelo-lumiere", state: "Publicada" },
    ],
    verifications: [
      { storeId: "loja-b", status: "pending", submittedAt: "2025-01-12T09:00:00.000Z", storeName: "Ekolo Casa", companyName: "Ekolo Lda", ownerEmail: "gil@exemplo.ao" },
      // O mais antigo: tem de vir à frente.
      { storeId: "loja-a", status: "pending", submittedAt: "2025-01-10T09:00:00.000Z", storeName: "Kianda Moda", ownerEmail: "gil@exemplo.ao" },
      // Já decidido: não está à espera.
      { storeId: "loja-c", status: "approved", submittedAt: "2025-01-01T09:00:00.000Z" },
      // Da loja-modelo: fora.
      { storeId: "modelo-x", status: "pending", submittedAt: "2025-01-02T09:00:00.000Z" },
    ],
    withdrawals: [
      { id: "lev-2", storeId: "loja-a", storeName: "Kianda Moda", ownerEmail: "gil@exemplo.ao", amount: "30000", status: "requested", createdAt: "2025-01-14T00:00:00.000Z" },
      { id: "lev-1", storeId: "loja-b", storeName: "Ekolo Casa", ownerEmail: "gil@exemplo.ao", amount: 45_000, status: "requested", createdAt: "2025-01-13T00:00:00.000Z" },
      { id: "lev-pago", storeId: "loja-a", status: "paid", amount: 1_000 },
      { id: "lev-modelo", storeId: "modelo-x", status: "requested", amount: 9_999 },
    ],
  };

  it("tem exatamente as duas listas, por esta ordem", () => {
    expect(Object.keys(attentionLists(instantaneo))).toEqual(["verificationsToReview", "withdrawalsToApprove"]);
  });

  it("verificações em análise, a mais antiga primeiro, com ligação para «Aprovações»", () => {
    const { verificationsToReview } = attentionLists(instantaneo);

    expect(verificationsToReview.map((i) => i.id)).toEqual(["loja-a", "loja-b"]);
    expect(verificationsToReview[1]).toEqual({
      id: "loja-b",
      title: "Ekolo Casa",
      detail: "Ekolo Lda · gil@exemplo.ao",
      at: "2025-01-12T09:00:00.000Z",
      href: "#/adminPainel/aprovacoes",
    });
    expect(verificationsToReview[0]?.detail).toBe("gil@exemplo.ao");
    expect(ADMIN_HREFS.aprovacoes).toBe("#/adminPainel/aprovacoes");
  });

  it("levantamentos pedidos, o mais antigo primeiro, com ligação para «Pagamentos › Levantamentos»", () => {
    const { withdrawalsToApprove } = attentionLists(instantaneo);

    expect(withdrawalsToApprove.map((i) => i.id)).toEqual(["lev-1", "lev-2"]);
    expect(withdrawalsToApprove[0]?.amount).toBe(45_000);
    // Montante em texto, como chega de uma coluna `numeric`.
    expect(withdrawalsToApprove[1]?.amount).toBe(30_000);
    for (const item of withdrawalsToApprove) expect(item.href).toBe("#/adminPainel/pagamentos/levantamentos");
    expect(ADMIN_HREFS.levantamentos).toBe("#/adminPainel/pagamentos/levantamentos");
  });

  it("todo o item tem `id`, `title`, `detail` e `href` não vazios, e o `href` sai do mapa público", () => {
    const listas = attentionLists(instantaneo);
    const todos: AttentionItem[] = [...listas.verificationsToReview, ...listas.withdrawalsToApprove];
    const validos = new Set<string>(Object.values(ADMIN_HREFS));

    expect(todos).toHaveLength(4);
    for (const item of todos) {
      expect(item.id.trim(), JSON.stringify(item)).not.toBe("");
      expect(item.title.trim(), JSON.stringify(item)).not.toBe("");
      expect(item.detail.trim(), JSON.stringify(item)).not.toBe("");
      expect(validos.has(item.href), item.href).toBe(true);
    }
  });

  it("sem nada à espera, as duas listas são arrays vazios, e não `undefined`", () => {
    const vazio = attentionLists({ now: AGORA, stores: instantaneo.stores });

    expect(vazio.verificationsToReview).toEqual([]);
    expect(vazio.withdrawalsToApprove).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Subscrições a terminar: o número e o filtro de «Contas» partilham o critério
// ---------------------------------------------------------------------------

describe("businessHealth e accountStatus — «a terminar» com o mesmo critério", () => {
  it("`subscriptionsExpiring` é o número de contas com estado `expiring`", () => {
    const contas = [
      // Dentro da janela de 7 dias.
      { id: "t-hoje", planExpiresAt: "2025-01-15T23:00:00.000Z" },
      { id: "t-3d", planExpiresAt: "2025-01-18T12:00:00.000Z" },
      { id: "t-7d", planExpiresAt: "2025-01-22T12:00:00.000Z" },
      // Fora da janela: subscrição longa, e subscrição já caducada.
      { id: "t-20d", planExpiresAt: "2025-02-04T12:00:00.000Z" },
      { id: "t-passado", planExpiresAt: "2025-01-01T12:00:00.000Z" },
    ];

    const saude = businessHealth({ now: AGORA, accounts: contas });
    const aTerminar = contas.filter((c) => accountStatus(c, AGORA).kind === "expiring").map((c) => c.id);

    expect(saude.subscriptionsExpiring).toBe(3);
    expect(aTerminar).toEqual(["t-hoje", "t-3d", "t-7d"]);
    expect(ATTENTION_WINDOW_DAYS).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Totalidade
// ---------------------------------------------------------------------------

describe("totalidade: entradas degeneradas não lançam", () => {
  it("`businessHealth({})` devolve as cinco métricas a zero", () => {
    expect(businessHealth({})).toEqual({
      monthRevenue: 0,
      activeSubscriptions: 0,
      subscriptionsExpiring: 0,
      publishedStores: 0,
      suspendedStores: 0,
    });
  });

  it("`monthlyEvolution(null)` devolve 6 pontos a zero em torno do momento atual", () => {
    const serie = monthlyEvolution(null as never);

    expect(serie).toHaveLength(MONTHS_IN_EVOLUTION);
    expect(serie.every((p) => p.revenue === 0 && p.accounts === 0)).toBe(true);
    expect(serie.every((p) => /^\d{4}-\d{2}$/.test(p.month))).toBe(true);
  });

  it("`attentionLists` com campos do tipo errado devolve as duas listas vazias", () => {
    // É a forma que os dados tomam quando uma consulta falha e o chamador em
    // JavaScript passa o que tem em mão. Nada disto é um array.
    const listas = attentionLists({ accounts: null, stores: 3, verifications: "x", withdrawals: {} } as never);

    expect(listas.verificationsToReview).toEqual([]);
    expect(listas.withdrawalsToApprove).toEqual([]);
  });

  it("um momento absurdo cai no relógio em vez de lançar", () => {
    expect(() => businessHealth({ now: 1e20 })).not.toThrow();
    expect(() => monthlyEvolution({ now: "não é data" })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// O acesso de dados não volta aos defeitos corrigidos
// ---------------------------------------------------------------------------

/**
 * `web/supabase/admin.ts` importa o cliente do Supabase e `tests/` compila com
 * `lib: ["ES2022"]`, sem DOM: o módulo não pode ser importado daqui. As
 * asserções são por isso sobre o **texto-fonte**, o mesmo padrão `readFileSync`
 * de `tests/seedRename.test.ts`. Cada uma é a assinatura exata de um defeito que
 * existia neste ficheiro.
 */
describe("web/supabase/admin.ts — sem os defeitos que tinha", () => {
  const FONTE = readFileSync(join(__dirname, "..", "web", "supabase", "admin.ts"), "utf8");

  /** Corpo de uma função exportada, do nome dela até ao `}` da coluna 0. */
  const corpo = (nome: string): string => {
    const i = FONTE.indexOf(`export async function ${nome}(`);
    expect(i, `${nome} não encontrada em web/supabase/admin.ts`).toBeGreaterThan(-1);
    const j = FONTE.indexOf("\n}", i);
    expect(j, `fim de ${nome} não encontrado`).toBeGreaterThan(i);
    return FONTE.slice(i, j);
  };

  it("já não lê as compras de SMS nem de logótipos, que saíram do produto", () => {
    expect(FONTE).not.toContain("sms_purchases");
    expect(FONTE).not.toContain("logo_purchases");
  });

  it("a ativação manual usa `activationPatch` e não uma data a cem anos", () => {
    // A concessão antiga gravava `Date.now() + 100 * 365 * 24 * 3600 * 1000`:
    // uma subscrição vitalícia que ninguém pagou.
    expect(FONTE).not.toMatch(/100\s*\*\s*365/);
    expect(FONTE).not.toContain("adminSetSubscription");
    expect(corpo("adminActivatePlan")).toContain("activationPatch(current, months)");
    expect(corpo("adminDeactivatePlan")).toContain("deactivationPatch()");
  });

  it("as decisões de verificação saem de `approvalPatch` e `rejectionPatch`", () => {
    expect(corpo("adminApproveVerification")).toContain("approvalPatch(await currentUserId())");
    expect(corpo("adminRejectVerification")).toContain("rejectionPatch(await currentUserId(), reason)");
  });

  it("os pagamentos digitais de uma loja vêm de `stores.digital_payments`, não do interruptor que a 0023 apagou", () => {
    expect(FONTE).not.toContain("online_enabled");
    expect(corpo("listStores")).toContain("digital_payments");
  });

  it("as lojas-modelo saem de `isLojaModelo`, a mesma regra das métricas", () => {
    expect(FONTE).toMatch(/import \{[\s\S]*?isLojaModelo[\s\S]*?\} from "\.\.\/\.\.\/src\/services\/adminMetrics\.js";/);
    expect(corpo("listStores")).toContain("isModel: isLojaModelo(");
  });
});
