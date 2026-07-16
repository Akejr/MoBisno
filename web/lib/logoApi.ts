/**
 * Cliente do gerador de logótipos por IA (função serverless `/api/logo`).
 *
 * Devolve DUAS variações de logótipo em PNG com fundo transparente, como
 * data URLs prontas a mostrar em <img>. Em desenvolvimento local (sem funções
 * serverless) ou em falha, devolve uma lista vazia — o chamador trata o erro.
 */

/** Gera 2 variações de logótipo a partir da descrição. data URLs (PNG). */
export async function generateLogos(description: string): Promise<string[]> {
  try {
    const res = await fetch("/api/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { images?: string[] };
    const images = Array.isArray(data.images) ? data.images : [];
    return images
      .filter((b) => typeof b === "string" && b.length > 0)
      .map((b64) => `data:image/png;base64,${b64}`);
  } catch {
    return [];
  }
}

/** Converte uma data URL base64 (PNG) em bytes para o FileService. */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
