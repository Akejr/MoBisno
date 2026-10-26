/**
 * Acesso de dados do Painel de Administração (/adminPainel).
 *
 * Usa o cliente Supabase autenticado do próprio Administrador — **não há chave
 * de serviço no navegador**. O acesso a todas as tabelas vem das políticas RLS
 * de admin (`public.is_admin()`, migração 0011), e as escritas passam pelos
 * guardas das migrações 0022 e 0023: `request_is_privileged()` deixa o
 * Administrador mudar `plan_expires_at` e decidir as verificações de empresa;
 * ninguém mais o consegue, nem pelo navegador.
 *
 * Todas as funções pressupõem que o utilizador atual é Administrador — a vista
 * só as chama depois de `isCurrentUserAdmin()` o confirmar. Se não for, a RLS
 * devolve zero linhas: as leituras saem vazias e as escritas falham.
 *
 * **Escritas verificadas.** Um `update` ou `delete` que a RLS não cobre não dá
 * erro nenhum — afeta zero linhas. Por isso cada escrita pede as linhas de volta
 * (`.select(...)`) e só conta como feita se a linha voltou, com o valor pedido.
 *
 * As regras — o que gravar ao aprovar, ao rejeitar, ao ativar e ao desativar —
 * são puras e vivem em `src/services/adminMetrics.ts`, onde são testadas. Aqui
 * só se lê e se grava.
 */
import { supabase } from "./client.js";
import { toVerification, type PaymentVerification } from "./payments.js";
import { resolveBilling } from "../../src/services/billing.js";
import { orderEffectiveStatus } from "../../src/services/payments.js";
import {
  activationPatch, approvalPatch, deactivationPatch, isLojaModelo, rejectionPatch,
} from "../../src/services/adminMetrics.js";
import { readFailureMessage } from "../../src/services/dbErrors.js";

/* ================================== Tipos ================================== */

/** Resultado de uma ação do Administrador: feita, ou a frase do erro. */
export type AdminResult = { ok: true } | { ok: false; message: string };

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  /** Fim do período de subscrição pago (ISO) ou null. */
  planExpiresAt: string | null;
}

export interface AdminStore {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  state: string;
  subdomain: string;
  identifier: string;
  templateId: string;
  /** Loja-modelo (demonstração da galeria): `customization.__template` ou prefixo `modelo-`. */
  isModel: boolean;
  /** O dono é Administrador: publica sem subscrição. */
  ownerIsAdmin: boolean;
  /** Fim da subscrição DESTA loja (ISO) ou `null`. Cada loja tem a sua (migração 0025). */
  planExpiresAt: string | null;
  /** A loja tem subscrição em vigor (ou o dono é Administrador). Sem ela, publicada está fora do ar. */
  planActive: boolean;
  /** `stores.digital_payments`: Multicaixa Express e Referência Bancária ligados (só a aprovação os liga). */
  digitalPayments: boolean;
  createdAt: string;
}

export interface AdminWithdrawal {
  id: string;
  storeId: string;
  storeName: string;
  ownerEmail: string;
  amount: number;
  status: "requested" | "approved" | "paid" | "rejected";
  bankName: string | null;
  beneficiaryName: string | null;
  iban: string | null;
  createdAt: string;
  processedAt: string | null;
}

/** Estado de um pagamento, com a referência caducada já resolvida. */
export type PaymentStatusView = "open" | "paid" | "failed" | "cancelled" | "expired";

/** Pagamento de subscrição (`plan_payments`). */
export interface AdminPlanPayment {
  id: string;
  /** Sempre `"plan"`: é a única receita da Plataforma (ver `adminMetrics`). */
  service: "plan";
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  amount: number;
  /** `mcx` (Multicaixa Express) ou `reference` (Referência Bancária). */
  method: string;
  status: PaymentStatusView;
  createdAt: string;
  paidAt: string | null;
  activatedAt: string | null;
}

/** Encomenda de uma loja (`orders`): dinheiro dos Donos, não da Plataforma. */
export interface AdminOrder {
  id: string;
  storeId: string;
  storeName: string;
  method: string;
  status: PaymentStatusView;
  amount: number;
  subtotal: number | null;
  deliveryFee: number;
  discountAmount: number;
  customerName: string;
  createdAt: string;
  paidAt: string | null;
}

