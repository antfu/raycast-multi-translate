import {
  AuthorizationError,
  DeepLError,
  DeepLClient,
  QuotaExceededError,
  TooManyRequestsError as DeepLTooManyRequestsError,
  type Language,
  type SourceLanguageCode,
  type TargetLanguageCode,
} from 'deepl-node'
import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import { getLanguageName, languagesByCode } from '../data/languages'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { getTranslationEngine, preferences } from './preferences'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

const DEEPL_SOURCE_LANGUAGE_MAP: Partial<Record<LanguageCode, SourceLanguageCode>> = {
  no: 'nb',
  ku: 'kmr',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
}

const DEEPL_TARGET_LANGUAGE_MAP: Partial<Record<LanguageCode, TargetLanguageCode>> = {
  en: 'en-US',
  no: 'nb',
  pt: 'pt-BR',
  ku: 'kmr',
  'zh-CN': 'zh-HANS',
  'zh-TW': 'zh-HANT',
}

let deeplClient: DeepLClient | undefined
let deeplAuthKey: string | undefined
let deeplSourceLanguages: Promise<readonly Language[]> | undefined
let deeplTargetLanguages: Promise<readonly Language[]> | undefined

export class TranslateError extends Error {
  constructor(message?: string | Error, name?: string) {
    if (message instanceof Error) {
      super(message.message)
      this.name = name || message.name
    }
    else {
      super(message)
      this.name = name || this.name
    }
  }
}

function getDeepLClient() {
  const authKey = preferences.deeplApiKey?.trim()
  if (!authKey)
    throw new TranslateError('Set your DeepL API key in extension preferences', 'DeepL')

  if (!deeplClient || deeplAuthKey !== authKey) {
    deeplAuthKey = authKey
    deeplClient = new DeepLClient(authKey, {
      appInfo: {
        appName: 'raycast-multi-translate',
        appVersion: '0.0.0',
      },
    })
    deeplSourceLanguages = undefined
    deeplTargetLanguages = undefined
  }

  return deeplClient
}

function toDeepLSourceLanguage(code: LanguageCode): SourceLanguageCode | null {
  if (code === AUTO_DETECT)
    return null

  return DEEPL_SOURCE_LANGUAGE_MAP[code] || code as SourceLanguageCode
}

function toDeepLTargetLanguage(code: LanguageCode): TargetLanguageCode {
  return DEEPL_TARGET_LANGUAGE_MAP[code] || code as TargetLanguageCode
}

function fromDeepLSourceLanguage(code: string, fallback: LanguageCode): LanguageCode {
  const normalized = code.toLowerCase()
  switch (normalized) {
    case 'nb':
      return 'no'
    case 'zh':
    case 'zh-hans':
      return 'zh-CN'
    case 'zh-hant':
      return 'zh-TW'
    case 'en-gb':
    case 'en-us':
      return 'en'
    case 'pt-br':
    case 'pt-pt':
      return 'pt'
    default:
      return normalized in languagesByCode
        ? normalized as LanguageCode
        : fallback
  }
}

async function assertDeepLLanguageSupport(
  client: DeepLClient,
  deepLCode: string,
  localCode: LanguageCode,
  type: 'source' | 'target',
) {
  const supportedLanguages = type === 'source'
    ? (deeplSourceLanguages ||= client.getSourceLanguages())
    : (deeplTargetLanguages ||= client.getTargetLanguages())
  const languages = await supportedLanguages

  if (!languages.some(lang => lang.code.toLowerCase() === deepLCode.toLowerCase())) {
    throw new TranslateError(
      `DeepL does not support ${type} language ${getLanguageName(localCode)} (${deepLCode})`,
      'DeepL',
    )
  }
}

async function translateWithGoogle(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const translated = await googleTranslate(text, {
    from,
    to,
  })

  return {
    original: text,
    translated: translated.text,
    from: translated?.from?.language?.didYouMean
      ? from
      : translated?.from?.language?.iso as LanguageCode,
    to,
  }
}

async function translateWithDeepL(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const client = getDeepLClient()
  const sourceLanguage = toDeepLSourceLanguage(from)
  const targetLanguage = toDeepLTargetLanguage(to)

  if (sourceLanguage)
    await assertDeepLLanguageSupport(client, sourceLanguage, from, 'source')
  await assertDeepLLanguageSupport(client, targetLanguage, to, 'target')

  const translated = await client.translateText(text, sourceLanguage, targetLanguage)

  return {
    original: text,
    translated: translated.text,
    from: fromDeepLSourceLanguage(translated.detectedSourceLang, from),
    to,
  }
}

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const engine = getTranslationEngine()
  const key = `${engine}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    const result = engine === 'deepl'
      ? await translateWithDeepL(text, from, to)
      : await translateWithGoogle(text, from, to)
    cache.set(key, result)
    return result
  }
  catch (err) {
    if (err instanceof AuthorizationError)
      throw new TranslateError('Check your DeepL API key', 'DeepL authorization failed')

    if (err instanceof QuotaExceededError)
      throw new TranslateError('Your DeepL quota has been exceeded', 'DeepL quota exceeded')

    if (err instanceof DeepLTooManyRequestsError)
      throw new TranslateError('please try again later', 'DeepL rate limited')

    if (err instanceof DeepLError)
      throw new TranslateError(err.message, 'DeepL')

    if (err instanceof Error) {
      switch (err.name) {
        case 'TooManyRequestsError':
          throw new TranslateError('please try again later', 'Too many requests')
        default:
          throw new TranslateError(err)
      }
    }

    throw err
  }
}

export async function translateAll(text: string, from: LanguageCode = 'auto', languages: LanguageCode[]) {
  if (!text)
    return []

  const result = (await Promise.all(languages.map(async to => translate(text, from, to)))).filter(i => i.translated)

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
