'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTransition } from 'react'
import { removeCartItemAction, updateCartItemAction } from '@/lib/actions/cart'
import { formatKes } from '@/lib/money'
import type { Cart } from '@/lib/cart'

export function CartLineItem({ item }: { item: Cart['items'][number] }) {
  const [isPending, startTransition] = useTransition()

  function updateQuantity(quantity: number) {
    startTransition(async () => {
      await updateCartItemAction(item.id, quantity)
    })
  }

  function remove() {
    startTransition(async () => {
      await removeCartItemAction(item.id)
    })
  }

  return (
    <div className={`flex gap-4 py-6 ${isPending ? 'opacity-50' : ''}`}>
      <Link href={`/product/${item.productSlug}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
        {item.imageUrl && (
          <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/product/${item.productSlug}`} className="text-sm font-medium hover:opacity-70">
              {item.productName}
            </Link>
            {item.variantLabel && <p className="text-xs opacity-60">{item.variantLabel}</p>}
          </div>
          <span className="text-sm font-medium">{formatKes(item.lineTotalKes)}</span>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-black/10 dark:border-white/10">
            <button
              type="button"
              disabled={isPending}
              onClick={() => updateQuantity(item.quantity - 1)}
              className="px-3 py-1 text-sm"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="min-w-[1.5rem] text-center text-sm">{item.quantity}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => updateQuantity(item.quantity + 1)}
              className="px-3 py-1 text-sm"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={remove}
            className="text-xs opacity-60 hover:opacity-100"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
