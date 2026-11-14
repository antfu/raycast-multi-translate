import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { preferences } from './hooks'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

const DEEPL_TARGET_LANG_MAP: Partial<Record<LanguageCode, string>> = {
  'ar': 'AR',
  'bg': 'BG',
  'cs': 'CS',
  'da': 'DA',
  'de': 'DE',
  'el': 'EL',
  'en': 'EN-US',
  'es': 'ES',
  'et': 'ET',
  'fi': 'FI',
  'fr': 'FR',
  'hu': 'HU',
  'id': 'ID',
  'it': 'IT',
  'ja': 'JA',
  'ko': 'KO',
  'lt': 'LT',
  'lv': 'LV',
  'no': 'NB',
  'nl': 'NL',
  'pl': 'PL',
  'pt': 'PT-PT',
  'ro': 'RO',
  'ru': 'RU',
  'sk': 'SK',
  'sl': 'SL',
  'sv': 'SV',
  'tr': 'TR',
  'uk': 'UK',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

const DEEPL_SOURCE_LANG_MAP: Partial<Record<LanguageCode, string>> = {
  'ar': 'AR',
  'bg': 'BG',
  'cs': 'CS',
  'da': 'DA',
  'de': 'DE',
  'el': 'EL',
  'en': 'EN',
  'es': 'ES',
  'et': 'ET',
  'fi': 'FI',
  'fr': 'FR',
  'hu': 'HU',
  'id': 'ID',
  'it': 'IT',
  'ja': 'JA',
  'ko': 'KO',
  'lt': 'LT',
  'lv': 'LV',
  'no': 'NB',
  'nl': 'NL',
  'pl': 'PL',
  'pt': 'PT',
  'ro': 'RO',
  'ru': 'RU',
  'sk': 'SK',
  'sl': 'SL',
  'sv': 'SV',
  'tr': 'TR',
  'uk': 'UK',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
}

function normalizeDeepLDetectedLang(code?: string): LanguageCode {
  if (!code)
    return 'auto'
  const upper = code.toUpperCase()
  if (upper === 'ZH' || upper === 'ZH-HANS')
    return 'zh-CN'
  if (upper === 'ZH-HANT')
    return 'zh-TW'
  if (upper === 'NB')
    return 'no'
  if (upper.startsWith('EN'))
    return 'en'
  if (upper.startsWith('PT'))
    return 'pt'
  return upper.toLowerCase() as LanguageCode
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

async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
): Promise<TranslateResult | null> {
  const targetLang = DEEPL_TARGET_LANG_MAP[to]
  if (!targetLang)
    return null

  const trimmedKey = apiKey.trim()
  const baseUrl = trimmedKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  const body: Record<string, unknown> = {
    text: [text],
    target_lang: targetLang,
  }

  if (from && from !== 'auto') {
    const sourceLang = DEEPL_SOURCE_LANG_MAP[from]
    if (sourceLang)
      body.source_lang = sourceLang
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${trimmedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (response.status === 429 || response.status === 456)
    throw new TranslateError('DeepL quota or rate limit exceeded', 'Too many requests')

  if (response.status === 403)
    throw new TranslateError('Invalid DeepL API key', 'Authentication failed')

  if (!response.ok)
    throw new TranslateError(`DeepL API error (${response.status})`, 'Translation failed')

  const data = await response.json() as {
    translations?: Array<{
      detected_source_language?: string
      text: string
    }>
  }

  const item = data.translations?.[0]
  if (!item)
    throw new TranslateError('Empty response from DeepL API')

  return {
    original: text,
    translated: item.text,
    from: from !== 'auto' ? from : normalizeDeepLDetectedLang(item.detected_source_language),
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

  const provider = (preferences as any).serviceProvider || 'google'
  const deeplApiKey = ((preferences as any).deeplApiKey || '').trim()
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    if (provider === 'deepl') {
      if (!deeplApiKey)
        throw new TranslateError('Please set your DeepL API key in extension preferences', 'Missing API Key')

      const deeplResult = await translateWithDeepL(text, from, to, deeplApiKey)
      if (deeplResult) {
        cache.set(key, deeplResult)
        return deeplResult
      }
    }

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
    if (err instanceof TranslateError)
      throw err

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
