import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

/**
 * Languages supported by the DeepL v2 API (BYOK), mapped from the
 * app's lowercase ISO-639-1 codes to DeepL's uppercase codes.
 * Languages not listed here fall back to Google Translate.
 */
const DEEPL_LANGUAGES: Partial<Record<LanguageCode, string>> = {
  ar: 'AR',
  bg: 'BG',
  cs: 'CS',
  da: 'DA',
  de: 'DE',
  el: 'EL',
  en: 'EN',
  es: 'ES',
  et: 'ET',
  fi: 'FI',
  fr: 'FR',
  hu: 'HU',
  id: 'ID',
  it: 'IT',
  ja: 'JA',
  ko: 'KO',
  lt: 'LT',
  lv: 'LV',
  no: 'NB',
  nl: 'NL',
  pl: 'PL',
  pt: 'PT',
  ro: 'RO',
  ru: 'RU',
  sk: 'SK',
  sl: 'SL',
  sv: 'SV',
  tr: 'TR',
  uk: 'UK',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
}

const DEEPL_BY_CODE = new Map(Object.entries(DEEPL_LANGUAGES).map(([code, deepL]) => [deepL, code]))

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

interface DeepLResponse {
  translations: Array<{
    detected_source_language: string
    text: string
  }>
}

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode, apiKey: string) {
  const base = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com'

  const body: Record<string, string> = {
    text,
    target_lang: DEEPL_LANGUAGES[to]!,
  }
  if (from !== 'auto' && DEEPL_LANGUAGES[from])
    body.source_lang = DEEPL_LANGUAGES[from]!

  const res = await fetch(`${base}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    if (res.status === 429 || res.status === 456)
      throw new TranslateError('please try again later', 'Too many requests')
    if (res.status === 403)
      throw new TranslateError('Invalid DeepL API key', 'Invalid API key')
    throw new TranslateError(`DeepL API error (${res.status})`, 'DeepL')
  }

  const data = await res.json() as DeepLResponse
  const translation = data.translations?.[0]
  if (!translation)
    throw new TranslateError('Empty response from DeepL', 'DeepL')

  let detected: LanguageCode = from
  if (from === 'auto' && translation.detected_source_language) {
    const code = translation.detected_source_language.toLowerCase()
    detected = (DEEPL_BY_CODE.get(code) ?? code) as LanguageCode
  }

  return { text: translation.text, from: detected }
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

  const preferences = getPreferenceValues<{ deeplApiKey?: string }>()
  const deeplKey = preferences.deeplApiKey?.trim()
  const useDeepL = Boolean(deeplKey) && Boolean(DEEPL_LANGUAGES[to]) && (from === 'auto' || Boolean(DEEPL_LANGUAGES[from]))

  const key = `${useDeepL ? 'deepl' : 'google'}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    let translated: string
    let detected: LanguageCode = from
    if (useDeepL) {
      const result = await translateWithDeepL(text, from, to, deeplKey!)
      translated = result.text
      detected = result.from
    }
    else {
      const google = await googleTranslate(text, {
        from,
        to,
      })
      translated = google.text
      detected = google?.from?.language?.didYouMean
        ? from
        : google?.from?.language?.iso as LanguageCode
    }

    const result = {
      original: text,
      translated,
      from: detected,
      to,
    }
    cache.set(key, result)
    return result
  }
  catch (err) {
    if (err instanceof Error) {
      switch (err.name) {
        case 'TooManyRequestsError':
        case 'Too many requests':
          throw new TranslateError('please try again later', 'Too many requests')
        case 'Invalid API key':
          throw new TranslateError(err.message, 'Invalid API key')
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
