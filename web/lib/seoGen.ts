/**
 * Geração da descrição de SEO da loja via IA (função serverless `/api/assistant`,
 * scope "seo"). A chave da OpenAI vive só no servidor. Se a IA não estiver
 * disponível (ex.: dev local sem funções), cai num resumo do próprio texto.
 */

/** Limpa e corta um texto para servir de meta-descrição (<= 160 caracteres). */
function toMetaDescription(text: string, max = 160): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const i = cut.lastIndexOf(" ");
  return `${(i > max * 0.6 ? cut.slice(0, i) : cut).trim()}…`;
}

/**
 * Gera uma descrição de SEO a partir do que o dono escreveu sobre a loja.
 * Nunca lança — devolve sempre uma descrição utilizável.
 */
export async function generateSeoDescription(input: {
  storeName: string;
  storeType?: string;
  about: string;
}): Promise<string> {
  const fallback = toMetaDescription(input.about || `${input.storeName} — compras online em Angola.`);
  const question =
    `Cria a meta-descrição de SEO (uma única frase, até 160 caracteres, em português de Portugal, ` +
    `apelativa e com palavras-chave naturais, sem aspas nem emojis) para esta loja online em Angola.\n` +
    `Nome: ${input.storeName}\nTipo: ${input.storeType ?? "loja"}\n` +
    `Descrição do dono: ${input.about}`;
  try {
    const r = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "seo", question }),
    });
    if (!r.ok) return fallback;
    const data = (await r.json()) as { answer?: string };
    const answer = (data?.answer ?? "").replace(/^["']|["']$/g, "").trim();
    return answer ? toMetaDescription(answer) : fallback;
  } catch {
    return fallback;
  }
}
