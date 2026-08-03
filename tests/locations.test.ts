/**
 * Tarefa 10.7 da spec `melhorias-loja-e-admin` (R5.5, R5.6, R5.7, R5.8, R5.9).
 *
 * Exemplos nomeados que documentam a cascata de `resolveLocations` e o formato
 * exato dos URL de `mapEmbedSrc`. Import estático directo: o módulo é puro e não
 * toca em `document`, `window` nem `localStorage`, pelo que não é preciso o
 * contorno de `await import()` com o especificador numa constante que
 * `tests/storeCustom.property.test.ts` usa para os módulos de `web/`.
 *
 * ## O que este ficheiro faz que o `tests/seoInfra.test.ts` não faz
 *
 * O `seoInfra` já guarda a **paridade** entre `api/_seo.js` e este módulo com 17
 * casos de entrada. Paridade é uma relação: compara os dois lados um com o
 * outro e passa mesmo que ambos estejam errados da mesma maneira. Este ficheiro
 * fixa os **valores esperados** — a ordem da cascata e o texto dos URL — e por
 * isso falha com mensagem clara quando alguém mexer na regra, mesmo que a mexa
 * nos dois lados.
 *
 * Exemplos e não propriedade: a regra é uma cascata de casos enumeráveis, e a
 * totalidade sobre entradas arbitrárias já está coberta pela Propriedade 3 e
 * pelos casos malformados do `seoInfra`.
 */
import { describe, it, expect } from "vitest";
import { resolveLocations, mapEmbedSrc, type StorePlace } from "../src/services/locations.js";

describe("resolveLocations — caso 1: lista de `places` (R5.5)", () => {
  it("devolve uma entrada por localização, na ordem gravada, com nome, morada e coordenadas", () => {
    const bloco = {
      type: "location",
      title: "As nossas lojas",
      places: [
        { name: "Talatona", address: "Via S8, Talatona", lat: -8.918, lng: 13.184 },
        { name: "Baixa", address: "Rua Rainha Ginga, 12" },
        { address: "Benfica" },
      ],
    };

    const lista = resolveLocations(bloco, "Morro Bento");

    // Três localizações, três mapas (R5.5). O rodapé é ignorado: só entra em
    // cena quando o bloco não tem nada de aproveitável.
    expect(lista).toHaveLength(3);
    expect(lista.map((p) => p.name)).toEqual(["Talatona", "Baixa", undefined]);
    expect(lista.map((p) => p.address)).toEqual([
      "Via S8, Talatona",
      "Rua Rainha Ginga, 12",
      "Benfica",
    ]);

    // As coordenadas só existem na primeira; as outras duas vão para o mapa
    // por morada (R5.7).
    expect(lista[0]!.lat).toBe(-8.918);
    expect(lista[0]!.lng).toBe(13.184);
    expect(lista[1]!.lat).toBeUndefined();
    expect(lista[2]!.lng).toBeUndefined();
  });

  it("uma localização com `lat` mas sem `lng` cai no mapa por morada, e não num mapa em branco", () => {
    // Meia coordenada é um estado real do editor: o Dono escreve a latitude e
    // sai do campo antes da longitude. Com só metade do par não há caixa de
    // enquadramento possível, e desenhar um mapa com `NaN` no URL daria um
    // rectângulo cinzento sem informação nenhuma.
    const [local] = resolveLocations({ places: [{ name: "Loja", address: "Kilamba", lat: -8.9 }] });

    expect(local!.lat).toBe(-8.9);
    expect(local!.lng).toBeUndefined();
    expect(mapEmbedSrc(local!)).toBe(
      "https://maps.google.com/maps?q=Kilamba&z=15&output=embed",
    );
  });

  it("devolve objetos novos, seguros de mutar pelo Editor", () => {
    // O Editor materializa `blocks[i].places` no arranque e edita essa lista
    // (tarefa 10.5). Se as entradas devolvidas fossem as do bloco, escrever num
    // campo do popover alterava a Personalização gravada antes de o Dono
    // guardar, e a baseline `savedJson` passava a acusar alterações fantasma.
    const original = { name: "Talatona", address: "Via S8", lat: -8.918, lng: 13.184 };
    const bloco = { type: "location", places: [original] };

    const lista = resolveLocations(bloco);

    expect(lista).not.toBe(bloco.places);
    expect(lista[0]).not.toBe(original);

    const mutavel = lista[0] as { name?: string | undefined };
    mutavel.name = "Outro nome";
    expect(original.name).toBe("Talatona");
  });
});

