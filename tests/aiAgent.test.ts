/**
 * Mascote do assistente (`web/lib/aiAgent.ts`): uma instância de cada vez, sem
 * ouvintes esquecidos, e com as animações que usa.
 *
 * ## As duas avarias
 *
 * 1. **Ouvintes presos.** Cada ecrã monta o assistente ao abrir. A montagem
 *    removia o mascote anterior, mas não os ouvintes de `mousemove` e `keydown`
 *    que ele tinha posto no `document`, nem o `setInterval` do balão: o
 *    Dashboard volta a montá-lo a cada separador, e ao fim de uma tarde havia
 *    dezenas de ouvintes a calcular a posição de olhos que já não existiam.
 * 2. **Animação inexistente.** O painel e o véu usavam `mbBubbleIn`, definida só
 *    na folha do assistente de criação — nos outros ecrãs não havia animação.
 *
 * ## Como se testa sem navegador
 *
 * `tests/` corre em Node, sem DOM. O módulo só precisa de um punhado de
 * operações (`createElement`, `appendChild`, `remove`, `isConnected`,
 * ouvintes, temporizadores), e é isso que o DOM falso abaixo implementa — o
 * suficiente para **contar** ouvintes e temporizadores, que é a propriedade em
 * causa. A orientação do assistente (`web/lib/assistantContext.ts`) é
 * substituída: não é o que se testa aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../web/lib/assistantContext.js", () => ({
  assistantContextFor: () => "contexto do ecrã",
  scopeFor: (screen: string) => (screen === "site" ? "site" : "editor"),
}));

type Ouvinte = (e: unknown) => void;

/** Ouvintes por tipo de evento, com contagem. */
class Ouvintes {
  private readonly porTipo = new Map<string, Set<Ouvinte>>();
  addEventListener(tipo: string, f: Ouvinte): void {
    let s = this.porTipo.get(tipo);
    if (!s) this.porTipo.set(tipo, (s = new Set()));
    s.add(f);
  }
  removeEventListener(tipo: string, f: Ouvinte): void {
    this.porTipo.get(tipo)?.delete(f);
  }
  contar(tipo: string): number {
    return this.porTipo.get(tipo)?.size ?? 0;
  }
  disparar(tipo: string, e: unknown = {}): void {
    for (const f of [...(this.porTipo.get(tipo) ?? [])]) f(e);
  }
}

/** Elemento falso: árvore, estilos em linha, ouvintes e `querySelector` memorizado. */
class ElementoFalso extends Ouvintes {
  id = "";
  textContent = "";
  parent: ElementoFalso | null = null;
  readonly children: ElementoFalso[] = [];
  readonly style: Record<string, string> = { cssText: "", overflow: "", display: "" };
  readonly atributos: Record<string, string> = {};
  scrollTop = 0;
  scrollHeight = 0;
  offsetTop = 0;
  value = "";
  private html = "";
  private readonly consultas = new Map<string, ElementoFalso>();

  constructor(readonly tag: string, private readonly doc: DocumentoFalso) {
    super();
  }

  get innerHTML(): string {
    return this.html;
  }
  /** Como no DOM: reescrever o conteúdo tira da página os filhos que lá estavam. */
  set innerHTML(html: string) {
    for (const filho of [...this.children]) filho.remove();
    this.consultas.clear();
    this.html = html;
  }

  get isConnected(): boolean {
    for (let n: ElementoFalso | null = this; n; n = n.parent) {
      if (n === this.doc.body || n === this.doc.head) return true;
    }
    return false;
  }

  appendChild(filho: ElementoFalso): ElementoFalso {
    filho.remove();
    filho.parent = this;
    this.children.push(filho);
    return filho;
  }

  remove(): void {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }

  setAttribute(nome: string, valor: string): void {
    this.atributos[nome] = valor;
  }

  querySelector(seletor: string): ElementoFalso {
    let q = this.consultas.get(seletor);
    if (!q) this.consultas.set(seletor, (q = new ElementoFalso("div", this.doc)));
    return q;
  }

  getBoundingClientRect(): { width: number; height: number; left: number; top: number } {
    return { width: 30, height: 30, left: 0, top: 0 };
  }

  focus(): void {
    /* sem foco a verificar */
  }

