/**
 * Páginas legais (`web/views/legal.ts`): o que os Termos e a Política de
 * Privacidade dizem tem de ser o que a plataforma faz.
 *
 * Os Termos chegaram a falar de «planos» no plural e da MoMenu muito depois de
 * os escalões e a MoMenu terem saído. Um texto legal desatualizado é pior do que
 * um ecrã desatualizado: é o que o Dono aceitou. Por isso os factos vêm do
 * domínio (preço, período, «Em breve», contacto) e estes testes leem o conteúdo
 * **que o ecrã mostra** (`LEGAL_PAGES`), não o texto-fonte.
 *
 * `web/views/legal.ts` é importado com o especificador numa constante (fica fora
 * do `tsc`, que compila `tests/` sem DOM). O assistente é substituído: a sua
 * orientação não é o que se testa aqui, e só é usada ao desenhar a página.
 */
import { describe, it, expect, vi } from "vitest";
import { PLAN_PERIOD_DAYS, PLAN_PRICE_KZ } from "../src/services/plans.js";
import { COMING_SOON, comingSoonList, isComingSoon, type ComingSoonFeature } from "../src/services/comingSoon.js";
import { PLATFORM_CONTACT_EMAIL } from "../src/services/domains.js";
import { kzWhole } from "../src/services/seo.js";

vi.mock("../web/lib/aiAgent.js", () => ({ mountAiAgent: () => () => undefined }));

interface Secao { h: string; p: string[] }
type Pagina = "termos" | "privacidade" | "politica";

const ESPECIFICADOR = "../web/views/legal.js";
const { LEGAL_PAGES } = (await import(ESPECIFICADOR)) as {
  LEGAL_PAGES: Record<Pagina, { title: string; intro: string; sections: Secao[] }>;
};

/** Todo o texto de uma página: título, introdução, títulos e parágrafos. */
function texto(pagina: Pagina): string {
  const d = LEGAL_PAGES[pagina];
  return [d.title, d.intro, ...d.sections.flatMap((s) => [s.h, ...s.p])].join("\n");
}

/** Parágrafos de uma página, com o título da secção onde estão. */
function paragrafos(pagina: Pagina): { h: string; p: string }[] {
  return LEGAL_PAGES[pagina].sections.flatMap((s) => s.p.map((p) => ({ h: s.h, p })));
}

const PAGINAS: readonly Pagina[] = ["termos", "privacidade", "politica"];
const TUDO = PAGINAS.map(texto).join("\n");

describe("Termos — um só plano, com o preço do domínio", () => {
  const TERMOS = texto("termos");

  it("dizem o preço e o período de src/services/plans.ts", () => {
    expect(TERMOS).toContain(`${kzWhole(PLAN_PRICE_KZ)} por cada período de ${PLAN_PERIOD_DAYS} dias`);
  });

  it("nenhum valor em Kz está escrito à mão: o único é o preço do plano", () => {
    const valores = TUDO.match(/\d[\d.\s]*\d\s*Kz|\d\s*Kz/g) ?? [];
    expect(valores.length).toBeGreaterThan(0);
    for (const v of valores) expect(v.replace(/\s+/g, " ").trim()).toBe(kzWhole(PLAN_PRICE_KZ));
  });

  it("não há escalões nem período de teste a cobrar", () => {
    expect(TUDO).not.toMatch(/b[áa]sico|profissional|empresarial|plano anual|teste gr[áa]tis|per[íi]odo de teste|planos s[ãa]o cobrados/i);
    expect(TERMOS).toMatch(/produtos ilimitados/);
    // A subscrição é de cada loja (migração 0025).
    expect(TERMOS).toMatch(/por loja/);
    expect(TERMOS).toMatch(/Cada Loja tem a sua subscrição/);
  });

  it("criar e pré-visualizar é grátis; a subscrição é para publicar", () => {
    expect(TERMOS).toMatch(/Criar, personalizar e pré-visualizar uma Loja é gratuito/);
    expect(TERMOS).toMatch(/necessária para publicar/);
  });
});

