import { TranslateProvider } from './index'

export class DeepLProvider implements TranslateProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    const url = 'https://api-free.deepl.com/v2/translate' // Default to free API, logic can be expanded for Pro
    
    const params = new URLSearchParams({
      auth_key: this.apiKey,
      text: text,
      target_lang: to.toUpperCase(),
    })

    if (from !== 'auto') {
      params.append('source_lang', from.toUpperCase())
    }

    const response = await fetch(url, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`DeepL API Error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return data.translations[0].text
  }
}
