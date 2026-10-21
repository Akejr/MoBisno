-- =====================================================================
-- 0022 — Segurança: o que o navegador consegue escrever.
-- =====================================================================
--
-- Todo o isolamento da MôBisno é feito por RLS, e a RLS só diz QUE LINHAS cada
-- um pode tocar — não QUE COLUNAS. Várias políticas `for all` davam ao dono da
-- linha poder sobre colunas que não lhe pertencem. Esta migração fecha esses
-- buracos na base de dados, onde não se contornam:
--
--  1. `profiles`: qualquer conta podia pôr `is_admin = true` ou empurrar
--     `plan_expires_at` para o futuro na sua própria linha (`profiles_self`,
--     0001). Ficava administradora — acesso a todas as tabelas, IBANs
--     incluídos — ou com subscrição grátis.
--  2. `stores`: o Dono podia escrever `customization.__template` (a sua loja
--     passava a aparecer na galeria de modelos prontos de toda a gente),
--     `sms_credits` (SMS grátis) e criar lojas com o prefixo reservado
--     `modelo-`.
--  3. Storage `store-assets`: qualquer conta autenticada podia substituir ou
--     apagar ficheiros de QUALQUER loja.
--  4. Avaliações: eram publicadas sem moderação (`approved` por omissão `true`).
--  5. Códigos de desconto: todos os códigos ativos eram listáveis com a chave
--     anónima. Passam a ser validados um a um, por uma função, com validade e
--     limite de usos.
--  6. Levantamentos: o montante era escrito pelo navegador e a base de dados
--     não o comparava com o saldo.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0021). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Quem é privilegiado
-- ---------------------------------------------------------------------
-- Privilegiado = a service role (funções serverless), o SQL Editor (postgres),
-- código que corre dentro de uma função SECURITY DEFINER, ou um administrador.
--
-- `current_user` é o papel que executa o comando. Num pedido do navegador o
-- PostgREST faz `set role authenticated` (ou `anon`); por isso, para os guardas
-- abaixo funcionarem, eles têm de ser SECURITY INVOKER (o predefinido): dentro de
-- uma função SECURITY DEFINER o `current_user` seria sempre o dono da função.
create or replace function public.request_is_privileged() returns boolean
language sql stable as $$
  select current_user not in ('anon', 'authenticated') or public.is_admin();
$$;

-- ---------------------------------------------------------------------
-- 1. profiles: o utilizador não se promove nem se oferece subscrição
-- ---------------------------------------------------------------------
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
  else
    new.is_admin := old.is_admin;
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- 2. stores: marcas internas, créditos de SMS e prefixo reservado
-- ---------------------------------------------------------------------
-- Interruptor público dos pagamentos digitais. Só a aprovação da verificação de
-- empresa o liga (migração 0023); o Dono pode desligá-lo, nunca ligá-lo.
alter table public.stores
  add column if not exists digital_payments boolean not null default false;

create or replace function public.stores_guard() returns trigger
language plpgsql as $$
declare
  marca jsonb;
begin
  if public.request_is_privileged() then
    return new;
  end if;

  if new.identifier ilike 'modelo-%'
     and (tg_op = 'INSERT' or old.identifier is distinct from new.identifier) then
    raise exception 'IDENTIFIER_RESERVED'
      using hint = 'O prefixo «modelo-» está reservado às lojas-modelo da MôBisno.';
  end if;

  if tg_op = 'INSERT' then
    new.customization := coalesce(new.customization, '{}'::jsonb) - '__template';
    new.sms_credits := 0;
    new.digital_payments := false;
  else
    -- `__template` fica exatamente como estava (normalmente ausente).
    marca := old.customization -> '__template';
    new.customization := coalesce(new.customization, '{}'::jsonb) - '__template';
    if marca is not null then
      new.customization := new.customization || jsonb_build_object('__template', marca);
    end if;
    new.sms_credits := old.sms_credits;
    if new.digital_payments and not old.digital_payments then
      new.digital_payments := old.digital_payments;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stores_guard on public.stores;
create trigger stores_guard
  before insert or update on public.stores
  for each row execute function public.stores_guard();

-- ---------------------------------------------------------------------
-- 3. Storage: cada um escreve só nas pastas das suas lojas
-- ---------------------------------------------------------------------
-- As chaves são `<storeId>/<tipo>/<id>.<ext>` (src/services/fileService.ts): a
-- primeira pasta é a loja. `split_part` em vez de `::uuid` — um nome malformado
-- dá `false` em vez de uma exceção a meio da política.
create or replace function public.storage_owns_store_path(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.stores s
    where s.id::text = split_part(object_name, '/', 1)
      and s.owner_id = auth.uid()
  );
