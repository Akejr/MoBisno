-- =====================================================================
-- 0020 — Preço por Loja publicada
-- =====================================================================
--
-- A subscrição passa a pagar **uma Loja publicada**. Cada Loja adicional que o
-- Dono queira online custa outro ciclo. Uma Loja em rascunho não conta: é isso
-- que lhe permite despublicar uma Loja no ecrã de pagamento e ver a mensalidade
-- descer antes de pagar.
--
-- Contas de **administrador** não têm limite nem pagam: administram a
-- Plataforma, e as lojas-modelo (demonstrações dos modelos) são Lojas como as
-- outras.
--
-- O que esta migração faz, e porque cada parte existe:
--
--  1. `profiles.plan_stores` — quantas Lojas o ciclo em curso paga. Sem esta
--     coluna, o número de lugares pagos não existia em lado nenhum e a única
--     forma de o saber seria recontar pagamentos.
--  2. `plan_payments.stores` — quantas Lojas **aquele pagamento** cobre. Uma
--     referência bancária pode ser paga dias depois: o que se ativa então é o
--     que foi cobrado, não o número de Lojas do dia em que foi paga.
--  3. O gatilho de publicação passa a contar as Lojas publicadas e a exigir
--     lugar pago. É a mesma regra que o painel apresenta, imposta onde não se
--     contorna — sem isto, um pedido directo à API publicava Lojas sem pagar.
--
-- Valor por omissão **1** em `plan_stores`: todas as contas anteriores pagaram
-- uma Loja, e é isso que as mantém exactamente como estavam.

-- ---------------------------------------------------------------------
-- 1. Lugares pagos na conta
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan_stores integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_plan_stores_positive;
alter table public.profiles
  add constraint profiles_plan_stores_positive check (plan_stores >= 1);

comment on column public.profiles.plan_stores is
  'Lojas publicadas que o ciclo pago cobre. 1 por omissão; administradores não são limitados por esta coluna.';

-- ---------------------------------------------------------------------
-- 2. Lojas cobradas em cada pagamento
-- ---------------------------------------------------------------------
alter table public.plan_payments
  add column if not exists stores integer not null default 1;

comment on column public.plan_payments.stores is
  'Lojas que este pagamento cobre. Gravado no momento da cobrança, porque uma referência pode ser paga dias depois.';

-- ---------------------------------------------------------------------
-- 3. Lojas publicadas de um Dono (exclui lojas-modelo)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER porque o gatilho tem de contar Lojas independentemente das
-- políticas de leitura de quem está a publicar.
--
-- As lojas-modelo (identificador `modelo-%`) ficam de fora pela mesma razão que
-- o painel pessoal as esconde: são demonstrações da Plataforma e ninguém as paga.
create or replace function public.published_store_count(uid uuid, exclude_id uuid default null)
returns integer as $$
  select count(*)::int
  from public.stores s
  where s.owner_id = uid
    and s.state = 'Publicada'
    and s.identifier not like 'modelo-%'
    and (exclude_id is null or s.id <> exclude_id);
$$ language sql security definer stable;

-- ---------------------------------------------------------------------
-- 4. Publicar exige conta ativa **e lugar pago**
-- ---------------------------------------------------------------------
-- Substitui a versão de `0019_single_plan.sql`. Continua a bloquear apenas a
-- TRANSIÇÃO para publicada: uma Loja já publicada cuja conta caducou não é
-- despublicada aqui — sai da web por `stores_public_read` e volta sozinha quando
-- o Dono pagar.
create or replace function public.enforce_publish_requires_plan()
returns trigger as $$
declare
  admin_conta boolean;
  lugares integer;
  publicadas integer;
begin
  if new.state <> 'Publicada'
     or (tg_op = 'UPDATE' and old.state is not distinct from 'Publicada') then
    return new;
  end if;

  if not public.account_active(new.owner_id) then
    raise exception 'PLAN_REQUIRED_TO_PUBLISH'
      using hint = 'Ative a subscrição para publicar a loja.';
  end if;

  select coalesce(p.is_admin, false), greatest(coalesce(p.plan_stores, 1), 1)
    into admin_conta, lugares
  from public.profiles p
  where p.id = new.owner_id;

  -- Administrador: sem limite, é a excepção da Plataforma.
  if coalesce(admin_conta, false) then
    return new;
  end if;

  -- Uma loja-modelo não ocupa lugar nem é cobrada.
  if new.identifier like 'modelo-%' then
    return new;
  end if;

  publicadas := public.published_store_count(new.owner_id, new.id);
  if publicadas >= coalesce(lugares, 1) then
    raise exception 'STORE_SLOT_REQUIRED'
      using hint = 'A subscrição cobre ' || coalesce(lugares, 1) || ' loja(s) publicada(s). Pague mais uma loja ou despublique outra.';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists stores_publish_requires_plan on public.stores;
create trigger stores_publish_requires_plan
  before insert or update of state on public.stores
  for each row execute function public.enforce_publish_requires_plan();
