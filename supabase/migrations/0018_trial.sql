-- =====================================================================
-- MôBisno — Teste grátis de 1 semana + suspensão da loja sem pagamento.
--
-- Cada conta tem 7 dias de teste a partir da criação (`trial_ends_at`).
-- Uma conta tem ACESSO (loja online) se:
--   * está dentro do teste (trial_ends_at > agora), OU
--   * tem um plano pago ativo (plan_expires_at > agora), OU
--   * é administrador.
-- Quando o acesso termina, a loja deixa de ser pública (imposto por RLS).
--
-- Executar no Supabase → SQL Editor (depois de 0001..0017).
-- =====================================================================

-- Coluna de fim do teste. O default preenche as contas existentes com +7 dias
-- (uma semana fresca) e as novas contas a partir da criação.
alter table public.profiles
  add column if not exists trial_ends_at timestamptz default (now() + interval '7 days');

-- Garante que contas antigas sem valor ficam com uma semana.
update public.profiles set trial_ends_at = now() + interval '7 days' where trial_ends_at is null;

-- A conta tem acesso (loja pode estar online)?
create or replace function public.account_active(uid uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and (
      coalesce(p.is_admin, false) = true
      or coalesce(p.trial_ends_at, 'epoch'::timestamptz) > now()
      or coalesce(p.plan_expires_at, 'epoch'::timestamptz) > now()
    )
  );
$$ language sql security definer stable;

-- Leitura pública das lojas: Publicada E com conta ativa (teste/plano).
drop policy if exists stores_public_read on public.stores;
create policy stores_public_read on public.stores
  for select using (state = 'Publicada' and public.account_active(owner_id));
