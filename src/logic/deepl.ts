import type { LanguageCode } from '../data/languages'

export const DEEPL_FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate'
export const DEEPL_PRO_ENDPOINT = 'https://api.deepl.com/v2/translate'

const TARGET_LANG_MAP: Partial<Record<LanguageCode, string>> = {
  'en': 'EN-US',
  'pt': 'PT-PT',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
  'no': 'NB',
}

const SOURCE_LANG_MAP: Partial<Record<LanguageCode, string>> = {
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
  'no': 'NB',
}

export interface DeepLTranslateResponse {
  translations?: Array<{
    detected_source_language?: string
    text?: string
  }>
  message?: string
}

export class DeepLApiError extends Error {
  status?: number

  constructor(message: string, name: string, status?: number) {
    super(message)
    this.name = name
    this.status = status
  }
}

export function getDeepLEndpoint(apiKey: string): string {
  return apiKey.trim().endsWith(':fx')
    ? DEEPL_FREE_ENDPOINT
    : DEEPL_PRO_ENDPOINT
}

export function toDeepLSourceLang(code: LanguageCode): string | undefined {
  if (code === 'auto')
    return undefined
  return SOURCE_LANG_MAP[code] ?? code.split('-')[0].toUpperCase()
}

export function toDeepLTargetLang(code: LanguageCode): string {
  return TARGET_LANG_MAP[code] ?? code.toUpperCase()
}

export function fromDeepLDetectedLang(
  detected: string | undefined,
  requestedFrom: LanguageCode,
): LanguageCode {
  if (!detected)
    return requestedFrom

  const upper = detected.toUpperCase()
  if (upper === 'NB')
    return 'no'
  if (upper === 'ZH' || upper === 'ZH-HANS' || upper === 'ZH-HANT')
    return requestedFrom === 'zh-TW' ? 'zh-TW' : 'zh-CN'
  if (upper.startsWith('EN'))
    return 'en'
  if (upper.startsWith('PT'))
    return 'pt'

  return detected.toLowerCase() as LanguageCode
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string, from: LanguageCode }> {
  const trimmedKey = apiKey?.trim()
  if (!trimmedKey) {
    throw new DeepLApiError(
      'Please set your DeepL API key in extension preferences',
      'Missing DeepL API key',
    )
  }

  const sourceLang = toDeepLSourceLang(from)
  const payload: Record<string, unknown> = {
    text: [text],
    target_lang: toDeepLTargetLang(to),
  }
  if (sourceLang)
    payload.source_lang = sourceLang

  const response = await fetchImpl(getDeepLEndpoint(trimmedKey), {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${trimmedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let detail = ''
    try {
      const errBody = await response.json() as DeepLTranslateResponse
      detail = errBody?.message ?? ''
    }
    catch {
      // ignore non-JSON error bodies
    }

    if (response.status === 401 || response.status === 403) {
      throw new DeepLApiError(
        'Invalid DeepL API key. Please check extension preferences.',
        'Invalid DeepL API key',
        response.status,
      )
    }
    if (response.status === 429) {
      throw new DeepLApiError(
        'please try again later',
        'TooManyRequestsError',
        429,
      )
    }
    if (response.status === 456) {
      throw new DeepLApiError(
        'DeepL character quota exceeded',
        'Quota exceeded',
        456,
      )
    }
    throw new DeepLApiError(
      detail || `DeepL request failed with status ${response.status}`,
      'DeepL API error',
      response.status,
    )
  }

  const data = await response.json() as DeepLTranslateResponse
  const first = data.translations?.[0]
  return {
    text: first?.text ?? '',
    from: fromDeepLDetectedLang(first?.detected_source_language, from),
  }
}
