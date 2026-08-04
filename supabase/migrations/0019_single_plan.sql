-- =====================================================================
-- MôBisno — Preço único, sem teste grátis, publicar exige subscrição.
--
-- O QUE MUDA
--   * Deixam de existir escalões (basico/profissional/empresarial). Há um só
--     plano, `pro`, com dois ciclos de pagamento (mensal e anual) que diferem
--     apenas na duração que `plan_expires_at` recebe.
--   * Deixa de existir teste grátis: `trial_ends_at` desaparece.
--   * Deixa de existir plano agendado: `next_plan` desaparece — só fazia
--     sentido para trocar entre escalões.
--   * A conta está ativa se for de administrador OU se `plan_expires_at` for
--     futuro. É a regra inteira.
--   * PUBLICAR passa a exigir conta ativa, imposto pela BASE DE DADOS. Antes,
--     o dono podia pôr `state = 'Publicada'` com a chave anónima; a loja ficava
--     invisível por `stores_public_read`, mas publicar «resultava» — uma falha
--     silenciosa e confusa.
--
-- PORQUÊ: os escalões traziam uma matriz de limites e uma máquina de faturação
-- com cinco ramos, e daí nasceu a avaria em que uma loja com pagamentos ligados
-- recusava cobrar (o painel lia um plano, o servidor lia outro). O escalão
-- Básico desligava ainda o Multicaixa Express — cobrava-se a alguém para essa
-- pessoa não poder receber pagamentos online.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0018).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Plano único
-- ---------------------------------------------------------------------

-- As restrições antigas listam os escalões: saem antes de reescrever os dados.
alter table public.profiles drop constraint if exists profiles_plan_valid;
alter table public.profiles drop constraint if exists profiles_next_plan_valid;

-- Toda a gente passa a ter o mesmo plano. Quem tem acesso ou não é decidido
-- por `plan_expires_at`, não por esta coluna.
update public.profiles set plan = 'pro';

alter table public.profiles alter column plan set default 'pro';
alter table public.profiles
  add constraint profiles_plan_valid check (plan = 'pro');

-- ---------------------------------------------------------------------
-- 2. Sem teste grátis e sem plano agendado
-- ---------------------------------------------------------------------
-- Estas colunas deixam de ser lidas por qualquer caminho do código. Ficarem cá
-- só convidava a que alguém voltasse a apoiar-se nelas.
alter table public.profiles drop column if exists trial_ends_at;
alter table public.profiles drop column if exists next_plan;

-- ---------------------------------------------------------------------
-- 2b. Ciclo de pagamento no registo de pagamentos
-- ---------------------------------------------------------------------
-- O que se compra deixa de ser um escalão e passa a ser um CICLO. É este valor
-- que viaja do checkout até à ativação e decide se `plan_expires_at` recebe 30
-- ou 365 dias. As linhas antigas ficam como estão — são um registo do que foi
-- pago no passado, não um estado a corrigir.
alter table public.plan_payments
  add column if not exists period text not null default 'mensal';

alter table public.plan_payments drop constraint if exists plan_payments_period_valid;
alter table public.plan_payments
  add constraint plan_payments_period_valid check (period in ('mensal', 'anual'));

-- ---------------------------------------------------------------------
-- 3. A conta está ativa?
-- ---------------------------------------------------------------------
-- Substitui a versão de 0018, que também aceitava o teste grátis.
create or replace function public.account_active(uid uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and (
      coalesce(p.is_admin, false) = true
      or coalesce(p.plan_expires_at, 'epoch'::timestamptz) > now()
    )
  );
$$ language sql security definer stable;

-- ---------------------------------------------------------------------
-- 4. Publicar exige conta ativa
-- ---------------------------------------------------------------------
-- O gatilho corre com os privilégios do dono da função e lê `profiles` através
-- de `account_active`, que é SECURITY DEFINER — por isso a verificação não
-- depende das políticas de leitura do utilizador.
--
-- Só bloqueia a TRANSIÇÃO para publicada. Uma loja já publicada cuja conta
-- caducou não é despublicada aqui: continua a sair da web por
-- `stores_public_read`, e volta sozinha ao ar quando o dono pagar.
create or replace function public.enforce_publish_requires_plan()
returns trigger as $$
begin
  if new.state = 'Publicada'
     and (tg_op = 'INSERT' or old.state is distinct from 'Publicada')
     and not public.account_active(new.owner_id) then
    raise exception 'PLAN_REQUIRED_TO_PUBLISH'
      using hint = 'Ative a subscrição para publicar a loja.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists stores_publish_requires_plan on public.stores;
create trigger stores_publish_requires_plan
  before insert or update of state on public.stores
  for each row execute function public.enforce_publish_requires_plan();

-- ---------------------------------------------------------------------
-- 5. Leitura pública (inalterada na forma, repetida por clareza)
-- ---------------------------------------------------------------------
-- `account_active` mudou de conteúdo; a política continua a ser a mesma regra:
-- publicada E com conta ativa.
drop policy if exists stores_public_read on public.stores;
create policy stores_public_read on public.stores
  for select using (state = 'Publicada' and public.account_active(owner_id));
