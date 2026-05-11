import type { LanguageCode } from './data/languages'

type OptionalLanguageCode = LanguageCode | 'none'

declare global {
  namespace Preferences {
    interface Translate {
      getSystemSelection: boolean
      translationProvider: 'google' | 'deepl'
      deeplApiKey?: string
      deeplApiPlan: 'free' | 'pro'
      lang1: LanguageCode
      lang2?: OptionalLanguageCode
      lang3?: OptionalLanguageCode
      lang4?: OptionalLanguageCode
      lang5?: OptionalLanguageCode
      lang6?: OptionalLanguageCode
      lang7?: OptionalLanguageCode
    }
  }
}

export {}
