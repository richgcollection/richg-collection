'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentCartId, getOrCreateCartId } from '@/lib/cart'
import { prisma } from '@/lib/prisma'

const addToCartSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
})

export type ActionResult = { success: true } | { success: false; error: string }

export async function addToCartAction(input: {
  productId: string
  variantId?: string
  quantity?: number
}): Promise<ActionResult> {
  const parsed = addToCartSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid item.' }
  }
  const { productId, variantId, quantity } = parsed.data

  if (variantId) {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } })
    if (!variant || variant.stockQty < quantity) {
      return { success: false, error: 'That option is out of stock.' }
    }
  }

  const cartId = await getOrCreateCartId()

  // Not using Prisma's upsert here: Postgres treats NULL as distinct in unique
  // constraints, so ON CONFLICT never matches existing rows where variantId
  // is NULL (non-variant products), silently creating duplicate line items.
  const existing = await prisma.cartItem.findFirst({
    where: { cartId, productId, variantId: variantId ?? null },
  })

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
    })
  } else {
    await prisma.cartItem.create({ data: { cartId, productId, variantId, quantity } })
  }

  revalidatePath('/cart')
  return { success: true }
}

export async function updateCartItemAction(itemId: string, quantity: number): Promise<ActionResult> {
  const cartId = await getCurrentCartId()
  if (!cartId) return { success: false, error: 'Cart not found.' }

  if (quantity < 1) {
    await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } })
  } else {
    await prisma.cartItem.updateMany({ where: { id: itemId, cartId }, data: { quantity } })
  }

  revalidatePath('/cart')
  return { success: true }
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult> {
  const cartId = await getCurrentCartId()
  if (!cartId) return { success: false, error: 'Cart not found.' }

  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } })
  revalidatePath('/cart')
  return { success: true }
}
