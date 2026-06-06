/**
 * generate-word — Supabase Edge Function (Deno runtime)
 *
 * Receives { word, fields, example_length } from the authenticated frontend,
 * calls the Gemini 2.5 Flash API, and returns a structured vocabulary card.
 *
 * Deploy:
 *   supabase functions deploy generate-word
 *
 * Set secret:
 *   supabase secrets set GEMINI_API_KEY=<your-key>
 *
 * The Gemini key NEVER reaches the browser — this function is the sole caller.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/** Gemini structured-output schema for the vocabulary card. */
const WORD_SCHEMA = {
  type: 'object',
  properties: {
    word:               { type: 'string' },
    meanings:           { type: 'array', items: { type: 'string' }, description: '1–3 Japanese meanings (日本語のみ)' },
    part_of_speech:     { type: 'string', description: 'English grammatical label ONLY — one of: noun, verb, adjective, adverb, preposition, conjunction, interjection, phrase, idiom. No Japanese.' },
    example:            { type: 'string', description: 'Natural English example sentence' },
    example_ja:         { type: 'string', description: 'Japanese translation of the example (日本語のみ)' },
    pronunciation:      { type: 'string', description: 'IPA phonetic notation enclosed in forward slashes ONLY — e.g. /prəˌnʌnsiˈeɪʃən/. No katakana, no romaji.' },
    pronunciation_kana: { type: 'string', description: 'Katakana reading ONLY — e.g. プロナンシエイション. No IPA symbols, no slashes, no romaji.' },
    definition_en:      { type: 'string', description: 'Concise English definition in one sentence' },
    nuance:             { type: 'string', description: 'Brief Japanese note on register, nuance, or typical context (日本語のみ). No English.' },
  },
  required: [
    'word', 'meanings', 'part_of_speech',
    'example', 'example_ja',
    'pronunciation', 'pronunciation_kana',
    'definition_en', 'nuance',
  ],
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ─────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Auth: verify JWT via Supabase ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { error: authErr } = await supabase.auth.getUser()
  if (authErr) return json({ error: 'Unauthorized' }, 401)

  // ── Parse request body ─────────────────────────────────────────────────
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const word: string = body?.word?.trim()
  if (!word) return json({ error: '`word` is required' }, 400)

  const fields: string[] = Array.isArray(body?.fields) ? body.fields : []
  const exampleLength: string = body?.example_length ?? 'medium'

  // ── Gemini key ─────────────────────────────────────────────────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    console.error('GEMINI_API_KEY secret is not set')
    return json({ error: 'Server misconfiguration: GEMINI_API_KEY missing' }, 500)
  }

  // ── Build prompt ───────────────────────────────────────────────────────
  const lengthGuide =
    exampleLength === 'short'  ? 'under 10 words' :
    exampleLength === 'long'   ? '20 or more words' :
                                 '10 to 20 words'

  // Include extra fields only when requested (defaults: all enabled)
  const wantDefinition = fields.length === 0 || fields.includes('definition_en')
  const wantNuance     = fields.length === 0 || fields.includes('nuance')

  const prompt = `\
Generate a vocabulary card for the English word or phrase: "${word}"

Return a JSON object with ALL of the following fields.
Follow every language and format rule STRICTLY — any violation makes the card unusable.

- "word":               the input word exactly as given
- "meanings":           array of 1–3 concise Japanese meanings, most common first
                        ▸ MUST be in Japanese (日本語のみ). English or romaji → INVALID.
- "part_of_speech":     English grammatical label ONLY.
                        ▸ Choose exactly one: noun / verb / adjective / adverb / preposition / conjunction / interjection / phrase / idiom
                        ▸ MUST be in English. Japanese → INVALID.
- "example":            a natural English example sentence (${lengthGuide}). English only.
- "example_ja":         Japanese translation of the example sentence (日本語のみ)
- "pronunciation":      IPA phonetic transcription enclosed in forward slashes ONLY.
                        ▸ Example: /prəˌnʌnsiˈeɪʃən/
                        ▸ MUST contain only IPA symbols inside slashes. No katakana, no romaji, no plain English. → INVALID if missing slashes.
- "pronunciation_kana": Katakana reading ONLY.
                        ▸ Example: プロナンシエイション
                        ▸ MUST contain only katakana characters. No IPA symbols, no slashes, no romaji. → INVALID if not katakana.${wantDefinition ? '\n- "definition_en":      concise English definition in one sentence. English only.' : ''}${wantNuance ? '\n- "nuance":             brief note on register, nuance, or typical context.\n                        ▸ MUST be in Japanese (日本語のみ). English → INVALID.' : ''}`

  // ── Call Gemini ────────────────────────────────────────────────────────
  let geminiRes: Response
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: WORD_SCHEMA,
        },
      }),
    })
  } catch (e) {
    console.error('Fetch to Gemini failed:', e)
    return json({ error: 'Failed to reach Gemini API' }, 502)
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('Gemini HTTP error:', geminiRes.status, errText)
    return json({ error: `Gemini API error (HTTP ${geminiRes.status})` }, 502)
  }

  // ── Parse Gemini response ──────────────────────────────────────────────
  const geminiBody: any = await geminiRes.json()
  const candidate = geminiBody?.candidates?.[0]

  if (!candidate) {
    // Check for prompt_feedback (e.g. safety block)
    const blocked = geminiBody?.promptFeedback?.blockReason
    console.error('No candidates in Gemini response. Block reason:', blocked)
    return json({ error: blocked ? `Blocked: ${blocked}` : 'No content from Gemini' }, 502)
  }

  const rawText: string = candidate?.content?.parts?.[0]?.text ?? ''

  let generated: unknown
  try {
    generated = JSON.parse(rawText)
  } catch {
    console.error('Gemini returned non-JSON text:', rawText.slice(0, 200))
    return json({ error: 'Gemini returned invalid JSON' }, 502)
  }

  return json(generated)
})
