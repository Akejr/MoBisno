-- =====================================================================
-- MôBisno — Plano de subscrição por conta (Dono_da_Loja).
-- Adiciona a coluna `plan` ao perfil. As funções da app são ativadas/
-- desativadas com base neste valor (limites de lojas publicadas, produtos,
-- métodos de checkout e domínio próprio). Ver src/services/plans.ts.
-- =====================================================================

alter table public.profiles
  add column if not exists plan text not null default 'basico';

do $$ begin
  alter table public.profiles
    add constraint profiles_plan_valid
    check (plan in ('basico', 'profissional', 'empresarial'));
exception when duplicate_object then null; end $$;
