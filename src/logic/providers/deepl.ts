import type { LanguageCode } from '../../data/languages'
import type { TranslateResult } from '../../types'
import { TranslateError, UnsupportedTargetLanguageError } from './errors'

const FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate'
const PRO_ENDPOINT = 'https://api.deepl.com/v2/translate'

const DEEPL_SOURCE_LANGS = new Set<string>([
  'AR',
  'BG',
  'CS',
  'DA',
  'DE',
  'EL',
  'EN',
  'ES',
  'ET',
  'FI',
  'FR',
  'HU',
  'ID',
  'IT',
  'JA',
  'KO',
  'LT',
  'LV',
  'NB',
  'NL',
  'PL',
  'PT',
  'RO',
  'RU',
  'SK',
  'SL',
  'SV',
  'TR',
  'UK',
  'ZH',
])

const DEEPL_TARGET_LANGS = new Set<string>([
  'AR',
  'BG',
  'CS',
  'DA',
  'DE',
  'EL',
  'EN-GB',
  'EN-US',
  'ES',
  'ET',
  'FI',
  'FR',
  'HU',
  'ID',
  'IT',
  'JA',
  'KO',
  'LT',
  'LV',
  'NB',
  'NL',
  'PL',
  'PT-BR',
  'PT-PT',
  'RO',
  'RU',
  'SK',
  'SL',
  'SV',
  'TR',
  'UK',
  'ZH-HANS',
  'ZH-HANT',
])

interface DeepLTranslation {
  detected_source_language: string
  text: string
}

interface DeepLResponse {
  translations: DeepLTranslation[]
}

export interface DeepLConfig {
  apiKey: string
  plan: 'free' | 'pro'
}

export function toDeepLSourceLang(code: LanguageCode): string | undefined {
  if (code === 'auto')
    return undefined

  const normalized = code.toUpperCase().split('-')[0]
  return DEEPL_SOURCE_LANGS.has(normalized) ? normalized : undefined
}

export function toDeepLTargetLang(code: LanguageCode): string | undefined {
  if (code === 'auto')
    return undefined

  const upper = code.toUpperCase()
  switch (upper) {
    case 'EN':
      return 'EN-US'
    case 'PT':
      return 'PT-PT'
    case 'ZH':
    case 'ZH-CN':
      return 'ZH-HANS'
    case 'ZH-TW':
      return 'ZH-HANT'
    default:
      return DEEPL_TARGET_LANGS.has(upper) ? upper : undefined
  }
}

function fromDeepLSourceLang(code: string): LanguageCode {
  switch (code.toUpperCase()) {
    case 'ZH-HANT':
      return 'zh-TW'
    case 'ZH-HANS':
    case 'ZH':
      return 'zh-CN'
    default:
      return code.toLowerCase().split('-')[0] as LanguageCode
  }
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  config: DeepLConfig,
): Promise<TranslateResult> {
  if (!config.apiKey) {
    throw new TranslateError(
      'DeepL API key is not configured. Set it in the extension preferences.',
      'Missing API Key',
      'missing-api-key',
    )
  }

  const targetLang = toDeepLTargetLang(to)
  if (!targetLang)
    throw new UnsupportedTargetLanguageError(to)

  const params = new URLSearchParams()
  params.append('text', text)
  params.append('target_lang', targetLang)

  const sourceLang = toDeepLSourceLang(from)
  if (sourceLang)
    params.append('source_lang', sourceLang)

  const endpoint = config.plan === 'pro' ? PRO_ENDPOINT : FREE_ENDPOINT

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
  }
  catch (err) {
    throw new TranslateError(err instanceof Error ? err : String(err), 'DeepL request failed')
  }

  if (!response.ok) {
    switch (response.status) {
      case 403:
        throw new TranslateError('invalid API key or wrong plan endpoint', 'DeepL authentication failed')
      case 429:
        throw new TranslateError('please try again later', 'Too many requests')
      case 456:
        throw new TranslateError('character quota exceeded', 'DeepL quota exceeded')
      default:
        throw new TranslateError(`HTTP ${response.status} ${response.statusText}`, 'DeepL error')
    }
  }

  let data: DeepLResponse
  try {
    data = await response.json() as DeepLResponse
  }
  catch (err) {
    throw new TranslateError(err instanceof Error ? err : 'invalid response', 'DeepL parse error')
  }

  const translation = data.translations[0]
  if (!translation)
    throw new TranslateError('empty response', 'DeepL error')

  return {
    original: text,
    translated: translation.text,
    from: from === 'auto'
      ? fromDeepLSourceLang(translation.detected_source_language)
      : from,
    to,
  }
}
