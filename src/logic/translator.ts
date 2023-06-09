import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'

export const AUTO_DETECT = 'auto'

export interface TranslateResult {
  original: string
  translated: string
  from: LanguageCode
  to: LanguageCode
}

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

export class TranslateError extends Error {}

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const key = `${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

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
      if (err.name === 'TooManyRequestsError') {
        const error = new TranslateError()
        error.name = 'Too many requests'
        error.message = 'please try again later'
        throw error
      }

      const error = new TranslateError()
      error.name = err.name
      error.message = err.message
      throw error
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
