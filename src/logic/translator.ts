import { DeepLError, Translator as DeepLTranslator, type Language, type TargetLanguageCode, nonRegionalLanguageCode } from 'deepl-node'
import googleTranslate from '@iamtraction/google-translate'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { getLanguageName } from '../data/languages'
import { preferences } from './hooks'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

let deeplSourceLanguages: readonly Language[]
let deeplTargetLanguages: readonly Language[]

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

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const key = `${preferences.engine}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    let translated, result
    switch (preferences.engine) {
      case 'google': {
        translated = await googleTranslate(text, {
          from,
          to,
        })

        result = {
          original: text,
          translated: translated.text,
          from: translated?.from?.language?.didYouMean
            ? from
            : translated?.from?.language?.iso as LanguageCode,
          to,
        }
        break
      }
      case 'deepl': {
        if (!preferences.apiKey)
          throw new TranslateError('please set your API key', 'DeepL')

        const translator = new DeepLTranslator(preferences.apiKey)

        // DeepL accepts ISO 639-1 language codes and null (auto-detection) for the source language
        const fromCode = from === 'auto' ? null : nonRegionalLanguageCode(from)

        if (fromCode) {
          // Get the list of supported source languages
          if (!deeplSourceLanguages)
            deeplSourceLanguages = await translator.getSourceLanguages()

          // Check if DeepL supports the source language
          if (!deeplSourceLanguages.some(lang => lang.code === fromCode))
            throw new TranslateError(`DeepL does not support translating from ${getLanguageName(from)} (${fromCode}).`)
        }

        /**
         * DeepL uses ISO 3166-1 language codes for some target languages and ISO 639-1 for others
         * See {@link https://github.com/DeepLcom/deepl-node/tree/main#translating-text}
         */
        let toCode = to as string
        switch (to) {
          case 'en':
          case 'auto':
            toCode = 'en-US'
            break
          case 'pt':
            toCode = 'pt-BR'
            break
          case 'zh-CN':
          case 'zh-TW':
            toCode = 'zh'
            break
        }

        // Get the list of supported target languages
        if (!deeplTargetLanguages)
          deeplTargetLanguages = await translator.getTargetLanguages()

        // Check if DeepL supports the target language
        if (!deeplTargetLanguages.some(lang => lang.code === toCode))
          throw new TranslateError(`DeepL does not support translating to ${getLanguageName(to)} (${toCode}).`)

        translated = await translator.translateText(
          text,
          fromCode,
          toCode as TargetLanguageCode,
        )

        result = {
          original: text,
          translated: translated.text,
          from: translated.detectedSourceLang === 'zh' ? 'zh-CN' : translated.detectedSourceLang as LanguageCode,
          to,
        }
        break
      }
    }

    cache.set(key, result)
    return result
  }
  catch (err) {
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
