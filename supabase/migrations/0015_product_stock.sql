-- =====================================================================
-- MôBisno — Controlo de stock por produto.
--
-- `stock` NULL  → stock não controlado (produto sempre disponível);
-- `stock` >= 0  → quantidade disponível (0 = esgotado).
-- Decrementado no servidor (service role) a cada venda paga.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0014).
-- =====================================================================

alter table public.products
  add column if not exists stock integer;

do $$ begin
  alter table public.products
    add constraint products_stock_nonneg check (stock is null or stock >= 0);
exception when duplicate_object then null; end $$;
