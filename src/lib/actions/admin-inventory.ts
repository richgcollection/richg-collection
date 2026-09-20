'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
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

const stockOutSchema = z.object({
  productId: z.string().min(1, 'Select a product.'),
  variantId: z.string().optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.'),
  reason: z.enum(NON_SALE_OUT_REASONS),
  unitPriceKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  counterparty: z.string().optional(),
  note: z.string().optional(),
})

export async function recordStockOutAction(formData: FormData): Promise<StockActionResult> {
  const admin = await requireAdmin()

  const parsed = stockOutSchema.safeParse({
    productId: formData.get('productId'),
    variantId: formData.get('variantId') || undefined,
    quantity: formData.get('quantity'),
    reason: formData.get('reason'),
    unitPriceKes: formData.get('unitPriceKes') || undefined,
    counterparty: formData.get('counterparty') || undefined,
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const result = await recordStockOut({ ...parsed.data, createdById: admin.id })

  revalidatePath('/admin/inventory')
  revalidatePath('/admin')
  return result
}
