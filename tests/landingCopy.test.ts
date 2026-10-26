/**
 * A página inicial, desenhada **de verdade** — e verificada no que ela promete.
 *
 * ## Porque é que este teste existe
 *
 * A landing é a única página que fala a quem ainda não é cliente, e é a página
 * onde é mais fácil mentir sem querer. Já aconteceu: anunciou «11.000 Kz por
 * mês» e «domínio próprio incluído» meses depois de nenhum dos dois ser verdade,
 * porque os valores estavam escritos à mão no texto em vez de virem dos módulos
 * de domínio. O assistente repetiu a mesma coisa (ver `web/lib/assistantContext.ts`).
 *
 * Por isso as asserções aqui não são sobre estética — são sobre honestidade e
 * sobre as invariantes que fazem a página funcionar:
 *
 *  - os números (preço, período, comissão, zonas de entrega) vêm das constantes;
 *  - nada que esteja «Em breve» é apresentado como incluído;
 *  - não há contacto inventado: nem `wa.me`, nem Instagram, nem telefones;
 *  - as perguntas que o `FAQPage` declara estão **visíveis** na página (é a
 *    condição que o Google impõe), incluindo as do espelho de `api/_seo.js`;
 *  - as secções que o cabeçalho e o rodapé oferecem existem mesmo no HTML;
 *  - o HTML é determinista, senão a SPA deixa de adotar o do servidor e a página
 *    volta a piscar (`web/lib/dom.ts`).
 *
 * ## Como o módulo entra no teste
 *
 * `landingHtml.ts` é puro, mas arrasta `web/lib/dom.ts` e com ele
 * `web/lib/routing.ts`, que lê `location` ao ser carregado. Daí o `location`
 * mínimo antes de qualquer import, e os especificadores em **constantes**: com
 * eles literais, o `tsc` segue-os e compila módulos que leem `document` dentro de
 * um programa sem DOM. É o padrão de `tests/ssrRender.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAN_PRICE_KZ, PLAN_HIGHLIGHTS } from "../src/services/plans.js";
import { PLATFORM_FEE_LABEL, platformFee, netForOwner, feeForMethod } from "../src/services/fees.js";
import { comingSoonList } from "../src/services/comingSoon.js";
import { LUANDA_AREAS } from "../src/services/delivery.js";
import { platformFaq, kzWhole } from "../src/services/seo.js";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** O texto-fonte da página: é nele que se procuram números escritos à mão. */
const FONTE_HTML = read("web/views/landingHtml.ts");
const FONTE_VISTA = read("web/views/landing.ts");
const FONTE_CROMO = read("web/templates/platformChrome.ts");
const SEO_API = read("api/_seo.js");

const HOST = "www.mobisno.store";

/** Especificadores em constante — ver o comentário do topo. */
const ESP_LANDING = "../web/views/landingHtml.js";
const ESP_CROMO = "../web/templates/platformChrome.js";

let html = "";
let secoes: readonly { id: string; label: string }[] = [];
let landingHtml: () => string;

beforeAll(async () => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) {
    g.location = {
      protocol: "https:", host: HOST, hostname: HOST, port: "", origin: `https://${HOST}`,
      pathname: "/", search: "", hash: "", href: `https://${HOST}/`,
    };
  }
  const mod = (await import(ESP_LANDING)) as { landingHtml(): string };
  const cromo = (await import(ESP_CROMO)) as { HOME_SECTIONS: readonly { id: string; label: string }[] };
  landingHtml = mod.landingHtml;
  html = landingHtml();
  secoes = cromo.HOME_SECTIONS;
});

