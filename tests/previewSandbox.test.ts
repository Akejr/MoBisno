/**
 * Pré-visualizações em `iframe` sem scripts, e cores do Dono que não saem do CSS.
 *
 * ## O risco
 *
 * Um `iframe` com `srcdoc` tem a **origem da página que o cria** — a da
 * plataforma, com a sessão do Supabase. E o que lá se desenha é conteúdo de um
 * Dono qualquer: o diretório `/lojas` mostra as lojas de toda a gente, e o
 * Administrador abre o editor das lojas dos outros. Sem `sandbox`, um `<script>`
 * que chegasse ao HTML de uma loja corria com a sessão de quem está a ver.
 *
 * O caminho mais curto até lá era uma cor: `colors.primary` entrava em CSS sem
 * validação, e uma «cor» `red;}</style><script>…` fechava o `<style>` e passava
 * a ser HTML. `esc()` não chegava — impede que se saia de um atributo, não que
 * se escreva CSS lá dentro.
 *
 * ## As guardas
 *
 * 1. Todo o `srcdoc` de `web/` passa por `loadPreviewDoc`, que põe `sandbox`
 *    **sem** `allow-scripts` antes de escrever o documento; `allow-scripts` não
 *    aparece em lado nenhum (junto com `allow-same-origin` o documento podia
 *    tirar a si próprio o `sandbox`).
 * 2. Nenhuma pré-visualização depende de scripts: nada de Tailwind de CDN, nada
 *    de `<script>` no documento.
 * 3. `safeCssColor` só deixa passar cores; e as cores do Dono passam por ele
 *    antes de entrarem em CSS (pré-visualizações, cores por campo, fundos).
 */
import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { safeCssColor } from "../src/services/storeCustom.js";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/** Todos os `.ts` de `web/` (sem `dist/`), com o caminho relativo. */
function fontesWeb(dir = "web"): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "dist" || e.name === "node_modules" ? [] : fontesWeb(rel);
    return e.name.endsWith(".ts") ? [rel] : [];
  });
}

