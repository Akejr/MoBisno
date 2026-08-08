-- =====================================================================
-- 0021 — O Dono apaga as referências expiradas
-- =====================================================================
--
-- Uma referência bancária que passou a data-limite deixa de ser pagável: o
-- cliente tentou comprar, não pagou, e a linha ficava na lista «Vendas» para
-- sempre sem nunca virar dinheiro. O painel passa a oferecer apagá-la.
--
-- O bloqueio que isto resolve: `0008_payments.sql` deu a `public.orders` **uma
-- só** política, `orders_owner_read`, de `select`. Sem política de `delete`, um
-- pedido do navegador não apaga nada **e não devolve erro** — o Supabase
-- responde com zero linhas afetadas. A interface dizia "apagado" e a linha
-- continuava lá.
--
-- **A política é a guarda, não a interface.** Tudo o que o navegador pode fazer
-- passa por aqui, por isso a condição repete-se de propósito:
--
--  * `status <> 'paid'` **e** `paid_at is null` — uma encomenda paga apagada é
--    dinheiro sem rasto, e é irreversível. Duas condições para o mesmo facto,
--    porque uma delas pode estar dessincronizada.
--  * expirada e mais nada — não chega estar por pagar. Uma referência ainda
--    dentro do prazo pode ser paga hoje; apagá-la era perder a venda. As
--    `failed` e as `cancelled` **também não** são apagáveis: o pedido era sobre
--    as expiradas, e uma política mais larga do que o pedido é permissão que
--    ninguém pediu. Alargar depois é uma linha; recuperar uma encomenda apagada
--    não é.
--
-- O enum `public.order_status` tem exatamente quatro valores
-- ('open', 'paid', 'failed', 'cancelled'): «expirada» não é um estado gravado, é
-- derivado de `reference_due_date`, tal como em `web/supabase/payments.ts`.
--
-- Executar no Supabase → SQL Editor (depois de 0001..0020).

-- ---------------------------------------------------------------------
-- 1. «Expirada» como regra única, usável dentro da política
-- ---------------------------------------------------------------------
-- `reference_due_date` é `text` (é o que a MoMenu devolve). O cast para
-- `timestamptz` levanta exceção com texto malformado, e uma exceção levantada
-- dentro de uma política de RLS faz a operação inteira falhar — por isso o cast
-- vive numa função que trata o erro e responde `false`, ou seja, "não apagável".
--
-- Espelha `isReferenceExpired` de `src/services/payments.ts`: `open`, método
-- `reference` e data-limite no passado.
create or replace function public.order_reference_expired(
  p_status public.order_status,
  p_method text,
  p_due text
) returns boolean as $$
begin
  if p_status <> 'open' or p_method <> 'reference' or p_due is null or btrim(p_due) = '' then
    return false;
  end if;
  begin
    return p_due::timestamptz < now();
  exception when others then
    return false;
  end;
end;
$$ language plpgsql stable;

comment on function public.order_reference_expired(public.order_status, text, text) is
  'Referência bancária por pagar cuja data-limite já passou. Espelha isReferenceExpired de src/services/payments.ts.';

-- ---------------------------------------------------------------------
-- 2. Política de `delete` do Dono
-- ---------------------------------------------------------------------
-- `public.owns_store(store_id)` é o mesmo helper de `orders_owner_read` e das
-- restantes políticas: o Dono só toca nas encomendas das lojas dele.
drop policy if exists orders_owner_delete on public.orders;
create policy orders_owner_delete on public.orders
  for delete using (
    public.owns_store(store_id)
    and status <> 'paid'
    and paid_at is null
    and public.order_reference_expired(status, method, reference_due_date)
  );
