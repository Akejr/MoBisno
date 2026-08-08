/**
 * Preço **por Loja publicada** (domínio + onde é imposto).
 *
 * A regra nova: a subscrição paga uma Loja online, e cada Loja adicional custa
 * outro ciclo. Uma Loja em rascunho não conta — é isso que permite ao Dono
 * despublicar no ecrã de pagamento e ver a mensalidade descer. Administradores
 * não pagam e não têm limite.
 *
 * Três coisas aqui podem custar dinheiro real se deixarem de valer, e é por isso
 * que cada uma tem asserção própria:
 *
 * 1. **O montante é calculado no servidor.** `api/payment.js` conta as Lojas
 *    publicadas na base de dados. Aceitar o preço que o navegador envia era
 *    deixar qualquer pessoa subscrever por 1 Kz — e, com preço por Loja, escolher
 *    também por quantas Lojas paga.
 * 2. **Publicar a mais é proporcional aos dias que faltam.** Cobrar um ciclo
 *    inteiro a meio do mês era cobrar segunda vez as Lojas já pagas.
 * 3. **O espelho de preços entre `src/` e `api/`.** A parede de importação
 *    (`SEO.md` §5.2) obriga à cópia; mudar o preço num sítio e esquecer o outro
 *    cobra um valor e ativa outro.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRICE_KZ, STORES_INCLUDED, billableStores, priceFor, proratedStorePrice, daysOf,
} from "../src/services/plans.js";
import { resolveBilling, canPublishStore, planActivationPatch } from "../src/services/billing.js";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Data futura a `dias` de distância, em ISO. */
const emDias = (dias: number, now = Date.now()): string => new Date(now + dias * 86_400_000).toISOString();

describe("Preço por Loja — a aritmética", () => {
  it("uma Loja custa o preço de sempre: quem tem uma não nota diferença", () => {
    expect(STORES_INCLUDED).toBe(1);
    expect(priceFor("mensal", 1)).toBe(PRICE_KZ.mensal);
    expect(priceFor("anual", 1)).toBe(PRICE_KZ.anual);
  });

  it("cada Loja publicada acrescenta um ciclo completo, sem desconto de volume", () => {
    expect(priceFor("mensal", 2)).toBe(PRICE_KZ.mensal * 2);
    expect(priceFor("mensal", 3)).toBe(PRICE_KZ.mensal * 3);
    expect(priceFor("anual", 4)).toBe(PRICE_KZ.anual * 4);
  });

  it("zero, negativo, fracionário e disparates contam como uma Loja", () => {
    // A conta do que alguém paga não pode depender de um valor não validado — e um
    // `NaN` aqui chegava ao montante enviado ao serviço de pagamento.
    for (const entrada of [0, -5, 0.4, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "3", {}, []]) {
      expect(billableStores(entrada), `entrada=${JSON.stringify(entrada)}`).toBe(1);
    }
    expect(billableStores(2.9)).toBe(2);
    expect(priceFor("mensal", Number.NaN)).toBe(PRICE_KZ.mensal);
  });

  it("a Loja adicional a meio do ciclo é proporcional aos dias que faltam", () => {
    const mes = daysOf("mensal");
    expect(proratedStorePrice("mensal", mes)).toBe(PRICE_KZ.mensal);
    expect(proratedStorePrice("mensal", 0)).toBe(0);
    // Metade do ciclo, metade do preço.
    expect(proratedStorePrice("mensal", mes / 2)).toBe(Math.round(PRICE_KZ.mensal / 2));
    // Nunca mais do que um ciclo, mesmo com uma data empurrada para longe.
    expect(proratedStorePrice("mensal", 9999)).toBe(PRICE_KZ.mensal);
    expect(proratedStorePrice("mensal", Number.NaN)).toBe(PRICE_KZ.mensal);
  });
});

describe("Lugares pagos — leitura do estado da conta", () => {
  it("ausência de `plan_stores` vale uma Loja (contas anteriores à migração)", () => {
    const b = resolveBilling({ planExpiresAt: emDias(10) });
    expect(b.paidStores).toBe(1);
    expect(resolveBilling({ planExpiresAt: emDias(10), planStores: null }).paidStores).toBe(1);
  });

  it("com subscrição ativa, os lugares são os que a conta pagou", () => {
    expect(resolveBilling({ planExpiresAt: emDias(3), planStores: 3 }).paidStores).toBe(3);
  });

  it("sem subscrição ativa não há lugares", () => {
    expect(resolveBilling({ planExpiresAt: null, planStores: 5 }).paidStores).toBe(0);
    expect(resolveBilling({ planExpiresAt: emDias(-1), planStores: 5 }).paidStores).toBe(0);
  });

  it("um administrador não tem limite", () => {
    const b = resolveBilling({ planExpiresAt: null, isAdmin: true });
    expect(b.paidStores).toBe(Number.POSITIVE_INFINITY);
    expect(b.accessActive).toBe(true);
  });
});

