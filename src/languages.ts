import _languages from './languages.json'

export type LanguagesMapByCode = typeof _languages
export type LanguageCode = keyof LanguagesMapByCode

export interface LanguagesItem {
  code: LanguageCode
  name: string
  flag?: string
}

export const languagesByCode = _languages as Record<LanguageCode, LanguagesItem>
export const languages: LanguagesItem[] = Object.values(languagesByCode)
