/**
 * Função serverless (Vercel) — gerador de logótipos por IA.
 *
 * Recebe uma descrição do dono da loja e devolve CINCO variações de logótipo
 * em PNG com fundo transparente (base64), prontas a mostrar em grelha no
 * painel. A escolha final é guardada pelo frontend na área "Meus logótipos".
 *
 * Gera as cinco variações com direções de arte DIFERENTES (wordmark, lockup
 * horizontal, monograma, empilhado com descritor e emblema contido), que
 * variam em tipografia e composição e não apenas no arranjo das peças.
 *
 * REGRA CENTRAL: o briefing do cliente ganha sempre às predefinições de estilo
 * da casa — ver `PRECEDENCE`. As predefinições só preenchem o que o cliente
 * não especificou, e cada variação sabe degradar para um tratamento
 * tipográfico quando o cliente recusa símbolos.
 *
 * A chave da OpenAI fica APENAS aqui, no servidor, via variável de ambiente
 * `OPENAI_API_KEY` (nunca no frontend).
 *
 * Configuração:
 *  - OPENAI_API_KEY        (obrigatória) — a chave secreta da OpenAI.
 *  - OPENAI_IMAGE_MODEL    (opcional)    — por omissão "gpt-image-1".
 *  - OPENAI_IMAGE_QUALITY  (opcional)    — "low" | "medium" | "high" (por omissão "medium").
 *    Define o refinamento do desenho e da tipografia; "high" custa mais por
 *    imagem, e são cinco imagens por pedido.
 */

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";

/**
 * Requisitos TÉCNICOS do ficheiro — não negociáveis e independentes do gosto.
 *
 * Ficam separados da estética de propósito: são o formato que a Plataforma
 * precisa (PNG recortado, escalável, nome bem escrito), não uma opinião de
 * design, por isso o pedido do cliente não os pode contradizer.
 */
const TECHNICAL = [
  "REQUISITOS DE FICHEIRO (obrigatórios, valem sempre):",
  "- Fundo TOTALMENTE transparente. Sem fundo, moldura, cartão, sombra projetada, mockup, cenário nem reflexo.",
  "- Um único logótipo, isolado e centrado, com margem folgada. Nada de grelhas de variantes, paletas de cor, folhas de estilo de marca ou texto explicativo à volta.",
  "- Marca simples e escalável, ainda legível a 32px (favicon). Sem detalhe fotográfico nem 3D pesado.",
  "- Se o logótipo tiver texto, o nome da marca tem de estar escrito CORRETAMENTE, letra por letra. Nenhum texto além do nome da marca e, quando faça sentido, um descritor curto do setor.",
].join("\n");

/**
 * Regra de precedência — a correção central deste gerador.
 *
 * PORQUÊ: a versão anterior juntava uma direção de arte fixa («o símbolo DEVE
 * ser abstrato», «usa um GRADIENTE», «tipografia sans-serif, minúsculas») e só
 * DEPOIS colava a descrição do cliente, rotulada como «descrição do negócio».
 * O modelo lia a direção de arte como o briefing e o texto do cliente como
 * contexto de fundo, e resolvia os conflitos a favor da direção de arte: quem
 * escrevia «todo preto, sem símbolo, só o nome» recebia símbolos com gradiente
 * colorido. O briefing do cliente passa a vir primeiro e a mandar.
 */
const PRECEDENCE = [
  "PRECEDÊNCIA — lê com atenção:",
  "O briefing acima é VINCULATIVO e ganha sempre. Tudo o que se segue são predefinições da casa, que existem apenas para preencher aquilo que o cliente NÃO especificou.",
  "Se o cliente pedir algo que contrarie uma predefinição — a cor, o tipo de letra, não querer símbolo, não querer gradiente, querer maiúsculas —, segue o cliente e ignora a predefinição, sem exceção e sem meio-termo.",
  "Em particular: se o cliente disser que NÃO quer símbolo/ícone, não desenhes nenhuma forma gráfica além das próprias letras. Se disser que quer uma só cor, não uses gradiente nem segunda cor. Se pedir letra elegante, clássica ou de luxo, usa serifada, não sans-serif.",
].join("\n");

/**
 * Predefinições estéticas. Subordinadas ao briefing pela regra acima — daí não
 * imporem já cor, gradiente, caixa da letra nem a presença de símbolo, que era
 * o que uniformizava as cinco propostas.
 */
const DEFAULTS = [
  "PREDEFINIÇÕES DA CASA (só onde o cliente nada disse):",
  "- Nível de estúdio de branding profissional: elegante, intencional, bem desenhado. Nunca clip-art, ícones de stock, efeitos baratos nem ilustração literal (envelope, carrinho, telefone, lâmpada, casa, engrenagem, balão de fala).",
  "- Paleta contida, 1 a 2 cores. Composição equilibrada, espaço em branco generoso, kerning cuidado.",
  "- Se desenhares um símbolo e o cliente não o descreveu, faz uma marca ABSTRATA e distinta — geométrica ou fluida, com espaço negativo inteligente —, não um pictograma.",
].join("\n");

