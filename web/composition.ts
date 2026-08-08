/**
 * Raiz de composição (persistência real via Supabase).
 *
 * Liga os serviços de negócio (inalterados) às implementações de repositório
 * apoiadas no Supabase + Storage + Auth. Mantém os mesmos nomes exportados que
 * a versão anterior, por isso as views não mudam.
 */

import type { Template } from "../src/models/index.js";
import { createIdentifierService } from "../src/services/identifierService.js";
import { createStoreService } from "../src/services/storeService.js";
import { createFileService } from "../src/services/fileService.js";
import { createWizardFlow } from "../src/app/wizardFlow.js";
import { createAdminPanel, type AdminPanel } from "../src/app/adminPanel.js";
import type { Session } from "../src/services/authService.js";
import { resolveBilling, type BillingState } from "../src/services/billing.js";
import { templateOptions } from "./templates/registry.js";

import { supabase } from "./supabase/client.js";
import {
  createSupabaseStoreRepository,
  createSupabaseProductRepository,
  createSupabaseBannerRepository,
  createSupabaseAssetRepository,
} from "./supabase/repositories.js";
import { createSupabaseStorageBackend } from "./supabase/storage.js";
import { createSupabaseAuthService } from "./supabase/auth.js";

/** Modelos disponíveis (vêm do registo de Modelos, fonte única de verdade). */
export const TEMPLATES: Template[] = templateOptions();

// Repositórios Supabase (partilham o cliente autenticado; RLS impõe isolamento).
export const storeRepository = createSupabaseStoreRepository();
export const productRepository = createSupabaseProductRepository();
export const bannerRepository = createSupabaseBannerRepository();
export const assetRepository = createSupabaseAssetRepository();

// Serviços.
export const authService = createSupabaseAuthService();
export const identifierService = createIdentifierService({
  isIdentifierTaken: (id) => storeRepository.isIdentifierTaken(id),
});
export const storeService = createStoreService({ storeRepository, identifierService });
export const wizardFlow = createWizardFlow({ authService, identifierService, storeService });

const fileService = createFileService({
  storage: createSupabaseStorageBackend(),
  generateId: () => crypto.randomUUID(),
});

/** Painel de Administração ligado a uma Loja, sobre os repositórios/Storage Supabase. */
export function adminPanelFor(storeId: string): AdminPanel {
  return createAdminPanel({
    storeId,
    repositories: { storeRepository, assetRepository, productRepository, bannerRepository },
    fileService,
    productIdGenerator: () => crypto.randomUUID(),
  });
}

/** Estado leve da sessão da app (em memória durante a navegação). */
export interface AppState {
  session: Session | null;
  ownerId: string | null;
  storeId: string | null;
  storeIdentifier: string | null;
  templateId: string | null;
  /** Quando o admin edita a loja de outro dono: id do dono real dessa loja. */
  editOwnerId: string | null;
  /** Destino ao sair do editor (ex.: "#/adminPainel/modelos"). Null = painel do dono. */
  editorReturn: string | null;
}
export const appState: AppState = {
  session: null, ownerId: null, storeId: null, storeIdentifier: null, templateId: null, editOwnerId: null, editorReturn: null,
};