/** O ficheiro sem comentários: as asserções são sobre o que corre. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const PREVIEW_DOC = ler("web/lib/storePreviewDoc.ts");

describe("safeCssColor — só cores entram em CSS", () => {
  it("aceita #hex de 3, 4, 6 e 8 dígitos", () => {
    for (const cor of ["#fff", "#FFFA", "#1c1b1b", "#0058BE80"]) expect(safeCssColor(cor, "x")).toBe(cor);
  });

  it("aceita rgb()/rgba()/hsl()/hsla() com argumentos numéricos, nas duas sintaxes", () => {
    for (const cor of [
      "rgb(255, 0, 0)", "rgba(0,0,0,.5)", "rgb(255 0 0)", "rgb(255 0 0 / 50%)",
      "hsl(210, 50%, 40%)", "hsla(210deg 50% 40% / 0.8)", "RGB(1,2,3)",
    ]) {
      expect(safeCssColor(cor, "x"), cor).toBe(cor);
    }
  });

  it("aceita os nomes de cor do CSS, em qualquer caixa, e transparent", () => {
    for (const cor of ["red", "RebeccaPurple", "white", "transparent", "lightgoldenrodyellow"]) {
      expect(safeCssColor(cor, "x"), cor).toBe(cor);
    }
  });

  it("tira os espaços das pontas", () => {
    expect(safeCssColor("  #fff  ", "x")).toBe("#fff");
  });

  it("recusa o que sai do CSS, chama a rede ou não é cor", () => {
    for (const mau of [
      "red;}</style><script>alert(1)</script>",
      "url(https://exemplo.ao/x.png)",
      "url(x)",
      "#fff;background:url(x)",
      "red;position:fixed;inset:0",
      "var(--brand)",
      "rgb(var(--x))",
      "rgb(1,2)",
      "rgb(1,2,3,4,5)",
      "calc(1px)",
      "expression(alert(1))",
      "#ggg",
      "#fffff",
      "currentcolor",
      "inherit",
      "javascript:alert(1)",
      "</style>",
      "",
      "   ",
    ]) {
      expect(safeCssColor(mau, "FALLBACK"), mau).toBe("FALLBACK");
    }
  });

  it("recusa o que não é texto, sem lançar", () => {
    for (const mau of [undefined, null, 12, true, {}, [], ["#fff"], { toString: () => "#fff" }]) {
      expect(safeCssColor(mau, "FALLBACK")).toBe("FALLBACK");
    }
  });

  it("para qualquer entrada, devolve a omissão ou algo sem caracteres que fechem o CSS", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.fullUnicodeString(), fc.constantFrom("#fff", "red", "rgb(1,2,3)")), (s) => {
        const out = safeCssColor(s, "\u0000omissão");
        if (out === "\u0000omissão") return true;
        return !/[;{}<>"'\\]/.test(out) && !/url\(/i.test(out) && out === out.trim() && out.length > 0;
      }),
      { numRuns: 500 },
    );
  });
});

describe("Pré-visualizações — `sandbox` sem `allow-scripts`, sempre", () => {
  const WEB = fontesWeb().map((f) => [f, ler(f)] as const);

  it("só loadPreviewDoc escreve srcdoc", () => {
    for (const [f, src] of WEB) {
      const codigo = semComentarios(src);
      const escritas = codigo.match(/\.srcdoc\s*=/g) ?? [];
      if (f === "web/lib/storePreviewDoc.ts") {
        expect(escritas.length, f).toBe(1);
      } else {
        expect(escritas, `${f} escreve srcdoc sem passar por loadPreviewDoc`).toEqual([]);
      }
      // Nem como atributo em HTML montado à mão.
      expect(codigo, `${f}: srcdoc como atributo`).not.toMatch(/<iframe[^>]*\ssrcdoc=/i);
    }
  });

  it("loadPreviewDoc põe o sandbox antes do srcdoc", () => {
    const i = PREVIEW_DOC.indexOf("export function loadPreviewDoc(");
    expect(i).toBeGreaterThan(-1);
    const fn = PREVIEW_DOC.slice(i, PREVIEW_DOC.indexOf("\n}", i));
    const sandbox = fn.indexOf('setAttribute("sandbox"');
    const srcdoc = fn.indexOf(".srcdoc =");
    expect(sandbox, "loadPreviewDoc não põe sandbox").toBeGreaterThan(-1);
    expect(srcdoc).toBeGreaterThan(sandbox);
  });

  it("os valores de sandbox não dão scripts", () => {
    const valores = [...PREVIEW_DOC.matchAll(/export const PREVIEW_SANDBOX(?:_SAME_ORIGIN)? = "([^"]*)"/g)].map((m) => m[1]!);
    expect(valores).toEqual(["", "allow-same-origin"]);
  });

  it("nenhum ficheiro de web/ pede allow-scripts", () => {
    for (const [f, src] of WEB) {
      expect(semComentarios(src), f).not.toContain("allow-scripts");
    }
  });

  it("cada pré-visualização carrega o documento por loadPreviewDoc", () => {
    // A vitrina de lojas saiu de `web/views/directory.ts` para
    // `web/lib/storeShowcase.ts` quando a página inicial passou a mostrar as
    // mesmas lojas: é lá que vivem os `iframe` do cartão e da janela.
    for (const f of ["web/lib/storeShowcase.ts", "web/views/presetGallery.ts", "web/lib/templatePreview.ts", "web/views/editor.ts"]) {
      expect(ler(f), f).toContain("loadPreviewDoc(");
    }
  });

  it("todo o iframe escrito em HTML tem sandbox, salvo os mapas de terceiros", () => {
    /*
     * Os mapas (`blocks.ts`, `lumiere.ts`) são `iframe` com `src` para a Google
     * ou o OpenStreetMap: outra origem, que precisa dos seus scripts e não vê a
     * sessão da plataforma. Não levam `srcdoc` nem `sandbox`. Tudo o resto leva.
     */
    let mapas = 0;
    let previas = 0;
    let pagamentos = 0;
    for (const [f, src] of WEB) {
      // `<iframe` seguido de espaço: uma etiqueta de HTML, não uma expressão
      // regular que procure por ela (`/<iframe\b/`).
      for (const m of semComentarios(src).matchAll(/<iframe\s[^>]*>/gi)) {
        const tag = m[0];
        const mapa = /title="Mapa/.test(tag) && /\ssrc="\$\{esc\(/.test(tag);
        if (mapa) { mapas++; continue; }
        /*
         * A página de pagamento do fornecedor (`web/lib/payModal.ts`), pelo
         * mesmo motivo dos mapas: outra origem, que não vê a sessão da
         * plataforma e precisa dos seus scripts e formulários para cobrar. O
         * endereço passa por `httpsUrl` antes (asserção abaixo).
         */
        const pagamento = /title="Pagamento"/.test(tag) && /\ssrc="\$\{esc\(url\)\}"/.test(tag);
        if (pagamento) { pagamentos++; continue; }
        previas++;
        expect(tag, `${f}: iframe sem sandbox`).toMatch(/\ssandbox(=|\s|>)/);
        expect(tag, `${f}: iframe com allow-scripts`).not.toContain("allow-scripts");
      }
    }
    // A varredura encontrou de facto o que devia: a gaveta do editor (telemóvel
    // e computador), a pré-visualização de modelo, e os mapas.
    expect(previas).toBeGreaterThanOrEqual(3);
    expect(mapas).toBeGreaterThanOrEqual(3);
    expect(pagamentos).toBe(1);
    const MODAL = ler("web/lib/payModal.ts");
    expect(MODAL).toContain('u.protocol === "https:"');
    expect(MODAL).toContain("const url = httpsUrl(opts.url);");
    expect(semComentarios(MODAL), "a página de pagamento não pode ir em srcdoc").not.toContain("srcdoc");
  });

  it("cada iframe criado por código passa por loadPreviewDoc no mesmo ficheiro", () => {
    for (const [f, src] of WEB) {
      const codigo = semComentarios(src);
      const criados = (codigo.match(/createElement\("iframe"\)/g) ?? []).length;
      if (criados === 0) continue;
      const carregados = (codigo.match(/loadPreviewDoc\(/g) ?? []).length;
      expect(carregados, `${f}: iframe criado sem loadPreviewDoc`).toBeGreaterThanOrEqual(criados);
    }
  });

  it("nenhuma pré-visualização depende de scripts: nem Tailwind de CDN nem <script>", () => {
    const editor = ler("web/views/editor.ts");
    const iframeDoc = editor.slice(editor.indexOf("function buildIframeDoc"), editor.indexOf("/* ----------------------- Painel de pré-visualização"));
    for (const [nome, src] of [
      ["storePreviewDoc.ts", PREVIEW_DOC],
      ["templatePreview.ts", ler("web/lib/templatePreview.ts")],
      ["editor.ts › buildIframeDoc", iframeDoc],
    ] as const) {
      const codigo = semComentarios(src);
      expect(codigo, nome).not.toContain("cdn.tailwindcss.com");
      expect(codigo, nome).not.toMatch(/<script/i);
      // Os estilos são os compilados desta página.
      expect(codigo, nome).toContain("previewHeadHtml()");
    }
  });
});

