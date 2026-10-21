/**
 * Paridade entre `api/_shared.js` (funções serverless) e o domínio
 * (`src/services/plans.ts` e `src/services/billing.ts`).
 *
 * `api/` é JavaScript sem passo de compilação e **não pode importar de `src/`**
 * (`SEO.md` §5.2). O preço do plano, a duração do período, a regra de conta
 * ativa e a ativação de um pagamento estão por isso escritos duas vezes, e cada
 * cópia já divergiu uma vez:
 *
 *  - uma loja com pagamentos ativos recusava cobrar (`PLAN_NOT_COVERED`)
 *    enquanto o painel mostrava o plano ativo: a fonte de verdade reconhecia uma
 *    «atribuição permanente» que o espelho não tinha;
 *  - mudar o preço num sítio e esquecer o outro cobra um valor e anuncia outro.
 *
 * ## Porque há uma propriedade e uma tabela
 *
 * A tabela percorre os casos nomeáveis — administrador, pago, caducado, nunca
 * pagou, data ilegível, o milissegundo da expiração — e documenta-os. A
 * propriedade compara as duas funções em perfis gerados com valores hostis
 * (`is_admin` que só por coerção seria `true`, datas noutros formatos), que é
 * onde uma reescrita «equivalente» de um dos lados deixaria de o ser.
 *
 * ## Como se chega ao módulo
 *
 * `api/_shared.js` está fora do `include` do `tsconfig.json`. Mesmo contorno de
 * `tests/seoInfra.test.ts`: import suprimido e tipo declarado à mão.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { instanteArb, perfilDaBaseDeDadosArb, type PerfilDaBaseDeDados } from "./geradores.js";
import { resolveBilling, planActivationPatch } from "../src/services/billing.js";
import { PLAN_ID, PLAN_PERIOD_DAYS, PLAN_PRICE_KZ } from "../src/services/plans.js";

// @ts-expect-error módulo JavaScript sem declarações de tipos
import * as sharedModule from "../api/_shared.js";

/** Cliente mínimo que `activatePlan` usa: uma leitura e uma escrita em `profiles`. */
interface FakeDb {
  from(table: string): {
    select(cols: string): { eq(col: string, value: unknown): { maybeSingle(): Promise<{ data: unknown }> } };
    update(patch: Record<string, unknown>): { eq(col: string, value: unknown): Promise<{ error: unknown }> };
  };
}

const shared = sharedModule as unknown as {
  PLAN_PRICE_KZ: unknown;
  PLAN_PERIOD_MS: unknown;
  accountActive(profile: unknown, now?: number): boolean;
  activatePlan(db: FakeDb, ownerId: unknown): Promise<boolean>;
};

const AGORA = Date.parse("2026-08-04T12:00:00.000Z");
const DIA = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** Leitura da fonte de verdade a partir de uma linha de `profiles`, sem coerção. */
function daFonte(perfil: PerfilDaBaseDeDados | null | undefined, now: number): boolean {
  if (!perfil) return false;
  return resolveBilling(
    {
      planExpiresAt: perfil.plan_expires_at as string | null | undefined,
      isAdmin: perfil.is_admin as boolean | undefined,
    },
    now,
  ).accessActive;
}

describe("Preço e período — o servidor cobra o que o domínio anuncia", () => {
  it("PLAN_PRICE_KZ de api/_shared.js é o de src/services/plans.ts", () => {
    expect(typeof shared.PLAN_PRICE_KZ).toBe("number");
    expect(shared.PLAN_PRICE_KZ).toBe(PLAN_PRICE_KZ);
  });

  it("PLAN_PERIOD_MS de api/_shared.js são PLAN_PERIOD_DAYS dias", () => {
    expect(shared.PLAN_PERIOD_MS).toBe(PLAN_PERIOD_DAYS * DIA);
  });
});