/** Devolve o id do utilizador autenticado (ou null), lendo a sessão do Supabase. */
export async function currentOwnerId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Reconstrói uma Session a partir do utilizador autenticado no Supabase (ou null). */
export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  return {
    ownerId: user.id,
    email: user.email ?? "",
    token: "",
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

/** Termina a sessão e limpa o estado da app. */
export async function logout(): Promise<void> {
  await supabase.auth.signOut();
  appState.session = null;
  appState.ownerId = null;
  appState.storeId = null;
  appState.storeIdentifier = null;
  appState.templateId = null;
}


/** Define o estado de uma Loja ("Publicada" ou "Rascunho"). */
export async function setStoreState(
  ownerId: string,
  storeId: string,
  state: "Publicada" | "Rascunho",
): Promise<boolean> {
  const owned = await storeRepository.findByIdForOwner(ownerId, storeId);
  if (owned === null) return false;
  const res = await storeRepository.update(ownerId, { ...owned, state });
  return res.ok;
}

/** Nome do Dono (perfil) para saudação no painel. */
export async function getOwnerName(ownerId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("name").eq("id", ownerId).maybeSingle();
  return (data?.name as string | undefined)?.trim() ?? "";
}

/* ---------------------------- Subscrição ------------------------------- */

/**
 * Estado da subscrição da conta.
 *
 * Deixou de haver escalões e teste grátis: a regra é «administrador, ou
 * `plan_expires_at` no futuro». Também já não há transição a persistir — o
 * carry-over só existia para trocar entre planos.
 */
/**
 * A coluna `plan_stores` existe nesta base de dados?
 *
 * Começa em `true` e passa a `false` no primeiro pedido que falhe por causa dela.
 * Vive no módulo, e não por chamada, para o painel não repetir um pedido
 * condenado a cada troca de separador.
 */
let temColunaPlanStores = true;

export async function getOwnerBilling(ownerId?: string | null): Promise<BillingState> {
  const id = ownerId ?? (await currentOwnerId());
  if (!id) return resolveBilling({ planExpiresAt: null });
  /*
   * `plan_stores` nasceu com o preço por Loja (migração 0020) e pode ainda não
   * existir na base de dados.
   *
   * **Um `select` com uma coluna inexistente falha o pedido INTEIRO** — não
   * devolve as outras colunas com aquela a `null`. Foi assim que um
   * administrador com duas lojas online passou a ver «Sem subscrição ativa» e os
   * cartões de preço: o pedido falhava, `is_admin` e `plan_expires_at` vinham
   * vazios, e o estado resolvido era o de quem nunca pagou.
   *
   * Daí o recurso: perante a falha, repete-se sem a coluna nova e fica registado
   * para os pedidos seguintes desta sessão não repetirem o erro. Ausência vale
   * uma Loja, que é o que todas as contas anteriores pagaram.
   */
  const ler = (comLojas: boolean) => supabase
    .from("profiles")
    .select(comLojas ? "plan_expires_at, is_admin, plan_stores" : "plan_expires_at, is_admin")
    .eq("id", id)
    .maybeSingle();

  let res = await ler(temColunaPlanStores);
  if (res.error && temColunaPlanStores) {
    temColunaPlanStores = false;
    res = await ler(false);
  }
  const data = res.data as {
    plan_expires_at?: string | null;
    is_admin?: boolean | null;
    plan_stores?: number | null;
  } | null;
  return resolveBilling({
    planExpiresAt: data?.plan_expires_at,
    isAdmin: data?.is_admin === true,
    planStores: data?.plan_stores ?? null,
  });
}

/** A conta pode publicar e manter lojas online? */
export async function ownerCanPublish(ownerId?: string | null): Promise<boolean> {
  return (await getOwnerBilling(ownerId)).accessActive;
}


/**
 * Apaga uma Loja do Dono autenticado, permanentemente. A remoção da linha em
 * `stores` elimina em cascata produtos, banners e assets; a personalização
 * (coluna jsonb) é removida com a própria linha. Devolve `true` em sucesso.
 */
export async function deleteStore(ownerId: string, storeId: string): Promise<boolean> {
  const { error } = await supabase.from("stores").delete().eq("id", storeId).eq("owner_id", ownerId);
  if (error) console.error("deleteStore", error);
  return !error;
}

/* ----------------------------- Domínio público ----------------------------- */

import { PLATFORM_APEX, STORE_APEX, isPlatformHost } from "./lib/routing.js";
export { PLATFORM_APEX, STORE_APEX, isPlatformHost };

/**
 * URL pública de uma loja. Em produção usa o subdomínio real
 * (`https://identificador.sualoja.digital`); em desenvolvimento/preview recorre
 * ao caminho limpo (`.../loja/identificador`).
 */
export function publicStoreUrl(identifier: string): string {
  if (isPlatformHost()) return `https://${identifier}.${STORE_APEX}`;
  return `${location.origin}/loja/${encodeURIComponent(identifier)}`;
}

/** Com persistência real não semeamos dados: a loja-demo deixa de existir. */
export async function seedDemoStore(): Promise<void> {
  /* no-op */
}
