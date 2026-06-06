import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/contexts/SettingsContext'
import type { CardFields, ExampleLength } from '@/types'

// ── field metadata ────────────────────────────────────────────────────────────

type BoolField = Exclude<keyof CardFields, 'example_length'>

const FIELD_LABELS: Record<BoolField, string> = {
  meaning:            '意味',
  part_of_speech:     '品詞',
  example:            '英語例文',
  example_ja:         '例文（和訳）',
  pronunciation:      '発音（IPA）',
  pronunciation_kana: '発音（カタカナ）',
  definition_en:      '英英定義',
  nuance:             'ニュアンス',
}

const FIELD_ORDER: BoolField[] = [
  'meaning',
  'part_of_speech',
  'example',
  'example_ja',
  'pronunciation',
  'pronunciation_kana',
  'definition_en',
  'nuance',
]

const EXAMPLE_LENGTH_LABELS: Record<ExampleLength, string> = {
  short:  '短い',
  medium: '普通',
  long:   '長い',
}

// ── Settings ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { settings, updateSettings } = useSettings()
  const [savingField, setSavingField] = useState<string | null>(null)

  async function toggleField(field: BoolField) {
    setSavingField(field)
    try {
      await updateSettings({ [field]: !settings[field] })
    } finally {
      setSavingField(null)
    }
  }

  async function setExampleLength(len: ExampleLength) {
    await updateSettings({ example_length: len })
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="戻る"
          className="text-muted hover:text-ink"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="font-semibold">設定</h1>
      </header>

      <div className="flex flex-col gap-6 p-4">
        {/* Card fields section */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            カードフィールド
          </p>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            {FIELD_ORDER.map((field, i) => (
              <div
                key={field}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i < FIELD_ORDER.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <span className="text-sm">{FIELD_LABELS[field]}</span>
                <Toggle
                  on={settings[field]}
                  loading={savingField === field}
                  onToggle={() => void toggleField(field)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Example length section */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            例文の長さ
          </p>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex gap-2">
              {(['short', 'medium', 'long'] as ExampleLength[]).map((len) => (
                <button
                  key={len}
                  type="button"
                  onClick={() => void setExampleLength(len)}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                    settings.example_length === len
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  {EXAMPLE_LENGTH_LABELS[len]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Account section */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            アカウント
          </p>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full px-4 py-3.5 text-left text-sm text-review hover:bg-gray-50 active:bg-gray-100"
            >
              サインアウト
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  on,
  loading,
  onToggle,
}: {
  on: boolean
  loading: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={loading}
      className={`relative h-7 w-12 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        on ? 'bg-primary' : 'bg-gray-200'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M12.707 5.293a1 1 0 0 1 0 1.414L9.414 10l3.293 3.293a1 1 0 0 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z"
      />
    </svg>
  )
}
