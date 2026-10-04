'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { markOrderPaid } from '@/lib/orders'
import { parseStoreDateTime } from '@/lib/dates'
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
  /** Store-local `YYYY-MM-DDTHH:mm` for when the change actually happened (e.g. delivery). Omitted → now. */
  occurredAt: z.string().optional(),
})

export async function updateOrderStatusAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()

  const parsed = statusSchema.safeParse({
    orderId: formData.get('orderId'),
    status: formData.get('status'),
    occurredAt: formData.get('occurredAt') || undefined,
  })
  if (!parsed.success) {
    return { success: false, error: 'Invalid status update.' }
  }

  let occurredAt = new Date()
  if (parsed.data.occurredAt) {
    const date = parseStoreDateTime(parsed.data.occurredAt)
    if (!date) return { success: false, error: 'Enter a valid date and time.' }
    if (date.getTime() > Date.now()) return { success: false, error: 'Date cannot be in the future.' }
    occurredAt = date
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: parsed.data.orderId },
      data: { status: parsed.data.status },
    }),
    prisma.orderStatusEvent.create({
      data: {
        orderId: parsed.data.orderId,
        status: parsed.data.status,
        occurredAt,
        createdById: admin.id,
      },
    }),
  ])

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
  const admin = await requireAdmin()

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found.' }
  if (order.paymentStatus === 'PAID') return { success: false, error: 'Already marked as paid.' }

  if (!(await markOrderPaid(orderId, admin.id))) {
    return { success: false, error: 'Already marked as paid.' }
  }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