describe("resolveLocations — caso 2: localização única legada (R5.9)", () => {
  it("lê `address`, `lat` e `lng` do próprio bloco e devolve uma só localização", () => {
    const bloco = { type: "location", title: "Visite-nos", address: "Luanda Sul", lat: -8.9, lng: 13.2 };

    const lista = resolveLocations(bloco, "Morro Bento");

    expect(lista).toHaveLength(1);
    expect(lista[0]).toEqual({ address: "Luanda Sul", lat: -8.9, lng: 13.2 });
  });

  it("o formato legado nunca ganha `name`: o `title` é o título da secção, não o nome do ponto de venda", () => {
    const [local] = resolveLocations({ type: "location", title: "Visite-nos", address: "Cacuaco" });

    expect(local!.address).toBe("Cacuaco");
    expect(local!.name).toBeUndefined();
    // A asserção que interessa: o título do bloco não aparece em sítio nenhum
    // da localização. Se aparecesse, cada Loja em produção passava a mostrar
    // «Visite-nos» como se fosse o nome de uma loja física.
    expect(Object.values(local!)).not.toContain("Visite-nos");
  });

  it("`places` presente mas só com entradas inúteis não apaga a morada legada", () => {
    // Esta é a regra que impede um `places: [null]` — deixado por uma remoção
    // no editor, ou por JSON editado à mão — de fazer desaparecer a morada que
    // a Loja tem gravada e publicada. A cascata continua para o caso 2 em vez
    // de aceitar uma lista sem nada para desenhar. Nenhuma das quatro entradas
    // é um objeto onde se possa ler campos: `null` e números não têm campos, e
    // arrays são listas, não localizações.
    const lista = resolveLocations({
      places: [null, 3, "x", []],
      address: "Viana",
      lat: -8.9,
      lng: 13.37,
    });

    expect(lista).toHaveLength(1);
    expect(lista[0]).toEqual({ address: "Viana", lat: -8.9, lng: 13.37 });
  });

  it("`lat`/`lng` a `NaN` ou `Infinity` contam como ausentes e o mapa cai na morada", () => {
    // `NaN` e `Infinity` são do tipo `number` e passariam uma barreira de tipos
    // ingénua, mas produziriam uma caixa de enquadramento com `NaN` no URL — um
    // mapa em branco. Tratá-los como ausentes faz a localização cair no mapa
    // por morada, que mostra alguma coisa útil.
    const [comNaN] = resolveLocations({ address: "Cacuaco", lat: NaN, lng: NaN });
    expect(comNaN).toEqual({ address: "Cacuaco", lat: undefined, lng: undefined });
    expect(mapEmbedSrc(comNaN!)).toBe(
      "https://maps.google.com/maps?q=Cacuaco&z=15&output=embed",
    );

    const [comInfinito] = resolveLocations({
      places: [{ name: "Viana", address: "Viana", lat: Infinity, lng: -Infinity }],
    });
    expect(comInfinito!.lat).toBeUndefined();
    expect(comInfinito!.lng).toBeUndefined();

    const url = mapEmbedSrc(comInfinito!);
    expect(url).toBe("https://maps.google.com/maps?q=Viana&z=15&output=embed");
    expect(url).not.toContain("NaN");
    expect(url).not.toContain("Infinity");
  });
});

