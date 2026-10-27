import type { LanguageCode } from '../../data/languages'
import type { TranslateResult } from '../../types'

/**
 * A translation backend the dispatcher can route through.
 * Providers are tried in order — see `providerChain` in ../translator.ts.
 */
export interface TranslateProvider {
  id: 'google' | 'deepl'
  /**
   * Pair coverage check. When it returns false the dispatcher falls through
   * to the next provider, so partial DeepL coverage never empties the
   * result list. Providers that omit it are assumed to serve every pair.
   */
  supports?: (from: LanguageCode, to: LanguageCode) => boolean
  translate: (text: string, from: LanguageCode, to: LanguageCode) => Promise<TranslateResult>
}

export class TranslateError extends Error {
  constructor(message?: string | Error, name?: string) {
    if (message instanceof Error) {
      super(message.message)
      this.name = name || message.name
    }
    else {
      super(message)
      this.name = name || this.name
    }
  }
}
