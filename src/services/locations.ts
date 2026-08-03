/**
 * Localizações físicas de uma Loja (domínio puro, sem DOM).
 *
 * O Bloco_SSR de tipo `location` chega em JSON da coluna `customization` da
 * Loja e existe em dois formatos gravados:
 *
 *  - **localização única (legado)** — `address`, `lat` e `lng` no próprio bloco,
 *    tal como todas as Lojas em produção o têm hoje;
 *  - **lista (novo)** — `places: { name?, address?, lat?, lng? }[]`, que é o que
 *    permite mais do que um ponto de venda (R5.1).
 *
 * Nenhum dos dois é de confiança: o JSON pode ter qualquer forma, porque foi
 * gravado por versões diferentes da Plataforma e é editável à mão pelo Painel
 * Admin. Por isso `resolveLocations` aceita `unknown` e é **total** — termina
 * sem lançar para qualquer entrada, incluindo `null`, números, cadeias, arrays,
 * `places` que não é array, entradas de `places` que não são objetos e
 * `lat`/`lng` que são strings, `NaN` ou objetos. Um `TypeError` aqui apagaria a
 * página inteira da Loja, como já aconteceu com a Pagina_De_Produto (R11).
 *
 * A forma de `StorePlace` é deliberadamente **idêntica** a `lumiere.boutiques[]`
 * (`MODELO-GUIA.md` §8) para os dois partilharem `mapEmbedSrc` (decisão D4).
 */

/** Morada usada quando não há nenhuma outra: a mesma do Lumière e dos blocos. */
const DEFAULT_ADDRESS = "Luanda, Angola";

/** Meio-lado da caixa de enquadramento do mapa de OpenStreetMap, em graus. */
const BBOX_HALF_SIDE = 0.008;

/**
 * Uma localização física da Loja. Mesma forma de `lumiere.boutiques[]`
 * (`MODELO-GUIA.md` §8).
 */
export interface StorePlace {
  readonly name?: string | undefined;
  readonly address?: string | undefined;
  readonly lat?: number | undefined;
  readonly lng?: number | undefined;
}

/**
 * Devolve o valor como registo de propriedades, ou `null` quando não é um
 * objeto onde faça sentido ler campos. Arrays contam como não-objeto: nem o
 * bloco nem uma entrada de `places` são listas.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Devolve a cadeia de caracteres, ou `undefined` se o valor não for uma string
 * usável. Segue `asText` de `src/services/storeCustom.ts`, com uma diferença:
 * aqui uma morada só de espaços não é usável, porque toda a renderização de
 * mapas já aplicava `(address ?? "").trim() || "Luanda, Angola"`.
 */
function asAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value;
}

/**
 * Devolve a coordenada, ou `undefined` quando não é um número finito.
 *
 * `Number.isFinite` e não `typeof === "number"`: `NaN` e `Infinity` são do tipo
 * `number` e passariam a barreira de tipos, mas produziriam uma caixa de
 * enquadramento com `NaN` no URL — um mapa em branco. Uma coordenada assim é
 * tratada como ausente, o que faz o mapa cair na morada. Para qualquer
 * coordenada real (finita) o comportamento é o mesmo de antes.
 */
function asCoord(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Converte um valor desconhecido numa localização, ou `null` quando o valor não
 * é um objeto. Cada campo é lido em separado: uma entrada com `name` válido e
 * `lat` a apontar para um objeto perde só as coordenadas, não a entrada.
 */
function asPlace(value: unknown): StorePlace | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    name: asAddress(record["name"]),
    address: asAddress(record["address"]),
    lat: asCoord(record["lat"]),
    lng: asCoord(record["lng"]),
  };
}

/** Verdadeiro quando a localização tem alguma coisa que dê para desenhar um mapa. */
function hasMapData(place: StorePlace): boolean {
  return place.address !== undefined || (place.lat !== undefined && place.lng !== undefined);
}

/**
 * Lista de localizações a apresentar num Bloco_SSR `location`, por esta ordem:
 *
 *  1. `block.places` quando tem pelo menos uma entrada aproveitável (formato
 *     novo, R5.5);
 *  2. `block.address`/`lat`/`lng` (formato de localização única, R5.9);
 *  3. a morada do rodapé (R5.8).
 *
 * Devolve **sempre pelo menos uma entrada**, para que quem desenha possa
 * iterar sem casos especiais: quando nem o bloco nem o rodapé têm morada, a
 * entrada devolvida é vazia e o `mapEmbedSrc` correspondente cai na morada
 * predefinida — exatamente o mapa que a Loja mostra hoje nessa situação.
 *
 * Entradas de `places` que não são objetos (`null`, números, cadeias, arrays)
 * são descartadas; se não sobrar nenhuma, a cascata continua para o caso 2, o
 * que impede que um `places: [null]` faça desaparecer uma morada legada ainda
 * gravada no bloco.
 *
 * Total: nunca lança, para qualquer `block`.
 *
 * @param block O Bloco_SSR de tipo `location`, de forma desconhecida.
 * @param footerLocation Morada do rodapé da Loja (`footer.location`), se houver.
 * @returns Localizações a apresentar, pelo menos uma. Objetos novos, nunca os
 *          do `block` recebido.
 */
export function resolveLocations(block: unknown, footerLocation?: string): StorePlace[] {
  const record = asRecord(block);

  // 1. Formato novo: lista de localizações.
  const rawPlaces = record?.["places"];
  if (Array.isArray(rawPlaces)) {
    const places: StorePlace[] = [];
    for (const entry of rawPlaces) {
      const place = asPlace(entry);
      if (place) places.push(place);
    }
    if (places.length > 0) return places;
  }

  // 2. Formato de localização única (legado): campos no próprio bloco.
  const legacy = asPlace(record);
  if (legacy && hasMapData(legacy)) {
    // O `title` do bloco é o título da secção, não o nome de um ponto de venda:
    // o formato legado nunca teve nome por localização.
    return [{ address: legacy.address, lat: legacy.lat, lng: legacy.lng }];
  }

  // 3. Morada do rodapé.
  const footer = asAddress(footerLocation);
  if (footer !== undefined) return [{ address: footer }];

  return [{}];
}

/**
 * URL de mapa embutido com marcador, sem chave de API (R5.3).
 *
 * Generalização de `boutiqueMapSrc` de `web/templates/lumiere.ts`, cuja lógica é
 * copiada tal e qual para o comportamento visível do Lumière não mudar quando
 * passar a usar esta função:
 *
 *  - **com coordenadas** (R5.6) — embed de OpenStreetMap, com caixa de
 *    enquadramento de ±0,008° em torno do ponto e `marker=lat,lng`;
 *  - **só com morada** (R5.7) — embed da Google por pesquisa da morada, `z=15`.
 *
 * @param place Localização a desenhar.
 * @param fallbackAddress Morada a usar quando a localização não tem morada nem
 *        coordenadas; por omissão `"Luanda, Angola"`, como no Lumière.
 * @returns URL para o `src` de um `iframe`. Nunca vazio.
 */
export function mapEmbedSrc(place: StorePlace, fallbackAddress?: string): string {
  const lat = asCoord(place?.lat);
  const lng = asCoord(place?.lng);
  if (lat !== undefined && lng !== undefined) {
    const d = BBOX_HALF_SIDE;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  }
  const addr = asAddress(place?.address) ?? asAddress(fallbackAddress) ?? DEFAULT_ADDRESS;
  return `https://maps.google.com/maps?q=${encodeURIComponent(addr.trim())}&z=15&output=embed`;
}
