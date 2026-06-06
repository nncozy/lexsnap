import { createClient } from '@supabase/supabase-js'

/**
 * Supabase browser client.
 *
 * Only the public anon key lives in the frontend. The Gemini API key is NEVER
 * exposed here — AI generation goes through the `generate-word` Edge Function
 * (see instructions section 4).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
