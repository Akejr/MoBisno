-- =====================================================================
-- MôBisno — Pagamentos online (MoMenu) + encomendas.
--
-- Adiciona:
--  - public.store_payments : configuração de pagamentos por loja (ativação,
--    chave MoMenu do comerciante e dados bancários). SENSÍVEL: sem leitura
--    pública. A chave nunca chega ao frontend — as funções serverless leem-na
--    com a service role (ver api/payment.js).
--  - public.orders : encomendas/transações (MCX, referência e WhatsApp), com
--    o id de transação MoMenu para mapear os webhooks.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0007).
-- =====================================================================

-- ----------------------------------------------------------------------
-- Configuração de pagamentos por loja.
-- ----------------------------------------------------------------------
create table if not exists public.store_payments (
  store_id         uuid primary key references public.stores (id) on delete cascade,
  online_enabled   boolean not null default false,
  -- Chave de API MoMenu do comerciante (lida só no servidor via service role).
  momenu_api_key   text,
  -- Conta bancária angolana verificada (para os depósitos do levantamento instantâneo).
  bank_name        text,
  beneficiary_name text,
  iban             text,
  updated_at       timestamptz not null default now()
);

alter table public.store_payments enable row level security;

-- O dono lê/escreve a configuração da sua loja. NÃO há política de leitura
-- pública: a chave MoMenu nunca é exposta a visitantes.
drop policy if exists store_payments_owner_all on public.store_payments;
create policy store_payments_owner_all on public.store_payments
  for all using (public.owns_store(store_id)) with check (public.owns_store(store_id));

-- ----------------------------------------------------------------------
-- Encomendas / transações.
-- ----------------------------------------------------------------------
do $$ begin
  create type public.order_status as enum ('open', 'paid', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references public.stores (id) on delete cascade,
  method                  text not null check (method in ('mcx', 'reference', 'whatsapp')),
  status                  public.order_status not null default 'open',
  -- Id de transação do comerciante (devolvido pela MoMenu) — chave dos webhooks.
  merchant_transaction_id text,
  operation_id            text,
  amount                  numeric(12,2) not null check (amount >= 0),
  fee                     numeric(12,2) not null default 0,
  net                     numeric(12,2) not null default 0,
  currency                text not null default 'AOA',
  products                jsonb not null default '[]'::jsonb,
  customer                jsonb,
  reference_entity        text,
  reference_number        text,
  reference_due_date      text,
  invoice_url             text,
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz
);
create index if not exists orders_store_idx on public.orders (store_id);
create index if not exists orders_mtx_idx on public.orders (merchant_transaction_id);
create index if not exists orders_status_idx on public.orders (store_id, status);

alter table public.orders enable row level security;

-- O dono vê as encomendas das suas lojas. A criação/atualização das encomendas
-- é feita pelas funções serverless (service role, que ignora o RLS); por isso
-- não há políticas de insert/update públicas aqui.
drop policy if exists orders_owner_read on public.orders;
create policy orders_owner_read on public.orders
  for select using (public.owns_store(store_id));

-- ----------------------------------------------------------------------
-- Pagamentos de planos da plataforma (a receita é da plataforma, não da loja).
-- Registados à parte; não aparecem no dashboard de nenhum comerciante.
-- ----------------------------------------------------------------------
create table if not exists public.plan_payments (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references auth.users (id) on delete cascade,
  plan                    text not null,
  amount                  numeric(12,2) not null check (amount >= 0),
  method                  text not null check (method in ('mcx', 'reference')),
  status                  public.order_status not null default 'open',
  merchant_transaction_id text,
  operation_id            text,
  reference_entity        text,
  reference_number        text,
  reference_due_date      text,
  invoice_url             text,
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz
);
create index if not exists plan_payments_owner_idx on public.plan_payments (owner_id);
create index if not exists plan_payments_mtx_idx on public.plan_payments (merchant_transaction_id);

alter table public.plan_payments enable row level security;

-- O dono vê os seus próprios pagamentos de plano (histórico). Escrita só via servidor.
drop policy if exists plan_payments_owner_read on public.plan_payments;
create policy plan_payments_owner_read on public.plan_payments
  for select using (owner_id = auth.uid());
