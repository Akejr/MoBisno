/**
 * Geração dos textos de SEO da loja por IA (`/api/assistant`, âmbitos `seo` e
 * `seotitle`). A chave do modelo vive só no servidor (`api/_openrouter.js`).
 *
 * ## Falhar é permitido; falhar em silêncio não
 *
 * Se a IA não responder, estas funções devolvem um texto utilizável a partir do
 * que o Dono escreveu: criar a loja nunca pode ficar à espera de um modelo.
 *
 * O que mudou é que passam a **dizer** se o texto é da IA (`byAi`). Durante
 * meses o modelo configurado não existia, cada pedido falhava, e o assistente
 * mostrava um resumo do próprio texto do Dono depois de prometer «a melhor
 * descrição para o Google». O recurso estava certo; esconder que era um recurso
 * é que não.
 */

/** Texto gerado, e se foi mesmo a IA a gerá-lo. */
export interface SeoText {
  text: string;
  /** `false` quando a IA não respondeu e o texto saiu do que o Dono escreveu. */
  byAi: boolean;
}

/** Limpa e corta um texto para servir de meta-descrição (<= 160 caracteres). */
function toMetaDescription(text: string, max = 160): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const i = cut.lastIndexOf(" ");
  return `${(i > max * 0.6 ? cut.slice(0, i) : cut).trim()}…`;
}

/** Pede um texto ao âmbito indicado. `null` quando a IA não respondeu. */
async function ask(scope: "seo" | "seotitle", question: string): Promise<string | null> {
  try {
    const r = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, question }),
    });
    if (!r.ok) {
      // O código diz o que está errado (chave, modelo, rede). Fica na consola
      // do navegador: é o primeiro sítio onde se procura quando o texto sai
      // igual ao que o Dono escreveu.
      const corpo = (await r.json().catch(() => null)) as { code?: string; error?: string } | null;
      console.warn("[seoGen]", scope, r.status, corpo?.code ?? "", corpo?.error ?? "");
      return null;
    }
    const data = (await r.json()) as { answer?: string };
    const answer = (data?.answer ?? "").trim();
    return answer || null;
  } catch (e) {
    console.warn("[seoGen]", scope, e);
    return null;
  }
}

/**
 * Gera a meta-descrição a partir do que o Dono escreveu sobre a loja.
 * Nunca lança — devolve sempre uma descrição utilizável.
 */
export async function generateSeoDescription(input: {
  storeName: string;
  storeType?: string;
  about: string;
}): Promise<SeoText> {
  const fallback = toMetaDescription(input.about || `${input.storeName} — compras online em Angola.`);
  const question =
    `Cria a meta-descrição de SEO (uma única frase, até 160 caracteres, em português de Portugal, ` +
    `apelativa e com palavras-chave naturais, sem aspas nem emojis) para esta loja online em Angola.\n` +
    `Nome: ${input.storeName}\nTipo: ${input.storeType ?? "loja"}\n` +
    `Descrição do dono: ${input.about}`;
  const answer = await ask("seo", question);
  if (!answer) return { text: fallback, byAi: false };
  const limpo = answer.replace(/^["']|["']$/g, "").trim();
  return limpo ? { text: toMetaDescription(limpo), byAi: true } : { text: fallback, byAi: false };
}

/**
 * Gera o TÍTULO de SEO completo («Nome | frase»). A frase depois do «|» é a que
 * a IA escreve; sem ela, cai no tipo de negócio.
 */
export async function generateSeoTitle(input: {
  storeName: string;
  storeType?: string;
  about: string;
}): Promise<SeoText> {
  const name = String(input.storeName ?? "").trim() || "A minha loja";
  const fallbackTagline = (input.storeType && input.storeType.trim())
    ? `${input.storeType.trim()} em Angola`
    : "Compras em Angola";
  const compose = (tagline: string): string => {
    const clean = tagline.replace(/^["']|["']$/g, "").replace(/[|]/g, "").replace(/\.+$/, "").trim();
    const t = clean.length > 45 ? clean.slice(0, 45).trim() : clean;
    return `${name} | ${t || fallbackTagline}`;
  };
  const question =
    `Loja: ${name}\nTipo: ${input.storeType ?? "loja"}\nDescrição do dono: ${input.about}\n` +
    `Escreve a frase curta de posicionamento (3 a 6 palavras) para o título do Google.`;
  const answer = await ask("seotitle", question);
  return answer
    ? { text: compose(answer), byAi: true }
    : { text: compose(fallbackTagline), byAi: false };
}
