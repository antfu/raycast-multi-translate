import { GoogleProvider } from './google'
import { DeepLProvider } from './deepl'

export interface TranslateProvider {
  translate(text: string, from: string, to: string): Promise<string>
}

export function createProvider(providerName: string, options: any) {
  switch (providerName) {
    case 'google':
      return new GoogleProvider()
    case 'deepl':
      if (!options.deeplApiKey) {
        throw new Error('DeepL API Key is required')
      }
      return new DeepLProvider(options.deeplApiKey)
    default:
      throw new Error(`Unsupported provider: ${providerName}`)
  }
}
