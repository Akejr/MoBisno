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
import { toStore, toProduct, toBanner, toAsset } from "../supabase/repositories.js";
import type { StoreCustomization } from "../templates/types.js";

const resolver = createStorefrontResolver({ storeRepository, assetRepository, bannerRepository, productRepository });

/** Id do bloco que `api/_seo.js` embute no HTML (`SSR_DATA_ID`). */
const SSR_DATA_ID = "mb-ssr-data";

/**
 * Lê os dados que o servidor embutiu no HTML e constrói a loja sem tocar na
 * rede. Devolve `null` quando não há bloco, quando é de outra loja, ou quando
 * não se deixa ler.
 *
 * PORQUÊ: o `api/prerender.js` já leu a loja, o logótipo, os banners e os
 * produtos para escrever a página. Sem isto, a SPA ia buscar tudo outra vez —
 * três idas encadeadas ao Supabase, cerca de um segundo medido em produção,
 * durante o qual o visitante ficava a olhar para a página pré-renderizada antes
 * de a loja aparecer.
 *
 * As linhas vêm cruas do servidor e são convertidas aqui pelos mesmos
 * conversores que os repositórios usam. É de propósito: converter no servidor
 * obrigaria a manter um espelho das conversões em `api/`, e esse tipo de
 * espelho já custa caro neste projeto.
 *
 * **Uso único.** O bloco é removido depois de lido, para uma navegação dentro
 * da SPA (ou um recarregamento passados os 60s de cache) voltar a ler dados
 * frescos. O HTML fica 10 minutos em cache na CDN, por isso o que aqui vem pode
 * ter até essa idade — a mesma que o conteúdo pré-renderizado já tinha.
 */
function fromEmbeddedData(identifier: string): LoadedStorefront | null {
  const el = typeof document === "undefined" ? null : document.getElementById(SSR_DATA_ID);
  if (!el?.textContent) return null;
  el.remove();

  try {
    const raw = JSON.parse(el.textContent) as {
      store?: { identifier?: string; customization?: unknown };
      logo?: unknown;
      banners?: unknown[];
      products?: { available?: boolean }[];
    };
    const store = raw.store;
    if (!store || String(store.identifier ?? "").toLowerCase() !== identifier.toLowerCase()) return null;

    const result: StorefrontResult = {
      kind: "render",
      store: toStore(store),
      logo: raw.logo ? toAsset(raw.logo) : null,
      banners: (raw.banners ?? []).map(toBanner),
      // O resolvedor só devolve produtos disponíveis; o servidor já filtra, mas
      // repetir aqui mantém a garantia do lado de cá.
      products: (raw.products ?? []).filter((p) => p.available === true).map(toProduct),
    };
    const custom = (store.customization && typeof store.customization === "object"
      ? store.customization
      : {}) as StoreCustomization;
    return { result, view: renderStore(result), custom };
  } catch {
    return null; // bloco corrompido: segue-se pelo caminho normal
  }
}

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

  // Dados embutidos pelo servidor: desenha já, sem uma única ida à rede.
  const embutidos = fromEmbeddedData(identifier);
  if (embutidos) {
    cache.set(key, { at: Date.now(), data: embutidos });
    return embutidos;
  }

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

/**
 * Carrega a loja de um Dono para PRÉ-VISUALIZAÇÃO, mesmo por publicar.
 *
 * Não passa pela cache nem pelos dados embutidos: a pré-visualização é do
 * rascunho, muda a cada gravação no editor, e servir uma versão de há um minuto
 * seria pior do que não a mostrar.
 */
export async function loadStorePreview(identifier: string, ownerId: string): Promise<LoadedStorefront> {
  const result = await resolver.resolveForOwner(identifier, ownerId);
  const custom: StoreCustomization = result.kind === "render"
    ? await getCustomization(result.store.id)
    : {};
  return { result, view: renderStore(result), custom };
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
