/**
 * Os quatro layouts do checkout **renderizados de facto** — o que o comprador
 * vê e o que o leitor de ecrã lê.
 *
 * As asserções são sobre o comportamento e não sobre classes CSS:
 *
 *  - **todos** os layouts têm o código de desconto (antes «Compacto» e
 *    «Minimal» não tinham), o nome e o telemóvel obrigatórios, o email e o NIF
 *    opcionais, e — com produtos físicos — a morada de entrega e a área;
 *  - sem pagamentos digitais só aparece o WhatsApp;
 *  - os botões de marca escrevem com `var(--brand-ink)`, nunca branco fixo;
 *  - cada campo tem rótulo, e cada erro está ligado ao seu campo.
 *
 * ## Dois contornos, os dois do padrão de `tests/categoryRender.test.ts`
 *
 * 1. **Especificador em constante** — o módulo importa `esc` de `web/lib/dom.ts`
 *    e `tests/` compila sem DOM, por isso um import estático não compilaria.
 * 2. **`location` mínimo** — por precaução: `web/lib/dom.ts` importa o encaminhamento,
 *    que lê `location` quando uma página monta ligações de loja.
 */
import { describe, it, expect, beforeAll } from "vitest";

const ESPECIFICADOR_LAYOUTS = "../web/templates/checkoutLayouts.js";

type Variante = "dividido" | "moderno" | "compacto" | "minimal";

/** Superfície de `web/templates/checkoutLayouts.ts` exercitada aqui. */
interface Layouts {
  CHECKOUT_VARIANTS: { id: Variante; label: string }[];
  renderCheckout(variant: Variante, ctx: unknown): string;
  renderOrderSummaryCard(ctx: unknown): string;
  renderCustomerFields(ctx: unknown, opts?: { columns?: boolean }): string;
  renderPayButton(selected: string | null, busy?: boolean): string;
  renderStepper(active: number): string;
  checkoutTotal(ctx: unknown): number;
}

let L: Layouts;

beforeAll(async () => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  L = (await import(ESPECIFICADOR_LAYOUTS)) as unknown as Layouts;
});

const VARIANTES: readonly Variante[] = ["dividido", "moderno", "compacto", "minimal"];

/** Contexto de um carrinho físico numa loja só com WhatsApp. */
function contexto(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storeName: "Loja Teste",
    items: [
      { name: "Camisola oficial", price: 15_000, quantity: 2, variantLabel: "Cor: Azul · Tamanho: M" },
      { name: "Boné", price: 8_000, quantity: 1, imageUrl: "https://cdn.exemplo/bone.jpg" },
    ],
    total: 38_000,
    online: false,
    selected: "whatsapp",
    physical: true,
    areas: [{ name: "Talatona", fee: 2_500 }, { name: "Kilamba", fee: 0 }],
    selectedArea: null,
    deliveryFee: 0,
    ...extra,
  };
}

/** A etiqueta de abertura do elemento com este id (`<input …>`, `<select …>`, `<button …>`). */
function tagDe(html: string, id: string): string {
  const m = new RegExp(`<(input|select|button|textarea)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  expect(m, `elemento #${id} não encontrado`).not.toBeNull();
  return m![0];
}

/** Valor de um atributo numa etiqueta, ou `null`. */
function atributo(tag: string, nome: string): string | null {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(tag);
  return m ? m[1]! : null;
}

/** Cada campo editável tem um `<label for>` com o seu id. */
function camposSemRotulo(html: string): string[] {
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/g)].map((m) => m[1]!);
  return ids.filter((id) => !html.includes(`<label for="${id}"`));
}