/** Texto visível, sem marcação — para procurar o que o visitante de facto lê. */
function visivel(src: string): string {
  return src.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/** Todas as ocorrências de `agulha` em `palheiro`. */
function indices(palheiro: string, agulha: string): number[] {
  const out: number[] = [];
  for (let i = palheiro.indexOf(agulha); i !== -1; i = palheiro.indexOf(agulha, i + 1)) out.push(i);
  return out;
}

describe("Página inicial — hierarquia e acessibilidade", () => {
  it("há exactamente um h1", () => {
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
  });

  it("os níveis de título não saltam degraus", () => {
    const niveis = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    expect(niveis.length).toBeGreaterThan(5);
    expect(niveis[0], "a página tem de abrir no h1").toBe(1);
    niveis.forEach((n, i) => {
      if (i === 0) return;
      expect(n - niveis[i - 1]!, `salto de h${niveis[i - 1]} para h${n}`).toBeLessThanOrEqual(1);
    });
  });

  it("toda a imagem declara alt (vazio quando é decorativa)", () => {
    for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
      expect(img, `imagem sem alt: ${img.slice(0, 90)}`).toMatch(/\salt="/);
    }
  });

  it("nenhum botão ou ligação fica só com um ícone sem nome acessível", () => {
    // Os ícones são ligaduras (`<span>arrow_forward</span>`): um controlo só com
    // um deles é anunciado como «arrow forward», ou como nada.
    const controlos = [...html.matchAll(/<(a|button)\b([^>]*)>((?:(?!<\/\1>).)*)<\/\1>/gs)];
    expect(controlos.length).toBeGreaterThan(5);
    for (const [, , attrs, interior] of controlos) {
      const semIcones = (interior ?? "").replace(/<span[^>]*material-symbols-outlined[^>]*>.*?<\/span>/gs, "");
      const texto = visivel(semIcones).trim();
      if (texto) continue;
      expect(attrs, `controlo só com ícone e sem aria-label: ${(interior ?? "").slice(0, 80)}`)
        .toMatch(/aria-label="/);
    }
  });

  it("todo o ícone tem a caixa travada a 1em, para a página não saltar", () => {
    // Os ícones são ligaduras: o elemento contém a palavra
    // `remove_circle_outline`, e enquanto a fonte não chega o navegador reserva
    // o espaço dessa palavra. Numa lista com um ícone por linha, o texto
    // aparecia 200 px à direita e saltava para o lugar quando a fonte carregava.
    // `mb-ico` (`web/lib/glowCards.ts`) corta a palavra e reserva só 1em.
    const spans = html.match(/class="material-symbols-outlined[^"]*"/g) ?? [];
    expect(spans.length).toBeGreaterThan(5);
    for (const s of spans) expect(s, `ícone sem mb-ico: ${s}`).toContain("mb-ico");
    // A folha vai no HTML servido, não só no JavaScript — e com as três
    // propriedades que importam: largura de um glifo, sem encolher (senão o
    // círculo sai cortado nas linhas que partem em duas) e a palavra cortada.
    const regra = /\.mb-ico\{([^}]*)\}/.exec(html)?.[1] ?? "";
    expect(regra, "a regra .mb-ico não vai no HTML").not.toBe("");
    for (const prop of ["width:1em", "flex-shrink:0", "overflow:hidden"]) {
      expect(regra, `.mb-ico sem ${prop}`).toContain(prop);
    }
  });

  it("todo o ícone é escondido dos leitores de ecrã", () => {
    for (const span of html.match(/<span[^>]*material-symbols-outlined[^>]*>/g) ?? []) {
      expect(span, `ícone sem aria-hidden: ${span}`).toContain('aria-hidden="true"');
    }
  });

  it("o texto pequeno em laranja usa o tom escuro, não o laranja dos botões", () => {
    // `#F95901` sobre branco não chega a 4,5:1 para 12–14 px. O tom escuro
    // (`#C2410C`) é o mesmo que o Dashboard usa.
    expect(FONTE_HTML).toContain("#C2410C");
    expect(FONTE_HTML).not.toMatch(/text-\[#F95901\]/);
  });
});

describe("Página inicial — nenhum número escrito à mão", () => {
  it("o preço sai de PLAN_PRICE_KZ e não aparece escrito no código", () => {
    expect(html).toContain(kzWhole(PLAN_PRICE_KZ));
    for (const fonte of [FONTE_HTML, FONTE_VISTA, FONTE_CROMO]) {
      expect(fonte, "preço do plano escrito à mão").not.toMatch(/\b10[.\s]?000\b/);
    }
  });

  it("a comissão sai de PLATFORM_FEE_LABEL e não aparece escrita no código", () => {
    expect(html).toContain(PLATFORM_FEE_LABEL);
    for (const fonte of [FONTE_HTML, FONTE_VISTA, FONTE_CROMO]) {
      expect(fonte, "comissão escrita à mão").not.toMatch(/\b5\s?%/);
    }
  });

  it("as zonas de entrega são contadas a partir da lista canónica", () => {
    expect(html).toContain(`${LUANDA_AREAS.length} zonas`);
  });

  it("não há promessas de quantidades de lojas, clientes ou vendas", () => {
    // «Mais de 500 lojas» e afins: não existe número desses para mostrar.
    const texto = visivel(html);
    expect(texto).not.toMatch(/mais de \d/i);
    expect(texto).not.toMatch(/\+\s?\d{3,}/);
    expect(texto).not.toMatch(/\d+\s*(?:mil|milhões)\s+(?:lojas|clientes|vendas|utilizadores)/i);
  });

  it("nada sai como undefined, NaN ou objeto", () => {
    for (const lixo of ["undefined", "NaN", "[object Object]"]) {
      expect(html, `a página contém «${lixo}»`).not.toContain(lixo);
    }
  });
});

describe("Página inicial — o que está «Em breve» nunca é prometido", () => {
  it("cada funcionalidade por ligar aparece sempre junto de «em breve»", () => {
    const breve = comingSoonList();
    expect(breve.length).toBeGreaterThan(0);
    for (const label of breve) {
      const onde = indices(html, label);
      for (const i of onde) {
        const volta = html.slice(Math.max(0, i - 700), i + 700);
        expect(volta.toLowerCase(), `«${label}» aparece sem a marca «em breve»`).toContain("em breve");
      }
    }
  });

  it("o que a subscrição inclui não menciona nada que esteja «Em breve»", () => {
    const incluido = PLAN_HIGHLIGHTS.join(" ").toLowerCase();
    for (const label of comingSoonList()) {
      expect(incluido, `«${label}» anunciado como incluído`).not.toContain(label.toLowerCase());
    }
  });

  it("os pagamentos digitais aparecem sempre com a condição de aprovação", () => {
    // Nunca «aceite Multicaixa Express» a seco: exige empresa registada e
    // aprovação dos documentos pela MôBisno.
    const texto = visivel(html);
    expect(texto).toContain("empresas registadas");
    expect(texto).toMatch(/Matrícula e a Certidão/);
    expect(texto).toContain("Multicaixa Express");
  });
});

describe("Página inicial — nenhum contacto inventado", () => {
  it("não há WhatsApp, Instagram, Facebook nem telefones a apontar para ninguém", () => {
    // **Nomear** o WhatsApp e o Instagram é o assunto da página; o que não pode
    // existir é uma ligação para um deles. O `wa.me/244900000000` e o
    // `href="#"` do Instagram estiveram no rodapé: um número que não é de
    // ninguém e uma ligação para lado nenhum.
    for (const padrao of [/wa\.me/i, /instagram\.com/i, /facebook\.com/i, /twitter\.com/i, /tel:/i, /api\.whatsapp/i]) {
      expect(html, `contacto inventado: ${padrao}`).not.toMatch(padrao);
    }
    // Um número angolano (9 dígitos a começar em 9) ou um indicativo do país.
    expect(html).not.toMatch(/\+\s?244/);
    expect(html).not.toMatch(/\b9\d{8}\b/);
  });

  it("não há ligações mortas (href vazio ou a cardinal)", () => {
    for (const href of [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? "")) {
      expect(href.trim(), "ligação sem destino").not.toBe("");
      expect(href.trim(), "ligação para lado nenhum").not.toBe("#");
    }
  });

  it("não há urgência fabricada", () => {
    const texto = visivel(html).toLowerCase();
    for (const frase of ["só hoje", "últimas vagas", "oferta limitada", "últimos dias"]) {
      expect(texto, `urgência fabricada: ${frase}`).not.toContain(frase);
    }
  });
});

describe("Página inicial — a FAQ visível é a que o Google lê", () => {
  it("todas as perguntas de platformFaq estão na página", () => {
    const faq = platformFaq();
    expect(faq.length).toBeGreaterThan(4);
    for (const f of faq) {
      expect(html, `pergunta ausente da página: ${f.question}`).toContain(f.question);
      expect(html, `resposta ausente da página: ${f.question}`).toContain(f.answer.slice(0, 40));
    }
  });

  it("o texto das perguntas não depende do estado do fornecedor de pagamentos", () => {
    // `landingHtml()` desenha com o estado real; o `FAQPage` do servidor é
    // gerado com o estado do pedido. Se o título mudasse com ele, o Google
    // receberia uma pergunta que não está na página.
    const comPronto = platformFaq(true).map((f) => f.question);
    const semPronto = platformFaq(false).map((f) => f.question);
    expect(semPronto).toEqual(comPronto);
    for (const q of semPronto) expect(html).toContain(q);
  });

  it("toda a pergunta do espelho do servidor está visível na página", () => {
    // `api/prerender.js` monta o `FAQPage` com o `platformFaq` de `api/_seo.js`.
    // A invariante é de inclusão: a lista visível pode ser maior, mas o espelho
    // não pode declarar nada que não esteja na página.
    const inicio = SEO_API.indexOf("export function platformFaq(");
    expect(inicio, "platformFaq não encontrada em api/_seo.js").toBeGreaterThan(0);
    const fn = SEO_API.slice(inicio, SEO_API.indexOf("\n}", inicio));
    const perguntas = [...fn.matchAll(/question:\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(perguntas.length).toBeGreaterThan(2);
    for (const q of perguntas) {
      expect(html, `o FAQPage declara uma pergunta que a página não mostra: ${q}`).toContain(q);
    }
  });

  it("as objeções de quem já vende nas redes têm resposta", () => {
    const perguntas = platformFaq().map((f) => f.question).join(" | ").toLowerCase();
    expect(perguntas).toContain("programar");
    expect(perguntas).toContain("instagram");
    expect(perguntas).toContain("empresa registada");
    expect(perguntas).toContain("domínio");
  });
});

describe("Página inicial — as secções do cromo existem", () => {
  it("cada id de HOME_SECTIONS está no HTML", () => {
    expect(secoes.length).toBeGreaterThan(0);
    for (const s of secoes) {
      expect(html, `secção ausente da página: ${s.id}`).toContain(`id="${s.id}"`);
    }
  });

  it("cada data-goto do cabeçalho e do rodapé aponta para uma secção que existe", () => {
    const destinos = [...html.matchAll(/data-goto="([^"]+)"/g)].map((m) => m[1]!);
    expect(destinos.length).toBeGreaterThan(0);
    for (const id of new Set(destinos)) {
      expect(html, `data-goto sem destino: ${id}`).toContain(`id="${id}"`);
    }
  });

  it("o topo tem o acordeão de imagens, já aberto num cartão, e nada a flutuar", async () => {
    // Pedido explícito: a arte ao lado do texto volta a ser o acordeão, e o selo
    // «Já vende por WhatsApp?» saiu.
    const topo = html.slice(html.indexOf("<main"), html.indexOf('id="como-funciona"'));
    const mod = (await import(ESP_LANDING)) as { ACCORDION_ITEMS: readonly { title: string }[]; ACC_OPEN_WIDTH: string };
    expect(topo).toContain('id="accordion"');
    expect(topo.match(/data-acc /g) ?? []).toHaveLength(mod.ACCORDION_ITEMS.length);
    for (const item of mod.ACCORDION_ITEMS) expect(topo).toContain(item.title);
    // O HTML já sai com um cartão aberto: abri-lo só quando a vista arranca era um salto.
    expect(topo.split(`width:${mod.ACC_OPEN_WIDTH}`).length - 1).toBe(1);
    expect(topo).not.toContain("Já vende por WhatsApp?");
    expect(FONTE_VISTA).toContain("mountAccordion(");
  });

  it("a prova aponta para o que existe: o diretório e os modelos", () => {
    expect(html).toContain('href="/lojas"');
    expect(html).toContain('href="/modelos"');
  });
});

describe("Página inicial — determinista, como a adoção do HTML exige", () => {
  it("desenhar duas vezes dá exactamente o mesmo HTML", () => {
    // Uma data ou um número aleatório fariam a impressão digital mudar a cada
    // pedido: a SPA deixava de adotar o HTML do servidor e a página voltava a
    // piscar (`web/lib/dom.ts`).
    expect(landingHtml()).toBe(html);
  });

  it("o construtor não lê a hora, o acaso, o DOM nem a sessão", () => {
    const corpo = FONTE_HTML.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const padrao of [/\bnew Date\b/, /Date\.now\b/, /Math\.random\b/, /\bdocument\b/, /\bwindow\b/, /localStorage/, /sessionStorage/]) {
      expect(corpo, `o HTML puro usa ${padrao}`).not.toMatch(padrao);
    }
  });

  it("a folha dos cartões vai no HTML, não só no JavaScript", () => {
    // Sem ela, o primeiro ecrã servido pelo servidor mostrava a grelha como uma
    // lista empilhada até a SPA arrancar.
    expect(html).toContain('<style id="mb-bento-style">');
    expect(html).toContain(".mb-bento{display:grid");
  });
});

/* ======================== Limpa, curta e com movimento ======================== */

/** O HTML sem `<style>` nem `<script>`: o que sobra é marcação e texto. */
function semFolhas(src: string): string {
  return src.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ");
}

/** A folha da página inicial, tal como sai no HTML. */
function folhaDaPagina(): string {
  const m = /<style id="mb-landing-style">([\s\S]*?)<\/style>/.exec(html);
  expect(m, "a folha da página inicial não vai no HTML").not.toBeNull();
  return m?.[1] ?? "";
}

describe("Página inicial — o texto é curto e sem travessões", () => {
  it("não há um único travessão no que o visitante lê", () => {
    // Pedido explícito: partem a frase a meio e dão o tom de texto gerado. A
    // mensagem de exemplo é composta sem Combinação precisamente por isso
    // (`buildCartWhatsAppMessage` escreve-a depois de um travessão).
    const texto = visivel(semFolhas(html));
    const onde = texto.indexOf("\u2014");
    expect(onde, `travessão em: «${texto.slice(Math.max(0, onde - 60), onde + 60)}»`).toBe(-1);
  });

  it("a página continua curta", () => {
    // «Clean, de fácil entendimento, sem muita informação.» Conta as palavras
    // à vista dentro de <main>, sem as respostas da FAQ (fechadas num acordeão)
    // e sem a mensagem de exemplo. O limite deixa margem para afinar o texto,
    // não para voltar a encher a página: subir este número é uma decisão.
    // A maquete do telemóvel também fica de fora: é um desenho da loja (está em
    // aria-hidden), não texto para ler.
    const main = semFolhas(html.slice(html.indexOf("<main"), html.indexOf("</main>")))
      .replace(/<div aria-hidden="true">[\s\S]*?<\/figure>/g, " ")
      .replace(/<p class="mb-answer[^"]*">[\s\S]*?<\/p>/g, " ")
      .replace(/<p data-after[^>]*>[\s\S]*?<\/p>/g, " ");
    const palavras = visivel(main).split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ0-9]/.test(w));
    expect(palavras.length).toBeGreaterThan(150);
    expect(palavras.length, "a página voltou a encher-se de texto").toBeLessThan(520);
  });

  it("cada secção tem um título de uma linha ou duas, e não um parágrafo", () => {
    const titulos = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => visivel(m[1] ?? "").trim());
    expect(titulos.length).toBeGreaterThanOrEqual(5);
    for (const t of titulos) {
      expect(t.split(/\s+/).length, `título comprido: ${t}`).toBeLessThanOrEqual(8);
    }
  });
});

describe("Página inicial — o movimento nunca esconde nada sem JavaScript", () => {
  it("o servidor não envia nenhum bloco preparado nem a meio de entrar", () => {
    // `mb-armed` e `mb-in` são postas só por `web/lib/landingMotion.ts`.
    expect(html).not.toMatch(/class="[^"]*\bmb-armed\b/);
    expect(html).not.toMatch(/class="[^"]*\bmb-in\b/);
    expect(html).toContain("data-motion");
  });

  it("toda a regra que esconde exige mb-armed, e vive dentro de «sem preferência de movimento»", () => {
    const css = folhaDaPagina();
    // As animações de entrada partem de opacity:0 dentro de @keyframes: isso é
    // movimento, não estado. Fora delas, só se esconde o que foi preparado.
    const semKeyframes = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    const abertura = "@media (prefers-reduced-motion:no-preference){";
    const corte = semKeyframes.indexOf(abertura);
    expect(corte, "os movimentos não estão dentro de prefers-reduced-motion").toBeGreaterThan(-1);
    const sempre = semKeyframes.slice(0, corte);
    const comMovimento = semKeyframes.slice(corte + abertura.length);

    const esconde = /opacity:0(?![.\d])|scaleX\(0\)/;
    for (const [, seletor, corpo] of sempre.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      expect(esconde.test(corpo ?? ""), `esconde fora do bloco de movimento: ${seletor}`).toBe(false);
    }
    let regrasQueEscondem = 0;
    for (const [, seletor, corpo] of comMovimento.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!esconde.test(corpo ?? "")) continue;
      regrasQueEscondem += 1;
      expect(seletor, `esconde sem exigir mb-armed: ${seletor}`).toContain(".mb-armed");
    }
    expect(regrasQueEscondem, "nenhuma regra prepara a entrada: a guarda deixou de guardar algo").toBeGreaterThan(0);
  });

  it("só o marcador da FAQ começa escondido", () => {
    const css = folhaDaPagina();
    const escondidos = [...css.matchAll(/([^{}]+)\{[^{}]*display:none[^{}]*\}/g)].map((m) => (m[1] ?? "").trim());
    expect(escondidos).toEqual(["summary::-webkit-details-marker"]);
  });

  it("o módulo do movimento usa as classes do CSS, salta o que está à vista e respeita quem pediu menos", () => {
    const fonte = read("web/lib/landingMotion.ts");
    expect(fonte).toContain('ARMED = "mb-armed"');
    expect(fonte).toContain('IN = "mb-in"');
    expect(fonte).toContain("prefers-reduced-motion: reduce");
    expect(fonte).toContain('typeof IntersectionObserver !== "function"');
    // Um bloco já à vista quando a página arranca fica como o servidor o
    // desenhou: escondê-lo para o voltar a mostrar era um piscar.
    expect(fonte).toContain("getBoundingClientRect");
    // A contagem acaba sempre no texto que o servidor escreveu.
    expect(fonte).toContain("t >= 1 ? final");
    expect(FONTE_VISTA).toContain("mountLandingMotion(");
  });

  it("cada número que conta já sai escrito com o valor final", () => {
    const contadores = [...html.matchAll(/<span data-count="([^"]+)" data-count-format="(pct|kz)"[^>]*>([^<]*)<\/span>/g)];
    expect(contadores.length).toBeGreaterThan(0);
    for (const [, alvo, formato, texto] of contadores) {
      const esperado = formato === "kz" ? kzWhole(Number(alvo)) : `${Number(alvo)}%`;
      expect(texto, `o contador ${alvo} não sai com o valor final`).toBe(esperado);
    }
  });
});

