-- ====================================================================
-- 20261010_separate_admins_users_profiles.sql
-- 1. auth.users Display Name 메타데이터 추가
-- 2. admins, users, profiles 3단 테이블 분리 저장 및 동기화
-- 3. comments 및 posts의 users 외래키 제약조건 완화 (관리자/일반유저 작성 지원)
-- ====================================================================

-- 1. admins 테이블 생성 (관리자 전용 보관)
CREATE TABLE IF NOT EXISTS public.admins (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. profiles 테이블 컬럼 확장
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_id BIGINT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 3. public.users에서 admin 계정 분리
-- admins 테이블로 관리자 복사 후 users에서 삭제
INSERT INTO public.admins (email, username, password, role, bio, avatar_url, created_at, updated_at)
SELECT email, username, password, 'admin', bio, avatar_url, created_at, updated_at
FROM public.users
WHERE role = 'admin' OR email = 'iicbruce@naver.com'
ON CONFLICT (email) DO UPDATE
SET username = EXCLUDED.username,
    role = 'admin';

DELETE FROM public.users WHERE role = 'admin' OR email = 'iicbruce@naver.com';

-- 4. posts 및 comments의 users 외래키 제약조건 제거 (admins ID도 작성자로 저장 가능하도록)
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_author_id_fkey;
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey;

-- 5. Supabase Auth 신규 가입 자동 분리 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    is_admin BOOLEAN;
    extracted_username TEXT;
    extracted_bio TEXT;
    extracted_avatar TEXT;
    new_admin_id BIGINT;
    new_user_id BIGINT;
BEGIN
    is_admin := (NEW.raw_user_meta_data->>'role' = 'admin') OR (NEW.email = 'iicbruce@naver.com');
    extracted_username := COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    extracted_bio := COALESCE(NEW.raw_user_meta_data->>'bio', '');
    extracted_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar_url', '');

    IF is_admin THEN
        INSERT INTO public.admins (email, username, password, role, bio, avatar_url, created_at, updated_at)
        VALUES (NEW.email, extracted_username, 'AUTH_MANAGED', 'admin', extracted_bio, extracted_avatar, NEW.created_at, NEW.created_at)
        ON CONFLICT (email) DO UPDATE
        SET username = EXCLUDED.username, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url, updated_at = NOW()
        RETURNING id INTO new_admin_id;

        INSERT INTO public.profiles (admin_id, email, username, bio, avatar_url, role, created_at, updated_at)
        VALUES (new_admin_id, NEW.email, extracted_username, extracted_bio, extracted_avatar, 'admin', NEW.created_at, NEW.created_at)
        ON CONFLICT (email) DO UPDATE
        SET admin_id = new_admin_id, username = EXCLUDED.username, role = 'admin', updated_at = NOW();
    ELSE
        INSERT INTO public.users (email, username, password, role, bio, avatar_url, created_at, updated_at)
        VALUES (NEW.email, extracted_username, 'AUTH_MANAGED', 'user', extracted_bio, extracted_avatar, NEW.created_at, NEW.created_at)
        ON CONFLICT (email) DO UPDATE
        SET username = EXCLUDED.username, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url, updated_at = NOW()
        RETURNING id INTO new_user_id;

        INSERT INTO public.profiles (user_id, email, username, bio, avatar_url, role, created_at, updated_at)
        VALUES (new_user_id, NEW.email, extracted_username, extracted_bio, extracted_avatar, 'user', NEW.created_at, NEW.created_at)
        ON CONFLICT (email) DO UPDATE
        SET user_id = new_user_id, username = EXCLUDED.username, role = 'user', updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
