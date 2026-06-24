/**
 * Shim de `node:crypto` para o browser (apenas para a pré-visualização web).
 *
 * O código de domínio importa `node:crypto` para gerar ids/tokens e (por
 * omissão) fazer hashing de palavras-passe. No browser esse módulo não existe,
 * por isso o Vite faz alias deste ficheiro (ver vite.config.ts).
 *
 * - `randomUUID`/`randomBytes` usam a Web Crypto API (real).
 * - `scryptSync`/`timingSafeEqual` são substitutos simples: NÃO são usados em
 *   produção. Na composição web injetamos um `passwordHasher` próprio, pelo que
 *   estas funções existem apenas para satisfazer os imports. Demo-only.
 */

const webCrypto: Crypto = globalThis.crypto;

/** Gera um UUID v4 usando a Web Crypto API. */
export function randomUUID(): string {
  return webCrypto.randomUUID();
}

/** Pequeno wrapper sobre Uint8Array com `toString("hex")`, como o Buffer do Node. */
class HexBytes extends Uint8Array {
  toString(encoding?: string): string {
    if (encoding === "hex") {
      let out = "";
      for (const byte of this) out += byte.toString(16).padStart(2, "0");
      return out;
    }
    return super.toString();
  }
}

/** Devolve `size` bytes aleatórios (Web Crypto). */
export function randomBytes(size: number): HexBytes {
  const bytes = new HexBytes(size);
  webCrypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Substituto síncrono de scrypt (demo-only). Hash determinístico simples;
 * não é criptograficamente seguro. Na web injetamos outro hasher, por isso
 * isto raramente (ou nunca) é chamado.
 */
export function scryptSync(password: string, salt: unknown, keylen: number): HexBytes {
  const seed = `${password}:${String(salt)}`;
  const out = new HexBytes(keylen);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = 0; i < keylen; i++) {
    h = (h ^ (i + 0x9e3779b9)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    out[i] = h & 0xff;
  }
  return out;
}

/** Comparação simples de igualdade byte-a-byte (demo-only). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default { randomUUID, randomBytes, scryptSync, timingSafeEqual };
