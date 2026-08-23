'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/lib/actions/cart'

const shippingRateSchema = z.object({
  county: z.string().min(2, 'County is required.'),
  rateKes: z.coerce.number().int().min(0, 'Rate must be zero or more.'),
})

export async function upsertShippingRateAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const parsed = shippingRateSchema.safeParse({
    county: formData.get('county'),
    rateKes: formData.get('rateKes'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await prisma.shippingRate.upsert({
    where: { county: parsed.data.county },
    update: { rateKes: parsed.data.rateKes },
    create: parsed.data,
  })

  revalidatePath('/admin/shipping-rates')
  return { success: true }
}

export async function deleteShippingRateAction(county: string): Promise<ActionResult> {
  await requireAdmin()

  if (county === 'DEFAULT') {
    return { success: false, error: 'The DEFAULT rate cannot be deleted.' }
  }

  await prisma.shippingRate.delete({ where: { county } })
  revalidatePath('/admin/shipping-rates')
  return { success: true }
}
