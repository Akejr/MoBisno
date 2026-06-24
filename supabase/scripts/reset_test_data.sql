-- =====================================================================
-- MôBisno — Limpeza de DADOS DE TESTE
-- ATENÇÃO: destrutivo. Apaga TODOS os dados das tabelas da app.
-- Mantém o esquema (tabelas, tipos, políticas RLS, triggers) intacto.
-- Executar no Supabase → SQL Editor.
-- =====================================================================

-- 1) Apaga os dados das tabelas da app.
--    `stores` em CASCADE remove products/banners/assets associados,
--    mas truncamos tudo explicitamente para ser claro e idempotente.
truncate table
  public.products,
  public.banners,
  public.assets,
  public.stores,
  public.profiles
restart identity cascade;

-- 2) (OPCIONAL) Apagar os ficheiros de teste do Storage (logótipos, banners,
--    imagens de produtos) no bucket público 'store-assets'.
--    Descomente para limpar também os objetos do Storage.
-- delete from storage.objects where bucket_id = 'store-assets';

-- 3) (OPCIONAL) Apagar as CONTAS de teste (auth.users).
--    Isto remove os utilizadores criados nos testes; como `profiles` e
--    `stores` referenciam auth.users com ON DELETE CASCADE, apagar aqui
--    também limparia esses dados (já truncados acima).
--    Descomente para apagar TODAS as contas:
-- delete from auth.users;
--    Ou apague apenas contas específicas por email:
-- delete from auth.users where email in ('teste1@exemplo.com', 'teste2@exemplo.com');
