import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

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

// ── drag state (kept in a ref to avoid stale closures) ────────────────────────

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
 * Edge Function (Gemini Vision), then renders the recognised text as tappable
 * word tokens.
 *
 * Layout: h-dvh flex-col so the page never scrolls — the middle text area is
 * the only scrollable region (flex-1 overflow-y-auto).  The header, image
 * thumbnail, and bottom panel are fixed-height shrink-0 rows.
 *
 * Touch note: `touch-action: none` on the token container hands all pointer
 * events to our drag-selection logic.  The outer scroll container can still
 * be scrolled by starting a swipe in the padding area (top/bottom of text).
 */
export default function Select() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state } = useLocation()
  const imageDataUrl = (state as { imageDataUrl?: string } | null)?.imageDataUrl

  // ── OCR (Gemini Vision via Edge Function) ────────────────────────────────

  type OcrPhase = 'running' | 'done' | 'error'
  const [ocrPhase, setOcrPhase] = useState<OcrPhase>('running')
  const [tokens, setTokens] = useState<Token[]>([])

  useEffect(() => {
    if (!imageDataUrl) return
    let cancelled = false

    async function runOcr() {
      // Split "data:<mimeType>;base64,<data>" → mimeType + raw base64
      const match = imageDataUrl!.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        if (!cancelled) setOcrPhase('error')
        return
      }
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
    return () => {
      cancelled = true
    }
  }, [imageDataUrl])

  // ── selection ─────────────────────────────────────────────────────────────

  const [selectedWords, setSelectedWords] = useState<string[]>([])
  // [startTokenId, currentTokenId] while drag is in progress; null otherwise.
  const [dragRange, setDragRange] = useState<[number, number] | null>(null)

  const dragRef = useRef<DragState>({ ...IDLE_DRAG })

  function getTokenIdAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)
    const raw = el?.getAttribute?.('data-token-id')
    return raw != null ? parseInt(raw, 10) : null
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const tid = getTokenIdAt(e.clientX, e.clientY)
    if (tid == null) return
    // Capture the pointer so move/up events are delivered even if finger moves
    // off the element, and so the browser treats this as a custom interaction.
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
      // Range drag → build a phrase from all word tokens in the range.
      const lo = Math.min(drag.startId, drag.currentId)
      const hi = Math.max(drag.startId, drag.currentId)
      const phrase = tokens
        .filter((t) => t.id >= lo && t.id <= hi && t.isWord)
        .map((t) => t.word)
        .join(' ')
        .trim()
      if (phrase) {
        setSelectedWords((prev) =>
          prev.includes(phrase) ? prev : [...prev, phrase],
        )
      }
    } else {
      // Single tap → toggle individual word.
      const tok = tokens.find((t) => t.id === drag.startId)
      if (tok?.isWord && tok.word) {
        setSelectedWords((prev) =>
          prev.includes(tok.word)
            ? prev.filter((w) => w !== tok.word)
            : [...prev, tok.word],
        )
      }
    }

    dragRef.current = { ...IDLE_DRAG }
    setDragRange(null)
  }

  function handlePointerCancel() {
    dragRef.current = { ...IDLE_DRAG }
    setDragRange(null)
  }

  function removeWord(word: string) {
    setSelectedWords((prev) => prev.filter((w) => w !== word))
  }

  function handleNext() {
    navigate(`/notebook/${notebookId}/preview`, {
      state: { words: selectedWords },
    })
  }

  // ── token rendering helpers ───────────────────────────────────────────────

  function renderToken(token: Token) {
    if (token.isNewline) return <br key={token.id} />

    if (!token.isWord) {
      return <span key={token.id}>{token.display}</span>
    }

    const selected = selectedWords.includes(token.word)

    let inRange = false
    if (dragRange) {
      const lo = Math.min(dragRange[0], dragRange[1])
      const hi = Math.max(dragRange[0], dragRange[1])
      inRange = token.id >= lo && token.id <= hi
    }

    const colorClass = selected
      ? 'bg-primary text-white'
      : inRange
        ? 'bg-primary/30 text-ink'
        : 'hover:bg-gray-100 active:bg-gray-200 text-ink'

    return (
      <span
        key={token.id}
        data-token-id={token.id}
        className={`cursor-pointer rounded px-0.5 py-0.5 transition-colors ${colorClass}`}
      >
        {token.display}
      </span>
    )
  }

  // ── guard: redirect to capture if no image ────────────────────────────────

  if (!imageDataUrl) {
    return <Navigate to={`/notebook/${notebookId}/capture`} replace />
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    // h-dvh: fills the visible viewport including mobile browser chrome.
    // overflow-hidden: prevents the page itself from scrolling.
    <div className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-white">

      {/* ── Header ── shrink-0 so it never compresses */}
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

      {/* ── Image thumbnail — max-h-40 keeps it compact on small screens */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50">
        <img
          src={imageDataUrl}
          alt="OCR 元画像"
          className="mx-auto max-h-40 w-full object-contain"
        />
      </div>

      {/* ── Scrollable OCR text area ────────────────────────────────────────
          min-h-0 is required on a flex child to allow it to shrink below its
          content height, which enables overflow-y-auto to actually scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {ocrPhase === 'running' && <OcrProgressBar />}

        {ocrPhase === 'error' && (
          <p className="text-review text-sm">
            OCR に失敗しました。
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-primary ml-1 underline"
            >
              戻って画像を選び直す
            </button>
          </p>
        )}

        {ocrPhase === 'done' && tokens.length === 0 && (
          <p className="text-muted text-sm">
            テキストを認識できませんでした。別の画像をお試しください。
          </p>
        )}

        {ocrPhase === 'done' && tokens.length > 0 && (
          <>
            <p className="text-muted mb-3 text-xs">
              タップで単語を選択 / ドラッグで熟語を選択
            </p>
            {/* touch-action: none hands all gestures to our pointer handlers.
                Scroll the text area by starting a swipe from the padding
                region above or below this container. */}
            <div
              className="select-none leading-relaxed"
              style={{ touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              {tokens.map(renderToken)}
            </div>
            {/* Extra bottom padding so the last token is not obscured and
                there is a touchable area to initiate a scroll from below. */}
            <div className="h-6" aria-hidden="true" />
          </>
        )}
      </div>

      {/* ── Bottom panel ── shrink-0; sticks to the bottom of the flex column.
          paddingBottom uses env(safe-area-inset-bottom) for iOS home-bar
          devices; falls back to 1.5 rem on other platforms. */}
      <div
        className="shrink-0 border-t border-gray-100 bg-canvas px-4 pt-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {selectedWords.length > 0 && (
          <div className="mb-3 flex max-h-20 flex-wrap gap-2 overflow-y-auto">
            {selectedWords.map((w) => (
              <span
                key={w}
                className="text-primary flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
              >
                {w}
                <button
                  type="button"
                  onClick={() => removeWord(w)}
                  aria-label={`「${w}」を削除`}
                  className="text-primary/60 hover:text-primary ml-0.5 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {selectedWords.length === 0 && (
          <p className="text-muted mb-3 text-sm">単語をタップして選択してください</p>
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
    </div>
  )
}

// ── helper components ─────────────────────────────────────────────────────────

/** Indeterminate loading bar shown while the Edge Function processes the image. */
function OcrProgressBar() {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted">テキストを抽出中…</span>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="bg-primary/50 h-full w-1/2 animate-pulse rounded-full" />
      </div>
    </div>
  )
}

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
