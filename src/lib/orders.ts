import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncAffiliateCommissions } from '@/lib/affiliates'
import type { Cart } from '@/lib/cart'
import { upsertCustomerFromOrder } from '@/lib/customers'
import { applyOrderStockOut } from '@/lib/inventory'
import { sendMetaPurchaseEvent } from '@/lib/meta-capi'
import { isStockReturnedStatus } from '@/lib/order-stock'

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
 *
 * If the order was already cancelled/refunded/failed, the payment is recorded
 * but the status, stock and Meta event are left alone: reactivating the order
 * from the admin deducts stock then.
 */
export async function markOrderPaid(orderId: string, createdById?: string): Promise<boolean> {
  const outcome = await prisma.$transaction(async (tx) => {
    // Also row-locks the order, so this waits for an in-flight status change.
    const { count } = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: { not: 'PAID' } },
      data: { paymentStatus: 'PAID' },
    })
    if (count === 0) return 'already-paid'

    const { status } = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    if (isStockReturnedStatus(status)) {
      await syncAffiliateCommissions(tx, orderId)
      return 'paid-inactive'
    }

    await tx.order.update({ where: { id: orderId }, data: { status: 'PROCESSING' } })
    await tx.orderStatusEvent.create({
      data: { orderId, status: 'PROCESSING', occurredAt: new Date(), createdById },
    })
    await applyOrderStockOut(tx, orderId)
    await syncAffiliateCommissions(tx, orderId)
    return 'paid'
  })

  if (outcome === 'paid') {
    after(() => sendMetaPurchaseEvent(orderId))
  }
  return outcome !== 'already-paid'
}
