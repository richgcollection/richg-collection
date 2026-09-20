'use client'

import { useState, useTransition } from 'react'
import { updateOrderStatusAction } from '@/lib/actions/admin-orders'
import type { OrderStatus } from '@prisma/client'

const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'FAILED']

export function OrderStatusSelect({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [value, setValue] = useState(status)
  const [isPending, startTransition] = useTransition()

  function handleChange(newStatus: OrderStatus) {
    setValue(newStatus)
    const formData = new FormData()
    formData.set('orderId', orderId)
    formData.set('status', newStatus)
    startTransition(async () => {
      await updateOrderStatusAction(formData)
    })
  }

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value as OrderStatus)}
      className="rounded-full border border-black/10 bg-surface px-2 py-1 text-xs font-medium tracking-wide uppercase disabled:opacity-50 dark:border-white/10"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
