'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/slug'
import type { ActionResult } from '@/lib/actions/cart'

const productSchema = z.object({
  name: z.string().min(2, 'Name is required.'),
  slug: z.string().min(2, 'Slug is required.'),
  sku: z.string().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  basePriceKes: z.coerce.number().int().min(0),
  salePriceKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  costPriceKes: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  supplier: z.string().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(['published', 'draft']),
  featured: z.coerce.boolean(),
  manageStock: z.coerce.boolean(),
  stockQty: z.coerce.number().int().min(0).default(0),
})

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || slugify(String(formData.get('name') ?? '')),
    sku: formData.get('sku') || undefined,
    shortDescription: formData.get('shortDescription') || undefined,
    description: formData.get('description') || undefined,
    basePriceKes: formData.get('basePriceKes'),
    salePriceKes: formData.get('salePriceKes') || undefined,
    costPriceKes: formData.get('costPriceKes') || undefined,
    supplier: formData.get('supplier') || undefined,
    lowStockThreshold: formData.get('lowStockThreshold') || undefined,
    status: formData.get('status'),
    featured: formData.get('featured') === 'on',
    manageStock: formData.get('manageStock') === 'on',
    stockQty: formData.get('stockQty') || 0,
  })
}

const MAX_PRODUCT_IMAGES = 5

function parseImageUrls(formData: FormData): string[] {
  return formData
    .getAll('imageUrls')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, MAX_PRODUCT_IMAGES)
}

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

function parseSizes(formData: FormData): string[] {
  return parseCsvList(String(formData.get('sizes') ?? ''))
}

function parseColors(formData: FormData): string[] {
  return parseCsvList(String(formData.get('colors') ?? ''))
}

async function syncCategories(productId: string, categoryIds: string[]) {
  await prisma.productCategory.deleteMany({ where: { productId } })
  if (categoryIds.length > 0) {
    await prisma.productCategory.createMany({
      data: categoryIds.map((categoryId) => ({ productId, categoryId })),
    })
  }
}

async function syncImages(productId: string, urls: string[]) {
  await prisma.productImage.deleteMany({ where: { productId } })
  if (urls.length > 0) {
    await prisma.productImage.createMany({
      data: urls.map((url, position) => ({ productId, url, position })),
    })
  }
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

/**
 * Adds any Size/Color combination not already present as a variant. Colors
 * are optional — with sizes only (or colors only) this behaves like a single
 * option dimension; with both, it creates the full Size×Color cartesian set.
 * Never removes existing combinations — see removeVariantAction.
 */
async function syncSizes(productId: string, sizes: string[], colors: string[], defaultStockPerSize: number) {
  if (sizes.length === 0 && colors.length === 0) return

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

  for (const sizeValue of sizeValues) {
    for (const colorValue of colorValues) {
      const optionValueIds = [sizeValue?.id, colorValue?.id].filter((v): v is string => Boolean(v))
      if (optionValueIds.length === 0) continue

      const comboKey = [...optionValueIds].sort().join('|')
      if (existingCombos.has(comboKey)) continue

      await prisma.productVariant.create({
        data: {
          productId,
          stockQty: defaultStockPerSize,
          optionValues: { create: optionValueIds.map((optionValueId) => ({ optionValueId })) },
        },
      })
      existingCombos.add(comboKey)
    }
  }
}

export type ProductActionResult = ActionResult & { warning?: string }

export async function createProductAction(formData: FormData): Promise<ProductActionResult> {
  await requireAdmin()

  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const existingSlug = await prisma.product.findUnique({ where: { slug: parsed.data.slug } })
  if (existingSlug) {
    return { success: false, error: 'That slug is already in use.' }
  }

  const product = await prisma.product.create({ data: parsed.data })

  const categoryIds = formData.getAll('categoryIds').map(String)
  await syncCategories(product.id, categoryIds)
  await syncImages(product.id, parseImageUrls(formData))

  const sizes = parseSizes(formData)
  const colors = parseColors(formData)
  const defaultStock = Number(formData.get('defaultStockPerSize') ?? 0)
  await syncSizes(product.id, sizes, colors, defaultStock)

  revalidatePath('/admin/products')
  redirect(`/admin/products/${product.id}/edit`)
}

export async function updateProductAction(productId: string, formData: FormData): Promise<ProductActionResult> {
  await requireAdmin()

  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const existingSlug = await prisma.product.findFirst({
    where: { slug: parsed.data.slug, NOT: { id: productId } },
  })
  if (existingSlug) {
    return { success: false, error: 'That slug is already in use.' }
  }

  await prisma.product.update({ where: { id: productId }, data: parsed.data })

  const categoryIds = formData.getAll('categoryIds').map(String)
  await syncCategories(productId, categoryIds)
  await syncImages(productId, parseImageUrls(formData))

  const sizes = parseSizes(formData)
  const colors = parseColors(formData)
  const defaultStock = Number(formData.get('defaultStockPerSize') ?? 0)
  await syncSizes(productId, sizes, colors, defaultStock)

  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${productId}/edit`)
  return { success: true }
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  await requireAdmin()

  const orderItemCount = await prisma.orderItem.count({ where: { productId } })
  if (orderItemCount > 0) {
    return { success: false, error: 'Cannot delete: this product has existing orders.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { productId } })
    const variants = await tx.productVariant.findMany({ where: { productId }, select: { id: true } })
    await tx.variantOptionValue.deleteMany({ where: { variantId: { in: variants.map((v) => v.id) } } })
    await tx.productVariant.deleteMany({ where: { productId } })
    const options = await tx.productOption.findMany({ where: { productId }, select: { id: true } })
    await tx.productOptionValue.deleteMany({ where: { optionId: { in: options.map((o) => o.id) } } })
    await tx.productOption.deleteMany({ where: { productId } })
    await tx.productImage.deleteMany({ where: { productId } })
    await tx.productCategory.deleteMany({ where: { productId } })
    await tx.product.delete({ where: { id: productId } })
  })

  revalidatePath('/admin/products')
  return { success: true }
}

export async function updateVariantAction(
  variantId: string,
  data: { stockQty: number; priceKes?: number | null },
): Promise<ActionResult> {
  await requireAdmin()

  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stockQty: data.stockQty, priceKes: data.priceKes ?? null },
  })

  revalidatePath('/admin/products')
  return { success: true }
}

export async function removeVariantAction(variantId: string): Promise<ActionResult> {
  await requireAdmin()

  const orderItemCount = await prisma.orderItem.count({ where: { variantId } })
  if (orderItemCount > 0) {
    return { success: false, error: 'Cannot remove: this option is part of an existing order.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { variantId } })
    await tx.variantOptionValue.deleteMany({ where: { variantId } })
    await tx.productVariant.delete({ where: { id: variantId } })
  })

  revalidatePath('/admin/products')
  return { success: true }
}
