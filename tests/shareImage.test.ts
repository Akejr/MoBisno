/**
 * Guardas da imagem de partilha nas redes sociais.
 *
 * O defeito: partilhar um endereço da MôBisno no WhatsApp mostrava o
 * `logo-header.png` — um logótipo estreito sobre branco, que o WhatsApp reduzia a
 * uma miniatura ao lado do texto. A arte quadrada resolve isso.
 *
 * Três coisas podem desfazer a correção sem nada falhar:
 *
 *  1. Alguém repõe o `logo-header.png` no `og:image` das páginas da plataforma.
 *  2. Alguém aplica a arte da plataforma às páginas de LOJA ou de PRODUTO — o
 *     mesmo defeito ao contrário: o dono partilha o seu produto e sai o nosso
 *     cartaz.
 *  3. Alguém aponta o `og:image` ao original de 1,7 MB (ou regenera a versão
 *     leve maior do que devia). O WhatsApp desiste da imagem acima de poucas
 *     centenas de kB e o cartão volta a sair sem ela — sem erro nenhum.
 *
 * As asserções são sobre o **texto-fonte**: `api/` está fora do programa do `tsc`
 * e `web/` não é verificado por tipos. É o padrão de `tests/seoInfra.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PLATFORM_SHARE_IMAGE, PLATFORM_SHARE_IMAGE_WIDTH,
  PLATFORM_SHARE_IMAGE_HEIGHT, PLATFORM_SHARE_IMAGE_TYPE,
} from "../src/services/seo.js";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const SEO_API = read("api/_seo.js");
const PRERENDER = read("api/prerender.js");
const SEO_WEB = read("web/lib/seo.ts");
const SHELL = read("web/index.html");

/** Ficheiro público correspondente a um caminho de `og:image`. */
const publicFile = (path: string): string => join(ROOT, "web/public", path.replace(/^\//, ""));

/**
 * Limite acima do qual o WhatsApp deixa de pré-visualizar a imagem. É a razão
 * pela qual a arte foi convertida; sem esta guarda, um `share.jpg` regenerado
 * com qualidade alta passava sem se notar.
 */
const LIMITE_WHATSAPP = 600 * 1024;

/**
 * Medidas de um JPEG, lidas do primeiro marcador SOF. Só o que faz falta: os
 * `og:image:width/height` declarados têm de descrever o ficheiro verdadeiro,
 * porque é por eles que o WhatsApp reserva o espaço do cartão.
 */
function jpegSize(file: string): { width: number; height: number } | null {
  const buf = readFileSync(file);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1]!;
    // SOF0..SOF3 e SOF5..SOF15 trazem as medidas; os outros segmentos salta-se
    // pelo comprimento declarado.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * Corpos das chamadas a `metaTags({…})` num ficheiro de `api/`.
 *
 * O fecho procurado é uma linha só com `});`; os objetos aninhados de JSON-LD
 * fecham com `}),` e por isso não interrompem a captura.
 */
function chamadasMetaTags(src: string): string[] {
  return [...src.matchAll(/metaTags\(\{([\s\S]*?)\n\s*\}\);/g)].map((m) => m[1]!);
}

describe("Arte de partilha — o ficheiro", () => {
  it("existe no repositório", () => {
    expect(existsSync(publicFile(PLATFORM_SHARE_IMAGE)), `falta web/public${PLATFORM_SHARE_IMAGE}`).toBe(true);
  });

  it("está abaixo do limite a partir do qual o WhatsApp desiste da imagem", () => {
    const bytes = statSync(publicFile(PLATFORM_SHARE_IMAGE)).size;
    expect(bytes, `${Math.round(bytes / 1024)} kB`).toBeLessThan(LIMITE_WHATSAPP);
  });

  it("tem as medidas que os metadados declaram", () => {
    const size = jpegSize(publicFile(PLATFORM_SHARE_IMAGE));
    expect(size).not.toBeNull();
    expect(size).toEqual({ width: PLATFORM_SHARE_IMAGE_WIDTH, height: PLATFORM_SHARE_IMAGE_HEIGHT });
    expect(PLATFORM_SHARE_IMAGE_TYPE).toBe("image/jpeg");
  });

  it("o original fica no repositório, é dele que a versão leve se refaz", () => {
    expect(existsSync(join(ROOT, "web/public/images/artmobisno1.png"))).toBe(true);
    expect(read("scripts/share-image.mjs")).toContain("artmobisno1.png");
  });

  it("nenhum metadado aponta ao original de 1,7 MB", () => {
    for (const src of [SEO_API, PRERENDER, SEO_WEB, SHELL]) {
      expect(src).not.toContain("artmobisno1.png");
    }
  });
});

describe("Arte de partilha — páginas da plataforma", () => {
  it("`api/_seo.js` espelha as constantes de `src/services/seo.ts`", () => {
    // A parede de importação (`SEO.md` §5.2) obriga à cópia; esta é a guarda que
    // impede as duas de divergirem em silêncio.
    expect(SEO_API).toContain(`export const PLATFORM_SHARE_IMAGE = "${PLATFORM_SHARE_IMAGE}";`);
    expect(SEO_API).toContain(`export const PLATFORM_SHARE_IMAGE_WIDTH = ${PLATFORM_SHARE_IMAGE_WIDTH};`);
    expect(SEO_API).toContain(`export const PLATFORM_SHARE_IMAGE_HEIGHT = ${PLATFORM_SHARE_IMAGE_HEIGHT};`);
    expect(SEO_API).toContain(`export const PLATFORM_SHARE_IMAGE_TYPE = "${PLATFORM_SHARE_IMAGE_TYPE}";`);
  });

  it("as três páginas da plataforma pré-renderizadas usam a arte", () => {
    const plataforma = chamadasMetaTags(PRERENDER).filter((c) => c.includes("platformShareImage(baseUrl)"));
    // Landing/legais, caminho privado e diretório de lojas.
    expect(plataforma).toHaveLength(3);
    expect(PRERENDER).toContain("image: `${baseUrl}${PLATFORM_SHARE_IMAGE}`");
  });

  it("nenhuma página pré-renderizada partilha o logo-header.png", () => {
    for (const corpo of chamadasMetaTags(PRERENDER)) {
      expect(corpo, corpo.slice(0, 120)).not.toContain("logo-header");
    }
    expect(SHELL).not.toMatch(/<meta property="og:image" content="[^"]*logo-header/);
    expect(SHELL).not.toMatch(/<meta name="twitter:image" content="[^"]*logo-header/);
  });

  it("os metadados declaram medidas, tipo e cartão grande", () => {
    expect(SEO_API).toContain('property="og:image:width"');
    expect(SEO_API).toContain('property="og:image:height"');
    expect(SEO_API).toContain('property="og:image:type"');
    expect(SEO_API).toContain('name="twitter:card" content="summary_large_image"');
    for (const meta of ["og:image:width", "og:image:height", "og:image:type"]) {
      expect(SHELL, meta).toContain(`property="${meta}"`);
    }
    expect(SHELL).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("a SPA usa a mesma arte por omissão", () => {
    expect(SEO_WEB).toContain("const OG_DEFAULT_IMAGE = PLATFORM_SHARE_IMAGE;");
    expect(SEO_WEB).not.toContain('"/logo-header.png"');
    // As medidas têm de ser removidas quando a página traz imagem própria: numa
    // SPA o `<head>` sobrevive à navegação.
    expect(SEO_WEB).toContain('setOrRemoveMeta("property", "og:image:width"');
    expect(SEO_WEB).toContain('setOrRemoveMeta("property", "og:image:height"');
    expect(SEO_WEB).toContain('setOrRemoveMeta("property", "og:image:type"');
  });
});

describe("Arte de partilha — lojas e produtos ficam com a imagem deles", () => {
  it("o HTML pré-renderizado de loja/produto/categoria usa o logótipo e a foto", () => {
    const loja = chamadasMetaTags(PRERENDER).filter((c) => c.includes("siteName: storeName"));
    // Início da loja, produto, categoria/todos e as páginas transacionais.
    expect(loja.length).toBeGreaterThanOrEqual(4);
    for (const corpo of loja) {
      expect(corpo, corpo.slice(0, 120)).not.toContain("platformShareImage");
      expect(corpo, corpo.slice(0, 120)).not.toContain("PLATFORM_SHARE_IMAGE");
      expect(corpo, corpo.slice(0, 120)).toMatch(/image:\s*[^\n]*(image_url|logoUrl)/);
    }
    expect(PRERENDER).toContain("image: product.image_url || logoUrl");
  });

  it("as vistas da SPA de loja/produto/categoria passam a imagem delas", () => {
    expect(read("web/views/storefront.ts")).toContain("image: logoUrl");
    expect(read("web/views/product.ts")).toContain("image: product.imageUrl");
    expect(read("web/views/category.ts")).toContain("image: items.find((p) => p.imageUrl)?.imageUrl ?? result.logo?.url ?? null");
    for (const vista of ["storefront.ts", "product.ts", "category.ts"]) {
      expect(read(`web/views/${vista}`), vista).not.toContain("share.jpg");
    }
  });
});
