-- =====================================================================
-- 0027 — O desafio de SMS aponta para `auth.users`, como tudo o resto
-- =====================================================================
-- A 0026 criou `phone_verifications.owner_id` a referenciar
-- `public.profiles (id)`. Está errado, e falha em produção com um 500 ao
-- gravar o desafio:
--
--   **a linha de `profiles` pode ainda não existir.** Não há gatilho em
--   `auth.users` que a crie; é o navegador que a grava, depois do registo, e
--   sem verificar o resultado (`ensureProfile`, `web/supabase/auth.ts`). O
--   pedido do código chega logo a seguir, com um token já válido, para um
--   `owner_id` que existe em `auth.users` mas ainda não em `profiles`.
--
-- Todas as outras tabelas da plataforma — `stores`, `withdrawals`,
-- `plan_payments`, `sms_purchases` — referenciam `auth.users (id)`. Esta passa
-- a fazer o mesmo: o utilizador autenticado existe, por definição, porque o
-- token foi validado contra ele.
--
-- A cascata mantém-se: apagar a conta em `auth.users` leva os desafios dela.
--
-- Idempotente: pode ser corrida mais do que uma vez.

alter table public.phone_verifications
  drop constraint if exists phone_verifications_owner_id_fkey;

alter table public.phone_verifications
  add constraint phone_verifications_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;
