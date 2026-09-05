'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/lib/actions/cart'

const shippingRateSchema = z.object({
  town: z.string().min(2, 'Town is required.'),
  rateKes: z.coerce.number().int().min(0, 'Rate must be zero or more.'),
})

export async function upsertShippingRateAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const parsed = shippingRateSchema.safeParse({
    town: formData.get('town'),
    rateKes: formData.get('rateKes'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await prisma.shippingRate.upsert({
    where: { town: parsed.data.town },
    update: { rateKes: parsed.data.rateKes },
    create: parsed.data,
  })

  revalidatePath('/admin/shipping-rates')
  return { success: true }
}

/** Quick inline edit of an existing rate's amount (no town-name change). */
export async function updateShippingRateAmountAction(town: string, rateKes: number): Promise<ActionResult> {
  await requireAdmin()

  if (!Number.isInteger(rateKes) || rateKes < 0) {
    return { success: false, error: 'Rate must be zero or more.' }
  }

  await prisma.shippingRate.update({ where: { town }, data: { rateKes } })
  revalidatePath('/admin/shipping-rates')
  return { success: true }
}

export async function deleteShippingRateAction(town: string): Promise<ActionResult> {
  await requireAdmin()

  if (town === 'DEFAULT') {
    return { success: false, error: 'The DEFAULT rate cannot be deleted.' }
  }

  await prisma.shippingRate.delete({ where: { town } })
  revalidatePath('/admin/shipping-rates')
  return { success: true }
}
