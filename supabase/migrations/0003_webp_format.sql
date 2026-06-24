-- =====================================================================
-- MôBisno — Suporte a imagens WebP nos Assets.
-- Atualiza a restrição de formato para aceitar 'webp' além de png/jpeg/svg.
-- Executar uma vez no SQL Editor do Supabase.
-- =====================================================================

alter table public.assets
  drop constraint if exists assets_format_check;

alter table public.assets
  add constraint assets_format_check
  check (format in ('png', 'jpeg', 'svg', 'webp'));
