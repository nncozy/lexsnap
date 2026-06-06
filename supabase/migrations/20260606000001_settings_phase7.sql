-- Phase 7: Add pronunciation_kana field to user_settings defaults.
-- Updates both the column default and backfills existing rows.

ALTER TABLE public.user_settings
  ALTER COLUMN card_fields SET DEFAULT '{
    "meaning":            true,
    "part_of_speech":     true,
    "example":            true,
    "example_ja":         true,
    "pronunciation":      true,
    "pronunciation_kana": false,
    "definition_en":      false,
    "nuance":             false,
    "example_length":     "medium"
  }'::jsonb;

UPDATE public.user_settings
SET card_fields = card_fields || '{"pronunciation_kana": false}'::jsonb
WHERE NOT (card_fields ? 'pronunciation_kana');
