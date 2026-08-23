'use client'

import { useState, useTransition } from 'react'
import { removeVariantAction, updateVariantAction } from '@/lib/actions/admin-products'
import { addSizesAction } from '@/lib/actions/admin-product-variants'

export type VariantRow = {
  id: string
  sizeLabel: string
  stockQty: number
  priceKes: number | null
}

export function VariantStockEditor({ productId, variants }: { productId: string; variants: VariantRow[] }) {
  const [rows, setRows] = useState(variants)
  const [newSizes, setNewSizes] = useState('')
  const [newSizesStock, setNewSizesStock] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveRow(row: VariantRow) {
    startTransition(async () => {
      await updateVariantAction(row.id, { stockQty: row.stockQty, priceKes: row.priceKes })
    })
  }

  function removeRow(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeVariantAction(id)
      if (result.success) {
        setRows((prev) => prev.filter((r) => r.id !== id))
      } else {
        setError(result.error)
      }
    })
  }

  function addSizes() {
    if (!newSizes.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await addSizesAction(productId, newSizes, newSizesStock)
      if (result.success) {
        setRows((prev) => [...prev, ...result.data])
        setNewSizes('')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-4 text-sm font-medium tracking-wide uppercase opacity-70">Size Variants</h2>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2">Size</th>
              <th className="py-2">Stock</th>
              <th className="py-2">Price Override (KES)</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2">{row.sizeLabel}</td>
                <td className="py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.stockQty}
                    disabled={isPending}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, stockQty: Number(e.target.value) } : r)),
                      )
                    }
                    onBlur={() => saveRow(row)}
                    className="w-20 rounded-md border border-black/10 bg-transparent px-2 py-1 dark:border-white/10"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.priceKes ?? ''}
                    disabled={isPending}
                    placeholder="—"
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id
                            ? { ...r, priceKes: e.target.value === '' ? null : Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                    onBlur={() => saveRow(row)}
                    className="w-28 rounded-md border border-black/10 bg-transparent px-2 py-1 dark:border-white/10"
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => removeRow(row.id)}
                    className="text-xs opacity-60 hover:opacity-100"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm opacity-60">No size variants yet — this product uses the plain stock quantity above.</p>
      )}

      <div className="mt-4 flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            Add Sizes
          </label>
          <input
            value={newSizes}
            onChange={(e) => setNewSizes(e.target.value)}
            placeholder="e.g. XXL, XXXL"
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            Stock Each
          </label>
          <input
            type="number"
            min={0}
            value={newSizesStock}
            onChange={(e) => setNewSizesStock(Number(e.target.value))}
            className="w-24 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={addSizes}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  )
}
