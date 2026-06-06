import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchNotebook } from '@/lib/notebooks'
import { fetchWords, updateWord, deleteWord } from '@/lib/words'
import { useSpeech } from '@/hooks/useSpeech'
import type { Word, WordStatus } from '@/types'

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function exportCsv(words: Word[], notebookName: string): void {
  const headers = [
    'word', 'part_of_speech', 'meanings',
    'pronunciation', 'pronunciation_kana',
    'example', 'example_ja',
    'definition_en', 'nuance', 'status',
  ]
  const rows = words.map((w) => [
    w.word,
    w.part_of_speech,
    w.meanings.join('; '),
    w.pronunciation,
    w.pronunciation_kana,
    w.example,
    w.example_ja,
    w.definition_en,
    w.nuance,
    w.status,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => csvCell(String(cell))).join(','))
    .join('\n')

  // BOM prefix so Excel opens UTF-8 correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${notebookName || 'lexsnap'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<WordStatus, string> = {
  known: '知',
  review: '復',
  unstudied: '未',
}

/** Badge style for the word list row */
const STATUS_BADGE: Record<WordStatus, string> = {
  known: 'bg-emerald-100 text-emerald-700',
  review: 'bg-rose-100 text-rose-600',
  unstudied: 'bg-gray-100 text-gray-500',
}

/** Active button style in the status toggle */
const STATUS_ACTIVE: Record<WordStatus, string> = {
  known: 'bg-known text-white',
  review: 'bg-review text-white',
  unstudied: 'bg-unstudied text-ink',
}

// ── types ────────────────────────────────────────────────────────────────────

interface EditDraft {
  word: string
  pronunciation: string
  pronunciation_kana: string
  part_of_speech: string
  meanings: string[]
  example: string
  example_ja: string
  definition_en: string
  nuance: string
}

