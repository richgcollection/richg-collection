'use client'

import { useState, useTransition } from 'react'
import { deleteProductAction } from '@/lib/actions/admin-products'

export function ProductDeleteButton({ productId }: { productId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Delete this product? This cannot be undone.')) return
    setError(null)
    startTransition(async () => {
      const result = await deleteProductAction(productId)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={isPending}
        onClick={handleDelete}
        className="text-xs opacity-60 hover:opacity-100 disabled:opacity-30"
      >
        Delete
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
