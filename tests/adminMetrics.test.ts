/**
 * Tarefa 12.6 da spec `melhorias-loja-e-admin` (R7.3, R7.5, R7.6).
 *
 * Exemplos pequenos, nomeados e escritos à mão, com valores esperados **exatos**.
 * Import estático directo: `src/services/adminMetrics.ts` é puro e não toca em
 * `document`, `window` nem `localStorage`, pelo que não é preciso o contorno de
 * `await import()` com o especificador numa constante que os testes de módulos
 * de `web/` usam.
 *
 * ## O que este ficheiro faz que o `tests/adminMetrics.property.test.ts` não faz
 *
 * A Propriedade 5 cobre a **invariância** face à Loja_Modelo e os **limites** das
 * métricas sobre entradas arbitrárias: relações, não valores. Passa mesmo que a
 * janela da evolução tenha cinco meses em vez de seis, ou que um mês sem dados
 * seja saltado em vez de vir a zero — nada disso viola nenhuma invariante.
 *
 * Este ficheiro fixa os **valores**: as seis chaves `"AAAA-MM"` por extenso, os
 * cinco `href`, e o facto de uma lista sem itens ser um array vazio e não
 * `undefined`. Falha com mensagem clara quando alguém mexer na regra.
 *
 * Sem teste de propriedade aqui, por desenho.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_HREFS,
  ATTENTION_WINDOW_DAYS,
  MONTHS_IN_EVOLUTION,
  attentionLists,
  businessHealth,
  monthlyEvolution,
  overviewCounts,
  type AdminMetricsInput,
  type AttentionItem,
  type StoreLike,
} from "../src/services/adminMetrics.js";

/**
 * Momento de referência fixo, escolhido a meio de janeiro **de propósito**: a
 * janela de seis meses atravessa a mudança de ano, e por isso a aritmética de
 * meses (`Date.UTC(ano, mês - n, 1)`) tem de recuar o ano sozinha. Um `now` a
 * meio do ano nunca exercia esse caso.
 */
const AGORA = "2025-01-15T12:00:00.000Z";

/** Os seis meses que a janela de {@link AGORA} tem de produzir, por extenso. */
const MESES_ESPERADOS = ["2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01"];

// ---------------------------------------------------------------------------
// Exemplo 1 — evolução de 6 meses com meses sem dados (R7.3)
// ---------------------------------------------------------------------------

