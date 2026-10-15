import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { TranslateError } from './translator'

export interface DeepLOptions {
  apiKey?: string
  endpoint?: 'free' | 'pro'
}

// DeepL supported source languages
export const DEEPL_SOURCE_LANGUAGES = new Set([
  'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR',
  'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL',
  'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
])

// DeepL supported target languages
export const DEEPL_TARGET_LANGUAGES = new Set([
  'BG', 'CS', 'DA', 'DE', 'EL', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR',
  'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL',
  'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
])

/**
 * Maps extension LanguageCode to DeepL source_lang parameter.
 * Returns undefined for 'auto' to let DeepL detect automatically.
 */
export function toDeepLSource(code: LanguageCode): string | undefined {
  if (!code || code === 'auto')
    return undefined

  const upper = code.toUpperCase()
  if (DEEPL_SOURCE_LANGUAGES.has(upper))
    return upper

  // Regional/variant fallbacks
  if (code.startsWith('zh'))
    return 'ZH'
  if (code.startsWith('en'))
    return 'EN'
  if (code.startsWith('pt'))
    return 'PT'

  return undefined
}

/**
 * Maps extension LanguageCode to DeepL target_lang parameter.
 */
export function toDeepLTarget(code: LanguageCode): string | undefined {
  if (!code || code === 'auto')
    return undefined

  const langStr = String(code).toLowerCase()
  const upper = code.toUpperCase()
  if (DEEPL_TARGET_LANGUAGES.has(upper))
    return upper

  // Region specific mappings
  if (langStr === 'en' || langStr === 'en-us')
    return 'EN-US'
  if (langStr === 'en-gb')
    return 'EN-GB'
  if (langStr === 'pt' || langStr === 'pt-br')
    return 'PT-BR'
  if (langStr === 'pt-pt')
    return 'PT-PT'
  if (langStr.startsWith('zh'))
    return 'ZH'

  return undefined
}

/**
 * Translates a single text using DeepL API.
 */
export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  options: DeepLOptions,
): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const apiKey = (options.apiKey || '').trim()
  if (!apiKey) {
    throw new TranslateError('DeepL API Key is missing. Please set your API key in extension preferences.', 'Missing API Key')
  }

  const targetLang = toDeepLTarget(to)
  if (!targetLang) {
    throw new TranslateError(`Language "${to}" is not currently supported by DeepL.`, 'Unsupported Language')
  }

  const sourceLang = toDeepLSource(from)

  // Free plan keys typically end with ':fx'
  const isFree = apiKey.endsWith(':fx') || options.endpoint === 'free'
  const endpointUrl = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  const bodyData: Record<string, any> = {
    text: [text],
    target_lang: targetLang,
  }

  if (sourceLang) {
    bodyData.source_lang = sourceLang
  }

  let response: Response
  try {
    response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Raycast-Multi-Translate/1.0',
      },
      body: JSON.stringify(bodyData),
    })
  }
  catch (fetchErr: any) {
    throw new TranslateError(`DeepL network request failed: ${fetchErr?.message || fetchErr}`, 'Network Error')
  }

  if (!response.ok) {
    if (response.status === 403)
      throw new TranslateError('Invalid DeepL API Key. Please verify your key in preferences.', 'Authentication Failed')
    if (response.status === 456)
      throw new TranslateError('DeepL translation quota exceeded for the current billing period.', 'Quota Exceeded')
    if (response.status === 429)
      throw new TranslateError('DeepL rate limit reached, please try again later.', 'Too Many Requests')

    let errMessage = ''
    try {
      const errJson = await response.json() as { message?: string }
      errMessage = errJson?.message || ''
    }
    catch {
      try {
        errMessage = await response.text()
      }
      catch {}
    }

    throw new TranslateError(`DeepL error (${response.status}): ${errMessage || response.statusText}`, 'API Error')
  }

  const data = await response.json() as { translations?: Array<{ text: string, detected_source_language?: string }> }
  const item = data.translations?.[0]
  if (!item || typeof item.text !== 'string') {
    throw new TranslateError('Unexpected or empty response from DeepL API.', 'Translation Error')
  }

  const detected = (item.detected_source_language || '').toLowerCase() as LanguageCode

  return {
    original: text,
    translated: item.text,
    from: from === 'auto' && detected ? detected : from,
    to,
  }
}
