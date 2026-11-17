import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { translateWithDeepL } from './deepl'

export const AUTO_DETECT = 'auto'

export type TranslationProvider = 'google' | 'deepl'

export interface TranslateOptions {
  provider?: TranslationProvider
  deeplApiKey?: string
  fetchImpl?: typeof fetch
}

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

export function clearTranslateCache() {
  cache.clear()
}

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

export async function translate(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  options?: TranslateOptions,
): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const provider: TranslationProvider = options?.provider ?? 'google'
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    let result: TranslateResult
    if (provider === 'deepl') {
      const translated = await translateWithDeepL(
        text,
        from,
        to,
        options?.deeplApiKey,
        options?.fetchImpl,
      )
      result = {
        original: text,
        translated: translated.text,
        from: translated.from,
        to,
      }
    }
    else {
      const translated = await googleTranslate(text, {
        from,
        to,
      })

      result = {
        original: text,
        translated: translated.text,
        from: translated?.from?.language?.didYouMean
          ? from
          : translated?.from?.language?.iso as LanguageCode,
        to,
      }
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
  options?: TranslateOptions,
) {
  if (!text)
    return []

  const result = (await Promise.all(languages.map(async to => translate(text, from, to, options)))).filter(i => i.translated)

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
