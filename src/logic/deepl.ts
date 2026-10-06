import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { TranslateError } from './errors'

export const DEEPL_ENDPOINTS = {
  free: 'https://api-free.deepl.com',
  pro: 'https://api.deepl.com',
} as const

export type DeeplEndpoint = keyof typeof DEEPL_ENDPOINTS

const GOOGLE_TO_DEEPL_TARGET: Partial<Record<LanguageCode, string>> = {
  ar: 'AR',
  bg: 'BG',
  cs: 'CS',
  da: 'DA',
  de: 'DE',
  el: 'EL',
  en: 'EN-US',
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
  ms: 'MS',
  nl: 'NL',
  no: 'NB',
  pl: 'PL',
  pt: 'PT-PT',
  ro: 'RO',
  ru: 'RU',
  sk: 'SK',
  sl: 'SL',
  sv: 'SV',
  th: 'TH',
  tr: 'TR',
  uk: 'UK',
  vi: 'VI',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

const DEEPL_TO_GOOGLE: Record<string, LanguageCode> = {
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
  HE: 'he',
  HU: 'hu',
  ID: 'id',
  IT: 'it',
  JA: 'ja',
  KO: 'ko',
  LT: 'lt',
  LV: 'lv',
  MS: 'ms',
  NB: 'no',
  NL: 'nl',
  PL: 'pl',
  PT: 'pt',
  RO: 'ro',
  RU: 'ru',
  SK: 'sk',
  SL: 'sl',
  SV: 'sv',
  TH: 'th',
  TR: 'tr',
  UK: 'uk',
  VI: 'vi',
  ZH: 'zh-CN',
  'ZH-HANS': 'zh-CN',
  'ZH-HANT': 'zh-TW',
}

export function deeplTargetLanguage(code: LanguageCode): string | undefined {
  return GOOGLE_TO_DEEPL_TARGET[code]
}

export function deeplSourceLanguage(code: LanguageCode): string | undefined {
  const mapped = GOOGLE_TO_DEEPL_TARGET[code]
  return mapped?.split('-')[0]
}

interface DeeplTranslateResponse {
  translations: Array<{
    detected_source_language?: string
    text: string
  }>
}

export async function deeplTranslate(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
  endpoint: DeeplEndpoint,
): Promise<TranslateResult> {
  const target = deeplTargetLanguage(to)
  if (!target)
    throw new TranslateError(`DeepL does not support target language "${to}"`, 'UnsupportedLanguage')

  const params = new URLSearchParams()
  params.append('text', text)
  params.append('target_lang', target)

  if (from !== 'auto') {
    const source = deeplSourceLanguage(from)
    if (source)
      params.append('source_lang', source)
  }

  let response: Response
  try {
    response = await fetch(`${DEEPL_ENDPOINTS[endpoint]}/v2/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
  }
  catch (err) {
    throw new TranslateError(err instanceof Error ? err : String(err))
  }

  if (!response.ok) {
    switch (response.status) {
      case 403:
        throw new TranslateError('check the DeepL API key in extension preferences', 'DeepL authorization failed')
      case 456:
        throw new TranslateError('DeepL character quota exceeded', 'Quota exceeded')
      case 429:
        throw new TranslateError('please try again later', 'Too many requests')
      default:
        throw new TranslateError(`DeepL request failed with HTTP ${response.status}`)
    }
  }

  const data = await response.json() as DeeplTranslateResponse
  const translated = data.translations?.[0]
  if (!translated?.text)
    throw new TranslateError('DeepL returned an empty translation')

  const detected = translated.detected_source_language
  return {
    original: text,
    translated: translated.text,
    from: (detected && DEEPL_TO_GOOGLE[detected]) || from,
    to,
  }
}
