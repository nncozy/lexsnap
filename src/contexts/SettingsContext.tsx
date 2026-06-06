import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchSettings, saveSettings } from '@/lib/settings'
import { DEFAULT_CARD_FIELDS } from '@/types'
import type { CardFields } from '@/types'

interface SettingsContextValue {
  settings: CardFields
  updateSettings: (patch: Partial<CardFields>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CardFields>({ ...DEFAULT_CARD_FIELDS })

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void fetchSettings().then(setSettings)
      } else {
        setSettings({ ...DEFAULT_CARD_FIELDS })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function updateSettings(patch: Partial<CardFields>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    await saveSettings(next)
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
