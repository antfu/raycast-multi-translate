import type { LanguageCode } from './languages'

export interface LanguageCodeSet { langFrom: LanguageCode; langTo: LanguageCode }

export interface TranslatePreferences {
  lang1: LanguageCode
  lang2: LanguageCode
}
