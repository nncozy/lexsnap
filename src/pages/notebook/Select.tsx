import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ── constants ─────────────────────────────────────────────────────────────────

const MAX_SELECTIONS = 15

// ── token model ────────────────────────────────────────────────────────────────

interface Token {
  id: number
  display: string  // raw text shown in the UI
  word: string     // cleaned word for the vocab card (empty for non-words)
  isWord: boolean
  isNewline: boolean
}

/**
 * Split raw OCR text into display tokens.
 * Each whitespace run → single space token.
 * Each newline → a newline token (rendered as <br>).
 * Each non-whitespace chunk → a word token (selectable if it contains letters).
 */
function tokenize(rawText: string): Token[] {
  let id = 0
  const result: Token[] = []
  const lines = rawText.split('\n')

  for (let li = 0; li < lines.length; li++) {
    const chunks = lines[li].split(/(\s+)/).filter((c) => c.length > 0)

    for (const chunk of chunks) {
      if (/^\s+$/.test(chunk)) {
        result.push({ id: id++, display: ' ', word: '', isWord: false, isNewline: false })
      } else {
        // Strip surrounding punctuation/numbers to get the bare English word.
        const w = chunk
          .replace(/^[^a-zA-Z]+/, '')
          .replace(/[^a-zA-Z''-]+$/, '')
          .toLowerCase()
        result.push({
          id: id++,
          display: chunk,
          word: w,
          isWord: w.length >= 1 && /[a-zA-Z]/.test(w),
          isNewline: false,
        })
      }
    }

    // Insert a newline token between lines (but not after the last line).
    if (li < lines.length - 1) {
      result.push({ id: id++, display: '\n', word: '', isWord: false, isNewline: true })
    }
  }

  return result
}

// ── drag state ─────────────────────────────────────────────────────────────────
// Kept in a ref to avoid stale closures. Scroll-vs-select direction detection
// has been removed — modes are now explicit (scroll mode / select mode).

interface DragState {
  active: boolean
  pointerId: number
  startId: number
  currentId: number
  hasMoved: boolean
}

const IDLE_DRAG: DragState = {
  active: false,
  pointerId: -1,
  startId: -1,
  currentId: -1,
  hasMoved: false,
}

// ── component ──────────────────────────────────────────────────────────────────

/**
 * Step 2 of the capture flow.
 *
 * Receives the image data-URL via navigation state, calls the `ocr-image`
 * Edge Function (Gemini Vision), and renders the recognised text as tappable
 * word tokens.
 *
 * Mode toggle:
 *   Scroll mode (default) — touch-action: auto, native scroll, tap to select.
 *   Select mode           — touch-action: none, tap + drag selection, no scroll.
 *
 * Max selection: MAX_SELECTIONS words; exceeding shows a toast.
 */
