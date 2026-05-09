import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

export const AUTO_DETECT = 'auto'

type TranslationProvider = 'google' | 'deepl'
type DeepLApiHost = 'https://api-free.deepl.com' | 'https://api.deepl.com'

interface TranslationPreferences extends Preferences.Translate {
  translationProvider: TranslationProvider
  deeplApiKey?: string
  deeplApiHost: DeepLApiHost
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

function getTranslationPreferences() {
  return getPreferenceValues<TranslationPreferences>()
}

function toDeepLSourceLanguage(language: LanguageCode): string {
  switch (language) {
    case 'zh-CN':
    case 'zh-TW':
      return 'ZH'
    case 'no':
      return 'NB'
    default:
      return language.toUpperCase()
  }
}

function toDeepLTargetLanguage(language: LanguageCode): string {
  switch (language) {
    case 'en':
      return 'EN-US'
    case 'pt':
      return 'PT-BR'
    case 'zh-CN':
    case 'zh-TW':
      return 'ZH'
    case 'no':
      return 'NB'
    default:
      return language.toUpperCase()
  }
}

function fromDeepLLanguage(language: string | undefined, fallback: LanguageCode): LanguageCode {
  if (!language)
    return fallback

  switch (language.toUpperCase()) {
    case 'ZH':
      return 'zh-CN'
    case 'NB':
      return 'no'
    default:
      return language.toLowerCase() as LanguageCode
  }
}

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const preferences = getTranslationPreferences()
  const apiKey = preferences.deeplApiKey?.trim()

  if (!apiKey)
    throw new TranslateError('Set your DeepL API key in extension preferences.', 'DeepL')

  const host = preferences.deeplApiHost || 'https://api-free.deepl.com'
  const body: Record<string, string | string[]> = {
    text: [text],
    target_lang: toDeepLTargetLanguage(to),
  }

  if (from !== AUTO_DETECT)
    body.source_lang = toDeepLSourceLanguage(from)

  const response = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => undefined) as
    | { message?: string, translations?: Array<{ detected_source_language?: string, text?: string }> }
    | undefined

  if (!response.ok)
    throw new TranslateError(payload?.message || `DeepL request failed with status ${response.status}.`, 'DeepL')

  const translation = payload?.translations?.[0]
  if (!translation?.text)
    throw new TranslateError('DeepL returned no translation.', 'DeepL')

  return {
    original: text,
    translated: translation.text,
    from: fromDeepLLanguage(translation.detected_source_language, from),
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

  const preferences = getTranslationPreferences()
  const provider = preferences.translationProvider || 'google'
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    let result: TranslateResult

    if (provider === 'deepl') {
      result = await translateWithDeepL(text, from, to)
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
