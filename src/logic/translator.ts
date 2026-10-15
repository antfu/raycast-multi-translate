import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { translateWithDeepL } from './deepl'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

export class TranslateError extends Error {
  constructor(message?: string | Error, name?: string) {
    if (message instanceof Error) {
      super(message.message)
      this.name = name || message.name
    }
    else {
      super(message)
      this.name = name || this.name
    }
  }
}

export interface ExtensionPreferences {
  translationProvider?: 'google' | 'deepl'
  deeplApiKey?: string
  deeplEndpoint?: 'free' | 'pro'
  getSystemSelection?: boolean
  [key: string]: any
}

// Safely retrieve preferences from Raycast runtime or fallback gracefully in test/CLI environments
async function getRuntimePreferences(): Promise<ExtensionPreferences> {
  try {
    const api = await import('@raycast/api')
    if (typeof api.getPreferenceValues === 'function') {
      return api.getPreferenceValues<ExtensionPreferences>()
    }
  }
  catch {
    // Non-Raycast runtime (e.g. CLI or unit test)
  }
  return {}
}

export async function translate(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  overridePreferences?: ExtensionPreferences,
): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const prefs = overridePreferences || await getRuntimePreferences()
  const provider = prefs.translationProvider || 'google'
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  if (provider === 'deepl') {
    const result = await translateWithDeepL(text, from, to, {
      apiKey: prefs.deeplApiKey,
      endpoint: prefs.deeplEndpoint,
    })
    cache.set(key, result)
    return result
  }

  // Google Translate default provider
  try {
    const translated = await googleTranslate(text, {
      from,
      to,
    })

    const result = {
      original: text,
      translated: translated.text,
      from: translated?.from?.language?.didYouMean
        ? from
        : translated?.from?.language?.iso as LanguageCode,
      to,
    }
    cache.set(key, result)
    return result
  }
  catch (err) {
    if (err instanceof Error) {
      switch (err.name) {
        case 'TooManyRequestsError':
          throw new TranslateError('please try again later', 'Too many requests')
        default:
          throw new TranslateError(err)
      }
    }

    throw err
  }
}

export async function translateAll(
  text: string,
  from: LanguageCode = 'auto',
  languages: LanguageCode[],
  overridePreferences?: ExtensionPreferences,
) {
  if (!text)
    return []

  const outcomes = await Promise.allSettled(languages.map(async to => translate(text, from, to, overridePreferences)))
  const results: TranslateResult[] = []
  let firstError: any = null

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled' && outcome.value?.translated) {
      results.push(outcome.value)
    }
    else if (outcome.status === 'rejected' && !firstError) {
      firstError = outcome.reason
    }
  }

  // If every target language failed and an error occurred, rethrow so UI can notify user
  if (results.length === 0 && firstError) {
    throw firstError
  }

  const fromLangs = new Set(results?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return results.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return results
}
