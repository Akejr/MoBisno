/**
 * Quem está a ver, do ponto de vista dos dados.
 *
 * Um módulo mínimo de propósito. A pergunta «esta sessão é de um
 * Administrador?» é feita em três sítios muito diferentes: o Painel_Admin
 * (antes de desenhar qualquer coisa), o Dashboard do Dono (para mostrar o
 * atalho) e a pré-visualização de uma loja (`web/lib/storeCache.ts`, para o
 * Administrador poder abrir a loja de um Dono por publicar).
 *
 * Vivia em `web/supabase/admin.ts`, com a camada de dados inteira da
 * Administração. Importá-la de `storeCache` levava essa camada para o pacote de
 * **todas as lojas publicadas**, que não tem nada a ver com administração. Daí
 * esta separação: a definição continua a ser uma só, e `admin.ts` reexporta-a.
 */
import { supabase } from "./client.js";

/**
 * O utilizador autenticado é administrador?
 *
 * Nunca é a única defesa: as políticas de leitura da base de dados (`is_admin()`
 * nas migrações) decidem o que a sessão consegue ler. Esta pergunta serve para o
 * ecrã não oferecer o que a base de dados vai recusar.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  // getSession() espera pela hidratação a partir do armazenamento local,
  // evitando falsos negativos logo após um refresh da página.
  const { data: sess } = await supabase.auth.getSession();
  const id = sess.session?.user?.id;
  if (!id) return false;
  const { data: row } = await supabase.from("profiles").select("is_admin").eq("id", id).maybeSingle();
  return row?.is_admin === true;
}
