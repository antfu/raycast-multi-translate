import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { DeepLUnsupportedLanguageError, supportsDeepL, translateWithDeepL } from './deepl'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

const { deeplApiKey } = getPreferenceValues<Preferences.Translate>()

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

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const key = `${deeplApiKey ? 'deepl' : 'google'}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  // DeepL BYOK: use it when a key is configured and the target is supported;
  // unsupported language pairs fall back to Google Translate transparently.
  if (deeplApiKey && supportsDeepL(to)) {
    try {
      const result = await translateWithDeepL(text, from, to, deeplApiKey)
      cache.set(key, result)
      return result
    }
    catch (err) {
      if (!(err instanceof DeepLUnsupportedLanguageError)) {
        if (err instanceof Error)
          throw new TranslateError(err)
        throw err
      }
    }
  }

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

export async function translateAll(text: string, from: LanguageCode = 'auto', languages: LanguageCode[]) {
  if (!text)
    return []

  const result = (await Promise.all(languages.map(async to => translate(text, from, to)))).filter(i => i.translated)

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
