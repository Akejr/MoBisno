/**
 * Cache em memória da loja resolvida + personalização, por identificador.
 *
 * Evita re-consultar o Supabase a cada navegação entre páginas da mesma loja
 * (home, produto, categoria, carrinho), tornando a navegação instantânea.
 */
import { storeRepository, assetRepository, bannerRepository, productRepository, currentOwnerId } from "../composition.js";
import { createStorefrontResolver, type StorefrontResult } from "../../src/services/storefrontResolver.js";
import { renderStore } from "../../src/storefront/storeRenderer.js";
import { getCustomization } from "../supabase/customization.js";
import { storefrontFromRows, type LoadedStorefront, type StorefrontRows } from "../ssr/storefrontRows.js";
import type { StoreCustomization } from "../templates/types.js";

export type { LoadedStorefront };

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
 * três idas encadeadas ao Supabase, cerca de um segundo medido em produção.
 *
 * E há uma segunda razão, agora mais importante: o servidor desenha a página com
 * o modelo verdadeiro a partir destas linhas, e a SPA só adota esse HTML (em vez
 * de o reescrever) se chegar exatamente ao mesmo. Por isso as linhas passam pela
 * MESMA função dos dois lados — `storefrontFromRows` (`web/ssr/storefrontRows.ts`)
 * —, com os mesmos conversores e o mesmo renderizador.
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
    const raw = JSON.parse(el.textContent) as StorefrontRows;
    if (String(raw.store?.identifier ?? "").toLowerCase() !== identifier.toLowerCase()) return null;
    return storefrontFromRows(raw);
  } catch {
    return null; // bloco corrompido: segue-se pelo caminho normal
  }
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: LoadedStorefront }>();

/**
 * Pedidos em curso, por identificador.
 *
 * PORQUÊ: a cache guardava só o RESULTADO, e só depois de ele chegar. Como o
 * arranque da loja chama esta função duas vezes ao mesmo tempo — a vista e o
 * favicon —, as duas chamadas falhavam a cache e faziam o trabalho todo em
 * duplicado. Guardar a PROMESSA faz a segunda chamada esperar pela primeira.
 */
const inFlight = new Map<string, Promise<LoadedStorefront>>();

/** Junta a personalização ao resultado da resolução. */
async function withCustomization(result: StorefrontResult, draft: boolean): Promise<LoadedStorefront> {
  const custom: StoreCustomization = result.kind === "render"
    ? await getCustomization(result.store.id)
    : {};
  return { result, view: renderStore(result), custom, ...(draft ? { draft: true } : {}) };
}

/**
 * Resolve a loja pública e, se não houver nenhuma publicada com este
 * identificador, tenta o **rascunho do próprio Dono**.
 *
 * PORQUÊ: a pré-visualização privada (`/previsualizar/<id>`) abria, mas cada
 * ligação lá dentro — um produto, uma categoria, o carrinho — leva a
 * `/loja/<id>/…`, que só resolvia lojas publicadas: o Dono clicava num produto
 * do seu rascunho e recebia «Loja não encontrada».
 *
 * Quem mais vê o rascunho: ninguém. `resolveForOwner` só devolve a loja se
 * pertencer a quem tem sessão, o repositório filtra por dono e as políticas da
 * base de dados recusam ler a loja de outra pessoa. Um visitante sem sessão (ou
 * com outra conta) continua a receber «Loja não encontrada».
 */
async function resolveWithDraft(identifier: string): Promise<LoadedStorefront> {
  const result = await resolver.resolve(`${identifier}.mobisno.store`);
  if (result.kind === "render") return withCustomization(result, false);

  let ownerId: string | null = null;
  try { ownerId = await currentOwnerId(); } catch { ownerId = null; }
  if (ownerId) {
    const own = await resolver.resolveForOwner(identifier, ownerId);
    if (own.kind === "render") return withCustomization(own, own.store.state !== "Publicada");
  }
  return withCustomization(result, false);
}

/**
 * Carrega (e memoiza) a loja por identificador.
 *
 * Os rascunhos não entram na cache: mudam a cada gravação no editor, e o Dono
 * que volta da edição tem de ver a versão que acabou de guardar.
 */
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
    const data = await resolveWithDraft(identifier);
    if (!data.draft) cache.set(key, { at: Date.now(), data });
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
  const draft = result.kind === "render" && result.store.state !== "Publicada";
  return withCustomization(result, draft);
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