describe("checkout — o que existe em todos os layouts", () => {
  it("há exatamente quatro layouts, e são os que o editor oferece", () => {
    expect(L.CHECKOUT_VARIANTS.map((v) => v.id)).toEqual([...VARIANTES]);
  });

  for (const variante of VARIANTES) {
    it(`${variante}: código de desconto com rótulo, botão e mensagem ligada ao campo`, () => {
      const html = L.renderCheckout(variante, contexto());
      expect(html).toContain('<label for="coupon"');
      expect(atributo(tagDe(html, "coupon"), "aria-describedby")).toBe("coupon-msg");
      expect(html).toContain('id="coupon-msg"');
      expect(tagDe(html, "coupon-apply")).toContain('type="button"');
    });

    it(`${variante}: nome e telemóvel obrigatórios, email e NIF opcionais, todos com rótulo`, () => {
      const html = L.renderCheckout(variante, contexto());
      for (const id of ["c-name", "c-phone"]) expect(tagDe(html, id), id).toMatch(/\srequired(\s|\/|>)/);
      for (const id of ["c-email", "c-nif"]) expect(tagDe(html, id), id).not.toMatch(/\srequired(\s|\/|>)/);
      expect(atributo(tagDe(html, "c-phone"), "type")).toBe("tel");
      expect(atributo(tagDe(html, "c-email"), "type")).toBe("email");
      expect(camposSemRotulo(html)).toEqual([]);
    });

    it(`${variante}: produtos físicos pedem a morada (rua, número, ponto de referência) e a área`, () => {
      const html = L.renderCheckout(variante, contexto());
      expect(html).toContain("Morada de entrega");
      expect(tagDe(html, "c-street")).toMatch(/\srequired(\s|\/|>)/);
      expect(tagDe(html, "c-number")).not.toMatch(/\srequired(\s|\/|>)/);
      expect(tagDe(html, "c-reference")).not.toMatch(/\srequired(\s|\/|>)/);
      expect(tagDe(html, "c-area")).toMatch(/\srequired(\s|\/|>)/);
      // A taxa de cada área está à vista no seletor, «grátis» incluída.
      expect(html).toContain("Talatona · 2.500,00 Kz");
      expect(html).toContain("Kilamba · grátis");
    });

    it(`${variante}: sem produtos físicos não há morada nem área`, () => {
      const html = L.renderCheckout(variante, contexto({ physical: false }));
      for (const id of ["c-street", "c-number", "c-reference", "c-area"]) expect(html).not.toContain(`id="${id}"`);
      expect(html).not.toContain("Morada de entrega");
    });

    it(`${variante}: sem pagamentos digitais só o WhatsApp; com eles, os três métodos`, () => {
      const so = L.renderCheckout(variante, contexto());
      expect(so).toContain('data-method="whatsapp"');
      expect(so).not.toContain('data-method="mcx"');
      expect(so).not.toContain('data-method="reference"');
      expect(so).not.toContain("Pagamento 100% seguro");
      const todos = L.renderCheckout(variante, contexto({ online: true, selected: null }));
      for (const m of ["mcx", "reference", "whatsapp"]) expect(todos).toContain(`data-method="${m}"`);
      // O método escolhido diz que o está, a quem não o vê.
      expect(so).toMatch(/data-method="whatsapp" aria-pressed="true"/);
      expect(todos).toMatch(/data-method="mcx" aria-pressed="false"/);
    });

    it(`${variante}: botões de marca escrevem com var(--brand-ink), nunca branco fixo`, () => {
      const html = L.renderCheckout(variante, contexto({ discount: 1_000, discountCode: "VERAO10" }));
      expect(atributo(tagDe(html, "pay"), "style")).toContain("color:var(--brand-ink");
      expect(html).not.toMatch(/background:var\(--brand\);color:#fff/);
      expect(html).not.toContain("text-white");
    });

    it(`${variante}: um erro marca o campo e fica ligado a ele por aria-describedby`, () => {
      const errors = {
        name: "Indique o seu nome.",
        phone: "Indique um número de telemóvel angolano válido (9 algarismos, a começar por 9).",
        street: "Indique a rua ou o bairro da entrega.",
        area: "Escolha a área de entrega.",
      };
      const html = L.renderCheckout(variante, contexto({ errors }));
      for (const [campo, mensagem] of Object.entries(errors)) {
        const tag = tagDe(html, `c-${campo}`);
        expect(atributo(tag, "aria-invalid"), campo).toBe("true");
        const ligados = (atributo(tag, "aria-describedby") ?? "").split(" ");
        expect(ligados, campo).toContain(`c-${campo}-error`);
        for (const id of ligados) expect(html, `${campo} → #${id}`).toContain(`id="${id}"`);
        expect(html).toContain(`id="c-${campo}-error"`);
        expect(html).toContain(mensagem);
      }
      // Sem erro, o campo não é inválido.
      expect(atributo(tagDe(html, "c-email"), "aria-invalid")).toBeNull();
    });

    it(`${variante}: o que o comprador escreveu volta ao campo, escapado`, () => {
      const hostil = `"><img src=x onerror=alert(1)>`;
      const html = L.renderCheckout(variante, contexto({ buyer: { name: hostil, street: "Rua Direita", area: "Talatona" } }));
      expect(html).not.toContain("<img src=x");
      expect(atributo(tagDe(html, "c-name"), "value")).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
      expect(atributo(tagDe(html, "c-street"), "value")).toBe("Rua Direita");
    });

    it(`${variante}: o desconto aparece com o código, e pode ser removido`, () => {
      const html = L.renderCheckout(variante, contexto({ discount: 1_500, discountCode: "VERAO10" }));
      expect(html).toContain("Desconto · VERAO10");
      expect(html).toContain("−1.500,00 Kz");
      expect(html).toContain("Remover código VERAO10");
    });
  }
});

describe("checkout — entrega e totais", () => {
  it("entrega grátis: a área continua no resumo, com «Grátis»", () => {
    const html = L.renderCheckout("dividido", contexto({ selectedArea: "Kilamba", deliveryFee: 0 }));
    expect(html).toContain("Entrega · Kilamba");
    expect(html).toContain("Grátis");
  });

  it("a loja não definiu áreas: a entrega é «a combinar», sem seletor de área", () => {
    const html = L.renderCheckout("minimal", contexto({ areas: [] }));
    expect(html).not.toContain('id="c-area"');
    expect(html).toContain("A combinar com a loja");
  });

  it("checkoutTotal = subtotal + entrega − desconto, nunca negativo", () => {
    expect(L.checkoutTotal(contexto({ deliveryFee: 2_500, selectedArea: "Talatona" }))).toBe(40_500);
    expect(L.checkoutTotal(contexto({ deliveryFee: 2_500, discount: 4_050 }))).toBe(36_450);
    expect(L.checkoutTotal(contexto({ physical: false, deliveryFee: 2_500 }))).toBe(38_000);
    expect(L.checkoutTotal(contexto({ discount: 1_000_000 }))).toBe(0);
  });

  it("o total apresentado é o de checkoutTotal — o que segue em expectedTotal", () => {
    const c = contexto({ deliveryFee: 2_500, selectedArea: "Talatona", discount: 1_000, discountCode: "X" });
    expect(L.renderCheckout("compacto", c)).toContain("39.500,00 Kz");
    expect(L.checkoutTotal(c)).toBe(39_500);
  });
});

describe("checkout — blocos do fluxo por etapas", () => {
  it("o resumo do passo 2 também tem o código de desconto", () => {
    const html = L.renderOrderSummaryCard(contexto());
    expect(html).toContain('<label for="coupon"');
    expect(atributo(tagDe(html, "coupon-apply"), "style")).toContain("color:var(--brand-ink");
  });

  it("o passo 1 tem os mesmos campos, com rótulo", () => {
    const html = L.renderCustomerFields(contexto());
    for (const id of ["c-name", "c-phone", "c-email", "c-nif", "c-area", "c-street", "c-number", "c-reference"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(camposSemRotulo(html)).toEqual([]);
  });

  it("o botão ocupado continua focável (aria-disabled, não disabled)", () => {
    const ocupado = tagDe(L.renderPayButton("mcx", true), "pay");
    expect(ocupado).toContain('aria-disabled="true"');
    expect(ocupado).toContain('aria-busy="true"');
    expect(ocupado).not.toMatch(/\sdisabled(\s|>)/);
    expect(L.renderPayButton("mcx", true)).toContain("A processar…");
    // Sem método escolhido não há nada para fazer: aí sim, desativado.
    expect(tagDe(L.renderPayButton(null), "pay")).toMatch(/\sdisabled(\s|>)/);
  });

  it("o passo ativo está marcado para o leitor de ecrã e os círculos usam var(--brand-ink)", () => {
    const html = L.renderStepper(2);
    expect(html).toMatch(/<li[^>]*aria-current="step"[^>]*>[\s\S]*?2\. Pagamento/);
    expect(html).toContain("color:var(--brand-ink");
    expect(html).not.toContain("text-white");
  });
});
