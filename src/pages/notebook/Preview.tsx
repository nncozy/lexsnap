import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { saveWords } from '@/lib/words'
import { useSettings } from '@/contexts/SettingsContext'
import type { CardFields, GeneratedWord } from '@/types'

// ── card state per word ────────────────────────────────────────────────────────

type CardPhase = 'loading' | 'done' | 'error'

interface CardState {
  word: string          // original word from Select page
  phase: CardPhase
  data: GeneratedWord | null
  error: string | null
}

/**
 * Derive the `fields` array sent to the Edge Function from current settings.
 * `pronunciation_kana` is always generated (required schema), so it's excluded.
 * `example_length` is a separate param, not a field toggle.
 */
function activeFields(settings: CardFields): string[] {
  return (Object.entries(settings) as [string, boolean | string][])
    .filter(
      ([k, v]) =>
        k !== 'example_length' && k !== 'pronunciation_kana' && v === true,
    )
    .map(([k]) => k)
}

// ── component ──────────────────────────────────────────────────────────────────

/**
 * Step 3 of the capture flow.
 *
 * Receives `words: string[]` from Select via navigation state, calls the
 * `generate-word` Edge Function for each word concurrently, then lets the user
 * review and edit the generated cards before saving to the `words` table.
 */
export default function Preview() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state } = useLocation()
  const words: string[] = (state as { words?: string[] } | null)?.words ?? []
  const { settings } = useSettings()

  // ── card generation state ──────────────────────────────────────────────

  const [cards, setCards] = useState<CardState[]>(() =>
    words.map((w) => ({ word: w, phase: 'loading', data: null, error: null })),
  )

  // Keep a ref to settings so generateCard always reads the latest value
  // without becoming a dependency of the one-time mount effect.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Prevent double-invocation under React StrictMode
  const generatedRef = useRef(false)

  useEffect(() => {
    if (generatedRef.current || words.length === 0) return
    generatedRef.current = true
    words.forEach((w, i) => generateCard(w, i))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generateCard(word: string, index: number) {
    setCards((prev) => {
      const next = [...prev]
      next[index] = { word, phase: 'loading', data: null, error: null }
      return next
    })

    const s = settingsRef.current
    try {
      const { data, error } = await supabase.functions.invoke<GeneratedWord>(
        'generate-word',
        {
          body: {
            word,
            fields: activeFields(s),
            example_length: s.example_length,
          },
        },
      )
      if (error) throw error
      if (!data) throw new Error('Empty response from Edge Function')

      setCards((prev) => {
        const next = [...prev]
        next[index] = { word, phase: 'done', data, error: null }
        return next
      })
    } catch (e) {
      setCards((prev) => {
        const next = [...prev]
        next[index] = {
          word,
          phase: 'error',
          data: null,
          error: e instanceof Error ? e.message : '生成に失敗しました',
        }
        return next
      })
    }
  }

  // ── card data editing ──────────────────────────────────────────────────

  function updateCardField<K extends keyof GeneratedWord>(
    index: number,
    field: K,
    value: GeneratedWord[K],
  ) {
    setCards((prev) => {
      const next = [...prev]
      const card = next[index]
      if (card.data) {
        next[index] = { ...card, data: { ...card.data, [field]: value } }
      }
      return next
    })
  }

  // ── save ───────────────────────────────────────────────────────────────

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    const toSave = cards
      .filter((c) => c.phase === 'done' && c.data !== null)
      .map((c) => c.data!)

    if (toSave.length === 0) {
      setSaveError('保存できるカードがありません')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await saveWords(notebookId!, toSave)
      navigate(`/notebook/${notebookId}/mastery`, { replace: true })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // ── derived counts ─────────────────────────────────────────────────────

  const doneCount    = cards.filter((c) => c.phase === 'done').length
  const loadingCount = cards.filter((c) => c.phase === 'loading').length
  const errorCount   = cards.filter((c) => c.phase === 'error').length
  const isSettled    = loadingCount === 0

  // ── guard ──────────────────────────────────────────────────────────────

  if (words.length === 0) {
    return <Navigate to={`/notebook/${notebookId}/capture`} replace />
  }

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-md">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="戻る"
          className="text-muted hover:text-ink"
        >
          <ChevronLeftIcon />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold">プレビュー</h1>
          <p className="text-muted text-xs">
            {isSettled
              ? `${doneCount} 語生成完了${errorCount > 0 ? ` · ${errorCount} 語エラー` : ''}`
              : `${loadingCount} 語を生成中…`}
          </p>
        </div>
      </header>

      {/* Cards */}
      <div className="flex flex-col gap-4 p-4 pb-40">
        {cards.map((card, i) => (
          <CardPanel
            key={card.word + String(i)}
            card={card}
            onRetry={() => void generateCard(card.word, i)}
            onUpdateField={(field, value) => updateCardField(i, field, value)}
          />
        ))}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-100 bg-canvas px-4 py-4 sm:max-w-md sm:mx-auto">
        {saveError && (
          <p className="text-review mb-2 text-sm">{saveError}</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isSettled || doneCount === 0}
          className="bg-primary w-full rounded-xl py-3 font-medium text-white disabled:opacity-40"
        >
          {saving
            ? '保存中…'
            : !isSettled
              ? `生成中… (残り ${loadingCount} 語)`
              : doneCount === 0
                ? '保存できるカードがありません'
                : errorCount > 0
                  ? `${doneCount} 語を保存 (${errorCount} 語スキップ)`
                  : `${doneCount} 語をノートに追加`}
        </button>
      </div>
    </div>
  )
}

// ── CardPanel ─────────────────────────────────────────────────────────────────

interface CardPanelProps {
  card: CardState
  onRetry: () => void
  onUpdateField: <K extends keyof GeneratedWord>(field: K, value: GeneratedWord[K]) => void
}

function CardPanel({ card, onRetry, onUpdateField }: CardPanelProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      {/* Card header row */}
      <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3">
        <h2 className="font-bold text-base">{card.word}</h2>
        {card.phase === 'loading' && (
          <span className="text-muted flex items-center gap-1 text-xs">
            <SpinnerIcon /> 生成中…
          </span>
        )}
        {card.phase === 'done' && (
          <span className="text-known text-xs">✓ 完了</span>
        )}
        {card.phase === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            className="text-primary text-xs underline"
          >
            再試行
          </button>
        )}
      </div>

      {/* Card body */}
      {card.phase === 'loading' && (
        <div className="px-4 py-6 flex items-center justify-center">
          <div className="h-2 w-2/3 overflow-hidden rounded-full bg-gray-100">
            <div className="bg-primary/40 h-full w-1/2 animate-pulse rounded-full" />
          </div>
        </div>
      )}

      {card.phase === 'error' && (
        <p className="px-4 py-4 text-review text-sm">{card.error}</p>
      )}

      {card.phase === 'done' && card.data && (
        <CardForm data={card.data} onUpdateField={onUpdateField} />
      )}
    </div>
  )
}