/** Pedido de verificação de empresa, com a loja e o dono. */
export interface AdminVerification extends PaymentVerification {
  storeId: string;
  storeName: string;
  storeIdentifier: string;
  ownerId: string;
  ownerEmail: string;
  /** `stores.digital_payments`, o que o checkout lê. O gatilho da migração 0023 acompanha a aprovação. */
  digitalPayments: boolean;
  /** Administrador que decidiu (id e email), quando já houve decisão. */
  reviewedBy: string | null;
  reviewedByEmail: string;
}

/** O que está à espera de uma decisão (contadores da navegação). */
export interface AdminPendingCounts {
  verifications: number;
  withdrawals: number;
}

/** Como é que uma Loja entrou no resultado de `adminStoresUsingTemplate`. */
export type TemplateMatch = "templateId" | "basedOn";

/**
 * Uma Loja que usa um dos Modelo_De_Loja verificados. Só leitura: esta forma
 * existe para ser apresentada ao Administrador antes de qualquer eliminação.
 */
export interface AdminTemplateUser {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  state: string;
  identifier: string;
  templateId: string;
  /** Valor de `customization.__basedOn`, ou null quando ausente/não textual. */
  basedOn: string | null;
  /** Loja_Modelo do Administrador (tem `customization.__template`). */
  isModel: boolean;
  /** Por que critérios foi encontrada (pode ser pelos dois). */
  matchedBy: TemplateMatch[];
  createdAt: string;
}

/**
 * Resultado da verificação de uso de Modelo_De_Loja, partido nos dois grupos
 * que a decisão de eliminação precisa de distinguir (R1.7, R1.8).
 */
export interface AdminTemplateUsage {
  /** Identificadores efetivamente verificados (normalizados, sem vazios). */
  ids: string[];
  /** Loja_Modelo — as demonstrações do Administrador. */
  models: AdminTemplateUser[];
  /** Lojas de cliente. Grupo não vazio ⇒ a eliminação não avança (R1.8). */
  customerStores: AdminTemplateUser[];
}

/* ================================= Utilitários ================================= */

/** Erro do PostgREST, na forma mínima que aqui se lê. */
interface DbError {
  message?: string;
  code?: string;
  details?: string;
}

/** Frase genérica de uma escrita que falhou. */
const WRITE_FAILED = "Não foi possível gravar a alteração. Tente de novo.";

/** Frase de uma escrita que não deu erro mas não chegou a mudar a linha (RLS ou gatilho). */
const WRITE_REFUSED = "A base de dados não aceitou a alteração. Confirme que a sessão é de administrador e que as migrações estão aplicadas.";

/** O erro menciona este marcador (nome de restrição, exceção de um gatilho)? */
function errorMentions(error: DbError, marker: string): boolean {
  return `${error.message ?? ""} ${error.details ?? ""}`.includes(marker);
}

/**
 * Uma leitura que falha **lança**, em vez de devolver lista vazia.
 *
 * Era isto que faltava. O painel dizia «Ainda não há lojas» a um Administrador
 * com duas lojas criadas: o `select` pedia `stores.digital_payments`, coluna da
 * migração 0022 que não estava aplicada, o erro ia para a consola e o `[]` que
 * sobrava era desenhado como um estado vazio normal. Uma falha de leitura e uma
 * tabela vazia não podem ter o mesmo aspeto.
 *
 * `renderAdminPanel` apanha o erro e mostra a frase de `readFailureMessage`, que
 * nomeia o que falta à base de dados.
 */
function readOrThrow(what: string, error: DbError | null): void {
  if (!error) return;
  console.error(`admin: leitura de ${what}`, error);
  throw new Error(readFailureMessage(what, error));
}

/** Id do utilizador autenticado: o Administrador que assina as decisões. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** O utilizador autenticado é administrador? */
export async function isCurrentUserAdmin(): Promise<boolean> {
  // getSession() espera pela hidratação a partir do armazenamento local,
  // evitando falsos negativos logo após um refresh da página.
  const { data: sess } = await supabase.auth.getSession();
  const id = sess.session?.user?.id;
  if (!id) return false;
  const { data: row } = await supabase.from("profiles").select("is_admin").eq("id", id).maybeSingle();
  return row?.is_admin === true;
}

