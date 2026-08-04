/**
 * Compositor de logótipos — desenha o logótipo final em Canvas.
 *
 * PORQUÊ EXISTE: a IA de imagem escrevia o nome da marca dentro do desenho, e
 * era daí que vinham as duas queixas do Dono. Um modelo de imagem erra a
 * ortografia, muda de tipografia entre gerações e desenha letras moles — e num
 * wordmark a tipografia é o logótipo inteiro. Aqui o nome é texto a sério,
 * desenhado por nós com uma fonte curada: sempre bem escrito, sempre igual
 * entre as cinco propostas, e nítido em qualquer resolução.
 *
 * A IA fica só com o que faz bem: a forma abstrata do símbolo, que
 * `api/logo.js` devolve em PNG transparente e que aqui é apenas colocado.
 *
 * FONTES: todas as famílias usadas já são carregadas pelo `web/index.html`
 * (Manrope, Sora, Inter, Hanken Grotesk, Playfair Display, Noto Serif, Geist,
 * Bebas Neue). Nada é descarregado a mais por causa do gerador — mas o desenho
 * espera por `document.fonts.load`, senão o Canvas cai no tipo de letra de
 * recurso e sai tudo com a cara errada.
 */

/** Receita de composição de uma direção, tal como `api/logo.js` a devolve. */
export interface LogoDirection {
  slot: string;
  label: string;
  kind: "type" | "symbol";
  layout: "wordmark" | "initial" | "stacked-rule" | "two-tone" | "symbol-left" | "symbol-top";
  fontFamily: string;
  weight: number;
  /** Espacejamento entre letras, em fração do corpo (ex.: -0.03 = -3%). */
  tracking: number;
  transform: "lower" | "upper" | "title" | "any";
  color: string;
  accentColor?: string;
  /** PNG do símbolo em base64, sem prefixo. `null` nas direções tipográficas. */
  symbol: string | null;
}

/** Lado do quadrado das pré-visualizações da grelha. */
export const PREVIEW_SIZE = 512;

/**
 * Lado do quadrado do ficheiro guardado. Superior ao das pré-visualizações de
 * propósito: é o que dá ao ficheiro entregue um acabamento melhor do que o dos
 * cartões, SEM voltar a gerar nada — o desenho escolhido é exatamente o mesmo.
 * Regenerar o símbolo em qualidade alta devolveria outro símbolo, e o Dono
 * receberia um logótipo diferente daquele que escolheu.
 */
export const FINAL_SIZE = 1536;

/** Aplica a caixa pedida ao nome da marca. */
function applyCase(name: string, transform: LogoDirection["transform"]): string {
  if (transform === "upper") return name.toUpperCase();
  if (transform === "lower") return name.toLowerCase();
  if (transform === "title") {
    return name.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return name;
}

/**
 * Garante que a fonte está pronta antes de desenhar. Sem isto o primeiro
 * desenho sai na fonte de recurso do sistema — e como o Canvas não redesenha
 * sozinho quando a fonte chega, o erro fica gravado no PNG.
 */
async function ensureFont(family: string, weight: number): Promise<void> {
  try {
    await document.fonts.load(`${weight} 64px "${family}"`);
    await document.fonts.ready;
  } catch {
    /* sem API de fontes: segue com o que o browser tiver */
  }
}

/** Define o espacejamento entre letras, quando o browser o suporta. */
function setTracking(ctx: CanvasRenderingContext2D, fontSize: number, tracking: number): boolean {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof c.letterSpacing !== "string") return false;
  c.letterSpacing = `${(tracking * fontSize).toFixed(2)}px`;
  return true;
}

/**
 * Largura VISUAL de um texto com espacejamento aplicado.
 *
 * O `-gap` no fim não é um detalhe: com `letterSpacing`, o browser acrescenta o
 * vão a seguir a CADA letra, incluindo a última, e conta-o na largura medida.
 * Centrar por essa largura empurra o desenho para a esquerda — 31px de desvio
 * num quadrado de 512 na direção «espaçado», bem visível. Descontar o vão final
 * dá a largura que os olhos veem.
 */
function measureTracked(ctx: CanvasRenderingContext2D, text: string, fontSize: number, tracking: number, native: boolean): number {
  if (!text) return 0;
  const gap = tracking * fontSize;
  if (native) return ctx.measureText(text).width - gap;
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width + gap, 0) - gap;
}

