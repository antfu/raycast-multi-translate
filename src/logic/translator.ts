import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { preferences } from './hooks'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

const DEEPL_TARGET_LANG_MAP: Record<string, string> = {
  'en': 'EN-US',
  'pt': 'PT-PT',
  'zh-cn': 'ZH',
  'zh-tw': 'ZH-HANT',
  'no': 'NB',
}

const DEEPL_SOURCE_LANG_MAP: Record<string, string> = {
  'zh-cn': 'ZH',
  'zh-tw': 'ZH',
  'no': 'NB',
}

export function resolveDeepLEndpoint(apiKey: string, explicitEndpoint?: string): string {
  if (explicitEndpoint && explicitEndpoint.startsWith('http'))
    return explicitEndpoint
  const trimmed = (apiKey || '').trim()
  return trimmed.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

export function toDeepLTargetLang(code: LanguageCode): string {
  const lower = String(code).toLowerCase()
  return DEEPL_TARGET_LANG_MAP[lower] || lower.split('-')[0].toUpperCase()
}

export function toDeepLSourceLang(code: LanguageCode): string | undefined {
  if (!code || code === AUTO_DETECT)
    return undefined
  const lower = String(code).toLowerCase()
  return DEEPL_SOURCE_LANG_MAP[lower] || lower.split('-')[0].toUpperCase()
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

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
  endpoint?: string,
): Promise<TranslateResult> {
  const url = resolveDeepLEndpoint(apiKey, endpoint)
  const payload: Record<string, any> = {
    text: [text],
    target_lang: toDeepLTargetLang(to),
  }
  const sourceLang = toDeepLSourceLang(from)
  if (sourceLang)
    payload.source_lang = sourceLang

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (response.status === 429 || response.status === 456)
    throw new TranslateError('please try again later', 'Too many requests')
  if (response.status === 403)
    throw new TranslateError('Invalid DeepL API key', 'Authentication failed')
  if (!response.ok)
    throw new TranslateError(`DeepL HTTP ${response.status}`, 'Translation failed')

  const data = (await response.json()) as {
    translations?: Array<{ detected_source_language?: string, text?: string }>
  }
  const first = data?.translations?.[0]
  const detectedIso = (first?.detected_source_language || String(from)).toLowerCase() as LanguageCode
  return {
    original: text,
    translated: first?.text || '',
    from: from === AUTO_DETECT ? detectedIso : from,
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

  const provider = (preferences as any)?.provider || 'google'
  const deeplKey = ((preferences as any)?.deeplApiKey || '').trim()
  const deeplEndpoint = (preferences as any)?.deeplApiEndpoint

  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    if (provider === 'deepl' && deeplKey) {
      const deeplRes = await translateWithDeepL(text, from, to, deeplKey, deeplEndpoint)
      cache.set(key, deeplRes)
      return deeplRes
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