  /** Todos os descendentes (para procurar por `id`). */
  *descendentes(): Generator<ElementoFalso> {
    for (const filho of this.children) {
      yield filho;
      yield* filho.descendentes();
    }
  }
}

class DocumentoFalso extends Ouvintes {
  readonly body: ElementoFalso;
  readonly head: ElementoFalso;
  constructor() {
    super();
    this.body = new ElementoFalso("body", this);
    this.head = new ElementoFalso("head", this);
  }
  createElement(tag: string): ElementoFalso {
    return new ElementoFalso(tag, this);
  }
  getElementById(id: string): ElementoFalso | null {
    for (const raiz of [this.head, this.body]) {
      for (const el of raiz.descendentes()) if (el.id === id) return el;
    }
    return null;
  }
}

/** Janela falsa: só os temporizadores, contados. */
function janelaFalsa() {
  let proximo = 1;
  const intervalos = new Map<number, () => void>();
  const tempos = new Set<number>();
  return {
    innerWidth: 1280,
    intervalos,
    setInterval: (f: () => void): number => {
      const id = proximo++;
      intervalos.set(id, f);
      return id;
    },
    clearInterval: (id: number): void => {
      intervalos.delete(id);
    },
    setTimeout: (): number => {
      const id = proximo++;
      tempos.add(id);
      return id;
    },
    clearTimeout: (id: number): void => {
      tempos.delete(id);
    },
    /** Corre um tique de cada intervalo ativo. */
    tique: (): void => {
      for (const f of [...intervalos.values()]) f();
    },
  };
}

const ESPECIFICADOR = "../web/lib/aiAgent.js";
const { mountAiAgent } = (await import(ESPECIFICADOR)) as {
  mountAiAgent(host?: unknown, opts?: { screen?: string; bottom?: number }): () => void;
};

let doc: DocumentoFalso;
let janela: ReturnType<typeof janelaFalsa>;
let app: ElementoFalso;
/** Ecrã estreito (telemóvel): o painel abre como folha inferior. */
let estreito = false;
let desmontar: (() => void) | null = null;

/** Monta e guarda a desmontagem, para o `afterEach` arrumar. */
function montar(screen = "painel"): () => void {
  desmontar = mountAiAgent(app, { screen });
  return desmontar;
}

const mascote = (): ElementoFalso | undefined => app.children.find((c) => c.id === "mb-ai-agent");

beforeEach(() => {
  doc = new DocumentoFalso();
  app = doc.createElement("div");
  app.id = "app";
  doc.body.appendChild(app);
  janela = janelaFalsa();
  estreito = false;
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", janela);
  vi.stubGlobal("matchMedia", () => ({ matches: estreito }));
});

afterEach(() => {
  desmontar?.();
  desmontar = null;
  vi.unstubAllGlobals();
});

describe("Uma instância de cada vez", () => {
  it("montar de novo não acumula ouvintes, temporizadores nem mascotes", () => {
    const primeira = montar();
    montar("produtos");
    const terceira = montar("plano");

    expect(doc.contar("mousemove")).toBe(1);
    expect(doc.contar("keydown")).toBe(1);
    expect(janela.intervalos.size).toBe(1);
    expect(app.children.filter((c) => c.id === "mb-ai-agent")).toHaveLength(1);

    // A desmontagem de uma instância antiga já não mexe na atual.
    primeira();
    expect(doc.contar("mousemove")).toBe(1);
    expect(mascote()).toBeDefined();

    terceira();
    expect(doc.contar("mousemove")).toBe(0);
    expect(doc.contar("keydown")).toBe(0);
    expect(janela.intervalos.size).toBe(0);
    expect(mascote()).toBeUndefined();
  });

  it("desmontar duas vezes não faz mal", () => {
    const u = montar();
    u();
    expect(() => u()).not.toThrow();
    expect(doc.contar("mousemove")).toBe(0);
  });
});