interface ProfileInfo {
  email: string;
  name: string;
  /** A conta é de Administrador: as lojas dela publicam sem subscrição. */
  isAdmin: boolean;
}

/** Quanto tempo uma leitura de `profiles` serve as leituras que chegam juntas. */
const PROFILES_TTL_MS = 2_000;
let profilesCache: { at: number; promise: Promise<Map<string, ProfileInfo>> } | null = null;

/**
 * Email, nome e estado da subscrição de cada conta, por id.
 *
 * A Visão geral lê lojas, levantamentos, subscrições e verificações ao mesmo
 * tempo, e todas precisam dos donos: a mesma leitura serve as que chegam no
 * mesmo instante, em vez de quatro iguais. Qualquer escrita em `profiles` a
 * invalida ({@link forgetProfiles}).
 */
function profilesMap(): Promise<Map<string, ProfileInfo>> {
  if (profilesCache && Date.now() - profilesCache.at < PROFILES_TTL_MS) return profilesCache.promise;
  const promise = (async () => {
    const { data, error } = await supabase.from("profiles").select("id, email, name, is_admin");
    readOrThrow("as contas", error);
    const m = new Map<string, ProfileInfo>();
    for (const p of data ?? []) {
      m.set(String(p.id), {
        email: p.email ?? "",
        name: p.name ?? "",
        isAdmin: p.is_admin === true,
      });
    }
    return m;
  })();
  profilesCache = { at: Date.now(), promise };
  return promise;
}

/** Esquece a última leitura de `profiles` (depois de uma escrita). */
function forgetProfiles(): void {
  profilesCache = null;
}

/** Número de uma coluna `numeric` (chega em texto do Supabase), ou 0. */
function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Estado de um pagamento, com a referência caducada resolvida (`orderEffectiveStatus`). */
function paymentStatus(status: unknown, method: unknown, dueDate: unknown): PaymentStatusView {
  const s = orderEffectiveStatus({
    status: String(status ?? "open"),
    method: String(method ?? ""),
    dueDate: typeof dueDate === "string" ? dueDate : null,
  });
  return s === "paid" || s === "failed" || s === "cancelled" || s === "expired" ? s : "open";
}

/* ================================= Contas ================================= */

/** Todas as contas, as mais recentes primeiro. */
export async function listAccounts(): Promise<AdminAccount[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, is_admin, created_at, plan_expires_at")
    .order("created_at", { ascending: false });
  readOrThrow("as contas", error);
  return (data ?? []).map((p) => ({
    id: String(p.id),
    email: p.email ?? "",
    name: p.name ?? "",
    isAdmin: p.is_admin === true,
    createdAt: p.created_at ?? "",
    planExpiresAt: p.plan_expires_at ?? null,
  }));
}

/** Lê o fim da subscrição de uma loja e se o dono dela é administrador. */
async function readStorePlan(storeId: string): Promise<{ planExpiresAt: string | null; isAdmin: boolean } | null> {
  const { data, error } = await supabase.from("stores").select("plan_expires_at, owner_id").eq("id", storeId).maybeSingle();
  if (error) console.error("readStorePlan", error);
  if (!data) return null;
  const owner = (await profilesMap()).get(String(data.owner_id ?? ""));
  return { planExpiresAt: data.plan_expires_at ?? null, isAdmin: owner?.isAdmin === true };
}

/** Grava `stores.plan_expires_at` e confirma que ficou gravado o valor pedido. */
async function writeStorePlan(storeId: string, planExpiresAt: string): Promise<{ ok: true; planExpiresAt: string } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("stores")
    .update({ plan_expires_at: planExpiresAt })
    .eq("id", storeId)
    .select("plan_expires_at");
  if (error) {
    console.error("writeStorePlan", error);
    return { ok: false, message: WRITE_FAILED };
  }
  const saved = (data ?? [])[0]?.plan_expires_at as string | null | undefined;
  // O guarda `stores_plan_guard` repõe o valor antigo, em silêncio, a quem não
  // é administrador: a linha volta, mas com a data de antes.
  if (!saved || Date.parse(saved) !== Date.parse(planExpiresAt)) return { ok: false, message: WRITE_REFUSED };
  return { ok: true, planExpiresAt: saved };
}

