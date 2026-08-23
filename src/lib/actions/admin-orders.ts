'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/lib/actions/cart'

const FULFILLMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
] as const

const statusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(FULFILLMENT_STATUSES),
})

export async function updateOrderStatusAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin()

  const parsed = statusSchema.safeParse({
    orderId: formData.get('orderId'),
    status: formData.get('status'),
  })
  if (!parsed.success) {
    return { success: false, error: 'Invalid status update.' }
  }

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { status: parsed.data.status },
  })

  revalidatePath(`/admin/orders/${parsed.data.orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}

/**
 * For orders placed before Paystack is live (or paid via an offline method
 * like M-Pesa till/bank transfer). Mirrors what the Paystack webhook does on
 * `charge.success`: marks payment received and decrements stock. Guarded
 * against double-processing the same order twice.
 */
export async function markOrderPaidAction(orderId: string): Promise<ActionResult> {
  await requireAdmin()

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found.' }
  if (order.paymentStatus === 'PAID') return { success: false, error: 'Already marked as paid.' }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', status: 'PROCESSING' },
    })

    const items = await tx.orderItem.findMany({ where: { orderId } })
    for (const item of items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { decrement: item.quantity } },
        })
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.quantity } },
        })
      }
    }
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
