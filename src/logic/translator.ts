import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { translateWithDeepL } from './providers/deepl'
import { TranslateError } from './providers/errors'
import { translateWithGoogle } from './providers/google'

export const AUTO_DETECT = 'auto'

export { TranslateError }

interface TranslationPreferences {
  translationProvider?: 'google' | 'deepl'
  deeplApiKey?: string
  deeplApiPlan?: 'free' | 'pro'
}

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const prefs = getPreferenceValues<TranslationPreferences>()
  const provider = prefs.translationProvider ?? 'google'

  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  const result = provider === 'deepl'
    ? await translateWithDeepL(text, from, to, {
      apiKey: prefs.deeplApiKey ?? '',
      plan: prefs.deeplApiPlan ?? 'free',
    })
    : await translateWithGoogle(text, from, to)

  cache.set(key, result)
  return result
}

export async function translateAll(text: string, from: LanguageCode = 'auto', languages: LanguageCode[]): Promise<TranslateResult[]> {
  if (!text)
    return []

  const result = (await Promise.all(languages.map(async to => translate(text, from, to)))).filter(i => i.translated)

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
