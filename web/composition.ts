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
import { DEFAULT_PLAN, isPlanId, type PlanId } from "../src/services/plans.js";
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
}
export const appState: AppState = {
  session: null, ownerId: null, storeId: null, storeIdentifier: null, templateId: null, editOwnerId: null,
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

/** Marca uma Loja como Publicada (ao finalizar o assistente). */
export async function publishStore(ownerId: string, storeId: string): Promise<boolean> {
  const owned = await storeRepository.findByIdForOwner(ownerId, storeId);
  if (owned === null) return false;
  const res = await storeRepository.update(ownerId, { ...owned, state: "Publicada" });
  return res.ok;
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

/* ------------------------------- Planos -------------------------------- */

/** Lê o plano de subscrição da conta autenticada (ou o plano por omissão). */
export async function getOwnerPlan(ownerId?: string | null): Promise<PlanId> {
  const id = ownerId ?? (await currentOwnerId());
  if (!id) return DEFAULT_PLAN;
  const { data } = await supabase.from("profiles").select("plan").eq("id", id).maybeSingle();
  return isPlanId(data?.plan) ? data!.plan : DEFAULT_PLAN;
}

/** Define o plano de subscrição da conta autenticada. Devolve `true` em sucesso. */
export async function setOwnerPlan(planId: PlanId): Promise<boolean> {
  const id = await currentOwnerId();
  if (!id) return false;
  const { error } = await supabase.from("profiles").update({ plan: planId }).eq("id", id);
  return !error;
}

/** Conta as lojas do Dono que estão no estado "Publicada". */
export async function countPublishedStores(ownerId: string): Promise<number> {
  const stores = await storeRepository.listByOwner(ownerId);
  return stores.filter((s) => s.state === "Publicada").length;
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

import { PLATFORM_APEX, isPlatformHost } from "./lib/routing.js";
export { PLATFORM_APEX, isPlatformHost };

/**
 * URL pública de uma loja. Em produção usa o subdomínio real
 * (`https://identificador.mobisno.store`); em desenvolvimento/preview recorre
 * ao caminho limpo (`.../loja/identificador`).
 */
export function publicStoreUrl(identifier: string): string {
  if (isPlatformHost()) return `https://${identifier}.${PLATFORM_APEX}`;
  return `${location.origin}/loja/${encodeURIComponent(identifier)}`;
}

/** Com persistência real não semeamos dados: a loja-demo deixa de existir. */
export async function seedDemoStore(): Promise<void> {
  /* no-op */
}
