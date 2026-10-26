/**
 * Conversão das linhas do Supabase para os modelos de domínio — **sem o cliente
 * Supabase**.
 *
 * Viviam em `web/supabase/repositories.ts`, que importa `./client.js` (e, com
 * ele, `import.meta.env` e a sessão do navegador). Isso impedia o servidor de as
 * usar: a pré-renderização (`web/ssr/entry.ts`, empacotada para
 * `api/_ssr/render.mjs`) tem de construir a loja a partir das MESMAS linhas e
 * pelos MESMOS conversores que a SPA, senão o HTML do servidor e o do navegador
 * divergem e a adoção falha.
 *
 * `repositories.ts` reexporta estas funções: quem já as importava de lá não
 * muda.
 */
import type { Store, Product, Banner, Asset, AssetKind, ImageFormat, StoreState } from "../../src/models/index.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toStore(r: any): Store {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, storeType: r.store_type,
    templateId: r.template_id, identifier: r.identifier, subdomain: r.subdomain,
    state: r.state as StoreState, createdAt: r.created_at,
    digitalPayments: r.digital_payments === true,
    planExpiresAt: typeof r.plan_expires_at === "string" ? r.plan_expires_at : null,
  };
}

export function toProduct(r: any): Product {
  return {
    id: r.id, storeId: r.store_id, name: r.name, description: r.description ?? "",
    category: r.category ?? undefined,
    featured: r.featured === true,
    physical: r.physical !== false,
    price: Number(r.price), imageUrl: r.image_url ?? undefined,
    available: r.available, stock: r.stock ?? null, createdAt: r.created_at,
  };
}

export function toBanner(r: any): Banner {
  return { id: r.id, storeId: r.store_id, imageUrl: r.image_url, position: r.position, createdAt: r.created_at };
}

export function toAsset(r: any): Asset {
  return { id: r.id, storeId: r.store_id, kind: r.kind as AssetKind, url: r.url, format: r.format as ImageFormat, sizeBytes: r.size_bytes };
}
