import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

// DeepL requires specific codes for some target languages
// https://developers.deepl.com/docs/resources/supported-languages
const DEEPL_TARGET_LANGS: Record<string, string> = {
  en: 'EN-US',
  pt: 'PT-PT',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

const DEEPL_DETECTED_LANGS: Record<string, LanguageCode> = {
  'zh': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hant': 'zh-TW',
  'en-us': 'en',
  'en-gb': 'en',
  'pt-pt': 'pt',
  'pt-br': 'pt',
} as Record<string, LanguageCode>

function toDeepLLang(code: LanguageCode, source: boolean): string | undefined {
  if (code === AUTO_DETECT)
    return undefined
  if (source)
    return String(code).split('-')[0].toUpperCase()
  return DEEPL_TARGET_LANGS[code] || String(code).toUpperCase()
}

function fromDeepLLang(code: string | undefined, fallback: LanguageCode): LanguageCode {
  if (!code)
    return fallback
  const lower = code.toLowerCase()
  return DEEPL_DETECTED_LANGS[lower] || (lower as LanguageCode)
}

interface DeepLTranslateResponse {
  translations?: { detected_source_language?: string, text?: string }[]
}

async function deeplTranslate(text: string, from: LanguageCode, to: LanguageCode, apiKey: string): Promise<TranslateResult> {
  const host = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const body: Record<string, unknown> = {
    text: [text],
    target_lang: toDeepLLang(to, false),
  }
  const source = toDeepLLang(from, true)
  if (source)
    body.source_lang = source

  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 403)
    throw new TranslateError('invalid DeepL API key', 'DeepLAuthError')
  if (res.status === 456)
    throw new TranslateError('please try again later', 'Too many requests')
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new TranslateError(`DeepL API error ${res.status}: ${detail}`.trim(), 'DeepLError')
  }

  const data = await res.json() as DeepLTranslateResponse
  const hit = data.translations?.[0]
  return {
    original: text,
    translated: hit?.text || '',
    from: fromDeepLLang(hit?.detected_source_language, from),
    to,
  }
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

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const preferences = getPreferenceValues<Preferences.Translate>()
  const provider = preferences.provider || 'google'

  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    let result: TranslateResult
    if (provider === 'deepl') {
      if (!preferences.deeplApiKey)
        throw new TranslateError('set your DeepL API key in extension preferences', 'DeepLApiKeyMissing')
      result = await deeplTranslate(text, from, to, preferences.deeplApiKey)
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
