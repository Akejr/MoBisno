/**
 * A frase de uma leitura falhada (`src/services/dbErrors.ts`).
 *
 * ## O defeito que originou o módulo
 *
 * O Painel_Admin dizia «Ainda não há lojas» a um Administrador que tinha duas
 * lojas criadas. A leitura tinha falhado: o `select` pedia
 * `stores.digital_payments`, coluna da migração 0022, que não estava aplicada.
 * O erro ia para a consola, a função devolvia `[]`, e o painel desenhava esse
 * `[]` com o estado vazio normal.
 *
 * Por isso as asserções não são sobre o texto bonito: são sobre as três coisas
 * que a frase tem de garantir. Nomear o que falta, apontar para as migrações
 * quando é esquema desalinhado, e nunca descrever uma falha como ausência de
 * dados.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readFailureMessage, missingObjectOf, isSchemaOutOfDate, type DbFailure,
} from "../src/services/dbErrors.js";

/** O erro exacto que o PostgREST devolveu no defeito original. */
const COLUNA_EM_FALTA: DbFailure = {
  code: "42703",
  message: "column stores.digital_payments does not exist",
  details: null,
  hint: null,
};

/** Tabela inteira em falta: a `whatsapp_orders` antes da migração 0024. */
const TABELA_EM_FALTA: DbFailure = {
  code: "42P01",
  message: 'relation "public.whatsapp_orders" does not exist',
};

describe("esquema desalinhado — a frase diz o que fazer", () => {
  it("nomeia a coluna que falta", () => {
    const frase = readFailureMessage("as lojas", COLUNA_EM_FALTA);
    expect(frase).toContain("stores.digital_payments");
    expect(frase).toContain("as lojas");
  });

  it("manda aplicar as migrações, que é o passo que resolve", () => {
    for (const erro of [COLUNA_EM_FALTA, TABELA_EM_FALTA]) {
      expect(readFailureMessage("as lojas", erro)).toContain("supabase/migrations");
    }
  });

  it("nomeia a tabela que falta", () => {
    expect(missingObjectOf(TABELA_EM_FALTA)).toBe("public.whatsapp_orders");
  });

  it("reconhece o caso pelo código e também só pela mensagem", () => {
    // O cliente não repassa sempre o `code`; a mensagem tem de bastar.
    expect(isSchemaOutOfDate(COLUNA_EM_FALTA)).toBe(true);
    expect(isSchemaOutOfDate({ message: "column stores.x does not exist" })).toBe(true);
    expect(isSchemaOutOfDate({ code: "42P01" })).toBe(true);
  });

  it("a coluna qualificada pela relação sai com a tabela à frente", () => {
    // A outra forma da mensagem do Postgres.
    const erro: DbFailure = { code: "42703", message: 'column "notified_at" of relation "orders" does not exist' };
    expect(missingObjectOf(erro)).toBe("orders.notified_at");
  });
});

describe("acesso recusado — não se confunde com esquema em falta", () => {
  const SEM_PERMISSAO: DbFailure = { code: "42501", message: "permission denied for table stores" };
  const JWT_INVALIDO: DbFailure = { code: "PGRST301", message: "JWT expired" };

  it("fala de acesso e da migração da administração, não das migrações todas", () => {
    for (const erro of [SEM_PERMISSAO, JWT_INVALIDO]) {
      const frase = readFailureMessage("as contas", erro);
      expect(frase).toMatch(/recusou o acesso/);
      expect(frase).toContain("0011");
      expect(frase, "a frase manda aplicar migrações num erro de permissão").not.toContain("supabase/migrations");
    }
  });

  it("não é tratado como esquema desalinhado", () => {
    expect(isSchemaOutOfDate(SEM_PERMISSAO)).toBe(false);
    expect(isSchemaOutOfDate(JWT_INVALIDO)).toBe(false);
  });
});

describe("qualquer outra falha — ainda assim uma falha, nunca um vazio", () => {
  it("a frase diz que não foi possível ler, e o que se estava a ler", () => {
    const frase = readFailureMessage("os levantamentos", { message: "Failed to fetch" });
    expect(frase).toContain("Não foi possível ler os levantamentos");
    expect(frase).toContain("Failed to fetch");
  });

  it("aguenta um erro sem forma nenhuma", () => {
    for (const erro of [null, undefined, {}, { code: null, message: null }]) {
      const frase = readFailureMessage("as lojas", erro as DbFailure | null);
      expect(frase).toContain("Não foi possível ler as lojas");
      expect(frase, "a frase contém «undefined»").not.toContain("undefined");
      expect(frase, "a frase contém «null»").not.toContain("null");
    }
  });

  it("sem nome do que se lia, a frase continua a ser uma frase", () => {
    expect(readFailureMessage("", COLUNA_EM_FALTA)).toContain("os dados");
  });

  it("nenhuma frase sugere que não há dados", () => {
    // É a confusão que o módulo existe para acabar: «não há lojas» é uma
    // conclusão, e uma leitura falhada não autoriza conclusão nenhuma.
    const erros: (DbFailure | null)[] = [COLUNA_EM_FALTA, TABELA_EM_FALTA, { code: "42501" }, { message: "offline" }, null];
    for (const erro of erros) {
      const frase = readFailureMessage("as lojas", erro).toLowerCase();
      for (const proibido of ["não há", "ainda não", "nenhuma loja", "vazio", "vazia"]) {
        expect(frase, `a frase sugere ausência de dados: ${proibido}`).not.toContain(proibido);
      }
    }
  });
});

describe("o painel de administração não engole leituras falhadas", () => {
  const ADMIN = readFileSync(join(__dirname, "../web/supabase/admin.ts"), "utf8");

  it("nenhuma leitura devolve uma lista vazia depois de um erro", () => {
    // O padrão do defeito: registar na consola e seguir com `data ?? []`.
    expect(ADMIN).toContain("function readOrThrow(");
    expect(ADMIN).not.toMatch(/if \((?:error|storesError|storeError)\) console\.error\("(?:list|get|profilesMap)/);
    expect((ADMIN.match(/readOrThrow\("/g) ?? []).length).toBeGreaterThanOrEqual(11);
  });

  it("a frase que o painel mostra é a de readFailureMessage", () => {
    expect(ADMIN).toContain("throw new Error(readFailureMessage(what, error))");
    const PAINEL = readFileSync(join(__dirname, "../web/views/adminPanel.ts"), "utf8");
    expect(PAINEL).toContain("errorState(err instanceof Error ? err.message");
  });
});
