/**
 * Leitura defensiva da Personalização de uma Loja (domínio puro, sem DOM).
 *
 * A Personalização (`stores.customization`) chega em JSON da base de dados e
 * pode ter **qualquer** forma: há Lojas gravadas por versões antigas da
 * Plataforma, com campos de tipo diferente do que os tipos de
 * `web/templates/types.ts` declaram. É por isso que todas as funções deste
 * módulo aceitam `unknown` em vez de um tipo concreto — o tipo concreto mentia.
 *
 * ## A avaria que este módulo corrige
 *
 * Antes, a leitura destes campos estava espalhada por duas vistas e sem defesa
 * contra tipos errados:
 *
 *  - `resolveWaPhone` (`web/lib/whatsapp.ts`) devolvia `footer.phone` tal como
 *    estava; se fosse um objeto, o `waLink` seguinte chamava `.replace` nesse
 *    objeto → `TypeError`.
 *  - `perksList` (`web/templates/perks.ts`) fazia `(p?.text ?? "").trim()`; se
 *    `text` fosse um número, chamava `.trim` num número → `TypeError`.
 *
 * Em ambos os casos o `TypeError` propaga-se e a Pagina_De_Produto **abre em
 * branco**: uma Loja antiga com `footer.phone` a apontar para um objeto perde a
 * página de produto inteira. Daí a garantia central deste módulo: todas as
 * funções são **totais** — terminam sem lançar para qualquer entrada, incluindo
 * `null`, `undefined`, números, cadeias, arrays, objetos com campos de tipo
 * errado e objetos com ciclos (nenhuma função percorre o objeto em
 * profundidade, pelo que um ciclo é apenas mais um objeto).
 */

/**
 * Devolve o valor como registo de propriedades, ou `null` quando não é um
 * objeto onde faça sentido ler campos. Arrays contam como não-objeto: nem a
 * Personalização nem `footer`/`whatsapp` são listas.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Devolve a cadeia de caracteres, ou `undefined` se o valor não for uma string
 * usável.
 *
 * «Usável» é aqui **exatamente** o que o `||` de `resolveWaPhone` já
 * considerava usável antes deste módulo existir: qualquer string diferente de
 * `""`. Ou seja:
 *
 *  - tudo o que não seja `typeof v === "string"` → `undefined` (é isto que
 *    trava o `TypeError`);
 *  - `""` → `undefined`, para que a cadeia de fallback continue a descer;
 *  - **uma string só com espaços conta como usável** e é devolvida tal e qual,
 *    sem `trim`. Decisão deliberada: `"   "` era truthy no `||` antigo e
 *    portanto vencia o fallback; mudá-la aqui mudaria o número que uma Loja já
 *    gravada apresenta hoje. Quem precisar de rejeitar espaços em branco
 *    aplica o seu próprio `trim` sobre o resultado — é o que `normalizePerks`
 *    faz, porque a lista de garantias sempre filtrou o texto em branco.
 *
 * @param v Valor de origem desconhecida (JSON da base de dados).
 * @returns A própria string quando é usável; `undefined` caso contrário.
 */
export function asText(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Número de telefone predefinido, usado quando a Loja não tem nenhum usável. */
export const WA_DEFAULT_PHONE = "+244 900 000 000";

/**
 * Número de WhatsApp da Loja: `whatsapp.phone` → `footer.phone` →
 * `WA_DEFAULT_PHONE`.
 *
 * `asText` é aplicado em **cada** passo da cadeia, e não só no fim: um
 * `whatsapp.phone` de tipo errado é ignorado (R11.3) e deixa a decisão passar
 * ao `footer.phone`, e um `footer.phone` de tipo errado cai no número
 * predefinido (R11.2). O resultado é **sempre** uma string não vazia, pelo que
 * o `waLink` que o consome pode chamar `.replace` sem se defender.
 *
 * @param custom Personalização da Loja, de forma desconhecida.
 * @returns Número de WhatsApp a usar. Nunca vazio, nunca `undefined`.
 */
export function resolveWaPhone(custom: unknown): string {
  const record = asRecord(custom);
  const fromWhatsApp = asText(asRecord(record?.["whatsapp"])?.["phone"]);
  if (fromWhatsApp !== undefined) return fromWhatsApp;
  const fromFooter = asText(asRecord(record?.["footer"])?.["phone"]);
  if (fromFooter !== undefined) return fromFooter;
  return WA_DEFAULT_PHONE;
}

/**
 * Garantias apresentadas quando a Loja não tem nenhuma própria utilizável.
 *
 * Os três valores são os que `web/templates/perks.ts` já apresentava; mudá-los
 * mudaria o que as Lojas sem garantias personalizadas mostram hoje.
 */
export const DEFAULT_PERKS: readonly { readonly icon: string; readonly text: string }[] = [
  { icon: "local_shipping", text: "Entrega em toda Angola" },
  { icon: "verified", text: "Produto original garantido" },
  { icon: "payments", text: "Pagamento na entrega ou Multicaixa" },
];

/**
 * Garantias da Pagina_De_Produto, lidas de `custom.productPerks`.
 *
 * Um item só é aceite quando **tanto `icon` como `text` são strings usáveis**
 * (R11.4) — é a forma esperada de uma garantia, e é o que o Editor grava. O
 * `text` é ainda rejeitado quando fica vazio depois de `trim`, preservando o
 * filtro `(p?.text ?? "").trim() !== ""` que a lista sempre teve; o valor
 * devolvido é o original, sem `trim`, também como antes. Quando não sobra
 * nenhum item — lista ausente, vazia, de tipo errado, ou toda ela malformada —
 * devolve `DEFAULT_PERKS` (R11.5).
 *
 * O resultado é portanto **sempre** uma lista com pelo menos um item, e em
 * todos os itens `icon` e `text` são strings: quem desenha o HTML não precisa
 * de defesas nem de fallbacks.
 *
 * @param custom Personalização da Loja, de forma desconhecida.
 * @returns Lista de garantias a apresentar, com pelo menos um item. Objetos
 *          novos, seguros de mutar, nunca os de `DEFAULT_PERKS`.
 */
export function normalizePerks(custom: unknown): { icon: string; text: string }[] {
  const raw = asRecord(custom)?.["productPerks"];
  const list: { icon: string; text: string }[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const item = asRecord(entry);
      if (!item) continue;
      const icon = asText(item["icon"]);
      const text = asText(item["text"]);
      if (icon === undefined || text === undefined || text.trim() === "") continue;
      list.push({ icon, text });
    }
  }
  if (list.length > 0) return list;
  return DEFAULT_PERKS.map((p) => ({ icon: p.icon, text: p.text }));
}
