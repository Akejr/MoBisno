-- =====================================================================
-- MôBisno — Indicador de produto físico.
--
-- Cada produto passa a indicar se é físico (precisa de entrega/endereço) ou
-- não (digital/serviço — o checkout não pede morada). Por omissão `true`
-- (físico), o caso mais comum numa loja.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0008).
-- =====================================================================

alter table public.products
  add column if not exists physical boolean not null default true;
