#!/usr/bin/env node
/**
 * Versão leve da arte de partilha (`og:image` das páginas da plataforma).
 *
 * ## Porquê
 *
 * O original `web/public/images/artmobisno1.png` tem 1254×1254 e ~1,7 MB. O
 * WhatsApp desiste de pré-visualizar imagens acima de poucas centenas de kB: o
 * cartão sai sem imagem, que é precisamente o defeito que a arte nova vinha
 * corrigir. Esta conversão dá um JPEG de 1200×1200 com poucas dezenas de kB — o
 * 1200 é o lado que o Facebook e o WhatsApp pedem, e a arte é quadrada, por isso
 * não há recorte nem distorção.
 *
 * O original **fica** no repositório: é a fonte de onde esta versão se refaz.
 *
 * ## Uso
 *
 *   node scripts/share-image.mjs
 *
 * Refazer sempre que a arte mudar. As medidas do ficheiro gerado estão fixadas
 * em `api/_seo.js` (`SHARE_IMAGE_*`) e verificadas em `tests/shareImage.test.ts`.
 *
 * ## Como funciona
 *
 * `System.Drawing`, pelo PowerShell que o Windows já tem — a mesma abordagem de
 * `scripts/preview-shot.mjs`, para não acrescentar uma dependência de imagem ao
 * projeto por causa de um ficheiro que se gera de meses a meses.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";

const SRC = "web/public/images/artmobisno1.png";
const OUT = "web/public/images/share.jpg";

/** Lado do quadrado. 1200 é a largura mínima recomendada pelo Open Graph. */
const SIZE = 1200;
/** Qualidade do JPEG. 82 mantém a arte limpa e o ficheiro bem abaixo do limite. */
const QUALITY = 82;

if (process.platform !== "win32") {
  console.error("share-image: só está implementado no Windows (System.Drawing).");
  process.exit(1);
}

const src = resolve(SRC);
const out = resolve(OUT);

const ps = [
  "Add-Type -AssemblyName System.Drawing;",
  `$src = New-Object System.Drawing.Bitmap('${src}');`,
  `$dst = New-Object System.Drawing.Bitmap ${SIZE}, ${SIZE};`,
  "$g = [System.Drawing.Graphics]::FromImage($dst);",
  "$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;",
  // A arte tem fundo preto: pintá-lo primeiro evita uma orla clara se algum dia
  // a fonte passar a ter canal alfa (o JPEG não o tem).
  "$g.Clear([System.Drawing.Color]::Black);",
  `$g.DrawImage($src, 0, 0, ${SIZE}, ${SIZE}); $g.Dispose();`,
  "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' };",
  "$par = New-Object System.Drawing.Imaging.EncoderParameters 1;",
  `$par.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ${QUALITY};`,
  `$dst.Save('${out}', $codec, $par); $src.Dispose(); $dst.Dispose();`,
].join(" ");

execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });

const kb = Math.round(statSync(out).size / 1024);
console.log(`share-image: ${SRC} -> ${OUT} (${SIZE}x${SIZE}, ${kb} kB)`);
