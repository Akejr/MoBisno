/**
 * Função serverless (Vercel) — gerador de logótipos por IA.
 *
 * ARQUITETURA (3 etapas, uma só ida ao servidor):
 *
 *  1. BRIEFING ESTRUTURADO — a descrição livre do Dono é convertida num JSON
 *     validado (nome da marca, setor, se quer símbolo, cores, registo
 *     tipográfico, caixa das letras, conceitos para o símbolo). Uma chamada a
 *     um modelo de texto com `json_schema` estrito. Deixa de se adivinhar o que
 *     o Dono quis: fica escrito num campo.
 *
 *  2. PLANO DE CINCO DIREÇÕES — determinístico, sem IA. A partir do briefing
 *     escolhem-se cinco direções com tipografia, composição e cor próprias. Ser
 *     determinístico é a razão de as cinco serem mesmo diferentes: a diversidade
 *     passa a ser garantida por construção e não pedida a um modelo.
 *
 *  3. SÍMBOLO (só onde a direção o exige) — a IA de imagem desenha APENAS o
 *     símbolo, isolado e sem texto. O nome da marca é composto no cliente
 *     (`web/lib/logoCompose.ts`) com fontes curadas.
 *
 * PORQUÊ separar o nome do símbolo: um modelo de imagem erra a ortografia,
 * muda de tipografia entre gerações e desenha letras moles. Era daí que vinha
 * o «parecem-se todas» e o «são básicos» — num wordmark, a tipografia é o
 * logótipo todo. O que o modelo faz bem (uma forma abstrata) fica com ele; o
 * que faz mal (letras) sai-lhe das mãos.
 *
 * Consequência direta: quando o Dono não quer símbolo, o plano não pede
 * nenhuma imagem — cinco propostas tipográficas, cinco vezes mais rápidas,
 * a custo zero de geração e com o nome sempre bem escrito.
 *
 * A chave da OpenAI fica APENAS aqui, no servidor, via variável de ambiente
 * `OPENAI_API_KEY` (nunca no frontend).
 *
 * Configuração:
 *  - OPENAI_API_KEY        (obrigatória) — a chave secreta da OpenAI.
 *  - OPENAI_TEXT_MODEL     (opcional)    — briefing; por omissão "gpt-5.4-mini".
 *  - OPENAI_IMAGE_MODEL    (opcional)    — símbolos; por omissão "gpt-image-1".
 *  - OPENAI_IMAGE_QUALITY  (opcional)    — "low" | "medium" | "high" (omissão "medium").
 *    Só afeta o símbolo. O acabamento do ficheiro final vem da resolução de
 *    composição no cliente, que é sempre superior à das pré-visualizações.
 */

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";

/* ------------------------- Etapa 1: briefing ---------------------------- */

/**
 * Esquema do briefing. `strict: true` exige que todos os campos sejam
 * obrigatórios e que não haja propriedades extra — é isso que torna a resposta
 * previsível o suficiente para o plano de direções poder confiar nela.
 */
const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "brandName", "sector", "wantsSymbol", "colors",
    "typographyMood", "letterCase", "symbolConcepts", "avoid",
  ],
  properties: {
    brandName: { type: "string", description: "Nome da marca, tal como o dono o escreveu." },
    sector: { type: "string", description: "O que o negócio vende ou faz, em poucas palavras." },
    wantsSymbol: {
      type: "string",
      enum: ["yes", "no", "either"],
      description: "\"no\" APENAS se o dono disse explicitamente que não quer símbolo/ícone.",
    },
    colors: {
      type: "array",
      items: { type: "string" },
      description: "Até duas cores em hexadecimal (#RRGGBB). Vazio se o dono não indicou nenhuma.",
    },
    typographyMood: {
      type: "string",
      enum: ["geometric", "humanist", "elegant", "strong", "friendly", "technical"],
      description: "\"elegant\" para pedidos de letra elegante, clássica, de luxo, moda ou beleza.",
    },
    letterCase: { type: "string", enum: ["lower", "title", "upper", "any"] },
    symbolConcepts: {
      type: "array",
      items: { type: "string" },
      description: "Duas ou três ideias ABSTRATAS e distintas para o símbolo, ligadas ao negócio.",
    },
    avoid: { type: "array", items: { type: "string" }, description: "O que o dono recusou." },
  },
};

const BRIEF_SYSTEM = [
  "És um estratega de marcas. Converte a descrição do dono num briefing estruturado.",
  "REGRA PRINCIPAL: preserva os factos e as decisões do dono, sobretudo as decisões de AUSÊNCIA.",
  "Se ele disser que não quer símbolo, `wantsSymbol` é \"no\". Se disser que quer tudo preto, `colors` é [\"#111111\"].",
  "Se pedir letra elegante, clássica ou de luxo, `typographyMood` é \"elegant\".",
  "Não inventes nome, slogan, certificações nem promessas comerciais. Não acrescentes cores que ele não pediu.",
  "Quando o dono nada disser sobre um campo, escolhe o que melhor serve o setor — mas nunca contra o que ele disse.",
].join(" ");

