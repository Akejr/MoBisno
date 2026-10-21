-- =====================================================================
-- 0024 — Pagamentos pela Wiza, factura pelo Vero, e as encomendas por
--        WhatsApp a ficarem registadas.
-- =====================================================================
--
-- O QUE MUDA
--
--  1. **Pagamentos (Wiza).** A cobrança passa a ser criada na Wiza, que devolve
--     um checkout alojado; o cliente escolhe lá entre Multicaixa Express e
--     Referência Bancária. As colunas novas em `orders` e `plan_payments`
--     guardam o que a Wiza devolve: o serviço escolhido de facto
--     (`provider_service`) e o código de desfecho (`provider_status_code`), que
--     é o que explica uma recusa.
--
--  2. **Comissão de 5%.** O dinheiro entra na conta da Plataforma no fornecedor
--     e o Dono levanta 95%. `orders.fee` e `orders.net` já existiam; o que falta
--     é a garantia de que o líquido nunca é maior do que o montante.
--
--  3. **Factura (Vero).** Cada venda paga gera uma Factura-Recibo emitida **pela
--     empresa do Dono** — é a empresa dele que vende, não a MôBisno. Para isso,
--     a loja guarda as credenciais Vero da própria empresa em `store_payments`,
--     e a encomenda guarda o documento emitido (`invoice_*`).
--
--  4. **Encomendas por WhatsApp.** Até agora, uma loja sem pagamentos digitais
--     não deixava rasto nenhum: o cliente clicava em «Finalizar via WhatsApp», a
--     conversa abria e o Dono só sabia da encomenda se a mensagem chegasse. A
--     tabela `whatsapp_orders` grava o carrinho e os dados de contacto no
--     momento em que o cliente decide encomendar, para o Dono os ver no painel
--     mesmo que a mensagem nunca chegue.
--
-- Executar no Supabase → SQL Editor (depois de 0023). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O que o fornecedor de pagamentos devolve
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists provider_service text,
  add column if not exists provider_status_code text;

alter table public.plan_payments
  add column if not exists provider_service text,
  add column if not exists provider_status_code text;

-- O líquido do Dono é o montante menos a comissão: nunca maior do que o
-- montante, nunca negativo. Uma comissão trocada no código ficava invisível sem
-- isto. `not valid` para não recusar linhas antigas.
alter table public.orders drop constraint if exists orders_net_within_amount;
alter table public.orders
  add constraint orders_net_within_amount
  check (net is null or amount is null or (net >= 0 and net <= amount)) not valid;

-- ---------------------------------------------------------------------
-- 2. Factura da empresa do Dono (Vero)
-- ---------------------------------------------------------------------
-- As credenciais são da empresa **dele**, não da Plataforma: a factura sai em
-- nome de quem vende. Ficam em `store_payments`, que não tem leitura pública
-- (migração 0008) e só é lida pelo Dono e pelo Administrador.
alter table public.store_payments
  add column if not exists vero_org_id text,
  add column if not exists vero_api_key text;

-- O painel do Dono precisa de saber **se** há chave guardada e se ela é de
-- teste. Não precisa da chave. Estas duas colunas derivadas respondem a isso,
-- e é por elas que o navegador pergunta (`web/supabase/payments.ts`): a chave
-- deixa de ser carregada para a página a cada abertura do separador. Com ela,
-- qualquer pessoa emitia documentos fiscais em nome da empresa do Dono.
alter table public.store_payments
  add column if not exists vero_key_set boolean
    generated always as (coalesce(btrim(vero_api_key), '') <> '') stored,
  add column if not exists vero_key_test boolean
    generated always as (starts_with(coalesce(vero_api_key, ''), 'vero_test_sk_')) stored;

-- A factura emitida, por encomenda.
alter table public.orders
  add column if not exists invoice_id text,
  add column if not exists invoice_number text,
  add column if not exists invoice_status text,
  add column if not exists invoice_error text,
  add column if not exists invoice_issued_at timestamptz,
  -- Momento em que o aviso de venda foi enviado por email. É a guarda que
  -- impede o Dono de receber o mesmo «recebeu uma venda» a cada verificação de
  -- estado.
  add column if not exists notified_at timestamptz;

alter table public.orders drop constraint if exists orders_invoice_status_valid;
alter table public.orders
  add constraint orders_invoice_status_valid
  check (invoice_status is null or invoice_status in ('pending', 'validated', 'rejected', 'failed', 'skipped'));

create index if not exists orders_invoice_pending_idx
  on public.orders (store_id) where invoice_status in ('pending', 'failed');

-- ---------------------------------------------------------------------
-- 3. Encomendas por WhatsApp
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  -- Nome, telemóvel, email, NIF, morada e área — o que o checkout recolheu.
  customer jsonb not null default '{}'::jsonb,
  -- Linhas do carrinho: nome, Combinação, preço e quantidade no momento do clique.
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  -- De onde veio: a página de checkout, a do carrinho ou a gaveta.
  origin text not null default 'checkout',
  -- O Dono marca como tratada depois de falar com o cliente.
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_orders_store_idx
  on public.whatsapp_orders (store_id, created_at desc);

alter table public.whatsapp_orders enable row level security;

-- Qualquer visitante de uma loja publicada pode registar a encomenda que acabou
-- de enviar. Sem leitura pública: o que uma pessoa escreveu no checkout não é
-- visível a mais ninguém. Os limites de tamanho impedem a tabela de ser usada
-- como armazenamento de texto arbitrário.
drop policy if exists whatsapp_orders_public_insert on public.whatsapp_orders;
create policy whatsapp_orders_public_insert on public.whatsapp_orders
  for insert with check (
    handled = false
    and total >= 0
    and jsonb_typeof(customer) = 'object'
    and jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 100
    and length(customer::text) <= 2000
    and length(items::text) <= 20000
    and origin in ('checkout', 'carrinho', 'gaveta', 'produto')
    and exists (select 1 from public.stores s where s.id = store_id and s.state = 'Publicada')
  );

drop policy if exists whatsapp_orders_owner_all on public.whatsapp_orders;
create policy whatsapp_orders_owner_all on public.whatsapp_orders
  for all using (public.owns_store(store_id)) with check (public.owns_store(store_id));

drop policy if exists whatsapp_orders_admin_all on public.whatsapp_orders;
create policy whatsapp_orders_admin_all on public.whatsapp_orders
  for all using (public.is_admin()) with check (public.is_admin());

-- O visitante não escolhe `handled` nem datas, e não apaga nada. O guarda corre
-- como quem faz o pedido (SECURITY INVOKER, o predefinido) — ver
-- `request_is_privileged()` na migração 0022.
create or replace function public.whatsapp_orders_guard() returns trigger
language plpgsql as $$
begin
  if public.request_is_privileged() or public.owns_store(new.store_id) then
    return new;
  end if;
  new.handled := false;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists whatsapp_orders_guard on public.whatsapp_orders;
create trigger whatsapp_orders_guard
  before insert on public.whatsapp_orders
  for each row execute function public.whatsapp_orders_guard();

-- ---------------------------------------------------------------------
-- 4. Eventos da loja: o pedido por WhatsApp registado
-- ---------------------------------------------------------------------
-- `whatsapp_order` já existe desde a 0022; nada a fazer. Fica a nota para quem
-- procurar aqui o funil: os tipos válidos estão na restrição
-- `store_events_type_check`.
