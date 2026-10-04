'use client'

import { useState, useTransition } from 'react'
import { recordStockInAction, recordStockOutAction } from '@/lib/actions/admin-inventory'
import { todayInStoreTz } from '@/lib/dates'
import { ProductMultiSelect } from '@/components/admin/ProductMultiSelect'

export type InventoryProductOption = {
  id: string
  name: string
  variants: { id: string; label: string }[]
}

export type InventoryCustomerOption = {
  id: string
  name: string
  phone: string | null
}

const OUT_REASONS = [
  { value: 'MANUAL_SALE', label: 'Manual / In-Person Sale' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'REWARD', label: 'Reward' },
  { value: 'INFLUENCER', label: 'Influencer Gifting' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
]

const inputClass = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

type OutLine = {
  key: string
  productId: string
  variantId: string
  quantity: string
  unitPriceKes: string
  discountKes: string
}

let outLineSeq = 0
function newOutLine(productId: string): OutLine {
  outLineSeq += 1
  return { key: `line-${outLineSeq}`, productId, variantId: '', quantity: '', unitPriceKes: '', discountKes: '' }
}

export function StockMovementForms({
  products,
  customers,
}: {
  products: InventoryProductOption[]
  customers: InventoryCustomerOption[]
}) {
  const [today] = useState(() => todayInStoreTz())
  const [inProductId, setInProductId] = useState('')
  const [outLines, setOutLines] = useState<OutLine[]>([])
  const [inError, setInError] = useState<string | null>(null)
  const [outError, setOutError] = useState<string | null>(null)
  const [inSuccess, setInSuccess] = useState(false)
  const [outSuccess, setOutSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const productsById = new Map(products.map((p) => [p.id, p]))
  const inVariants = productsById.get(inProductId)?.variants ?? []
  const outProductIds = [...new Set(outLines.map((l) => l.productId))]
  const outTotals = outLines.reduce(
    (t, l) => {
      const gross = (Number(l.unitPriceKes) || 0) * (Number(l.quantity) || 0)
      const discount = Number(l.discountKes) || 0
      return { gross: t.gross + gross, discount: t.discount + discount }
    },
    { gross: 0, discount: 0 },
  )

  function setOutProducts(ids: string[]) {
    setOutLines((lines) => {
      const kept = lines.filter((l) => ids.includes(l.productId))
      const added = ids.filter((id) => !kept.some((l) => l.productId === id)).map(newOutLine)
      return [...kept, ...added]
    })
  }

  function updateOutLine(key: string, patch: Partial<OutLine>) {
    setOutLines((lines) => lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addOutLineFor(productId: string, afterKey: string) {
    setOutLines((lines) => {
      const index = lines.findIndex((l) => l.key === afterKey)
      return [...lines.slice(0, index + 1), newOutLine(productId), ...lines.slice(index + 1)]
    })
  }

  function removeOutLine(key: string) {
    setOutLines((lines) => lines.filter((l) => l.key !== key))
  }

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
    if (outLines.length === 0) {
      setOutError('Select at least one product.')
      return
    }
    formData.set(
      'items',
      JSON.stringify(
        outLines.map(({ productId, variantId, quantity, unitPriceKes, discountKes }) => ({
          productId,
          variantId,
          quantity,
          unitPriceKes,
          discountKes,
        })),
      ),
    )
    startTransition(async () => {
      const result = await recordStockOutAction(formData)
      if (result.success) {
        setOutLines([])
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
          <ProductMultiSelect
            options={products}
            selectedIds={outProductIds}
            onChange={setOutProducts}
            placeholder="Search and select products…"
          />
          {outLines.length > 0 && (
            <ul className="flex flex-col gap-3">
              {outLines.map((line) => {
                const product = productsById.get(line.productId)
                const variants = product?.variants ?? []
                return (
                  <li
                    key={line.key}
                    className="flex flex-col gap-2 rounded-md border border-black/5 p-3 dark:border-white/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{product?.name ?? 'Unknown product'}</span>
                      <div className="flex shrink-0 items-center gap-3 text-xs">
                        {variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => addOutLineFor(line.productId, line.key)}
                            className="opacity-60 hover:opacity-100"
                          >
                            + Another size/color
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeOutLine(line.key)}
                          className="text-red-600 opacity-70 hover:opacity-100 dark:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {variants.length > 0 && (
                      <select
                        required
                        value={line.variantId}
                        onChange={(e) => updateOutLine(line.key, { variantId: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Select size/color…</option>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="number"
                        min={1}
                        required
                        placeholder="Quantity"
                        value={line.quantity}
                        onChange={(e) => updateOutLine(line.key, { quantity: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Price per unit (KES, if sale)"
                        value={line.unitPriceKes}
                        onChange={(e) => updateOutLine(line.key, { unitPriceKes: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Discount (KES, line total)"
                        aria-label="Discount given on this line, in KES"
                        value={line.discountKes}
                        onChange={(e) => updateOutLine(line.key, { discountKes: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {outTotals.gross > 0 && (
            <p className="text-sm">
              Total: <span className="font-medium">KES {(outTotals.gross - outTotals.discount).toLocaleString('en-KE')}</span>
              {outTotals.discount > 0 && (
                <span className="opacity-60">
                  {' '}
                  (KES {outTotals.gross.toLocaleString('en-KE')} less KES {outTotals.discount.toLocaleString('en-KE')} discount)
                </span>
              )}
            </p>
          )}
          <select name="reason" required defaultValue="MANUAL_SALE" className={inputClass}>
            {OUT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Date</span>
            <input name="date" type="date" required defaultValue={today} max={today} className={inputClass} />
          </label>
          <input
            name="counterparty"
            list="stock-out-customers"
            autoComplete="off"
            placeholder="Search customer, or type a name (optional)"
            className={inputClass}
          />
          <datalist id="stock-out-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.name}>
                {c.phone ?? ''}
              </option>
            ))}
          </datalist>
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
