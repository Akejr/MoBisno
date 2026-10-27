/**
 * O único caminho da plataforma para um modelo de IA: o **OpenRouter**.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * ## Porque é que há um ficheiro só para isto
 *
 * A chamada estava dentro de `api/assistant.js`, com o endereço da OpenAI e o
 * nome do modelo escritos no meio do resto. O modelo por omissão era
 * `gpt-5.4-mini`, que **não existe**: cada pedido falhava, o endpoint
 * respondia 502, e quem gerava a descrição da loja recebia em silêncio um
 * resumo do próprio texto — apresentado como «a melhor descrição para o
 * Google». Durou meses sem ninguém saber.
 *
 * Daí as três regras deste módulo:
 *
 *  - **um sítio só** para o endereço, o modelo e a chave;
 *  - **o modelo é configurável** (`OPENROUTER_MODEL`), para se trocar sem
 *    publicar código;
 *  - **a causa chega a quem chama**. Um modelo que não existe tem de dizer «esse
 *    modelo não existe», não «falha a contactar o assistente».
 *
 * A API do OpenRouter é compatível com a da OpenAI no corpo e na resposta, por
 * isso o que muda é o endereço, a chave e o nome do modelo (que leva o
 * fornecedor à frente: `openai/gpt-4o-mini`, `google/gemini-2.5-flash`…). O
 * catálogo está em https://openrouter.ai/models.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Modelo por omissão.
 *
 * `openai/gpt-4o-mini` foi confirmado no catálogo do OpenRouter, é barato e
 * escreve português de Portugal de forma fiável — que é o que aqui conta, entre
 * responder ao Dono e escrever a descrição da loja para o Google. Trocar é pôr
 * `OPENROUTER_MODEL` com outro identificador da lista.
 */
const DEFAULT_MODEL = "openai/gpt-4o-mini";

/** Tempo máximo de espera por resposta, em ms. */
const TIMEOUT_MS = 30_000;

/** Modelo em uso. */
export function aiModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/** O OpenRouter está configurado? */
export function aiConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * Pede uma resposta ao modelo.
 *
 * @param {object} o
 * @param {string} o.system Instruções de sistema (papel, estilo, âmbito).
 * @param {{role: string, content: string}[]} [o.history] Conversa anterior, já filtrada.
 * @param {string} o.question A pergunta ou o pedido.
 * @param {number} [o.maxTokens] Teto da resposta.
 * @param {string} [o.referer] O nosso site, para a atribuição no OpenRouter.
 * @returns `{ ok: true, answer }` ou `{ ok: false, code, error, detail }`.
 *
 * Nunca lança: quem chama decide o que fazer com a falha.
 */
export async function aiChat({ system, history = [], question, maxTokens = 600, referer }) {
  if (!aiConfigured()) {
    return { ok: false, code: "AI_NOT_CONFIGURED", error: "O assistente não está configurado.", detail: "falta OPENROUTER_API_KEY" };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // Atribuição: opcional para o OpenRouter, e é o que identifica a
        // aplicação nos registos da conta. `X-Title` continua suportado.
        ...(referer ? { "HTTP-Referer": referer } : {}),
        "X-Title": "MoBisno",
      },
      body: JSON.stringify({
        model: aiModel(),
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: question },
        ],
        // `max_tokens` e não `max_completion_tokens`: é o nome que o OpenRouter
        // aceita em todos os fornecedores que encaminha.
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    });

    const body = await r.json().catch(() => null);
    if (!r.ok || !body) {
      // A mensagem do fornecedor diz o que está errado — «modelo não
      // encontrado», «sem saldo», «chave inválida». Vai nos registos, e um
      // resumo dela vai a quem chama: era precisamente o que faltava.
      const detalhe = body?.error?.message ? String(body.error.message) : `HTTP ${r.status}`;
      console.error("[openrouter]", r.status, aiModel(), detalhe.slice(0, 300));
      const semServico = r.status === 401 || r.status === 402 || r.status === 403;
      return {
        ok: false,
        code: semServico ? "AI_UNAUTHORIZED" : r.status === 404 ? "AI_MODEL_NOT_FOUND" : "AI_FAILED",
        error: "Não foi possível gerar a resposta agora.",
        detail: detalhe.slice(0, 300),
      };
    }

    const answer = String(body?.choices?.[0]?.message?.content ?? "").trim();
    if (!answer) {
      console.error("[openrouter] resposta vazia", aiModel(), JSON.stringify(body).slice(0, 300));
      return { ok: false, code: "AI_EMPTY", error: "O assistente não devolveu resposta.", detail: "resposta vazia" };
    }
    return { ok: true, answer };
  } catch (e) {
    const nome = e instanceof Error ? e.name : String(e);
    console.error("[openrouter] falha de rede", nome);
    return {
      ok: false,
      code: nome === "AbortError" ? "AI_TIMEOUT" : "AI_UNREACHABLE",
      error: "Não foi possível contactar o assistente.",
      detail: nome,
    };
  } finally {
    clearTimeout(t);
  }
}
