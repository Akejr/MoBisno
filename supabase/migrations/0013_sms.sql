-- =====================================================================
-- MôBisno — Créditos de SMS de confirmação.
--
-- Cada SMS de confirmação custa 300 Kz. O dono compra pacotes (15/50/100/200)
-- e o saldo fica em `stores.sms_credits`. As compras ficam em `sms_purchases`
-- e são creditadas no servidor (service role) quando o pagamento é confirmado.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0012).
-- =====================================================================

alter table public.stores
  add column if not exists sms_credits integer not null default 0;

create table if not exists public.sms_purchases (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  quantity      integer not null check (quantity > 0),
  amount        numeric(12,2) not null check (amount >= 0),
  method        text not null check (method in ('mcx', 'reference')),
  status        text not null default 'open' check (status in ('open', 'paid', 'failed', 'cancelled')),
  credited      boolean not null default false,
  merchant_transaction_id text,
  operation_id  text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists sms_purchases_store_idx on public.sms_purchases (store_id);
create index if not exists sms_purchases_mtx_idx on public.sms_purchases (merchant_transaction_id);

alter table public.sms_purchases enable row level security;

-- O dono lê as compras das suas lojas.
do $$ begin
  create policy sms_purchases_owner_read on public.sms_purchases
    for select using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Admin: acesso total.
drop policy if exists sms_purchases_admin_all on public.sms_purchases;
create policy sms_purchases_admin_all on public.sms_purchases
  for all using (public.is_admin()) with check (public.is_admin());
