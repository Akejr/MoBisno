-- =====================================================================
-- MôBisno — Criar uma conta ADMIN diretamente por SQL.
--
-- Cria o utilizador no Supabase Auth (auth.users + auth.identities), o perfil
-- (public.profiles) e marca-o como administrador (is_admin = true).
--
-- Conta criada por este script:
--   email:    dotangola@gmail.com
--   password: aeiou123
--
-- Executar no Supabase → SQL Editor (depois de aplicadas 0001..0011).
-- É idempotente: se o email já existir, apenas garante o perfil + is_admin.
-- ALTERE a password depois do primeiro login.
-- =====================================================================

-- pgcrypto fornece crypt()/gen_salt() para gerar a hash bcrypt da password.
create extension if not exists pgcrypto;

do $$
declare
  v_email    text := 'dotangola@gmail.com';
  v_password text := 'aeiou123';
  v_name     text := 'Admin';
  v_uid      uuid;
begin
  -- Já existe um utilizador com este email?
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
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

    -- 2) Identidade de email (necessária para o login por email/password).
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

-- Verificação rápida.
select p.id, p.email, p.name, p.is_admin
from public.profiles p
where p.email = 'dotangola@gmail.com';
