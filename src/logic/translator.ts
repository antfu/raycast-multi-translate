import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { preferences } from './hooks'

export const AUTO_DETECT = 'auto'

const DEEPL_SOURCE_LANGUAGES: Partial<Record<LanguageCode, string>> = {
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
  he: 'HE',
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

const DEEPL_TARGET_LANGUAGES: Partial<Record<LanguageCode, string>> = {
  ...DEEPL_SOURCE_LANGUAGES,
  en: 'EN-US',
  pt: 'PT-PT',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
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
  if (!preferences.deeplApiKey)
    throw new TranslateError('set your DeepL API key in extension preferences', 'Missing DeepL API key')

  const targetLang = DEEPL_TARGET_LANGUAGES[to]
  if (!targetLang)
    throw new TranslateError(`DeepL does not support ${to} as a target language`, 'Unsupported DeepL language')

  const params = new URLSearchParams({
    text,
    target_lang: targetLang,
  })

  const sourceLang = from === AUTO_DETECT ? undefined : DEEPL_SOURCE_LANGUAGES[from]
  if (from !== AUTO_DETECT && !sourceLang)
    throw new TranslateError(`DeepL does not support ${from} as a source language`, 'Unsupported DeepL language')
  if (sourceLang)
    params.set('source_lang', sourceLang)

  const host = preferences.deeplApiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
  const response = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${preferences.deeplApiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    const message = response.status === 403
      ? 'check your DeepL API key'
      : `DeepL request failed with ${response.status}`
    throw new TranslateError(message, 'DeepL request failed')
  }

  const data = await response.json() as {
    translations?: Array<{
      detected_source_language?: string
      text?: string
    }>
  }

  const translation = data.translations?.[0]
  if (!translation?.text)
    throw new TranslateError('DeepL returned no translation', 'DeepL request failed')

  return {
    original: text,
    translated: translation.text,
    from: from === AUTO_DETECT
      ? translation.detected_source_language?.toLowerCase() as LanguageCode || from
      : from,
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

  const provider = preferences.translationProvider || 'google'
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
