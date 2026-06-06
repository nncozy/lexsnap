import { supabase } from './supabase'
import type { GeneratedWord, Word, WordStatus } from '@/types'

/**
 * Bulk-insert generated vocabulary cards into the `words` table.
 * Every card is created with `status = 'unstudied'` (the default for new words).
 *
 * RLS on the `words` table enforces that the caller must own the notebook
 * (notebook_id must belong to a notebook where user_id = auth.uid()).
 */
export async function saveWords(
  notebookId: string,
  words: GeneratedWord[],
): Promise<void> {
  const rows = words.map((w) => ({
    notebook_id:        notebookId,
    word:               w.word,
    meanings:           w.meanings,          // stored as JSONB
    part_of_speech:     w.part_of_speech,
    example:            w.example,
    example_ja:         w.example_ja,
    pronunciation:      w.pronunciation,
    pronunciation_kana: w.pronunciation_kana,
    definition_en:      w.definition_en,
    nuance:             w.nuance,
    status:             'unstudied' as const,
  }))

  const { error } = await supabase.from('words').insert(rows)
  if (error) throw error
}

/** Fetch all words in a notebook, newest first. */
export async function fetchWords(notebookId: string): Promise<Word[]> {
  const { data, error } = await supabase
    .from('words')
    .select('*')
    .eq('notebook_id', notebookId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Word[]
}

/** Patch a word's editable fields (and/or status). */
export async function updateWord(
  wordId: string,
  patch: Partial<Omit<Word, 'id' | 'notebook_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase.from('words').update(patch).eq('id', wordId)
  if (error) throw error
}

/** Delete a single word by id. */
export async function deleteWord(wordId: string): Promise<void> {
  const { error } = await supabase.from('words').delete().eq('id', wordId)
  if (error) throw error
}

// Re-export WordStatus so consumers can import from this module
export type { WordStatus }
