import type { LanguageCode } from './data/languages'

declare global {
  namespace Preferences {
    interface Translate {
      getSystemSelection: boolean
      translationProvider?: 'google' | 'deepl'
      deeplApiKey?: string
      lang1: LanguageCode
      lang2?: LanguageCode | 'none'
      lang3?: LanguageCode | 'none'
      lang4?: LanguageCode | 'none'
      lang5?: LanguageCode | 'none'
      lang6?: LanguageCode | 'none'
      lang7?: LanguageCode | 'none'
    }
  }
}

export {}
