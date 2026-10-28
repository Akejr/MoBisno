#!/usr/bin/env node
/**
 * Versão leve da arte de partilha (`og:image` das páginas da plataforma).
 *
 * ## Porquê
 *
 * A arte original é um PNG de ~1,4 MB. O WhatsApp desiste de pré-visualizar
 * imagens acima de poucas centenas de kB: o cartão sai sem imagem, que é
 * precisamente o defeito que a arte vinha corrigir. Esta conversão dá um JPEG de
 * 1200×1200 com poucas centenas de kB — o 1200 é o lado que o Facebook e o
 * WhatsApp pedem.
 *
 * O original **fica** no repositório, em `src/images/`, que é onde vivem as
 * fontes de desenho e **não** é servido: um PNG de 1,4 MB em `web/public/` ia
 * para produção sem nada o pedir.
 *
 * ## Uso
 *
 *   node scripts/share-image.mjs
 *
 * Refazer sempre que a arte mudar: muda-se o `SRC` (ou escreve-se por cima do
 * ficheiro) e corre-se isto.
 *
 * **A arte tem de ser quadrada.** O desenho é esticado para 1200×1200, por isso
 * uma origem 4:5 — o formato de uma publicação de Instagram — sairia deformada.
 * Quadrada também não é recortada pelo cartão do WhatsApp. `tests/shareImage.test.ts`
 * verifica as duas coisas: que a origem é quadrada e que o JPEG gerado tem as
 * medidas que `src/services/seo.ts` e o espelho `api/_seo.js` declaram.
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

const SRC = "src/images/Mobisno3.png";
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