describe("As cores do Dono passam por safeCssColor antes do CSS", () => {
  interface PreviewDoc { storePreviewDoc(html: string, custom: unknown): string }
  interface FieldColors { fieldColorCss(map: Record<string, string> | undefined): string }
  let P: PreviewDoc;
  let F: FieldColors;

  beforeAll(async () => {
    // `storePreviewDoc` lê os estilos de `document.head`; aqui não há nenhum.
    const g = globalThis as unknown as { location?: unknown; document?: unknown };
    if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
    if (!g.document) g.document = { head: { querySelectorAll: () => [] } };
    const espDoc = "../web/lib/storePreviewDoc.js";
    const espCores = "../web/lib/fieldColors.js";
    P = (await import(espDoc)) as PreviewDoc;
    F = (await import(espCores)) as FieldColors;
  }, 120_000);

  const ATAQUE = "red;}</style><script>alert(1)</script>";

  it("storePreviewDoc: uma «cor» maliciosa fica pela omissão e não chega ao documento", () => {
    const doc = P.storePreviewDoc("<p>loja</p>", { colors: { primary: ATAQUE, text: "url(https://x/y)" } });
    expect(doc).not.toContain("<script");
    expect(doc).not.toContain("url(");
    expect(doc).toContain("--brand:#F95901");
    expect(doc).not.toContain("--ink:");
  });

  it("storePreviewDoc: um tema que não existe não entra no atributo", () => {
    const doc = P.storePreviewDoc("<p>loja</p>", { theme: { style: 'x" onload="alert(1)' } });
    expect(doc).not.toContain("onload");
    expect(doc).not.toContain("data-theme");
  });

  it("storePreviewDoc: cores válidas passam tal e qual", () => {
    const doc = P.storePreviewDoc("<p>loja</p>", { colors: { primary: "#0058be", text: "#0b1c30" }, theme: { style: "classico" } });
    expect(doc).toContain("--brand:#0058be");
    expect(doc).toContain("--ink:#0b1c30");
    expect(doc).toContain('data-theme="classico"');
    // E as ligações clicadas lá dentro não levam a lado nenhum.
    expect(doc).toContain('<base target="_blank">');
  });

  it("fieldColorCss: nem a cor nem o caminho saem do bloco de estilo", () => {
    expect(F.fieldColorCss({ "hero.title": ATAQUE })).toBe("");
    expect(F.fieldColorCss({ 'hero.title"]{}</style><script>': "#fff" })).toBe("");
    const ok = F.fieldColorCss({ "hero.title": "#DF0B26", "blocks.0.items.1.name": "rgb(1,2,3)" });
    expect(ok).toContain('[data-edit="hero.title"]{color:#DF0B26 !important}');
    expect(ok).toContain('[data-edit="blocks.0.items.1.name"]{color:rgb(1,2,3) !important}');
  });

  it("os sítios que interpolam cores do Dono em CSS usam safeCssColor", () => {
    for (const f of ["web/lib/storePreviewDoc.ts", "web/lib/fieldColors.ts", "web/templates/blocks.ts", "web/views/editor.ts", "web/views/presetGallery.ts", "web/lib/storeShowcase.ts"]) {
      expect(ler(f), f).toContain("safeCssColor(");
    }
    // A gaveta do editor: marca, tinta e ícones entram no `style` do corpo.
    const editor = ler("web/views/editor.ts");
    const iframeDoc = editor.slice(editor.indexOf("function buildIframeDoc"), editor.indexOf("const tvars"));
    expect(iframeDoc).toContain("const brand = brandColor();");
    expect(iframeDoc).toContain('safeCssColor(custom.colors?.text, "")');
    expect(iframeDoc).toContain('safeCssColor(custom.colors?.icon, "")');
  });
});
