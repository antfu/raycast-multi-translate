// Note: Assuming the existence of a configuration/preference system in the extension
// Adding the DeepL option to the provider selection logic

import { createProvider } from './providers'

export async function translateText(text: string, from: string, to: string, preferences: any) {
  const providerName = preferences.provider || 'google'
  const provider = createProvider(providerName, preferences)
  return await provider.translate(text, from, to)
}
