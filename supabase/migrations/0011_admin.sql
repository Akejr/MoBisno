-- =====================================================================
-- MôBisno — Administração da plataforma.
--
-- Adiciona a flag `is_admin` ao perfil e a função `public.is_admin()`, e
-- políticas RLS que dão ao administrador acesso total (ler/gerir) a todas as
-- tabelas. As políticas permissivas são combinadas por OR com as existentes,
-- por isso os donos continuam restritos aos seus dados e o admin vê tudo.
--
-- Tornar uma conta administradora (no SQL Editor):
--   update public.profiles set is_admin = true where email = 'o-teu-email@exemplo.com';
--
-- Executar no Supabase → SQL Editor (depois de 0001..0010).
-- =====================================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin() returns boolean as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
  );
$$ language sql security definer stable;

-- Acesso total do admin a cada tabela.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'stores', 'products', 'banners', 'assets',
    'store_payments', 'orders', 'plan_payments', 'withdrawals'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t
    );
  end loop;
end $$;