/**
 * Cinco direções de arte. Cada uma varia num eixo próprio (tipografia,
 * composição, contenção, escala do símbolo) e não só no arranjo das peças,
 * porque cinco layouts sob a mesma tipografia e a mesma cor davam cinco
 * imagens quase iguais.
 *
 * Cada direção traz a sua própria alternativa sem símbolo: quando o cliente
 * proíbe símbolos, a variação degrada para um tratamento tipográfico
 * equivalente em vez de desobedecer ou de colapsar sobre as outras.
 */
const VARIATIONS = [
  // A — a letra é o logótipo.
  [
    "VARIAÇÃO A — WORDMARK TIPOGRÁFICO. Só o nome da marca, sem símbolo nenhum.",
    "Todo o interesse vem da própria letra: proporções cuidadas, espacejamento trabalhado e UM detalhe distinto e subtil (uma ligadura, um terminal cortado, uma contra-forma aberta, um ponto substituído).",
  ].join(" "),
  // B — lockup horizontal clássico.
  [
    "VARIAÇÃO B — LOCKUP HORIZONTAL. Marca à esquerda e nome à direita, alinhados pelo eixo ótico, separados por um intervalo generoso.",
    "Sem símbolo permitido: substitui a marca da esquerda pela inicial do nome tratada como peça gráfica autónoma, no mesmo lugar e com o mesmo peso visual.",
  ].join(" "),
  // C — a inicial como marca.
  [
    "VARIAÇÃO C — MONOGRAMA. Constrói a marca a partir da inicial (ou das duas iniciais) do nome, trabalhada como forma e não como letra tirada de uma fonte, com espaço negativo inteligente. O nome completo entra pequeno por baixo, ou fica de fora.",
    "Sem símbolo permitido: mantém o monograma estritamente tipográfico — a letra desenhada, sem forma abstrata à volta nem dentro.",
  ].join(" "),
  // D — composição vertical com descritor.
  [
    "VARIAÇÃO D — EMPILHADO COM DESCRITOR. Composição vertical e centrada: o nome em destaque e, por baixo, o setor do negócio em letras muito espaçadas e bem mais pequenas.",
    "Se houver símbolo, entra pequeno e centrado por cima do nome. Sem símbolo permitido: fica só o par nome + descritor, e o contraste de escala entre os dois é que sustenta a composição.",
  ].join(" "),
  // E — contenção: selo/moldura.
  [
    "VARIAÇÃO E — EMBLEMA CONTIDO. O conjunto vive dentro de uma contenção geométrica simples — um círculo, um arco, um retângulo ou um par de linhas —, com o nome centrado lá dentro.",
    "A contenção é uma linha fina, não uma mancha cheia. Sem símbolo permitido: a moldura e as linhas são geometria, não símbolo, por isso mantêm-se; lá dentro fica apenas o nome.",
  ].join(" "),
];

/**
 * Constrói o prompt de UMA variação.
 *
 * Ordem deliberada: briefing do cliente → precedência → direção da variação →
 * predefinições → requisitos de ficheiro. O que o cliente escreveu abre o
 * prompt e é apresentado como instrução, não como contexto de negócio.
 *
 * Exportada para os testes poderem fixar a regra de precedência (o pedido do
 * cliente aparece antes de qualquer predefinição, em todas as variações).
 */
export function buildPrompt(description, variationIndex) {
  return [
    "Desenha o logótipo encomendado por este cliente. O briefing dele é o seguinte, e é para cumprir:",
    `"""${description}"""`,
    PRECEDENCE,
    VARIATIONS[variationIndex] || VARIATIONS[0],
    DEFAULTS,
    TECHNICAL,
  ].join("\n\n");
}

/** Nº de direções de arte geradas por pedido (uma imagem cada). */
export const VARIATION_COUNT = VARIATIONS.length;

/** Gera UMA imagem para a variação pedida. Devolve o b64 ou null em falha. */
async function generateOne(key, description, variationIndex) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: buildPrompt(description, variationIndex),
      n: 1,
      size: "1024x1024",
      background: "transparent",
      quality: IMAGE_QUALITY,
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    return { ok: false, detail: detail.slice(0, 500) };
  }
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  return typeof b64 === "string" && b64 ? { ok: true, b64 } : { ok: false, detail: "sem imagem" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Gerador de logótipos não configurado (falta OPENAI_API_KEY)." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const description = String(body.description || "").trim().slice(0, 1000);
    if (!description) {
      res.status(400).json({ error: "Descrição em falta." });
      return;
    }

    // Cinco variações em paralelo, com direções de arte diferentes.
    const results = await Promise.all(
      VARIATIONS.map((_, i) => generateOne(key, description, i)),
    );

    const images = results.filter((r) => r.ok).map((r) => r.b64);
    if (!images.length) {
      const detail = results.map((r) => (r.ok ? "" : r.detail)).filter(Boolean).join(" | ");
      res.status(502).json({ error: "Não foi possível gerar os logótipos. Tenta de novo.", detail: detail.slice(0, 500) });
      return;
    }
    res.status(200).json({ images });
  } catch (err) {
    res.status(500).json({ error: "Erro interno do gerador de logótipos." });
  }
};