describe("Publicar mais uma Loja — as três respostas", () => {
  it("administrador publica sempre, e sem pagar", () => {
    const b = resolveBilling({ planExpiresAt: null, isAdmin: true });
    const d = canPublishStore(b, 47);
    expect(d).toEqual({ allowed: true, amountDue: 0, reason: "ok" });
  });

  it("sem subscrição, o que falta é subscrever", () => {
    const d = canPublishStore(resolveBilling({ planExpiresAt: null }), 0);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("sem-subscricao");
    expect(d.amountDue).toBe(PRICE_KZ.mensal);
  });

  it("com lugar livre publica sem pagar nada", () => {
    const b = resolveBilling({ planExpiresAt: emDias(20), planStores: 2 });
    expect(canPublishStore(b, 1)).toEqual({ allowed: true, amountDue: 0, reason: "ok" });
  });

  it("com os lugares ocupados, cobra só os dias que faltam", () => {
    const b = resolveBilling({ planExpiresAt: emDias(15), planStores: 1 });
    const d = canPublishStore(b, 1);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("sem-lugar");
    // 15 dias de 30 ≈ meio ciclo. `daysRemaining` arredonda para cima.
    expect(d.amountDue).toBeGreaterThan(0);
    expect(d.amountDue).toBeLessThanOrEqual(PRICE_KZ.mensal);
  });
});

describe("Ativação — as Lojas pagas ficam gravadas", () => {
  it("grava as Lojas que o pagamento cobre, e o fim do ciclo", () => {
    const now = Date.parse("2026-03-01T00:00:00.000Z");
    const patch = planActivationPatch({ planExpiresAt: null }, "mensal", now, 3);
    expect(patch.plan_stores).toBe(3);
    expect(patch.plan_expires_at).toBe(new Date(now + 30 * 86_400_000).toISOString());
  });

  it("renovar acrescenta ao fim do período atual, sem perder dias", () => {
    const now = Date.parse("2026-03-01T00:00:00.000Z");
    const fim = new Date(now + 10 * 86_400_000).toISOString();
    const patch = planActivationPatch({ planExpiresAt: fim, planStores: 1 }, "mensal", now, 2);
    expect(patch.plan_expires_at).toBe(new Date(Date.parse(fim) + 30 * 86_400_000).toISOString());
    expect(patch.plan_stores).toBe(2);
  });

  it("pode descer: despublicar antes de pagar é a forma de pagar menos", () => {
    const now = Date.parse("2026-03-01T00:00:00.000Z");
    const fim = new Date(now + 5 * 86_400_000).toISOString();
    expect(planActivationPatch({ planExpiresAt: fim, planStores: 3 }, "mensal", now, 1).plan_stores).toBe(1);
  });

  it("sem número de Lojas no pagamento, fica o que a conta já tinha", () => {
    // Uma referência bancária gravada antes desta mudança não traz `stores`.
    const now = Date.now();
    expect(planActivationPatch({ planExpiresAt: null, planStores: 2 }, "mensal", now).plan_stores).toBe(2);
    expect(planActivationPatch({ planExpiresAt: null }, "mensal", now).plan_stores).toBe(1);
  });
});