/** Extrai o briefing estruturado. Devolve `null` se a IA de texto não responder. */
async function extractBrief(key, description) {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: BRIEF_SYSTEM },
          { role: "user", content: description },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "brand_brief", strict: true, schema: BRIEF_SCHEMA },
        },
        max_completion_tokens: 700,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content;
    return raw ? normalizeBrief(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Briefing de recurso, quando a IA de texto falha. Não adivinha intenções: usa
 * o princípio do sistema todo — na dúvida, não decidir por ele. `either` deixa
 * o plano escolher a mistura habitual e nada se perde.
 */
export function fallbackBrief(description) {
  const text = String(description || "").trim();
  // Nome provável: a primeira sequência Maiúscula do texto, senão as 2 primeiras palavras.
  const capital = text.match(/\b[A-ZÀ-Ý][\wÀ-ÿ]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ]+)?/);
  const brandName = (capital?.[0] || text.split(/\s+/).slice(0, 2).join(" ") || "Marca").slice(0, 40);
  return normalizeBrief({ brandName, sector: "", wantsSymbol: "either", colors: [], typographyMood: "geometric", letterCase: "any", symbolConcepts: [], avoid: [] });
}

/** Sanitiza o briefing: a resposta do modelo não é de confiança sem verificação. */
export function normalizeBrief(raw) {
  const b = raw && typeof raw === "object" ? raw : {};
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const list = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, max) : []);
  const oneOf = (v, allowed, fb) => (allowed.includes(v) ? v : fb);
  const hex = list(b.colors, 2).map((c) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : null)).filter(Boolean);
  return {
    brandName: str(b.brandName, 40) || "Marca",
    sector: str(b.sector, 120),
    wantsSymbol: oneOf(b.wantsSymbol, ["yes", "no", "either"], "either"),
    colors: hex,
    typographyMood: oneOf(b.typographyMood, ["geometric", "humanist", "elegant", "strong", "friendly", "technical"], "geometric"),
    letterCase: oneOf(b.letterCase, ["lower", "title", "upper", "any"], "any"),
    symbolConcepts: list(b.symbolConcepts, 3),
    avoid: list(b.avoid, 8),
  };
}

/* --------------------- Etapa 2: plano de direções ----------------------- */

/**
 * Fontes por registo. Todas já são carregadas pelo `web/index.html`, por isso o
 * cliente compõe com elas sem descarregar nada de novo. A primeira de cada par
 * é a principal; a segunda dá variedade entre direções do mesmo pedido.
 */
const FONTS = {
  geometric: ["Manrope", "Sora"],
  humanist: ["Inter", "Hanken Grotesk"],
  elegant: ["Playfair Display", "Noto Serif"],
  strong: ["Bebas Neue", "Archivo"],
  friendly: ["Hanken Grotesk", "Manrope"],
  technical: ["Geist", "Sora"],
};

/** Cor de texto por omissão quando o Dono não indicou nenhuma. */
const DEFAULT_INK = "#111827";

/**
 * As cinco direções possíveis. `kind: "type"` não gasta nenhuma geração de
 * imagem; `kind: "symbol"` gasta uma. Cada uma traz a sua própria receita de
 * composição, que o cliente aplica tal e qual.
 */
function directionCatalog(brief) {
  const [primary, secondary] = FONTS[brief.typographyMood] || FONTS.geometric;
  const ink = brief.colors[0] || DEFAULT_INK;
  const accent = brief.colors[1] || brief.colors[0] || DEFAULT_INK;
  const lower = brief.letterCase === "any" ? "lower" : brief.letterCase;
  const upper = brief.letterCase === "any" ? "upper" : brief.letterCase;

  return {
    wordmark: {
      slot: "wordmark", label: "Wordmark", kind: "type", layout: "wordmark",
      fontFamily: primary, weight: 700, tracking: -0.03, transform: lower, color: ink,
    },
    spaced: {
      slot: "spaced", label: "Wordmark espaçado", kind: "type", layout: "wordmark",
      fontFamily: secondary, weight: 400, tracking: 0.28, transform: upper, color: ink,
    },
    initial: {
      slot: "initial", label: "Inicial destacada", kind: "type", layout: "initial",
      fontFamily: primary, weight: 600, tracking: -0.01, transform: lower, color: ink, accentColor: accent,
    },
    stacked: {
      slot: "stacked", label: "Empilhado", kind: "type", layout: "stacked-rule",
      fontFamily: secondary, weight: 500, tracking: 0.16, transform: upper, color: ink,
    },
    companion: {
      slot: "companion", label: "Símbolo companheiro", kind: "symbol", layout: "symbol-left",
      fontFamily: primary, weight: 600, tracking: -0.02, transform: lower, color: ink,
    },
    crest: {
      slot: "crest", label: "Símbolo em cima", kind: "symbol", layout: "symbol-top",
      fontFamily: primary, weight: 500, tracking: 0.1, transform: upper, color: ink,
    },
  };
}

