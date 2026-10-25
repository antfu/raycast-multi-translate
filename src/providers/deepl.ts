export interface DeepLConfig {
  apiKey: string;
  isPro?: boolean;
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

export async function translateWithDeepL(
  text: string,
  targetLang: string,
  config: DeepLConfig
): Promise<TranslationResult> {
  const endpoint = config.isPro 
    ? 'https://api.deepl.com/v2/translate' 
    : 'https://api-free.deepl.com/v2/translate';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang.toUpperCase(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const translation = data.translations?.[0];

  return {
    translatedText: translation?.text || text,
    detectedSourceLanguage: translation?.detected_source_language,
  };
}