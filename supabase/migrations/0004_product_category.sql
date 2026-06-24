-- =====================================================================
-- MôBisno — Categoria de Produto.
-- Adiciona uma coluna de categoria (texto livre) aos produtos.
-- Executar uma vez no SQL Editor do Supabase.
-- =====================================================================

alter table public.products
  add column if not exists category text;

-- Índice para filtrar produtos por categoria dentro de uma loja.
create index if not exists products_store_category_idx
  on public.products (store_id, category);
