# LexSnap

Snap words from photos, generate rich vocabulary cards with AI (Google Gemini),
and study them abceed-style with **known / review / unstudied** statuses.

> Status: **Phase 0 — project scaffold.** Screens are placeholders that are
> filled in phase by phase (see [CLAUDE.md](./CLAUDE.md)).

## Tech stack

| Area      | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Vite + React + TypeScript                         |
| Styling   | Tailwind CSS v4                                    |
| Routing   | react-router-dom                                  |
| OCR       | Tesseract.js                                      |
| AI        | Google Gemini `gemini-2.5-flash` (Edge Function)  |
| Auth / DB | Supabase (Google login only)                      |
| Serverless| Supabase Edge Function (Deno)                     |
| PWA       | vite-plugin-pwa                                    |
| Deploy    | Vercel                                            |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev
```

Open the printed local URL (default http://localhost:5173).

## Environment variables

The frontend only ever holds the public Supabase anon key. The Gemini API key is
**never** placed in the client — it lives in a Supabase Edge Function secret
(added in Phase 4).

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server                 |
| `npm run build`   | Type-check and build for production  |
| `npm run preview` | Preview the production build         |
| `npm run lint`    | Run ESLint                           |
| `npm run icons`   | Regenerate PWA icons in `public/`    |
