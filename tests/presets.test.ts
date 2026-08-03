/**
 * Tarefa 7.2 da spec `melhorias-loja-e-admin` (R1.1, R1.2, R1.3, assunção [A1]).
 *
 * O pedido do utilizador foi «só muda o nome, tudo o resto permanece». Este
 * ficheiro é a guarda desse contrato, e o **identificador** é o seu coração:
 * as Lojas já criadas em produção gravam `customization.__basedOn =
 * "vermelho-moderno"` e `getPreset(id)` depende dele. Mudar o `id` orfanava
 * essas Lojas, e nenhuma mensagem de erro o diria — a Loja limitar-se-ia a
 * deixar de reconhecer o Preset de origem. Daí a assimetria destas asserções:
 * o nome é livre de mudar, o `id` não.
 *
 * ## Import estático, e porquê
 *
 * `web/` está fora do `tsconfig.json` (compila `src/**` e `tests/**`), mas
 * `tests/**` **é** verificado pelo `tsc`, pelo que um import de `web/` entra no
 * programa de tipos e tem de compilar com `lib: ["ES2022"]`, sem DOM. Aqui
 * compila: `web/templates/presets.ts` importa apenas
 * `type { StoreCustomization }` de `./types.js`, e `types.ts` importa apenas
 * tipos de `src/storefront/storeRenderer.js` — já dentro do programa. Nada toca
 * em `document`, `window` nem `localStorage`. Por isso **não** é preciso o
 * contorno de `await import()` com o especificador numa constante que
 * `tests/storeCustom.property.test.ts` usa para `web/lib/whatsapp.ts`: esse é
 * necessário quando o módulo de `web/` arrasta o DOM, o que não é o caso.
 *
 * O import estático tem valor próprio: se alguém acrescentar a `presets.ts` uma
 * dependência do DOM, este ficheiro deixa de compilar e o `npm run build` avisa.
 *
 * Exemplos, não propriedade: `TEMPLATE_PRESETS` é uma constante, não há espaço
 * de entrada para variar.
 */
import { describe, it, expect } from "vitest";
import {
  TEMPLATE_PRESETS,
  getPreset,
  getRecommendedPreset,
  type TemplatePreset,
} from "../web/templates/presets.js";

/** O Preset renomeado é o primeiro da lista — é ele o recomendado. */
const preset = TEMPLATE_PRESETS[0]!;

describe("Presets — «Ekolo Sports» (R1.1, R1.2, R1.3)", () => {
  it("apresenta o Preset sob o nome «Ekolo Sports» e já não sob nenhuma grafia anterior", () => {
    // R1.1 — nome apresentado em todos os ecrãs que apresentam Presets.
    expect(preset.name).toBe("Ekolo Sports");

    // As duas grafias anteriores desapareceram do nome apresentado. Continuam a
    // viver em `previousNames` do Semeador_De_Modelos, que é outro ficheiro e
    // outro teste (`tests/seedRename.test.ts`); aqui não podem reaparecer.
    const nomes = TEMPLATE_PRESETS.map((p) => p.name);
    expect(nomes).not.toContain("Vermelho Moderno");
    expect(nomes).not.toContain("Ekolo sports");
  });

  it("mantém o identificador `vermelho-moderno` intacto e resolúvel por getPreset", () => {
    // R1.2, [A1] — o identificador é o que as Lojas em produção gravam em
    // `customization.__basedOn`. Não muda com o nome.
    expect(preset.id).toBe("vermelho-moderno");

    // `getPreset` continua a encontrar o Preset pelo identificador antigo: é
    // esta chamada que uma Loja em produção faz a partir de `__basedOn`.
    const porId = getPreset("vermelho-moderno");
    expect(porId).not.toBeNull();
    expect(porId).toBe(preset);

    // O nome novo não é um identificador: procurar por ele não devolve nada, o
    // que confirma que `getPreset` empareha por `id` e não por `name`.
    expect(getPreset("Ekolo Sports")).toBeNull();
    expect(getPreset("ekolo-sports")).toBeNull();
  });

  it("getRecommendedPreset() devolve este Preset com assinatura não anulável", () => {
    // R1.3 — a atribuição a `TemplatePreset` (sem `| null`, sem `!`, sem `??`)
    // é a asserção de tipos: se a assinatura passasse a anulável, esta linha
    // deixava de compilar e o `npm run build` falhava.
    const recomendado: TemplatePreset = getRecommendedPreset();

    expect(recomendado).toBe(preset);
    expect(recomendado.id).toBe("vermelho-moderno");
    expect(recomendado.name).toBe("Ekolo Sports");
  });
});

describe("Presets — a customização de «Ekolo Sports» permanece intacta (R1.1)", () => {
  it("mantém as cores, o tema, o cabeçalho, o hero, a grelha de produtos e o rodapé", () => {
    const c = preset.customization;

    expect(c.colors?.primary).toBe("#DF0B26");
    expect(c.colors?.text).toBe("#111827");
    expect(c.theme?.style).toBe("moderno");

    expect(c.header?.variant).toBe("promo");
    expect(c.header?.promo).toBe("Frete grátis em compras acima de 15.000 Kz");

    expect(c.hero?.variant).toBe("imagem");
    expect(c.hero?.title).toBe("A sua marca, o seu estilo");
    expect(c.hero?.subtitle).toBe("Descubra a coleção perfeita para si.");
    expect(c.hero?.ctaLabel).toBe("Ver produtos");

    expect(c.productGrid?.variant).toBe("retrato");
    expect(c.productPage?.variant).toBe("classico");
    expect(c.checkout?.variant).toBe("compacto");

    expect(c.footer?.variant).toBe("colunas");
    expect(c.footer?.about).toContain("entrega rápida em toda Angola");
  });

  it("mantém os dois blocos de conteúdo: testemunhos e localização", () => {
    const blocos = preset.customization.blocks ?? [];
    expect(blocos.map((b) => b.type)).toEqual(["testimonials", "location"]);

    const testemunhos = blocos.find((b) => b.type === "testimonials");
    expect(testemunhos?.title).toBe("O que os nossos clientes dizem");
    // Os três testemunhos de fábrica continuam lá, com nome e texto.
    const itens = testemunhos?.type === "testimonials" ? (testemunhos.items ?? []) : [];
    expect(itens).toHaveLength(3);
    expect(itens.map((i) => i.name)).toEqual(["Ana Silva", "Carlos Mendes", "Maria João"]);
    for (const item of itens) {
      expect(typeof item.text).toBe("string");
      expect(item.text!.length).toBeGreaterThan(0);
    }

    const localizacao = blocos.find((b) => b.type === "location");
    expect(localizacao?.title).toBe("Visite-nos");
    if (localizacao?.type === "location") {
      expect(localizacao.address).toBe("Luanda, Angola");
      expect(localizacao.lat).toBeCloseTo(-8.8383, 4);
      expect(localizacao.lng).toBeCloseTo(13.2344, 4);
    }
  });
});
