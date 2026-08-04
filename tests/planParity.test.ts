/**
 * Paridade da regra de acesso entre `api/_shared.js` e `src/services/billing.ts`.
 *
 * ## A avaria que estes exemplos guardam
 *
 * Uma loja com pagamentos ativos recusava cobrar, com «Os pagamentos online não
 * estão disponíveis no plano atual da loja» (`PLAN_NOT_COVERED`), enquanto o
 * painel do dono mostrava o plano Profissional ativo.
 *
 * As duas leituras discordavam. A fonte de verdade reconhecia uma «atribuição
 * permanente» — plano gravado sem data de expiração nunca expirava — e o
 * espelho que corre nas funções serverless não tinha esse ramo, devolvendo
 * `basico`. O estado não era raro: o assistente de criação de loja gravava
 * exactamente isso.
 *
 * A correção não foi alinhar o espelho: foi **apagar o ramo**. Alinhá-lo teria
 * dado subscrição vitalícia grátis, com Multicaixa Express a funcionar, a quem
 * escolhesse um plano no assistente e nunca pagasse.
 *
 * ## Porque é uma tabela de exemplos e não uma propriedade
 *
 * O que interessa é percorrer os casos nomeáveis das duas funções — admin,
 * pago, caducado, nunca pagou, data ilegível — e a fronteira exacta do instante
 * de expiração. São contáveis, e é entre eles que a divergência aparecia.
 *
 * ## Como se chega ao módulo
 *
 * `api/_shared.js` é JavaScript puro (as funções serverless não passam pelo
 * compilador) e está fora do `include` do `tsconfig.json`. Mesmo contorno de
 * `tests/seoInfra.test.ts`: import suprimido e tipo declarado à mão.
 */
import { describe, it, expect } from "vitest";
import { resolveBilling } from "../src/services/billing.js";

// @ts-expect-error módulo JavaScript sem declarações de tipos
import * as sharedModule from "../api/_shared.js";

const { accountActive } = sharedModule as unknown as {
  accountActive(profile: unknown, now?: number): boolean;
};

const AGORA = Date.parse("2026-08-04T12:00:00.000Z");
const DIA = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** Linha de `profiles` tal como as funções serverless a leem. */
interface Perfil {
  is_admin?: boolean;
  plan_expires_at?: string | null;
}

const CASOS: { nome: string; perfil: Perfil; ativo: boolean }[] = [
  { nome: "administrador, sem nunca ter pago", perfil: { is_admin: true }, ativo: true },
  { nome: "subscrição dentro do prazo", perfil: { plan_expires_at: iso(AGORA + 10 * DIA) }, ativo: true },
  { nome: "subscrição caducada", perfil: { plan_expires_at: iso(AGORA - DIA) }, ativo: false },
  { nome: "nunca pagou", perfil: {}, ativo: false },
  { nome: "data ilegível", perfil: { plan_expires_at: "não é uma data" }, ativo: false },
  { nome: "instante exacto da expiração", perfil: { plan_expires_at: iso(AGORA) }, ativo: false },
  { nome: "um milissegundo antes de expirar", perfil: { plan_expires_at: iso(AGORA + 1) }, ativo: true },
  { nome: "administrador com subscrição caducada", perfil: { is_admin: true, plan_expires_at: iso(AGORA - DIA) }, ativo: true },
];

describe("Acesso — api/_shared.js concorda com src/services/billing.ts", () => {
  for (const caso of CASOS) {
    it(caso.nome, () => {
      const daFonte = resolveBilling(
        { planExpiresAt: caso.perfil.plan_expires_at ?? null, isAdmin: caso.perfil.is_admin === true },
        AGORA,
      ).accessActive;
      const doServidor = accountActive(caso.perfil, AGORA);

      expect(daFonte, "fonte de verdade (billing.ts)").toBe(caso.ativo);
      expect(doServidor, "espelho serverless (_shared.js)").toBe(caso.ativo);
    });
  }

  it("um perfil ausente não dá acesso a ninguém", () => {
    // O servidor lê o perfil da base de dados e pode não o encontrar.
    expect(accountActive(null, AGORA)).toBe(false);
    expect(accountActive(undefined, AGORA)).toBe(false);
  });
});
