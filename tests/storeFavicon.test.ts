/**
 * Guardas do favicon das lojas.
 *
 * O defeito: o logótipo do dono ia direto para o `<link rel="icon">` e o
 * navegador esmagava-o num quadrado de 16×16 — o logótipo esticado que se via no
 * separador. Passa a ser desenhado num canvas quadrado, encaixado pelo lado
 * maior.
 *
 * O que estas asserções protegem é o **recurso de reserva**: o canvas falha em
 * condições normais e frequentes (o logótipo vem do Storage do Supabase, ou seja,
 * de outro domínio; sem cabeçalhos de CORS o `toDataURL()` lança). Se alguém
 * deixar de aplicar o URL cru antes de tentar o quadrado, ou tirar o `catch`, as
 * lojas ficam com a aba sem ícone nenhum — e isso não falha em nenhum teste de
 * comportamento, porque `web/` não é verificado por tipos nem carregável em
 * `node` (usa DOM). Daí serem asserções sobre o texto-fonte, como em
 * `tests/platformChrome.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const DOM = read("web/lib/dom.ts");
const MAIN = read("web/main.ts");

describe("Favicon da loja — quadrado sem distorcer", () => {
  it("o desenho usa um canvas quadrado", () => {
    expect(DOM).toContain("const FAVICON_SIZE =");
    expect(DOM).toContain("canvas.width = FAVICON_SIZE;");
    expect(DOM).toContain("canvas.height = FAVICON_SIZE;");
  });

  it("a escala é a mesma nos dois eixos (é o que mantém a proporção)", () => {
    // `Math.min` das duas escalas encaixa pelo lado maior; qualquer escala
    // calculada por eixo voltaria a esticar o logótipo.
    expect(DOM).toContain("Math.min(FAVICON_SIZE / w, FAVICON_SIZE / h)");
    expect(DOM).toMatch(/const dw = Math\.max\(1, Math\.round\(w \* escala\)\)/);
    expect(DOM).toMatch(/const dh = Math\.max\(1, Math\.round\(h \* escala\)\)/);
  });

  it("o resultado é guardado em cache por URL, incluindo as falhas", () => {
    expect(DOM).toContain("const squareFavicons = new Map<string, string | null>()");
    expect(DOM).toContain("squareFavicons.set(href, data)");
    expect(DOM).toContain("squareFavicons.get(href)");
  });
});

describe("Favicon da loja — recurso de reserva", () => {
  it("o URL cru é aplicado antes de se tentar o quadrado", () => {
    const corpo = DOM.slice(DOM.indexOf("export function setSquareFavicon"));
    const inicio = corpo.slice(0, corpo.indexOf("const emCache"));
    expect(inicio).toContain("setFavicon(href);");
  });

  it("pede CORS e trata a falha do canvas «tainted» devolvendo null", () => {
    expect(DOM).toContain('img.crossOrigin = "anonymous"');
    expect(DOM).toContain("img.onerror = () => resolve(null)");
    // O `toDataURL()` lança quando o canvas está «tainted»: sem este `catch` a
    // promessa rejeitava e a troca do ícone morria a meio.
    expect(DOM).toMatch(/return canvas\.toDataURL\("image\/png"\);\s*\}\s*catch\s*\{\s*return null;/);
  });

  it("o quadrado só é aplicado se ainda for a loja pedida", () => {
    // Navegar entre lojas com um pedido em curso trocaria o ícone pelo da loja
    // anterior.
    expect(DOM).toContain("if (data && faviconPedido === href) setFavicon(data)");
  });

  it("a plataforma e a loja sem logótipo continuam no favicon.svg", () => {
    expect(MAIN).toContain('setFavicon("/favicon.svg")');
    expect(MAIN).toContain("if (logo) setSquareFavicon(logo);");
    // O logótipo da loja nunca volta a ir direto ao `<link rel="icon">`.
    expect(MAIN).not.toContain('setFavicon(result.logo?.url || "/favicon.svg")');
  });
});
