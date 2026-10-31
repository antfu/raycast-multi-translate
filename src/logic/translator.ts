import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

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

export function formatDeepLLanguage(lang: string, isTarget = true): string | undefined {
  if (!lang || lang === 'auto')
    return undefined

  if (isTarget) {
    const targetMap: Record<string, string> = {
      en: 'EN-US',
      pt: 'PT-PT',
      'zh-CN': 'ZH',
      'zh-TW': 'ZH',
    }
    return targetMap[lang] || lang.toUpperCase()
  }

  return lang.toUpperCase().split('-')[0]
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
  fetchFn = fetch,
): Promise<TranslateResult> {
  const isFree = apiKey.endsWith(':fx')
  const endpoint = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  const targetLang = formatDeepLLanguage(to, true)
  if (!targetLang)
    throw new Error(`Unsupported DeepL target language: ${to}`)

  const sourceLang = formatDeepLLanguage(from, false)

  const body: Record<string, any> = {
    text: [text],
    target_lang: targetLang,
  }
  if (sourceLang)
    body.source_lang = sourceLang

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`DeepL API error (${res.status}): ${errText}`)
  }

  const data = await res.json() as any
  const translation = data.translations?.[0]
  if (!translation)
    throw new Error('DeepL returned empty translation')

  return {
    original: text,
    translated: translation.text,
    from: (translation.detected_source_language?.toLowerCase() as LanguageCode) || from,
    to,
  }
}

async function getDeeplApiKey(): Promise<string | undefined> {
  try {
    const raycast = await import('@raycast/api')
    return (raycast.getPreferenceValues() as any)?.deeplApiKey
  }
  catch {
    return process.env.DEEPL_API_KEY
  }
}

export async function translate(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey?: string,
): Promise<TranslateResult> {
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

  const deeplKey = apiKey || (await getDeeplApiKey())
  if (deeplKey) {
    try {
      const result = await translateWithDeepL(text, from, to, deeplKey)
      cache.set(key, result)
      return result
    }
    catch (e) {
      console.warn('DeepL translation failed, falling back to Google Translate:', e)
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

export async function translateAll(
  text: string,
  from: LanguageCode = 'auto',
  languages: LanguageCode[],
  apiKey?: string,
) {
  if (!text)
    return []

  const result = (await Promise.all(languages.map(async to => translate(text, from, to, apiKey)))).filter(i => i.translated)

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
