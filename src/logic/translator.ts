import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'

export const AUTO_DETECT = 'auto'

const DEEPL_TARGET_MAP: Record<string, string> = {
  'en': 'EN-US',
  'pt': 'PT-PT',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

export function normalizeDeeplTarget(code: string): string {
  return DEEPL_TARGET_MAP[code] || code.toUpperCase()
}

export function resolveDeeplHost(apiKey: string, deeplPro?: boolean): string {
  if (apiKey.trim().endsWith(':fx'))
    return 'https://api-free.deepl.com'
  return deeplPro ? 'https://api.deepl.com' : 'https://api-free.deepl.com'
}

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

  const { useDeepl, deeplApiKey, deeplPro } = getPreferenceValues<Preferences.Translate>()
  const trimmedKey = deeplApiKey?.trim()

  const providerPrefix = useDeepl && trimmedKey ? 'deepl' : 'google'
  const key = `${providerPrefix}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  if (useDeepl && trimmedKey) {
    try {
      const host = resolveDeeplHost(trimmedKey, deeplPro)
      const body: Record<string, unknown> = {
        text: [text],
        target_lang: normalizeDeeplTarget(to),
      }
      if (from && from !== AUTO_DETECT)
        body.source_lang = from.split('-')[0].toUpperCase()

      const response = await fetch(`${host}/v2/translate`, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${trimmedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const data = (await response.json()) as {
          translations?: Array<{
            text: string
            detected_source_language?: string
          }>
        }
        const first = data.translations?.[0]
        if (first) {
          const result: TranslateResult = {
            original: text,
            translated: first.text,
            from: (first.detected_source_language?.toLowerCase() || from) as LanguageCode,
            to,
          }
          cache.set(key, result)
          return result
        }
      }
    }
    catch {
      // Fallback to Google Translate if DeepL fails or does not support the language pair
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
