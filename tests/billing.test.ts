/**
 * Subscrição de uma conta (`src/services/billing.ts`).
 *
 * ## A avaria que estes exemplos guardam
 *
 * A versão anterior tinha cinco ramos a interagir — plano pago dentro do prazo,
 * plano agendado, teste grátis, atribuição permanente e expirado — e um deles
 * era um acidente: um plano gravado SEM data de expiração contava como
 * permanente. O espelho que corre nas funções serverless não tinha esse ramo e
 * lia «básico»; o painel dizia ao Dono que o plano estava ativo e os clientes
 * dele batiam em `PLAN_NOT_COVERED` no checkout.
 *
 * Agora a regra é uma: **ativo se for administrador, ou se `planExpiresAt` for
 * futuro.** Publicar pergunta só isso (`canPublishStore(state)`), e pagar soma
 * períodos de 30 dias ao fim do período em curso (`planActivationPatch`).
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O estado tem quatro casos nomeáveis — administrador, pago, caducado, nunca
 * pagou — e a fronteira entre eles é um instante. É isso que se enumera, com o
 * dia exato da fronteira. A paridade com o servidor, essa sim sobre perfis
 * gerados, vive em `tests/planParity.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { resolveBilling, canPublishStore, planActivationPatch, type BillingState } from "../src/services/billing.js";
import { PLAN_PERIOD_DAYS } from "../src/services/plans.js";

const DIA = 86_400_000;
const PERIODO = PLAN_PERIOD_DAYS * DIA;
const AGORA = Date.parse("2026-06-01T00:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

describe("resolveBilling — quatro estados, sem ramos escondidos", () => {
  it("administrador tem acesso sem nunca pagar", () => {
    const s = resolveBilling({ planExpiresAt: null, isAdmin: true }, AGORA);
    expect(s).toEqual<BillingState>({
      accessActive: true,
      expiresAt: null,
      daysRemaining: null,
      expired: false,
      byAdmin: true,
      suspended: false,
    });
  });

  it("administrador com um período antigo caducado continua ativo, por ser administrador", () => {
    const s = resolveBilling({ planExpiresAt: iso(AGORA - 5 * DIA), isAdmin: true }, AGORA);
    expect(s.accessActive).toBe(true);
    expect(s.byAdmin).toBe(true);
    expect(s.suspended).toBe(false);
    // A data diz que o período pago acabou; o acesso vem de outro lado.
    expect(s.expired).toBe(true);
    expect(s.expiresAt).toBeNull();
  });

  it("subscrição paga e dentro do prazo", () => {
    const fim = AGORA + 10 * DIA;
    const s = resolveBilling({ planExpiresAt: iso(fim) }, AGORA);
    expect(s).toEqual<BillingState>({
      accessActive: true,
      expiresAt: iso(fim),
      daysRemaining: 10,
      expired: false,
      byAdmin: false,
      suspended: false,
    });
  });

  it("os dias que faltam arredondam para cima: falta um bocado de um dia, conta um dia", () => {
    expect(resolveBilling({ planExpiresAt: iso(AGORA + 1) }, AGORA).daysRemaining).toBe(1);
    expect(resolveBilling({ planExpiresAt: iso(AGORA + 10 * DIA - 1) }, AGORA).daysRemaining).toBe(10);
    expect(resolveBilling({ planExpiresAt: iso(AGORA + 10 * DIA + 1) }, AGORA).daysRemaining).toBe(11);
  });

  it("a data de fim volta normalizada em ISO", () => {
    const s = resolveBilling({ planExpiresAt: "2026-06-11T01:00:00+01:00" }, AGORA);
    expect(s.expiresAt).toBe("2026-06-11T00:00:00.000Z");
  });

  it("subscrição caducada suspende a conta e diz que caducou", () => {
    const s = resolveBilling({ planExpiresAt: iso(AGORA - DIA) }, AGORA);
    expect(s).toEqual<BillingState>({
      accessActive: false,
      expiresAt: null,
      daysRemaining: null,
      expired: true,
      byAdmin: false,
      suspended: true,
    });
  });

  it("quem nunca pagou está suspenso, mas não «caducado»", () => {
    // A distinção interessa ao painel: «Ative a subscrição» é uma mensagem
    // diferente de «A sua subscrição terminou».
    for (const planExpiresAt of [null, undefined, ""]) {
      const s = resolveBilling({ planExpiresAt }, AGORA);
      expect(s.accessActive, String(planExpiresAt)).toBe(false);
      expect(s.suspended, String(planExpiresAt)).toBe(true);
      expect(s.expired, String(planExpiresAt)).toBe(false);
    }
  });

  it("uma data ilegível conta como nunca ter pago", () => {
    const s = resolveBilling({ planExpiresAt: "não é uma data" }, AGORA);
    expect(s.accessActive).toBe(false);
    expect(s.expired).toBe(false);
    expect(s.suspended).toBe(true);
  });

  it("NÃO existe plano vitalício grátis", () => {
    // Era isto que dava o plano para sempre a quem o escolhesse no assistente
    // sem pagar. Sem data futura não há acesso, ponto final.
    expect(resolveBilling({ planExpiresAt: null, isAdmin: false }, AGORA).accessActive).toBe(false);
  });

  it("só `isAdmin === true` conta como administrador", () => {
    // A coluna chega da base de dados; um valor que não seja o booleano não
    // pode abrir o acesso por coerção.
    for (const isAdmin of ["true", 1, {}] as unknown as boolean[]) {
      expect(resolveBilling({ planExpiresAt: null, isAdmin }, AGORA).accessActive).toBe(false);
    }
  });

  it("o instante exato da expiração já não dá acesso", () => {
    expect(resolveBilling({ planExpiresAt: iso(AGORA) }, AGORA).accessActive).toBe(false);
    expect(resolveBilling({ planExpiresAt: iso(AGORA + 1) }, AGORA).accessActive).toBe(true);
  });
});

describe("canPublishStore(state) — uma pergunta só: a subscrição está ativa?", () => {
  it("recebe só o estado: não há contagem de lojas nem lugares pagos", () => {
    expect(canPublishStore.length).toBe(1);
  });

  it("com subscrição ativa publica", () => {
    const s = resolveBilling({ planExpiresAt: iso(AGORA + 3 * DIA) }, AGORA);
    expect(canPublishStore(s)).toEqual({ allowed: true, reason: "ok" });
  });

  it("o administrador publica sem pagar", () => {
    const s = resolveBilling({ planExpiresAt: null, isAdmin: true }, AGORA);
    expect(canPublishStore(s)).toEqual({ allowed: true, reason: "ok" });
  });

  it("sem subscrição — nunca paga ou caducada — o que falta é subscrever", () => {
    for (const planExpiresAt of [null, iso(AGORA - DIA), iso(AGORA)]) {
      const s = resolveBilling({ planExpiresAt }, AGORA);
      expect(canPublishStore(s), String(planExpiresAt)).toEqual({ allowed: false, reason: "sem-subscricao" });
    }
  });

  it("a decisão é exatamente `accessActive`", () => {
    for (const accessActive of [true, false]) {
      const s: BillingState = {
        accessActive, expiresAt: null, daysRemaining: null, expired: false, byAdmin: false, suspended: !accessActive,
      };
      expect(canPublishStore(s).allowed).toBe(accessActive);
    }
  });
});

describe("planActivationPatch — o que um pagamento confirmado grava", () => {
  it("grava só `plan_expires_at` (a 0023 largou `plan_stores`)", () => {
    // Um `update` com uma coluna que já não existe falha o pedido inteiro: a
    // subscrição paga ficava por ativar.
    const p = planActivationPatch({ planExpiresAt: null }, AGORA);
    expect(Object.keys(p)).toEqual(["plan_expires_at"]);
  });

  it("quem nunca pagou começa a contar de agora", () => {
    expect(planActivationPatch({ planExpiresAt: null }, AGORA).plan_expires_at).toBe(iso(AGORA + PERIODO));
    expect(planActivationPatch({ planExpiresAt: undefined }, AGORA).plan_expires_at).toBe(iso(AGORA + PERIODO));
  });

  it("um período são 30 dias", () => {
    expect(PERIODO).toBe(30 * DIA);
  });

  it("renovar acrescenta AO FIM do período em curso, sem perder dias", () => {
    // Quem paga adiantado não pode perder o tempo que ainda tinha.
    const fim = AGORA + 10 * DIA;
    expect(planActivationPatch({ planExpiresAt: iso(fim) }, AGORA).plan_expires_at).toBe(iso(fim + PERIODO));
  });

  it("um período já caducado não é aproveitado: conta a partir de agora", () => {
    // Somar ao fim de um período caducado dava menos dias do que os comprados.
    const p = planActivationPatch({ planExpiresAt: iso(AGORA - 100 * DIA) }, AGORA);
    expect(p.plan_expires_at).toBe(iso(AGORA + PERIODO));
  });

  it("no instante exato do fim, conta a partir de agora", () => {
    expect(planActivationPatch({ planExpiresAt: iso(AGORA) }, AGORA).plan_expires_at).toBe(iso(AGORA + PERIODO));
  });

  it("uma data gravada ilegível não estraga a ativação: conta a partir de agora", () => {
    expect(planActivationPatch({ planExpiresAt: "lixo" }, AGORA).plan_expires_at).toBe(iso(AGORA + PERIODO));
  });

  it("vários períodos de uma vez (ativação manual do administrador)", () => {
    expect(planActivationPatch({ planExpiresAt: null }, AGORA, 3).plan_expires_at).toBe(iso(AGORA + 3 * PERIODO));
    const fim = AGORA + 7 * DIA;
    expect(planActivationPatch({ planExpiresAt: iso(fim) }, AGORA, 12).plan_expires_at).toBe(iso(fim + 12 * PERIODO));
  });

  it("um número de períodos inválido vale um período", () => {
    // O valor pode vir de um formulário: nunca pode dar zero dias, dias
    // negativos ou uma data impossível.
    const invalidos = [0, -1, -12, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const periods of invalidos) {
      expect(planActivationPatch({ planExpiresAt: null }, AGORA, periods).plan_expires_at, String(periods))
        .toBe(iso(AGORA + PERIODO));
    }
    // Sem coerção: um texto não é um número de períodos.
    expect(planActivationPatch({ planExpiresAt: null }, AGORA, "3" as unknown as number).plan_expires_at)
      .toBe(iso(AGORA + PERIODO));
  });

  it("um número fracionário de períodos arredonda para baixo", () => {
    expect(planActivationPatch({ planExpiresAt: null }, AGORA, 2.9).plan_expires_at).toBe(iso(AGORA + 2 * PERIODO));
  });

  it("ser administrador não muda a conta do período", () => {
    const fim = AGORA + 4 * DIA;
    expect(planActivationPatch({ planExpiresAt: iso(fim), isAdmin: true }, AGORA).plan_expires_at)
      .toBe(iso(fim + PERIODO));
  });

  it("depois de ativar, a conta fica ativa até ao fim gravado", () => {
    const p = planActivationPatch({ planExpiresAt: null }, AGORA);
    const s = resolveBilling({ planExpiresAt: p.plan_expires_at }, AGORA);
    expect(s.accessActive).toBe(true);
    expect(s.daysRemaining).toBe(PLAN_PERIOD_DAYS);
    expect(canPublishStore(s).allowed).toBe(true);
  });
});