/**
 * Desenha texto centrado em `cx`, devolvendo a largura visual ocupada. Alinha
 * sempre à esquerda a partir do bordo calculado, para os dois caminhos —
 * nativo e manual — centrarem exatamente da mesma maneira.
 */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  fontSize: number,
  tracking: number,
  native: boolean,
  /**
   * Texto que serve de referência para a centragem vertical. Existe para as
   * composições que partem o nome em pedaços com cores ou pesos diferentes
   * («inicial», «dois tons») os poderem assentar todos na mesma linha: sem
   * isto, cada pedaço centrava-se pelas suas próprias letras e a palavra saía
   * desalinhada consigo mesma.
   */
  refText: string = text,
): number {
  const width = measureTracked(ctx, text, fontSize, tracking, native);
  ctx.textAlign = "left";
  // Correção vertical: `textBaseline:"middle"` centra pela caixa da FONTE, que
  // reserva espaço para acentos e descidas que a palavra pode não ter. Sem
  // isto, «lumi» ficava 21px acima do centro num quadrado de 512. Centrar
  // pelas letras que estão mesmo lá desenhadas resolve.
  const yy = y + visualOffset(ctx, refText);
  if (native) {
    ctx.fillText(text, cx - width / 2, yy);
    return width;
  }
  // Sem `letterSpacing`, espaça as letras à mão — de outro modo as direções
  // «espaçado» e «empilhado» sairiam iguais às outras.
  const gap = tracking * fontSize;
  let x = cx - width / 2;
  for (const ch of [...text]) {
    ctx.fillText(ch, x, yy);
    x += ctx.measureText(ch).width + gap;
  }
  return width;
}

/**
 * Deslocamento vertical que leva o centro VISUAL das letras ao ponto pedido,
 * a partir das métricas reais do texto. Devolve 0 quando o browser não expõe
 * `actualBoundingBox*` — nesse caso vale a centragem pela caixa da fonte.
 */
/**
 * Subida e descida REAIS das letras de `text` no corpo `fontSize`. Recorre a
 * proporções típicas quando o browser não expõe `actualBoundingBox*`.
 */
function inkMetrics(ctx: CanvasRenderingContext2D, text: string, fontSize: number): { ascent: number; descent: number } {
  const mt = ctx.measureText(text);
  const sobe = mt.actualBoundingBoxAscent;
  const desce = mt.actualBoundingBoxDescent;
  if (typeof sobe !== "number" || typeof desce !== "number") {
    return { ascent: fontSize * 0.72, descent: fontSize * 0.2 };
  }
  return { ascent: sobe, descent: desce };
}

function visualOffset(ctx: CanvasRenderingContext2D, text: string): number {
  const mt = ctx.measureText(text);
  const sobe = mt.actualBoundingBoxAscent;
  const desce = mt.actualBoundingBoxDescent;
  if (typeof sobe !== "number" || typeof desce !== "number") return 0;
  return (sobe - desce) / 2;
}

/**
 * Parte o nome em duas linhas, no espaço mais próximo do meio. Devolve `null`
 * quando não há por onde partir (nome de uma só palavra).
 */
function splitTwoLines(name: string): [string, string] | null {
  const spaces: number[] = [];
  for (let i = 0; i < name.length; i++) if (name[i] === " ") spaces.push(i);
  if (!spaces.length) return null;
  const mid = name.length / 2;
  const best = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [name.slice(0, best), name.slice(best + 1)];
}

/**
 * Ajusta o corpo da letra para o texto caber na largura disponível. Marcas com
 * nomes longos ("Padaria Nossa Senhora da Paz") transbordavam do quadrado.
 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  tracking: number,
  native: boolean,
  maxWidth: number,
  startSize: number,
): number {
  let size = startSize;
  for (let i = 0; i < 24 && size > 8; i++) {
    ctx.font = `${weight} ${size}px "${family}", sans-serif`;
    if (native) setTracking(ctx, size, tracking);
    if (measureTracked(ctx, text, size, tracking, native) <= maxWidth) break;
    size = Math.floor(size * 0.92);
  }
  return size;
}

/** Entrelinha, em múltiplos do corpo da letra. */
const LINE_HEIGHT = 1.16;

/**
 * Abaixo desta fração do corpo inicial, encolher mais deixa de ser aceitável:
 * uma marca de uma linha em 5% da altura do quadrado fica perdida no vazio.
 * A partir daqui compensa mais partir o nome em duas linhas.
 *
 * O valor é deliberadamente baixo. Um wordmark em duas linhas lê-se como um
 * parágrafo, não como uma marca, por isso partir só compensa quando a linha
 * única fica mesmo pequena: «Café Açúcar» ainda cabe bem numa linha, «Padaria
 * Nossa Senhora da Paz» não.
 */
const MIN_SINGLE_LINE = 0.38;

/**
 * Escolhe entre uma e duas linhas, com o maior corpo de letra que couber.
 *
 * PORQUÊ: a primeira versão só encolhia a letra para o nome caber na largura.
 * «Padaria Nossa Senhora da Paz» saía com 25 píxeis de altura num quadrado de
 * 512 — legível, mas visualmente um logótipo perdido no meio do nada. Nomes
 * compridos são a norma no comércio angolano, não a exceção.
 */