describe("O mascote que sai da página arruma-se sozinho", () => {
  /** O router desenha outro ecrã no `#app`, sem assistente. */
  const outroEcra = (): void => {
    app.innerHTML = "<main>Loja publicada</main>";
  };

  it("no primeiro movimento do rato", () => {
    montar();
    outroEcra();
    expect(mascote()).toBeUndefined();
    doc.disparar("mousemove", { clientX: 10, clientY: 10 });
    expect(doc.contar("mousemove")).toBe(0);
    expect(doc.contar("keydown")).toBe(0);
    expect(janela.intervalos.size).toBe(0);
  });

  it("no telemóvel, sem rato: no tique seguinte do balão", () => {
    montar();
    outroEcra();
    janela.tique();
    expect(doc.contar("mousemove")).toBe(0);
    expect(janela.intervalos.size).toBe(0);
  });

  it("numa tecla", () => {
    montar();
    outroEcra();
    doc.disparar("keydown", { key: "a" });
    expect(doc.contar("keydown")).toBe(0);
  });

  it("enquanto está na página, os ouvintes ficam", () => {
    montar();
    doc.disparar("mousemove", { clientX: 10, clientY: 10 });
    janela.tique();
    expect(doc.contar("mousemove")).toBe(1);
    expect(janela.intervalos.size).toBe(1);
  });
});

describe("As animações do painel existem neste módulo", () => {
  /** Nomes de animação usados nos estilos em linha do que está no `#app`. */
  function animacoesUsadas(): string[] {
    const nomes = new Set<string>();
    for (const el of app.children) {
      for (const m of el.style.cssText.matchAll(/animation:\s*([\w-]+)/g)) if (m[1]) nomes.add(m[1]);
    }
    return [...nomes];
  }
  const folhas = (): string => doc.head.children.map((c) => c.textContent).join("\n");

  for (const telemovel of [false, true]) {
    it(`cada animação usada tem @keyframes na folha do assistente (${telemovel ? "folha do telemóvel" : "computador"})`, () => {
      estreito = telemovel;
      montar();
      mascote()?.disparar("click");
      const usadas = animacoesUsadas();
      expect(usadas.length).toBeGreaterThan(0);
      for (const nome of usadas) expect(folhas(), nome).toContain(`@keyframes ${nome}{`);
      expect(folhas()).toContain("@keyframes mbBubbleIn{");
    });
  }

  it("o véu do telemóvel só esmaece: não se desloca nem encolhe", () => {
    estreito = true;
    montar();
    mascote()?.disparar("click");
    const veu = app.children.find((c) => c.style.cssText.includes("inset:0"));
    expect(veu?.style.cssText).toContain("animation:mbAiFadeIn");
    expect(folhas()).toMatch(/@keyframes mbAiFadeIn\{from\{opacity:0\}to\{opacity:1\}\}/);
  });

  it("a folha de estilos entra uma vez, por mais que se abra o painel", () => {
    montar();
    for (let i = 0; i < 3; i += 1) mascote()?.disparar("click"); // abre, fecha, abre
    expect(doc.head.children.filter((c) => c.tag === "style")).toHaveLength(1);
  });

  it("mbBubbleIn tem a mesma definição aqui e no assistente de criação (com as duas na página, ganha a última)", () => {
    const ler = (p: string): string => readFileSync(join(__dirname, "..", p), "utf8");
    const definicao = (texto: string): string | undefined =>
      texto.match(/@keyframes mbBubbleIn\{from\{[^}]*\}to\{[^}]*\}\}/)?.[0];
    const aqui = definicao(ler("web/lib/aiAgent.ts"));
    expect(aqui).toBeDefined();
    expect(definicao(ler("web/views/wizard.ts"))).toBe(aqui);
  });
});

describe("Fechar e desmontar repõem a página", () => {
  it("desmontar sem ter aberto a folha não mexe no overflow da página", () => {
    doc.body.style.overflow = "clip";
    montar()();
    expect(doc.body.style.overflow).toBe("clip");
  });

  it("a folha do telemóvel bloqueia o scroll, e desmontá-la devolve-o", () => {
    doc.body.style.overflow = "clip";
    estreito = true;
    const u = montar();
    mascote()?.disparar("click");
    expect(doc.body.style.overflow).toBe("hidden");
    u();
    expect(doc.body.style.overflow).toBe("clip");
  });

  it("Escape fecha o painel aberto", () => {
    montar();
    mascote()?.disparar("click");
    const antes = app.children.length;
    doc.disparar("keydown", { key: "Escape" });
    expect(app.children.length).toBe(antes - 1);
    expect(mascote()).toBeDefined();
  });
});
