-- Phase 2: Notebooks, Words, and User Settings schema with Row Level Security.
-- Run this once in the Supabase SQL editor (Dashboard → SQL editor → New query).
-- All tables scope every row to the authenticated owner, per project rules.

-- ── notebooks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notebooks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notebooks: owner select"
  ON public.notebooks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notebooks: owner insert"
  ON public.notebooks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notebooks: owner update"
  ON public.notebooks FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notebooks: owner delete"
  ON public.notebooks FOR DELETE
  USING (user_id = auth.uid());

-- ── words ─────────────────────────────────────────────────────────────────────
-- Ownership is derived via notebook_id → notebooks.user_id per project rules.

CREATE TABLE IF NOT EXISTS public.words (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id    uuid        NOT NULL
                               REFERENCES public.notebooks (id) ON DELETE CASCADE,
  word           text        NOT NULL,
  meanings       jsonb       NOT NULL DEFAULT '[]',
  part_of_speech text        NOT NULL DEFAULT '',
  example        text        NOT NULL DEFAULT '',
  example_ja     text        NOT NULL DEFAULT '',
  pronunciation  text        NOT NULL DEFAULT '',
  definition_en  text        NOT NULL DEFAULT '',
  nuance         text        NOT NULL DEFAULT '',
  status         text        NOT NULL DEFAULT 'unstudied'
                               CHECK (status IN ('unstudied', 'known', 'review')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "words: owner select"
  ON public.words FOR SELECT
  USING (
    notebook_id IN (SELECT id FROM public.notebooks WHERE user_id = auth.uid())
  );

CREATE POLICY "words: owner insert"
  ON public.words FOR INSERT
  WITH CHECK (
    notebook_id IN (SELECT id FROM public.notebooks WHERE user_id = auth.uid())
  );

CREATE POLICY "words: owner update"
  ON public.words FOR UPDATE
  USING (
    notebook_id IN (SELECT id FROM public.notebooks WHERE user_id = auth.uid())
  )
  WITH CHECK (
    notebook_id IN (SELECT id FROM public.notebooks WHERE user_id = auth.uid())
  );

CREATE POLICY "words: owner delete"
  ON public.words FOR DELETE
  USING (
    notebook_id IN (SELECT id FROM public.notebooks WHERE user_id = auth.uid())
  );

-- ── user_settings ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id     uuid  PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  card_fields jsonb NOT NULL DEFAULT '{
    "meaning":        true,
    "part_of_speech": true,
    "example":        true,
    "example_ja":     true,
    "pronunciation":  true,
    "definition_en":  false,
    "nuance":         false,
    "example_length": "medium"
  }'::jsonb
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings: owner select"
  ON public.user_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_settings: owner insert"
  ON public.user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_settings: owner update"
  ON public.user_settings FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
