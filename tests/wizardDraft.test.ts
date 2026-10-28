/**
 * Rascunho do Assistente_de_Criação: sair a meio não apaga o que já foi escrito.
 *
 * ## O defeito que isto fecha
 *
 * A mala de dados do assistente vivia só em memória e era reposta a cada
 * entrada no ecrã. Quem fechasse o separador, recarregasse a página ou fosse ver
 * uma coisa ao painel perdia o nome da loja, o tipo, o texto longo sobre o
 * negócio e os textos para o Google que já tinha corrigido. A conta e a loja
 * sobreviviam (uma na sessão, a outra na base de dados); o meio da conversa não.
 *
 * ## O que estas asserções guardam
 *
 *  - **A lista branca.** O rascunho vai para o disco de quem pode estar num
 *    computador partilhado. A palavra-passe, o email e o telemóvel não entram, e
 *    um campo novo na mala do assistente também não entra sem alguém o decidir.
 *  - **O dono.** Outra conta no mesmo navegador não herda a loja de ninguém.
 *  - **A validade e o lixo.** Um rascunho de há semanas, um passo que não
 *    existe ou JSON estragado são ignorados, em vez de prometerem «continuamos
 *    de onde ficaste?» e não terem nada para continuar.
 *  - **Falhar é permitido.** Em navegação privada `localStorage` lança; ficar
 *    sem rascunho é um incómodo, não poder criar a loja é um defeito.
 *
 * O especificador fica numa constante: com ele literal, o `tsc` segue-o e
 * compila um módulo de navegador (usa `localStorage`) dentro do programa dos
 * testes, que não tem as declarações do DOM. É o padrão de `tests/ssrRender.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WIZARD_DRAFT_TTL_DAYS } from "../src/ui/wizardSteps.js";

/** Armazenamento em memória, no lugar do do navegador. */
const guardado = new Map<string, string>();

interface Armazem {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const emMemoria: Armazem = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k)! : null),
  setItem: (k, v) => { guardado.set(k, String(v)); },
  removeItem: (k) => { guardado.delete(k); },
};

const g = globalThis as unknown as { localStorage: Armazem };
g.localStorage = emMemoria;

interface Rascunho {
  ownerId: string;
  step: string;
  data: Record<string, unknown>;
  at: number;
}

interface Modulo {
  DRAFT_KEY: string;
  DRAFT_FIELDS: readonly string[];
  draftFields(data: Record<string, unknown>): Record<string, unknown>;
  saveWizardDraft(d: { ownerId: string; step: string; data: Record<string, unknown> }): void;
  readWizardDraft(ownerId: string, now?: number): Rascunho | null;
  clearWizardDraft(): void;
}

const ESP_DRAFT = "../web/lib/wizardDraft.js";
const M = (await import(ESP_DRAFT)) as unknown as Modulo;

const DONO = "7c1e4b2a-33d5-4f6e-9a8b-1c2d3e4f5a60";
const OUTRO = "3f1c2a4e-9b7d-4c1e-8a2f-6d5e4c3b2a10";

/** A mala como o ecrã a tem a meio da conversa, com tudo o que lá vive. */
function mala(): Record<string, unknown> {
  return {
    ownerId: DONO,
    ownerName: "Joana",
    email: "joana@exemplo.ao",
    password: "uma-palavra-passe",
    phone: "244923456789",
    templateId: "galeria",
    name: "Kitanda do Bairro",
    storeType: "mercearia",
    aboutStore: "Vendemos cosméticos naturais feitos em Angola, com entrega em Luanda.",
    seoTitle: "Kitanda do Bairro | Cosmética natural",
    seoDescription: "Cosméticos naturais feitos em Angola, com entrega em Luanda.",
    seoByAi: true,
  };
}

beforeEach(() => {
  guardado.clear();
  g.localStorage = emMemoria;
});

afterEach(() => {
  g.localStorage = emMemoria;
});

