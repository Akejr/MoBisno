/**
 * Transações da Visão geral (`transactionOverview` em
 * `src/services/adminMetrics.ts`): subscrições e vendas das lojas, por
 * categoria, num período.
 *
 * O Administrador pediu para ver as transações «pendentes, concluídas e
 * canceladas», com controlo a sério. Estes testes fixam o que esse controlo
 * promete:
 *
 *  1. **as categorias**: `paid` é concluída, `open` é pendente, e tudo o resto
 *     (falhada, cancelada, expirada, desconhecida) é cancelada. Um estado que não
 *     se conhece nunca passa por dinheiro recebido;
 *  2. **o âmbito**: o de todas as métricas. As subscrições das contas de
 *     administração e as vendas das lojas-modelo e das lojas da equipa ficam de
 *     fora, como ficam dos números do topo;
 *  3. **o período**: dias e meses de Luanda (UTC+1), e não do navegador nem de
 *     UTC. Uma venda às 00:30 de Luanda é desse dia;
 *  4. **as contas batem certo**: a soma do gráfico é sempre o resumo, e a lista
 *     tem exatamente as transações do resumo;
 *  5. **as vendas não são receita**: entram nas transações, nunca na «Receita do
 *     mês».
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANGOLA_UTC_OFFSET_MINUTES,
  TX_CATEGORIES,
  TX_DEFAULT_PERIOD,
  TX_PERIODS,
  overviewKpis,
  transactionOverview,
  txCategory,
  txStatusLabel,
  type AdminMetricsInput,
  type OrderLike,
  type ServiceTxLike,
  type TransactionOverview,
  type TxKind,
} from "../src/services/adminMetrics.js";

const ROOT = join(__dirname, "..");

/** Sábado, 17 de outubro de 2026, 13:00 em Luanda. */
const AGORA = "2026-10-17T12:00:00.000Z";
const DIA = 86_400_000;
const HORA = 3_600_000;

const ACCOUNTS = [
  { id: "dono-1", email: "ana@exemplo.ao", name: "Ana" },
  { id: "admin-1", email: "equipa@mobisno.ao", isAdmin: true },
];

const STORES = [
  { id: "loja-1", name: "Loja da Ana", ownerId: "dono-1", identifier: "ana" },
  { id: "loja-modelo", name: "Lumière", ownerId: "dono-1", identifier: "modelo-lumiere" },
  { id: "loja-marcada", name: "Galeria", ownerId: "dono-1", identifier: "galeria", customization: { __template: "galeria" } },
  { id: "loja-equipa", name: "Loja de teste", ownerId: "admin-1", identifier: "teste" },
];

function plan(id: string, status: string, createdAt: string, extra: Partial<ServiceTxLike> = {}): ServiceTxLike {
  return {
    id,
    service: "plan",
    ownerId: "dono-1",
    ownerEmail: "ana@exemplo.ao",
    ownerName: "Ana",
    amount: 2000,
    method: "mcx",
    status,
    createdAt,
    paidAt: status === "paid" ? createdAt : null,
    ...extra,
  };
}

function order(id: string, status: string, createdAt: string, extra: Partial<OrderLike> = {}): OrderLike {
  return {
    id,
    storeId: "loja-1",
    storeName: "Loja da Ana",
    customerName: "Bruno",
    amount: 5000,
    method: "reference",
    status,
    createdAt,
    paidAt: status === "paid" ? createdAt : null,
    ...extra,
  };
}

function input(transactions: readonly ServiceTxLike[], orders: readonly OrderLike[] = []): AdminMetricsInput {
  return { now: AGORA, accounts: ACCOUNTS, stores: STORES, transactions, orders };
}

/** Soma de uma categoria em todos os intervalos do gráfico. */
function somaDoGrafico(ov: TransactionOverview, campo: "concluida" | "pendente" | "cancelada" | "amount"): number {
  return ov.series.reduce((s, b) => s + b[campo], 0);
}

// ---------------------------------------------------------------------------
// 1. Categorias
// ---------------------------------------------------------------------------

