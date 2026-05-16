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

  const preferences = getPreferenceValues<TranslationPreferences>()
  const provider = preferences.translationProvider ?? 'google'

  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  const result = provider === 'deepl'
    ? await translateWithDeepL(text, from, to, {
      apiKey: preferences.deeplApiKey ?? '',
      plan: preferences.deeplApiPlan ?? 'free',
    })
    : await translateWithGoogle(text, from, to)

  cache.set(key, result)
  return result
}

export async function translateAll(text: string, from: LanguageCode = 'auto', languages: LanguageCode[]) {
  if (!text)
    return []

  const settled = await Promise.allSettled(languages.map(async to => translate(text, from, to)))
  const result: TranslateResult[] = []
  const unsupportedTargets: string[] = []

  for (const item of settled) {
    if (item.status === 'fulfilled') {
      if (item.value.translated)
        result.push(item.value)
      continue
    }

    if (item.reason instanceof TranslateError && item.reason.code === 'unsupported-target-language') {
      unsupportedTargets.push(item.reason.message)
      continue
    }

    throw item.reason
  }

  if (!result.length && unsupportedTargets.length)
    throw new TranslateError(unsupportedTargets[0], 'Unsupported language', 'unsupported-target-language')

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
