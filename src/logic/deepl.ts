import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { languagesByCode } from '../data/languages'

type DeepLLanguageType = 'source' | 'target'

interface DeepLLanguage {
  language: string
  name: string
}

interface DeepLTranslateResponse {
  translations?: {
    detected_source_language: string
    text: string
  }[]
}

export class DeepLError extends Error {
  constructor(name: string, message: string) {
    super(message)
    this.name = name
  }
}

// Languages whose DeepL code is not just the upper-cased app code.
// Every other language maps to `code.toUpperCase()` and is checked against
// the languages DeepL reports as supported for the user's key.
const SOURCE_CODES: Partial<Record<LanguageCode, string>> = {
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
  'no': 'NB',
  'ku': 'KMR',
}

const TARGET_CODES: Partial<Record<LanguageCode, string>> = {
  ...SOURCE_CODES,
  'en': 'EN-US',
  'pt': 'PT-BR',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

const DETECTED_CODES: Record<string, LanguageCode> = {
  ZH: 'zh-CN',
  NB: 'no',
  KMR: 'ku',
}

export function toDeepLCode(code: LanguageCode, type: DeepLLanguageType): string {
  return (type === 'target' ? TARGET_CODES : SOURCE_CODES)[code] ?? code.toUpperCase()
}

export function fromDeepLCode(code: string): LanguageCode | undefined {
  const upper = code.toUpperCase()
  const mapped = DETECTED_CODES[upper] ?? upper.toLowerCase()
  return mapped in languagesByCode ? mapped as LanguageCode : undefined
}

function getApiUrl(apiKey: string) {
  // Keys for the DeepL API Free plan end with ":fx" and use a separate host
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com'
}

async function request<T>(apiKey: string, path: string, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${getApiUrl(apiKey)}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }
  catch (err) {
    throw new DeepLError('Network error', `could not reach DeepL: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!response.ok) {
    switch (response.status) {
      case 401:
      case 403:
        throw new DeepLError('Invalid DeepL API key', 'please check the API key in the extension preferences')
      case 456:
        throw new DeepLError('DeepL quota exceeded', 'the character limit of your DeepL plan has been reached')
      case 429:
      case 529:
        throw new DeepLError('Too many requests', 'please try again later')
      default: {
        const detail = await response.json()
          .then(data => (data as { message?: string })?.message)
          .catch(() => undefined)
        throw new DeepLError('DeepL error', detail || `request failed with status ${response.status}`)
      }
    }
  }

  return await response.json() as T
}

const supportedLanguages = new Map<string, Promise<Set<string>>>()

function getSupportedLanguages(apiKey: string, type: DeepLLanguageType) {
  const key = `${type}:${apiKey}`
  let languages = supportedLanguages.get(key)
  if (!languages) {
    languages = request<DeepLLanguage[]>(apiKey, `/v2/languages?type=${type}`)
      .then(list => new Set(list.map(i => i.language.toUpperCase())))
    // retry on the next call instead of caching a failure
    languages.catch(() => supportedLanguages.delete(key))
    supportedLanguages.set(key, languages)
  }
  return languages
}

export async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode, apiKey = ''): Promise<TranslateResult> {
  apiKey = apiKey.trim()
  if (!apiKey)
    throw new DeepLError('Missing DeepL API key', 'please set your DeepL API key in the extension preferences')

  const [sources, targets] = await Promise.all([
    getSupportedLanguages(apiKey, 'source'),
    getSupportedLanguages(apiKey, 'target'),
  ])

  const targetLang = toDeepLCode(to, 'target')
  // DeepL does not support this target language, skip it instead of failing every translation
  if (!targets.has(targetLang)) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  // Unsupported or unknown source languages fall back to DeepL's auto-detection
  const sourceLang = from === 'auto' ? undefined : toDeepLCode(from, 'source')

  const data = await request<DeepLTranslateResponse>(apiKey, '/v2/translate', {
    text: [text],
    target_lang: targetLang,
    ...(sourceLang && sources.has(sourceLang) ? { source_lang: sourceLang } : {}),
  })

  const translation = data.translations?.[0]
  if (!translation)
    throw new DeepLError('DeepL error', 'received an empty response')

  return {
    original: text,
    translated: translation.text,
    from: fromDeepLCode(translation.detected_source_language) ?? from,
    to,
  }
}
