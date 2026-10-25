export interface DeepLConfig {
  apiKey: string;
  isPro?: boolean;
}

export async function translateWithDeepL(text: string, targetLang: string, config: DeepLConfig) {
  const endpoint = config.isPro ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: [text], target_lang: targetLang.toUpperCase() })
  });
  const data = await res.json();
  return data.translations?.[0]?.text || text;
}
