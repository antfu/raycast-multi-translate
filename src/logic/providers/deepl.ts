import type { LanguageCode } from '../../data/languages'
import type { TranslateResult } from '../../types'
import { TranslateError } from './errors'

const FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate'
const PRO_ENDPOINT = 'https://api.deepl.com/v2/translate'

// Languages DeepL accepts as a target. Stored without region for the primary
// match; see toDeepLTargetLang for region-default variants (EN-US, PT-PT, ZH-HANS).
const DEEPL_TARGETS = new Set<string>([
  'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR',
  'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'PT-BR',
  'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH', 'ZH-HANS', 'ZH-HANT',
  'AR',
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

function toDeepLSourceLang(code: LanguageCode): string | undefined {
  if (code === 'auto')
    return undefined
  // DeepL source codes are uppercase ISO 639-1 without region.
  return code.toUpperCase().split('-')[0]
}

function toDeepLTargetLang(code: LanguageCode): string | undefined {
  if (code === 'auto')
    return undefined
  const upper = code.toUpperCase()
  // DeepL requires a region for English and Portuguese targets; pick sensible defaults.
  // Chinese targets are mapped to Simplified Han by default.
  const normalized = (() => {
    switch (upper) {
      case 'EN': return 'EN-US'
      case 'PT': return 'PT-PT'
      case 'ZH':
      case 'ZH-CN': return 'ZH-HANS'
      case 'ZH-TW': return 'ZH-HANT'
      default: return upper
    }
  })()
  return DEEPL_TARGETS.has(normalized) ? normalized : undefined
}

function fromDeepLLang(code: string): LanguageCode {
  // DeepL returns uppercase region-less ISO 639-1; downstream uses lowercase.
  return code.toLowerCase().split('-')[0] as LanguageCode
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  config: DeepLConfig,
): Promise<TranslateResult> {
  if (!config.apiKey) {
    throw new TranslateError(
      'DeepL API key is not configured. Set it in extension preferences.',
      'Missing API Key',
    )
  }

  const targetLang = toDeepLTargetLang(to)
  if (!targetLang) {
    throw new TranslateError(
      `DeepL does not support target language: ${to}`,
      'Unsupported language',
    )
  }

  const sourceLang = toDeepLSourceLang(from)

  const params = new URLSearchParams()
  params.append('text', text)
  params.append('target_lang', targetLang)
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
    const status = response.status
    if (status === 403)
      throw new TranslateError('invalid API key or wrong plan endpoint', 'DeepL authentication failed')
    if (status === 429)
      throw new TranslateError('please try again later', 'Too many requests')
    if (status === 456)
      throw new TranslateError('character quota exceeded', 'DeepL quota exceeded')
    throw new TranslateError(`HTTP ${status} ${response.statusText}`, 'DeepL error')
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
      ? fromDeepLLang(translation.detected_source_language)
      : from,
    to,
  }
}

// Re-exported for tests.
export const __testing = {
  toDeepLSourceLang,
  toDeepLTargetLang,
  fromDeepLLang,
}