/**
 * Ativa (ou prolonga) a subscrição de UMA loja por `months` meses, à mão. Cada
 * loja tem a sua (migração 0025).
 *
 * Lê o fim da subscrição **no momento da ação** e aplica `activationPatch`
 * (a regra de `planActivationPatch`): os meses somam-se ao fim do período em
 * curso, ou contam a partir de agora se já não houver. Substituiu a concessão de
 * cem anos, que dava subscrições vitalícias.
 */
export async function adminActivateStorePlan(
  storeId: string,
  months: number,
): Promise<{ ok: true; planExpiresAt: string } | { ok: false; message: string }> {
  const current = await readStorePlan(storeId);
  if (!current) return { ok: false, message: "Loja não encontrada." };
  if (current.isAdmin) return { ok: false, message: "As lojas de uma conta de administrador não precisam de subscrição." };
  const built = activationPatch(current, months);
  if (!built.ok) return built;
  return writeStorePlan(storeId, built.patch.plan_expires_at);
}

/**
 * Desativa a subscrição de uma loja: o período termina agora. Se estiver
 * publicada, sai do ar até nova ativação; nada é apagado.
 */
export async function adminDeactivateStorePlan(
  storeId: string,
): Promise<{ ok: true; planExpiresAt: string } | { ok: false; message: string }> {
  return writeStorePlan(storeId, deactivationPatch().plan_expires_at);
}

/** Cancela a conta: remove as lojas (em cascata: produtos, encomendas, pedidos) e o perfil. */
export async function adminDeleteAccount(ownerId: string): Promise<AdminResult> {
  const { error: storesError } = await supabase.from("stores").delete().eq("owner_id", ownerId);
  if (storesError) {
    console.error("adminDeleteAccount (lojas)", storesError);
    return { ok: false, message: WRITE_FAILED };
  }
  const { data, error } = await supabase.from("profiles").delete().eq("id", ownerId).select("id");
  forgetProfiles();
  if (error) {
    console.error("adminDeleteAccount", error);
    return { ok: false, message: WRITE_FAILED };
  }
  return (data ?? []).length ? { ok: true } : { ok: false, message: WRITE_REFUSED };
}

/* ================================== Lojas ================================== */

/**
 * Todas as lojas — lojas-modelo incluídas, marcadas com `isModel` —, com o
 * dono, o estado da subscrição dele e os pagamentos digitais.
 */
export async function listStores(): Promise<AdminStore[]> {
  const [{ data, error }, pm] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, owner_id, state, subdomain, identifier, template_id, customization, digital_payments, plan_expires_at, created_at")
      .order("created_at", { ascending: false }),
    profilesMap(),
  ]);
  readOrThrow("as lojas", error);
  const now = Date.now();
  return (data ?? []).map((s) => {
    const ownerId = String(s.owner_id ?? "");
    const owner = pm.get(ownerId);
    const id = String(s.id);
    const ownerIsAdmin = owner?.isAdmin === true;
    const planExpiresAt = typeof s.plan_expires_at === "string" ? s.plan_expires_at : null;
    return {
      id,
      name: s.name ?? "",
      ownerId,
      ownerEmail: owner?.email ?? "",
      ownerName: owner?.name ?? "",
      state: s.state ?? "Rascunho",
      subdomain: s.subdomain ?? "",
      identifier: s.identifier ?? "",
      templateId: s.template_id ?? "",
      isModel: isLojaModelo({ id, identifier: s.identifier, customization: s.customization }),
      ownerIsAdmin,
      planExpiresAt,
      planActive: ownerIsAdmin || resolveBilling({ planExpiresAt }, now).accessActive,
      digitalPayments: s.digital_payments === true,
      createdAt: s.created_at ?? "",
    };
  });
}

/**
 * Publica ou despublica uma loja. Publicar uma loja de uma conta sem
 * subscrição é recusado pela base de dados (`stores_publish_requires_plan`).
 */
export async function adminSetStoreState(storeId: string, state: "Publicada" | "Rascunho"): Promise<AdminResult> {
  const { data, error } = await supabase.from("stores").update({ state }).eq("id", storeId).select("state");
  if (error) {
    console.error("adminSetStoreState", error);
    if (errorMentions(error, "PLAN_REQUIRED_TO_PUBLISH")) {
      return { ok: false, message: "O dono desta loja não tem subscrição ativa: a loja não pode ser publicada." };
    }
    return { ok: false, message: WRITE_FAILED };
  }
  return (data ?? [])[0]?.state === state ? { ok: true } : { ok: false, message: WRITE_REFUSED };
}