describe("Página inicial — o exemplo da comissão é feito pelas funções da comissão", () => {
  it("venda, comissão e o que fica para levantar saem de platformFee e netForOwner", async () => {
    const mod = (await import(ESP_LANDING)) as { DEMO_SALE_KZ: number };
    const venda = mod.DEMO_SALE_KZ;
    expect(venda).toBeGreaterThan(0);
    expect(html).toContain(kzWhole(venda));
    expect(html).toContain(`-${kzWhole(platformFee(venda))}`);
    expect(html).toContain(kzWhole(netForOwner(venda)));
    // E nenhum dos resultados está escrito no código, em nenhuma das formas em
    // que um número se escreve (1000, 1_000, 1.000).
    const codigo = FONTE_HTML.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const valor of [platformFee(venda), netForOwner(venda)]) {
      const digitos = String(Math.round(valor));
      for (const forma of [digitos, digitos.replace(/\B(?=(\d{3})+(?!\d))/g, "_"), digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".")]) {
        expect(codigo, `o valor ${valor} está escrito à mão (${forma})`).not.toMatch(new RegExp(`(?<![\\w.])${forma.replace(/\./g, "\\.")}(?![\\w.])`));
      }
    }
  });

  it("o WhatsApp mostra a comissão que o domínio lhe dá: nenhuma", () => {
    expect(feeForMethod("whatsapp", 100)).toBe(0);
    expect(visivel(html)).toMatch(/\b0% de comissão/);
  });
});

describe("Página inicial — o assistente conhece as secções que a página tem", () => {
  it("cada título da página está na orientação do ecrã «site»", () => {
    // Regra `.kiro/steering/assistente.md`: ao mudar um ecrã, a orientação muda
    // na mesma alteração. É por estes títulos que o visitante pergunta.
    const fonte = read("web/lib/assistantContext.ts");
    const inicio = fonte.indexOf("site: `ECRÃ");
    expect(inicio, "orientação do ecrã site não encontrada").toBeGreaterThan(-1);
    const guia = fonte.slice(inicio, fonte.indexOf("`,", inicio));
    const titulos = [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => visivel(m[1] ?? "").replace(/\s+/g, " ").trim());
    expect(titulos.length).toBeGreaterThanOrEqual(6);
    for (const t of titulos) expect(guia, `título ausente da orientação: ${t}`).toContain(t);
  });
});
