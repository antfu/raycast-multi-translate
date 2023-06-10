import { useEffect, useMemo, useState } from 'react'
import { getPreferenceValues, getSelectedText } from '@raycast/api'
import type { LanguageCode } from '../data/languages'

export function usePreferences() {
  return useMemo(() => getPreferenceValues<Preferences.Translate>(), [])
}

export function useTargetLanguages() {
  return useMemo(() => {
    const pref = getPreferenceValues<Preferences.Translate>()
    const langs = Object.entries(pref)
      .filter(([key]) => key.startsWith('lang'))
      .sort(([key1], [key2]) => key1.localeCompare(key2))
      .map(([_, value]) => value)
      .filter(i => i && i !== 'none')
    return Array.from(new Set(langs)) as LanguageCode[]
  }, [])
}

export function useSystemSelection() {
  const [text, setText] = useState('')
  const preferences = usePreferences()
  useEffect(() => {
    if (!preferences.getSystemSelection)
      return

    let isCancelled = false
    getSelectedText()
      .then((cbText) => {
        if (isCancelled)
          setText((cbText ?? '').trim())
      })
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [preferences.getSystemSelection])

  return [text, setText] as const
}

export function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
