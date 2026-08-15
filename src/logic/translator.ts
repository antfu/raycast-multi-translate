import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

export const AUTO_DETECT = 'auto'

interface TranslatePreferences {
  translationProvider?: 'google' | 'deepl'
  deepLApiKey?: string
}

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

/**
 * Google-style codes used across the extension mapped to DeepL language codes.
 * DeepL supports a much smaller set than Google; anything else throws.
 * https://developers.deepl.com/docs/getting-started/languages
 */
const DEEPL_SOURCE_CODES: Record<string, string> = {
  bg: 'BG', cs: 'CS', da: 'DA', de: 'DE', el: 'EL', en: 'EN', es: 'ES',
  et: 'ET', fi: 'FI', fr: 'FR', hu: 'HU', id: 'ID', it: 'IT', ja: 'JA',
  ko: 'KO', lt: 'LT', lv: 'LV', no: 'NB', nl: 'NL', pl: 'PL', pt: 'PT',
  ro: 'RO', ru: 'RU', sk: 'SK', sl: 'SL', sv: 'SV', tr: 'TR', uk: 'UK',
  'zh-CN': 'ZH', 'zh-TW': 'ZH',
}

const DEEPL_TARGET_CODES: Record<string, string> = {
  bg: 'BG', cs: 'CS', da: 'DA', de: 'DE', el: 'EL', en: 'EN-GB', es: 'ES',
  et: 'ET', fi: 'FI', fr: 'FR', hu: 'HU', id: 'ID', it: 'IT', ja: 'JA',
  ko: 'KO', lt: 'LT', lv: 'LV', no: 'NB', nl: 'NL', pl: 'PL', pt: 'PT-PT',
  ro: 'RO', ru: 'RU', sk: 'SK', sl: 'SL', sv: 'SV', tr: 'TR', uk: 'UK',
  'zh-CN': 'ZH-HANS', 'zh-TW': 'ZH-HANT',
}

interface DeepLTranslation {
  detected_source_language: string
  text: string
}

interface DeepLResponse {
  translations?: DeepLTranslation[]
}

interface DeepLErrorResponse {
  message?: string
}

function deeplCodeFromDetected(code: string): LanguageCode {
  const lower = (code || '').replace(/-(GB|US)$/, '').toLowerCase()
  if (lower === 'zh')
    return 'zh-CN'
  if (lower === 'nb')
    return 'no'
  return (lower || 'auto') as LanguageCode
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

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const { deepLApiKey } = getPreferenceValues<TranslatePreferences>()
  if (!deepLApiKey)
    throw new TranslateError('DeepL API key is not configured. Add it in the extension preferences.', 'DeepLKeyMissing')

  const sourceCode = from === AUTO_DETECT ? '' : DEEPL_SOURCE_CODES[from]
  if (from !== AUTO_DETECT && !sourceCode)
    throw new TranslateError(`DeepL does not support the source language "${from}".`, 'DeepLUnsupportedLanguage')

  const targetCode = DEEPL_TARGET_CODES[to]
  if (!targetCode)
    throw new TranslateError(`DeepL does not support the target language "${to}".`, 'DeepLUnsupportedLanguage')

  const isFreeKey = deepLApiKey.endsWith(':fx')
  const endpoint = isFreeKey
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  const body: Record<string, string> = {
    text,
    target_lang: targetCode,
  }
  if (sourceCode)
    body.source_lang = sourceCode

  let resp: Response
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${deepLApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'raycast-multi-translate/1.0',
      },
      body: new URLSearchParams(body).toString(),
    })
  }
  catch (err) {
    throw new TranslateError('Failed to reach DeepL. Check your network connection.', 'DeepLNetworkError')
  }

  if (!resp.ok) {
    let message = `DeepL API error (${resp.status})`
    try {
      const data = await resp.json() as DeepLErrorResponse
      if (data?.message)
        message = String(data.message)
    }
    catch {}
    throw new TranslateError(message, 'DeepLApiError')
  }

  const data = await resp.json() as DeepLResponse
  const translation = data?.translations?.[0]
  if (!translation?.text)
    throw new TranslateError('DeepL returned an empty translation.', 'DeepLEmptyResult')

  return {
    original: text,
    translated: translation.text,
    from: deeplCodeFromDetected(translation.detected_source_language),
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

  const provider = getPreferenceValues<TranslatePreferences>().translationProvider ?? 'google'
  const key = `${provider}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    const result = provider === 'deepl'
      ? await translateWithDeepL(text, from, to)
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
