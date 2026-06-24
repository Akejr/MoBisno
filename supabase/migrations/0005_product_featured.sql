-- =====================================================================
-- MôBisno — Produto destacado ("Destaques").
-- Adiciona uma flag de destaque aos produtos. Toda a loja tem, por
-- convenção, uma categoria "Destaques" composta pelos produtos com featured=true.
-- Executar uma vez no SQL Editor do Supabase.
-- =====================================================================

alter table public.products
  add column if not exists featured boolean not null default false;

create index if not exists products_store_featured_idx
  on public.products (store_id, featured);
