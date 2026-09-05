'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  deleteShippingRateAction,
  updateShippingRateAmountAction,
  upsertShippingRateAction,
} from '@/lib/actions/admin-shipping-rates'
import { formatKes } from '@/lib/money'

type ShippingRate = { town: string; rateKes: number }

export function ShippingRateManager({ rates }: { rates: ShippingRate[] }) {
  const [state, formAction, isPending] = useActionState(upsertShippingRateAction, undefined)
  const [rows, setRows] = useState(rates)
  const [prevRates, setPrevRates] = useState(rates)
  const [search, setSearch] = useState('')
  const [deletingTown, setDeletingTown] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Re-sync when the server re-provides rates after a revalidatePath (e.g.
  // after the "Add / Update" form below submits and the page refreshes).
  // Adjusted during render (React's recommended pattern for this), not an
  // effect, so it doesn't cause an extra post-commit render pass.
  if (rates !== prevRates) {
    setPrevRates(rates)
    setRows(rates)
  }

  const filtered = rows.filter((r) => r.town.toLowerCase().includes(search.trim().toLowerCase()))

  function handleDelete(town: string) {
    setRowError(null)
    setDeletingTown(town)
    startTransition(async () => {
      const result = await deleteShippingRateAction(town)
      if (result.success) {
        setRows((prev) => prev.filter((r) => r.town !== town))
      } else {
        setRowError(result.error)
      }
      setDeletingTown(null)
    })
  }

  function handleRateChange(town: string, rateKes: number) {
    setRows((prev) => prev.map((r) => (r.town === town ? { ...r, rateKes } : r)))
  }

  function saveRate(town: string, rateKes: number) {
    startTransition(async () => {
      const result = await updateShippingRateAmountAction(town, rateKes)
      if (!result.success) setRowError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex items-end gap-3">
        <div>
          <label htmlFor="town" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            Town
          </label>
          <input
            id="town"
            name="town"
            required
            placeholder="e.g. Nairobi or DEFAULT"
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <div>
          <label htmlFor="rateKes" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            Rate (KES)
          </label>
          <input
            id="rateKes"
            name="rateKes"
            type="number"
            min={0}
            required
            className="w-32 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Add / Update'}
        </button>
      </form>
      {state?.success === false && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {rowError && <p className="text-sm text-red-600 dark:text-red-400">{rowError}</p>}
      <p className="-mt-4 text-xs opacity-60">
        &quot;DEFAULT&quot; is the fallback rate used for any town not listed below. Click a rate to edit it
        directly, it saves when you click away.
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${rows.length} towns…`}
        className="w-full max-w-xs rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />

      <div className="max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2">Town</th>
              <th className="py-2">Rate</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((rate) => (
              <tr key={rate.town} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2">{rate.town}</td>
                <td className="py-2">
                  <input
                    type="number"
                    min={0}
                    value={rate.rateKes}
                    onChange={(e) => handleRateChange(rate.town, Number(e.target.value))}
                    onBlur={(e) => saveRate(rate.town, Number(e.target.value))}
                    className="w-24 rounded-md border border-black/10 bg-transparent px-2 py-1 dark:border-white/10"
                  />
                  <span className="ml-2 opacity-50">{formatKes(rate.rateKes)}</span>
                </td>
                <td className="py-2 text-right">
                  {rate.town !== 'DEFAULT' && (
                    <button
                      type="button"
                      disabled={deletingTown === rate.town}
                      onClick={() => handleDelete(rate.town)}
                      className="text-xs opacity-60 hover:opacity-100 disabled:opacity-30"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center opacity-60">
                  No towns match &quot;{search}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