/** Apaga uma loja (em cascata: produtos, imagens, encomendas e pedidos de levantamento). */
export async function adminDeleteStore(storeId: string): Promise<AdminResult> {
  const { data, error } = await supabase.from("stores").delete().eq("id", storeId).select("id");
  if (error) {
    console.error("adminDeleteStore", error);
    return { ok: false, message: WRITE_FAILED };
  }
  return (data ?? []).length ? { ok: true } : { ok: false, message: WRITE_REFUSED };
}

/** Normaliza um identificador de Modelo_De_Loja para comparação. */
function normId(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Verificação em base de dados de quem usa um ou mais Modelo_De_Loja (R1.7).
 *
 * **Só leitura.** Não escreve, não apaga, não migra. Existe para ser corrida e
 * lida ANTES de qualquer eliminação de Loja_Modelo, que apaga Lojas publicadas
 * reais e é irreversível (decisão D7, rede de segurança da assunção `[A4]`).
 *
 * Devolve **todas** as Lojas que usam os `ids` — Loja_Modelo incluídas —,
 * partidas em dois grupos:
 *  - `models`: as Loja_Modelo (têm `customization.__template`), a mesma
 *    convenção de `listTemplateModels` em `web/supabase/models.ts`;
 *  - `customerStores`: as Lojas de cliente. Se este grupo não estiver vazio, a
 *    eliminação **não avança** e o Modelo_De_Loja mantém-se registado (R1.8).
 *
 * Uma Loja entra no resultado se `template_id` estiver em `ids` **ou** se
 * `customization.__basedOn` estiver em `ids`.
 *
 * **Porque é que o filtro corre em memória e não na consulta.** `__basedOn` vive
 * dentro da coluna JSON `customization`, e combinar um `in` sobre `template_id`
 * com um filtro `->>` sobre uma chave com dois sublinhados num único `or` do
 * PostgREST é frágil (citação da chave, escape do valor). Aqui um falso negativo
 * apaga a loja de um cliente, por isso trazemos as linhas e comparamos em
 * JavaScript, onde a regra é legível e determinística.
 *
 * **Erros não são silenciados.** Ao contrário das listagens deste ficheiro, que
 * devolvem lista vazia em caso de erro, esta função lança: um resultado vazio
 * por falha de leitura seria indistinguível de «nenhuma Loja afetada» — o falso
 * negativo que autoriza uma eliminação irreversível.
 */
export async function adminStoresUsingTemplate(ids: string[]): Promise<AdminTemplateUsage> {
  const wanted = new Set((ids ?? []).map(normId).filter((v) => v !== ""));
  if (wanted.size === 0) return { ids: [], models: [], customerStores: [] };

  const [{ data, error }, pm] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, owner_id, state, subdomain, identifier, template_id, customization, created_at")
      .order("created_at", { ascending: false }),
    profilesMap(),
  ]);
  if (error) {
    console.error("adminStoresUsingTemplate", error);
    throw new Error(`adminStoresUsingTemplate: leitura de lojas falhou (${error.message})`);
  }

  type Row = {
    id: string; name: string; owner_id: string; state: string; subdomain: string;
    identifier: string; template_id: string; customization: unknown; created_at: string;
  };
  const rows = (data ?? []) as Row[];
  const customOf = (r: Row) => (r.customization ?? {}) as { __template?: unknown; __basedOn?: unknown };

  // `__basedOn` de uma Loja de cliente guarda o ID da loja-modelo aplicada
  // (`applyModelToStore`), não o id do Modelo_De_Loja. Juntamos esses IDs ao
  // conjunto procurado para que uma Loja baseada numa destas Loja_Modelo seja
  // encontrada mesmo que o seu `template_id` já tenha divergido. Só pode
  // acrescentar Lojas ao resultado — nunca retirar.
  const keys = new Set(wanted);
  for (const r of rows) {
    if (customOf(r).__template && wanted.has(normId(r.template_id))) keys.add(normId(r.id));
  }

  const models: AdminTemplateUser[] = [];
  const customerStores: AdminTemplateUser[] = [];
  for (const r of rows) {
    const c = customOf(r);
    const basedOn = typeof c.__basedOn === "string" ? c.__basedOn : null;
    const matchedBy: TemplateMatch[] = [];
    if (wanted.has(normId(r.template_id))) matchedBy.push("templateId");
    if (keys.has(normId(basedOn))) matchedBy.push("basedOn");
    if (matchedBy.length === 0) continue;

    const isModel = !!c.__template;
    const entry: AdminTemplateUser = {
      id: r.id,
      name: r.name,
      ownerId: r.owner_id,
      ownerEmail: pm.get(r.owner_id)?.email ?? "",
      state: r.state,
      identifier: r.identifier,
      templateId: r.template_id,
      basedOn,
      isModel,
      matchedBy,
      createdAt: r.created_at,
    };
    (isModel ? models : customerStores).push(entry);
  }

  return { ids: [...wanted], models, customerStores };
}

