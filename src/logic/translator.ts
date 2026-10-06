import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { deeplTargetLanguage, deeplTranslate } from './deepl'
import { TranslateError } from './errors'

export { TranslateError }

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

async function google(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  try {
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
  catch (err) {
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

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const preferences = getPreferenceValues<Preferences.Translate>()
  const wantsDeepl = preferences.translationProvider === 'deepl'
  if (wantsDeepl && !preferences.deeplApiKey)
    throw new TranslateError('set your DeepL API key in extension preferences', 'DeepL API key missing')

  const deeplTarget = wantsDeepl ? deeplTargetLanguage(to) : undefined
  if (wantsDeepl && !deeplTarget)
    throw new TranslateError(`DeepL does not support target language "${to}"`, 'UnsupportedLanguage')

  const useDeepl = Boolean(deeplTarget)
  const key = `${useDeepl ? 'deepl' : 'google'}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  const result = useDeepl
    ? await deeplTranslate(text, from, to, preferences.deeplApiKey || '', preferences.deeplEndpoint || 'free')
    : await google(text, from, to)

  cache.set(key, result)
  return result
}

export async function translateAll(text: string, from: LanguageCode = 'auto', languages: LanguageCode[]) {
  if (!text)
    return []

  let firstUnsupported: TranslateError | undefined
  const translations = await Promise.all(languages.map(async (to) => {
    try {
      return await translate(text, from, to)
    }
    catch (err) {
      if (err instanceof TranslateError && err.name === 'UnsupportedLanguage') {
        firstUnsupported ||= err
        return null
      }
      throw err
    }
  }))

  const result = translations.filter((item): item is TranslateResult => Boolean(item?.translated))
  if (!result.length && firstUnsupported)
    throw firstUnsupported

  const fromLangs = new Set(result.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}
