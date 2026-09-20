'use client'

import { useState, useTransition } from 'react'
import { recordStockInAction, recordStockOutAction } from '@/lib/actions/admin-inventory'

export type InventoryProductOption = {
  id: string
  name: string
  variants: { id: string; label: string }[]
}

const OUT_REASONS = [
  { value: 'MANUAL_SALE', label: 'Manual / In-Person Sale' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'REWARD', label: 'Reward' },
  { value: 'INFLUENCER', label: 'Influencer Gifting' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
]

const inputClass = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

export function StockMovementForms({ products }: { products: InventoryProductOption[] }) {
  const [inProductId, setInProductId] = useState('')
  const [outProductId, setOutProductId] = useState('')
  const [inError, setInError] = useState<string | null>(null)
  const [outError, setOutError] = useState<string | null>(null)
  const [inSuccess, setInSuccess] = useState(false)
  const [outSuccess, setOutSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const inVariants = products.find((p) => p.id === inProductId)?.variants ?? []
  const outVariants = products.find((p) => p.id === outProductId)?.variants ?? []

  function handleStockIn(formData: FormData) {
    setInError(null)
    setInSuccess(false)
    startTransition(async () => {
      const result = await recordStockInAction(formData)
      if (result.success) {
        setInSuccess(true)
        setTimeout(() => setInSuccess(false), 3000)
      } else {
        setInError(result.error)
      }
    })
  }

  function handleStockOut(formData: FormData) {
    setOutError(null)
    setOutSuccess(false)
    startTransition(async () => {
      const result = await recordStockOutAction(formData)
      if (result.success) {
        setOutSuccess(true)
        setTimeout(() => setOutSuccess(false), 3000)
      } else {
        setOutError(result.error)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form action={handleStockIn} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="mb-4 text-sm font-medium tracking-wide uppercase opacity-70">Record Stock In (Restock)</h2>
        {inError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{inError}</p>}
        <div className="flex flex-col gap-3">
          <select
            name="productId"
            required
            value={inProductId}
            onChange={(e) => setInProductId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {inVariants.length > 0 && (
            <select name="variantId" required className={inputClass}>
              <option value="">Select size/color…</option>
              {inVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input name="quantity" type="number" min={1} required placeholder="Quantity" className={inputClass} />
            <input name="unitCostKes" type="number" min={0} placeholder="Cost per unit (KES)" className={inputClass} />
          </div>
          <input name="supplier" placeholder="Supplier (optional)" className={inputClass} />
          <input name="note" placeholder="Note (optional)" className={inputClass} />
          <button
            type="submit"
            disabled={isPending}
            className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Record Stock In'}
          </button>
          {inSuccess && <span className="text-sm text-emerald-600 dark:text-emerald-400">Recorded.</span>}
        </div>
      </form>

      <form action={handleStockOut} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="mb-4 text-sm font-medium tracking-wide uppercase opacity-70">Record Stock Out</h2>
        {outError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{outError}</p>}
        <div className="flex flex-col gap-3">
          <select
            name="productId"
            required
            value={outProductId}
            onChange={(e) => setOutProductId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {outVariants.length > 0 && (
            <select name="variantId" required className={inputClass}>
              <option value="">Select size/color…</option>
              {outVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <select name="reason" required defaultValue="MANUAL_SALE" className={inputClass}>
            {OUT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input name="quantity" type="number" min={1} required placeholder="Quantity" className={inputClass} />
            <input
              name="unitPriceKes"
              type="number"
              min={0}
              placeholder="Price per unit (KES, if sale)"
              className={inputClass}
            />
          </div>
          <input name="counterparty" placeholder="Customer / influencer (optional)" className={inputClass} />
          <input name="note" placeholder="Note (optional)" className={inputClass} />
          <button
            type="submit"
            disabled={isPending}
            className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Record Stock Out'}
          </button>
          {outSuccess && <span className="text-sm text-emerald-600 dark:text-emerald-400">Recorded.</span>}
        </div>
      </form>
    </div>
  )
}
