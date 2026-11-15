import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

// DeepL supported target languages mapped from our (Google-style) codes.
// Anything not listed falls back to Google Translate automatically.
const DEEPL_TARGET: Partial<Record<LanguageCode, string>> = {
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
  no: 'NB',
  nl: 'NL',
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

// DeepL source codes are the non-variant base forms (EN not EN-US, PT not PT-BR)
const DEEPL_SOURCE: Partial<Record<LanguageCode, string>> = Object.fromEntries(
  Object.entries(DEEPL_TARGET).map(([code, target]) => [code, target.split('-')[0]]),
)

// detected_source_language (e.g. 'EN', 'ZH') -> our code.
// First entry wins on base-code collisions (ZH -> zh-CN, not zh-TW).
const DEEPL_FROM: Partial<Record<string, LanguageCode>> = {}
for (const [code, target] of Object.entries(DEEPL_TARGET)) {
  const base = target.split('-')[0]
  if (!(base in DEEPL_FROM))
    DEEPL_FROM[base] = code as LanguageCode
}

export function supportsDeepL(to: LanguageCode): boolean {
  return to in DEEPL_TARGET
}

export class DeepLUnsupportedLanguageError extends Error {
  constructor(lang: string) {
    super(`DeepL does not support language: ${lang}`)
    this.name = 'DeepLUnsupportedLanguageError'
  }
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
): Promise<TranslateResult> {
  const targetLang = DEEPL_TARGET[to]
  if (!targetLang)
    throw new DeepLUnsupportedLanguageError(to)

  // free API keys end with ':fx' and hit the free endpoint
  const base = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'

  const body: Record<string, unknown> = {
    text: [text],
    target_lang: targetLang,
  }
  const sourceLang = from === 'auto' ? undefined : DEEPL_SOURCE[from]
  if (from !== 'auto' && !sourceLang)
    throw new DeepLUnsupportedLanguageError(from)
  if (sourceLang)
    body.source_lang = sourceLang

  const res = await fetch(`${base}/v2/translate`, {
    method: 'POST',
    headers: {
      'authorization': `DeepL-Auth-Key ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let message = `DeepL API error (${res.status})`
    try {
      const data = await res.json() as { message?: string }
      if (data.message)
        message = `DeepL: ${data.message}`
    }
    catch {}
    if (res.status === 403)
      throw new Error('DeepL: invalid API key')
    if (res.status === 456)
      throw new Error('DeepL: quota exceeded, check your usage limits')
    if (res.status === 400 && message.includes('lang'))
      throw new DeepLUnsupportedLanguageError(message)
    throw new Error(message)
  }

  const data = await res.json() as {
    translations: { detected_source_language?: string, text: string }[]
  }
  const translated = data.translations[0]
  const detected = translated.detected_source_language?.split('-')[0]

  return {
    original: text,
    translated: translated.text,
    from: (detected && DEEPL_FROM[detected]) || from,
    to,
  }
}
