-- =====================================================================
-- MôBisno — Avaliações de produtos (estrelas + comentário).
--
-- Qualquer visitante pode avaliar (1–5 estrelas). As avaliações aprovadas são
-- públicas; o Dono da Loja modera (esconder/apagar). Admin tem acesso total.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0015).
-- =====================================================================

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 60),
  rating      integer not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 1000),
  approved    boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists reviews_product_idx on public.reviews (product_id);
create index if not exists reviews_store_idx on public.reviews (store_id);

alter table public.reviews enable row level security;

-- Leitura pública das avaliações aprovadas.
do $$ begin
  create policy reviews_public_read on public.reviews
    for select using (approved = true);
exception when duplicate_object then null; end $$;

-- Qualquer visitante pode submeter uma avaliação para uma loja publicada.
do $$ begin
  create policy reviews_public_insert on public.reviews
    for insert with check (
      exists (select 1 from public.stores s where s.id = store_id and s.state = 'Publicada')
    );
exception when duplicate_object then null; end $$;

-- O Dono da Loja vê/modera/apaga as avaliações das suas lojas.
do $$ begin
  create policy reviews_owner_all on public.reviews
    for all using (
      exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
    ) with check (
      exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- Admin: acesso total.
drop policy if exists reviews_admin_all on public.reviews;
create policy reviews_admin_all on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());
