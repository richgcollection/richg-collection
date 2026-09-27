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
