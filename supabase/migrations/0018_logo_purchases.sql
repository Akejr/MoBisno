-- =====================================================================
-- MôBisno — Criação de logótipo por IA (compra avulsa).
--
-- O cliente gera 5 propostas de logótipo por IA e escolhe uma. A criação custa
-- 5.000 Kz (Multicaixa Express ou Referência Bancária). O logótipo escolhido é
-- carregado para o storage e o URL fica em `logo_purchases.logo_url`. Quando o
-- pagamento é confirmado (no servidor, service role), o URL é acrescentado a
-- `stores.customization.logos` e passa a aparecer em "Criar logótipo → Meus
-- logótipos". As compras aparecem também nas Transações do admin.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0017).
-- =====================================================================

create table if not exists public.logo_purchases (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  logo_url      text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  method        text not null check (method in ('mcx', 'reference')),
  status        text not null default 'open' check (status in ('open', 'paid', 'failed', 'cancelled')),
  fulfilled     boolean not null default false,
  merchant_transaction_id text,
  operation_id  text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists logo_purchases_store_idx on public.logo_purchases (store_id);
create index if not exists logo_purchases_owner_idx on public.logo_purchases (owner_id);
create index if not exists logo_purchases_mtx_idx on public.logo_purchases (merchant_transaction_id);
create index if not exists logo_purchases_op_idx on public.logo_purchases (operation_id);

alter table public.logo_purchases enable row level security;

-- O dono lê as suas compras de logótipo.
do $$ begin
  create policy logo_purchases_owner_read on public.logo_purchases
    for select using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Admin: acesso total.
drop policy if exists logo_purchases_admin_all on public.logo_purchases;
create policy logo_purchases_admin_all on public.logo_purchases
  for all using (public.is_admin()) with check (public.is_admin());
