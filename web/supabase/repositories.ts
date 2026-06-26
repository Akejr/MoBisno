/**
 * Implementações dos repositórios apoiadas no Supabase (Postgres + RLS).
 *
 * Implementam as mesmas interfaces das versões em memória, pelo que os
 * serviços de negócio e os 116 testes permanecem inalterados. O isolamento de
 * inquilino é reforçado pelas políticas RLS no Postgres (ver
 * supabase/migrations/0001_init.sql); os filtros aqui são defensivos.
 */

import type { Result, Store, Product, Banner, Asset, AssetKind, ImageFormat, StoreState } from "../../src/models/index.js";
import { ok, err } from "../../src/models/index.js";
import type { StoreRepository, StoreRepositoryError } from "../../src/services/storeRepository.js";
import type { ProductRepository } from "../../src/services/productRepository.js";
import type { BannerRepository } from "../../src/services/bannerRepository.js";
import type { AssetRepository } from "../../src/services/assetRepository.js";
import { supabase } from "./client.js";

/* ------------------------------- mappers -------------------------------- */
/* eslint-disable @typescript-eslint/no-explicit-any */

function toStore(r: any): Store {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, storeType: r.store_type,
    templateId: r.template_id, identifier: r.identifier, subdomain: r.subdomain,
    state: r.state as StoreState, createdAt: r.created_at,
  };
}
function fromStore(s: Store): Record<string, unknown> {
  return {
    id: s.id, owner_id: s.ownerId, name: s.name, store_type: s.storeType,
    template_id: s.templateId, identifier: s.identifier, subdomain: s.subdomain,
    state: s.state, created_at: s.createdAt,
  };
}
function toProduct(r: any): Product {
  return {
    id: r.id, storeId: r.store_id, name: r.name, description: r.description ?? "",
    category: r.category ?? undefined,
    featured: r.featured === true,
    physical: r.physical !== false,
    price: Number(r.price), imageUrl: r.image_url ?? undefined,
    available: r.available, createdAt: r.created_at,
  };
}
function toBanner(r: any): Banner {
  return { id: r.id, storeId: r.store_id, imageUrl: r.image_url, position: r.position, createdAt: r.created_at };
}
function toAsset(r: any): Asset {
  return { id: r.id, storeId: r.store_id, kind: r.kind as AssetKind, url: r.url, format: r.format as ImageFormat, sizeBytes: r.size_bytes };
}

/* ----------------------------- StoreRepository -------------------------- */
export function createSupabaseStoreRepository(): StoreRepository {
  return {
    async create(store: Store): Promise<Result<Store, StoreRepositoryError>> {
      const { data, error } = await supabase.from("stores").insert(fromStore(store)).select().single();
      if (error) {
        if (error.code === "23505") {
          return err({ code: "IDENTIFICADOR_DUPLICADO", reason: "O identificador da Loja já está associado a outra Loja." });
        }
        console.error("stores.insert", error);
        return err({ code: "LOJA_INEXISTENTE", reason: error.message });
      }
      return ok(toStore(data));
    },
    async update(ownerId: string, store: Store): Promise<Result<Store, StoreRepositoryError>> {
      const { data, error } = await supabase
        .from("stores").update(fromStore(store))
        .eq("id", store.id).eq("owner_id", ownerId).select().maybeSingle();
      if (error) {
        if (error.code === "23505") return err({ code: "IDENTIFICADOR_DUPLICADO", reason: "Identificador duplicado." });
        return err({ code: "LOJA_INEXISTENTE", reason: error.message });
      }
      if (!data) return err({ code: "LOJA_INEXISTENTE", reason: "A Loja não existe ou não pertence a este Dono." });
      return ok(toStore(data));
    },
    async findByIdForOwner(ownerId: string, storeId: string): Promise<Store | null> {
      const { data } = await supabase.from("stores").select().eq("id", storeId).eq("owner_id", ownerId).maybeSingle();
      return data ? toStore(data) : null;
    },
    async listByOwner(ownerId: string): Promise<Store[]> {
      const { data } = await supabase.from("stores").select().eq("owner_id", ownerId).order("created_at");
      return (data ?? []).map(toStore);
    },
    async findByIdentifier(identifier: string): Promise<Store | null> {
      const { data } = await supabase.from("stores").select().ilike("identifier", identifier).maybeSingle();
      return data ? toStore(data) : null;
    },
    async isIdentifierTaken(identifier: string): Promise<boolean> {
      const { count } = await supabase.from("stores").select("id", { count: "exact", head: true }).ilike("identifier", identifier);
      return (count ?? 0) > 0;
    },
  };
}