/**
 * Escolhe as cinco direções a partir do briefing.
 *
 * A regra que interessa: com `wantsSymbol === "no"` NENHUMA direção pede
 * símbolo — as cinco são tipográficas e o pedido não gasta uma única geração de
 * imagem. Era exatamente este o caso que o gerador antigo servia mal, ao impor
 * um símbolo em três das cinco propostas.
 *
 * Exportada para os testes: é aqui que vive a garantia de diversidade.
 */
export function planDirections(brief) {
  const c = directionCatalog(brief);
  if (brief.wantsSymbol === "no") {
    // Cinco tipográficas: variam a fonte, o peso, o espacejamento e a caixa.
    return [
      c.wordmark,
      c.spaced,
      c.initial,
      c.stacked,
      { ...c.wordmark, slot: "contrast", label: "Peso misto", layout: "two-tone", weight: 300, accentColor: brief.colors[1] || brief.colors[0] || DEFAULT_INK },
    ];
  }
  return [c.wordmark, c.spaced, c.initial, c.companion, c.crest];
}

/* ----------------------- Etapa 3: símbolo por IA ------------------------ */

/**
 * Prompt do símbolo. Muito mais curto e mais firme do que o antigo prompt de
 * logótipo completo, porque agora só pede UMA coisa: uma forma. Sem nome para
 * escrever, desaparece a maior fonte de erro do modelo.
 *
 * Exportada para os testes.
 */
export function buildSymbolPrompt(brief, concept) {
  const cor = brief.colors.length
    ? `Usa exatamente esta cor: ${brief.colors[0]}, sólida e sem gradiente.`
    : "Uma só cor sólida, viva e luminosa. Sem gradiente.";
  const evitar = brief.avoid.length ? ` O cliente recusou expressamente: ${brief.avoid.join(", ")}.` : "";
  return [
    `Desenha UM símbolo de marca abstrato para «${brief.brandName}»${brief.sector ? `, ${brief.sector}` : ""}.`,
    concept ? `Ideia a explorar: ${concept}.` : "",
    "Marca geométrica ou fluida, de um só gesto, com espaço negativo inteligente.",
    cor,
    "Registo de software moderno, ao nível de Stripe, Linear ou Vercel: contemporâneo, leve e confiante.",
    "PROIBIDO, sem exceção: qualquer texto, letra, palavra, número ou slogan dentro da imagem.",
    "PROIBIDO: pictogramas literais (envelope, carrinho, telefone, lâmpada, casa, engrenagem, balão de fala), clip-art, emblemas circulares, brasões, escudos, faixas, 3D, sombras, texturas e mockups.",
    evitar,
    "Fundo TOTALMENTE transparente. Símbolo único, isolado e centrado, com margem folgada.",
    "Silhueta simples, ainda legível a 32 píxeis e funcional a preto e branco.",
  ].filter(Boolean).join(" ");
}

/** Gera o símbolo de UMA direção. Devolve `{ok, b64}` ou `{ok:false, detail}`. */
async function generateSymbol(key, brief, concept) {
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: buildSymbolPrompt(brief, concept),
        n: 1,
        size: "1024x1024",
        background: "transparent",
        quality: IMAGE_QUALITY,
      }),
    });
    if (!r.ok) return { ok: false, detail: (await r.text()).slice(0, 500) };
    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;
    return typeof b64 === "string" && b64 ? { ok: true, b64 } : { ok: false, detail: "sem imagem" };
  } catch (err) {
    return { ok: false, detail: String(err?.message || err).slice(0, 200) };
  }
}

/* ------------------------------ Handler --------------------------------- */

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

    // 1. Briefing. Uma falha aqui não trava o pedido: seguimos com o recurso.
    const brief = (await extractBrief(key, description)) || fallbackBrief(description);

    // 2. Plano determinístico das cinco direções.
    const directions = planDirections(brief);

    // 3. Símbolos, só para as direções que os exigem.
    const needSymbol = directions.filter((d) => d.kind === "symbol");
    const symbols = await Promise.all(
      needSymbol.map((_, i) => generateSymbol(key, brief, brief.symbolConcepts[i] || "")),
    );

    let s = 0;
    const failures = [];
    const out = directions.map((d) => {
      if (d.kind !== "symbol") return { ...d, symbol: null };
      const result = symbols[s++];
      if (result?.ok) return { ...d, symbol: result.b64 };
      failures.push(result?.detail || "falha");
      return null; // direção perdida: o cliente mostra as que chegaram
    }).filter(Boolean);

    if (!out.length) {
      res.status(502).json({
        error: "Não foi possível gerar os logótipos. Tenta de novo.",
        detail: failures.join(" | ").slice(0, 500),
      });
      return;
    }
    res.status(200).json({ brief, directions: out, requested: directions.length });
  } catch (err) {
    res.status(500).json({ error: "Erro interno do gerador de logótipos." });
  }
}
