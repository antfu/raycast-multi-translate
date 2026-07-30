import { useEffect, useState } from 'react'
import { getSelectedText } from '@raycast/api'
import type { LanguageCode } from '../data/languages'
import { preferences } from './preferences'

export { preferences }

export const targetLanguages = (() => {
  const langs = Object.entries(preferences)
    .filter(([key]) => key.startsWith('lang'))
    .sort(([key1], [key2]) => key1.localeCompare(key2))
    .map(([_, value]) => value)
    .filter(i => i && i !== 'none')
  return Array.from(new Set(langs)) as LanguageCode[]
})()

export function useSystemSelection() {
  const [text, setText] = useState('')
  useEffect(() => {
    if (!preferences.getSystemSelection)
      return

    let isCancelled = false
    getSelectedText()
      .then((cbText) => {
        if (!isCancelled)
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
