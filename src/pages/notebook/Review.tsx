import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchNotebook } from '@/lib/notebooks'
import { fetchWords } from '@/lib/words'
import FlashcardSession from '@/components/FlashcardSession'
import type { Word } from '@/types'

// ── Review ────────────────────────────────────────────────────────────────────

/**
 * Phase 6 — 総復習タブ.
 *
 * Shows only words with `status === 'review'` and lets the user re-sort them
 * via FlashcardSession. Words marked "わかる" move to 'known'; words marked
 * "わからない" stay as 'review'.
 *
 * No spaced-repetition scheduling — this is a simple full-pass review.
 */
export default function Review() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [allWords, setAllWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [notebookName, setNotebookName] = useState('')
  const [sessionActive, setSessionActive] = useState(false)

  // ── load ──────────────────────────────────────────────────────────────────

  const reload = () => {
    void fetchWords(notebookId!).then(setAllWords)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [nb, ws] = await Promise.all([
          fetchNotebook(notebookId!),
          fetchWords(notebookId!),
        ])
        if (!cancelled) {
          setNotebookName(nb?.name ?? '')
          setAllWords(ws)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [notebookId])

  // ── derived ───────────────────────────────────────────────────────────────

  const reviewWords = allWords.filter((w) => w.status === 'review')

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
            {notebookName || '単語帳'}
          </h1>
          <Link
            to={`/notebook/${notebookId}/capture`}
            className="bg-primary flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          >
            <PlusIcon />
            追加
          </Link>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          <Link
            to={`/notebook/${notebookId}/mastery`}
            className="flex-1 py-2.5 text-center text-sm text-muted hover:text-ink"
          >
            習得
          </Link>
          <Link
            to={`/notebook/${notebookId}/list`}
            className="flex-1 py-2.5 text-center text-sm text-muted hover:text-ink"
          >
            一覧
          </Link>
          <div className="border-primary flex-1 border-b-2 py-2.5 text-center text-sm font-semibold text-primary">
            総復習
          </div>
        </div>
      </header>

      {/* ── body ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-muted text-sm">読み込み中…</span>
        </div>
      ) : reviewWords.length === 0 ? (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="text-5xl" role="img" aria-label="チェック">✅</span>
          <p className="font-semibold">要復習の単語はありません</p>
          <p className="text-muted text-sm">
            習得タブで仕分けをすると、ここに表示されます
          </p>
          <Link
            to={`/notebook/${notebookId}/mastery`}
            className="text-primary mt-2 text-sm font-medium hover:underline"
          >
            習得タブへ →
          </Link>
        </div>
      ) : (
        /* Review CTA */
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          {/* Count display */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-50">
              <span className="text-4xl font-bold text-review">
                {reviewWords.length}
              </span>
            </div>
            <p className="font-medium">要復習の単語</p>
            <p className="text-sm text-muted">
              「わかる」を選ぶと習得済みになります
            </p>
          </div>

          {/* Start button */}
          <button
            type="button"
            onClick={() => setSessionActive(true)}
            className="bg-review w-full rounded-xl py-4 font-semibold text-white"
          >
            総復習を始める ({reviewWords.length} 語)
          </button>

          <Link
            to={`/notebook/${notebookId}/list`}
            className="text-sm text-muted hover:text-ink"
          >
            一覧で確認する
          </Link>
        </div>
      )}

      {/* Flashcard session overlay */}
      {sessionActive && (
        <FlashcardSession
          words={reviewWords}
          onClose={() => {
            setSessionActive(false)
            reload()
          }}
          onFinish={() => {
            setSessionActive(false)
            reload()
          }}
        />
      )}
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
