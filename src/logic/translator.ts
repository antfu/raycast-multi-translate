import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'

export const AUTO_DETECT = 'auto'

// preferences won't change at runtime.
const preferences = getPreferenceValues<Preferences.Translate>()

// Language codes supported by the DeepL API, mapped from the extension's language codes.
// Unsupported explicit source languages are omitted from the request so DeepL auto-detects them.
const DEEPL_SOURCE_LANGUAGES: Partial<Record<LanguageCode, string>> = {
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
  'nl': 'NL',
  'no': 'NB',
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

const DEEPL_TARGET_LANGUAGES: Partial<Record<LanguageCode, string>> = {
  ...DEEPL_SOURCE_LANGUAGES,
  'en': 'EN-US',
  'pt': 'PT-PT',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

const DEEPL_DETECTED_LANGUAGES: Record<string, LanguageCode> = {
  AR: 'ar',
  BG: 'bg',
  CS: 'cs',
  DA: 'da',
  DE: 'de',
  EL: 'el',
  EN: 'en',
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
  RO: 'ro',
  RU: 'ru',
  SK: 'sk',
  SL: 'sl',
  SV: 'sv',
  TR: 'tr',
  UK: 'uk',
  ZH: 'zh-CN',
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

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const apiKey = preferences.deeplApiKey?.trim()
  if (!apiKey)
    throw new TranslateError('Please set your DeepL API key in the extension preferences', 'DeepL API key is missing')

  const targetLang = DEEPL_TARGET_LANGUAGES[to]
  if (!targetLang) {
    // DeepL does not support this target language, skip it so other languages still translate
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  // DeepL API free keys end with `:fx` and use a separate endpoint
  const url = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  const sourceLang = from === AUTO_DETECT ? undefined : DEEPL_SOURCE_LANGUAGES[from]

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang,
        ...(sourceLang ? { source_lang: sourceLang } : {}),
      }),
    })
  }
  catch (err) {
    throw new TranslateError(err as Error)
  }

  if (!res.ok) {
    switch (res.status) {
      case 403:
        throw new TranslateError('Please check if your DeepL API key is valid', 'DeepL authorization failed')
      case 429:
        throw new TranslateError('please try again later', 'Too many requests')
      case 456:
        throw new TranslateError('Your DeepL API quota has been exceeded', 'Quota exceeded')
      default:
        throw new TranslateError(`Request failed with status ${res.status}`, 'DeepL error')
    }
  }

  const data = await res.json() as { translations?: { detected_source_language: string, text: string }[] }
  const translation = data.translations?.[0]
  if (!translation)
    throw new TranslateError('Empty response from DeepL', 'DeepL error')

  return {
    original: text,
    translated: translation.text,
    from: DEEPL_DETECTED_LANGUAGES[translation.detected_source_language] ?? from,
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

  const provider = preferences.provider ?? 'google'
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  if (provider === 'deepl') {
    const result = await translateWithDeepL(text, from, to)
    cache.set(key, result)
    return result
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
