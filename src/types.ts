import type { LanguageCode } from './languages'

export interface TranslatePreferences {
  getSystemSelection: boolean
  lang1: LanguageCode
  lang2: LanguageCode
  lang3?: LanguageCode
  lang4?: LanguageCode
  lang5?: LanguageCode
}
