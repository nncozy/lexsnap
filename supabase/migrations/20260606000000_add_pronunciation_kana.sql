-- Phase 6 addendum: add pronunciation_kana column to words table.
--
-- Existing `pronunciation` column is repurposed as IPA notation.
-- `pronunciation_kana` stores the katakana approximation.
-- Both default to '' so existing rows remain valid.

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS pronunciation_kana text NOT NULL DEFAULT '';
