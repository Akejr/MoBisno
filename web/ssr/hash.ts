/**
 * Impressão digital do HTML pré-renderizado — **uma só implementação**, usada
 * pelos dois lados da adoção:
 *
 *  - o servidor (`api/prerender.js`, através do pacote `api/_ssr/render.mjs`)
 *    calcula-a sobre o HTML que o modelo produziu e grava-a em
 *    `#app[data-ssr]`;
 *  - a SPA (`render()` de `web/lib/dom.ts`) calcula-a sobre o HTML que ia
 *    escrever e, se for igual, **adota** o DOM que já está no ecrã em vez de o
 *    substituir.
 *
 * É FNV-1a de 32 bits sobre as unidades UTF-16 da cadeia (e não sobre os bytes
 * UTF-8): não precisa de `TextEncoder` e dá o mesmo resultado no Node e em
 * qualquer navegador, porque só usa `charCodeAt` e `Math.imul`. Não é uma
 * função criptográfica nem precisa de o ser — serve para dizer «é o mesmo HTML»,
 * e uma colisão custaria apenas uma adoção indevida de uma página igual à vista.
 */

/** FNV-1a (32 bits) de `text`, em hexadecimal com 8 dígitos. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
