import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

export const AUTO_DETECT = 'auto'

type TranslationProvider = 'google' | 'deepl'

const DEEPL_SUPPORTED_LANGUAGES = new Set([
  'ar',
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lt',
  'lv',
  'no',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sv',
  'tr',
  'uk',
  'zh-CN',
  'zh-TW',
])

const DEEPL_LANGUAGE_CODES: Partial<Record<LanguageCode, string>> = {
  en: 'EN',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
  no: 'NB',
  pt: 'PT',
}

const DEEPL_TARGET_LANGUAGE_CODES: Partial<Record<LanguageCode, string>> = {
  ...DEEPL_LANGUAGE_CODES,
  pt: 'PT-PT',
}

const DEEPL_DETECTED_LANGUAGE_CODES: Record<string, LanguageCode> = {
  AR: 'ar',
  BG: 'bg',
  CS: 'cs',
  DA: 'da',
  DE: 'de',
  EL: 'el',
  EN: 'en',
  'EN-GB': 'en',
  'EN-US': 'en',
  ES: 'es',
  ET: 'et',
  FI: 'fi',
  FR: 'fr',
  HU: 'hu',
  ID: 'id',
  IT: 'it',
  JA: 'ja',
  KO: 'ko',
  LT: 'lt',
  LV: 'lv',
  NB: 'no',
  NL: 'nl',
  PL: 'pl',
  PT: 'pt',
  'PT-BR': 'pt',
  'PT-PT': 'pt',
  RO: 'ro',
  RU: 'ru',
  SK: 'sk',
  SL: 'sl',
  SV: 'sv',
  TR: 'tr',
  UK: 'uk',
  ZH: 'zh-CN',
  'ZH-HANS': 'zh-CN',
  'ZH-HANT': 'zh-TW',
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

function getProvider() {
  const preferences = getPreferenceValues<Preferences.Translate>()
  return {
    provider: (preferences.translationProvider || 'google') as TranslationProvider,
    deeplApiKey: preferences.deeplApiKey?.trim(),
  }
}

function getDeepLLanguageCode(code: LanguageCode) {
  const normalizedCode = DEEPL_LANGUAGE_CODES[code] || code.toUpperCase()
  if (!DEEPL_SUPPORTED_LANGUAGES.has(code))
    throw new TranslateError(
      `DeepL does not support ${code}. Choose a DeepL-supported language or switch back to Google.`,
      'Unsupported language',
    )
  return normalizedCode
}

function getDeepLTargetLanguageCode(code: LanguageCode) {
  getDeepLLanguageCode(code)
  return DEEPL_TARGET_LANGUAGE_CODES[code] || code.toUpperCase()
}

function getLanguageCodeFromDeepL(code?: string) {
  const normalizedCode = code?.toUpperCase()
  if (!normalizedCode || !DEEPL_DETECTED_LANGUAGE_CODES[normalizedCode])
    throw new TranslateError('DeepL did not return a supported source language')
  return DEEPL_DETECTED_LANGUAGE_CODES[normalizedCode]
}

function getDeepLEndpoint(apiKey: string) {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode, apiKey: string): Promise<TranslateResult> {
  const body = new URLSearchParams()
  body.set('text', text)
  body.set('target_lang', getDeepLTargetLanguageCode(to))
  if (from !== AUTO_DETECT)
    body.set('source_lang', getDeepLLanguageCode(from))

  const response = await fetch(getDeepLEndpoint(apiKey), {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new TranslateError(detail || response.statusText, `DeepL request failed (${response.status})`)
  }

  const data = await response.json() as {
    translations?: Array<{
      detected_source_language?: string
      text?: string
    }>
  }

  const translation = data.translations?.[0]
  if (!translation?.text)
    throw new TranslateError('DeepL returned no translation')

  return {
    original: text,
    translated: translation.text,
    from: from === AUTO_DETECT
      ? getLanguageCodeFromDeepL(translation.detected_source_language)
      : from,
    to,
  }
}

async function translateWithGoogle(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const translated = await googleTranslate(text, {
    from,
    to,
  })

  return {
    original: text,
    translated: translated.text,
    from: translated?.from?.language?.didYouMean
      ? from
      : translated?.from?.language?.iso as LanguageCode,
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

  const { provider, deeplApiKey } = getProvider()
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    if (provider === 'deepl' && !deeplApiKey)
      throw new TranslateError('Add your DeepL API key in extension preferences.', 'Missing API key')

    const result = provider === 'deepl'
      ? await translateWithDeepL(text, from, to, deeplApiKey!)
      : await translateWithGoogle(text, from, to)

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
