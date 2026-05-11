import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import { languagesByCode } from '../data/languages'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

export const AUTO_DETECT = 'auto'

type TranslationProvider = 'google' | 'deepl'

interface TranslatePreferences {
  translationProvider?: TranslationProvider
  deeplApiKey?: string
  deeplApiPlan?: 'free' | 'pro'
}

interface DeepLTranslation {
  detected_source_language?: string
  text?: string
}

interface DeepLResponse {
  message?: string
  translations?: DeepLTranslation[]
}

const DEEPL_FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate'
const DEEPL_PRO_ENDPOINT = 'https://api.deepl.com/v2/translate'

const deeplLanguageOverrides: Partial<Record<LanguageCode, string>> = {
  'no': 'NB',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
  'ku': 'KMR',
}

const deeplSourceLanguageOverrides: Partial<Record<LanguageCode, string>> = {
  'no': 'NB',
  'pt': 'PT',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
  'ku': 'KMR',
}

const languageCodeOverrides: Record<string, LanguageCode> = {
  NB: 'no',
  PT: 'pt',
  'PT-BR': 'pt',
  'PT-PT': 'pt',
  ZH: 'zh-CN',
  'ZH-HANS': 'zh-CN',
  'ZH-HANT': 'zh-TW',
  KMR: 'ku',
  CKB: 'ku',
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

function getTranslatePreferences() {
  return getPreferenceValues<TranslatePreferences>()
}

function toDeepLLanguage(code: LanguageCode, type: 'source' | 'target') {
  if (code === AUTO_DETECT)
    return undefined

  return (type === 'source' ? deeplSourceLanguageOverrides[code] : deeplLanguageOverrides[code])
    ?? code.toUpperCase()
}

function fromDeepLLanguage(code: string | undefined, fallback: LanguageCode) {
  if (!code)
    return fallback

  const normalized = code.toUpperCase()
  const mapped = languageCodeOverrides[normalized]
  if (mapped)
    return mapped

  const lower = normalized.toLowerCase() as LanguageCode
  return languagesByCode[lower] ? lower : fallback
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

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode, preferences: TranslatePreferences): Promise<TranslateResult> {
  const apiKey = preferences.deeplApiKey?.trim()
  if (!apiKey)
    throw new TranslateError('configure a DeepL API key in extension preferences', 'DeepL API key missing')

  const targetLang = toDeepLLanguage(to, 'target')
  if (!targetLang)
    throw new TranslateError('DeepL requires a target language', 'DeepL target missing')

  const body = new URLSearchParams({
    text,
    target_lang: targetLang,
  })

  const sourceLang = toDeepLLanguage(from, 'source')
  if (sourceLang)
    body.set('source_lang', sourceLang)

  const response = await fetch(preferences.deeplApiPlan === 'pro' ? DEEPL_PRO_ENDPOINT : DEEPL_FREE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json() as DeepLResponse
  if (!response.ok) {
    throw new TranslateError(
      payload.message || `DeepL request failed with status ${response.status}`,
      'DeepL request failed',
    )
  }

  const translated = payload.translations?.[0]
  if (!translated?.text)
    throw new TranslateError('DeepL returned no translation', 'DeepL request failed')

  return {
    original: text,
    translated: translated.text,
    from: fromDeepLLanguage(translated.detected_source_language, from),
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

  const preferences = getTranslatePreferences()
  const provider = preferences.translationProvider || 'google'

  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    const result = provider === 'deepl'
      ? await translateWithDeepL(text, from, to, preferences)
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
