import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Cart } from '@/lib/cart'
import { upsertCustomerFromOrder } from '@/lib/customers'
import { applyOrderStockOut } from '@/lib/inventory'
import { sendMetaPurchaseEvent } from '@/lib/meta-capi'

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
  town: string
}

export async function createPendingOrder(
  cart: Cart,
  shippingAddress: ShippingAddressInput,
  shippingKes: number,
) {
  const orderNumber = generateOrderNumber()
  const subtotalKes = cart.subtotalKes
  const totalKes = subtotalKes + shippingKes

  const customer = await upsertCustomerFromOrder({
    fullName: shippingAddress.fullName,
    phone: shippingAddress.phone,
    email: shippingAddress.email,
    town: shippingAddress.town,
    productName: cart.items.map((item) => item.productName).join(', '),
    quantity: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    orderValueKes: totalKes,
  })

  return prisma.order.create({
    data: {
      orderNumber,
      customerId: customer?.id,
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
}

/**
 * Marks an order paid, records the PROCESSING status event and deducts stock,
 * then reports the Purchase to Meta. Shared by the Paystack webhook, the
 * checkout success page (which can confirm payment before the webhook lands)
 * and the admin "mark as paid" action. Returns false if the order was already
 * paid — the conditional update makes concurrent callers safe, so stock is
 * only ever deducted once.
 */
export async function markOrderPaid(orderId: string, createdById?: string): Promise<boolean> {
  const transitioned = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: { not: 'PAID' } },
      data: { paymentStatus: 'PAID', status: 'PROCESSING' },
    })
    if (count === 0) return false

    await tx.orderStatusEvent.create({
      data: { orderId, status: 'PROCESSING', occurredAt: new Date(), createdById },
    })
    await applyOrderStockOut(tx, orderId)
    return true
  })

  if (transitioned) {
    after(() => sendMetaPurchaseEvent(orderId))
  }
  return transitioned
}
