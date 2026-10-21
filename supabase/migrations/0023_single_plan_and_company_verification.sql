-- =====================================================================
-- 0023 — Plano único de 10.000 Kz/mês e verificação de empresas para os
--        pagamentos digitais.
-- =====================================================================
--
-- O QUE MUDA
--
--  1. Um só plano, tudo incluído, lojas ilimitadas. Desaparece o preço por loja
--     publicada da 0020: publicar volta a exigir só conta ativa, e as colunas de
--     lugares pagos (`profiles.plan_stores`, `plan_payments.stores`) saem.
--  2. Pagamentos digitais (Multicaixa Express e Referência Bancária) só para
--     empresas verificadas. O Dono envia, no separador «Pagamentos», o nome e o
--     NIF da empresa, a conta bancária e dois documentos (Matrícula e
--     Certidão). O Administrador aprova ou rejeita no Painel. A aprovação liga
--     `stores.digital_payments` (criada na 0022), que é o que o checkout lê.
--  3. Os documentos ficam num bucket PRIVADO, `company-documents`.
--  4. A integração MoMenu saiu: `store_payments.momenu_api_key` e o interruptor
--     `online_enabled` (que o Dono ligava sozinho) desaparecem.
--  5. Preparação para o fornecedor de pagamentos novo: uma referência genérica
--     do fornecedor (`provider_ref`) nas encomendas e nos pagamentos de plano, e
--     `activated_at`, que torna a ativação de um pagamento de plano idempotente
--     (antes, cada «Já paguei — verificar» somava mais 30 dias).
--
-- Executar no Supabase → SQL Editor (depois de 0022). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Plano único: publicar exige só conta ativa
-- ---------------------------------------------------------------------
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
$$ language plpgsql security definer set search_path = public;

drop trigger if exists stores_publish_requires_plan on public.stores;
create trigger stores_publish_requires_plan
  before insert or update of state on public.stores
  for each row execute function public.enforce_publish_requires_plan();

drop function if exists public.published_store_count(uuid, uuid);

alter table public.profiles drop constraint if exists profiles_plan_stores_positive;
alter table public.profiles drop column if exists plan_stores;
alter table public.plan_payments drop column if exists stores;

-- ---------------------------------------------------------------------
-- 2. Fornecedor de pagamentos (genérico) e ativação idempotente
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists provider_ref text;
create index if not exists orders_provider_ref_idx on public.orders (provider_ref);