describe("txCategory: as três categorias que o Administrador pediu", () => {
  it("paga é concluída, aberta é pendente", () => {
    expect(txCategory("paid")).toBe("concluida");
    expect(txCategory("open")).toBe("pendente");
    expect(txCategory("pending")).toBe("pendente");
  });

  it("falhada, cancelada e expirada contam como canceladas", () => {
    expect(txCategory("failed")).toBe("cancelada");
    expect(txCategory("cancelled")).toBe("cancelada");
    expect(txCategory("expired")).toBe("cancelada");
  });

  it("um estado desconhecido nunca passa por dinheiro recebido nem a caminho", () => {
    for (const s of ["", "refunded", "PAGO", null, undefined, 42, {}, "constructor"]) {
      expect(txCategory(s), String(s)).toBe("cancelada");
    }
  });

  it("lê o estado sem olhar a maiúsculas nem a espaços", () => {
    expect(txCategory(" PAID ")).toBe("concluida");
    expect(txCategory("Open")).toBe("pendente");
  });

  it("o selo distingue o que a categoria junta, e bate com ela", () => {
    expect(txStatusLabel("paid")).toBe("Concluída");
    expect(txStatusLabel("open")).toBe("Pendente");
    expect(txStatusLabel("failed")).toBe("Falhada");
    expect(txStatusLabel("cancelled")).toBe("Cancelada");
    expect(txStatusLabel("expired")).toBe("Expirada");
    // Um estado desconhecido conta como cancelado: o selo não pode dizer outra coisa.
    expect(txStatusLabel("refunded")).toBe("Cancelada");
    expect(txStatusLabel("constructor")).toBe("Cancelada");
    expect(txStatusLabel(undefined)).toBe("Cancelada");
  });
});

// ---------------------------------------------------------------------------
// 2. Âmbito
// ---------------------------------------------------------------------------

