-- =====================================================================
-- 0025 — A subscrição passa a ser de cada loja
-- =====================================================================
-- Cada loja tem a sua subscrição: 10.000 Kz por 30 dias. Quem tem duas lojas
-- online paga duas. Criar e pré-visualizar continua grátis; o que se paga é pôr
-- cada loja online.
--
-- O fim do período passa de `profiles.plan_expires_at` (da conta) para
-- `stores.plan_expires_at` (de cada loja). A coluna da conta fica, mas deixa de
-- decidir o que está online.
--
-- Idempotente: pode ser corrida mais do que uma vez.

-- 1. A data de fim, por loja.
alter table public.stores add column if not exists plan_expires_at timestamptz;

-- Transição: as lojas de uma conta com subscrição em vigor ficam cobertas até
-- ao fim desse período. Ninguém perde dias que já pagou.
update public.stores s
   set plan_expires_at = p.plan_expires_at
  from public.profiles p
 where p.id = s.owner_id
   and p.plan_expires_at > now()
   and s.plan_expires_at is null;

-- 2. O dono é administrador? SECURITY DEFINER: a leitura pública corre como
-- `anon`, que não lê `profiles`.
create or replace function public.owner_is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

-- 3. Só a plataforma mexe na data: sem isto, o Dono dava-se meses pelo
-- navegador. SECURITY INVOKER de propósito (ver `request_is_privileged`, 0022).
create or replace function public.stores_plan_guard() returns trigger
language plpgsql as $$
begin
  if not public.request_is_privileged() then
    if tg_op = 'INSERT' then
      new.plan_expires_at := null;
    else
      new.plan_expires_at := old.plan_expires_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stores_plan_guard on public.stores;
create trigger stores_plan_guard
  before insert or update on public.stores
  for each row execute function public.stores_plan_guard();

-- 4. Publicar exige a subscrição DESTA loja (ou dono administrador). Os
-- gatilhos BEFORE correm por ordem alfabética: `stores_plan_guard` corre antes
-- de `stores_publish_requires_plan`, por isso a data já chega limpa.
create or replace function public.enforce_publish_requires_plan()
returns trigger as $$
begin
  if new.state = 'Publicada'
     and (tg_op = 'INSERT' or old.state is distinct from 'Publicada')
     and not (
       coalesce(new.plan_expires_at, 'epoch'::timestamptz) > now()
       or public.owner_is_admin(new.owner_id)
     ) then
    raise exception 'PLAN_REQUIRED_TO_PUBLISH'
      using hint = 'Ative a subscrição desta loja para a publicar.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists stores_publish_requires_plan on public.stores;
create trigger stores_publish_requires_plan
  before insert or update of state on public.stores
  for each row execute function public.enforce_publish_requires_plan();

-- 5. Uma loja está online se estiver publicada e a subscrição dela estiver em
-- vigor (ou o dono for administrador).
drop policy if exists stores_public_read on public.stores;
create policy stores_public_read on public.stores
  for select using (
    state = 'Publicada'
    and (coalesce(plan_expires_at, 'epoch'::timestamptz) > now() or public.owner_is_admin(owner_id))
  );

-- 6. Cada pagamento de subscrição é de uma loja.
alter table public.plan_payments
  add column if not exists store_id uuid references public.stores (id) on delete set null;
create index if not exists plan_payments_store_idx on public.plan_payments (store_id);
