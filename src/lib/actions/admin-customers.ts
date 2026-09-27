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
  products: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
    }),
  ),
  lastOrderValueKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().optional(),
})

function parseProducts(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || value === '') return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

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
    products: parseProducts(formData.get('products')),
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

  let lastProduct: string | null = null
  let lastQuantity: number | null = null
  const picked = parsed.data.products
  if (picked.length > 0) {
    const found = await prisma.product.findMany({
      where: { id: { in: picked.map((p) => p.productId) } },
      select: { id: true, name: true },
    })
    const namesById = new Map(found.map((p) => [p.id, p.name]))
    if (picked.some((p) => !namesById.has(p.productId))) {
      return { success: false, error: 'A selected product no longer exists.' }
    }
    // Single product keeps the plain name; several are listed with their quantities, e.g. "Dress ×2, Bag ×1".
    lastProduct =
      picked.length === 1
        ? namesById.get(picked[0].productId)!
        : picked
            .map((p) => `${namesById.get(p.productId)}${p.quantity ? ` ×${p.quantity}` : ''}`)
            .join(', ')
    const quantities = picked.map((p) => p.quantity).filter((q): q is number => q != null)
    lastQuantity = quantities.length > 0 ? quantities.reduce((sum, q) => sum + q, 0) : null
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
      lastProduct,
      lastQuantity,
      lastOrderValueKes: parsed.data.lastOrderValueKes ?? null,
      notes: parsed.data.notes || null,
    },
  })

  revalidatePath('/admin/customers')
  return { success: true }
}

/** Sets or clears a customer's phone after the fact — e.g. buyers imported from sales records by name only. */
export async function updateCustomerPhoneAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin()

  const customerId = formData.get('customerId')
  const raw = formData.get('phone')
  if (typeof customerId !== 'string' || !customerId || typeof raw !== 'string') {
    return { success: false, error: 'Invalid request.' }
  }

  const phone = normalizePhone(raw)
  if (raw.trim() && !phone) {
    return { success: false, error: 'Enter a valid phone number.' }
  }
  if (phone && !/^\d{9,15}$/.test(phone)) {
    return { success: false, error: 'That number has the wrong number of digits.' }
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } })
  if (!customer) return { success: false, error: 'Customer not found.' }

  if (phone) {
    const existing = await prisma.customer.findUnique({ where: { phone }, select: { id: true, firstName: true, lastName: true } })
    if (existing && existing.id !== customerId) {
      const name = `${existing.firstName} ${existing.lastName ?? ''}`.trim()
      return { success: false, error: `That number already belongs to ${name}.` }
    }
  }

  await prisma.customer.update({ where: { id: customerId }, data: { phone } })

  revalidatePath('/admin/customers')
  return { success: true }
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  await requireAdmin()
  await prisma.customer.delete({ where: { id: customerId } })
  revalidatePath('/admin/customers')
  return { success: true }
}