describe("transactionOverview: o âmbito é o das outras métricas", () => {
  const ov = transactionOverview(
    input(
      [
        plan("p-dono", "paid", "2026-10-15T10:00:00Z"),
        plan("p-admin", "paid", "2026-10-15T10:00:00Z", { ownerId: "admin-1", ownerEmail: "equipa@mobisno.ao" }),
        // Linha antiga de outro serviço: já não é uma subscrição.
        plan("p-sms", "paid", "2026-10-15T10:00:00Z", { service: "sms" }),
      ],
      [
        order("o-loja", "paid", "2026-10-15T10:00:00Z"),
        order("o-modelo", "paid", "2026-10-15T10:00:00Z", { storeId: "loja-modelo" }),
        order("o-marcada", "paid", "2026-10-15T10:00:00Z", { storeId: "loja-marcada" }),
        order("o-equipa", "paid", "2026-10-15T10:00:00Z", { storeId: "loja-equipa" }),
        order("o-desconhecida", "paid", "2026-10-15T10:00:00Z", { storeId: "loja-que-nao-existe" }),
      ],
    ),
  );

  it("só entram a subscrição do Dono e a venda da loja dele", () => {
    expect(ov.items.map((t) => t.id).sort()).toEqual(["o-loja", "p-dono"]);
    expect(ov.summary.total.count).toBe(2);
  });

  it("sem vendas de lojas elegíveis, não há vendas", () => {
    const soModelos = transactionOverview(input([], [order("o-modelo", "paid", "2026-10-15T10:00:00Z", { storeId: "loja-modelo" })]));
    expect(soModelos.hasOrders).toBe(false);
    expect(ov.hasOrders).toBe(true);
  });

  it("as vendas são dinheiro dos Donos: nunca entram na «Receita do mês»", () => {
    const base = input([plan("p", "paid", "2026-10-15T10:00:00Z")]);
    const comVendas = input([plan("p", "paid", "2026-10-15T10:00:00Z")], [order("o", "paid", "2026-10-15T10:00:00Z", { amount: 900000 })]);
    expect(overviewKpis(comVendas).monthRevenue).toBe(overviewKpis(base).monthRevenue);
    expect(overviewKpis(comVendas).monthRevenue).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// 3. Período, em hora de Luanda
// ---------------------------------------------------------------------------

describe("transactionOverview: os períodos", () => {
  it("abre em 30 dias, e há os três períodos dos botões", () => {
    expect(TX_DEFAULT_PERIOD).toBe("30d");
    expect(TX_PERIODS).toEqual(["7d", "30d", "12m"]);
    expect(transactionOverview(input([])).period).toBe("30d");
  });

  it("7 dias: um intervalo por dia, com hoje, a começar à meia-noite de Luanda", () => {
    const ov = transactionOverview(input([]), { period: "7d" });
    expect(ov.unit).toBe("day");
    expect(ov.series).toHaveLength(7);
    // 11 de outubro, 00:00 em Luanda, é 10 de outubro às 23:00 em UTC.
    expect(new Date(ov.from).toISOString()).toBe("2026-10-10T23:00:00.000Z");
    expect(new Date(ov.series[6]!.start).toISOString()).toBe("2026-10-16T23:00:00.000Z");
    ov.series.forEach((b, i) => expect(b.start - ov.from).toBe(i * DIA));
  });

  it("30 dias: trinta intervalos seguidos, sem buracos", () => {
    const ov = transactionOverview(input([]), { period: "30d" });
    expect(ov.series).toHaveLength(30);
    expect(new Date(ov.from).toISOString()).toBe("2026-09-17T23:00:00.000Z");
    ov.series.forEach((b, i) => expect(b.start - ov.from).toBe(i * DIA));
  });

  it("12 meses: um intervalo por mês, com o atual, do dia 1 em Luanda", () => {
    const ov = transactionOverview(input([]), { period: "12m" });
    expect(ov.unit).toBe("month");
    expect(ov.series).toHaveLength(12);
    expect(ov.series.map((b) => new Date(b.start).toISOString())).toEqual([
      "2025-10-31T23:00:00.000Z",
      "2025-11-30T23:00:00.000Z",
      "2025-12-31T23:00:00.000Z",
      "2026-01-31T23:00:00.000Z",
      "2026-02-28T23:00:00.000Z",
      "2026-03-31T23:00:00.000Z",
      "2026-04-30T23:00:00.000Z",
      "2026-05-31T23:00:00.000Z",
      "2026-06-30T23:00:00.000Z",
      "2026-07-31T23:00:00.000Z",
      "2026-08-31T23:00:00.000Z",
      "2026-09-30T23:00:00.000Z",
    ]);
  });

  it("o fuso de Luanda é UTC+1, fixo", () => {
    expect(ANGOLA_UTC_OFFSET_MINUTES).toBe(60);
  });

  it("uma venda às 00:30 de Luanda é desse dia, e não do anterior", () => {
    const ov = transactionOverview(
      input([], [
        order("meia-noite-e-meia", "paid", "2026-10-16T23:30:00Z"), // 17 out., 00:30 em Luanda
        order("quase-meia-noite", "paid", "2026-10-16T22:59:59Z"), // 16 out., 23:59 em Luanda
      ]),
      { period: "7d" },
    );
    expect(ov.series[6]!.concluida).toBe(1);
    expect(ov.series[5]!.concluida).toBe(1);
  });

  it("a fronteira do período é a meia-noite de Luanda do primeiro dia", () => {
    const ov = transactionOverview(
      input([], [
        order("dentro", "open", "2026-10-10T23:00:00.000Z"),
        order("fora", "open", "2026-10-10T22:59:59.999Z"),
      ]),
      { period: "7d" },
    );
    expect(ov.items.map((t) => t.id)).toEqual(["dentro"]);
    expect(ov.series[0]!.pendente).toBe(1);
  });

  it("o mês também é o de Luanda: a 1 de janeiro às 00:30 já é janeiro", () => {
    const ov = transactionOverview(input([plan("ano-novo", "paid", "2025-12-31T23:30:00Z")]), { period: "12m" });
    // Novembro, dezembro, janeiro: o terceiro intervalo.
    expect(ov.series[2]!.concluida).toBe(1);
    expect(ov.series[1]!.concluida).toBe(0);
  });

  it("o mês atual muda à meia-noite de Luanda, e não à de UTC", () => {
    // 30 de setembro às 23:30 em UTC já é 1 de outubro em Luanda.
    const ov = transactionOverview(input([]), { period: "12m" }, "2026-09-30T23:30:00Z");
    expect(new Date(ov.series[11]!.start).toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });

  it("uma data no futuro (relógio adiantado) conta no último intervalo; uma ilegível fica de fora", () => {
    const ov = transactionOverview(
      input([], [
        order("futuro", "paid", "2026-10-25T10:00:00Z"),
        order("ilegivel", "paid", "não é data"),
        order("sem-data", "paid", "", { createdAt: null }),
      ]),
      { period: "7d" },
    );
    expect(ov.items.map((t) => t.id)).toEqual(["futuro"]);
    expect(ov.series[6]!.concluida).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. As contas batem certo
// ---------------------------------------------------------------------------

describe("transactionOverview: o resumo, o gráfico e a lista", () => {
  const dados = input(
    [
      plan("p1", "paid", "2026-10-17T08:00:00Z"),
      plan("p2", "open", "2026-10-16T08:00:00Z"),
      plan("p3", "expired", "2026-10-02T08:00:00Z"),
      plan("p-antigo", "paid", "2026-01-02T08:00:00Z"),
    ],
    [
      order("o1", "paid", "2026-10-17T09:00:00Z", { amount: 7000 }),
      order("o2", "failed", "2026-10-12T09:00:00Z"),
      order("o3", "cancelled", "2026-09-20T09:00:00Z"),
      order("o4", "paid", "2026-09-19T09:00:00Z", { amount: -50 }),
    ],
  );

  it("conta por categoria, com os montantes", () => {
    const ov = transactionOverview(dados, { period: "30d" });
    expect(ov.summary.concluida).toEqual({ count: 3, amount: 2000 + 7000 + 0 });
    expect(ov.summary.pendente).toEqual({ count: 1, amount: 2000 });
    expect(ov.summary.cancelada).toEqual({ count: 3, amount: 2000 + 5000 + 5000 });
    expect(ov.summary.total).toEqual({ count: 7, amount: 9000 + 2000 + 12000 });
  });

  it("o gráfico soma exatamente o resumo, e o montante é o das concluídas", () => {
    for (const period of TX_PERIODS) {
      const ov = transactionOverview(dados, { period });
      for (const c of TX_CATEGORIES) expect(somaDoGrafico(ov, c), `${period} ${c}`).toBe(ov.summary[c].count);
      expect(somaDoGrafico(ov, "amount"), period).toBe(ov.summary.concluida.amount);
    }
  });

  it("12 meses apanha o que 30 dias deixa de fora", () => {
    expect(transactionOverview(dados, { period: "12m" }).summary.total.count).toBe(8);
    expect(transactionOverview(dados, { period: "7d" }).summary.total.count).toBe(4);
  });

  it("a lista vem da mais recente para a mais antiga, com desempate fixo", () => {
    const empate = input(
      [plan("b", "paid", "2026-10-17T08:00:00Z"), plan("a", "paid", "2026-10-17T08:00:00Z")],
      [order("a", "paid", "2026-10-17T08:00:00Z"), order("z", "open", "2026-10-17T10:00:00Z")],
    );
    const ov = transactionOverview(empate);
    expect(ov.items.map((t) => `${t.kind}:${t.id}`)).toEqual(["order:z", "order:a", "plan:a", "plan:b"]);
  });

  it("a origem escolhe o que entra no resumo, no gráfico e na lista", () => {
    const so = (kind: TxKind) => transactionOverview(dados, { period: "30d", kind });
    expect(so("plan").items.every((t) => t.kind === "plan")).toBe(true);
    expect(so("order").items.every((t) => t.kind === "order")).toBe(true);
    expect(so("plan").summary.total.count + so("order").summary.total.count).toBe(
      transactionOverview(dados, { period: "30d" }).summary.total.count,
    );
  });

  it("a categoria só filtra a lista: o resumo e o gráfico continuam com as três", () => {
    const todas = transactionOverview(dados, { period: "30d" });
    const pendentes = transactionOverview(dados, { period: "30d", category: "pendente" });
    expect(pendentes.items.map((t) => t.id)).toEqual(["p2"]);
    expect(pendentes.summary).toEqual(todas.summary);
    expect(pendentes.series).toEqual(todas.series);
  });

  it("cada linha traz o que a lista mostra", () => {
    const [venda] = transactionOverview(dados, { period: "7d", kind: "order" }).items;
    expect(venda).toMatchObject({
      id: "o1",
      kind: "order",
      category: "concluida",
      status: "paid",
      amount: 7000,
      method: "reference",
      who: "Bruno",
      store: "Loja da Ana",
    });
    const [sub] = transactionOverview(dados, { period: "7d", kind: "plan" }).items;
    expect(sub).toMatchObject({ id: "p1", kind: "plan", who: "ana@exemplo.ao", method: "mcx" });
  });

  it("em centenas de transações ao acaso, o gráfico e a lista batem sempre com o resumo", () => {
    // Gerador determinístico: os mesmos dados em todas as corridas.
    let seed = 20261017;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const estados = ["paid", "open", "failed", "cancelled", "expired", "pending", "???"];
    const agora = Date.parse(AGORA);
    const subs: ServiceTxLike[] = [];
    const vendas: OrderLike[] = [];
    for (let i = 0; i < 400; i += 1) {
      const quando = new Date(agora + Math.round((rand() * 420 - 400) * DIA + rand() * 23 * HORA)).toISOString();
      const estado = estados[Math.floor(rand() * estados.length)]!;
      const montante = Math.round(rand() * 20000);
      if (rand() < 0.5) subs.push(plan(`p${i}`, estado, quando, { amount: montante }));
      else vendas.push(order(`o${i}`, estado, quando, { amount: montante, storeId: rand() < 0.2 ? "loja-modelo" : "loja-1" }));
    }
    for (const period of TX_PERIODS) {
      for (const kind of ["all", "plan", "order"] as const) {
        const ov = transactionOverview(input(subs, vendas), { period, kind });
        for (const c of TX_CATEGORIES) expect(somaDoGrafico(ov, c)).toBe(ov.summary[c].count);
        expect(ov.items).toHaveLength(ov.summary.total.count);
        expect(ov.items.every((t) => t.createdAt >= ov.from)).toBe(true);
        for (let i = 1; i < ov.items.length; i += 1) {
          expect(ov.items[i - 1]!.createdAt).toBeGreaterThanOrEqual(ov.items[i]!.createdAt);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Totalidade
// ---------------------------------------------------------------------------

describe("transactionOverview: nunca lança", () => {
  it("com entradas vazias, partidas ou de outro tipo", () => {
    const lixo: unknown[] = [
      undefined,
      null,
      {},
      { orders: "não é lista", transactions: 42 },
      { orders: [null, undefined, 3, { id: 7 }], transactions: [null, { service: "plan", createdAt: 12 }] },
      { now: "não é data", stores: [null, { id: "x", customization: [1, 2] }] },
      { now: 8.64e15, transactions: [plan("p", "paid", AGORA)] },
      { now: -8.64e15 },
    ];
    for (const entrada of lixo) {
      for (const period of [...TX_PERIODS, "outro", undefined]) {
        const ov = transactionOverview(entrada as AdminMetricsInput, { period: period as never, kind: "x" as never, category: "y" as never });
        expect(ov.summary.total.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(ov.items)).toBe(true);
      }
    }
  });

  it("um período desconhecido abre em 30 dias", () => {
    expect(transactionOverview(input([]), { period: "1y" as never }).period).toBe("30d");
    expect(transactionOverview(input([]), null).series).toHaveLength(30);
  });

  it("um montante ilegível ou negativo conta como zero, e a transação conta", () => {
    const ov = transactionOverview(input([], [
      order("a", "paid", "2026-10-15T10:00:00Z", { amount: "abc" }),
      order("b", "paid", "2026-10-15T10:00:00Z", { amount: -10 }),
      order("c", "paid", "2026-10-15T10:00:00Z", { amount: "1500" }),
    ]));
    expect(ov.summary.concluida).toEqual({ count: 3, amount: 1500 });
  });
});

// ---------------------------------------------------------------------------
// A vista usa o domínio
// ---------------------------------------------------------------------------

describe("Visão geral: as transações saem do domínio", () => {
  const VISAO = readFileSync(join(ROOT, "web/views/admin/overview.ts"), "utf8");

  it("a vista não agrega por si: chama transactionOverview", () => {
    expect(VISAO).toContain("transactionOverview(");
    expect(VISAO).toContain("listStoreOrders()");
  });

  it("uma falha a ler as vendas não apaga a Visão geral", () => {
    expect(VISAO).toMatch(/listStoreOrders\(\)\.catch\(/);
  });
});
