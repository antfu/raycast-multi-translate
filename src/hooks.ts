import React from 'react'
import { getPreferenceValues, getSelectedText } from '@raycast/api'
import { useCachedState } from '@raycast/utils'
import type { LanguageCodeSet, TranslatePreferences } from './types'

export function usePreferences() {
  return React.useMemo(() => getPreferenceValues<TranslatePreferences>(), [])
}

export function useTextState() {
  const [text, setText] = React.useState('')
  const textRef = React.useRef(text)
  textRef.current = text

  React.useEffect(() => {
    getSelectedText()
      .then((cbText) => {
        if (!textRef.current)
          setText(cbText ?? '')
      })
      .catch((err) => {
        console.error('Error:', err)
      })
  }, [])

  return [text, setText] as const
}

export function useSelectedLanguagesSet() {
  const preferences = usePreferences()
  const [selectedLanguageSet, setSelectedLanguageSet] = useCachedState<LanguageCodeSet>('selectedLanguageSet', {
    langFrom: preferences.lang1,
    langTo: preferences.lang2,
  })

  return [selectedLanguageSet, setSelectedLanguageSet] as const
}

export function usePreferencesLanguageSet() {
  const preferences = usePreferences()
  const preferencesLanguageSet: LanguageCodeSet = { langFrom: preferences.lang1, langTo: preferences.lang2 }
  return preferencesLanguageSet
}

export function isSameLanguageSet(langSet1: LanguageCodeSet, langSet2: LanguageCodeSet) {
  return langSet1.langFrom === langSet2.langFrom && langSet1.langTo === langSet2.langTo
}

export function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value)

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
