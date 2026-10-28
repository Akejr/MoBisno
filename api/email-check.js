/**
 * POST /api/email-check — este email já tem conta?
 *
 * ## Porque é que existe
 *
 * O assistente de criação só descobria que o email estava ocupado **no fim**:
 * depois do nome, do email, da palavra-passe escrita duas vezes e do resumo
 * confirmado. A pessoa fazia o percurso inteiro para ouvir «já existe uma conta
 * associada a este email» e tinha de voltar atrás. Agora a pergunta é feita no
 * passo do email, com a resposta antes de haver mais nada escrito.
 *
 * ## Porque é que lê `auth.users` e não `profiles`
 *
 * Um email pode estar ocupado por uma **identidade sem perfil**: era o que
 * ficava das contas eliminadas antes de `api/admin-account.js` apagar as três
 * camadas. É precisamente essa que faz o registo falhar, e é a que um `select`
 * em `profiles` não vê — o perfil já não existe.
 *
 * ## Porque é que isto não abre uma porta nova
 *
 * A informação já estava exposta: `supabase.auth.signUp` responde «User already
 * registered» a quem tentar, e era dessa resposta que o assistente falava. O que
 * muda é o momento, não o que se sabe. Mesmo assim leva as duas guardas das
 * funções públicas (`api/_http.js`): a origem, e um limite por IP mais apertado
 * do que o do assistente, porque aqui cada pedido é uma pergunta sobre o email
 * de outra pessoa.
 *
 * Resposta: `{ ok: true, taken: boolean }`. Nunca diz **de quem** é a conta, nem
 * se tem perfil: isso é informação do Painel_Admin, não de quem está a registar.
 */
import { admin, readBody, send, missingEnvMessage } from "./_shared.js";
import { allowedOrigin, rateLimited } from "./_http.js";

/** Contas lidas por página em `listUsers`. */
const PAGINA = 1000;
/** Páginas no máximo: um limite explícito é melhor do que um ciclo sem fim. */
const PAGINAS_MAX = 10;

/** Perguntas por IP: 20 em 10 minutos. Chega para quem se engana a escrever. */
const LIMITE = 20;

/** Email normalizado, ou `""` se não tiver a forma de um email. */
function emailOf(raw) {
  const clean = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "Método não permitido." });
  if (!allowedOrigin(req)) return send(res, 403, { ok: false, error: "Origem não permitida." });
  if (rateLimited(req, { limit: LIMITE, bucket: "email-check" })) {
    return send(res, 429, { ok: false, code: "RATE_LIMITED", error: "Demasiadas tentativas. Tente de novo daqui a uns minutos." });
  }

  const db = admin();
  if (!db) return send(res, 500, { ok: false, code: "SERVER_NOT_CONFIGURED", error: missingEnvMessage() });

  const body = await readBody(req);
  const email = emailOf(body.email);
  if (!email) return send(res, 400, { ok: false, code: "BAD_EMAIL", error: "Indique um email válido." });

  try {
    for (let pagina = 1; pagina <= PAGINAS_MAX; pagina += 1) {
      const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: PAGINA });
      // Uma falha aqui não pode travar a criação de conta: quem chama segue em
      // frente e o registo continua a ser a última palavra.
      if (error) return send(res, 502, { ok: false, code: "LOOKUP_FAILED", error: error.message || "Não foi possível verificar o email." });
      const lote = data?.users ?? [];
      if (lote.some((u) => String(u.email || "").trim().toLowerCase() === email)) {
        return send(res, 200, { ok: true, taken: true });
      }
      if (lote.length < PAGINA) break;
    }
    return send(res, 200, { ok: true, taken: false });
  } catch (e) {
    console.error("email-check", e);
    return send(res, 500, { ok: false, code: "INTERNAL", error: "Não foi possível verificar o email." });
  }
}
