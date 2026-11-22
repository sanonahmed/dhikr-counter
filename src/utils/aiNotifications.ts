export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const AI_PROVIDER_STORAGE_KEY = 'dhikr-counter-ai-provider-v1';
export const DEFAULT_AI_PROVIDER: AiProviderConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export function loadAiProvider(): AiProviderConfig {
  try {
    const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    return raw ? { ...DEFAULT_AI_PROVIDER, ...JSON.parse(raw) as Partial<AiProviderConfig> } : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

export function saveAiProvider(config: AiProviderConfig): void {
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, JSON.stringify(config));
}

export function clearAiProvider(): void {
  localStorage.removeItem(AI_PROVIDER_STORAGE_KEY);
}

export async function requestAiCompletion(config: AiProviderConfig, prompt: string, maxTokens = 300): Promise<string> {
  let baseUrl = config.baseUrl.trim();
  while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  if (!baseUrl || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error('Enter the API base URL, API key, and model.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl}/chat/completions`);
  } catch {
    throw new Error('Enter a valid API base URL.');
  }
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
    throw new Error('For security, the API URL must use HTTPS.');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
    body: JSON.stringify({
      model: config.model.trim(), max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json().catch(() => null) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(data?.error?.message || `AI provider request failed (${response.status}).`);
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('The provider returned an empty response.');
  return content;
}
