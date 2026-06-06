import { useCallback, useEffect, useState } from 'react'

/**
 * Wraps the Web Speech API for single-word English pronunciation.
 *
 * @returns
 *   - `speak(word)` — reads the word aloud in en-US.
 *                     Calling while already speaking **cancels** the current utterance.
 *   - `stop()`      — cancels any current speech immediately.
 *   - `isSpeaking`  — true while the utterance is playing (visual indicator).
 *   - `isSupported` — false in browsers / environments without `window.speechSynthesis`.
 *
 * Speech is automatically cancelled when the component that uses this hook unmounts.
 */
export function useSpeech() {
  const [isSupported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  )
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Cancel on unmount so speech doesn't continue after the component is gone.
  useEffect(() => {
    if (!isSupported) return
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [isSupported])

  const stop = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [isSupported])

  const speak = useCallback(
    (word: string) => {
      if (!isSupported || !word.trim()) return

      // Second tap while speaking → cancel (toggle behaviour).
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
        setIsSpeaking(false)
        return
      }

      const utterance = new SpeechSynthesisUtterance(word)
      utterance.lang = 'en-US'
      utterance.rate = 0.85   // slightly slower for clarity
      utterance.pitch = 1.0

      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      // Update state before speak() so the button turns active immediately.
      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [isSupported],
  )

  return { speak, stop, isSpeaking, isSupported } as const
}