function wrapIfTooSmall(
  ctx: CanvasRenderingContext2D,
  name: string,
  dir: LogoDirection,
  native: boolean,
  maxWidth: number,
  startSize: number,
): { lines: string[]; fontSize: number } {
  const umaLinha = fitFontSize(ctx, name, dir.fontFamily, dir.weight, dir.tracking, native, maxWidth, startSize);
  if (umaLinha >= startSize * MIN_SINGLE_LINE) return { lines: [name], fontSize: umaLinha };

  const partes = splitTwoLines(name);
  if (!partes) return { lines: [name], fontSize: umaLinha }; // uma só palavra: não há por onde partir

  // Duas linhas cabem com o corpo da linha mais larga, limitado pela altura.
  const duasLinhas = Math.min(
    fitFontSize(ctx, partes[0], dir.fontFamily, dir.weight, dir.tracking, native, maxWidth, startSize),
    fitFontSize(ctx, partes[1], dir.fontFamily, dir.weight, dir.tracking, native, maxWidth, startSize),
    Math.floor(maxWidth / (1 + LINE_HEIGHT)),
  );
  return duasLinhas > umaLinha ? { lines: partes, fontSize: duasLinhas } : { lines: [name], fontSize: umaLinha };
}

/** Carrega o PNG do símbolo (base64 sem prefixo) como imagem desenhável. */
function loadSymbol(b64: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/png;base64,${b64}`;
  });
}

/**
 * Compõe o logótipo de uma direção e devolve um PNG (data URL) com fundo
 * transparente.
 *
 * `size` é o lado do quadrado: `PREVIEW_SIZE` nos cartões, `FINAL_SIZE` no
 * ficheiro que o Dono guarda.
 */
export async function composeLogo(brandName: string, dir: LogoDirection, size: number): Promise<string> {
  await ensureFont(dir.fontFamily, dir.weight);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const name = applyCase(brandName.trim() || "Marca", dir.transform);
  const pad = size * 0.1;
  const inner = size - pad * 2;
  const native = setTracking(ctx, 64, dir.tracking);
  ctx.textBaseline = "middle";
  ctx.fillStyle = dir.color;

  const symbol = dir.symbol ? await loadSymbol(dir.symbol) : null;

  if (symbol && dir.layout === "symbol-left") {
    // Símbolo pequeno à esquerda + nome. O símbolo acompanha, não compete:
    // ocupa pouco mais de um quinto da largura útil.
    const symSize = inner * 0.22;
    const gap = inner * 0.07;
    const fontSize = fitFontSize(ctx, name, dir.fontFamily, dir.weight, dir.tracking, native, inner - symSize - gap, inner * 0.3);
    const textW = measureTracked(ctx, name, fontSize, dir.tracking, native);
    const total = symSize + gap + textW;
    const x0 = (size - total) / 2;
    ctx.drawImage(symbol, x0, size / 2 - symSize / 2, symSize, symSize);
    drawTracked(ctx, name, x0 + symSize + gap + textW / 2, size / 2, fontSize, dir.tracking, native);
    return canvas.toDataURL("image/png");
  }

  if (symbol && dir.layout === "symbol-top") {
    const symSize = inner * 0.4;
    const fontSize = fitFontSize(ctx, name, dir.fontFamily, dir.weight, dir.tracking, native, inner, inner * 0.19);
    const gap = inner * 0.09;
    const total = symSize + gap + fontSize;
    const top = (size - total) / 2;
    ctx.drawImage(symbol, size / 2 - symSize / 2, top, symSize, symSize);
    drawTracked(ctx, name, size / 2, top + symSize + gap + fontSize / 2, fontSize, dir.tracking, native);
    return canvas.toDataURL("image/png");
  }

  if (dir.layout === "initial") {
    // A inicial destacada na cor de acento, o resto do nome na cor do texto.
    const [first, ...rest] = [...name];
    const restText = rest.join("");
    const fontSize = fitFontSize(ctx, name, dir.fontFamily, dir.weight, dir.tracking, native, inner, inner * 0.32);
    ctx.font = `${dir.weight} ${fontSize}px "${dir.fontFamily}", sans-serif`;
    if (native) setTracking(ctx, fontSize, dir.tracking);
    // Larguras visuais (sem o vão que `letterSpacing` deixa depois da última
    // letra), senão as duas metades ficam desalinhadas entre si e do centro.
    const gap = native ? dir.tracking * fontSize : 0;
    const firstW = measureTracked(ctx, first ?? "", fontSize, dir.tracking, native);
    const restW = measureTracked(ctx, restText, fontSize, dir.tracking, native);
    const x0 = (size - (firstW + gap + restW)) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = dir.accentColor || dir.color;
    // Mesma correção vertical que `drawTracked` aplica ao resto do nome —
    // sem ela a inicial e o resto da palavra assentam em linhas diferentes.
    ctx.fillText(first ?? "", x0, size / 2 + visualOffset(ctx, name));
    ctx.fillStyle = dir.color;
    drawTracked(ctx, restText, x0 + firstW + gap + restW / 2, size / 2, fontSize, dir.tracking, native, name);
    return canvas.toDataURL("image/png");
  }

  if (dir.layout === "stacked-rule") {
    // Nome sobre um filete fino: composição vertical sem descritor nem moldura.
    const linhas = wrapIfTooSmall(ctx, name, dir, native, inner, inner * 0.24);
    // Alturas medidas nas LETRAS, não na caixa da fonte: o filete assenta
    // debaixo do que está mesmo desenhado, e o conjunto texto+filete é que é
    // centrado. Com a caixa da fonte, o filete ficava a flutuar longe do nome.
    const { ascent, descent } = inkMetrics(ctx, name, linhas.fontSize);
    const mancha = ascent + descent + (linhas.lines.length - 1) * LINE_HEIGHT * linhas.fontSize;
    const vaoFilete = linhas.fontSize * 0.2;
    const alturaFilete = Math.max(1, size * 0.004);
    const topo = size / 2 - (mancha + vaoFilete + alturaFilete) / 2;
    let larguraMax = 0;
    linhas.lines.forEach((linha, i) => {
      const y = topo + (ascent + descent) / 2 + i * LINE_HEIGHT * linhas.fontSize;
      larguraMax = Math.max(larguraMax, drawTracked(ctx, linha, size / 2, y, linhas.fontSize, dir.tracking, native, name));
    });
    const ruleW = Math.min(inner, larguraMax * 1.12);
    ctx.fillRect(size / 2 - ruleW / 2, topo + mancha + vaoFilete, ruleW, alturaFilete);
    return canvas.toDataURL("image/png");
  }

  if (dir.layout === "two-tone") {
    // Nome em dois pesos/tons: a primeira metade leve, a segunda destacada.
    const cut = Math.max(1, Math.ceil([...name].length / 2));
    const head = [...name].slice(0, cut).join("");
    const tail = [...name].slice(cut).join("");
    const fontSize = fitFontSize(ctx, name, dir.fontFamily, dir.weight, dir.tracking, native, inner, inner * 0.3);
    ctx.font = `${dir.weight} ${fontSize}px "${dir.fontFamily}", sans-serif`;
    if (native) setTracking(ctx, fontSize, dir.tracking);
    const headW = measureTracked(ctx, head, fontSize, dir.tracking, native);
    ctx.font = `${dir.weight + 400} ${fontSize}px "${dir.fontFamily}", sans-serif`;
    if (native) setTracking(ctx, fontSize, dir.tracking);
    const tailW = measureTracked(ctx, tail, fontSize, dir.tracking, native);
    // O vão entre as duas metades tem de entrar na conta do centro.
    const gap = native ? dir.tracking * fontSize : 0;
    const x0 = (size - (headW + gap + tailW)) / 2;
    ctx.font = `${dir.weight} ${fontSize}px "${dir.fontFamily}", sans-serif`;
    if (native) setTracking(ctx, fontSize, dir.tracking);
    ctx.fillStyle = dir.color;
    drawTracked(ctx, head, x0 + headW / 2, size / 2, fontSize, dir.tracking, native, name);
    ctx.font = `${dir.weight + 400} ${fontSize}px "${dir.fontFamily}", sans-serif`;
    if (native) setTracking(ctx, fontSize, dir.tracking);
    ctx.fillStyle = dir.accentColor || dir.color;
    drawTracked(ctx, tail, x0 + headW + gap + tailW / 2, size / 2, fontSize, dir.tracking, native, name);
    return canvas.toDataURL("image/png");
  }

  // Wordmark: só o nome, centrado (em duas linhas se for comprido).
  const linhas = wrapIfTooSmall(ctx, name, dir, native, inner, inner * 0.32);
  const alturaTexto = linhas.fontSize * (1 + (linhas.lines.length - 1) * LINE_HEIGHT);
  const topo = size / 2 - alturaTexto / 2;
  linhas.lines.forEach((linha, i) => {
    drawTracked(ctx, linha, size / 2, topo + linhas.fontSize * (0.5 + i * LINE_HEIGHT), linhas.fontSize, dir.tracking, native);
  });
  return canvas.toDataURL("image/png");
}
