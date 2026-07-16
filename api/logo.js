/**
 * Função serverless (Vercel) — gerador de logótipos por IA.
 *
 * Recebe uma descrição do dono da loja e devolve DUAS variações de logótipo
 * em PNG com fundo transparente (base64), prontas a mostrar lado a lado no
 * painel. A escolha final é guardada pelo frontend na área "Meus logótipos".
 *
 * Gera as duas variações com direções de arte DIFERENTES (uma como
 * monograma/lettermark, outra como símbolo abstrato), procurando um resultado
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
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "high";

/** Direção de arte comum às duas variações (o que torna o logo "premium"). */
const ART_DIRECTION = [
  "Design de logótipo profissional de nível de agência, moderno, minimalista e memorável, para uma marca de topo.",
  "Estética premium 2025: formas geométricas limpas e equilibradas, proporções perfeitas, uso inteligente de espaço negativo, traço consistente.",
  "Marca vetorial simples e escalável (deve funcionar bem pequena, como favicon). Máximo 2 ou 3 cores harmoniosas; podes usar um gradiente subtil e sofisticado.",
  "Composição centrada, isolada. Fundo TOTALMENTE transparente — sem fundo, sem moldura, sem cartão, sem sombra por baixo, sem mockup, sem cenário.",
  "NÃO uses estilo clip-art, NÃO uses ilustrações realistas ou detalhadas, NÃO uses efeitos 3D pesados, NÃO uses múltiplas cores desorganizadas.",
  "Se incluíres texto, escreve o nome da marca CORRETAMENTE, com tipografia sans-serif moderna e limpa; caso contrário não coloques texto nenhum.",
].join(" ");

/** Duas direções distintas para dar variedade real entre as opções. */
const VARIATIONS = [
  // A — monograma / lettermark tipográfico premium.
  "Estilo: MONOGRAMA / LETTERMARK. Cria uma marca a partir da(s) inicial(is) do nome do negócio, com uma construção tipográfica geométrica e elegante, eventualmente com espaço negativo criativo. Sofisticado e corporativo.",
  // B — símbolo/ícone abstrato de marca.
  "Estilo: SÍMBOLO ABSTRATO. Cria um ícone de marca abstrato e distinto que evoque o conceito do negócio de forma simbólica (não literal), com formas geométricas modernas. Pode ter um gradiente subtil. Estilo tech/premium.",
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

    // Duas variações em paralelo, com direções de arte diferentes.
    const results = await Promise.all([
      generateOne(key, description, 0),
      generateOne(key, description, 1),
    ]);

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