-- Decomposição do total, calculada no servidor (`api/_payments.js`): o Dono vê
-- quanto foi de produtos, de entrega e de desconto, e o uso do código só é
-- contado quando a encomenda é paga.
alter table public.orders
  add column if not exists subtotal numeric(12,2),
  add column if not exists delivery_fee numeric(12,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists discount_code_id uuid references public.discount_codes (id) on delete set null;

alter table public.plan_payments add column if not exists provider_ref text;
alter table public.plan_payments add column if not exists activated_at timestamptz;
create index if not exists plan_payments_provider_ref_idx on public.plan_payments (provider_ref);

-- Os pagamentos de plano já pagos contam como ativados: não voltam a somar dias.
update public.plan_payments
   set activated_at = coalesce(paid_at, now())
 where status = 'paid' and activated_at is null;

-- ---------------------------------------------------------------------
-- 3. Verificação de empresa em `store_payments`
-- ---------------------------------------------------------------------
alter table public.store_payments
  add column if not exists company_name text,
  add column if not exists company_nif text,
  add column if not exists doc_matricula text,
  add column if not exists doc_certidao text,
  add column if not exists verification_status text not null default 'none',
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

alter table public.store_payments drop constraint if exists store_payments_verification_status_valid;
alter table public.store_payments
  add constraint store_payments_verification_status_valid
  check (verification_status in ('none', 'pending', 'approved', 'rejected'));

-- Um pedido em análise ou aprovado tem tudo preenchido. É a base de dados a
-- impedir uma aprovação sem documentos, não só o formulário.
alter table public.store_payments drop constraint if exists store_payments_submission_complete;
alter table public.store_payments
  add constraint store_payments_submission_complete check (
    verification_status in ('none', 'rejected') or (
      coalesce(btrim(company_name), '') <> ''
      and coalesce(btrim(company_nif), '') <> ''
      and coalesce(btrim(bank_name), '') <> ''
      and coalesce(btrim(beneficiary_name), '') <> ''
      and coalesce(btrim(iban), '') <> ''
      and doc_matricula is not null
      and doc_certidao is not null
    )
  );

-- A MoMenu saiu, e com ela a chave por loja e o interruptor que o Dono ligava.
alter table public.store_payments drop column if exists momenu_api_key;
alter table public.store_payments drop column if exists online_enabled;

-- O Dono escreve os dados e submete; não se aprova nem se rejeita. Mudar dados
-- já aprovados devolve o pedido a «em análise» (um IBAN trocado tem de ser
-- verificado de novo). SECURITY INVOKER de propósito — ver `request_is_privileged`.
create or replace function public.store_payments_guard() returns trigger
language plpgsql as $$
declare
  dados_mudaram boolean;
begin
  if public.request_is_privileged() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status is distinct from 'pending' then
      new.verification_status := 'none';
    end if;
    new.rejection_reason := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.submitted_at := case when new.verification_status = 'pending' then now() else null end;
    return new;
  end if;

  new.reviewed_at := old.reviewed_at;
  new.reviewed_by := old.reviewed_by;
  dados_mudaram :=
    (new.company_name, new.company_nif, new.doc_matricula, new.doc_certidao,
     new.bank_name, new.beneficiary_name, new.iban)
    is distinct from
    (old.company_name, old.company_nif, old.doc_matricula, old.doc_certidao,
     old.bank_name, old.beneficiary_name, old.iban);

  if new.verification_status = 'pending' and old.verification_status is distinct from 'pending' then
    -- Submissão (primeira, ou de novo depois de rejeitado/aprovado).
    new.submitted_at := now();
    new.rejection_reason := null;
  elsif dados_mudaram and old.verification_status in ('approved', 'pending') then
    new.verification_status := 'pending';
    new.submitted_at := now();
    new.rejection_reason := null;
  else
    -- Qualquer outra mudança de estado vinda do Dono é ignorada.
    new.verification_status := old.verification_status;
    new.rejection_reason := old.rejection_reason;
    new.submitted_at := old.submitted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists store_payments_guard on public.store_payments;
create trigger store_payments_guard
  before insert or update on public.store_payments
  for each row execute function public.store_payments_guard();

-- O interruptor público acompanha a aprovação. Corre como quem fez a alteração:
-- o Dono (que só o pode desligar, pela `stores_guard`) ou o Administrador.
create or replace function public.store_payments_sync_store() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    update public.stores set digital_payments = false
     where id = old.store_id and digital_payments;
    return old;
  end if;
  update public.stores set digital_payments = (new.verification_status = 'approved')
   where id = new.store_id
     and digital_payments is distinct from (new.verification_status = 'approved');
  return new;
end;
$$;

drop trigger if exists store_payments_sync_store on public.store_payments;
create trigger store_payments_sync_store
  after insert or update or delete on public.store_payments
  for each row execute function public.store_payments_sync_store();

-- Lojas que tinham a MoMenu ligada não ficam aprovadas por herança: a regra
-- nova exige a verificação de empresa.
update public.stores s set digital_payments = false
 where s.digital_payments
   and not exists (
     select 1 from public.store_payments p
      where p.store_id = s.id and p.verification_status = 'approved'
   );

-- ---------------------------------------------------------------------
-- 4. Bucket privado para os documentos da empresa
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-documents', 'company-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company-documents owner read" on storage.objects;
drop policy if exists "company-documents owner insert" on storage.objects;
drop policy if exists "company-documents admin delete" on storage.objects;

-- O Dono vê e envia os documentos das lojas dele; o Administrador vê todos
-- (`storage_owns_store_path` inclui `is_admin()`). Não há `update`: cada envio é
-- um ficheiro novo, com nome novo, e é a mudança de caminho em
-- `store_payments` que devolve o pedido a «em análise». Substituir o conteúdo de
-- um ficheiro já aprovado, mantendo o nome, deixaria a aprovação a valer para um
-- documento que ninguém viu.
create policy "company-documents owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'company-documents' and public.storage_owns_store_path(name));
create policy "company-documents owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-documents' and public.storage_owns_store_path(name));
create policy "company-documents admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-documents' and public.is_admin());
