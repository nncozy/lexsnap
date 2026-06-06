/**
 * ocr-image — Supabase Edge Function (Deno runtime)
 *
 * Receives { imageBase64: string, mimeType: string } from the authenticated
 * frontend, passes the image to Gemini Vision (gemini-2.5-flash), and returns
 * the extracted text as { text: string }.
 *
 * Deploy:
 *   supabase functions deploy ocr-image
 *
 * Uses the same GEMINI_API_KEY secret as generate-word.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/** Structured-output schema — we only need the raw text string. */
const OCR_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'All text extracted from the image, preserving line breaks and punctuation.' },
  },
  required: ['text'],
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

  const imageBase64: string = body?.imageBase64
  const mimeType: string    = body?.mimeType ?? 'image/jpeg'

  if (!imageBase64) return json({ error: '`imageBase64` is required' }, 400)

  // Validate that mimeType is an image type to avoid misuse.
  if (!mimeType.startsWith('image/')) {
    return json({ error: '`mimeType` must be an image/* type' }, 400)
  }

  // ── Gemini key ─────────────────────────────────────────────────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    console.error('GEMINI_API_KEY secret is not set')
    return json({ error: 'Server misconfiguration: GEMINI_API_KEY missing' }, 500)
  }

  // ── Call Gemini Vision ─────────────────────────────────────────────────
  let geminiRes: Response
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text:
                  '画像内の英語テキストをそのまま抽出してください。' +
                  '改行や記号も保持してください。' +
                  'JSON形式で { "text": string } を返してください。',
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: OCR_SCHEMA,
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
    const blocked = geminiBody?.promptFeedback?.blockReason
    console.error('No candidates in Gemini response. Block reason:', blocked)
    return json({ error: blocked ? `Blocked: ${blocked}` : 'No content from Gemini' }, 502)
  }

  const rawText: string = candidate?.content?.parts?.[0]?.text ?? ''

  let result: unknown
  try {
    result = JSON.parse(rawText)
  } catch {
    // Gemini returned plain text (not JSON) — wrap it directly.
    console.warn('Gemini returned non-JSON text; wrapping as { text }')
    result = { text: rawText }
  }

  return json(result)
})
