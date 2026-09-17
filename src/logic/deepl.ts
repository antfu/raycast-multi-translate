import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'

function targetLanguage(code: LanguageCode) {
  switch (code.toLowerCase()) {
    case 'zh-cn': return 'ZH-HANS'
    case 'zh-tw': return 'ZH-HANT'
    case 'no': return 'NB'
    default: return code.toUpperCase()
  }
}

function sourceLanguage(code: LanguageCode) {
  return code.toLowerCase().startsWith('zh-') ? 'ZH' : targetLanguage(code)
}

function detectedLanguage(code: string): LanguageCode {
  switch (code.toUpperCase()) {
    case 'ZH':
    case 'ZH-HANS': return 'zh-CN'
    case 'ZH-HANT': return 'zh-TW'
    case 'NB': return 'no'
    default: return code.toLowerCase() as LanguageCode
  }
}

export async function translateDeepL(text: string, from: LanguageCode, to: LanguageCode, apiKey: string): Promise<TranslateResult> {
  const key = apiKey.trim()
  if (!key)
    throw new Error('Enter your DeepL API key in the extension preferences')

  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
  const response = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLanguage(to),
      ...(from === 'auto' ? {} : { source_lang: sourceLanguage(from) }),
    }),
  })

  if (!response.ok) {
    switch (response.status) {
      case 400: throw new Error('DeepL could not translate this language pair. Check that your source and target languages are supported by DeepL.')
      case 403: throw new Error('Check your DeepL API key in the extension preferences')
      case 429: throw new Error('Too many DeepL requests; please try again later')
      case 456: throw new Error('DeepL translation quota exceeded')
      default: throw new Error(`DeepL request failed (${response.status}); please try again later`)
    }
  }

  const data = await response.json() as {
    translations?: { text: string, detected_source_language: string }[]
  }
  const translation = data.translations?.[0]
  if (!translation || typeof translation.text !== 'string' || typeof translation.detected_source_language !== 'string')
    throw new Error('DeepL returned an invalid translation response')

  return {
    original: text,
    translated: translation.text,
    from: from === 'auto' ? detectedLanguage(translation.detected_source_language) : from,
    to,
  }
}
