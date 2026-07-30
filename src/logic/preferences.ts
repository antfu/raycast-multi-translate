import { getPreferenceValues } from '@raycast/api'
import type { LanguageCode } from '../data/languages'

export type TranslationEngine = 'google' | 'deepl'

export interface TranslatePreferences {
  getSystemSelection: boolean
  translationEngine?: TranslationEngine
  deeplApiKey?: string
  [key: `lang${number}`]: LanguageCode | 'none' | undefined
}

export const preferences = getPreferenceValues<TranslatePreferences>()

export function getTranslationEngine(): TranslationEngine {
  return (preferences.translationEngine || 'google') as TranslationEngine
}