$$;

drop policy if exists "store-assets auth write" on storage.objects;
drop policy if exists "store-assets auth update" on storage.objects;
drop policy if exists "store-assets auth delete" on storage.objects;
drop policy if exists "store-assets owner write" on storage.objects;
drop policy if exists "store-assets owner update" on storage.objects;
drop policy if exists "store-assets owner delete" on storage.objects;

create policy "store-assets owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-assets' and public.storage_owns_store_path(name));
create policy "store-assets owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-assets' and public.storage_owns_store_path(name))
  with check (bucket_id = 'store-assets' and public.storage_owns_store_path(name));
create policy "store-assets owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-assets' and public.storage_owns_store_path(name));

-- ---------------------------------------------------------------------
-- 4. Avaliações: entram por aprovar
-- ---------------------------------------------------------------------
-- As que já estão publicadas ficam como estão; só as novas passam pelo Dono.
alter table public.reviews alter column approved set default false;

drop policy if exists reviews_public_insert on public.reviews;
create policy reviews_public_insert on public.reviews
  for insert with check (
    approved = false
    and exists (select 1 from public.stores s where s.id = reviews.store_id and s.state = 'Publicada')
    and exists (select 1 from public.products p where p.id = reviews.product_id and p.store_id = reviews.store_id)
  );

-- ---------------------------------------------------------------------
-- 5. Códigos de desconto: validade, limite de usos e sem listagem pública
-- ---------------------------------------------------------------------
alter table public.discount_codes
  add column if not exists max_uses integer,
  add column if not exists expires_at timestamptz;

alter table public.discount_codes drop constraint if exists discount_codes_max_uses_positive;
alter table public.discount_codes
  add constraint discount_codes_max_uses_positive check (max_uses is null or max_uses > 0);

-- Sem leitura pública: quem tinha a chave anónima listava os códigos todos.
drop policy if exists discount_codes_public_read on public.discount_codes;

-- O checkout valida UM código pelo texto exato. Devolve no máximo uma linha, e
-- nenhuma se o código estiver inativo, caducado ou esgotado.
create or replace function public.validate_discount(p_store_id uuid, p_code text)
returns table (id uuid, code text, type text, value numeric)
language sql stable security definer set search_path = public as $$
  select d.id, d.code, d.type, d.value
  from public.discount_codes d
  where d.store_id = p_store_id
    and d.code = upper(btrim(coalesce(p_code, '')))
    and d.active
    and (d.expires_at is null or d.expires_at > now())
    and (d.max_uses is null or d.uses < d.max_uses)
  limit 1;
$$;

revoke all on function public.validate_discount(uuid, text) from public;
grant execute on function public.validate_discount(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Levantamentos: nunca acima do saldo
-- ---------------------------------------------------------------------
create or replace function public.withdrawals_guard() returns trigger
language plpgsql as $$
declare
  recebido numeric;
  comprometido numeric;
begin
  if public.request_is_privileged() then
    return new;
  end if;
  new.status := 'requested';
  new.processed_at := null;
  select coalesce(sum(o.net), 0) into recebido
    from public.orders o where o.store_id = new.store_id and o.status = 'paid';
  select coalesce(sum(w.amount), 0) into comprometido
    from public.withdrawals w where w.store_id = new.store_id and w.status <> 'rejected';
  if new.amount <= 0 or new.amount > (recebido - comprometido) + 0.005 then
    raise exception 'WITHDRAWAL_ABOVE_BALANCE'
      using hint = 'O valor pedido é maior do que o disponível para levantar.';
  end if;
  return new;
end;
$$;

drop trigger if exists withdrawals_guard on public.withdrawals;
create trigger withdrawals_guard
  before insert on public.withdrawals
  for each row execute function public.withdrawals_guard();

-- ---------------------------------------------------------------------
-- 7. Eventos da loja: o funil de compra
-- ---------------------------------------------------------------------
-- Além das visitas e das visualizações de produto, o Dashboard passa a contar
-- adições ao carrinho, pedidos enviados por WhatsApp e checkouts iniciados.
alter table public.store_events drop constraint if exists store_events_type_check;
alter table public.store_events
  add constraint store_events_type_check
  check (type in ('visit', 'product_view', 'add_to_cart', 'whatsapp_order', 'checkout_start'));