describe("monthlyEvolution — janela de 6 meses com buracos (R7.3)", () => {
  /**
   * Receita paga em dois meses só (setembro de 2024 e janeiro de 2025), contas
   * criadas num terceiro (novembro de 2024), e duas entradas **fora** da janela
   * para confirmar que não são contadas.
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
      // Montante em texto: é assim que uma coluna `numeric` chega do Supabase.
      { id: "tx-set-2", service: "sms", status: "paid", amount: "2500", paidAt: "2024-09-27T21:00:00.000Z" },
      { id: "tx-jan-1", service: "plan", status: "paid", amount: 12000, paidAt: "2025-01-04T11:00:00.000Z" },
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

  it("os meses sem dados vêm a zero e presentes, nunca saltados", () => {
    // A asserção que interessa: agosto, outubro e dezembro não têm receita nem
    // contas novas e continuam na série. Uma série com buracos desenharia um
    // gráfico enganador, com dois meses de distância a ocupar um passo só.
    expect(monthlyEvolution(instantaneo)).toEqual([
      { month: "2024-08", revenue: 0, accounts: 0 },
      { month: "2024-09", revenue: 7500, accounts: 0 },
      { month: "2024-10", revenue: 0, accounts: 0 },
      { month: "2024-11", revenue: 0, accounts: 2 },
      { month: "2024-12", revenue: 0, accounts: 0 },
      { month: "2025-01", revenue: 12000, accounts: 0 },
    ]);
  });

  it("uma transação paga fora da janela dos 6 meses não aparece em nenhum ponto", () => {
    const serie = monthlyEvolution(instantaneo);

    expect(serie.map((p) => p.month)).not.toContain("2024-07");
    // 999 999 Kz de julho ficariam bem visíveis em qualquer ponto onde caíssem:
    // o total da janela é só o de setembro mais o de janeiro.
    expect(serie.reduce((soma, p) => soma + p.revenue, 0)).toBe(19_500);
    expect(serie.reduce((soma, p) => soma + p.accounts, 0)).toBe(2);
  });

  it("o `now` explícito tem precedência sobre `input.now` e desloca a janela", () => {
    // Um mês para a frente: a janela larga agosto de 2024 e ganha fevereiro de 2025.
    const serie = monthlyEvolution(instantaneo, undefined, "2025-02-15T12:00:00.000Z");

    expect(serie.map((p) => p.month)).toEqual([
      "2024-09",
      "2024-10",
      "2024-11",
      "2024-12",
      "2025-01",
      "2025-02",
    ]);
  });
});

describe("businessHealth — receita do mês corrente (R7.2)", () => {
  it("conta só transações `paid` com `paidAt` no mês do momento de referência", () => {
    const saude = businessHealth({
      now: AGORA,
      transactions: [
        { id: "tx-1", service: "plan", status: "paid", amount: 10_000, paidAt: "2025-01-05T10:00:00.000Z" },
        // `open`: ainda não há dinheiro nenhum recebido.
        { id: "tx-2", service: "plan", status: "open", amount: 99_999, createdAt: "2025-01-06T10:00:00.000Z" },
        // `failed` **com** `paidAt` gravado: o estado manda, não a data.
        { id: "tx-3", service: "sms", status: "failed", amount: 88_888, paidAt: "2025-01-07T10:00:00.000Z" },
        // Pago no mês anterior: entra na evolução, não na receita do mês.
        { id: "tx-4", service: "plan", status: "paid", amount: 7_000, paidAt: "2024-12-30T10:00:00.000Z" },
      ],
    });

    expect(saude.monthRevenue).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// Exemplo 2 — listas vazias com estado vazio (R7.6)
// ---------------------------------------------------------------------------

describe("attentionLists — nada por resolver dá cinco listas vazias (R7.6)", () => {
  /**
   * Instantâneo com dados reais mas **sem nada para o Administrador resolver**:
   * é este o caso em que a Visão geral apresenta a mensagem de estado vazio de
   * cada lista.
   */
  const nadaPorResolver: AdminMetricsInput = {
    now: AGORA,
    accounts: [
      {
        id: "conta-paga",
        email: "dina@exemplo.ao",
        plan: "profissional",
        planExpiresAt: "2025-03-01T00:00:00.000Z",
        createdAt: "2024-11-01T00:00:00.000Z",
      },
    ],
    stores: [
      {
        id: "loja-ok",
        name: "Ekolo Sports",
        ownerId: "conta-paga",
        ownerEmail: "dina@exemplo.ao",
        state: "Publicada",
        createdAt: "2024-11-02T00:00:00.000Z",
      },
    ],
    withdrawals: [
      { id: "lev-pago", storeId: "loja-ok", storeName: "Ekolo Sports", amount: 30_000, status: "paid" },
    ],
    transactions: [
      { id: "tx-paga", service: "plan", status: "paid", amount: 12_000, paidAt: "2025-01-02T00:00:00.000Z" },
    ],
    productCounts: new Map([["loja-ok", 3]]),
  };

  it("cada uma das cinco listas é um array vazio, e não `undefined`", () => {
    const listas = attentionLists(nadaPorResolver);

    // A vista faz `.length` para decidir a mensagem de estado vazio e `.map`
    // para desenhar as linhas. Com `undefined` em vez de `[]`, a Visão geral
    // deixava de abrir — a mensagem de estado vazio nunca chegava a aparecer.
    for (const [nome, lista] of Object.entries(listas)) {
      expect(Array.isArray(lista), `${nome} devia ser um array`).toBe(true);
      expect(lista, `${nome} devia estar vazia`).toEqual([]);
    }
    expect(Object.keys(listas)).toEqual([
      "withdrawalsToApprove",
      "paymentsStuck",
      "accountsExpiring7d",
      "storesWithoutProducts",
      "storesUnpublished",
    ]);
  });

  it("com o instantâneo vazio, as cinco listas também são arrays vazios", () => {
    const listas = attentionLists({});

    expect(listas.withdrawalsToApprove).toEqual([]);
    expect(listas.paymentsStuck).toEqual([]);
    expect(listas.accountsExpiring7d).toEqual([]);
    expect(listas.storesWithoutProducts).toEqual([]);
    expect(listas.storesUnpublished).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exemplo 3 — o `href` de cada tipo de item (R7.5)
// ---------------------------------------------------------------------------

/** Um item por lista: é o instantâneo mínimo que exercita os cinco `href`. */
const umPorLista: AdminMetricsInput = {
  now: AGORA,
  accounts: [
    {
      id: "conta-teste",
      email: "teste@exemplo.ao",
      plan: "basico",
      trialEndsAt: "2025-01-18T12:00:00.000Z", // exatamente 3 dias
      createdAt: "2025-01-10T00:00:00.000Z",
    },
  ],
  stores: [
    {
      id: "loja-sem-produtos",
      name: "Loja Nova",
      ownerEmail: "eva@exemplo.ao",
      state: "Publicada",
      createdAt: "2025-01-12T00:00:00.000Z",
    },
    {
      id: "loja-rascunho",
      name: "Loja em Rascunho",
      ownerEmail: "fabio@exemplo.ao",
      state: "Rascunho",
      createdAt: "2025-01-11T00:00:00.000Z",
    },
    {
      id: "loja-do-levantamento",
      name: "Loja Ativa",
      ownerEmail: "gil@exemplo.ao",
      state: "Publicada",
      createdAt: "2024-12-01T00:00:00.000Z",
    },
  ],
  withdrawals: [
    {
      id: "lev-1",
      storeId: "loja-do-levantamento",
      storeName: "Loja Ativa",
      ownerEmail: "gil@exemplo.ao",
      amount: 45_000,
      status: "requested",
      createdAt: "2025-01-13T00:00:00.000Z",
    },
  ],
  transactions: [
    {
      id: "tx-1",
      service: "plan",
      description: "Plano profissional",
      ownerEmail: "gil@exemplo.ao",
      amount: 15_000,
      status: "failed",
      createdAt: "2025-01-14T00:00:00.000Z",
    },
  ],
  // `loja-sem-produtos` está **ausente** do mapa: ausência é zero.
  productCounts: new Map([
    ["loja-rascunho", 4],
    ["loja-do-levantamento", 7],
  ]),
};

describe("attentionLists — `href` do separador certo por tipo de item (R7.5)", () => {
  it("levantamento por aprovar leva ao separador «Levantamentos»", () => {
    const [item] = attentionLists(umPorLista).withdrawalsToApprove;

    expect(item?.id).toBe("lev-1");
    expect(item?.href).toBe(ADMIN_HREFS.levantamentos);
    expect(item?.href).toBe("#/adminPainel/levantamentos");
    expect(item?.amount).toBe(45_000);
  });

  it("pagamento por resolver leva ao separador «Transações»", () => {
    const [item] = attentionLists(umPorLista).paymentsStuck;

    expect(item?.id).toBe("tx-1");
    expect(item?.href).toBe(ADMIN_HREFS.transacoes);
    expect(item?.title).toBe("Plano profissional");
    expect(item?.detail).toBe("Falhado · gil@exemplo.ao");
  });

  it("conta a expirar leva ao separador «Contas»", () => {
    const [item] = attentionLists(umPorLista).accountsExpiring7d;

    expect(item?.id).toBe("conta-teste");
    expect(item?.href).toBe(ADMIN_HREFS.contas);
    expect(item?.title).toBe("teste@exemplo.ao");
    expect(item?.detail).toBe("Teste termina em 3 dias");
  });

  it("Loja sem Produtos e Loja não publicada levam ambas ao separador «Lojas»", () => {
    const listas = attentionLists(umPorLista);

    expect(listas.storesWithoutProducts.map((i) => i.id)).toEqual(["loja-sem-produtos"]);
    expect(listas.storesWithoutProducts[0]?.href).toBe(ADMIN_HREFS.lojas);

    expect(listas.storesUnpublished.map((i) => i.id)).toEqual(["loja-rascunho"]);
    expect(listas.storesUnpublished[0]?.href).toBe(ADMIN_HREFS.lojas);
  });

  it("todas as cinco listas têm exatamente um item, e todo o item tem `id`, `title` e `detail` não vazios", () => {
    const listas = attentionLists(umPorLista);
    const todos: AttentionItem[] = [
      ...listas.withdrawalsToApprove,
      ...listas.paymentsStuck,
      ...listas.accountsExpiring7d,
      ...listas.storesWithoutProducts,
      ...listas.storesUnpublished,
    ];

    expect(todos).toHaveLength(5);
    // A vista desenha sempre os três campos em cada linha; um vazio dá uma
    // linha com um espaço em branco onde devia estar a informação.
    for (const item of todos) {
      expect(item.id.trim(), JSON.stringify(item)).not.toBe("");
      expect(item.title.trim(), JSON.stringify(item)).not.toBe("");
      expect(item.detail.trim(), JSON.stringify(item)).not.toBe("");
    }
    // Os cinco `href` saem todos do mapa público, sem cadeias soltas pelo meio.
    const validos = new Set<string>(Object.values(ADMIN_HREFS));
    for (const item of todos) expect(validos.has(item.href), item.href).toBe(true);
  });
});

describe("attentionLists — contagem de Produtos ausente e contagem zero (R7.4)", () => {
  it("dão o mesmo resultado: a Loja aparece nas Lojas sem Produtos nos dois casos", () => {
    const lojas = [
      { id: "loja-ausente", name: "Sem entrada no mapa", state: "Publicada" },
      { id: "loja-zero", name: "Com zero no mapa", state: "Publicada" },
    ];

    const listas = attentionLists({ now: AGORA, stores: lojas, productCounts: new Map([["loja-zero", 0]]) });

    expect(listas.storesWithoutProducts.map((i) => i.id).sort()).toEqual(["loja-ausente", "loja-zero"]);
  });
});

describe("attentionLists e businessHealth — coerência que a interface expõe lado a lado", () => {
  it("`trialsExpiring` e o comprimento de `accountsExpiring7d` coincidem sempre (mesmo critério)", () => {
    const instantaneo: AdminMetricsInput = {
      now: AGORA,
      accounts: [
        // Dentro da janela de 7 dias: contam nos dois sítios.
        { id: "t-hoje", email: "h@exemplo.ao", trialEndsAt: "2025-01-15T23:00:00.000Z" },
        { id: "t-3d", email: "t3@exemplo.ao", trialEndsAt: "2025-01-18T12:00:00.000Z" },
        { id: "t-7d", email: "t7@exemplo.ao", trialEndsAt: "2025-01-22T12:00:00.000Z" },
        // Fora da janela: teste longo, e teste já terminado (deixa de estar em teste).
        { id: "t-20d", email: "t20@exemplo.ao", trialEndsAt: "2025-02-04T12:00:00.000Z" },
        { id: "t-passado", email: "tp@exemplo.ao", trialEndsAt: "2025-01-01T12:00:00.000Z" },
      ],
    };

    const saude = businessHealth(instantaneo);
    const listas = attentionLists(instantaneo);

    // O número da secção de saúde e o comprimento da lista de «A precisar de
    // atenção» ficam um ao lado do outro no ecrã: divergirem é um defeito que
    // ninguém apanharia de outra forma.
    expect(saude.trialsExpiring).toBe(3);
    expect(listas.accountsExpiring7d).toHaveLength(saude.trialsExpiring);
    expect(listas.accountsExpiring7d.map((i) => i.id)).toEqual(["t-hoje", "t-3d", "t-7d"]);
    expect(ATTENTION_WINDOW_DAYS).toBe(7);
  });
});

describe("exclusão de contas de Administrador e de Loja_Modelo (R7.8)", () => {
  it("nenhuma das duas entra em lista nenhuma", () => {
    const listas = attentionLists({
      now: AGORA,
      accounts: [{ id: "admin-1", email: "admin@mobisno.ao", isAdmin: true, trialEndsAt: "2025-01-17T12:00:00.000Z" }],
      stores: [
        { id: "modelo-1", name: "Ekolo Sports (modelo)", state: "Rascunho", customization: { __template: { name: "Ekolo Sports" } } },
      ],
      withdrawals: [{ id: "lev-modelo", storeId: "modelo-1", storeName: "Ekolo Sports (modelo)", status: "requested" }],
    });

    // A conta de Administrador tem um teste a acabar em 2 dias e a Loja_Modelo
    // está em rascunho e sem Produtos: sem a exclusão, apareciam em três listas.
    expect(listas.accountsExpiring7d).toEqual([]);
    expect(listas.storesWithoutProducts).toEqual([]);
    expect(listas.storesUnpublished).toEqual([]);
    // O levantamento pertence à Loja_Modelo, que não é elegível: sai também.
    expect(listas.withdrawalsToApprove).toEqual([]);
  });
});

describe("totalidade: entradas degeneradas não lançam", () => {
  it("`businessHealth({})` devolve as seis métricas a zero", () => {
    expect(businessHealth({})).toEqual({
      monthRevenue: 0,
      activeSubscriptions: 0,
      trialsExpiring: 0,
      trialConversion: 0,
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

  it("`attentionLists` com campos do tipo errado devolve as cinco listas vazias", () => {
    // É a forma que os dados tomam quando uma consulta falha e o chamador em
    // JavaScript passa o que tem em mão. Nada disto é um array.
    const listas = attentionLists({ accounts: null, stores: 3 } as never);

    expect(listas.withdrawalsToApprove).toEqual([]);
    expect(listas.paymentsStuck).toEqual([]);
    expect(listas.accountsExpiring7d).toEqual([]);
    expect(listas.storesWithoutProducts).toEqual([]);
    expect(listas.storesUnpublished).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exemplo 4 — os cinco totais globais também excluem Loja_Modelo e Admin (R7.8)
// ---------------------------------------------------------------------------

/**
 * Estes totais eram contados em base de dados, dentro de `adminOverview()` de
 * `web/supabase/admin.ts`, e metade deles escapava à regra do R7.8: o volume de
 * vendas somava as encomendas de demonstração das Loja_Modelo e as contas eram um
 * `count` cru de `profiles`, com as contas de Administrador dentro. Agora saem de
 * `overviewCounts`, do mesmo âmbito das outras treze agregações — e por isso são
 * testáveis aqui, com valores exatos.
 */
describe("overviewCounts — totais globais sem Loja_Modelo e sem contas de Administrador (R7.8)", () => {
  /** Loja_Modelo do Administrador: publicada, com vendas e levantamento de demonstração. */
  const lojaModelo: StoreLike = {
    id: "loja-modelo",
    name: "Ekolo Sports (modelo)",
    ownerId: "admin-1",
    state: "Publicada",
    customization: { __template: { name: "Ekolo Sports" } },
  };

  const instantaneo: AdminMetricsInput = {
    now: AGORA,
    accounts: [
      { id: "conta-cliente", email: "ivo@exemplo.ao", plan: "basico", createdAt: "2024-12-01T00:00:00.000Z" },
      // Conta de Administrador: não é cliente e não entra em `accounts`.
      { id: "admin-1", email: "admin@mobisno.ao", isAdmin: true, createdAt: "2024-01-01T00:00:00.000Z" },
    ],
    stores: [
      lojaModelo,
      { id: "loja-real", name: "Kianda Moda", ownerId: "conta-cliente", state: "Publicada", createdAt: "2024-12-02T00:00:00.000Z" },
      { id: "loja-rascunho", name: "Kianda Casa", ownerId: "conta-cliente", state: "Rascunho", createdAt: "2024-12-03T00:00:00.000Z" },
    ],
    orders: [
      { storeId: "loja-real", status: "paid", amount: 30_000 },
      // Montante em texto: é assim que uma coluna `numeric` chega do Supabase.
      { storeId: "loja-real", status: "paid", amount: "12500" },
      // Encomenda aberta: ainda não é venda.
      { storeId: "loja-real", status: "open", amount: 99_999 },
      // Venda de demonstração da Loja_Modelo: era isto que inflacionava o total.
      { storeId: "loja-modelo", status: "paid", amount: 500_000 },
      // Encomenda de uma Loja que não está no instantâneo: sem pertença, fora.
      { storeId: "loja-desconhecida", status: "paid", amount: 777 },
    ],
    withdrawals: [
      { id: "lev-real", storeId: "loja-real", status: "requested" },
      { id: "lev-modelo", storeId: "loja-modelo", status: "requested" },
      { id: "lev-pago", storeId: "loja-real", status: "paid" },
    ],
  };

  it("devolve os cinco totais com os valores exatos", () => {
    expect(overviewCounts(instantaneo)).toEqual({
      accounts: 1,
      stores: 2,
      published: 1,
      // 30 000 + 12 500. Sem os 500 000 da Loja_Modelo, sem os 99 999 da
      // encomenda aberta e sem os 777 da Loja que não existe.
      salesTotal: 42_500,
      pendingWithdrawals: 1,
    });
  });

  it("acrescentar uma Loja_Modelo com vendas pagas não move nenhum dos cinco totais", () => {
    const antes = overviewCounts(instantaneo);

    // O mesmo instantâneo com uma segunda Loja_Modelo, no início do array, com
    // uma encomenda paga e um levantamento por aprovar próprios.
    const comOutroModelo: AdminMetricsInput = {
      ...instantaneo,
      stores: [
        { id: "modelo-2", name: "Nzila Tech (modelo)", ownerId: "admin-1", state: "Publicada", customization: { __template: true } },
        ...(instantaneo.stores ?? []),
      ],
      orders: [{ storeId: "modelo-2", status: "paid", amount: 1_000_000 }, ...(instantaneo.orders ?? [])],
      withdrawals: [{ id: "lev-modelo-2", storeId: "modelo-2", status: "requested" }, ...(instantaneo.withdrawals ?? [])],
    };

    expect(overviewCounts(comOutroModelo)).toEqual(antes);
  });

  it("os totais coincidem com as métricas equivalentes das outras secções", () => {
    const totais = overviewCounts(instantaneo);
    const saude = businessHealth(instantaneo);
    const listas = attentionLists(instantaneo);

    // Ficam no mesmo ecrã: divergirem seria um defeito visível e inexplicável.
    expect(totais.published).toBe(saude.publishedStores);
    expect(totais.pendingWithdrawals).toBe(listas.withdrawalsToApprove.length);
  });

  it("com o instantâneo vazio ou degenerado devolve cinco zeros, sem lançar", () => {
    const zeros = { accounts: 0, stores: 0, published: 0, salesTotal: 0, pendingWithdrawals: 0 };

    expect(overviewCounts({})).toEqual(zeros);
    expect(overviewCounts(null as never)).toEqual(zeros);
    // A forma que os dados tomam quando uma consulta falha e o chamador em
    // JavaScript passa o que tem em mão: nada disto é um array.
    expect(overviewCounts({ accounts: null, stores: 3, orders: "x" } as never)).toEqual(zeros);
  });

  it("montantes impossíveis não produzem um volume de vendas negativo nem `NaN`", () => {
    const totais = overviewCounts({
      now: AGORA,
      stores: [{ id: "loja-real", state: "Publicada" }],
      orders: [
        { storeId: "loja-real", status: "paid", amount: -5_000 },
        { storeId: "loja-real", status: "paid", amount: "sem número" },
        { storeId: "loja-real", status: "paid", amount: null },
        { storeId: "loja-real", status: "paid", amount: 8_000 },
      ],
    });

    expect(totais.salesTotal).toBe(8_000);
    expect(Number.isFinite(totais.salesTotal)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exemplo 5 — `adminOverview()` delega a contagem e já não conta em cru
// ---------------------------------------------------------------------------

/**
 * `web/supabase/admin.ts` importa o cliente do Supabase e `tests/` compila com
 * `lib: ["ES2022"]`, sem DOM: o módulo não pode ser importado daqui, nem
 * estaticamente nem com `await import()` (a importação do cliente corre no
 * carregamento e toca em `window`/`localStorage`). As asserções são por isso
 * sobre o **texto-fonte**, o mesmo padrão `readFileSync` de
 * `tests/paymentsMirror.test.ts` e de `tests/seedRename.test.ts`.
 *
 * O que guardam: que a contagem continua a sair de `overviewCounts` — a função
 * pura testada acima — e que as consultas trazem as colunas de que a exclusão
 * depende. Um `count` cru de `profiles` ou um `select` de `orders` sem `store_id`
 * é a assinatura exata do defeito que existia aqui.
 */
describe("adminOverview — a contagem sai do domínio puro, não da base de dados (R7.8)", () => {
  const FONTE = readFileSync(join(__dirname, "..", "web", "supabase", "admin.ts"), "utf8");

  /** Corpo de `adminOverview`, do nome dela até ao `}` da coluna 0. */
  const CORPO = (() => {
    const i = FONTE.indexOf("export async function adminOverview(");
    expect(i, "adminOverview não encontrada em web/supabase/admin.ts").toBeGreaterThan(-1);
    const j = FONTE.indexOf("\n}", i);
    expect(j, "fim de adminOverview não encontrado").toBeGreaterThan(i);
    return FONTE.slice(i, j);
  })();

  it("importa `overviewCounts` de `src/services/adminMetrics.ts` e devolve o resultado", () => {
    expect(FONTE).toMatch(/import \{ overviewCounts \} from "\.\.\/\.\.\/src\/services\/adminMetrics\.js";/);
    expect(CORPO).toContain("return overviewCounts({");
  });

  it("lê `is_admin` de `profiles` em vez de um `count` cru", () => {
    // Sem `is_admin` não há como deixar as contas de Administrador fora.
    expect(CORPO).toContain('supabase.from("profiles").select("id, is_admin")');
    expect(CORPO).not.toContain('count: "exact"');
    expect(CORPO).not.toContain("head: true");
  });

  it("lê `store_id` das encomendas: é o que liga a venda à Loja que a fez", () => {
    expect(CORPO).toContain('supabase.from("orders").select("store_id, amount, status")');
    expect(CORPO).toMatch(/storeId: o\.store_id/);
  });

  it("lê as linhas dos levantamentos em vez de contar só as pedidas", () => {
    expect(CORPO).toContain('supabase.from("withdrawals").select("id, store_id, status")');
    expect(CORPO).not.toContain('.eq("status", "requested")');
    expect(CORPO).toMatch(/storeId: w\.store_id/);
  });

  it("passa a `customization` das Lojas, que é onde a marca de Loja_Modelo vive", () => {
    expect(CORPO).toContain('supabase.from("stores").select("id, owner_id, state, customization")');
    expect(CORPO).toContain("customization: s.customization");
  });

  it("não agrega nada por si: nem soma de encomendas nem filtro de `__template`", () => {
    // Cada uma destas expressões é uma agregação que voltaria a viver fora do
    // âmbito único do R7.8 — e a escapar-lhe, como já escapou.
    expect(CORPO).not.toContain(".reduce(");
    expect(CORPO).not.toContain("__template");
    expect(CORPO).not.toContain('=== "paid"');
    expect(CORPO).not.toContain('=== "Publicada"');
  });
});