describe("Onde a regra é imposta — servidor, base de dados e painel", () => {
  const PAYMENT = read("api/payment.js");
  const SHARED = read("api/_shared.js");
  const MIGRACAO = read("supabase/migrations/0020_stores_per_plan.sql");
  const DASHBOARD = read("web/views/dashboard.ts");
  const CHECKOUT = read("web/lib/planCheckout.ts");

  it("o montante do plano é calculado no servidor, a partir da base de dados", () => {
    expect(PAYMENT).toContain("countPublishedStores(db");
    expect(PAYMENT).toContain("PLAN_PRICE_KZ[period]");
    // O `products` que o cliente envia é **substituído**, não validado.
    expect(PAYMENT).toMatch(/if \(kind === "plan"\)[\s\S]{0,700}products = \[\{/);
  });

  it("o preço espelhado em `api/` é igual ao do domínio", () => {
    expect(SHARED).toContain(`export const PLAN_PRICE_KZ = { mensal: ${PRICE_KZ.mensal}, anual: ${PRICE_KZ.anual} };`);
  });

  it("a contagem do servidor exclui lojas-modelo, como o painel", () => {
    expect(SHARED).toMatch(/startsWith\("modelo-"\)/);
    expect(MIGRACAO).toContain("identifier not like 'modelo-%'");
  });

  it("as Lojas pagas viajam com o pagamento até à ativação", () => {
    // Uma referência paga dias depois ativa o que foi cobrado, não o número de
    // Lojas do dia em que foi paga.
    expect(PAYMENT).toContain("stores: planStores");
    expect(PAYMENT).toContain("activatePlan(db, String(body.ownerId), period, planStores)");
    for (const ficheiro of ["api/webhook.js", "api/payment-status.js"]) {
      expect(read(ficheiro), ficheiro).toContain("planPaymentStores(db,");
    }
    expect(SHARED).toContain("plan_stores: lojas");
  });

  /*
   * A migração 0020 pode ainda não ter corrido. Um `select`, `insert` ou `update`
   * com uma coluna inexistente **falha o pedido inteiro** — não devolve as outras
   * colunas a `null`. Foi assim que um administrador com duas lojas online passou
   * a ver «Sem subscrição ativa» e os cartões de preço: o pedido falhava e
   * `is_admin` vinha vazio. Nos caminhos de pagamento, o mesmo custava dinheiro.
   */
  it("a leitura da conta sobrevive à coluna que ainda não existe", () => {
    const COMPOSITION = read("web/composition.ts");
    expect(COMPOSITION).toContain("let temColunaPlanStores = true;");
    expect(COMPOSITION).toMatch(/if \(res\.error && temColunaPlanStores\)[\s\S]{0,120}res = await ler\(false\)/);
    // Sem a segunda tentativa, `is_admin` não chegava a ser lido.
    expect(COMPOSITION).toContain('select(comLojas ? "plan_expires_at, is_admin, plan_stores" : "plan_expires_at, is_admin")');
  });

  it("registar e ativar um pagamento não depende da coluna nova", () => {
    // O pagamento já foi iniciado na MoMenu: falhar aqui era dinheiro cobrado sem
    // registo, ou registo sem subscrição ativada.
    expect(PAYMENT).toMatch(/if \(ins\.error\) ins = await db\.from\("plan_payments"\)\.insert\(linha\)/);
    expect(SHARED).toMatch(/if \(comLojas\.error\)[\s\S]{0,220}select\("plan_expires_at"\)/);
    expect(SHARED).toMatch(/if \(escrita\.error && temColunaLojas\)[\s\S]{0,160}plan_expires_at: fim \}\)/);
    // A leitura de `stores` da transação é feita à parte, pela mesma razão.
    expect(SHARED).toContain("export async function planPaymentStores(");
  });

  it("a base de dados também impõe o lugar pago, e isenta o administrador", () => {
    expect(MIGRACAO).toContain("plan_stores integer not null default 1");
    expect(MIGRACAO).toContain("STORE_SLOT_REQUIRED");
    expect(MIGRACAO).toContain("published_store_count");
    // Sem esta isenção, o administrador não conseguia criar as lojas-modelo.
    expect(MIGRACAO).toMatch(/if coalesce\(admin_conta, false\) then\s*\r?\n\s*return new;/);
  });

  it("o painel usa a decisão do domínio, e não uma comparação escrita à mão", () => {
    expect(DASHBOARD).toContain("canPublishStore(billing, publicadas");
    expect(DASHBOARD).toContain("priceFor(ciclo, n)");
    // O ecrã do Plano tem o interruptor por loja — é o que baixa a mensalidade.
    expect(DASHBOARD).toContain("data-pub-store");
    expect(DASHBOARD).toContain('data-total="${ciclo}"');
  });

  it("o checkout diz que o valor apresentado é confirmado pelo servidor", () => {
    expect(CHECKOUT).toContain("priceFor(period, lojas)");
    expect(CHECKOUT).toMatch(/recalculado em[\s\S]{0,80}api\/payment\.js/);
  });

  it("a orientação do assistente explica o preço por loja", () => {
    const CONTEXT = read("web/lib/assistantContext.ts");
    expect(CONTEXT).toContain("O PREÇO É POR LOJA PUBLICADA");
    expect(CONTEXT).toContain("Uma loja em rascunho não é cobrada");
    expect(CONTEXT).toContain("Contas de ADMINISTRADOR da MôBisno não pagam");
    // Os números da orientação continuam a sair do domínio, nunca escritos à mão.
    expect(CONTEXT).toContain("kz(PRICE_KZ.mensal * 2)");
  });
});
