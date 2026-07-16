/**
 * Função serverless (Vercel) — gerador de logótipos por IA.
 *
 * Recebe uma descrição do dono da loja e devolve CINCO variações de logótipo
 * em PNG com fundo transparente (base64), prontas a mostrar em grelha no
 * painel. A escolha final é guardada pelo frontend na área "Meus logótipos".
 *
 * Gera as cinco variações com direções de arte DIFERENTES (monograma,
 * símbolo abstrato, combinação, emblema e wordmark), procurando um resultado
 * moderno e premium (nível de agência), não "clip-art".
 *
 * A chave da OpenAI fica APENAS aqui, no servidor, via variável de ambiente
 * `OPENAI_API_KEY` (nunca no frontend).
 *
 * Configuração:
 *  - OPENAI_API_KEY        (obrigatória) — a chave secreta da OpenAI.
 *  - OPENAI_IMAGE_MODEL    (opcional)    — por omissão "gpt-image-1".
 *  - OPENAI_IMAGE_QUALITY  (opcional)    — "low" | "medium" | "high" (por omissão "high").
 */

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";

/**
 * Direção de arte comum a todas as variações. Objetivo: logótipos de marca de
 * tecnologia/startup, elegantes, modernos e minimalistas — do nível do que se
 * vê em Dribbble/Behance ou de marcas como Stripe, Vercel, Notion. NUNCA
 * "ícone literal + texto" ao estilo clip-art.
 */
const ART_DIRECTION = [
  "Cria um logótipo de marca elegante, moderno e minimalista, de nível de estúdio de branding profissional (qualidade Dribbble/Behance).",
  "O SÍMBOLO deve ser uma MARCA ABSTRACTA e geométrica/fluida — uma forma única, distinta e memorável (ex.: fita curva, forma orgânica, marca geométrica com espaço negativo). NÃO uses ícones literais nem pictogramas (nada de envelopes, carrinhos, telefones, lâmpadas, casas, engrenagens, balões de fala).",
  "Usa um GRADIENTE suave e sofisticado no símbolo (transições limpas entre 2 tons da mesma família de cor), com acabamento premium e cantos suaves/arredondados. Nada de contornos duros de clip-art.",
  "Se houver nome, apresenta-o como WORDMARK ao lado do símbolo (lockup), em tipografia sans-serif moderna, geométrica e limpa, minúsculas, kerning perfeito, cor sólida escura (quase preto) ou a cor da marca. O nome tem de estar escrito CORRETAMENTE.",
  "Marca vetorial simples e escalável (tem de ficar bem como favicon). Composição equilibrada, muito espaço em branco, isolada e centrada.",
  "Fundo TOTALMENTE transparente — sem fundo, sem moldura, sem cartão, sem sombras, sem mockups, sem cenário, sem texto extra além do nome da marca.",
  "PROIBIDO: clip-art, ícones de stock, ilustrações realistas ou detalhadas, 3D pesado, muitas cores, texturas, efeitos baratos, um ícone literal com uma etiqueta por baixo.",
].join(" ");

/** Cinco direções distintas — todas elegantes e modernas (nunca clip-art). */
const VARIATIONS = [
  // A — lockup símbolo abstrato + wordmark (estilo do exemplo "lumi").
  "Estilo: SÍMBOLO ABSTRACTO + WORDMARK (lockup horizontal). Um símbolo abstrato fluido com gradiente à esquerda e o nome da marca em minúsculas à direita, tipografia geométrica moderna. Elegante, tech, premium (pensa Stripe/Notion).",
  // B — só símbolo abstrato com gradiente.
  "Estilo: APENAS SÍMBOLO ABSTRACTO. Uma marca abstrata e distinta com gradiente suave e espaço negativo criativo, sem qualquer texto. Forma única e memorável, moderna e sofisticada.",
  // C — monograma geométrico.
  "Estilo: MONOGRAMA. Constrói uma marca a partir da(s) inicial(is) do nome, de forma geométrica e abstrata (não uma letra de fonte comum), com gradiente subtil e espaço negativo inteligente. Sofisticado e premium.",
  // D — wordmark tipográfico puro.
  "Estilo: WORDMARK puro. Só o nome da marca, em minúsculas, com tipografia personalizada moderna e um detalhe subtil e distinto numa letra (ligadura, corte, ponto). Sem símbolo. Cor sólida elegante.",
  // E — lockup vertical símbolo + nome.
  "Estilo: SÍMBOLO ABSTRACTO + NOME (empilhado na vertical). Símbolo abstrato com gradiente em cima e o nome centrado por baixo, tipografia sans-serif moderna e limpa. Composição equilibrada e premium.",
];

/** Constrói o prompt final combinando descrição + direção de arte + variação. */
function buildPrompt(description, variationIndex) {
  return [
    ART_DIRECTION,
    VARIATIONS[variationIndex] || VARIATIONS[0],
    "Descrição do negócio dada pelo cliente:",
    `"""${description}"""`,
  ].join("\n\n");
}

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