describe("Rascunho do assistente — o que volta na volta", () => {
  it("guarda as respostas da loja e devolve-as com o passo que faltava", () => {
    M.saveWizardDraft({ ownerId: DONO, step: "subdomain", data: mala() });
    const r = M.readWizardDraft(DONO);
    expect(r, "o rascunho não foi devolvido").not.toBeNull();
    expect(r!.step).toBe("subdomain");
    expect(r!.data.name).toBe("Kitanda do Bairro");
    expect(r!.data.storeType).toBe("mercearia");
    expect(r!.data.aboutStore).toContain("cosméticos naturais");
    expect(r!.data.seoTitle).toContain("Kitanda do Bairro");
    expect(r!.data.seoDescription).toContain("entrega em Luanda");
    expect(r!.data.seoByAi).toBe(true);
  });

  it("nunca grava a palavra-passe, o email nem o telemóvel", () => {
    M.saveWizardDraft({ ownerId: DONO, step: "about", data: mala() });
    const cru = guardado.get(M.DRAFT_KEY) ?? "";
    expect(cru, "o rascunho não foi escrito").not.toBe("");
    for (const segredo of ["uma-palavra-passe", "joana@exemplo.ao", "244923456789", "Joana"]) {
      expect(cru, `«${segredo}» foi para o disco`).not.toContain(segredo);
    }
    const r = M.readWizardDraft(DONO)!;
    for (const campo of ["password", "email", "phone", "ownerName"]) {
      expect(Object.keys(r.data), campo).not.toContain(campo);
    }
  });

  it("a lista branca é a única porta: um campo novo na mala não é gravado", () => {
    // É esta a razão de ser uma lista branca. Com uma lista negra, o campo que
    // alguém acrescentasse amanhã ia para o disco sem ninguém decidir isso.
    const comNovo = { ...mala(), numeroDoCartao: "4111 1111 1111 1111" };
    M.saveWizardDraft({ ownerId: DONO, step: "about", data: comNovo });
    expect(guardado.get(M.DRAFT_KEY) ?? "").not.toContain("4111");
    expect(M.DRAFT_FIELDS).not.toContain("password");
    expect(M.DRAFT_FIELDS).not.toContain("email");
  });

  it("só valores simples entram: nada de objetos, funções ou listas", () => {
    const sujo = { name: { nested: true }, storeType: ["a"], aboutStore: "texto bom" };
    const limpo = M.draftFields(sujo);
    expect(limpo).toEqual({ aboutStore: "texto bom" });
  });
});

describe("Rascunho do assistente — de quem é, e até quando vale", () => {
  it("o rascunho de uma conta não é oferecido a outra", () => {
    M.saveWizardDraft({ ownerId: DONO, step: "about", data: mala() });
    expect(M.readWizardDraft(OUTRO)).toBeNull();
    expect(M.readWizardDraft(DONO)).not.toBeNull();
  });

  it("sem conta não há rascunho: nem a gravar, nem a ler", () => {
    M.saveWizardDraft({ ownerId: "", step: "about", data: mala() });
    expect(guardado.size, "gravou um rascunho sem dono").toBe(0);
    expect(M.readWizardDraft("")).toBeNull();
  });

  it("passados os dias de validade é ignorado", () => {
    M.saveWizardDraft({ ownerId: DONO, step: "about", data: mala() });
    const dia = 24 * 60 * 60 * 1000;
    const dentro = Date.now() + (WIZARD_DRAFT_TTL_DAYS - 1) * dia;
    const fora = Date.now() + (WIZARD_DRAFT_TTL_DAYS + 1) * dia;
    expect(M.readWizardDraft(DONO, dentro)).not.toBeNull();
    expect(M.readWizardDraft(DONO, fora)).toBeNull();
  });

  it("um rascunho sem respostas nenhumas não é rascunho", () => {
    // O modelo por omissão é posto pelo próprio ecrã ao abrir. Perguntar
    // «continuamos?» e não ter nada para continuar é pior do que começar.
    M.saveWizardDraft({ ownerId: DONO, step: "storeName", data: { ownerId: DONO, templateId: "galeria" } });
    expect(M.readWizardDraft(DONO)).toBeNull();
  });

  it("lixo no armazenamento é ignorado, sem lançar", () => {
    for (const cru of ["{", "null", "[]", '{"ownerId":"' + DONO + '"}', '{"ownerId":"' + DONO + '","step":"voar","data":{"name":"x"},"at":' + Date.now() + "}"]) {
      guardado.set(M.DRAFT_KEY, cru);
      expect(() => M.readWizardDraft(DONO), cru).not.toThrow();
      expect(M.readWizardDraft(DONO), cru).toBeNull();
    }
  });

  it("apagar deixa o assistente a começar do início", () => {
    M.saveWizardDraft({ ownerId: DONO, step: "seo", data: mala() });
    M.clearWizardDraft();
    expect(M.readWizardDraft(DONO)).toBeNull();
  });
});

describe("Rascunho do assistente — um armazenamento que recusa não trava nada", () => {
  it("nem a gravar, nem a ler, nem a apagar", () => {
    // Navegação privada, disco cheio, armazenamento bloqueado: `localStorage`
    // lança. Ficar sem rascunho é um incómodo; não poder criar a loja seria um
    // defeito.
    g.localStorage = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
      removeItem: () => { throw new Error("bloqueado"); },
    };
    expect(() => M.saveWizardDraft({ ownerId: DONO, step: "about", data: mala() })).not.toThrow();
    expect(() => M.clearWizardDraft()).not.toThrow();
    expect(M.readWizardDraft(DONO)).toBeNull();
  });
});
