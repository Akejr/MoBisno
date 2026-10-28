/**
 * Contas, do lado do servidor: eliminar uma conta **a sério**, e encontrar as
 * que ficaram a meio.
 *
 * ## O defeito que isto corrige
 *
 * «Eliminar conta», no Painel_Admin, apagava as lojas e a linha de `profiles` —
 * do navegador, com a chave pública. A **identidade** vive em `auth.users`, que
 * só a service role pode tocar, e portanto sobrevivia a tudo. O resultado é um
 * email ocupado para sempre: um Dono cuja conta foi eliminada tentou criar outra
 * com o mesmo email e ouviu «já existe uma conta associada a este email». E se
 * tivesse entrado, entrava numa conta sem perfil.
 *
 * A caixa de confirmação prometia «apaga a conta … não é possível desfazer».
 * Apagava metade.
 *
 * ## Quem pode
 *
 * Só um administrador, provado pelo token da sessão (`Authorization: Bearer`) e
 * por `profiles.is_admin` lido com a service role. Nunca por um campo do corpo:
 * um endpoint que apaga identidades não pode aceitar «sou administrador» escrito
 * por quem o chama. Não se apaga a própria conta nem a de outro administrador.
 *
 * ## O que faz
 *
 *  - `GET /api/admin-account` — as contas que estão em `auth.users` sem perfil:
 *    os emails presos. É o que permite libertar o que foi eliminado antes desta
 *    função existir.
 *  - `POST /api/admin-account` com `{ ownerId }` — apaga as lojas, o perfil e a
 *    identidade, por esta ordem. A identidade é o último passo e é o que liberta
 *    o email; se falhar, a resposta **di-lo**, em vez de dizer que está feito.
 */
import { admin, readBody, send, missingEnvMessage, dbCause } from "./_shared.js";

/** Contas lidas por página em `listUsers`. */
const PAGINA = 1000;
/** Páginas no máximo: um limite explícito é melhor do que um ciclo sem fim. */
const PAGINAS_MAX = 10;

/**
 * Id do administrador que faz o pedido, ou `null`.
 *
 * Duas verificações, e as duas do lado do servidor: o token tem de ser válido
 * (`auth.getUser`) e a conta tem de ter `is_admin` em `profiles` — a coluna que
 * o gatilho `profiles_guard` (migração 0022) não deixa ninguém escrever pelo
 * navegador.
 */
async function adminFromRequest(db, req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data, error } = await db.auth.getUser(token);
    const id = data?.user?.id;
    if (error || !id) return null;
    const { data: perfil } = await db.from("profiles").select("is_admin").eq("id", id).maybeSingle();
    if (perfil?.is_admin !== true) return null;
    return String(id);
  } catch {
    return null;
  }
}

/** Contas em `auth.users` que já não têm perfil: os emails presos. */
async function listarOrfas(db, res) {
  const contas = [];
  for (let pagina = 1; pagina <= PAGINAS_MAX; pagina += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: PAGINA });
    if (error) {
      return send(res, 500, { ok: false, code: "LIST_FAILED", error: error.message || "Não foi possível ler as contas." });
    }
    const lote = data?.users ?? [];
    contas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  if (contas.length === 0) return send(res, 200, { ok: true, orphans: [] });

  const ids = contas.map((u) => String(u.id));
  const { data: perfis, error } = await db.from("profiles").select("id").in("id", ids);
  if (error) {
    return send(res, 500, { ok: false, code: "LIST_FAILED", error: `Não foi possível ler os perfis: ${dbCause(error)}` });
  }
  const comPerfil = new Set((perfis ?? []).map((p) => String(p.id)));
  const orphans = contas
    .filter((u) => !comPerfil.has(String(u.id)))
    .map((u) => ({ id: String(u.id), email: u.email ?? "", createdAt: u.created_at ?? null }));
  return send(res, 200, { ok: true, orphans });
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return send(res, 500, { ok: false, code: "SERVER_NOT_CONFIGURED", error: missingEnvMessage() });

  // A autorização é a primeira coisa: a listagem devolve emails de contas, e um
  // GET sem guarda era uma fuga de dados pessoais.
  const quem = await adminFromRequest(db, req);
  if (!quem) {
    return send(res, 403, { ok: false, code: "FORBIDDEN", error: "Só uma conta de administração pode fazer isto." });
  }

  if (req.method === "GET") return listarOrfas(db, res);
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "Método não permitido." });

  const body = await readBody(req);
  const ownerId = String(body.ownerId || "");
  if (!ownerId) return send(res, 400, { ok: false, code: "MISSING_OWNER", error: "Falta a conta a eliminar." });
  if (ownerId === quem) {
    return send(res, 400, { ok: false, code: "SELF", error: "Não é possível eliminar a sua própria conta." });
  }

  // Outro administrador não se elimina com um clique no painel.
  const { data: alvo } = await db.from("profiles").select("is_admin").eq("id", ownerId).maybeSingle();
  if (alvo?.is_admin === true) {
    return send(res, 400, { ok: false, code: "IS_ADMIN", error: "Contas de administração não se eliminam aqui." });
  }

  const { error: lojas } = await db.from("stores").delete().eq("owner_id", ownerId);
  if (lojas) {
    return send(res, 500, { ok: false, code: "STORES_FAILED", error: `Não foi possível apagar as lojas: ${dbCause(lojas)}` });
  }

  const { error: perfil } = await db.from("profiles").delete().eq("id", ownerId);
  if (perfil) {
    return send(res, 500, { ok: false, code: "PROFILE_FAILED", error: `Não foi possível apagar o perfil: ${dbCause(perfil)}` });
  }

  /*
   * A identidade. É este passo que liberta o email, e era este que faltava.
   * Falhar aqui deixa a conta sem perfil e com o email ocupado — exatamente o
   * estado que o «GET ?orphans=1» mostra —, por isso a mensagem diz o que
   * aconteceu em vez de um «não foi possível» genérico.
   */
  const { error: identidade } = await db.auth.admin.deleteUser(ownerId);
  if (identidade) {
    return send(res, 500, {
      ok: false, code: "AUTH_FAILED",
      error: `As lojas e o perfil foram apagados, mas o email continua ocupado: ${identidade.message || "falha ao apagar a identidade"}`,
    });
  }

  return send(res, 200, { ok: true });
}
