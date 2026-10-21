/**
 * Guardas das migrações de segurança e do plano único
 * (`supabase/migrations/0022_security.sql` e
 * `0023_single_plan_and_company_verification.sql`).
 *
 * Todo o isolamento da MôBisno é feito na base de dados: a RLS diz que linhas
 * cada um toca, e os gatilhos destas duas migrações dizem que **colunas** o
 * navegador não pode escrever — `is_admin`, a data da subscrição, o
 * interruptor dos pagamentos digitais, o estado da verificação de empresa. Se
 * uma destas guardas desaparecer numa reescrita, nada falha: qualquer conta
 * passa a poder fazer-se administradora, oferecer-se a subscrição ou aprovar a
 * própria empresa.
 *
 * As migrações são aplicadas à mão no SQL Editor e os testes nunca se ligam a
 * uma base de dados, por isso as asserções são sobre o **texto** do SQL —
 * normalizado (sem comentários, espaços colapsados, minúsculas), para não
 * dependerem da formatação.
 *
 * ## A regra que mais facilmente se perde
 *
 * Os guardas comparam `current_user` com `anon`/`authenticated`. Isso só
 * funciona em funções **SECURITY INVOKER** (o predefinido): dentro de uma
 * função SECURITY DEFINER, `current_user` é sempre o dono da função, e o
 * guarda deixava passar toda a gente. Acrescentar `security definer` «para
 * resolver uma permissão» desligava a proteção em silêncio.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_STORE_PREFIX } from "../src/services/domains.js";
import {
  DOCUMENT_CONTENT_TYPE, DOCUMENT_MAX_BYTES, VERIFICATION_STATUSES,
} from "../src/services/paymentVerification.js";

const ROOT = join(__dirname, "..");

/** SQL sem comentários de linha, com os espaços colapsados e em minúsculas. */
function normalizado(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const M0022 = normalizado("supabase/migrations/0022_security.sql");
const M0023 = normalizado("supabase/migrations/0023_single_plan_and_company_verification.sql");
const AMBAS = `${M0022} ${M0023}`;

/**
 * Definição de `public.<nome>`: o corpo (entre os `$$`) e a definição completa,
 * do `create` até ao `;` que a fecha — os atributos (`security definer`,
 * `search_path`) podem vir antes **ou depois** do corpo.
 */
function funcao(sql: string, nome: string): { corpo: string; completa: string } {
  const inicio = sql.indexOf(`create or replace function public.${nome}(`);
  expect(inicio, `função public.${nome} não encontrada`).toBeGreaterThanOrEqual(0);
  const abre = sql.indexOf("$$", inicio);
  const fecha = sql.indexOf("$$", abre + 2);
  expect(abre, `corpo de ${nome} não encontrado`).toBeGreaterThan(inicio);
  expect(fecha, `fim de ${nome} não encontrado`).toBeGreaterThan(abre);
  const fim = sql.indexOf(";", fecha + 2);
  expect(fim, `fim da definição de ${nome} não encontrado`).toBeGreaterThan(fecha);
  return { corpo: sql.slice(abre + 2, fecha), completa: sql.slice(inicio, fim + 1) };
}

/** A definição sem o corpo: só o que configura a função. */
function atributos(sql: string, nome: string): string {
  const { corpo, completa } = funcao(sql, nome);
  return completa.replace(corpo, " ");
}

/** Texto a seguir a `marcador`, até ao `;` que fecha a instrução. */
function instrucao(sql: string, marcador: string): string {
  const i = sql.indexOf(marcador);
  expect(i, `instrução não encontrada: ${marcador}`).toBeGreaterThanOrEqual(0);
  return sql.slice(i, sql.indexOf(";", i) + 1);
}

describe("Os guardas são SECURITY INVOKER (o current_user tem de ser quem pede)", () => {
  const GUARDAS: readonly [string, string][] = [
    [M0022, "request_is_privileged"],
    [M0022, "profiles_guard"],
    [M0022, "stores_guard"],
    [M0022, "withdrawals_guard"],
    [M0023, "store_payments_guard"],
    [M0023, "store_payments_sync_store"],
  ];

  for (const [sql, nome] of GUARDAS) {
    it(`${nome} não é SECURITY DEFINER`, () => {
      expect(atributos(sql, nome)).not.toMatch(/security\s+definer/);
      // Nem um `alter function … security definer` mais à frente.
      expect(AMBAS).not.toMatch(new RegExp(`alter function public\\.${nome}\\b[^;]*security definer`));
    });
  }

  it("request_is_privileged: privilegiado é quem não é anon/authenticated, ou um administrador", () => {
    const { corpo } = funcao(M0022, "request_is_privileged");
    expect(corpo).toContain("current_user not in ('anon', 'authenticated') or public.is_admin()");
  });

  it("cada guarda deixa passar primeiro os pedidos privilegiados, e só esses", () => {
    for (const [sql, nome] of [[M0022, "profiles_guard"], [M0022, "stores_guard"], [M0022, "withdrawals_guard"], [M0023, "store_payments_guard"]] as const) {
      expect(funcao(sql, nome).corpo, nome)
        .toMatch(/^\s*(declare\b[\s\S]*?)?begin if public\.request_is_privileged\(\) then return new; end if;/);
    }
  });

  it("as funções SECURITY DEFINER que ficam fixam o search_path", () => {
    // Uma função SECURITY DEFINER sem `search_path` fixo pode ser desviada para
    // objetos de outro esquema com o nome certo.
    for (const [sql, nome] of [[M0022, "storage_owns_store_path"], [M0022, "validate_discount"], [M0023, "enforce_publish_requires_plan"]] as const) {
      expect(atributos(sql, nome), nome).toMatch(/security definer set search_path = public/);
    }
  });
});

describe("profiles_guard — ninguém se promove nem se oferece a subscrição", () => {
  const { corpo } = funcao(M0022, "profiles_guard");

  it("numa conta nova, is_admin é falso, o plano é o único e não há subscrição", () => {
    expect(corpo).toContain("new.is_admin := false;");
    expect(corpo).toContain("new.plan := 'pro';");
    expect(corpo).toContain("new.plan_expires_at := null;");
  });

  it("numa alteração, is_admin, plan e plan_expires_at ficam como estavam", () => {
    expect(corpo).toContain("new.is_admin := old.is_admin;");
    expect(corpo).toContain("new.plan := old.plan;");
    expect(corpo).toContain("new.plan_expires_at := old.plan_expires_at;");
  });

  it("corre antes de qualquer insert ou update em profiles", () => {
    expect(M0022).toContain("drop trigger if exists profiles_guard on public.profiles;");
    expect(M0022).toContain(
      "create trigger profiles_guard before insert or update on public.profiles for each row execute function public.profiles_guard();",
    );
  });
});

describe("stores_guard — prefixo reservado, marcas internas e pagamentos digitais", () => {
  const { corpo } = funcao(M0022, "stores_guard");

  it(`reserva o prefixo «${MODEL_STORE_PREFIX}» das lojas-modelo (o mesmo de src/services/domains.ts)`, () => {
    expect(corpo).toContain(`new.identifier ilike '${MODEL_STORE_PREFIX}%'`);
    expect(corpo).toContain("raise exception 'identifier_reserved'");
    // Só ao criar ou ao mudar o identificador: uma loja-modelo antiga continua
    // a poder ser editada pelo administrador (que é privilegiado) e as outras
    // não são afetadas.
    expect(corpo).toContain("tg_op = 'insert' or old.identifier is distinct from new.identifier");
  });

  it("o Dono não liga os pagamentos digitais — pode desligá-los, nunca ligá-los", () => {
    expect(corpo).toContain("new.digital_payments := false;");
    expect(corpo).toMatch(/if new\.digital_payments and not old\.digital_payments then new\.digital_payments := old\.digital_payments; end if;/);
  });

  it("o Dono não escreve créditos de SMS nem a marca __template", () => {
    expect(corpo).toContain("new.sms_credits := 0;");
    expect(corpo).toContain("new.sms_credits := old.sms_credits;");
    expect(corpo).toContain("- '__template'");
  });

  it("a coluna digital_payments nasce desligada", () => {
    expect(M0022).toContain("add column if not exists digital_payments boolean not null default false");
  });

  it("corre antes de qualquer insert ou update em stores", () => {
    expect(M0022).toContain(
      "create trigger stores_guard before insert or update on public.stores for each row execute function public.stores_guard();",
    );
  });
});

describe("Códigos de desconto — validados um a um, sem listagem pública", () => {
  it("a política de leitura pública de discount_codes é largada e não volta", () => {
    expect(M0022).toContain("drop policy if exists discount_codes_public_read on public.discount_codes;");
    expect(AMBAS).not.toMatch(/create policy "?discount_codes_public_read/);
  });

  it("validate_discount pode ser chamada por anon e authenticated, e por mais ninguém", () => {
    expect(M0022).toContain("revoke all on function public.validate_discount(uuid, text) from public;");
    expect(M0022).toContain("grant execute on function public.validate_discount(uuid, text) to anon, authenticated;");
  });

  it("devolve no máximo um código, e nenhum se estiver inativo, caducado ou esgotado", () => {
    const { corpo } = funcao(M0022, "validate_discount");
    expect(corpo).toContain("d.code = upper(btrim(coalesce(p_code, '')))");
    expect(corpo).toContain("and d.active");
    expect(corpo).toContain("(d.expires_at is null or d.expires_at > now())");
    expect(corpo).toContain("(d.max_uses is null or d.uses < d.max_uses)");
    expect(corpo).toContain("limit 1");
  });
});

describe("Levantamentos — nunca acima do saldo", () => {
  const { corpo } = funcao(M0022, "withdrawals_guard");

  it("o saldo é o recebido em encomendas pagas menos o já pedido (rejeitados à parte)", () => {
    expect(corpo).toContain("select coalesce(sum(o.net), 0) into recebido from public.orders o where o.store_id = new.store_id and o.status = 'paid';");
    expect(corpo).toContain("select coalesce(sum(w.amount), 0) into comprometido from public.withdrawals w where w.store_id = new.store_id and w.status <> 'rejected';");
  });

  it("recusa montantes nulos, negativos ou acima do disponível", () => {
    expect(corpo).toContain("if new.amount <= 0 or new.amount > (recebido - comprometido) + 0.005 then");
    expect(corpo).toContain("raise exception 'withdrawal_above_balance'");
  });

  it("o navegador não escolhe o estado do levantamento", () => {
    expect(corpo).toContain("new.status := 'requested';");
    expect(corpo).toContain("new.processed_at := null;");
  });

  it("corre antes de cada pedido de levantamento", () => {
    expect(M0022).toContain(
      "create trigger withdrawals_guard before insert on public.withdrawals for each row execute function public.withdrawals_guard();",
    );
  });
});

describe("Avaliações — entram por aprovar", () => {
  it("approved passa a ser falso por omissão", () => {
    expect(M0022).toContain("alter table public.reviews alter column approved set default false;");
  });

  it("uma avaliação pública só entra com approved = false", () => {
    const politica = instrucao(M0022, "create policy reviews_public_insert on public.reviews");
    expect(politica).toContain("for insert with check ( approved = false");
  });
});

describe("Bucket company-documents — privado, e sem substituição de ficheiros", () => {
  const bucket = instrucao(M0023, "insert into storage.buckets");

  it("é criado privado, e volta a privado se já existir", () => {
    expect(bucket).toContain("values ('company-documents', 'company-documents', false,");
    expect(bucket).toContain("on conflict (id) do update set public = false");
  });

  it("aceita o mesmo tamanho e os mesmos formatos que o formulário (src/services/paymentVerification.ts)", () => {
    expect(bucket).toContain(`, ${DOCUMENT_MAX_BYTES},`);
    const tipos = Object.values(DOCUMENT_CONTENT_TYPE).map((t) => `'${t}'`).join(", ");
    expect(bucket).toContain(`array[${tipos}]`);
  });

  it("não tem política de update: um documento aprovado não pode ser trocado mantendo o nome", () => {
    const politicas = AMBAS.match(/create policy "?[^"]*"? on storage\.objects for \w+[^;]*;/g) ?? [];
    const doBucket = politicas.filter((p) => p.includes("'company-documents'"));
    expect(doBucket.length).toBe(3);
    for (const p of doBucket) expect(p, p).not.toMatch(/for update/);
    expect(doBucket.map((p) => p.match(/for (\w+)/)?.[1]).sort()).toEqual(["delete", "insert", "select"]);
  });

  it("só o administrador apaga documentos", () => {
    const apagar = instrucao(M0023, `create policy "company-documents admin delete"`);
    expect(apagar).toContain("using (bucket_id = 'company-documents' and public.is_admin())");
  });
});

describe("Verificação de empresa em store_payments", () => {
  it("os estados válidos são os do domínio", () => {
    const estados = VERIFICATION_STATUSES.map((s) => `'${s}'`).join(", ");
    expect(M0023).toContain(`check (verification_status in (${estados}))`);
  });

  it("store_payments_submission_complete: um pedido em análise ou aprovado tem tudo preenchido", () => {
    const restricao = instrucao(M0023, "add constraint store_payments_submission_complete check");
    expect(restricao).toContain("verification_status in ('none', 'rejected') or (");
    for (const coluna of ["company_name", "company_nif", "bank_name", "beneficiary_name", "iban"]) {
      expect(restricao, coluna).toContain(`coalesce(btrim(${coluna}), '') <> ''`);
    }
    expect(restricao).toContain("doc_matricula is not null");
    expect(restricao).toContain("doc_certidao is not null");
  });

  it("o Dono não se aprova: as marcas da revisão são do administrador", () => {
    const { corpo } = funcao(M0023, "store_payments_guard");
    expect(corpo).toContain("new.reviewed_at := old.reviewed_at;");
    expect(corpo).toContain("new.reviewed_by := old.reviewed_by;");
    expect(corpo).toContain("new.verification_status := old.verification_status;");
    // Ao criar, só «por enviar» ou «em análise».
    expect(corpo).toContain("if new.verification_status is distinct from 'pending' then new.verification_status := 'none';");
  });

  it("mudar dados já aprovados devolve o pedido a «em análise»", () => {
    const { corpo } = funcao(M0023, "store_payments_guard");
    expect(corpo).toContain("elsif dados_mudaram and old.verification_status in ('approved', 'pending') then new.verification_status := 'pending';");
    for (const coluna of ["company_name", "company_nif", "doc_matricula", "doc_certidao", "bank_name", "beneficiary_name", "iban"]) {
      expect(corpo, coluna).toContain(`new.${coluna}`);
    }
  });

  it("digital_payments acompanha a aprovação, e uma linha apagada desliga-o", () => {
    const { corpo } = funcao(M0023, "store_payments_sync_store");
    expect(corpo).toContain("set digital_payments = (new.verification_status = 'approved')");
    expect(corpo).toContain("update public.stores set digital_payments = false where id = old.store_id");
  });

  it("as lojas que tinham a MoMenu ligada não ficam aprovadas por herança", () => {
    expect(M0023).toContain("update public.stores s set digital_payments = false where s.digital_payments and not exists");
  });

  it("a chave da MoMenu e o interruptor que o Dono ligava saem", () => {
    expect(M0023).toContain("alter table public.store_payments drop column if exists momenu_api_key;");
    expect(M0023).toContain("alter table public.store_payments drop column if exists online_enabled;");
  });
});

describe("Plano único na base de dados", () => {
  it("publicar exige só conta ativa — sem contar lojas nem lugares pagos", () => {
    const { corpo } = funcao(M0023, "enforce_publish_requires_plan");
    expect(corpo).toContain("not public.account_active(new.owner_id)");
    expect(corpo).not.toMatch(/published_store_count|plan_stores|store_slot/);
    expect(M0023).toContain("drop function if exists public.published_store_count(uuid, uuid);");
  });

  it("os lugares pagos da 0020 saem", () => {
    expect(M0023).toContain("alter table public.profiles drop column if exists plan_stores;");
    expect(M0023).toContain("alter table public.plan_payments drop column if exists stores;");
  });

  it("um pagamento de plano ativa-se uma vez (activated_at), e os já pagos contam como ativados", () => {
    expect(M0023).toContain("alter table public.plan_payments add column if not exists activated_at timestamptz;");
    expect(M0023).toContain("update public.plan_payments set activated_at = coalesce(paid_at, now()) where status = 'paid' and activated_at is null;");
  });
});

describe("As duas migrações podem correr outra vez (idempotência)", () => {
  /** Nomes criados por `create <tipo> <nome>` que têm de ser largados antes. */
  function criados(sql: string, tipo: "policy" | "trigger"): string[] {
    const re = tipo === "policy" ? /create policy ("[^"]+"|[\w.]+)/g : /create trigger ([\w.]+)/g;
    return [...sql.matchAll(re)].map((m) => m[1] ?? "");
  }

  for (const [nome, sql] of [["0022", M0022], ["0023", M0023]] as const) {
    it(`${nome}: cada política e cada gatilho criados são largados antes (drop … if exists)`, () => {
      for (const p of criados(sql, "policy")) {
        const drop = sql.indexOf(`drop policy if exists ${p} `);
        expect(drop, `política ${p} sem drop if exists`).toBeGreaterThanOrEqual(0);
        expect(drop, `drop da política ${p} depois do create`).toBeLessThan(sql.indexOf(`create policy ${p} `));
      }
      for (const t of criados(sql, "trigger")) {
        expect(sql, `gatilho ${t} sem drop if exists`).toContain(`drop trigger if exists ${t} `);
      }
    });

    it(`${nome}: cada restrição acrescentada é largada antes`, () => {
      for (const m of sql.matchAll(/add constraint (\w+)/g)) {
        expect(sql, `restrição ${m[1]} sem drop if exists`).toContain(`drop constraint if exists ${m[1]};`);
      }
    });
  }
});