describe("Termos — como as Lojas vendem", () => {
  it("todas as Lojas vendem por WhatsApp", () => {
    expect(texto("termos")).toContain("Todas as Lojas recebem encomendas por WhatsApp");
    expect(texto("politica")).toContain("Todas as Lojas aceitam encomendas por WhatsApp");
  });

  it("Multicaixa Express e Referência Bancária só para empresas registadas, depois de a MôBisno aprovar os documentos", () => {
    const sobreDigitais = paragrafos("termos").filter(({ p }) => /Multicaixa Express/.test(p));
    expect(sobreDigitais.length).toBeGreaterThan(0);
    const principal = sobreDigitais.find(({ p }) => /empresas registadas/.test(p));
    expect(principal, "nenhum parágrafo liga os pagamentos digitais às empresas registadas").toBeDefined();
    expect(principal?.p).toMatch(/Referência Bancária/);
    expect(principal?.p).toMatch(/Matrícula e Certidão/);
    expect(principal?.p).toMatch(/depois de a MôBisno verificar e aprovar/);
  });

  it("a MoMenu já não é nomeada", () => {
    expect(TUDO).not.toMatch(/momenu/i);
  });
});

describe("Termos — o que está «Em breve» não é prometido", () => {
  /** Palavras que denunciam cada funcionalidade, além do nome. */
  const SINAIS: Readonly<Record<ComingSoonFeature, RegExp>> = {
    sms: /\bSMS\b/i,
    customDomain: /dom[íi]nio pr[óo]prio/i,
    marketing: /pixel|analytics/i,
  };
  const SECAO_EM_BREVE = /Em breve/;

  it("há uma secção que as exclui pelo nome", () => {
    const secao = LEGAL_PAGES.termos.sections.find((s) => SECAO_EM_BREVE.test(s.h));
    expect(secao).toBeDefined();
    const corpo = secao?.p.join(" ") ?? "";
    expect(corpo).toMatch(/não fazem parte do serviço contratado/);
    for (const nome of comingSoonList()) expect(corpo, nome).toContain(`«${nome}»`);
  });

  it("fora dessa secção, nenhuma página fala de uma funcionalidade «Em breve»", () => {
    const emBreve = (Object.keys(COMING_SOON) as ComingSoonFeature[]).filter(isComingSoon);
    expect(emBreve.length).toBeGreaterThan(0);
    for (const pagina of PAGINAS) {
      for (const { h, p } of paragrafos(pagina)) {
        if (pagina === "termos" && SECAO_EM_BREVE.test(h)) continue;
        for (const f of emBreve) expect(p, `${pagina} › ${h} fala de ${f}`).not.toMatch(SINAIS[f]);
      }
    }
  });
});

describe("Contacto", () => {
  it("as três páginas indicam o contacto da MôBisno, e só esse", () => {
    for (const pagina of ["termos", "privacidade", "politica"] as const) {
      expect(texto(pagina), pagina).toContain(PLATFORM_CONTACT_EMAIL);
    }
    const emails = TUDO.match(/[^\s@()«»,;:]+@[^\s@()«»,;:]+\.[a-z]{2,}/gi) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e.replace(/\.$/, "")).toBe(PLATFORM_CONTACT_EMAIL);
  });
});

describe("Privacidade — os dados da empresa para os pagamentos digitais", () => {
  const PRIVACIDADE = texto("privacidade");

  it("diz que dados recolhe: nome, NIF, IBAN, Matrícula e Certidão", () => {
    for (const dado of ["nome da empresa", "NIF", "IBAN", "Matrícula", "Certidão"]) {
      expect(PRIVACIDADE, dado).toContain(dado);
    }
  });

  it("diz que ficam guardados de forma privada", () => {
    expect(PRIVACIDADE).toMatch(/guardados de forma privada, sem acesso público/);
  });

  it("diz quem os vê: só o Dono da Loja e a administração da MôBisno", () => {
    expect(PRIVACIDADE).toMatch(/só os veem o próprio Dono da Loja e a administração da MôBisno/);
    expect(PRIVACIDADE).toMatch(/nunca são mostrados aos clientes/);
  });

  it("diz para que servem: verificar a empresa e pagar-lhe as vendas", () => {
    expect(PRIVACIDADE).toMatch(/apenas para verificar a empresa e para lhe pagar as vendas/);
  });
});

describe("Português de Portugal e de Angola", () => {
  it("não usa termos do português do Brasil", () => {
    expect(TUDO).not.toMatch(/\b(senha|cadastr\w*|celular|tela|usu[áa]rio|contato|equipe|registro|arquivo)\b/i);
  });

  it("todas as páginas têm título, introdução e secções com texto", () => {
    for (const pagina of PAGINAS) {
      const d = LEGAL_PAGES[pagina];
      expect(d.title.trim().length, pagina).toBeGreaterThan(0);
      expect(d.intro.trim().length, pagina).toBeGreaterThan(0);
      expect(d.sections.length, pagina).toBeGreaterThan(0);
      for (const s of d.sections) for (const p of s.p) expect(p.trim().length, `${pagina} › ${s.h}`).toBeGreaterThan(0);
    }
  });
});