/* ---------------------------- ProductRepository ------------------------- */
export function createSupabaseProductRepository(): ProductRepository {
  return {
    async create(storeId: string, product: Product): Promise<Product> {
      const row = { id: product.id, store_id: storeId, name: product.name, description: product.description,
        category: product.category ?? null,
        featured: product.featured === true,
        physical: product.physical !== false,
        price: product.price, image_url: product.imageUrl ?? null, available: product.available, created_at: product.createdAt };
      const { data, error } = await supabase.from("products").insert(row).select().single();
      if (error) throw new Error(error.message);
      return toProduct(data);
    },
    async update(storeId: string, product: Product): Promise<Product | null> {
      const row = { name: product.name, description: product.description, price: product.price,
        category: product.category ?? null,
        featured: product.featured === true,
        physical: product.physical !== false,
        image_url: product.imageUrl ?? null, available: product.available };
      const { data } = await supabase.from("products").update(row).eq("id", product.id).eq("store_id", storeId).select().maybeSingle();
      return data ? toProduct(data) : null;
    },
    async remove(storeId: string, productId: string): Promise<boolean> {
      const { data } = await supabase.from("products").delete().eq("id", productId).eq("store_id", storeId).select("id").maybeSingle();
      return data !== null;
    },
    async findById(storeId: string, productId: string): Promise<Product | null> {
      const { data } = await supabase.from("products").select().eq("id", productId).eq("store_id", storeId).maybeSingle();
      return data ? toProduct(data) : null;
    },
    async listByStore(storeId: string): Promise<Product[]> {
      const { data } = await supabase.from("products").select().eq("store_id", storeId).order("created_at");
      return (data ?? []).map(toProduct);
    },
  };
}

/* ----------------------------- BannerRepository ------------------------- */
export function createSupabaseBannerRepository(): BannerRepository {
  return {
    async create(storeId: string, banner: Banner): Promise<Banner> {
      const row = { id: banner.id, store_id: storeId, image_url: banner.imageUrl, position: banner.position, created_at: banner.createdAt };
      const { data, error } = await supabase.from("banners").insert(row).select().single();
      if (error) throw new Error(error.message);
      return toBanner(data);
    },
    async remove(storeId: string, bannerId: string): Promise<boolean> {
      const { data } = await supabase.from("banners").delete().eq("id", bannerId).eq("store_id", storeId).select("id").maybeSingle();
      return data !== null;
    },
    async findById(storeId: string, bannerId: string): Promise<Banner | null> {
      const { data } = await supabase.from("banners").select().eq("id", bannerId).eq("store_id", storeId).maybeSingle();
      return data ? toBanner(data) : null;
    },
    async listByStore(storeId: string): Promise<Banner[]> {
      const { data } = await supabase.from("banners").select().eq("store_id", storeId).order("position");
      return (data ?? []).map(toBanner);
    },
    async countByStore(storeId: string): Promise<number> {
      const { count } = await supabase.from("banners").select("id", { count: "exact", head: true }).eq("store_id", storeId);
      return count ?? 0;
    },
  };
}

/* ------------------------------ AssetRepository ------------------------- */
export function createSupabaseAssetRepository(): AssetRepository {
  function row(storeId: string, a: Asset) {
    return { id: a.id, store_id: storeId, kind: a.kind, url: a.url, format: a.format, size_bytes: a.sizeBytes };
  }
  return {
    async create(storeId: string, asset: Asset): Promise<Asset> {
      const { data, error } = await supabase.from("assets").insert(row(storeId, asset)).select().single();
      if (error) throw new Error(error.message);
      return toAsset(data);
    },
    async upsertLogo(storeId: string, asset: Asset): Promise<Asset> {
      // Garante no máximo um logótipo por Loja: remove o anterior, insere o novo.
      await supabase.from("assets").delete().eq("store_id", storeId).eq("kind", "logo");
      const { data, error } = await supabase.from("assets").insert(row(storeId, { ...asset, kind: "logo" })).select().single();
      if (error) throw new Error(error.message);
      return toAsset(data);
    },
    async remove(storeId: string, assetId: string): Promise<boolean> {
      const { data } = await supabase.from("assets").delete().eq("id", assetId).eq("store_id", storeId).select("id").maybeSingle();
      return data !== null;
    },
    async findById(storeId: string, assetId: string): Promise<Asset | null> {
      const { data } = await supabase.from("assets").select().eq("id", assetId).eq("store_id", storeId).maybeSingle();
      return data ? toAsset(data) : null;
    },
    async findLogo(storeId: string): Promise<Asset | null> {
      const { data } = await supabase.from("assets").select().eq("store_id", storeId).eq("kind", "logo").maybeSingle();
      return data ? toAsset(data) : null;
    },
    async listByStore(storeId: string, kind?: AssetKind): Promise<Asset[]> {
      let q = supabase.from("assets").select().eq("store_id", storeId);
      if (kind) q = q.eq("kind", kind);
      const { data } = await q;
      return (data ?? []).map(toAsset);
    },
  };
}
