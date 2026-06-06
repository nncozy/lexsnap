# LexSnap

Snap words from photos, generate rich vocabulary cards with AI, and study them
abceed-style (known / review / unstudied).

## Commands

- dev: `npm run dev`
- build: `npm run build`
- preview: `npm run preview`
- lint: `npm run lint`
- icons: `npm run icons` (regenerate PWA icons in `public/`)

## Stack

Vite + React + TypeScript + Tailwind CSS (v4) + react-router-dom + Supabase
(auth + Postgres) + Gemini `gemini-2.5-flash` (via Supabase Edge Function) +
Tesseract.js (OCR) + vite-plugin-pwa. Deployed on Vercel.

## Project structure

- `src/types/index.ts` — all shared types (single source of truth).
- `src/lib/supabase.ts` — Supabase browser client (anon key only).
- `src/pages/` — route screens. `src/components/` — shared UI.
- `supabase/functions/generate-word/` — Edge Function for Gemini (added Phase 4).

## Rules

- Commit messages, README, and code comments in English.
- All shared types go in `src/types/index.ts`.
- Never put API keys in the frontend. Gemini calls go through the Supabase Edge
  Function (the `VITE_` anon key is the only secret allowed in the client).
- Always enable Row Level Security (RLS) on Supabase tables; scope every row to
  `user_id = auth.uid()` (words are owned via their notebook).
- Light mode only for v1.

## Design tokens

Defined in `src/index.css` via Tailwind v4 `@theme`. Use the semantic utilities:
`primary` #4F46E5, `ink` #0F0F0F, `muted` #6B7280, `canvas` #F9FAFB,
`known` #10B981, `review` #F43F5E, `unstudied` #9CA3AF.

## Implementation phases

- [x] Phase 0 — Scaffold (Vite + React + TS + Tailwind, router, PWA, Supabase client).
- [x] Phase 1 — Google login + route protection.
- [x] Phase 2 — Notebook CRUD + schema + RLS.
- [x] Phase 3 — Capture → OCR → word selection.
- [x] Phase 4 — Edge Function (Gemini) + preview/edit + save.
- [x] Phase 5 — List tab (status badges, detail/edit).
- [x] Phase 6 — Mastery tab (progress ring) + sorting UI + review tab.
- [x] Phase 7 — Settings, CSV export, i18n, responsive, Vercel deploy.

## Out of scope for v1 (v2)

Quiz mode, spaced-repetition scheduling, progress charts, Anki export, dark mode.