// ── CardForm ──────────────────────────────────────────────────────────────────

function CardForm({
  data,
  onUpdateField,
}: {
  data: GeneratedWord
  onUpdateField: <K extends keyof GeneratedWord>(field: K, value: GeneratedWord[K]) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* meanings: one per line, split on newline */}
      <FieldArea
        label="意味"
        value={data.meanings.join('\n')}
        rows={Math.min(data.meanings.length + 1, 4)}
        placeholder="意味1&#10;意味2"
        onChange={(v) =>
          onUpdateField('meanings', v.split('\n').map((s) => s.trim()).filter(Boolean))
        }
      />

      <FieldLine
        label="品詞"
        value={data.part_of_speech}
        onChange={(v) => onUpdateField('part_of_speech', v)}
      />

      <FieldArea
        label="英語例文"
        value={data.example}
        rows={2}
        onChange={(v) => onUpdateField('example', v)}
      />

      <FieldArea
        label="例文（和訳）"
        value={data.example_ja}
        rows={2}
        onChange={(v) => onUpdateField('example_ja', v)}
      />

      <FieldLine
        label="発音（IPA）"
        value={data.pronunciation}
        placeholder="/vɜːrb/"
        onChange={(v) => onUpdateField('pronunciation', v)}
      />

      <FieldLine
        label="発音（カタカナ）"
        value={data.pronunciation_kana}
        placeholder="ヴァーブ"
        onChange={(v) => onUpdateField('pronunciation_kana', v)}
      />

      {/* Show optional fields only when the model returned content */}
      {data.definition_en && (
        <FieldArea
          label="英英定義"
          value={data.definition_en}
          rows={2}
          onChange={(v) => onUpdateField('definition_en', v)}
        />
      )}

      {data.nuance && (
        <FieldArea
          label="ニュアンス / 用法メモ"
          value={data.nuance}
          rows={2}
          onChange={(v) => onUpdateField('nuance', v)}
        />
      )}
    </div>
  )
}

// ── tiny field helpers ────────────────────────────────────────────────────────

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

function SpinnerIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M8 1.5A6.5 6.5 0 1 0 14.5 8a.75.75 0 0 0-1.5 0A5 5 0 1 1 8 3a.75.75 0 0 0 0-1.5z" />
    </svg>
  )
}
