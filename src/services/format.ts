/**
 * Formatação de valores (domínio puro, sem DOM).
 *
 * Vive em `src/` — e não em `web/lib/dom.ts` — porque o mesmo formato tem de
 * ser produzido em três sítios: na SPA, no HTML pré-renderizado pelas funções
 * serverless (`api/_seo.js`, que espelha esta implementação) e nos testes.
 */

/**
 * Formata um preço em Kwanza (pt-AO): "1.234,56 Kz".
 *
 * Implementação manual em vez de `Intl`/`toLocaleString`: o separador de
 * milhares do `pt-PT` depende dos dados ICU do runtime (o Node produzia
 * "1 234" com espaço, o browser "1.234" com ponto), o que fazia o preço no
 * HTML servido ao Google diferir do preço apresentado ao comprador.
 */
export function formatKz(price: number): string {
  const safe = Number.isFinite(price) ? price : 0;
  const cents = Math.round(Math.abs(safe) * 100);
  const whole = Math.floor(cents / 100).toString();
  const frac = (cents % 100).toString().padStart(2, "0");
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ".";
    grouped += whole[i];
  }
  return `${safe < 0 ? "-" : ""}${grouped},${frac} Kz`;
}
