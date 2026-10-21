/**
 * A frase que se mostra quando uma **leitura** da base de dados falha.
 *
 * ## Porque é que isto existe
 *
 * O Painel_Admin dizia «Ainda não há lojas» a um Administrador que tinha duas
 * lojas criadas. A lista estava vazia porque a leitura tinha falhado: o `select`
 * pedia `stores.digital_payments`, uma coluna que a migração 0022 cria e que
 * ainda não estava aplicada. O erro ia para a consola, a função devolvia `[]`, e
 * o painel apresentava esse `[]` com o estado vazio normal.
 *
 * Uma leitura falhada e uma tabela vazia são coisas diferentes e **não podem ter
 * o mesmo aspeto**. Zero lojas é informação; zero lojas por engano é uma mentira
 * que custa horas a perceber, porque parece um ecrã normal.
 *
 * Este módulo é puro de propósito: a frase é a parte que tem de estar certa, e
 * assim pode ser verificada sem base de dados (`tests/dbErrors.test.ts`).
 */

/** Erro de leitura, na forma mínima que o PostgREST devolve. */
export interface DbFailure {
  readonly code?: string | null;
  readonly message?: string | null;
  readonly details?: string | null;
  readonly hint?: string | null;
}

/** `undefined_column` do PostgreSQL: o código pediu uma coluna que não existe. */
const UNDEFINED_COLUMN = "42703";
/** `undefined_table`: a tabela inteira não existe. */
const UNDEFINED_TABLE = "42P01";
/** `undefined_function`: uma RPC que o código chama e a base de dados não tem. */
const UNDEFINED_FUNCTION = "42883";

/** Texto do erro, numa linha, para procurar marcadores. */
function textOf(error: DbFailure | null | undefined): string {
  if (!error) return "";
  return [error.message, error.details, error.hint].filter((v) => typeof v === "string").join(" ");
}

/**
 * O que a base de dados não tem, quando o erro o diz pelo nome.
 *
 * O PostgREST escreve `column stores.digital_payments does not exist` ou
 * `relation "public.whatsapp_orders" does not exist`. É esse nome que torna a
 * frase útil: sem ele, o Administrador fica a saber que algo falhou e mais nada.
 */
export function missingObjectOf(error: DbFailure | null | undefined): string | null {
  const texto = textOf(error);
  const coluna = /column\s+"?([\w.]+)"?\s+(?:of\s+relation\s+"?([\w.]+)"?\s+)?does not exist/i.exec(texto);
  if (coluna) {
    const nome = coluna[1] ?? "";
    const tabela = coluna[2] ?? "";
    return tabela && !nome.includes(".") ? `${tabela}.${nome}` : nome;
  }
  const relacao = /relation\s+"?([\w.]+)"?\s+does not exist/i.exec(texto);
  if (relacao) return relacao[1] ?? null;
  const funcao = /function\s+([\w.]+)\(/i.exec(texto);
  if (funcao && isSchemaOutOfDate(error)) return funcao[1] ?? null;
  return null;
}

/**
 * A base de dados está atrás do código?
 *
 * É o caso de uma migração em falta, e é o único em que a frase pode dizer ao
 * Administrador exactamente o que fazer.
 */
export function isSchemaOutOfDate(error: DbFailure | null | undefined): boolean {
  if (!error) return false;
  const codigo = typeof error.code === "string" ? error.code : "";
  if (codigo === UNDEFINED_COLUMN || codigo === UNDEFINED_TABLE || codigo === UNDEFINED_FUNCTION) return true;
  // Sem código: o PostgREST nem sempre o repassa (e o cliente devolve-o
  // vazio em alguns erros de 400). A mensagem basta para reconhecer o caso.
  return /does not exist/i.test(textOf(error));
}

/** Sessão sem permissão para ler, em vez de esquema desalinhado. */
function isDenied(error: DbFailure | null | undefined): boolean {
  if (!error) return false;
  const codigo = typeof error.code === "string" ? error.code : "";
  // `42501` é `insufficient_privilege`; `PGRST301`, um JWT que não serve.
  return codigo === "42501" || codigo.startsWith("PGRST30") || /permission denied|JWT/i.test(textOf(error));
}

/**
 * Frase para o ecrã, a partir do que falhou.
 *
 * `what` é o nome do que se estava a ler, em português e como o Administrador o
 * veria («as lojas», «as contas»): entra na frase.
 */
export function readFailureMessage(what: string, error: DbFailure | null | undefined): string {
  const alvo = what.trim() || "os dados";
  if (isSchemaOutOfDate(error)) {
    const falta = missingObjectOf(error);
    const nomeado = falta ? `A base de dados não tem «${falta}».` : "A base de dados não tem uma coluna que o painel precisa de ler.";
    return `Não foi possível ler ${alvo}. ${nomeado} Falta aplicar as migrações mais recentes de supabase/migrations no SQL Editor do Supabase.`;
  }
  if (isDenied(error)) {
    return `Não foi possível ler ${alvo}: a base de dados recusou o acesso. Confirme que esta sessão é de administrador e que a migração 0011 está aplicada.`;
  }
  const detalhe = typeof error?.message === "string" && error.message.trim() ? ` (${error.message.trim()})` : "";
  return `Não foi possível ler ${alvo}${detalhe}. Verifique a ligação e tente de novo.`;
}
