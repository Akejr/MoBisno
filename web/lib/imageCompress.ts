/**
 * Compressão/otimização de imagens no browser, antes do upload. Redimensiona
 * para uma dimensão máxima e exporta em WebP (melhor compressão), reduzindo o
 * peso das imagens das lojas (mais rápido + menos custo de armazenamento).
 *
 * SVG e GIF são devolvidos intactos (vetor/animação). Em caso de erro, devolve
 * o ficheiro original — nunca bloqueia o upload.
 */

const MAX_DIM = 1600;
const QUALITY = 0.82;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Comprime um ficheiro de imagem. Devolve um novo `File` (ou o original). */
export async function compressImageFile(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  if (type.includes("svg") || type.includes("gif")) return file;
  if (!type.startsWith("image/")) return file;

  let url = "";
  try {
    url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, tw, th);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", QUALITY),
    );
    // Se não comprimiu ou ficou maior, mantém o original.
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
