'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { normalizePhone } from '@/lib/customers'
import { CUSTOMER_SOURCES, OTHER_SOURCE } from '@/lib/customer-sources'
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
  notes: z.string().optional(),
})

/** Dropdown value, or the free text typed under "Other". */
function resolveSource(
  source: string | undefined,
  formData: FormData,
): { ok: true; source: string | undefined } | { ok: false; error: string } {
  if (source === OTHER_SOURCE) {
    const other = String(formData.get('sourceOther') ?? '').trim().slice(0, 60)
    return other ? { ok: true, source: other } : { ok: false, error: 'Specify where this customer came from.' }
  }
  if (source && !(CUSTOMER_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, error: 'Choose a source from the list.' }
  }
  return { ok: true, source }
}

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
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const phone = normalizePhone(parsed.data.phone)
  if (!phone && !parsed.data.email) {
    return { success: false, error: 'Enter at least a phone number or email.' }
  }

  const resolved = resolveSource(parsed.data.source, formData)
  if (!resolved.ok) return { success: false, error: resolved.error }
  const source = resolved.source

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

  // Products picked here are a reference on the profile only: stock is never
  // touched, and order values come from Inventory → Stock Out records.
  await prisma.customer.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      phone,
      email: parsed.data.email || null,
      gender: parsed.data.gender || null,
      location: parsed.data.location || null,
      source: source || 'Manual',
      lastProduct,
      lastQuantity,
      notes: parsed.data.notes || null,
    },
  })

  revalidatePath('/admin/customers')
  return { success: true }
}

const profileSchema = z.object({
  customerId: z.string().min(1),
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().optional(),
  phone: z.string().optional(),
  email: z.email('Enter a valid email address.').optional().or(z.literal('').transform(() => undefined)),
  gender: z.string().optional(),
  location: z.string().trim().optional(),
  source: z.string().optional(),
  notes: z.string().max(2000, 'Notes are too long.').optional(),
})

/**
 * Edits a customer's profile details. Deliberately limited to contact and
 * profile fields: stock levels and order values are never changed here —
 * those come only from Inventory → Stock Out.
 */
export async function updateCustomerAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin()

  const parsed = profileSchema.safeParse({
    customerId: formData.get('customerId'),
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') || undefined,
    phone: formData.get('phone') || undefined,
    email: formData.get('email') || undefined,
    gender: formData.get('gender') || undefined,
    location: formData.get('location') || undefined,
    source: formData.get('source') || undefined,
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }
  const { customerId, ...data } = parsed.data

  const phone = normalizePhone(data.phone)
  if (data.phone?.trim() && !phone) {
    return { success: false, error: 'Enter a valid phone number.' }
  }
  if (phone && !/^d{9,15}$/.test(phone)) {
    return { success: false, error: 'That number has the wrong number of digits.' }
  }

  const resolved = resolveSource(data.source, formData)
  if (!resolved.ok) return { success: false, error: resolved.error }

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } })
  if (!customer) return { success: false, error: 'Customer not found.' }

  if (phone) {
    const existing = await prisma.customer.findUnique({ where: { phone }, select: { id: true, firstName: true, lastName: true } })
    if (existing && existing.id !== customerId) {
      const name = `${existing.firstName} ${existing.lastName ?? ''}`.trim()
      return { success: false, error: `That number already belongs to ${name}.` }
    }
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName || null,
      phone,
      email: data.email || null,
      gender: data.gender || null,
      location: data.location || null,
      source: resolved.source || 'Manual',
      notes: data.notes?.trim() || null,
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
