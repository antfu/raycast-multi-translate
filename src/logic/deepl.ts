import type { LanguageCode } from '../data/languages'

// Map the extension's language codes to the codes DeepL accepts as a target.
// DeepL is pickier than Google: it only supports a subset, and a few targets
// require a regional variant (EN-US, PT-BR). Anything not listed here is simply
// not translatable by DeepL.
// https://developers.deepl.com/docs/resources/supported-languages
const DEEPL_TARGETS: Partial<Record<LanguageCode, string>> = {
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
  hu: 'HU',
  id: 'ID',
  it: 'IT',
  ja: 'JA',
  ko: 'KO',
  lt: 'LT',
  lv: 'LV',
  nb: 'NB',
  no: 'NB',
  nl: 'NL',
  pl: 'PL',
  pt: 'PT-BR',
  ro: 'RO',
  ru: 'RU',
  sk: 'SK',
  sl: 'SL',
  sv: 'SV',
  tr: 'TR',
  uk: 'UK',
  zh: 'ZH',
}

export interface DeepLResult {
  translated: string
  detectedSource?: LanguageCode
}

/**
 * Whether DeepL can translate into the given language. Used to skip unsupported
 * targets instead of failing the whole multi-translate run.
 */
export function isDeepLTarget(to: LanguageCode): boolean {
  return to in DEEPL_TARGETS
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
): Promise<DeepLResult> {
  const key = apiKey.trim()
  const target = DEEPL_TARGETS[to]
  if (!target)
    return { translated: '' }

  // Free-tier keys end with ":fx" and live on a separate host.
  const host = key.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com'

  const body: Record<string, unknown> = {
    text: [text],
    target_lang: target,
  }
  // DeepL source codes have no regional variant, so strip it (EN-US -> EN).
  // Omitting source_lang lets DeepL auto-detect, which also covers any source
  // the user picked that DeepL does not accept.
  const source = from !== 'auto' ? DEEPL_TARGETS[from]?.split('-')[0] : undefined
  if (source)
    body.source_lang = source

  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`DeepL API error ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  const data = await res.json() as {
    translations?: { text: string, detected_source_language?: string }[]
  }
  const result = data.translations?.[0]

  return {
    translated: result?.text ?? '',
    detectedSource: result?.detected_source_language?.toLowerCase() as LanguageCode | undefined,
  }
}
