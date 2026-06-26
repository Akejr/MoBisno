-- =====================================================================
-- MôBisno — Pedidos de levantamento.
--
-- O comerciante solicita um levantamento no painel; o pedido fica registado e
-- é processado depois pela plataforma (/admin, futuro). O "disponível para
-- levantar" é calculado na app: total líquido recebido − levantamentos já
-- pedidos/pagos (não rejeitados).
--
-- Executar no Supabase → SQL Editor (depois de 0001..0009).
-- =====================================================================

do $$ begin
  create type public.withdrawal_status as enum ('requested', 'approved', 'paid', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.withdrawals (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete cascade,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  amount           numeric(12,2) not null check (amount >= 0),
  status           public.withdrawal_status not null default 'requested',
  bank_name        text,
  beneficiary_name text,
  iban             text,
  note             text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz
);
create index if not exists withdrawals_store_idx on public.withdrawals (store_id, created_at desc);
create index if not exists withdrawals_owner_idx on public.withdrawals (owner_id);

alter table public.withdrawals enable row level security;

-- O dono vê os seus pedidos e pode criar novos (tem de ser dono da loja).
-- O processamento (aprovar/pagar/rejeitar) é feito pela plataforma (service role).
drop policy if exists withdrawals_owner_read on public.withdrawals;
create policy withdrawals_owner_read on public.withdrawals
  for select using (owner_id = auth.uid());

drop policy if exists withdrawals_owner_insert on public.withdrawals;
create policy withdrawals_owner_insert on public.withdrawals
  for insert with check (owner_id = auth.uid() and public.owns_store(store_id));
