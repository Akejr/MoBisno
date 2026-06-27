-- =====================================================================
-- MôBisno — Eventos de loja (analytics simples do Dono).
--
-- Regista visitas à loja e visualizações de produto. Inserção pública (o
-- visitante regista o evento); leitura apenas pelo Dono da loja. Admin total.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0016).
-- =====================================================================

create table if not exists public.store_events (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  type        text not null check (type in ('visit', 'product_view')),
  product_id  uuid references public.products (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists store_events_store_idx on public.store_events (store_id, created_at);

alter table public.store_events enable row level security;

-- Inserção pública para lojas publicadas.
do $$ begin
  create policy store_events_public_insert on public.store_events
    for insert with check (
      exists (select 1 from public.stores s where s.id = store_id and s.state = 'Publicada')
    );
exception when duplicate_object then null; end $$;

-- O Dono lê os eventos das suas lojas.
do $$ begin
  create policy store_events_owner_read on public.store_events
    for select using (
      exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- Admin: acesso total.
drop policy if exists store_events_admin_all on public.store_events;
create policy store_events_admin_all on public.store_events
  for all using (public.is_admin()) with check (public.is_admin());
