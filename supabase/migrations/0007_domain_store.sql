-- =====================================================================
-- MôBisno — Migração de domínio: .mobisno.com → .mobisno.store
-- Atualiza a invariante de coerência do subdomínio e os dados existentes.
-- Executar no Supabase → SQL Editor (depois de aplicar 0001..0006).
-- =====================================================================

-- 1) Remover a restrição antiga (assente em .mobisno.com).
alter table public.stores drop constraint if exists stores_subdomain_coherent;

-- 2) Migrar quaisquer subdomínios já existentes para o novo domínio.
update public.stores
  set subdomain = identifier || '.mobisno.store'
  where subdomain like '%.mobisno.com';

-- 3) Recriar a restrição com o novo sufixo.
alter table public.stores
  add constraint stores_subdomain_coherent
  check (subdomain = identifier || '.mobisno.store');
