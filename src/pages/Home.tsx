import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchNotebooks,
  createNotebook,
  deleteNotebook,
} from '@/lib/notebooks'
import type { NotebookSummary } from '@/lib/notebooks'

/**
 * Home screen — shows the user's notebook list with word-count progress badges.
 * Supports creating and deleting notebooks (Phase 2).
 * Navigation to /notebook/:id/mastery is handled per-row.
 */
export default function Home() {
  const { user, signOut } = useAuth()

  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New notebook form
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Which notebook id is currently being deleted
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchNotebooks()
        if (!cancelled) setNotebooks(data)
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load notebooks')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // ── handlers ─────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !user) return

    setSubmitting(true)
    setError(null)
    try {
      const nb = await createNotebook(name, user.id)
      // Prepend to list — no re-fetch needed.
      setNotebooks((prev) => [
        { ...nb, known: 0, review: 0, unstudied: 0 },
        ...prev,
      ])
      setNewName('')
      setIsCreating(false)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to create notebook',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (
      !window.confirm(
        `「${name}」を削除しますか？\nこの単語帳の単語もすべて削除されます。`,
      )
    )
      return

    setDeletingId(id)
    setError(null)
    try {
      await deleteNotebook(id)
      setNotebooks((prev) => prev.filter((nb) => nb.id !== id))
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to delete notebook',
      )
    } finally {
      setDeletingId(null)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6">
      {/* ── header ── */}
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">LexSnap</h1>
        <div className="flex items-center gap-4">
          <Link to="/settings" className="text-muted text-sm hover:text-ink">
            Settings
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-muted text-sm hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── error banner ── */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-review">
          {error}
        </div>
      )}

      {/* ── new notebook: trigger button or inline form ── */}
      {isCreating ? (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <p className="mb-3 text-sm font-medium">新しい単語帳</p>
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="単語帳の名前を入力…"
            maxLength={100}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={!newName.trim() || submitting}
              className="bg-primary flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? '作成中…' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false)
                setNewName('')
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-muted hover:text-ink"
            >
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-4 text-muted transition-colors hover:border-primary hover:text-primary"
        >
          <PlusIcon />
          <span className="text-sm font-medium">新しい単語帳</span>
        </button>
      )}

      {/* ── notebook list ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <span className="text-muted text-sm">読み込み中…</span>
        </div>
      ) : notebooks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="text-4xl" role="img" aria-label="books">
            📚
          </span>
          <p className="font-medium">まだ単語帳がありません</p>
          <p className="text-muted text-sm">
            上のボタンから最初の単語帳を作りましょう
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {notebooks.map((nb) => (
            <li
              key={nb.id}
              className="flex items-center overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
            >
              {/* Tapping the main area navigates into the notebook */}
              <Link
                to={`/notebook/${nb.id}/mastery`}
                className="min-w-0 flex-1 p-4"
              >
                <p className="truncate font-medium">{nb.name}</p>
                <div className="mt-1.5 flex gap-4">
                  <StatusDot status="known" count={nb.known} />
                  <StatusDot status="review" count={nb.review} />
                  <StatusDot status="unstudied" count={nb.unstudied} />
                </div>
              </Link>

              {/* Delete button — outside the Link so taps don't navigate */}
              <button
                type="button"
                onClick={() => void handleDelete(nb.id, nb.name)}
                disabled={deletingId === nb.id}
                aria-label={`「${nb.name}」を削除`}
                className="p-4 text-muted transition-colors hover:text-review disabled:opacity-40"
              >
                {deletingId === nb.id ? <SpinnerIcon /> : <TrashIcon />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── small helper components ───────────────────────────────────────────────────

const STATUS_LABELS: Record<'known' | 'review' | 'unstudied', string> = {
  known: '知',
  review: '復',
  unstudied: '未',
}

function StatusDot({
  status,
  count,
}: {
  status: 'known' | 'review' | 'unstudied'
  count: number
}) {
  const colorMap = {
    known: 'text-known',
    review: 'text-review',
    unstudied: 'text-unstudied',
  } as const
  const dotMap = {
    known: 'bg-known',
    review: 'bg-review',
    unstudied: 'bg-unstudied',
  } as const
  return (
    <span className={`flex items-center gap-1 text-xs ${colorMap[status]}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotMap[status]}`}
        aria-hidden="true"
      />
      {count} {STATUS_LABELS[status]}
    </span>
  )
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1.5a.5.5 0 0 1 .5.5v5.5H14a.5.5 0 0 1 0 1H8.5V14a.5.5 0 0 1-1 0V8.5H2a.5.5 0 0 1 0-1h5.5V2a.5.5 0 0 1 .5-.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path
        fillRule="evenodd"
        d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
      />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 3a.75.75 0 0 1 .75.75V7h2.5a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75V3.75A.75.75 0 0 1 8 3z" />
    </svg>
  )
}
