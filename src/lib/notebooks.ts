import { supabase } from './supabase'
import type { Notebook } from '@/types'

/** Notebook row as returned by the Supabase join query (private to this module). */
interface NotebookRow {
  id: string
  user_id: string
  name: string
  created_at: string
  words: { status: string }[]
}

/** Notebook augmented with pre-computed word-count breakdowns. */
export interface NotebookSummary extends Notebook {
  known: number
  review: number
  unstudied: number
}

/**
 * Fetch every notebook owned by the current user, newest first.
 * Each record includes word counts broken down by status so the home screen
 * can render progress badges without extra round-trips.
 */
export async function fetchNotebooks(): Promise<NotebookSummary[]> {
  const { data, error } = await supabase
    .from('notebooks')
    .select('id, user_id, name, created_at, words(status)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as unknown as NotebookRow[]
  return rows.map((nb) => ({
    id: nb.id,
    user_id: nb.user_id,
    name: nb.name,
    created_at: nb.created_at,
    known: nb.words.filter((w) => w.status === 'known').length,
    review: nb.words.filter((w) => w.status === 'review').length,
    unstudied: nb.words.filter((w) => w.status === 'unstudied').length,
  }))
}

/**
 * Create a new, empty notebook owned by `userId`.
 * The RLS INSERT policy enforces that `user_id` must equal `auth.uid()`,
 * so passing the wrong user ID will be rejected by the database.
 */
export async function createNotebook(
  name: string,
  userId: string,
): Promise<Notebook> {
  const { data, error } = await supabase
    .from('notebooks')
    .insert({ name, user_id: userId })
    .select('id, user_id, name, created_at')
    .single()

  if (error) throw error
  return data as unknown as Notebook
}

/**
 * Delete a notebook by id.
 * The `words` table has ON DELETE CASCADE, so all child words are removed too.
 */
export async function deleteNotebook(id: string): Promise<void> {
  const { error } = await supabase.from('notebooks').delete().eq('id', id)
  if (error) throw error
}

/** Fetch a single notebook by id. Returns null if not found or access denied. */
export async function fetchNotebook(id: string): Promise<Notebook | null> {
  const { data, error } = await supabase
    .from('notebooks')
    .select('id, user_id, name, created_at')
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as Notebook
}
