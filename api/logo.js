/**
 * Função serverless (Vercel) — gerador de logótipos por IA.
 *
 * Recebe uma descrição do dono da loja e devolve DUAS variações de logótipo
 * em PNG com fundo transparente (base64), prontas a mostrar lado a lado no
 * painel. A escolha final é guardada pelo frontend na área "Meus logótipos".
 *
 * A chave da OpenAI fica APENAS aqui, no servidor, via variável de ambiente
 * `OPENAI_API_KEY` (nunca no frontend).
 *
 * Configuração:
 *  - OPENAI_API_KEY        (obrigatória) — a chave secreta da OpenAI.
 *  - OPENAI_IMAGE_MODEL    (opcional)    — por omissão "gpt-image-1".
 */

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

/** Constrói o prompt de logótipo a partir da descrição do cliente (pt). */
function buildPrompt(description) {
  return [
    "Cria um logótipo profissional, moderno e memorável para uma marca/loja.",
    "Descrição do negócio dada pelo cliente:",
    `"""${description}"""`,
    "Requisitos do logótipo:",
    "- Composição centrada, símbolo/ícone limpo e legível, adequado a uma loja online.",
    "- Design vetorial e minimalista, cores harmoniosas, alto contraste.",
    "- Fundo TOTALMENTE transparente (sem fundo, sem moldura, sem sombra por baixo).",
    "- Sem texto solto ou lettering incorreto; se incluir nome, escreve-o corretamente e de forma simples.",
    "- Sem mockups, sem cartões, sem cenário — apenas o logótipo isolado.",
  ].join("\n");
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

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: buildPrompt(description),
        n: 2,
        size: "1024x1024",
        background: "transparent",
        quality: "medium",
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "Falha a gerar os logótipos.", detail: detail.slice(0, 500) });
      return;
    }

    const data = await r.json();
    const images = Array.isArray(data?.data)
      ? data.data.map((d) => d?.b64_json).filter((b) => typeof b === "string" && b.length > 0)
      : [];
    if (!images.length) {
      res.status(502).json({ error: "Não foi possível gerar os logótipos. Tenta de novo." });
      return;
    }
    res.status(200).json({ images });
  } catch (err) {
    res.status(500).json({ error: "Erro interno do gerador de logótipos." });
  }
};
