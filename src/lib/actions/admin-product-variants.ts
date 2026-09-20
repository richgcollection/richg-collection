'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { VariantRow } from '@/components/admin/VariantStockEditor'

type AddSizesResult = { success: true; data: VariantRow[] } | { success: false; error: string }

function parseCsvList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}

async function getOrCreateOption(productId: string, name: string) {
  const existing = await prisma.productOption.findFirst({ where: { productId, name }, include: { values: true } })
  return existing ?? prisma.productOption.create({ data: { productId, name }, include: { values: true } })
}

async function getOrCreateOptionValue(option: { id: string; values: { id: string; value: string }[] }, value: string) {
  const existing = option.values.find((v) => v.value === value)
  if (existing) return existing
  const created = await prisma.productOptionValue.create({ data: { optionId: option.id, value } })
  option.values.push(created)
  return created
}

/** Adds any Size/Color combination not already present as a variant. Colors are optional. */
export async function addSizesAction(
  productId: string,
  sizesCsv: string,
  defaultStock: number,
  colorsCsv = '',
): Promise<AddSizesResult> {
  await requireAdmin()

  const sizes = parseCsvList(sizesCsv)
  const colors = parseCsvList(colorsCsv)
  if (sizes.length === 0 && colors.length === 0) {
    return { success: false, error: 'Enter at least one size or color.' }
  }

  const existingVariants = await prisma.productVariant.findMany({
    where: { productId },
    select: { optionValues: { select: { optionValueId: true } } },
  })
  const existingCombos = new Set(
    existingVariants.map((v) => v.optionValues.map((ov) => ov.optionValueId).sort().join('|')),
  )

  const sizeOption = sizes.length > 0 ? await getOrCreateOption(productId, 'Size') : null
  const colorOption = colors.length > 0 ? await getOrCreateOption(productId, 'Color') : null

  const sizeValues = sizeOption ? await Promise.all(sizes.map((s) => getOrCreateOptionValue(sizeOption, s))) : [null]
  const colorValues = colorOption
    ? await Promise.all(colors.map((c) => getOrCreateOptionValue(colorOption, c)))
    : [null]

  const created: VariantRow[] = []
  for (const sizeValue of sizeValues) {
    for (const colorValue of colorValues) {
      const optionValueIds = [sizeValue?.id, colorValue?.id].filter((v): v is string => Boolean(v))
      if (optionValueIds.length === 0) continue

      const comboKey = [...optionValueIds].sort().join('|')
      if (existingCombos.has(comboKey)) continue
      existingCombos.add(comboKey)

      const variant = await prisma.productVariant.create({
        data: {
          productId,
          stockQty: defaultStock,
          optionValues: { create: optionValueIds.map((optionValueId) => ({ optionValueId })) },
        },
      })
      const label = [sizeValue?.value, colorValue?.value].filter(Boolean).join(' / ')
      created.push({ id: variant.id, sizeLabel: label, stockQty: variant.stockQty, priceKes: variant.priceKes })
    }
  }

  if (created.length === 0) {
    return { success: false, error: 'Those combinations already exist.' }
  }

  revalidatePath(`/admin/products/${productId}/edit`)
  return { success: true, data: created }
}
