import type { LanguageCode } from '../data/languages'

// Google Translate language codes that DeepL supports, mapped to DeepL codes.
// See https://www.deepl.com/docs-api/translate-text for the supported list.
const TO_DEEPL: Partial<Record<LanguageCode, string>> = {
  'bg': 'BG',
  'cs': 'CS',
  'da': 'DA',
  'de': 'DE',
  'el': 'EL',
  'en': 'EN-GB',
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
  'pt': 'PT-PT',
  'ro': 'RO',
  'ru': 'RU',
  'sk': 'SK',
  'sl': 'SL',
  'sv': 'SV',
  'tr': 'TR',
  'uk': 'UK',
  'zh-CN': 'ZH',
}

const FROM_DEEPL: Record<string, LanguageCode> = {
  'BG': 'bg',
  'CS': 'cs',
  'DA': 'da',
  'DE': 'de',
  'EL': 'el',
  'EN': 'en',
  'EN-GB': 'en',
  'EN-US': 'en',
  'ES': 'es',
  'ET': 'et',
  'FI': 'fi',
  'FR': 'fr',
  'HU': 'hu',
  'ID': 'id',
  'IT': 'it',
  'JA': 'ja',
  'KO': 'ko',
  'LT': 'lt',
  'LV': 'lv',
  'NB': 'no',
  'NL': 'nl',
  'PL': 'pl',
  'PT-BR': 'pt',
  'PT-PT': 'pt',
  'RO': 'ro',
  'RU': 'ru',
  'SK': 'sk',
  'SL': 'sl',
  'SV': 'sv',
  'TR': 'tr',
  'UK': 'uk',
  'ZH': 'zh-CN',
}

export function isDeepLLanguage(code: LanguageCode) {
  return code in TO_DEEPL
}

interface DeepLTranslateResponse {
  translations?: { detected_source_language: string, text: string }[]
  message?: string
}

export async function deeplTranslate(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
  freeApi: boolean,
): Promise<{ translated: string, detectedSource?: LanguageCode }> {
  const target = TO_DEEPL[to]
  if (!target)
    throw new Error(`DeepL does not support language "${to}"`)

  const source = from === 'auto' ? undefined : TO_DEEPL[from]
  if (from !== 'auto' && !source)
    throw new Error(`DeepL does not support language "${from}"`)

  const host = freeApi ? 'api-free.deepl.com' : 'api.deepl.com'
  const body = new URLSearchParams({ text, target_lang: target })
  if (source)
    body.set('source_lang', source)

  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const json = (await res.json()) as DeepLTranslateResponse
  if (!res.ok)
    throw new Error(json.message || `DeepL API error ${res.status}`)

  const first = json.translations?.[0]
  if (!first)
    throw new Error('DeepL returned no translation')

  return {
    translated: first.text,
    detectedSource: first.detected_source_language
      ? FROM_DEEPL[first.detected_source_language.toUpperCase()] || 'auto'
      : undefined,
  }
}