/* ======================== Verificação de empresas ======================== */

const VERIFICATION_COLUMNS =
  "store_id, company_name, company_nif, bank_name, beneficiary_name, iban, doc_matricula, doc_certidao, verification_status, rejection_reason, submitted_at, reviewed_at, reviewed_by";

interface StoreInfo {
  name: string;
  identifier: string;
  ownerId: string;
  digitalPayments: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function storeInfoOf(s: any): StoreInfo {
  return {
    name: s?.name ?? "",
    identifier: s?.identifier ?? "",
    ownerId: String(s?.owner_id ?? ""),
    digitalPayments: s?.digital_payments === true,
  };
}

function toAdminVerification(r: any, store: StoreInfo | undefined, emails: ReadonlyMap<string, string>): AdminVerification {
  const ownerId = store?.ownerId ?? "";
  const reviewedBy = typeof r.reviewed_by === "string" && r.reviewed_by ? r.reviewed_by : null;
  return {
    ...toVerification(r),
    storeId: String(r.store_id),
    storeName: store?.name ?? "",
    storeIdentifier: store?.identifier ?? "",
    ownerId,
    ownerEmail: emails.get(ownerId) ?? "",
    digitalPayments: store?.digitalPayments === true,
    reviewedBy,
    reviewedByEmail: reviewedBy ? emails.get(reviewedBy) ?? "" : "",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Pedidos de verificação de empresa — os em análise, aprovados e rejeitados
 * (os «por enviar» não interessam ao Administrador). `pendingOnly` lê só os em
 * análise (a Visão geral).
 *
 * A ordem da fila é decidida por `splitVerificationQueue`, na vista.
 */
export async function listVerifications(opts: { pendingOnly?: boolean } = {}): Promise<AdminVerification[]> {
  const base = supabase.from("store_payments").select(VERIFICATION_COLUMNS);
  const query = opts.pendingOnly
    ? base.eq("verification_status", "pending")
    : base.in("verification_status", ["pending", "approved", "rejected"]);
  const [{ data, error }, { data: stores, error: storesError }, pm] = await Promise.all([
    query,
    supabase.from("stores").select("id, name, identifier, owner_id, digital_payments"),
    profilesMap(),
  ]);
  readOrThrow("os pedidos de verificação", error);
  readOrThrow("as lojas", storesError);
  const storesById = new Map<string, StoreInfo>((stores ?? []).map((s): [string, StoreInfo] => [String(s.id), storeInfoOf(s)]));
  const emails = new Map<string, string>([...pm].map(([id, p]): [string, string] => [id, p.email]));
  return (data ?? []).map((r) => toAdminVerification(r, storesById.get(String(r.store_id)), emails));
}

/** Relê um pedido e o interruptor da loja — depois de uma decisão. */
export async function getVerification(storeId: string): Promise<AdminVerification | null> {
  const [{ data, error }, { data: store, error: storeError }] = await Promise.all([
    supabase.from("store_payments").select(VERIFICATION_COLUMNS).eq("store_id", storeId).maybeSingle(),
    supabase.from("stores").select("id, name, identifier, owner_id, digital_payments").eq("id", storeId).maybeSingle(),
  ]);
  readOrThrow("o pedido de verificação", error);
  readOrThrow("a loja", storeError);
  if (!data) return null;
  const info = store ? storeInfoOf(store) : undefined;
  const ids = [info?.ownerId, typeof data.reviewed_by === "string" ? data.reviewed_by : ""].filter((v): v is string => !!v);
  const emails = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await supabase.from("profiles").select("id, email").in("id", ids);
    for (const p of people ?? []) emails.set(String(p.id), p.email ?? "");
  }
  return toAdminVerification(data, info, emails);
}

/** Frase de uma decisão que a base de dados recusou. */
function verificationError(error: DbError): string {
  if (errorMentions(error, "store_payments_submission_complete")) {
    return "Faltam dados ou documentos neste pedido: não pode ser aprovado.";
  }
  if (errorMentions(error, "store_payments_verification_status_valid")) {
    return "Estado de verificação inválido. Confirme que a migração 0023 está aplicada.";
  }
  return WRITE_FAILED;
}

/** Grava uma decisão e confirma que ficou com o estado pedido. */
async function writeDecision(
  storeId: string,
  patch: { verification_status: "approved" | "rejected" },
): Promise<AdminResult> {
  const { data, error } = await supabase
    .from("store_payments")
    .update(patch)
    .eq("store_id", storeId)
    .select("verification_status");
  if (error) {
    console.error("writeDecision", error);
    return { ok: false, message: verificationError(error) };
  }
  const row = (data ?? [])[0];
  if (!row) return { ok: false, message: "O pedido não foi encontrado, ou a base de dados recusou a alteração." };
  return row.verification_status === patch.verification_status ? { ok: true } : { ok: false, message: WRITE_REFUSED };
}

/**
 * Aprova o pedido de verificação de uma loja (`approvalPatch`). O gatilho
 * `store_payments_sync_store` liga `stores.digital_payments`; a vista relê-o com
 * {@link getVerification} para o confirmar.
 */
export async function adminApproveVerification(storeId: string): Promise<AdminResult> {
  const built = approvalPatch(await currentUserId());
  if (!built.ok) return built;
  return writeDecision(storeId, built.patch);
}

/**
 * Rejeita o pedido de verificação de uma loja, com o motivo que o Dono vai ler
 * (`rejectionPatch`). O gatilho desliga `stores.digital_payments`.
 */
export async function adminRejectVerification(storeId: string, reason: string): Promise<AdminResult> {
  const built = rejectionPatch(await currentUserId(), reason);
  if (!built.ok) return built;
  return writeDecision(storeId, built.patch);
}

/** Quantos pedidos de verificação e levantamentos estão à espera (navegação). */
export async function adminPendingCounts(): Promise<AdminPendingCounts> {
  const [v, w] = await Promise.all([
    supabase.from("store_payments").select("store_id", { count: "exact", head: true }).eq("verification_status", "pending"),
    supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "requested"),
  ]);
  if (v.error) console.error("adminPendingCounts (verificações)", v.error);
  if (w.error) console.error("adminPendingCounts (levantamentos)", w.error);
  return { verifications: v.count ?? 0, withdrawals: w.count ?? 0 };
}

/* ================================ Pagamentos ================================ */

/** Pagamentos de subscrição, os mais recentes primeiro. */
export async function listPlanPayments(): Promise<AdminPlanPayment[]> {
  const [{ data, error }, pm] = await Promise.all([
    supabase
      .from("plan_payments")
      .select("id, owner_id, amount, method, status, reference_due_date, created_at, paid_at, activated_at")
      .order("created_at", { ascending: false }),
    profilesMap(),
  ]);
  readOrThrow("os pagamentos de subscrição", error);
  return (data ?? []).map((r) => {
    const ownerId = String(r.owner_id ?? "");
    const owner = pm.get(ownerId);
    return {
      id: String(r.id),
      service: "plan" as const,
      ownerId,
      ownerEmail: owner?.email ?? "",
      ownerName: owner?.name ?? "",
      amount: num(r.amount),
      method: String(r.method ?? ""),
      status: paymentStatus(r.status, r.method, r.reference_due_date),
      createdAt: r.created_at ?? "",
      paidAt: r.paid_at ?? null,
      activatedAt: r.activated_at ?? null,
    };
  });
}

/**
 * Apaga um pagamento de subscrição **por concluir** (uma referência que ficou
 * presa, por exemplo). Um pagamento pago nunca é apagado: a condição está na
 * própria consulta.
 */
export async function adminDeletePlanPayment(id: string): Promise<AdminResult> {
  const { data, error } = await supabase.from("plan_payments").delete().eq("id", id).neq("status", "paid").select("id");
  if (error) {
    console.error("adminDeletePlanPayment", error);
    return { ok: false, message: WRITE_FAILED };
  }
  return (data ?? []).length ? { ok: true } : { ok: false, message: WRITE_REFUSED };
}

/** Quantas encomendas a secção «Pagamentos › Encomendas» lê de uma vez. */
export const ADMIN_ORDERS_LIMIT = 200;

/**
 * As encomendas mais recentes das lojas de cliente (as de demonstração das
 * lojas-modelo ficam fora). `truncated` diz se há mais do que as lidas.
 */
export async function listStoreOrders(): Promise<{ orders: AdminOrder[]; truncated: boolean }> {
  const [{ data, error }, { data: stores, error: storesError }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, store_id, method, status, amount, subtotal, delivery_fee, discount_amount, reference_due_date, customer, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(ADMIN_ORDERS_LIMIT),
    supabase.from("stores").select("id, name, identifier"),
  ]);
  readOrThrow("as encomendas das lojas", error);
  readOrThrow("as lojas", storesError);
  const storesById = new Map<string, { name: string; identifier: string }>(
    (stores ?? []).map((s): [string, { name: string; identifier: string }] => [String(s.id), { name: s.name ?? "", identifier: s.identifier ?? "" }]),
  );
  const rows = data ?? [];
  const orders = rows
    .filter((r) => !isLojaModelo({ id: String(r.store_id), identifier: storesById.get(String(r.store_id))?.identifier }))
    .map((r) => {
      const storeId = String(r.store_id ?? "");
      const customer = (r.customer ?? {}) as { name?: unknown };
      return {
        id: String(r.id),
        storeId,
        storeName: storesById.get(storeId)?.name ?? "",
        method: String(r.method ?? ""),
        status: paymentStatus(r.status, r.method, r.reference_due_date),
        amount: num(r.amount),
        subtotal: r.subtotal == null ? null : num(r.subtotal),
        deliveryFee: num(r.delivery_fee),
        discountAmount: num(r.discount_amount),
        customerName: typeof customer.name === "string" ? customer.name : "",
        createdAt: r.created_at ?? "",
        paidAt: r.paid_at ?? null,
      };
    });
  return { orders, truncated: rows.length >= ADMIN_ORDERS_LIMIT };
}

