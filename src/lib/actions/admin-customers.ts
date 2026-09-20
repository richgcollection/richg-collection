'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { normalizePhone } from '@/lib/customers'
import type { ActionResult } from '@/lib/actions/cart'

const customerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.email('Enter a valid email address.').optional().or(z.literal('').transform(() => undefined)),
  gender: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  lastProduct: z.string().optional(),
  lastQuantity: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  lastOrderValueKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().optional(),
})

/** For leads collected outside checkout (social DMs, walk-ins) — mirrors the workbook's manual Customer-entry form. */
export async function createCustomerAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin()

  const parsed = customerSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || undefined,
    phone: formData.get('phone') || undefined,
    email: formData.get('email') || undefined,
    gender: formData.get('gender') || undefined,
    location: formData.get('location') || undefined,
    source: formData.get('source') || undefined,
    lastProduct: formData.get('lastProduct') || undefined,
    lastQuantity: formData.get('lastQuantity') || undefined,
    lastOrderValueKes: formData.get('lastOrderValueKes') || undefined,
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const phone = normalizePhone(parsed.data.phone)
  if (!phone && !parsed.data.email) {
    return { success: false, error: 'Enter at least a phone number or email.' }
  }

  if (phone) {
    const existing = await prisma.customer.findUnique({ where: { phone } })
    if (existing) {
      return { success: false, error: 'A customer with that phone number already exists.' }
    }
  }

  await prisma.customer.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      phone,
      email: parsed.data.email || null,
      gender: parsed.data.gender || null,
      location: parsed.data.location || null,
      source: parsed.data.source || 'Manual',
      lastProduct: parsed.data.lastProduct || null,
      lastQuantity: parsed.data.lastQuantity ?? null,
      lastOrderValueKes: parsed.data.lastOrderValueKes ?? null,
      notes: parsed.data.notes || null,
    },
  })

  revalidatePath('/admin/customers')
  return { success: true }
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  await requireAdmin()
  await prisma.customer.delete({ where: { id: customerId } })
  revalidatePath('/admin/customers')
  return { success: true }
}
