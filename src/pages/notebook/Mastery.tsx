import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchNotebook } from '@/lib/notebooks'
import { fetchWords } from '@/lib/words'
import FlashcardSession from '@/components/FlashcardSession'
import type { Word } from '@/types'

// ── Mastery ───────────────────────────────────────────────────────────────────

/**
 * Phase 6 — 習得タブ.
 *
 * Displays a progress ring (known / total), status breakdowns, and two CTAs:
 *   1. "仕分けを始める" — opens a FlashcardSession for all non-known words.
 *   2. Link to the 一覧 tab.
 */
export default function Mastery() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [notebookName, setNotebookName] = useState('')
  const [sessionActive, setSessionActive] = useState(false)

  // ── load ──────────────────────────────────────────────────────────────────

  const reload = () => {
    void fetchWords(notebookId!).then(setWords)
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
          setWords(ws)
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

  // ── derived counts ────────────────────────────────────────────────────────

  const total = words.length
  const known = words.filter((w) => w.status === 'known').length
  const review = words.filter((w) => w.status === 'review').length
  const unstudied = words.filter((w) => w.status === 'unstudied').length

  // Study queue: unstudied first (fresh), then review (needs reinforcement).
  const studyWords = [
    ...words.filter((w) => w.status === 'unstudied'),
    ...words.filter((w) => w.status === 'review'),
  ]

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
          <div className="border-primary flex-1 border-b-2 py-2.5 text-center text-sm font-semibold text-primary">
            習得
          </div>
          <Link
            to={`/notebook/${notebookId}/list`}
            className="flex-1 py-2.5 text-center text-sm text-muted hover:text-ink"
          >
            一覧
          </Link>
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
        <div className="flex flex-1 items-center justify-center">
          <span className="text-muted text-sm">読み込み中…</span>
        </div>
      ) : total === 0 ? (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="text-5xl" role="img" aria-label="books">📚</span>
          <p className="font-semibold">単語がまだありません</p>
          <p className="text-muted text-sm">撮影して単語を追加しましょう</p>
          <Link
            to={`/notebook/${notebookId}/capture`}
            className="bg-primary mt-2 flex items-center gap-2 rounded-xl px-5 py-3 font-medium text-white"
          >
            <CameraIcon />
            撮影して単語を追加
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-8 px-6 py-10">
          {/* Progress ring */}
          <ProgressRing known={known} total={total} />

          {/* Status count row */}
          <div className="flex w-full max-w-xs justify-around">
            <CountPill label="知" count={known} colorClass="text-known" />
            <CountPill label="復" count={review} colorClass="text-review" />
            <CountPill label="未" count={unstudied} colorClass="text-unstudied" />
          </div>

          {/* CTAs */}
          <div className="flex w-full flex-col gap-3">
            {studyWords.length > 0 ? (
              <button
                type="button"
                onClick={() => setSessionActive(true)}
                className="bg-primary w-full rounded-xl py-4 font-semibold text-white"
              >
                仕分けを始める ({studyWords.length} 語)
              </button>
            ) : (
              <div className="w-full rounded-xl bg-emerald-50 px-4 py-4 text-center">
                <p className="font-semibold text-known">🎉 全単語を習得済み！</p>
              </div>
            )}

            <Link
              to={`/notebook/${notebookId}/list`}
              className="w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              単語一覧を見る
            </Link>
          </div>
        </div>
      )}

      {/* Flashcard session overlay */}
      {sessionActive && (
        <FlashcardSession
          words={studyWords}
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

// ── ProgressRing ──────────────────────────────────────────────────────────────

/**
 * SVG arc ring showing known / total progress in green.
 * Starts at the top (12 o'clock) and fills clockwise.
 */
function ProgressRing({ known, total }: { known: number; total: number }) {
  const r = 40
  const strokeWidth = 10
  const circumference = 2 * Math.PI * r
  const knownFrac = total > 0 ? known / total : 0
  const knownArc = knownFrac * circumference
  const pct = Math.round(knownFrac * 100)

  return (
    <div className="relative" style={{ width: 160, height: 160 }}>
      <svg
        width="160"
        height="160"
        viewBox="0 0 100 100"
        /* Rotate so the arc starts at 12 o'clock instead of 3 o'clock */
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Gray background track */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        {/* Green known arc */}
        {total > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#10B981"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${knownArc} ${circumference - knownArc}`}
          />
        )}
      </svg>

      {/* Centre label — not rotated */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none">{pct}</span>
        <span className="text-base leading-none text-muted">%</span>
        <span className="mt-1 text-xs text-muted">習得済</span>
      </div>
    </div>
  )
}

// ── CountPill ─────────────────────────────────────────────────────────────────

function CountPill({
  label,
  count,
  colorClass,
}: {
  label: string
  count: number
  colorClass: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-2xl font-bold ${colorClass}`}>{count}</span>
      <span className="text-xs text-muted">{label}</span>
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

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.382l-.724-1.447A1 1 0 0 0 15 2H9zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
      />
    </svg>
  )
}
