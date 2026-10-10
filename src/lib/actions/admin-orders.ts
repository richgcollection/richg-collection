'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { markOrderPaid } from '@/lib/orders'
import { syncAffiliateCommissions } from '@/lib/affiliates'
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
  // Cancel/refund/fail voids affiliate commission; COMPLETED approves it.
  await prisma.$transaction((tx) => syncAffiliateCommissions(tx, parsed.data.orderId))

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

const deleteSchema = z.object({
  orderId: z.string().min(1),
  /** `restore` deletes the order's stock movements and puts the units back; `keep` leaves them in the ledger, unlinked. */
  mode: z.enum(['restore', 'keep']),
  /** The linked movement ids the admin saw in the confirm dialog, so a payment landing in between can't change what gets done. */
  expectedMovementIds: z.array(z.string()),
  /** Set when deleting from the order's own page, which no longer exists afterwards. */
  redirectToList: z.boolean().optional(),
})

class OrderGoneError extends Error {}
class OrderChangedError extends Error {}

/**
 * Permanently deletes an order with its items and status history. Stock that
 * the order deducted (its linked StockMovements) is either restored — the
 * movements are deleted and the stored stockQty counters incremented back, so
 * analytics no longer count the sale — or kept, in which case the movements
 * stay in the ledger with orderId cleared and a note naming the order.
 */
export async function deleteOrderAction(input: z.input<typeof deleteSchema>): Promise<ActionResult> {
  await requireAdmin()

  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid request.' }
  const { orderId, mode, expectedMovementIds, redirectToList } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      // Row-locks the order so a concurrent delete (double submit) or markOrderPaid waits for this one.
      const { count } = await tx.order.updateMany({ where: { id: orderId }, data: { updatedAt: new Date() } })
      if (count === 0) throw new OrderGoneError()

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { orderNumber: true, customerId: true, totalKes: true },
      })
      const movements = await tx.stockMovement.findMany({
        where: { orderId },
        select: { id: true, productId: true, variantId: true, direction: true, quantity: true, note: true },
      })

      const expected = new Set(expectedMovementIds)
      if (movements.length !== expected.size || movements.some((m) => !expected.has(m.id))) {
        throw new OrderChangedError()
      }

      if (mode === 'restore') {
        for (const m of movements) {
          const delta = m.direction === 'OUT' ? { increment: m.quantity } : { decrement: m.quantity }
          if (m.variantId) {
            await tx.productVariant.update({ where: { id: m.variantId }, data: { stockQty: delta } })
          } else {
            await tx.product.update({ where: { id: m.productId }, data: { stockQty: delta } })
          }
        }
        await tx.stockMovement.deleteMany({ where: { orderId } })
      } else {
        const marker = `Order ${order.orderNumber} was deleted; stock kept as sold.`
        for (const m of movements) {
          await tx.stockMovement.update({
            where: { id: m.id },
            data: { orderId: null, note: m.note ? `${m.note}\n${marker}` : marker },
          })
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId } })
      await tx.orderStatusEvent.deleteMany({ where: { orderId } })
      await tx.order.delete({ where: { id: orderId } })

      if (order.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { totalOrders: true, totalSpentKes: true },
        })
        if (customer) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              totalOrders: Math.max(0, customer.totalOrders - 1),
              totalSpentKes: Math.max(0, customer.totalSpentKes - order.totalKes),
            },
          })
        }
      }
    })
  } catch (err) {
    if (err instanceof OrderChangedError) {
      return { success: false, error: 'This order’s stock changed since you opened it. Reload the page and try again.' }
    }
    // Already gone (e.g. a double submit): the earlier request did the work, so report success.
    if (!(err instanceof OrderGoneError)) throw err
  }

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/inventory')
  revalidatePath('/admin/analytics')
  revalidatePath('/admin/customers')
  revalidatePath('/admin')
  if (redirectToList) redirect('/admin/orders')
  return { success: true }
}
