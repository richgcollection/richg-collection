'use client'

import { useState, useTransition } from 'react'
import { markOrderPaidAction, updateOrderStatusAction } from '@/lib/actions/admin-orders'
import { nowInStoreTzForInput } from '@/lib/dates'
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

const inputClass = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

export function OrderActions({
  orderId,
  status,
  paymentStatus,
}: {
  orderId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
}) {
  const [selectedStatus, setSelectedStatus] = useState(status)
  const [occurredAt, setOccurredAt] = useState(() => nowInStoreTzForInput())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleStatusSave() {
    setError(null)
    setSaved(false)
    const formData = new FormData()
    formData.set('orderId', orderId)
    formData.set('status', selectedStatus)
    formData.set('occurredAt', occurredAt)
    startTransition(async () => {
      const result = await updateOrderStatusAction(formData)
      if (result.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setError(result.error)
      }
    })
  }

  function handleMarkPaid() {
    startTransition(async () => {
      await markOrderPaidAction(orderId)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide uppercase opacity-70">Fulfillment Status</span>
          <select
            value={selectedStatus}
            disabled={isPending}
            onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide uppercase opacity-70">Date &amp; time of change</span>
          <input
            type="datetime-local"
            required
            value={occurredAt}
            disabled={isPending}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isPending || !occurredAt}
            onClick={handleStatusSave}
            className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save Status'}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span>}
        </div>
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
