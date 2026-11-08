'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireAdminRole } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { decryptSecret, encryptSecret } from '@/lib/assistant/crypto'
import { PROVIDER_IDS, type ProviderId } from '@/lib/assistant/providers'
import { todayInStoreTz } from '@/lib/dates'
import { SETTINGS_ID } from '@/lib/assistant/settings'
import { describeProviderError, testConnection } from '@/lib/assistant/engine'
import { assistantActionSchema } from '@/lib/assistant/actions-schema'
import { recordStockInAction, recordStockOutAction } from '@/lib/actions/admin-inventory'
import { markOrderPaidAction, updateOrderStatusAction } from '@/lib/actions/admin-orders'
import type { ActionResult } from '@/lib/actions/cart'

// ---------------------------------------------------------------- settings (owner only)

const settingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  model: z.string().trim().min(1, 'Enter a model name.').max(200),
  apiKey: z.string().trim().max(500).optional(),
  clearApiKey: z.boolean(),
  baseUrl: z.string().trim().url('Enter a valid base URL, e.g. https://example.com/v1').optional(),
  allowActions: z.boolean(),
  customInstructions: z.string().max(4000).optional(),
})

function readSettingsForm(formData: FormData) {
  return settingsSchema.safeParse({
    enabled: formData.get('enabled') === 'on',
    provider: formData.get('provider'),
    model: formData.get('model') ?? '',
    apiKey: (formData.get('apiKey') as string | null) || undefined,
    clearApiKey: formData.get('clearApiKey') === 'on',
    baseUrl: (formData.get('baseUrl') as string | null) || undefined,
    allowActions: formData.get('allowActions') === 'on',
    customInstructions: (formData.get('customInstructions') as string | null) || undefined,
  })
}

const OWNER_ONLY = 'Only the store owner (Admin role) can change assistant settings.'

export async function updateAssistantSettingsAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAdminRole())) return { success: false, error: OWNER_ONLY }

  const parsed = readSettingsForm(formData)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const data = parsed.data

  if (data.provider === 'custom' && !data.baseUrl) {
    return { success: false, error: 'The custom provider needs a base URL.' }
  }

  const existing = await prisma.assistantSettings.findUnique({ where: { id: SETTINGS_ID } })
  // A blank key field keeps the saved key; switching provider without a new key would pair the wrong key.
  let apiKeyEnc = existing?.apiKeyEnc ?? null
  if (data.clearApiKey) apiKeyEnc = null
  if (data.apiKey) apiKeyEnc = encryptSecret(data.apiKey)
  else if (existing && existing.provider !== data.provider) apiKeyEnc = null

  if (data.enabled && !apiKeyEnc) {
    return { success: false, error: 'Add an API key for this provider before turning the assistant on.' }
  }

  const values = {
    enabled: data.enabled,
    provider: data.provider,
    model: data.model,
    apiKeyEnc,
    baseUrl: data.provider === 'custom' ? data.baseUrl! : null,
    allowActions: data.allowActions,
    customInstructions: data.customInstructions?.trim() || null,
  }
  await prisma.assistantSettings.upsert({
    where: { id: SETTINGS_ID },
    update: values,
    create: { id: SETTINGS_ID, ...values },
  })

  revalidatePath('/admin/assistant')
  revalidatePath('/admin/assistant/settings')
  return { success: true }
}

/** Tests the values currently in the form; a blank key field falls back to the saved key. */
export async function testAssistantConnectionAction(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdminRole())) return { success: false, error: OWNER_ONLY }

  const parsed = readSettingsForm(formData)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { provider, model, baseUrl } = parsed.data
  if (provider === 'custom' && !baseUrl) return { success: false, error: 'The custom provider needs a base URL.' }

  let apiKey = parsed.data.apiKey
  if (!apiKey) {
    const existing = await prisma.assistantSettings.findUnique({ where: { id: SETTINGS_ID } })
    if (existing?.apiKeyEnc && existing.provider === provider) apiKey = decryptSecret(existing.apiKeyEnc) ?? undefined
  }
  if (!apiKey) return { success: false, error: 'Enter the API key to test.' }

  try {
    await testConnection({ provider, model, apiKey, baseUrl: baseUrl ?? null })
    return { success: true }
  } catch (err) {
    return { success: false, error: describeProviderError(err) }
  }
}

// ---------------------------------------------------------------- confirming a proposal

/**
 * Runs a change the assistant proposed, after the admin clicked Confirm. It
 * goes through the same server actions as the dashboard forms, so validation,
 * permissions, stock rules and page revalidation are identical.
 */
export async function confirmAssistantAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin()

  const settings = await prisma.assistantSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (!settings?.allowActions) return { success: false, error: 'Assistant actions are turned off in settings.' }

  const parsed = assistantActionSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'This change is no longer valid.' }
  const { action, input } = parsed.data

  const form = new FormData()
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') form.set(key, String(value))
  }

  switch (action) {
    case 'restock': {
      set('productId', input.productId)
      set('variantId', input.variantId)
      set('quantity', input.quantity)
      set('unitCostKes', input.unitCostKes)
      set('supplier', input.supplier)
      set('note', input.note ? `${input.note} (via AI assistant)` : 'Recorded via AI assistant')
      return recordStockInAction(form)
    }
    case 'stock_out': {
      form.set('items', JSON.stringify(input.items))
      set('reason', input.reason)
      set('counterparty', input.counterparty)
      set('note', input.note ? `${input.note} (via AI assistant)` : 'Recorded via AI assistant')
      set('date', input.date ?? todayInStoreTz())
      return recordStockOutAction(form)
    }
    case 'order_status': {
      const order = await findOrderId(input.orderNumber)
      if (!order) return { success: false, error: `Order ${input.orderNumber} not found.` }
      set('orderId', order)
      set('status', input.status)
      return updateOrderStatusAction(form)
    }
    case 'mark_paid': {
      const order = await findOrderId(input.orderNumber)
      if (!order) return { success: false, error: `Order ${input.orderNumber} not found.` }
      return markOrderPaidAction(order)
    }
  }
}

async function findOrderId(orderNumber: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } })
  return order?.id ?? null
}