describe("Conta ativa — accountActive concorda com resolveBilling().accessActive", () => {
  const CASOS: { nome: string; perfil: PerfilDaBaseDeDados; ativo: boolean }[] = [
    { nome: "administrador, sem nunca ter pago", perfil: { is_admin: true }, ativo: true },
    { nome: "subscrição dentro do prazo", perfil: { plan_expires_at: iso(AGORA + 10 * DIA) }, ativo: true },
    { nome: "subscrição caducada", perfil: { plan_expires_at: iso(AGORA - DIA) }, ativo: false },
    { nome: "nunca pagou", perfil: {}, ativo: false },
    { nome: "data ilegível", perfil: { plan_expires_at: "não é uma data" }, ativo: false },
    { nome: "instante exato da expiração", perfil: { plan_expires_at: iso(AGORA) }, ativo: false },
    { nome: "um milissegundo antes de expirar", perfil: { plan_expires_at: iso(AGORA + 1) }, ativo: true },
    { nome: "administrador com subscrição caducada", perfil: { is_admin: true, plan_expires_at: iso(AGORA - DIA) }, ativo: true },
    { nome: "is_admin em texto não é administrador", perfil: { is_admin: "true" }, ativo: false },
  ];

  for (const caso of CASOS) {
    it(caso.nome, () => {
      expect(daFonte(caso.perfil, AGORA), "fonte de verdade (billing.ts)").toBe(caso.ativo);
      expect(shared.accountActive(caso.perfil, AGORA), "espelho serverless (_shared.js)").toBe(caso.ativo);
    });
  }

  it("um perfil ausente não dá acesso a ninguém", () => {
    // O servidor lê o perfil da base de dados e pode não o encontrar.
    expect(shared.accountActive(null, AGORA)).toBe(false);
    expect(shared.accountActive(undefined, AGORA)).toBe(false);
  });

  it("concordam em qualquer perfil e em qualquer instante (propriedade)", () => {
    assertProperty(
      fc.property(
        instanteArb.chain((now) => fc.tuple(fc.constant(now), perfilDaBaseDeDadosArb(now))),
        ([now, perfil]) => {
          expect(shared.accountActive(perfil, now)).toBe(daFonte(perfil, now));
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("Ativação — activatePlan grava o que planActivationPatch calcula", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Base de dados falsa: devolve `atual` na leitura e regista as escritas. */
  function baseFalsa(atual: unknown, erroDaEscrita: unknown = null) {
    const escritas: Record<string, unknown>[] = [];
    const tabelas: string[] = [];
    const db: FakeDb = {
      from(table) {
        tabelas.push(table);
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: atual }) }) }),
          update: (patch) => {
            escritas.push(patch);
            return { eq: async () => ({ error: erroDaEscrita }) };
          },
        };
      },
    };
    return { db, escritas, tabelas };
  }

  const ATUAIS: { nome: string; plan_expires_at: string | null }[] = [
    { nome: "nunca pagou", plan_expires_at: null },
    { nome: "período em curso", plan_expires_at: iso(AGORA + 12 * DIA) },
    { nome: "período caducado", plan_expires_at: iso(AGORA - 40 * DIA) },
    { nome: "no instante exato do fim", plan_expires_at: iso(AGORA) },
    { nome: "data ilegível", plan_expires_at: "lixo" },
  ];

  for (const atual of ATUAIS) {
    it(`renova como o domínio — ${atual.nome}`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(AGORA);
      const { db, escritas, tabelas } = baseFalsa({ plan_expires_at: atual.plan_expires_at });

      expect(await shared.activatePlan(db, "dono-1")).toBe(true);

      const esperado = planActivationPatch({ planExpiresAt: atual.plan_expires_at }, AGORA, 1);
      expect(escritas).toEqual([{ plan: PLAN_ID, plan_expires_at: esperado.plan_expires_at }]);
      expect(tabelas.every((t) => t === "profiles")).toBe(true);
    });
  }

  it("sem dono não toca na base de dados", async () => {
    const { db, escritas, tabelas } = baseFalsa(null);
    expect(await shared.activatePlan(db, "")).toBe(false);
    expect(await shared.activatePlan(db, null)).toBe(false);
    expect(escritas).toEqual([]);
    expect(tabelas).toEqual([]);
  });

  it("uma escrita recusada devolve false, para quem chama não dar a subscrição por ativada", async () => {
    const { db } = baseFalsa({ plan_expires_at: null }, { message: "recusado" });
    expect(await shared.activatePlan(db, "dono-1")).toBe(false);
  });
});
