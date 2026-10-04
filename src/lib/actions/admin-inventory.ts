'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { parseStoreDate } from '@/lib/dates'
import { NON_SALE_OUT_REASONS, recordStockIn, recordStockOut, type StockActionResult } from '@/lib/inventory'

const stockInSchema = z.object({
  productId: z.string().min(1, 'Select a product.'),
  variantId: z.string().optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.'),
  unitCostKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  supplier: z.string().optional(),
  note: z.string().optional(),
})

export async function recordStockInAction(formData: FormData): Promise<StockActionResult> {
  const admin = await requireAdmin()

  const parsed = stockInSchema.safeParse({
    productId: formData.get('productId'),
    variantId: formData.get('variantId') || undefined,
    quantity: formData.get('quantity'),
    unitCostKes: formData.get('unitCostKes') || undefined,
    supplier: formData.get('supplier') || undefined,
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const result = await recordStockIn({ ...parsed.data, createdById: admin.id })

  revalidatePath('/admin/inventory')
  revalidatePath('/admin')
  return result
}

const stockOutItemSchema = z.object({
  productId: z.string().min(1, 'Select a product.'),
  variantId: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.'),
  unitPriceKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  discountKes: z.coerce
    .number()
    .int()
    .min(0, 'Discount cannot be negative.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

const stockOutSchema = z.object({
  items: z.array(stockOutItemSchema).min(1, 'Select at least one product.'),
  reason: z.enum(NON_SALE_OUT_REASONS),
  counterparty: z.string().optional(),
  note: z.string().optional(),
  date: z.string().min(1, 'Select the date the stock went out.'),
})

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export async function recordStockOutAction(formData: FormData): Promise<StockActionResult> {
  const admin = await requireAdmin()

  const parsed = stockOutSchema.safeParse({
    items: parseJsonField(formData.get('items')) ?? [],
    reason: formData.get('reason'),
    counterparty: formData.get('counterparty') || undefined,
    note: formData.get('note') || undefined,
    date: formData.get('date') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { date, ...input } = parsed.data
  const occurredAt = parseStoreDate(date)
  if (!occurredAt) {
    return { success: false, error: 'Enter a valid date.' }
  }
  if (occurredAt.getTime() > Date.now()) {
    return { success: false, error: 'Date cannot be in the future.' }
  }

  const result = await recordStockOut({ ...input, occurredAt, createdById: admin.id })

  revalidatePath('/admin/inventory')
  revalidatePath('/admin')
  return result
}

const movementNoteSchema = z.object({
  movementId: z.string().min(1),
  note: z.string().max(2000, 'Note is too long.').transform((v) => v.trim()),
})

export async function updateStockMovementNoteAction(formData: FormData): Promise<StockActionResult> {
  await requireAdmin()

  const parsed = movementNoteSchema.safeParse({
    movementId: formData.get('movementId'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await prisma.stockMovement.update({
    where: { id: parsed.data.movementId },
    data: { note: parsed.data.note || null },
  })

  revalidatePath('/admin/inventory')
  return { success: true }
}

const movementDiscountSchema = z.object({
  movementId: z.string().min(1),
  discountKes: z.coerce.number().int().min(0, 'Discount cannot be negative.'),
})

/** Sets the discount given on a recorded stock-out line (0 clears it). Stock levels are not touched. */
export async function updateStockMovementDiscountAction(formData: FormData): Promise<StockActionResult> {
  await requireAdmin()

  const parsed = movementDiscountSchema.safeParse({
    movementId: formData.get('movementId'),
    discountKes: formData.get('discountKes') || 0,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const movement = await prisma.stockMovement.findUnique({
    where: { id: parsed.data.movementId },
    select: { direction: true, quantity: true, unitPriceKes: true },
  })
  if (!movement || movement.direction !== 'OUT') {
    return { success: false, error: 'Discounts can only be recorded on stock-out records.' }
  }
  if (parsed.data.discountKes > 0 && movement.unitPriceKes == null) {
    return { success: false, error: 'This record has no sale price, so it cannot have a discount.' }
  }
  if (parsed.data.discountKes > (movement.unitPriceKes ?? 0) * movement.quantity) {
    return { success: false, error: 'A discount cannot be more than the line total.' }
  }

  await prisma.stockMovement.update({
    where: { id: parsed.data.movementId },
    data: { discountKes: parsed.data.discountKes || null },
  })

  revalidatePath('/admin/inventory')
  revalidatePath('/admin/customers')
  revalidatePath('/admin/analytics')
  revalidatePath('/admin')
  return { success: true }
}
