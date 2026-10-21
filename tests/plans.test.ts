/**
 * Subscrição: um plano, um preço (`src/services/plans.ts`).
 *
 * ## O que estes exemplos guardam
 *
 * O módulo já teve três escalões, depois dois ciclos (mensal e anual), depois
 * preço por loja publicada. Cada versão deixou uma divergência entre o que o
 * ecrã dizia e o que o servidor cobrava, e a última deixava o Dono sem forma de
 * pagar uma segunda loja. Ficou uma frase: «10.000 Kz por mês, tudo incluído».
 *
 * O que se fixa aqui é essa frase — o preço, o período, o identificador que a
 * base de dados valida — e o que a página de preços promete: só o que existe.
 * Uma funcionalidade «Em breve» anunciada como incluída é uma promessa que o
 * Dono não consegue ligar.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * O módulo é um catálogo de constantes. Não há espaço de entrada a explorar; há
 * valores a fixar para que ninguém os mude sem reparar que a página de preços,
 * os Termos e o servidor passam a dizer coisas diferentes.
 */
import { describe, it, expect } from "vitest";
import * as plans from "../src/services/plans.js";
import { PLAN_ID, PLAN_NAME, PLAN_PRICE_KZ, PLAN_PERIOD_DAYS, PLAN_HIGHLIGHTS } from "../src/services/plans.js";
import {
  COMING_SOON, COMING_SOON_LABELS, comingSoonList, isComingSoon, type ComingSoonFeature,
} from "../src/services/comingSoon.js";
import { STORE_APEX } from "../src/services/domains.js";

describe("Plano único", () => {
  it("há um só plano, com o identificador que a coluna `profiles.plan` aceita", () => {
    expect(PLAN_ID).toBe("pro");
    expect(PLAN_NAME).toBe("MôBisno");
  });

  it("custa 10.000 Kz por cada período de 30 dias", () => {
    expect(PLAN_PRICE_KZ).toBe(10_000);
    expect(PLAN_PERIOD_DAYS).toBe(30);
    expect(Number.isInteger(PLAN_PRICE_KZ)).toBe(true);
  });

  it("não sobra nenhuma peça dos escalões, dos ciclos nem do preço por loja", () => {
    // Cada uma destas exportações já foi a fonte de uma divergência. Voltarem a
    // existir era voltar a ter duas maneiras de calcular o preço.
    const antigas = [
      "PRICE_KZ", "PERIOD_DAYS", "BILLING_PERIODS", "isBillingPeriod", "asBillingPeriod",
      "priceOf", "daysOf", "yearlySavingKz", "yearlyFreeMonths",
      "STORES_INCLUDED", "billableStores", "priceFor", "proratedStorePrice",
      "PLANS", "TRIAL_DAYS",
    ];
    for (const nome of antigas) expect(plans, nome).not.toHaveProperty(nome);
  });
});

describe("O que o plano inclui — PLAN_HIGHLIGHTS", () => {
  it("diz que lojas e produtos são ilimitados", () => {
    expect(PLAN_HIGHLIGHTS.some((h) => /ilimitad/i.test(h) && /lojas/i.test(h) && /produtos/i.test(h))).toBe(true);
  });

  it("toda a loja vende por WhatsApp", () => {
    expect(PLAN_HIGHLIGHTS.some((h) => /whatsapp/i.test(h) && /todas as lojas/i.test(h))).toBe(true);
  });

  it("os pagamentos digitais aparecem como exclusivos de empresas verificadas", () => {
    const digitais = PLAN_HIGHLIGHTS.filter((h) => /multicaixa|refer[eê]ncia banc/i.test(h));
    expect(digitais.length).toBeGreaterThan(0);
    for (const h of digitais) expect(h, h).toMatch(/empresas verificadas/i);
  });

  it("o endereço das lojas vem do domínio, não escrito à mão", () => {
    expect(PLAN_HIGHLIGHTS.some((h) => h.includes(`.${STORE_APEX}`))).toBe(true);
  });

  it("não fala de escalões, de ciclo anual nem de teste grátis", () => {
    for (const h of PLAN_HIGHLIGHTS) {
      expect(h, h).not.toMatch(/b[áa]sico|profissional|empresarial|anual|teste gr[áa]tis|per[íi]odo de teste/i);
    }
  });

  /**
   * Palavras que denunciam cada funcionalidade «Em breve», além do rótulo.
   *
   * `Record` sobre a união das funcionalidades: acrescentar uma bandeira a
   * `COMING_SOON` sem dizer aqui como ela se reconhece não compila.
   */
  const SINAIS: Readonly<Record<ComingSoonFeature, RegExp>> = {
    sms: /\bsms\b/i,
    customDomain: /dom[íi]nio pr[óo]prio|dom[íi]nio personalizado/i,
    marketing: /pixel|analytics|marketing/i,
  };

  it("não promete nenhuma funcionalidade «Em breve» — nem pelo rótulo, nem por palavras", () => {
    const emBreve = (Object.keys(COMING_SOON) as ComingSoonFeature[]).filter(isComingSoon);
    // Sem nada «Em breve» este teste não provava nada.
    expect(emBreve.length).toBeGreaterThan(0);
    expect(comingSoonList()).toEqual(emBreve.map((f) => COMING_SOON_LABELS[f]));

    for (const h of PLAN_HIGHLIGHTS) {
      for (const rotulo of comingSoonList()) {
        expect(h.toLowerCase(), `«${h}» promete «${rotulo}»`).not.toContain(rotulo.toLowerCase());
      }
      for (const f of emBreve) {
        expect(h, `«${h}» promete ${f}, que está «Em breve»`).not.toMatch(SINAIS[f]);
      }
    }
  });

  it("não tem números de preço escritos à mão", () => {
    // O preço vive em PLAN_PRICE_KZ. Um destaque com «10.000 Kz» ficava errado
    // no dia em que o preço mudasse.
    for (const h of PLAN_HIGHLIGHTS) expect(h, h).not.toMatch(/\d[\d.\s]*\s*kz/i);
  });
});
