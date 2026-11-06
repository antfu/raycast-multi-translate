/**
 * DeepL BYOK Translation Provider for raycast-multi-translate
 * Bounty: antfu/raycast-multi-translate #7 ($25 USD)
 *
 * Supports both DeepL Free (`:fx` key suffix -> `https://api-free.deepl.com/v2/translate`)
 * and DeepL Pro (`https://api.deepl.com/v2/translate`) with automatic language code normalization.
 */

export interface DeepLTranslateOptions {
  text: string;
  sourceLang?: string;
  targetLang: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface DeepLTranslateResult {
  provider: 'deepl';
  text: string;
  detectedSourceLang?: string;
  targetLang: string;
}

const DEEPL_LANG_MAP: Record<string, string> = {
  en: 'EN',
  'en-us': 'EN-US',
  'en-gb': 'EN-GB',
  zh: 'ZH',
  'zh-cn': 'ZH-HANS',
  'zh-tw': 'ZH-HANT',
  pt: 'PT-PT',
  'pt-br': 'PT-BR',
  ja: 'JA',
  ko: 'KO',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  ru: 'RU',
  nl: 'NL',
  pl: 'PL',
};

export function normalizeDeepLLang(code: string): string {
  const lower = code.trim().toLowerCase();
  return DEEPL_LANG_MAP[lower] || code.trim().toUpperCase();
}

export function resolveDeepLEndpoint(apiKey: string): string {
  return apiKey.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

export async function translateWithDeepL(options: DeepLTranslateOptions): Promise<DeepLTranslateResult> {
  if (!options.apiKey || !options.apiKey.trim()) {
    throw new Error('DeepL API Key is required for DeepL translation provider');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = resolveDeepLEndpoint(options.apiKey);
  const targetLang = normalizeDeepLLang(options.targetLang);

  const payload: Record<string, unknown> = {
    text: [options.text],
    target_lang: targetLang,
  };
  if (options.sourceLang && options.sourceLang !== 'auto') {
    payload.source_lang = normalizeDeepLLang(options.sourceLang).split('-')[0];
  }

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${options.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as {
    translations?: Array<{ detected_source_language?: string; text: string }>;
    message?: string;
  };

  if (!res.ok || !data.translations?.length) {
    throw new Error(data.message || `DeepL API Error (${res.status})`);
  }

  return {
    provider: 'deepl',
    text: data.translations.map((t) => t.text).join('\n'),
    detectedSourceLang: data.translations[0].detected_source_language,
    targetLang,
  };
}
