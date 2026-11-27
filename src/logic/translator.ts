import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { deeplTranslate } from './deepl'
import { preferences } from './hooks'

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

  if (preferences.provider === 'deepl') {
    if (!preferences.deepLApiKey)
      throw new TranslateError('a DeepL API key is required in the extension preferences', 'Missing API key')

    try {
      const translated = await deeplTranslate(
        text,
        from,
        to,
        preferences.deepLApiKey,
        preferences.deepLFreeApi !== false,
      )

      const result = {
        original: text,
        translated: translated.translated,
        from: translated.detectedSource || from,
        to,
      }
      cache.set(key, result)
      return result
    }
    catch (err) {
      if (err instanceof Error)
        throw new TranslateError(err)
      throw err
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

  const result = (
    await Promise.all(languages.map(async (to) => {
      try {
        return await translate(text, from, to)
      }
      catch {
        // Skip targets that fail (e.g. languages the provider does not support)
        return undefined
      }
    }))
  ).filter((i): i is TranslateResult => Boolean(i?.translated))

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
