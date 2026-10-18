'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin, requireAdminRole } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { markOrderPaid } from '@/lib/orders'
import { applyOrderStockOut, restoreOrderStock } from '@/lib/inventory'
import { isStockReturnedStatus } from '@/lib/order-stock'
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

  const { orderId, status } = parsed.data
  const found = await prisma.$transaction(async (tx) => {
    // Row-locks the order so the Paystack webhook (markOrderPaid) can't deduct stock mid-change.
    const { count } = await tx.order.updateMany({ where: { id: orderId }, data: { updatedAt: new Date() } })
    if (count === 0) return false

    const current = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, paymentStatus: true },
    })
    await tx.order.update({ where: { id: orderId }, data: { status } })
    await tx.orderStatusEvent.create({
      data: { orderId, status, occurredAt, createdById: admin.id },
    })

    // Cancelled/refunded/failed orders hold no stock; reactivating a paid one deducts it again.
    const wasReturned = isStockReturnedStatus(current.status)
    const isReturned = isStockReturnedStatus(status)
    if (!wasReturned && isReturned) {
      await restoreOrderStock(tx, orderId)
    } else if (wasReturned && !isReturned && current.paymentStatus === 'PAID') {
      await applyOrderStockOut(tx, orderId)
    }
    return true
  })
  if (!found) return { success: false, error: 'Order not found.' }

  // Cancel/refund/fail voids affiliate commission; COMPLETED approves it.
  await prisma.$transaction((tx) => syncAffiliateCommissions(tx, orderId))

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin/inventory')
  revalidatePath('/admin/analytics')
  revalidatePath('/admin')
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
  if (!(await requireAdminRole())) return { success: false, error: 'Only an admin can delete orders.' }

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
        select: { id: true, note: true },
      })

      const expected = new Set(expectedMovementIds)
      if (movements.length !== expected.size || movements.some((m) => !expected.has(m.id))) {
        throw new OrderChangedError()
      }

      if (mode === 'restore') {
        await restoreOrderStock(tx, orderId)
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
