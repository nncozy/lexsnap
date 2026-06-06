import { supabase } from './supabase'
import { DEFAULT_CARD_FIELDS } from '@/types'
import type { CardFields } from '@/types'

/**
 * Load the current user's card-field settings.
 * Falls back to DEFAULT_CARD_FIELDS when no row exists or on any error.
 * New fields that don't yet exist in the DB row are filled from defaults.
 */
export async function fetchSettings(): Promise<CardFields> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('card_fields')
    .maybeSingle()
  if (error || !data) return { ...DEFAULT_CARD_FIELDS }
  return { ...DEFAULT_CARD_FIELDS, ...(data.card_fields as Partial<CardFields>) }
}

/** Upsert card-field settings for the current user. */
export async function saveSettings(fields: CardFields): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, card_fields: fields }, { onConflict: 'user_id' })
  if (error) throw error
}
