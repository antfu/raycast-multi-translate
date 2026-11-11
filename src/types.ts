import type { LanguageCode } from './data/languages'

export { LanguageCode }

export interface TranslateResult {
  original: string
  translated: string
  from: LanguageCode
  to: LanguageCode
}

export interface WebDictionary {
  name: string
  lang: LanguageCode
  /**
   * Enable this dictionary when user have one of the target languages
   */
  enables?: LanguageCode[]
  /**
   * Supports sentence or not
   * @default false
   */
  sentence?: boolean
  url: (text: string, result: TranslateResult) => string | void
}

export interface Preferences {
  getSystemSelection?: boolean
  lang1?: LanguageCode
  lang2?: LanguageCode
  lang3?: LanguageCode
  lang4?: LanguageCode
  deeplApiKey?: string
  deeplPro?: boolean
}
