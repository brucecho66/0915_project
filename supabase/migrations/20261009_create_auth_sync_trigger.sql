-- ====================================================================
-- Migration: Automatic Synchronization Trigger from auth.users to public
-- 0915 Community Board - Supabase Auth Standard User Sync
-- ====================================================================

-- 1. auth.users 생성/수정 시 public.users, public.admins, public.profiles 자동 동기화
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_id BIGINT;
  v_admin_id BIGINT;
  v_role TEXT;
  v_username TEXT;
  v_bio TEXT;
  v_avatar TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  v_bio := COALESCE(NEW.raw_user_meta_data->>'bio', '안녕하세요!');
  v_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar_url', '');

  IF NEW.email = 'iicbruce@naver.com' THEN
    v_role := 'admin';
  END IF;

  BEGIN
    -- 1. users 테이블 저장
    INSERT INTO public.users (email, username, password, role, bio, avatar_url, created_at, updated_at)
    VALUES (
      NEW.email,
      v_username,
      COALESCE(NEW.encrypted_password, ''),
      v_role,
      v_bio,
      v_avatar,
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET username = EXCLUDED.username,
        role = v_role,
        bio = CASE WHEN EXCLUDED.bio != '' THEN EXCLUDED.bio ELSE public.users.bio END,
        avatar_url = CASE WHEN EXCLUDED.avatar_url != '' THEN EXCLUDED.avatar_url ELSE public.users.avatar_url END,
        updated_at = NOW()
    RETURNING id INTO v_user_id;
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO v_user_id FROM public.users WHERE email = NEW.email;
  END;

  -- 2. admins 테이블 저장 (관리자일 때)
  IF v_role = 'admin' THEN
    BEGIN
      INSERT INTO public.admins (email, username, password, role, created_at, updated_at)
      VALUES (
        NEW.email,
        v_username,
        COALESCE(NEW.encrypted_password, ''),
        'admin',
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE
      SET username = EXCLUDED.username,
          role = 'admin',
          updated_at = NOW()
      RETURNING id INTO v_admin_id;
    EXCEPTION WHEN OTHERS THEN
      SELECT id INTO v_admin_id FROM public.admins WHERE email = NEW.email;
    END;
  END IF;

  -- 3. profiles 테이블 저장
  BEGIN
    INSERT INTO public.profiles (user_id, admin_id, email, username, bio, avatar_url, role, created_at, updated_at)
    VALUES (
      v_user_id,
      v_admin_id,
      NEW.email,
      v_username,
      v_bio,
      v_avatar,
      v_role,
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET user_id = v_user_id,
        admin_id = COALESCE(v_admin_id, public.profiles.admin_id),
        username = EXCLUDED.username,
        bio = CASE WHEN EXCLUDED.bio != '' THEN EXCLUDED.bio ELSE public.profiles.bio END,
        avatar_url = CASE WHEN EXCLUDED.avatar_url != '' THEN EXCLUDED.avatar_url ELSE public.profiles.avatar_url END,
        role = v_role,
        updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    -- 프로필 동기화 에러 무시
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. auth.users 테이블에 자동 동기화 트리거 연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. auth.users 삭제 시 연쇄 삭제
CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS trigger AS $$
BEGIN
  DELETE FROM public.profiles WHERE email = OLD.email;
  DELETE FROM public.users WHERE email = OLD.email;
  DELETE FROM public.admins WHERE email = OLD.email;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_user();
