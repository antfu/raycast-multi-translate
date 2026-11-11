import { getPreferenceValues } from '@raycast/api'
import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { Preferences, TranslateResult } from '../types'

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

const DEEPL_TARGET_MAP: Record<string, string> = {
  en: 'EN-US',
  pt: 'PT-BR',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
}

function mapToDeeplTarget(code: string): string {
  if (DEEPL_TARGET_MAP[code])
    return DEEPL_TARGET_MAP[code]
  return code.toUpperCase()
}

async function translateDeepl(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
  isPro?: boolean,
): Promise<TranslateResult> {
  const usePro = isPro ?? !apiKey.endsWith(':fx')
  const endpoint = usePro
    ? 'https://api.deepl.com/v2/translate'
    : 'https://api-free.deepl.com/v2/translate'

  const body = new URLSearchParams()
  body.append('text', text)
  body.append('target_lang', mapToDeeplTarget(to))
  if (from !== 'auto')
    body.append('source_lang', from.toUpperCase())

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey.trim()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new TranslateError(
      `DeepL error: ${response.status} ${response.statusText} ${errorText}`.trim(),
    )
  }

  const data = (await response.json()) as {
    translations?: Array<{
      detected_source_language: string
      text: string
    }>
  }

  const translation = data?.translations?.[0]
  if (!translation)
    throw new TranslateError('Invalid response from DeepL')

  return {
    original: text,
    translated: translation.text,
    from: (translation.detected_source_language?.toLowerCase() as LanguageCode) || from,
    to,
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

  let preferences: Preferences = {}
  try {
    preferences = getPreferenceValues<Preferences>()
  }
  catch {
    // Fallback outside Raycast environment
  }

  if (preferences.deeplApiKey?.trim()) {
    try {
      const result = await translateDeepl(
        text,
        from,
        to,
        preferences.deeplApiKey,
        preferences.deeplPro,
      )
      cache.set(key, result)
      return result
    }
    catch (err) {
      if (err instanceof TranslateError)
        throw err
      // Otherwise fall back to Google Translate
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
