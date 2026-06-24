-- Personalização por Loja (cores, textos do hero, rodapé, etc.) em JSON.
-- As políticas RLS de `stores` já cobrem leitura pública (Publicada) e gestão
-- pelo dono, pelo que esta coluna fica automaticamente protegida.
alter table public.stores
  add column if not exists customization jsonb not null default '{}'::jsonb;
