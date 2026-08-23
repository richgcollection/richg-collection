'use client'

import { useTransition } from 'react'
import { markOrderPaidAction, updateOrderStatusAction } from '@/lib/actions/admin-orders'
import type { OrderStatus, PaymentStatus } from '@prisma/client'

const STATUS_OPTIONS: OrderStatus[] = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
]

export function OrderActions({
  orderId,
  status,
  paymentStatus,
}: {
  orderId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
}) {
  const [isPending, startTransition] = useTransition()

  function handleStatusChange(newStatus: string) {
    const formData = new FormData()
    formData.set('orderId', orderId)
    formData.set('status', newStatus)
    startTransition(async () => {
      await updateOrderStatusAction(formData)
    })
  }

  function handleMarkPaid() {
    startTransition(async () => {
      await markOrderPaidAction(orderId)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Fulfillment Status
        </label>
        <select
          defaultValue={status}
          disabled={isPending}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {paymentStatus !== 'PAID' && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleMarkPaid}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? 'Updating…' : 'Mark as Paid (manual)'}
        </button>
      )}
    </div>
  )
}