export default function Select() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state } = useLocation()
  const imageDataUrl = (state as { imageDataUrl?: string } | null)?.imageDataUrl

  // ── OCR ───────────────────────────────────────────────────────────────────

  type OcrPhase = 'running' | 'done' | 'error'
  const [ocrPhase, setOcrPhase] = useState<OcrPhase>('running')
  const [tokens, setTokens] = useState<Token[]>([])

  useEffect(() => {
    if (!imageDataUrl) return
    let cancelled = false

    async function runOcr() {
      const match = imageDataUrl!.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) { if (!cancelled) setOcrPhase('error'); return }
      const [, mimeType, imageBase64] = match
      try {
        const { data, error } = await supabase.functions.invoke<{ text: string }>(
          'ocr-image',
          { body: { imageBase64, mimeType } },
        )
        if (cancelled) return
        if (error) throw error
        if (!data?.text) throw new Error('Empty OCR response')
        setTokens(tokenize(data.text))
        setOcrPhase('done')
      } catch (e) {
        console.error('OCR error:', e)
        if (!cancelled) setOcrPhase('error')
      }
    }

    void runOcr()
    return () => { cancelled = true }
  }, [imageDataUrl])

  // ── mode ──────────────────────────────────────────────────────────────────

  /** false = scroll mode (default), true = select mode */
  const [selectionMode, setSelectionMode] = useState(false)

  function switchMode(mode: boolean) {
    setSelectionMode(mode)
    // Clear any in-progress drag when switching modes
    dragRef.current = { ...IDLE_DRAG }
    setDragRange(null)
  }

  // ── selection ─────────────────────────────────────────────────────────────

  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [dragRange, setDragRange] = useState<[number, number] | null>(null)
  const dragRef = useRef<DragState>({ ...IDLE_DRAG })

  // ── toast ─────────────────────────────────────────────────────────────────

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  // ── word management ───────────────────────────────────────────────────────

  /** Toggle a single word (tap). */
  function toggleWord(word: string) {
    if (selectedWords.includes(word)) {
      setSelectedWords((prev) => prev.filter((w) => w !== word))
    } else if (selectedWords.length >= MAX_SELECTIONS) {
      showToast(`最大${MAX_SELECTIONS}語まで選択できます`)
    } else {
      setSelectedWords((prev) => [...prev, word])
    }
  }

  /** Add a phrase (drag selection result). Duplicate or limit → no-op / toast. */
  function addPhrase(phrase: string) {
    if (!phrase || selectedWords.includes(phrase)) return
    if (selectedWords.length >= MAX_SELECTIONS) {
      showToast(`最大${MAX_SELECTIONS}語まで選択できます`)
      return
    }
    setSelectedWords((prev) => [...prev, phrase])
  }

  function removeWord(word: string) {
    setSelectedWords((prev) => prev.filter((w) => w !== word))
  }

  // ── pointer handlers (select mode only) ──────────────────────────────────

  function getTokenIdAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)
    const raw = el?.getAttribute?.('data-token-id')
    return raw != null ? parseInt(raw, 10) : null
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const tid = getTokenIdAt(e.clientX, e.clientY)
    if (tid == null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startId: tid,
      currentId: tid,
      hasMoved: false,
    }
    setDragRange([tid, tid])
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    const tid = getTokenIdAt(e.clientX, e.clientY)
    if (tid == null || tid === drag.currentId) return
    drag.hasMoved = true
    drag.currentId = tid
    setDragRange([drag.startId, tid])
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return

    if (drag.hasMoved) {
      // Drag → phrase selection
      const lo = Math.min(drag.startId, drag.currentId)
      const hi = Math.max(drag.startId, drag.currentId)
      const phrase = tokens
        .filter((t) => t.id >= lo && t.id <= hi && t.isWord)
        .map((t) => t.word)
        .join(' ')
        .trim()
      addPhrase(phrase)
    } else {
      // Tap → toggle single word
      const tok = tokens.find((t) => t.id === drag.startId)
      if (tok?.isWord && tok.word) toggleWord(tok.word)
    }

    dragRef.current = { ...IDLE_DRAG }
    setDragRange(null)
  }

  function handlePointerCancel() {
    dragRef.current = { ...IDLE_DRAG }
    setDragRange(null)
  }

  function handleNext() {
    navigate(`/notebook/${notebookId}/preview`, { state: { words: selectedWords } })
  }

  // ── token rendering ───────────────────────────────────────────────────────

  function renderToken(token: Token) {
    if (token.isNewline) return <br key={token.id} />
    if (!token.isWord) return <span key={token.id}>{token.display}</span>

    const selected = selectedWords.includes(token.word)

    let inRange = false
    if (dragRange && selectionMode) {
      const lo = Math.min(dragRange[0], dragRange[1])
      const hi = Math.max(dragRange[0], dragRange[1])
      inRange = token.id >= lo && token.id <= hi
    }

    const colorClass = selected
      ? 'bg-primary text-white'
      : inRange
        ? 'bg-primary/30 text-ink'
        : 'hover:bg-gray-100 active:bg-gray-200 text-ink'

    return selectionMode ? (
      // Select mode: pointer events on the container drive selection
      <span
        key={token.id}
        data-token-id={token.id}
        className={`cursor-pointer rounded px-0.5 py-0.5 transition-colors ${colorClass}`}
      >
        {token.display}
      </span>
    ) : (
      // Scroll mode: native scroll; tap-to-toggle via onClick
      <span
        key={token.id}
        onClick={() => toggleWord(token.word)}
        className={`cursor-pointer rounded px-0.5 py-0.5 transition-colors ${colorClass}`}
      >
        {token.display}
      </span>
    )
  }

  // ── guard ─────────────────────────────────────────────────────────────────

  if (!imageDataUrl) {
    return <Navigate to={`/notebook/${notebookId}/capture`} replace />
  }

  // ── render ────────────────────────────────────────────────────────────────

  const hasTokens = ocrPhase === 'done' && tokens.length > 0

  return (
    // h-dvh fills the visible viewport; overflow-hidden prevents page scroll.
    <div className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-white">

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="戻る"
          className="text-muted hover:text-ink"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="font-semibold">単語を選択</h1>
      </header>

      {/* ── Image thumbnail ── */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50">
        <img
          src={imageDataUrl}
          alt="OCR 元画像"
          className="mx-auto max-h-40 w-full object-contain"
        />
      </div>

      {/* ── Mode toggle bar — only shown after OCR completes ── */}
      {hasTokens && (
        <div className="shrink-0 flex border-b border-gray-100 bg-white">
          <button
            type="button"
            onClick={() => switchMode(false)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              !selectionMode
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <LockIcon />
            スクロール
          </button>
          <button
            type="button"
            onClick={() => switchMode(true)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              selectionMode
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <PencilIcon />
            選択
          </button>
        </div>
      )}

      {/* ── Scrollable text area ──
          min-h-0 allows the flex child to shrink below content height,
          enabling overflow-y-auto to scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* Loading / error / empty states */}
        {ocrPhase === 'running' && (
          <div className="p-4"><OcrProgressBar /></div>
        )}

        {ocrPhase === 'error' && (
          <p className="p-4 text-sm text-review">
            OCR に失敗しました。
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="ml-1 text-primary underline"
            >
              戻って画像を選び直す
            </button>
          </p>
        )}

        {ocrPhase === 'done' && tokens.length === 0 && (
          <p className="p-4 text-sm text-muted">
            テキストを認識できませんでした。別の画像をお試しください。
          </p>
        )}

        {/* Token area */}
        {hasTokens && (
          <>
            <p className="px-4 pt-3 pb-2 text-xs text-muted">
              {selectionMode
                ? 'タップで単語を選択 · ドラッグで熟語を選択'
                : 'タップで単語を選択 · 選択モードでドラッグ可'}
            </p>

            {/* px-4 gives left/right breathing room so text doesn't touch edges. */}
            {/* touch-action switches between auto (scroll) and none (select). */}
            <div
              className="select-none px-4 pb-6 leading-relaxed"
              style={{ touchAction: selectionMode ? 'none' : 'auto' }}
              {...(selectionMode
                ? {
                    onPointerDown: handlePointerDown,
                    onPointerMove: handlePointerMove,
                    onPointerUp: handlePointerUp,
                    onPointerCancel: handlePointerCancel,
                  }
                : {})}
            >
              {tokens.map(renderToken)}
            </div>
          </>
        )}
      </div>

      {/* ── Bottom panel ── shrink-0; env(safe-area-inset-bottom) for iOS. */}
      <div
        className="shrink-0 border-t border-gray-100 bg-canvas px-4 pt-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {selectedWords.length > 0 && (
          <div className="mb-3 flex max-h-20 flex-wrap gap-2 overflow-y-auto">
            {selectedWords.map((w) => (
              <span
                key={w}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
              >
                {w}
                <button
                  type="button"
                  onClick={() => removeWord(w)}
                  aria-label={`「${w}」を削除`}
                  className="ml-0.5 leading-none text-primary/60 hover:text-primary"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {selectedWords.length === 0 && (
          <p className="mb-3 text-sm text-muted">単語をタップして選択してください</p>
        )}

        <button
          type="button"
          onClick={handleNext}
          disabled={selectedWords.length === 0}
          className="bg-primary w-full rounded-xl py-3 font-medium text-white disabled:opacity-40"
        >
          {selectedWords.length === 0
            ? 'プレビューへ'
            : `プレビューへ (${selectedWords.length} 語)`}
        </button>
      </div>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-6"
          aria-live="assertive"
        >
          <span className="rounded-full bg-gray-800/90 px-5 py-2.5 text-sm text-white shadow-lg">
            {toast}
          </span>
        </div>
      )}
    </div>
  )
}

// ── helper components ─────────────────────────────────────────────────────────

function OcrProgressBar() {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted">テキストを抽出中…</span>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/50" />
      </div>
    </div>
  )
}

// ── icons ─────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 0 1 0 1.414L9.414 10l3.293 3.293a1 1 0 0 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z" />
    </svg>
  )
}

/** Represents "scroll mode" — a closed padlock. */
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z" />
    </svg>
  )
}

/** Represents "select mode" — a pencil. */
function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  )
}
