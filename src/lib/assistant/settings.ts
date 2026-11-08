import 'server-only'
import { prisma } from '@/lib/prisma'
import { decryptSecret, maskSecret } from '@/lib/assistant/crypto'
import { isProviderId, PROVIDERS, type ProviderId } from '@/lib/assistant/providers'

export const SETTINGS_ID = 'default'

export type AssistantConfig = {
  provider: ProviderId
  model: string
  apiKey: string
  baseUrl: string | null
  allowActions: boolean
  customInstructions: string | null
}

/** What the settings page may see. Never includes the key itself. */
export async function getAssistantSettingsForAdmin() {
  const s = await prisma.assistantSettings.findUnique({ where: { id: SETTINGS_ID } })
  const key = s?.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : null
  const provider = s && isProviderId(s.provider) ? s.provider : 'anthropic'
  return {
    enabled: s?.enabled ?? false,
    provider,
    model: s?.model ?? PROVIDERS.anthropic.defaultModel,
    baseUrl: s?.baseUrl ?? '',
    allowActions: s?.allowActions ?? true,
    customInstructions: s?.customInstructions ?? '',
    hasApiKey: Boolean(key),
    apiKeyHint: key ? maskSecret(key) : null,
    /** A key is stored but can't be decrypted, usually because AUTH_SECRET changed. */
    apiKeyUnreadable: Boolean(s?.apiKeyEnc && !key),
  }
}

export type AssistantStatus = { ready: true; config: AssistantConfig } | { ready: false; reason: string }

/** Full config including the decrypted key, for server-side calls only. */
export async function loadAssistantConfig(): Promise<AssistantStatus> {
  const s = await prisma.assistantSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (!s || !s.enabled) return { ready: false, reason: 'The assistant is turned off. An admin can set it up under AI Assistant → Settings.' }
  if (!isProviderId(s.provider)) return { ready: false, reason: `Unknown provider "${s.provider}". Pick one in Settings.` }
  const apiKey = s.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : null
  if (!apiKey) return { ready: false, reason: 'No usable API key is saved. Re-enter it in Settings.' }
  if (!s.model) return { ready: false, reason: 'No model is selected. Pick one in Settings.' }
  if (s.provider === 'custom' && !s.baseUrl) return { ready: false, reason: 'The custom provider needs a base URL.' }
  return {
    ready: true,
    config: {
      provider: s.provider,
      model: s.model,
      apiKey,
      baseUrl: s.baseUrl,
      allowActions: s.allowActions,
      customInstructions: s.customInstructions,
    },
  }
}
