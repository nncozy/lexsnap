import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { updateWord } from '@/lib/words'
import { useSettings } from '@/contexts/SettingsContext'
import { useSpeech } from '@/hooks/useSpeech'
import type { Word, WordStatus } from '@/types'

// ── types ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Ordered list of words to study. Caller controls filtering & ordering. */
  words: Word[]
  /** User cancelled mid-session (some DB updates may already be applied). */
  onClose: () => void
  /** Session finished (all cards reviewed). Parent should re-fetch words. */
  onFinish: () => void
}

interface ChoiceRecord {
  wordId: string
  chosen: WordStatus
}

// ── FlashcardSession ──────────────────────────────────────────────────────────

/**
 * Full-screen flashcard session overlay.
 *
 * Front: word + 🔊 button + IPA + part of speech + わかる/わからない buttons.
 * Long press (500 ms) on the card area fades in an overlay showing meanings,
 * example, and nuance. Releasing hides the overlay.
 * Done: summary screen with counts.
 *
 * Status updates are fire-and-forget — the session never blocks on the DB.
 * The parent re-fetches words after `onFinish` to reflect the new statuses.
 */
export default function FlashcardSession({ words, onClose, onFinish }: Props) {
  const { settings } = useSettings()
  const { speak, stop, isSpeaking, isSupported } = useSpeech()

  const total = words.length
  const [index, setIndex] = useState(0)
  const [showOverlay, setShowOverlay] = useState(false)
  const [done, setDone] = useState(false)
  const [choices, setChoices] = useState<ChoiceRecord[]>([])

  const guardRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset per-card state (including speech) when moving to the next card.
  useEffect(() => {
    guardRef.current = false
    setShowOverlay(false)
    stop()
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  // `stop` is stable (useCallback), adding it doesn't cause extra re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  const current = words[index]

  // ── handlers ─────────────────────────────────────────────────────────────

  function handleChoose(status: WordStatus) {
    if (!current || guardRef.current) return
    guardRef.current = true
    stop() // stop any ongoing speech before advancing

    // Fire-and-forget — UI never waits for the DB round-trip.
    void updateWord(current.id, { status }).catch(() => {
      /* best-effort; session continues regardless */
    })

    setChoices((prev) => [...prev, { wordId: current.id, chosen: status }])

    if (index + 1 >= total) {
      setDone(true)
    } else {
      setIndex((i) => i + 1)
    }
  }

  function handlePointerDown() {
    longPressTimer.current = setTimeout(() => {
      setShowOverlay(true)
    }, 500)
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setShowOverlay(false)
  }

  // ── edge case: empty word list ────────────────────────────────────────────

  if (total === 0) {
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-muted">仕分けする単語がありません</p>
          <button
            type="button"
            onClick={onFinish}
            className="text-primary text-sm font-medium"
          >
            閉じる
          </button>
        </div>
      </Overlay>
    )
  }

  // ── done screen ───────────────────────────────────────────────────────────

  if (done) {
    const knownCount = choices.filter((c) => c.chosen === 'known').length
    const reviewCount = choices.filter((c) => c.chosen === 'review').length

    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
          <span className="text-6xl" role="img" aria-label="完了">🎉</span>

          <div>
            <h2 className="text-2xl font-bold">仕分け完了！</h2>
            <p className="mt-1 text-sm text-muted">{total} 語を仕分けました</p>
          </div>

          <div className="flex w-full max-w-xs items-center justify-around rounded-2xl bg-canvas py-6">
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold text-known">{knownCount}</span>
              <span className="text-sm text-muted">わかった</span>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold text-review">{reviewCount}</span>
              <span className="text-sm text-muted">要復習</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onFinish}
            className="bg-primary w-full max-w-xs rounded-xl py-3 font-semibold text-white"
          >
            完了
          </button>
        </div>
      </Overlay>
    )
  }

  // ── card screen ───────────────────────────────────────────────────────────

  const progressPct = (index / total) * 100

  return (
    <Overlay>
      {/* Session header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted hover:text-ink"
        >
          キャンセル
        </button>
        <span className="text-sm font-medium">
          {index + 1}{' '}
          <span className="text-muted font-normal">/ {total}</span>
        </span>
        {/* Spacer keeps the counter visually centred */}
        <div className="w-14" aria-hidden="true" />
      </div>

      {/* Thin progress bar */}
      <div className="h-1 shrink-0 bg-gray-100">
        <div
          className="bg-primary h-full transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Card area — long press reveals back overlay */}
      <div
        className="relative flex flex-1 select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Front face */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          {/* Word + speaker button (row) */}
          <div className="flex items-center gap-2">
            <p className="break-all text-4xl font-bold">{current.word}</p>

            {/* 🔊 speaker button — stopPropagation prevents the long-press timer
                from starting when the user taps the button. */}
            {isSupported && (
              <button
                type="button"
                aria-label={isSpeaking ? '読み上げを停止' : `「${current.word}」を読み上げ`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => speak(current.word)}
                className={`shrink-0 rounded-full p-2 transition-colors ${
                  isSpeaking
                    ? 'animate-pulse bg-primary/10 text-primary'
                    : 'text-muted hover:bg-gray-100 hover:text-ink'
                }`}
              >
                <SpeakerIcon />
              </button>
            )}
          </div>

          {current.pronunciation && (
            <p className="text-muted">{current.pronunciation}</p>
          )}
          {current.part_of_speech && (
            <p className="text-sm text-muted">{current.part_of_speech}</p>
          )}

          <p className="mt-6 text-xs text-gray-300">長押しで意味を確認</p>
        </div>

        {/* Back overlay — fades in while long pressing, hides on release */}
        <div
          className={`absolute inset-0 overflow-y-auto bg-white/95 backdrop-blur-sm transition-opacity duration-200 ${
            showOverlay ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="px-6 py-8">
            {/* Word header */}
            <div className="mb-5 text-center">
              <p className="text-2xl font-bold">{current.word}</p>
              {(current.pronunciation || (settings.pronunciation_kana && current.pronunciation_kana)) && (
                <p className="mt-0.5 text-sm text-muted">
                  {[
                    current.pronunciation,
                    settings.pronunciation_kana ? current.pronunciation_kana : '',
                  ]
                    .filter(Boolean)
                    .join('  ')}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {/* Meanings */}
              {settings.meaning && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">意味</p>
                  <ul className="flex flex-col gap-0.5">
                    {current.meanings.map((m, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable display order
                      <li key={i} className="text-sm">
                        {current.meanings.length > 1 && (
                          <span className="mr-1 text-xs text-muted">{i + 1}.</span>
                        )}
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Example */}
              {settings.example && current.example && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">例文</p>
                  <p className="text-sm italic">{current.example}</p>
                  {settings.example_ja && current.example_ja && (
                    <p className="mt-0.5 text-xs text-muted">{current.example_ja}</p>
                  )}
                </div>
              )}

              {/* Nuance */}
              {settings.nuance && current.nuance && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">ニュアンス</p>
                  <p className="text-sm">{current.nuance}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Choice buttons — always visible */}
      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-gray-100 bg-white px-4 py-4">
        <button
          type="button"
          onClick={() => handleChoose('review')}
          className="rounded-xl border-2 border-review py-3 font-semibold text-review transition-opacity active:opacity-70"
        >
          わからない
        </button>
        <button
          type="button"
          onClick={() => handleChoose('known')}
          className="bg-known rounded-xl py-3 font-semibold text-white transition-opacity active:opacity-70"
        >
          わかる
        </button>
      </div>
    </Overlay>
  )
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-white">
      {children}
    </div>
  )
}

// ── icons ─────────────────────────────────────────────────────────────────────

/** Volume-up speaker icon (Material Design). */
function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}
