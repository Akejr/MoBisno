#!/usr/bin/env node
/**
 * Fotografia estática de um site, para o diretório de lojas.
 *
 * ## Porquê
 *
 * O diretório (`/lojas`) mostra a loja **a sério** em cada cartão. Para as lojas
 * da plataforma isso é grátis: temos os dados e desenhamos o modelo num `iframe`
 * com `srcdoc`, sem pedir nada a ninguém. Para uma loja com **domínio próprio**
 * não temos os dados — e embutir o site verdadeiro custa carregar a página dele
 * inteira (JavaScript, tipos de letra, o carrossel do topo a animar) a cada
 * visita, duas vezes se a loja também aparecer no topo. Uma fotografia é um
 * pedido de ~100 kB que o navegador guarda em cache.
 *
 * ## Uso
 *
 *   node scripts/preview-shot.mjs --url https://www.dotangola.com/ \
 *                                 --out web/public/previews/dotangola.jpg
 *
 * Refazer a fotografia quando o site mudar de aspeto. O ficheiro fica no
 * repositório de propósito: é um recurso da nossa página, não uma dependência de
 * um serviço externo em tempo de execução.
 *
 * ## Como funciona
 *
 * Usa o Chrome (ou o Edge) que já está instalado, em modo sem interface. Não
 * acrescenta dependências ao projeto — um navegador sem interface como
 * dependência de desenvolvimento são centenas de MB para tirar uma fotografia de
 * vez em quando.
 *
 * O PNG que o Chrome produz ronda os 700 kB; a conversão para JPEG deixa-o em
 * ~100 kB, e é um ecrã com fotografias, onde o JPEG é o formato certo. A
 * conversão usa o que o sistema já tem: `System.Drawing` no Windows, `sips` no
 * macOS. Noutro sistema, o PNG fica e o caminho é impresso — converte-se à mão.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

/** Largura e altura da fotografia. 4:3, o mesmo formato da janela do cartão. */
const WIDTH = 1280;
const HEIGHT = 960;
/** Qualidade do JPEG. 80 é o ponto onde o texto do site ainda se lê. */
const QUALITY = 80;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Primeiro navegador instalado que sirva para isto. */
function findBrowser() {
  const candidates = process.platform === "win32"
    ? [
      `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ]
    : process.platform === "darwin"
      ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((p) => p && existsSync(p));
}

/**
 * PNG da página, com um perfil temporário próprio.
 *
 * O perfil separado não é higiene: sem ele o Chrome liga-se à sessão que já está
 * aberta, restaura os separadores anteriores e recusa-se com «Multiple targets
 * are not supported in headless mode».
 */
function capture(browser, url, pngPath) {
  const profile = join(tmpdir(), "mb-preview-shot-profile");
  execFileSync(browser, [
    "--headless=old",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${pngPath}`,
    url,
  ], { stdio: "ignore" });
  if (!existsSync(pngPath)) throw new Error("o navegador não produziu a fotografia");
}

/** Converte para JPEG com o que o sistema já tem. Devolve o caminho final. */
function toJpeg(pngPath, outPath) {
  if (process.platform === "win32") {
    const ps = [
      "Add-Type -AssemblyName System.Drawing;",
      `$src = New-Object System.Drawing.Bitmap('${pngPath}');`,
      `$dst = New-Object System.Drawing.Bitmap ${WIDTH}, ${HEIGHT};`,
      "$g = [System.Drawing.Graphics]::FromImage($dst);",
      "$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;",
      `$g.DrawImage($src, 0, 0, ${WIDTH}, ${HEIGHT}); $g.Dispose();`,
      "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' };",
      "$ps = New-Object System.Drawing.Imaging.EncoderParameters 1;",
      `$ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ${QUALITY};`,
      `$dst.Save('${outPath}', $codec, $ps); $src.Dispose(); $dst.Dispose();`,
    ].join(" ");
    execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
    return outPath;
  }
  if (process.platform === "darwin") {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(QUALITY), pngPath, "--out", outPath], { stdio: "ignore" });
    return outPath;
  }
  const fallback = outPath.replace(/\.jpe?g$/i, ".png");
  renameSync(pngPath, fallback);
  return fallback;
}

const url = arg("url");
const out = arg("out");
if (!url || !out) {
  console.error("uso: node scripts/preview-shot.mjs --url <endereço> --out <ficheiro.jpg>");
  process.exit(1);
}

const browser = findBrowser();
if (!browser) {
  console.error("preview-shot: não encontrei o Chrome nem o Edge instalados.");
  process.exit(1);
}

const outPath = resolve(out);
mkdirSync(dirname(outPath), { recursive: true });
const pngPath = join(tmpdir(), `mb-preview-${Date.now()}.png`);

try {
  capture(browser, url, pngPath);
  const finalPath = toJpeg(pngPath, outPath);
  console.log(`preview-shot: ${url} -> ${finalPath}`);
} finally {
  rmSync(pngPath, { force: true });
}
