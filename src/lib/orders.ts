import { prisma } from '@/lib/prisma'
import type { Cart } from '@/lib/cart'

export function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  const suffix = crypto.randomUUID().split('-')[0].toUpperCase()
  return `RGC-${year}-${suffix}`
}

export type ShippingAddressInput = {
  fullName: string
  phone: string
  email: string
  line1: string
  line2?: string
  city: string
  county: string
  postalCode?: string
}

export async function createPendingOrder(
  cart: Cart,
  shippingAddress: ShippingAddressInput,
  shippingKes: number,
) {
  const orderNumber = generateOrderNumber()
  const subtotalKes = cart.subtotalKes
  const totalKes = subtotalKes + shippingKes

  const order = await prisma.order.create({
    data: {
      orderNumber,
      paymentRef: orderNumber,
      guestEmail: shippingAddress.email,
      guestPhone: shippingAddress.phone,
      subtotalKes,
      shippingKes,
      totalKes,
      shippingAddress: { ...shippingAddress },
      items: {
        create: cart.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          nameSnapshot: item.productName,
          variantSnapshot: item.variantLabel,
          unitPriceKes: item.unitPriceKes,
          quantity: item.quantity,
          lineTotalKes: item.lineTotalKes,
        })),
      },
    },
  })

  return order
}
