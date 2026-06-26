/**
 * Função serverless (Vercel) — intermediária do assistente de IA do editor.
 *
 * A chave da OpenAI fica APENAS aqui, no servidor, via variável de ambiente
 * `OPENAI_API_KEY` (nunca no frontend). O assistente só RESPONDE a perguntas —
 * não executa ações na loja.
 *
 * Configuração:
 *  - OPENAI_API_KEY  (obrigatória)  — a chave secreta da OpenAI.
 *  - OPENAI_MODEL    (opcional)     — por omissão "gpt-5.4-mini".
 */

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

/** Contexto completo das funcionalidades do editor, para respostas úteis. */
const SYSTEM_PROMPT = `És o assistente do MôBisno, uma plataforma para criar lojas online em Angola. Estás dentro do EDITOR onde o dono personaliza a sua loja.

REGRAS:
- Respondes APENAS a perguntas e dás instruções passo-a-passo. NÃO executas ações nem alteras nada — explicas como o utilizador faz.
- Responde em português de Portugal, de forma curta, simpática e prática (usa passos numerados quando ajudar).
- Se não souberes algo específico da conta do utilizador (dados privados), explica como ele encontra no painel.
- Mantém-te no contexto do MôBisno; se perguntarem algo fora disso, redireciona gentilmente.

FUNCIONALIDADES DO EDITOR (como o utilizador faz cada coisa):
- LOGÓTIPO: passar o rato no logótipo no topo mostra um controlo "− 📷 Trocar +". "Trocar" muda a imagem; "−" e "+" diminuem/aumentam o tamanho.
- TEXTOS: clicar em qualquer texto (título, descrições, contactos) e escrever diretamente. Enter confirma.
- COR PRINCIPAL: na barra de topo, o círculo "Cor" define a cor da marca (botões e destaques). Aplica-se ao vivo.
- COR DOS TEXTOS: o círculo "Texto" muda a cor de textos e ícones.
- ESTILO (TEMA): o seletor "Estilo" oferece Moderno, Clássico ou Minimal para dar coerência visual.
- HERO (TOPO): por baixo da divisória "Hero" há o botão "Trocar modelo do hero" com pré-visualização ao vivo (Imagem destaque, Dividido, Galeria em arco). À direita há pontinhos para a cor de fundo do hero (só aplica em modelos sem imagem inteira).
- DISPOSIÇÃO DOS PRODUTOS: botão "Mudar disposição dos produtos" (Retrato, Quadrado, Alto).
- COR DE FUNDO DA SECÇÃO: cada secção tem pontinhos à direita por baixo da divisória (Branco, Cinza, Cinza escuro, Preto claro, Preto). Em fundo escuro os textos passam a claros automaticamente. Clicar na cor já ativa remove-a.
- SECÇÕES/BLOCOS: botão "Adicionar secção" no fim permite adicionar: secção de produtos (por categoria/Destaques), informação (foto + texto), título e texto, testemunhos e localização (mapa). Cada bloco pode subir/descer/remover.
- TESTEMUNHOS: têm 4 modelos selecionáveis no botão "Modelo": Cartões, Editorial, Carrossel e Destaque. Cada review permite editar foto OU a letra do avatar, nome, função e texto.
- PÁGINA DE PRODUTO: alterna no topo entre "Início" e "Página de produto". Aí editam-se as garantias (ícone + texto), o botão de WhatsApp e a quantidade.
- LOCALIZAÇÃO: no bloco de localização há "Definir no mapa" para arrastar o pin até à morada certa.
- GUARDAR: o botão "Guardar" publica as alterações. "Ver loja" abre a loja publicada noutra aba. "Desfazer" reverte a última alteração. "Tutorial" inicia uma visita guiada.
- PAINEL: fora do editor, no painel, há os separadores Plano (limites/upgrade) e Configurações (apagar loja). A criação de novas lojas é por chat com o assistente.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Assistente não configurado (falta OPENAI_API_KEY)." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const question = String(body.question || "").slice(0, 2000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    if (!question.trim()) {
      res.status(400).json({ error: "Pergunta em falta." });
      return;
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
      { role: "user", content: question },
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages, max_completion_tokens: 600 }),
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "Falha a contactar o assistente.", detail: detail.slice(0, 500) });
      return;
    }
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "Não consegui responder agora. Tenta de novo.";
    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: "Erro interno do assistente." });
  }
};