function toEditDraft(w: Word): EditDraft {
  return {
    word: w.word,
    pronunciation: w.pronunciation,
    pronunciation_kana: w.pronunciation_kana,
    part_of_speech: w.part_of_speech,
    meanings: [...w.meanings],
    example: w.example,
    example_ja: w.example_ja,
    definition_en: w.definition_en,
    nuance: w.nuance,
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

/**
 * Phase 5 — 一覧タブ.
 * Shows all words in the notebook as a scrollable list with status badges.
 * Tapping a row opens a bottom-sheet detail view with inline editing.
 */
export default function List() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notebookName, setNotebookName] = useState('')

  // Detail sheet state
  const [selected, setSelected] = useState<Word | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [nb, ws] = await Promise.all([
          fetchNotebook(notebookId!),
          fetchWords(notebookId!),
        ])
        if (!cancelled) {
          setNotebookName(nb?.name ?? '')
          setWords(ws)
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : '読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [notebookId])

  // ── detail sheet handlers ─────────────────────────────────────────────────

  function openDetail(word: Word) {
    setSelected(word)
    setEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  function closeDetail() {
    setSelected(null)
    setEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  function startEdit() {
    if (!selected) return
    setDraft(toEditDraft(selected))
    setEditing(true)
    setSaveError(null)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  async function handleStatusChange(wordId: string, status: WordStatus) {
    const prev = words.find((w) => w.id === wordId)
    if (!prev) return

    // Optimistic update
    const apply = (list: Word[]) =>
      list.map((w) => (w.id === wordId ? { ...w, status } : w))
    setWords(apply)
    if (selected?.id === wordId) setSelected((s) => (s ? { ...s, status } : s))

    try {
      await updateWord(wordId, { status })
    } catch {
      // Revert on failure
      const revert = (list: Word[]) =>
        list.map((w) => (w.id === wordId ? { ...w, status: prev.status } : w))
      setWords(revert)
      if (selected?.id === wordId)
        setSelected((s) => (s ? { ...s, status: prev.status } : s))
    }
  }

  async function handleSave() {
    if (!selected || !draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const patch = {
        word: draft.word.trim() || selected.word,
        pronunciation: draft.pronunciation,
        pronunciation_kana: draft.pronunciation_kana,
        part_of_speech: draft.part_of_speech,
        meanings: draft.meanings.filter(Boolean),
        example: draft.example,
        example_ja: draft.example_ja,
        definition_en: draft.definition_en,
        nuance: draft.nuance,
      }
      await updateWord(selected.id, patch)
      const updated = { ...selected, ...patch }
      setWords((prev) => prev.map((w) => (w.id === selected.id ? updated : w)))
      setSelected(updated)
      setEditing(false)
      setDraft(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(`「${selected.word}」を削除しますか？`)) return
    setDeleting(true)
    setSaveError(null)
    try {
      await deleteWord(selected.id)
      setWords((prev) => prev.filter((w) => w.id !== selected.id))
      closeDetail()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '削除に失敗しました')
      setDeleting(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas">
      {/* ── header ── */}
      <header className="sticky top-0 z-10 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="ホームへ戻る"
            className="text-muted hover:text-ink"
          >
            <ChevronLeftIcon />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-semibold">
            {notebookName || '単語一覧'}
          </h1>
          <div className="flex items-center gap-2">
            {words.length > 0 && (
              <button
                type="button"
                onClick={() => exportCsv(words, notebookName)}
                aria-label="CSVとしてエクスポート"
                className="text-muted hover:text-ink"
              >
                <DownloadIcon />
              </button>
            )}
            <Link
              to={`/notebook/${notebookId}/capture`}
              className="bg-primary flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            >
              <PlusIcon />
              追加
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          <Link
            to={`/notebook/${notebookId}/mastery`}
            className="flex-1 py-2.5 text-center text-sm text-muted hover:text-ink"
          >
            習得
          </Link>
          <div className="border-primary flex-1 border-b-2 py-2.5 text-center text-sm font-semibold text-primary">
            一覧
          </div>
          <Link
            to={`/notebook/${notebookId}/review`}
            className="flex-1 py-2.5 text-center text-sm text-muted hover:text-ink"
          >
            総復習
          </Link>
        </div>
      </header>

      {/* ── body ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <span className="text-muted text-sm">読み込み中…</span>
        </div>
      ) : error ? (
        <div className="px-4 py-6">
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-review">
            {error}
          </div>
        </div>
      ) : words.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
          <span className="text-4xl" role="img" aria-label="memo">
            📝
          </span>
          <p className="font-medium">単語がまだありません</p>
          <p className="text-muted text-sm">
            上の「追加」から単語を取り込みましょう
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 bg-white">
          {words.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => openDetail(w)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{w.word}</span>
                    {w.pronunciation && (
                      <span className="text-xs text-muted">{w.pronunciation}</span>
                    )}
                  </div>
                  {w.meanings.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {w.meanings[0]}
                    </p>
                  )}
                </div>
                <StatusBadge status={w.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── detail / edit sheet ── */}
      {selected && (
        <DetailSheet
          word={selected}
          editing={editing}
          draft={draft}
          saving={saving}
          saveError={saveError}
          deleting={deleting}
          onClose={closeDetail}
          onEdit={startEdit}
          onSave={() => void handleSave()}
          onCancel={cancelEdit}
          onPatch={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
          onStatusChange={(status) => void handleStatusChange(selected.id, status)}
          onDelete={() => void handleDelete()}
        />
      )}
    </div>
  )
}

// ── DetailSheet ───────────────────────────────────────────────────────────────

interface DetailSheetProps {
  word: Word
  editing: boolean
  draft: EditDraft | null
  saving: boolean
  saveError: string | null
  deleting: boolean
  onClose: () => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onPatch: (patch: Partial<EditDraft>) => void
  onStatusChange: (status: WordStatus) => void
  onDelete: () => void
}

function DetailSheet({
  word,
  editing,
  draft,
  saving,
  saveError,
  deleting,
  onClose,
  onEdit,
  onSave,
  onCancel,
  onPatch,
  onStatusChange,
  onDelete,
}: DetailSheetProps) {
  const d = draft ?? toEditDraft(word)
  const { speak, isSpeaking, isSupported } = useSpeech()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          {editing ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-muted text-sm hover:text-ink"
            >
              キャンセル
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="text-muted hover:text-ink"
            >
              <XIcon />
            </button>
          )}

          <div className="flex items-center gap-4">
            {!editing && (
              <>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="text-sm text-muted hover:text-review disabled:opacity-40"
                >
                  {deleting ? '削除中…' : '削除'}
                </button>
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-primary text-sm font-semibold"
                >
                  編集
                </button>
              </>
            )}
            {editing && (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="text-primary text-sm font-semibold disabled:opacity-40"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-4 pb-10">
          {/* Word heading or editable fields */}
          {editing ? (
            <>
              <FieldLine
                label="単語"
                value={d.word}
                onChange={(v) => onPatch({ word: v })}
              />
              <FieldLine
                label="発音（IPA）"
                value={d.pronunciation}
                placeholder="/vɜːrb/"
                onChange={(v) => onPatch({ pronunciation: v })}
              />
              <FieldLine
                label="発音（カタカナ）"
                value={d.pronunciation_kana}
                placeholder="ヴァーブ"
                onChange={(v) => onPatch({ pronunciation_kana: v })}
              />
              <FieldLine
                label="品詞"
                value={d.part_of_speech}
                placeholder="verb / noun / adjective …"
                onChange={(v) => onPatch({ part_of_speech: v })}
              />
            </>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{word.word}</h2>

                {/* 🔊 button — only rendered when Web Speech API is available */}
                {isSupported && (
                  <button
                    type="button"
                    onClick={() => speak(word.word)}
                    aria-label={isSpeaking ? '読み上げを停止' : `「${word.word}」を読み上げ`}
                    className={`shrink-0 rounded-full p-2 transition-colors ${
                      isSpeaking
                        ? 'animate-pulse bg-primary/10 text-primary'
                        : 'text-gray-300 hover:bg-gray-100 hover:text-muted'
                    }`}
                  >
                    <SpeakerIcon />
                  </button>
                )}
              </div>
              {(word.pronunciation || word.pronunciation_kana || word.part_of_speech) && (
                <p className="mt-0.5 text-sm text-muted">
                  {[word.pronunciation, word.pronunciation_kana, word.part_of_speech]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}

          {/* Status toggle — always available */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">ステータス</p>
            <div className="flex gap-2">
              {(['known', 'review', 'unstudied'] as WordStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(s)}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                    word.status === s
                      ? STATUS_ACTIVE[s]
                      : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Meanings */}
          {editing ? (
            <MeaningsField
              value={d.meanings}
              onChange={(v) => onPatch({ meanings: v })}
            />
          ) : (
            <FieldView label="意味">
              <ul className="flex flex-col gap-0.5">
                {word.meanings.map((m, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                  <li key={i} className="text-sm">
                    {word.meanings.length > 1 && (
                      <span className="mr-1 text-xs text-muted">{i + 1}.</span>
                    )}
                    {m}
                  </li>
                ))}
              </ul>
            </FieldView>
          )}

          {/* Example */}
          {editing ? (
            <>
              <FieldArea
                label="英語例文"
                value={d.example}
                rows={2}
                onChange={(v) => onPatch({ example: v })}
              />
              <FieldArea
                label="例文（和訳）"
                value={d.example_ja}
                rows={2}
                onChange={(v) => onPatch({ example_ja: v })}
              />
            </>
          ) : (
            word.example && (
              <FieldView label="例文">
                <p className="text-sm italic">{word.example}</p>
                {word.example_ja && (
                  <p className="mt-0.5 text-xs text-muted">{word.example_ja}</p>
                )}
              </FieldView>
            )
          )}

          {/* definition_en */}
          {editing ? (
            <FieldArea
              label="英英定義"
              value={d.definition_en}
              rows={2}
              onChange={(v) => onPatch({ definition_en: v })}
            />
          ) : (
            word.definition_en && (
              <FieldView label="英英定義">
                <p className="text-sm">{word.definition_en}</p>
              </FieldView>
            )
          )}

          {/* nuance */}
          {editing ? (
            <FieldArea
              label="ニュアンス / 用法メモ"
              value={d.nuance}
              rows={2}
              onChange={(v) => onPatch({ nuance: v })}
            />
          ) : (
            word.nuance && (
              <FieldView label="ニュアンス / 用法メモ">
                <p className="text-sm">{word.nuance}</p>
              </FieldView>
            )
          )}

          {saveError && (
            <p className="text-sm text-review">{saveError}</p>
          )}
        </div>
      </div>
    </>
  )
}

// ── small helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WordStatus }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function FieldView({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      {children}
    </div>
  )
}

const INPUT_CLS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm ' +
  'outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none'

function FieldLine({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLS}
      />
    </div>
  )
}

function FieldArea({
  label,
  value,
  onChange,
  rows = 2,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={INPUT_CLS}
      />
    </div>
  )
}

function MeaningsField({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [text, setText] = useState(() => value.join('\n'))

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">
        意味（1行に1つ）
      </label>
      <textarea
        value={text}
        rows={Math.max(2, value.length + 1)}
        placeholder={'意味1\n意味2'}
        className={INPUT_CLS}
        onChange={(e) => {
          setText(e.target.value)
          onChange(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }}
      />
    </div>
  )
}

// ── icons ─────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12.707 5.293a1 1 0 0 1 0 1.414L9.414 10l3.293 3.293a1 1 0 0 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5a.5.5 0 0 1 .5.5v5.5H14a.5.5 0 0 1 0 1H8.5V14a.5.5 0 0 1-1 0V8.5H2a.5.5 0 0 1 0-1h5.5V2a.5.5 0 0 1 .5-.5z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"
      />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm3.293-7.707a1 1 0 0 1 1.414 0L9 10.586V3a1 1 0 1 1 2 0v7.586l1.293-1.293a1 1 0 1 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 0-1.414z"
      />
    </svg>
  )
}

/** Volume-up speaker icon (Material Design). */
function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}
