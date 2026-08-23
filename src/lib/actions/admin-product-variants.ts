'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { VariantRow } from '@/components/admin/VariantStockEditor'

type AddSizesResult = { success: true; data: VariantRow[] } | { success: false; error: string }

export async function addSizesAction(
  productId: string,
  sizesCsv: string,
  defaultStock: number,
): Promise<AddSizesResult> {
  await requireAdmin()

  const sizes = Array.from(
    new Set(
      sizesCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
  if (sizes.length === 0) {
    return { success: false, error: 'Enter at least one size.' }
  }

  let sizeOption = await prisma.productOption.findFirst({
    where: { productId, name: 'Size' },
    include: { values: true },
  })
  if (!sizeOption) {
    sizeOption = await prisma.productOption.create({
      data: { productId, name: 'Size' },
      include: { values: true },
    })
  }

  const existing = new Set(sizeOption.values.map((v) => v.value))
  const newSizes = sizes.filter((s) => !existing.has(s))
  if (newSizes.length === 0) {
    return { success: false, error: 'Those sizes already exist.' }
  }

  const created: VariantRow[] = []
  for (const size of newSizes) {
    const optionValue = await prisma.productOptionValue.create({
      data: { optionId: sizeOption.id, value: size },
    })
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        stockQty: defaultStock,
        optionValues: { create: { optionValueId: optionValue.id } },
      },
    })
    created.push({ id: variant.id, sizeLabel: size, stockQty: variant.stockQty, priceKes: variant.priceKes })
  }

  revalidatePath(`/admin/products/${productId}/edit`)
  return { success: true, data: created }
}
