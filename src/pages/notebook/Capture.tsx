import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

/**
 * Step 1 of the capture flow.
 *
 * The user picks an image either by taking a photo (camera) or selecting a
 * file from their gallery / filesystem.  The image is encoded as a data-URL
 * and passed to /notebook/:id/select via navigation state.
 */
export default function Capture() {
  const { id: notebookId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── file handling ─────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string)
      setLoading(false)
    }
    reader.readAsDataURL(file)

    // Reset the input value so the same file can be re-selected if needed.
    e.target.value = ''
  }

  function handleNext() {
    if (!preview || !notebookId) return
    navigate(`/notebook/${notebookId}/select`, {
      state: { imageDataUrl: preview },
    })
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="戻る"
          className="text-muted hover:text-ink"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="font-semibold">キャプチャ</h1>
      </header>

      {/* Hidden file inputs */}
      {/* capture="environment" → opens rear camera on mobile */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      {/* No capture → file picker / gallery */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
        {loading ? (
          <p className="text-muted text-sm">読み込み中…</p>
        ) : preview ? (
          /* ── preview state ── */
          <div className="flex w-full flex-col items-center gap-5">
            <div className="w-full overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
              <img
                src={preview}
                alt="キャプチャ画像プレビュー"
                className="max-h-72 w-full object-contain"
              />
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="bg-primary w-full rounded-xl py-3 font-medium text-white"
            >
              次へ → 単語を選択
            </button>

            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-muted text-sm hover:text-ink"
            >
              別の画像を選ぶ
            </button>
          </div>
        ) : (
          /* ── empty state: pick source ── */
          <div className="flex w-full flex-col gap-4">
            <p className="text-muted text-center text-sm">
              テキストが写った画像を選んでください
            </p>

            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 py-8 text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <CameraIcon />
              <span className="font-medium">カメラで撮影</span>
            </button>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 py-8 text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <PhotoIcon />
              <span className="font-medium">ライブラリ / ファイルを選択</span>
            </button>
          </div>
        )}
      </main>
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

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.382l-.724-1.447A1 1 0 0 0 15 2H9zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
      />
    </svg>
  )
}

function PhotoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-2.5 2.5-1.69-1.69a1.5 1.5 0 0 0-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0z"
      />
    </svg>
  )
}
