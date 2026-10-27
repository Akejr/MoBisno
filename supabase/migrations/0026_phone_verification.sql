-- =====================================================================
-- 0026 — Confirmação do telemóvel por SMS
-- =====================================================================
-- Quem cria conta recebe um código de 6 algarismos por SMS (Nsangu, categoria
-- OTP). Confirmar o número deixou de ser opcional para **publicar**: uma loja
-- só vai para o ar se a subscrição dela estiver em vigor **e** o telemóvel do
-- Dono estiver confirmado.
--
-- Quem não receber o código conclui o registo à mesma e confirma depois, no
-- Dashboard. O que fica bloqueado é pôr a loja online, não criar nem
-- personalizar.
--
-- O código **nunca** é gravado: fica o SHA-256 de `<id>:<código>`, e a
-- comparação é feita no servidor. Mesmo com a base de dados à frente, ninguém lê
-- um código por enviar.
--
-- Idempotente: pode ser corrida mais do que uma vez.

-- ---------------------------------------------------------------------
-- 1. O número e a data da confirmação, na conta
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists phone text;

-- As contas que já existem ficam confirmadas, uma vez só, no momento em que a
-- coluna nasce. Sem isto, as lojas já publicadas não se conseguiriam voltar a
-- publicar — e a confirmação por SMS passaria a ser uma dívida de quem já é
-- cliente. A verificação de existência é o que torna isto idempotente: numa
-- segunda passagem, as contas novas **não** são confirmadas em silêncio.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_verified_at'
  ) then
    alter table public.profiles add column phone_verified_at timestamptz;
    update public.profiles set phone_verified_at = now();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. O Dono não se confirma a si próprio
-- ---------------------------------------------------------------------
-- `profiles_guard` (migração 0022) já protegia `is_admin`, `plan` e
-- `plan_expires_at`. As duas colunas novas entram na mesma lista: sem isso, um
-- `update profiles set phone_verified_at = now()` pelo navegador valia tanto
-- como receber a SMS — e trocar `phone` depois de confirmar dava um número
-- confirmado que nunca recebeu nada.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if public.request_is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.plan := 'pro';
    new.plan_expires_at := null;
    new.phone := null;
    new.phone_verified_at := null;
  else
    new.is_admin := old.is_admin;
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.phone := old.phone;
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- 3. Os desafios por confirmar
-- ---------------------------------------------------------------------
-- Uma linha por número a confirmar. `sends` conta as SMS já enviadas (o teto
-- impede que alguém esgote a carteira de SMS a pedir reenvios) e `attempts`
-- conta os códigos errados (o teto impede adivinhar 6 algarismos à força).
create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Normalizado como `2449XXXXXXXX`, o mesmo formato de `normalizeAoPhone`.
  phone text not null,
  -- SHA-256 de `<id>:<código>`. O código em claro não existe em lado nenhum.
  code_hash text not null,
  sends smallint not null default 1,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  -- Id da mensagem na Nsangu, para consultar o estado do envio no suporte.
  provider_message_id text
);

create index if not exists phone_verifications_owner_idx
  on public.phone_verifications (owner_id, created_at desc);

-- RLS ligada e **sem nenhuma política**: nem o Dono nem o Administrador leem
-- esta tabela pelo navegador. Só a service role (as funções de `api/`) lhe
-- toca. Um código por confirmar não é informação de ecrã nenhum.
alter table public.phone_verifications enable row level security;

-- ---------------------------------------------------------------------
-- 4. Publicar exige subscrição **e** telemóvel confirmado
-- ---------------------------------------------------------------------
-- SECURITY DEFINER pelo mesmo motivo de `owner_is_admin` (0025): a leitura
-- corre em nome de quem publica, que não lê `profiles` de outra conta.
create or replace function public.owner_phone_verified(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.phone_verified_at is not null from public.profiles p where p.id = uid), false);
$$;

-- As duas condições em exceções separadas: o painel traduz cada uma na frase
-- que diz onde se resolve, e «não podes publicar» sem dizer porquê é uma
-- não-resposta.
create or replace function public.enforce_publish_requires_plan()
returns trigger as $$
begin
  if new.state = 'Publicada'
     and (tg_op = 'INSERT' or old.state is distinct from 'Publicada')
     and not public.owner_is_admin(new.owner_id) then
    -- O telemóvel primeiro, pela mesma ordem de `canPublishStore`
    -- (`src/services/billing.ts`): é grátis e leva um minuto. Mandar pagar e só
    -- depois pedir a confirmação era guardar a má notícia para o fim.
    if not public.owner_phone_verified(new.owner_id) then
      raise exception 'PHONE_REQUIRED_TO_PUBLISH'
        using hint = 'Confirme o número de telemóvel da conta para publicar.';
    end if;
    if not (coalesce(new.plan_expires_at, 'epoch'::timestamptz) > now()) then
      raise exception 'PLAN_REQUIRED_TO_PUBLISH'
        using hint = 'Ative a subscrição desta loja para a publicar.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists stores_publish_requires_plan on public.stores;
create trigger stores_publish_requires_plan
  before insert or update of state on public.stores
  for each row execute function public.enforce_publish_requires_plan();

-- `stores_public_read` (0025) fica como está, de propósito: só olha para a
-- subscrição. Uma loja no ar nunca tem o telemóvel por confirmar, porque não
-- teria conseguido ser publicada — e não há forma de **des**confirmar um
-- número. Acrescentar a condição à leitura pública só acrescentava uma consulta
-- a cada visita de cliente.
