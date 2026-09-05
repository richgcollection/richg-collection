'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/lib/actions/cart'

export async function getPaystackSettingsForAdmin() {
  const settings = await prisma.paymentSettings.findUnique({ where: { provider: 'paystack' } })
  return {
    enabled: settings?.enabled ?? false,
    publicKey: settings?.publicKey ?? '',
    hasSecretKey: Boolean(settings?.secretKey),
  }
}

const settingsSchema = z.object({
  enabled: z.coerce.boolean(),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
})

export async function updatePaystackSettingsAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const parsed = settingsSchema.safeParse({
    enabled: formData.get('enabled') === 'on',
    publicKey: formData.get('publicKey') || undefined,
    secretKey: formData.get('secretKey') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: 'Please check the form and try again.' }
  }

  const existing = await prisma.paymentSettings.findUnique({ where: { provider: 'paystack' } })

  if (parsed.data.enabled && !parsed.data.secretKey && !existing?.secretKey) {
    return { success: false, error: 'Add a Secret Key before enabling Paystack.' }
  }

  await prisma.paymentSettings.upsert({
    where: { provider: 'paystack' },
    update: {
      enabled: parsed.data.enabled,
      publicKey: parsed.data.publicKey ?? existing?.publicKey,
      // Blank secretKey input means "leave the existing one alone" — we
      // never send the real value back to the browser to be resubmitted.
      secretKey: parsed.data.secretKey ?? existing?.secretKey,
    },
    create: {
      provider: 'paystack',
      enabled: parsed.data.enabled,
      publicKey: parsed.data.publicKey,
      secretKey: parsed.data.secretKey,
    },
  })

  revalidatePath('/admin/payment-settings')
  return { success: true }
}
