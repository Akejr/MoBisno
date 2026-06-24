-- =====================================================================
-- MôBisno — Esquema inicial (Postgres / Supabase) + RLS
-- Modelo de segurança: Browser + RLS + Supabase Auth.
-- Cada Dono_da_Loja = um utilizador do Supabase Auth (auth.users).
-- O isolamento de inquilino (Req 5.2, 7.9) é imposto por políticas RLS.
-- A loja publicada é de leitura pública (Req 9.x).
-- =====================================================================

-- Perfil do Dono_da_Loja (espelha StoreOwner; id = auth.uid()).
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Estado da Loja (corresponde a StoreState).
do $$ begin
  create type public.store_state as enum ('Rascunho', 'Publicada');
exception when duplicate_object then null; end $$;

-- Loja.
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  store_type  text not null,
  template_id text not null,
  identifier  text not null,
  subdomain   text not null,
  state       public.store_state not null default 'Rascunho',
  created_at  timestamptz not null default now(),
  -- Unicidade de identificador na Plataforma (case-insensitive).
  constraint stores_identifier_unique unique (identifier),
  -- Coerência de subdomínio.
  constraint stores_subdomain_coherent check (subdomain = identifier || '.mobisno.com')
);
create index if not exists stores_owner_idx on public.stores (owner_id);
create unique index if not exists stores_identifier_lower_idx on public.stores (lower(identifier));

-- Produto.
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category    text,
  price       numeric(12,2) not null check (price >= 0 and price <= 999999999.99),
  image_url   text,
  available   boolean not null default true,
  featured    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists products_store_idx on public.products (store_id);

-- Banner (máximo de 10 por Loja — imposto na app + trigger abaixo).
create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  image_url   text not null,
  position    integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists banners_store_idx on public.banners (store_id);

-- Asset (Logótipo/produto/banner). No máximo um logótipo por Loja.
create table if not exists public.assets (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  kind       text not null check (kind in ('logo','product','banner')),
  url        text not null,
  format     text not null check (format in ('png','jpeg','svg','webp')),
  size_bytes integer not null
);
create unique index if not exists assets_one_logo_per_store
  on public.assets (store_id) where (kind = 'logo');

-- Limite de 10 banners por Loja (Req 8.1, 8.4).
create or replace function public.enforce_banner_limit() returns trigger as $$
begin
  if (select count(*) from public.banners where store_id = new.store_id) >= 10 then
    raise exception 'Foi atingido o número máximo de 10 Banners por Loja.';
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists banners_limit_trg on public.banners;
create trigger banners_limit_trg before insert on public.banners
  for each row execute function public.enforce_banner_limit();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.stores   enable row level security;
alter table public.products enable row level security;
alter table public.banners  enable row level security;
alter table public.assets   enable row level security;

-- Perfis: cada um gere o seu.
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Lojas: o dono gere as suas (isolamento, Req 5.2).
create policy stores_owner_all on public.stores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Lojas: leitura pública apenas das Publicadas (storefront, Req 9.1/9.4).
create policy stores_public_read on public.stores
  for select using (state = 'Publicada');

-- Helper: a Loja pertence ao utilizador autenticado?
create or replace function public.owns_store(target uuid) returns boolean as $$
  select exists (select 1 from public.stores s where s.id = target and s.owner_id = auth.uid());
$$ language sql security definer stable;

-- Helper: a Loja está publicada?
create or replace function public.store_published(target uuid) returns boolean as $$
  select exists (select 1 from public.stores s where s.id = target and s.state = 'Publicada');
$$ language sql security definer stable;

-- Produtos: dono gere; leitura pública só de disponíveis de Lojas publicadas (Req 7.8/7.9).
create policy products_owner_all on public.products
  for all using (public.owns_store(store_id)) with check (public.owns_store(store_id));
create policy products_public_read on public.products
  for select using (available = true and public.store_published(store_id));

-- Banners: dono gere; leitura pública de Lojas publicadas (Req 8.5).
create policy banners_owner_all on public.banners
  for all using (public.owns_store(store_id)) with check (public.owns_store(store_id));
create policy banners_public_read on public.banners
  for select using (public.store_published(store_id));

-- Assets: dono gere; leitura pública de Lojas publicadas (Req 6.5/6.6).
create policy assets_owner_all on public.assets
  for all using (public.owns_store(store_id)) with check (public.owns_store(store_id));
create policy assets_public_read on public.assets
  for select using (public.store_published(store_id));

-- =====================================================================
-- Storage (buckets públicos para imagens). Executar uma vez.
-- =====================================================================
insert into storage.buckets (id, name, public)
  values ('store-assets', 'store-assets', true)
  on conflict (id) do nothing;

-- Leitura pública dos ficheiros; escrita apenas autenticada.
create policy "store-assets public read" on storage.objects
  for select using (bucket_id = 'store-assets');
create policy "store-assets auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'store-assets');
create policy "store-assets auth update" on storage.objects
  for update to authenticated using (bucket_id = 'store-assets');
create policy "store-assets auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'store-assets');
