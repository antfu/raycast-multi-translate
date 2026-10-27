import type { LanguageCode } from '../../data/languages'
import type { TranslateResult } from '../../types'
import { TranslateError, type TranslateProvider } from './types'

// DeepL API v2 — https://developers.deepl.com/docs
//
// Free-plan keys end with `:fx`; that suffix selects the host — the same
// convention the official deepl-node client uses — so no plan preference
// is needed and a mismatched endpoint can never be configured.

const deeplHost = (apiKey: string) =>
  apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'

// DeepL `source_lang` values keyed by our (Google-style) LanguageCode.
// Codes DeepL cannot serve are absent — those pairs fall back to Google.
// `no` maps to NB (Norwegian Bokmål); ZH detects both Chinese scripts.
const SOURCE_LANGS: Partial<Record<LanguageCode, string>> = {
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
  nl: 'NL',
  no: 'NB',
  pl: 'PL',
  pt: 'PT',
  ro: 'RO',
  ru: 'RU',
  sk: 'SK',
  sl: 'SL',
  sv: 'SV',
  th: 'TH',
  tr: 'TR',
  uk: 'UK',
  vi: 'VI',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
}

// DeepL `target_lang` values — EN/PT/ZH require explicit variants.
const TARGET_LANGS: Partial<Record<LanguageCode, string>> = {
  ...SOURCE_LANGS,
  en: 'EN-US',
  pt: 'PT-PT',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

// `detected_source_language` back to our LanguageCode.
// Built by inverting the source map, then resolving collisions/variants:
// ZH reports both scripts (default to zh-CN), regional targets normalize.
const DETECTED_BACK: Record<string, LanguageCode> = {
  ...Object.fromEntries(
    Object.entries(SOURCE_LANGS).map(([code, deepl]) => [deepl, code as LanguageCode]),
  ),
  'ZH': 'zh-CN',
  'ZH-HANS': 'zh-CN',
  'ZH-HANT': 'zh-TW',
  'EN-GB': 'en',
  'EN-US': 'en',
  'PT-BR': 'pt',
  'PT-PT': 'pt',
  'ES-419': 'es',
}

interface DeepLResponse {
  translations?: {
    detected_source_language?: string
    text?: string
  }[]
}

export function deeplProvider(apiKey: string): TranslateProvider {
  return {
    id: 'deepl',
    supports: (from, to) =>
      (from === 'auto' || from in SOURCE_LANGS) && to in TARGET_LANGS,
    async translate(text, from, to): Promise<TranslateResult> {
      const targetLang = TARGET_LANGS[to]
      if (!targetLang)
        throw new TranslateError(`DeepL does not support target language: ${to}`, 'Unsupported language')

      const body: Record<string, unknown> = {
        text: [text],
        target_lang: targetLang,
      }
      // `auto` (or a source DeepL can't take) → omit for autodetection
      if (from !== 'auto' && from in SOURCE_LANGS)
        body.source_lang = SOURCE_LANGS[from]

      let res: Response
      try {
        res = await fetch(`${deeplHost(apiKey)}/v2/translate`, {
          method: 'POST',
          headers: {
            'Authorization': `DeepL-Auth-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        })
      }
      catch (err) {
        throw new TranslateError(err instanceof Error ? err : String(err), 'DeepL request failed')
      }

      if (!res.ok) {
        const detail = await res.json().then((d: any) => d?.message as string | undefined).catch(() => undefined)
        switch (res.status) {
          case 400:
            throw new TranslateError(detail || 'the request is not supported by DeepL', 'DeepL error')
          case 401:
          case 403:
            throw new TranslateError('check your DeepL API key in the extension preferences', 'DeepL authentication failed')
          case 404:
            throw new TranslateError('endpoint not found — is this key for the right DeepL plan?', 'DeepL error')
          case 429:
            throw new TranslateError('please try again later', 'Too many requests')
          case 456:
            throw new TranslateError('character quota exceeded for this key', 'DeepL quota exceeded')
          default:
            throw new TranslateError(
              detail || (res.status >= 500 ? 'DeepL is unavailable, please try again later' : `HTTP ${res.status}`),
              'DeepL error',
            )
        }
      }

      const data = await res.json() as DeepLResponse
      const row = data.translations?.[0]
      if (!row?.text)
        throw new TranslateError('empty response', 'DeepL error')

      const detected = row.detected_source_language?.toUpperCase()
      return {
        original: text,
        translated: row.text,
        from: from === 'auto' ? (detected && DETECTED_BACK[detected]) || 'auto' : from,
        to,
      }
    },
  }
}