/** Todos os pedidos de levantamento, os mais recentes primeiro. */
export async function listAllWithdrawals(): Promise<AdminWithdrawal[]> {
  const [{ data, error }, { data: stores }, pm] = await Promise.all([
    supabase
      .from("withdrawals")
      .select("id, store_id, owner_id, amount, status, bank_name, beneficiary_name, iban, created_at, processed_at")
      .order("created_at", { ascending: false }),
    supabase.from("stores").select("id, name"),
    profilesMap(),
  ]);
  readOrThrow("os levantamentos", error);
  const storeNames = new Map<string, string>((stores ?? []).map((s): [string, string] => [String(s.id), s.name ?? ""]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    storeId: String(r.store_id ?? ""),
    storeName: storeNames.get(String(r.store_id)) ?? "",
    ownerEmail: pm.get(String(r.owner_id))?.email ?? "",
    amount: num(r.amount),
    status: r.status,
    bankName: r.bank_name ?? null,
    beneficiaryName: r.beneficiary_name ?? null,
    iban: r.iban ?? null,
    createdAt: r.created_at ?? "",
    processedAt: r.processed_at ?? null,
  }));
}

/** Aprova, marca como pago ou rejeita um pedido de levantamento. */
export async function adminProcessWithdrawal(id: string, status: "approved" | "paid" | "rejected"): Promise<AdminResult> {
  const { data, error } = await supabase
    .from("withdrawals")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("id", id)
    .select("status");
  if (error) {
    console.error("adminProcessWithdrawal", error);
    return { ok: false, message: WRITE_FAILED };
  }
  return (data ?? [])[0]?.status === status ? { ok: true } : { ok: false, message: WRITE_REFUSED };
}
