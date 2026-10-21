-- =====================================================================
-- MôBisno — Marcar (ou criar) uma conta ADMIN diretamente por SQL.
--
-- Garante o perfil (public.profiles) da conta e marca-o como administrador
-- (is_admin = true). Se a conta ainda não existir no Supabase Auth, pode
-- criá-la (auth.users + auth.identities).
--
-- ESTE FICHEIRO NÃO TEM CREDENCIAIS. O email e a palavra-passe são escolhidos
-- no momento da criação e escritos nos marcadores <...> abaixo — nunca no
-- ficheiro que fica no repositório.
--
-- COMO USAR
--
--  1. (Recomendado) Crie a conta em Supabase → Authentication → Users →
--     «Add user», com o email e a palavra-passe escolhidos nesse momento. Assim
--     a palavra-passe nunca passa por SQL.
--  2. No SQL Editor, substitua <EMAIL_DO_ADMIN> pelo email dessa conta e
--     execute. O script só a marca como administradora.
--  3. Em alternativa, para criar a conta aqui mesmo: substitua também
--     <PALAVRA_PASSE_DO_ADMIN> (mínimo 12 caracteres).
--  4. Depois de executar, apague a consulta do SQL Editor (ele guarda o
--     histórico) e não grave o ficheiro preenchido. Se a palavra-passe passou
--     por aqui, troque-a no primeiro início de sessão (ou use «Esqueci-me da
--     palavra-passe» no ecrã de entrada).
--
-- Executar no Supabase → SQL Editor (depois de aplicadas 0001..0023). Corre
-- como `postgres`, que é o que deixa escrever is_admin: o gatilho
-- `profiles_guard` (migração 0022) repõe is_admin em qualquer pedido do
-- navegador.
--
-- Idempotente: se a conta já existir, apenas garante o perfil + is_admin. Com
-- os marcadores por preencher, recusa-se a correr.
-- =====================================================================

-- pgcrypto fornece crypt()/gen_salt() para gerar a hash bcrypt da palavra-passe.
create extension if not exists pgcrypto;

do $$
declare
  -- ⚠ Substitua os marcadores antes de executar (ver «COMO USAR» acima).
  v_email    text := '<EMAIL_DO_ADMIN>';
  -- Só é usada se a conta ainda não existir. Deixe o marcador se criou a conta
  -- em Authentication → Users.
  v_password text := '<PALAVRA_PASSE_DO_ADMIN>';
  v_name     text := 'Admin';
  v_uid      uuid;
begin
  v_email := lower(btrim(v_email));

  if v_email like '<%>' then
    raise exception 'Falta o email: substitua <EMAIL_DO_ADMIN> no início do script.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'O email indicado não tem um formato válido: %', v_email;
  end if;

  -- Já existe um utilizador com este email?
  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is null then
    if v_password like '<%>' then
      raise exception 'A conta % não existe. Crie-a em Authentication → Users → «Add user», ou substitua <PALAVRA_PASSE_DO_ADMIN> para a criar aqui.', v_email;
    end if;
    if length(v_password) < 12 then
      raise exception 'Escolha uma palavra-passe de administrador com pelo menos 12 caracteres.';
    end if;

    v_uid := gen_random_uuid();

    -- 1) Utilizador de autenticação (email já confirmado para permitir login).
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('name', v_name),
      now(), now()
    );

    -- 2) Identidade de email (necessária para o login por email/palavra-passe).
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now()
    );
  end if;

  -- 3) Perfil da aplicação, marcado como administrador.
  insert into public.profiles (id, email, name, is_admin)
  values (v_uid, v_email, v_name, true)
  on conflict (id) do update
    set is_admin = true,
        email    = excluded.email;
end $$;

-- Verificação rápida: as contas de administrador que existem agora.
select p.id, p.email, p.name, p.is_admin
from public.profiles p
where p.is_admin
order by p.email;
