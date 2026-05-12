import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { preferences } from './hooks'

export const AUTO_DETECT = 'auto'

type TranslationEngine = 'google' | 'deepl'
type DeepLApiEndpoint = 'free' | 'pro'

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

export class UnsupportedLanguageError extends TranslateError {
  constructor(message: string) {
    super(message, 'Unsupported language')
  }
}

interface DeepLTranslation {
  detected_source_language: string
  text: string
}

interface DeepLResponse {
  translations?: DeepLTranslation[]
  message?: string
}

function getTranslationEngine(): TranslationEngine {
  return preferences.translationEngine === 'deepl' ? 'deepl' : 'google'
}

function getDeepLEndpoint(): string {
  const endpoint = preferences.deeplApiEndpoint as DeepLApiEndpoint
  return endpoint === 'pro'
    ? 'https://api.deepl.com/v2/translate'
    : 'https://api-free.deepl.com/v2/translate'
}

function toDeepLSourceLanguage(code: LanguageCode): string | undefined {
  if (code === 'auto')
    return undefined

  if (code === 'zh-CN' || code === 'zh-TW')
    return 'ZH'

  return code.toUpperCase()
}

function toDeepLTargetLanguage(code: LanguageCode): string {
  switch (code) {
    case 'auto':
      throw new UnsupportedLanguageError('DeepL requires a target language.')
    case 'en':
      return 'EN-US'
    case 'pt':
      return 'PT-BR'
    case 'zh-CN':
    case 'zh-TW':
      return 'ZH'
    default:
      return code.toUpperCase()
  }
}

function fromDeepLDetectedLanguage(code: string, fallback: LanguageCode): LanguageCode {
  if (!code)
    return fallback

  const normalized = code.toLowerCase()
  if (normalized === 'zh')
    return 'zh-CN'

  return normalized as LanguageCode
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

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const authKey = preferences.deeplApiKey?.trim()
  if (!authKey)
    throw new TranslateError('please set your API key', 'DeepL')

  const body: Record<string, string | string[]> = {
    text: [text],
    target_lang: toDeepLTargetLanguage(to),
  }

  const sourceLang = toDeepLSourceLanguage(from)
  if (sourceLang)
    body.source_lang = sourceLang

  const response = await fetch(getDeepLEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${authKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({})) as DeepLResponse
  if (!response.ok) {
    if (response.status === 400)
      throw new UnsupportedLanguageError(payload.message || 'DeepL does not support this language pair.')
    throw new TranslateError(payload.message || `request failed with HTTP ${response.status}`, 'DeepL')
  }

  const translated = payload.translations?.[0]
  if (!translated)
    throw new TranslateError('empty translation response', 'DeepL')

  return {
    original: text,
    translated: translated.text,
    from: fromDeepLDetectedLanguage(translated.detected_source_language, from),
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

  const engine = getTranslationEngine()
  const key = `${engine}:${preferences.deeplApiEndpoint}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    const result = engine === 'deepl'
      ? await translateWithDeepL(text, from, to)
      : await translateWithGoogle(text, from, to)
    cache.set(key, result)
    return result
  }
  catch (err) {
    if (err instanceof UnsupportedLanguageError)
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

  const settled = await Promise.all(languages.map(async to => translate(text, from, to).catch(error => ({ error }))))
  const errors: unknown[] = []
  const result = settled
    .flatMap((item) => {
      if ('error' in item) {
        errors.push(item.error)
        return []
      }
      return item.translated ? [item] : []
    })

  const blockingError = errors.find(error => !(error instanceof UnsupportedLanguageError))
  if (blockingError)
    throw blockingError

  if (!result.length && errors.length)
    throw errors[0]

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