describe("resolveLocations — caso 3: lista vazia cai na morada do rodapé (R5.8)", () => {
  it("com `places` vazio e sem morada no bloco, usa a morada do rodapé", () => {
    const lista = resolveLocations({ type: "location", places: [] }, "Morro Bento");

    expect(lista).toEqual([{ address: "Morro Bento" }]);
  });

  it("sem rodapé utilizável, devolve uma entrada vazia — nunca uma lista vazia", () => {
    // Devolver sempre ≥ 1 entrada é o que permite a quem desenha iterar sem
    // casos especiais; o mapa dessa entrada cai na morada predefinida, que é
    // exatamente o que a Loja mostra hoje nesta situação.
    expect(resolveLocations({ type: "location" })).toEqual([{}]);
    expect(resolveLocations({ type: "location" }, "   ")).toEqual([{}]);
    expect(mapEmbedSrc(resolveLocations({ type: "location" })[0]!)).toContain("Luanda%2C%20Angola");
  });
});

describe("mapEmbedSrc — com coordenadas: OpenStreetMap com marcador (R5.6)", () => {
  it("produz o URL de embed com caixa de enquadramento de ±0,008° e marcador no ponto", () => {
    // Ponto escolhido em (0, 0) para o URL esperado poder ser escrito por
    // extenso, sem aritmética de vírgula flutuante a obscurecer o formato.
    expect(mapEmbedSrc({ name: "Meridiano", lat: 0, lng: 0 })).toBe(
      "https://www.openstreetmap.org/export/embed.html?bbox=-0.008,-0.008,0.008,0.008&layer=mapnik&marker=0,0",
    );
  });

  it("com coordenadas reais, enquadra a área em torno do ponto e ignora a morada", () => {
    const place: StorePlace = { name: "Talatona", address: "Via S8, Talatona", lat: -8.918, lng: 13.184 };
    const url = new URL(mapEmbedSrc(place, "Morro Bento"));

    expect(url.origin + url.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
    expect(url.searchParams.get("layer")).toBe("mapnik");
    expect(url.searchParams.get("marker")).toBe("-8.918,13.184");

    // A ordem da caixa é a do OpenStreetMap: oeste, sul, leste, norte.
    const bbox = (url.searchParams.get("bbox") ?? "").split(",").map(Number);
    expect(bbox).toHaveLength(4);
    expect(bbox[0]!).toBeCloseTo(13.176, 6);
    expect(bbox[1]!).toBeCloseTo(-8.926, 6);
    expect(bbox[2]!).toBeCloseTo(13.192, 6);
    expect(bbox[3]!).toBeCloseTo(-8.91, 6);

    // Com coordenadas não se pesquisa pela morada.
    expect(url.href).not.toContain("maps.google.com");
    expect(url.href).not.toContain("Talatona");
  });
});

describe("mapEmbedSrc — sem coordenadas: embed da Google pela morada (R5.7)", () => {
  it("pesquisa a morada aparada, sem chave de API", () => {
    expect(mapEmbedSrc({ name: "Baixa", address: "  Rua Rainha Ginga, 12  " })).toBe(
      "https://maps.google.com/maps?q=Rua%20Rainha%20Ginga%2C%2012&z=15&output=embed",
    );
  });

  it("sem morada na localização, usa a morada de recurso recebida", () => {
    expect(mapEmbedSrc({}, "Morro Bento")).toBe(
      "https://maps.google.com/maps?q=Morro%20Bento&z=15&output=embed",
    );
  });

  it("sem morada nenhuma, cai na morada predefinida «Luanda, Angola»", () => {
    expect(mapEmbedSrc({})).toBe(
      "https://maps.google.com/maps?q=Luanda%2C%20Angola&z=15&output=embed",
    );
    expect(mapEmbedSrc({ address: "   " }, "   ")).toBe(
      "https://maps.google.com/maps?q=Luanda%2C%20Angola&z=15&output=embed",
    );
  });
});
