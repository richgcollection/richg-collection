import 'server-only'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

const CART_COOKIE = 'cart_session'
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function getOrCreateCartId(): Promise<string> {
  const cookieStore = await cookies()
  const existingSessionId = cookieStore.get(CART_COOKIE)?.value

  if (existingSessionId) {
    const cart = await prisma.cart.findUnique({
      where: { sessionId: existingSessionId },
      select: { id: true },
    })
    if (cart) return cart.id
  }

  const sessionId = crypto.randomUUID()
  const cart = await prisma.cart.create({
    data: { sessionId },
    select: { id: true },
  })

  cookieStore.set(CART_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  })

  return cart.id
}

export async function getCurrentCartId(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(CART_COOKIE)?.value
  if (!sessionId) return null

  const cart = await prisma.cart.findUnique({
    where: { sessionId },
    select: { id: true },
  })
  return cart?.id ?? null
}

function effectiveUnitPriceKes(item: {
  product: { basePriceKes: number; salePriceKes: number | null }
  variant: { priceKes: number | null; salePriceKes: number | null } | null
}): number {
  if (item.variant?.priceKes != null) {
    return item.variant.salePriceKes ?? item.variant.priceKes
  }
  return item.product.salePriceKes ?? item.product.basePriceKes
}

export async function getCart() {
  const cartId = await getCurrentCartId()
  if (!cartId) return { id: null, items: [], subtotalKes: 0, email: null }

  const cartRecord = await prisma.cart.findUnique({ where: { id: cartId }, select: { email: true } })

  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          basePriceKes: true,
          salePriceKes: true,
          images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
      },
      variant: {
        include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
      },
    },
    orderBy: { id: 'asc' },
  })

  const lineItems = items.map((item) => {
    const unitPriceKes = effectiveUnitPriceKes(item)
    const variantLabel = item.variant
      ? item.variant.optionValues
          .map((ov) => `${ov.optionValue.option.name}: ${ov.optionValue.value}`)
          .join(' / ')
      : null
    const stockQty = item.variant ? item.variant.stockQty : null

    return {
      id: item.id,
      productId: item.product.id,
      productSlug: item.product.slug,
      productName: item.product.name,
      imageUrl: item.product.images[0]?.url ?? null,
      variantId: item.variantId,
      variantLabel,
      quantity: item.quantity,
      unitPriceKes,
      lineTotalKes: unitPriceKes * item.quantity,
      stockQty,
    }
  })

  const subtotalKes = lineItems.reduce((sum, item) => sum + item.lineTotalKes, 0)

  return { id: cartId, items: lineItems, subtotalKes, email: cartRecord?.email ?? null }
}

export type Cart = Awaited<ReturnType<typeof getCart>>
