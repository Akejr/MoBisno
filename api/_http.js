/**
 * Guardas das funções serverless **públicas**: de onde pode vir o pedido, e
 * quantos pedidos por IP.
 *
 * Ficheiro com prefixo `_` → o Vercel não o trata como endpoint.
 *
 * Viviam dentro de `api/assistant.js`, o primeiro endpoint sem sessão. O
 * segundo (`api/email-check.js`) precisa das mesmas duas guardas, e duas cópias
 * da mesma regra de segurança é a avaria conhecida: uma é corrigida e a outra
 * fica para trás sem nada falhar.
 *
 * Não importa `api/_shared.js` de propósito: aquele traz o cliente do Supabase
 * atrás, e estas guardas servem funções que podem não tocar na base de dados.
 */

/**
 * Origens que podem chamar uma função pública.
 *
 * Não trava um `curl` — para isso existe o limite por IP. Trava o caso real: um
 * site de outra pessoa a chamar as nossas funções com as nossas chaves.
 *
 * As pré-visualizações da Vercel são aceites **só as deste projeto**, pelas
 * variáveis de sistema que ela própria define. Aceitar qualquer endereço
 * terminado em vercel.app deixava passar quem criasse um projeto lá.
 */
export function allowedOrigin(req) {
  const origin = String(req.headers?.origin || req.headers?.referer || "");
  if (!origin) return true; // pedidos do mesmo site nem sempre trazem a origem
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "mobisno.store" || host.endsWith(".mobisno.store")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
    const own = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter(Boolean)
      .map((h) => String(h).toLowerCase());
    return own.includes(host);
  } catch {
    return false;
  }
}

/** Pedidos por IP e por janela, por omissão. */
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

/** Marcas de hora por `<balde>:<ip>`. Vive na instância, como a função. */
const hits = new Map();

/**
 * Limite de pedidos por IP.
 *
 * É uma rede de segurança, não uma garantia — cada instância da função tem o seu
 * contador. Trava o abuso mais simples (um ciclo a disparar pedidos) sem precisar
 * de uma base de dados.
 *
 * O `bucket` separa os contadores de endpoints diferentes: um visitante a
 * conversar com o assistente não pode gastar as tentativas de quem está a criar
 * conta.
 */
export function rateLimited(req, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : LIMIT;
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : WINDOW_MS;
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const chave = `${opts.bucket || "default"}:${ip}`;
  const now = Date.now();
  const list = (hits.get(chave) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(chave, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}
