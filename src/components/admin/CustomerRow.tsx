'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

export type CustomerPurchase = {
  key: string
  productName: string
  variantLabel: string | null
  quantity: number | null
  amount: string | null
  /** Pre-formatted on the server in store time. */
  purchasedAt: string
  channel: string
  orderId: string | null
  orderNumber: string | null
  paymentStatus: string | null
}

export function CustomerRow({
  cells,
  purchases,
  columnCount,
}: {
  cells: ReactNode
  purchases: CustomerPurchase[]
  columnCount: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <tbody className="border-b border-black/5 dark:border-white/5">
      <tr>
        <td className="py-3 pr-2 align-top">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide purchases' : 'Show purchases'}
            className="rounded px-1 text-xs opacity-60 hover:opacity-100"
          >
            {open ? '▾' : '▸'}
          </button>
        </td>
        {cells}
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={columnCount - 1} className="pb-4">
            {purchases.length === 0 ? (
              <p className="py-2 text-xs opacity-60">No purchases recorded.</p>
            ) : (
              <table className="w-full rounded-md bg-surface text-xs">
                <thead>
                  <tr className="text-left opacity-60">
                    <th className="p-2">Date &amp; time</th>
                    <th className="p-2">Product</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2">Amount</th>
                    <th className="p-2">Channel</th>
                    <th className="p-2">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.key} className="border-t border-black/5 dark:border-white/5">
                      <td className="p-2 whitespace-nowrap">{p.purchasedAt}</td>
                      <td className="p-2">
                        {p.productName}
                        {p.variantLabel && <span className="opacity-60"> ({p.variantLabel})</span>}
                      </td>
                      <td className="p-2">{p.quantity ?? '—'}</td>
                      <td className="p-2">{p.amount ?? '—'}</td>
                      <td className="p-2">{p.channel}</td>
                      <td className="p-2">
                        {p.orderId ? (
                          <Link href={`/admin/orders/${p.orderId}`} className="underline hover:opacity-70">
                            {p.orderNumber}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {p.paymentStatus && <span className="ml-1 opacity-60">· {p.paymentStatus}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </tbody>
  )
}
