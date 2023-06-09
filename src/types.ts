import type { LanguageCode } from './data/languages'

export { LanguageCode }

export interface TranslatePreferences {
  getSystemSelection: boolean
  lang1: LanguageCode
  lang2: LanguageCode
  lang3?: LanguageCode
  lang4?: LanguageCode
  lang5?: LanguageCode
}
