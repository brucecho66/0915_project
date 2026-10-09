-- ====================================================================
-- Migration: Add author_email and author_id to posts & comments
-- 0915 Community Board - Ensure Schema Compatibility with Edge Functions
-- ====================================================================

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_email TEXT DEFAULT '';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_email TEXT DEFAULT '';
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.posts SET author_id = user_id WHERE author_id IS NULL AND user_id IS NOT NULL;
UPDATE public.posts SET user_id = author_id WHERE user_id IS NULL AND author_id IS NOT NULL;
UPDATE public.comments SET author_id = user_id WHERE author_id IS NULL AND user_id IS NOT NULL;
UPDATE public.comments SET user_id = author_id WHERE user_id IS NULL AND author_id IS NOT NULL;
