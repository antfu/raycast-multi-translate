import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import { deeplProvider } from './providers/deepl'
import { googleProvider } from './providers/google'
import { TranslateError } from './providers/types'
import type { TranslateProvider } from './providers/types'

export const AUTO_DETECT = 'auto'

// Re-exported so existing imports keep working.
export { TranslateError }

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

/**
 * Ordered provider chain from the extension preferences:
 * the selected provider first, then Google as the universal fallback so
 * pairs DeepL cannot serve (e.g. Hindi, Swahili) still get translated.
 */
function providerChain(): TranslateProvider[] {
  const { translationProvider, deeplApiKey } = getPreferenceValues<Preferences.Translate>()
  if (translationProvider !== 'deepl')
    return [googleProvider]

  const apiKey = deeplApiKey?.trim()
  if (!apiKey)
    throw new TranslateError('Add your DeepL API key in the extension preferences', 'Missing API key')
  return [deeplProvider(apiKey), googleProvider]
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

  const chain = providerChain()
  const key = `${chain[0].id}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  for (const provider of chain) {
    if (provider.supports && !provider.supports(from, to))
      continue

    const result = await provider.translate(text, from, to)
    cache.set(key, result)
    return result
  }

  // Unreachable today: Google declares no `supports` and serves every pair.
  throw new TranslateError('no translation provider can serve this language pair', 'Unsupported language')
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
