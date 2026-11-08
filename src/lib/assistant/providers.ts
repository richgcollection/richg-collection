/**
 * LLM providers the admin can pick for the assistant. Claude goes through the
 * Anthropic SDK; everything else speaks the OpenAI Chat Completions protocol
 * (OpenAI itself, and the OpenAI-compatible endpoints of Gemini, DeepSeek,
 * Groq, OpenRouter, or any custom base URL such as a self-hosted server).
 *
 * Safe to import from client components: no secrets, no server-only code.
 */

export type ProviderKind = 'anthropic' | 'openai-compatible'

export type ProviderInfo = {
  label: string
  kind: ProviderKind
  /** Fixed endpoint for OpenAI-compatible providers; null means "use the SDK default" (or the admin's URL for custom). */
  baseUrl: string | null
  defaultModel: string
  /** Suggestions for the model field. Admins can type any model ID their provider offers. */
  modelSuggestions: string[]
  keyHint: string
  keyUrl: string | null
}

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: null,
    defaultModel: 'claude-opus-5-5',
    modelSuggestions: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: null,
    defaultModel: '',
    modelSuggestions: [],
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    label: 'Google Gemini',
    kind: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: '',
    modelSuggestions: [],
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  deepseek: {
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    modelSuggestions: ['deepseek-chat'],
    keyHint: 'sk-…',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  groq: {
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: '',
    modelSuggestions: [],
    keyHint: 'gsk_…',
    keyUrl: 'https://console.groq.com/keys',
  },
  openrouter: {
    label: 'OpenRouter (many models)',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    modelSuggestions: [],
    keyHint: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
  },
  custom: {
    label: 'Custom (OpenAI-compatible URL)',
    kind: 'openai-compatible',
    baseUrl: null,
    defaultModel: '',
    modelSuggestions: [],
    keyHint: 'API key',
    keyUrl: null,
  },
} as const satisfies Record<string, ProviderInfo>

export type ProviderId = keyof typeof PROVIDERS
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS
}
