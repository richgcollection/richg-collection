'use client'

import { useRef, useState, useTransition } from 'react'
import { deleteOrderAction } from '@/lib/actions/admin-orders'
import { isStockReturnedStatus } from '@/lib/order-stock'
import type { OrderStatus, StockDirection } from '@prisma/client'

export type DeletableOrderItem = {
  productId: string
  variantId: string | null
  nameSnapshot: string
  variantSnapshot: string | null
}

export type DeletableOrderMovement = {
  id: string
  productId: string
  variantId: string | null
  direction: StockDirection
  quantity: number
  product: { name: string }
}

export function OrderDeleteButton({
  orderId,
  orderNumber,
  status,
  items,
  movements,
  redirectToList = false,
  compact = false,
}: {
  orderId: string
  orderNumber: string
  status: OrderStatus
  items: DeletableOrderItem[]
  movements: DeletableOrderMovement[]
  /** Go to the orders list afterwards (when used on the order's own page). */
  redirectToList?: boolean
  compact?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'restore' | 'keep'>('restore')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const hasStock = movements.length > 0

  function label(m: DeletableOrderMovement) {
    const item = items.find((i) => i.productId === m.productId && i.variantId === m.variantId)
    if (!item) return m.product.name
    return item.variantSnapshot ? `${item.nameSnapshot} (${item.variantSnapshot})` : item.nameSnapshot
  }

  function open() {
    setMode('restore')
    setError(null)
    dialogRef.current?.showModal()
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteOrderAction({
        orderId,
        mode,
        expectedMovementIds: movements.map((m) => m.id),
        redirectToList,
      })
      if (result.success) {
        dialogRef.current?.close()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          compact
            ? 'text-xs opacity-60 hover:opacity-100'
            : 'rounded-full border border-red-600/40 px-5 py-2 text-sm font-medium text-red-600 hover:bg-red-600/5 dark:border-red-400/40 dark:text-red-400'
        }
      >
        {compact ? 'Delete' : 'Delete order'}
      </button>
      <dialog
        ref={dialogRef}
        onCancel={(e) => isPending && e.preventDefault()}
        className="m-auto w-full max-w-lg rounded-lg border border-black/10 bg-background p-0 text-foreground backdrop:bg-black/40 dark:border-white/10"
      >
        <div className="p-5 text-left text-sm">
          <h2 className="mb-3 text-sm font-medium tracking-wide uppercase opacity-70">Delete order {orderNumber}</h2>
          <p className="opacity-80">
            The order, its items and status history will be permanently deleted. This cannot be undone.
          </p>

          {hasStock ? (
            <>
              <p className="mt-4 font-medium">This order deducted inventory:</p>
              <ul className="mt-2 flex flex-col gap-1 rounded-md border border-black/10 p-3 dark:border-white/10">
                {movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span>{label(m)}</span>
                    <span className="shrink-0 tabular-nums opacity-70">
                      {m.direction === 'OUT' ? '−' : '+'}
                      {m.quantity}
                    </span>
                  </li>
                ))}
              </ul>

              <fieldset className="mt-4 flex flex-col gap-3" disabled={isPending}>
                <label className="flex gap-3 rounded-md border border-black/10 p-3 dark:border-white/10">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'restore'}
                    onChange={() => setMode('restore')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Delete and restore inventory</span>
                    <span className="mt-1 block text-xs opacity-70">
                      For mistaken or test orders. The units above go back into stock and the sale is removed from
                      the stock ledger, so analytics no longer count it.
                    </span>
                  </span>
                </label>
                <label className="flex gap-3 rounded-md border border-black/10 p-3 dark:border-white/10">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'keep'}
                    onChange={() => setMode('keep')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Delete, keep inventory as is</span>
                    <span className="mt-1 block text-xs opacity-70">
                      For when the goods actually left. Stock stays as it is and the sale stays in the ledger and
                      analytics, no longer linked to an order. If the order was real but cancelled or returned,
                      set its status to Cancelled or Refunded instead: that keeps the order and returns its stock.
                    </span>
                  </span>
                </label>
              </fieldset>
            </>
          ) : (
            <p className="mt-4 rounded-md border border-black/10 p-3 dark:border-white/10">
              {isStockReturnedStatus(status)
                ? `This order’s stock was already returned when it was set to ${status.toLowerCase()}, so no stock changes are needed.`
                : 'This order never deducted inventory (it was not marked as paid), so no stock changes are needed.'}
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-black/10 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending
                ? 'Deleting…'
                : !hasStock
                  ? 'Delete order'
                  : mode === 'restore'
                    ? 'Delete & restore stock'
                    : 'Delete, keep stock'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
