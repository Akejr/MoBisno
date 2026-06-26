-- =====================================================================
-- MôBisno — Faturação de planos (expiração + carry-over).
--
-- Adiciona ao perfil:
--   plan_expires_at  → fim do período de subscrição pago (NULL = básico/perm.)
--   next_plan        → plano agendado para o próximo período (carry-over)
--
-- Regras (ver src/services/billing.ts):
--   * básico nunca expira (linha de base gratuita);
--   * plano pago com plan_expires_at é temporizado (30 dias);
--   * ao expirar, cai para básico — exceto se houver next_plan que ainda cubra.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0011).
-- =====================================================================

alter table public.profiles
  add column if not exists plan_expires_at timestamptz,
  add column if not exists next_plan text;

do $$ begin
  alter table public.profiles
    add constraint profiles_next_plan_valid
    check (next_plan is null or next_plan in ('basico', 'profissional', 'empresarial'));
exception when duplicate_object then null; end $$;

-- Índice para o admin listar rapidamente planos quase a expirar.
create index if not exists profiles_plan_expires_at_idx
  on public.profiles (plan_expires_at)
  where plan_expires_at is not null;
