/**
 * Cache em memória da loja resolvida + personalização, por identificador.
 *
 * Evita re-consultar o Supabase a cada navegação entre páginas da mesma loja
 * (home, produto, categoria, carrinho), tornando a navegação instantânea.
 */
import { storeRepository, assetRepository, bannerRepository, productRepository } from "../composition.js";
import { createStorefrontResolver, type StorefrontResult } from "../../src/services/storefrontResolver.js";
import { renderStore, type StoreViewModel } from "../../src/storefront/storeRenderer.js";
import { getCustomization } from "../supabase/customization.js";
import type { StoreCustomization } from "../templates/types.js";

const resolver = createStorefrontResolver({ storeRepository, assetRepository, bannerRepository, productRepository });

export interface LoadedStorefront {
  result: StorefrontResult;
  view: StoreViewModel;
  custom: StoreCustomization;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: LoadedStorefront }>();

/**
 * Pedidos em curso, por identificador.
 *
 * PORQUÊ: a cache guardava só o RESULTADO, e só depois de ele chegar. Como o
 * arranque da loja chama esta função duas vezes ao mesmo tempo — a vista e o
 * favicon —, as duas chamadas falhavam a cache e faziam o trabalho todo em
 * duplicado: dez consultas ao Supabase em vez de cinco, a competir umas com as
 * outras. Guardar a PROMESSA faz a segunda chamada esperar pela primeira.
 */
const inFlight = new Map<string, Promise<LoadedStorefront>>();

/** Carrega (e memoiza) a loja por identificador. */
export async function loadStorefront(identifier: string): Promise<LoadedStorefront> {
  const key = identifier.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const emCurso = inFlight.get(key);
  if (emCurso) return emCurso;

  const pedido = (async (): Promise<LoadedStorefront> => {
    const host = `${identifier}.mobisno.store`;
    const result = await resolver.resolve(host);
    const view = renderStore(result);
    const custom: StoreCustomization = result.kind === "render"
      ? await getCustomization(result.store.id)
      : {};
    const data: LoadedStorefront = { result, view, custom };
    cache.set(key, { at: Date.now(), data });
    return data;
  })();

  // O `finally` tem de correr mesmo em falha: sem isso, um erro de rede deixava
  // o identificador preso e todas as tentativas seguintes devolviam a mesma
  // promessa rejeitada, sem nunca voltar a tentar.
  inFlight.set(key, pedido);
  try {
    return await pedido;
  } finally {
    inFlight.delete(key);
  }
}

/** Invalida a cache (uma loja específica ou toda). */
export function invalidateStorefront(identifier?: string): void {
  if (identifier) {
    cache.delete(identifier.toLowerCase());
    inFlight.delete(identifier.toLowerCase());
  } else {
    cache.clear();
    inFlight.clear();
  }
}
