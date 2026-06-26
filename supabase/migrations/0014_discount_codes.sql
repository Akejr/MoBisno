-- =====================================================================
-- MôBisno — Códigos de desconto por loja.
--
-- O dono cria códigos (percentagem ou valor fixo), vê os usos e pode apagar.
-- O checkout valida o código (leitura pública de códigos ativos) e o servidor
-- incrementa os usos quando a encomenda é criada.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0013).
-- =====================================================================

create table if not exists public.discount_codes (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  code        text not null,
  type        text not null check (type in ('percent', 'fixed')),
  value       numeric(12,2) not null check (value > 0),
  active      boolean not null default true,
  uses        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (store_id, code)
);

create index if not exists discount_codes_store_idx on public.discount_codes (store_id);

alter table public.discount_codes enable row level security;

-- O dono gere os códigos das suas lojas.
do $$ begin
  create policy discount_codes_owner_all on public.discount_codes
    for all using (
      exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
    ) with check (
      exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- Leitura pública dos códigos ativos (o checkout valida o código).
do $$ begin
  create policy discount_codes_public_read on public.discount_codes
    for select using (active = true);
exception when duplicate_object then null; end $$;

-- Admin: acesso total.
drop policy if exists discount_codes_admin_all on public.discount_codes;
create policy discount_codes_admin_all on public.discount_codes
  for all using (public.is_admin()) with check (public.is_admin());
