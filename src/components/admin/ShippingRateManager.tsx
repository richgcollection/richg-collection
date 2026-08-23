'use client'

import { useActionState, useState, useTransition } from 'react'
import { deleteShippingRateAction, upsertShippingRateAction } from '@/lib/actions/admin-shipping-rates'
import { formatKes } from '@/lib/money'

type ShippingRate = { county: string; rateKes: number }

export function ShippingRateManager({ rates }: { rates: ShippingRate[] }) {
  const [state, formAction, isPending] = useActionState(upsertShippingRateAction, undefined)
  const [deletingCounty, setDeletingCounty] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(county: string) {
    setDeleteError(null)
    setDeletingCounty(county)
    startTransition(async () => {
      const result = await deleteShippingRateAction(county)
      if (!result.success) setDeleteError(result.error)
      setDeletingCounty(null)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex items-end gap-3">
        <div>
          <label htmlFor="county" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            County
          </label>
          <input
            id="county"
            name="county"
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
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {state?.success === false && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
      <p className="-mt-4 text-xs opacity-60">
        &quot;DEFAULT&quot; is the fallback rate used for any county not listed below.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
            <th className="py-2">County</th>
            <th className="py-2">Rate</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <tr key={rate.county} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2">{rate.county}</td>
              <td className="py-2">{formatKes(rate.rateKes)}</td>
              <td className="py-2 text-right">
                {rate.county !== 'DEFAULT' && (
                  <button
                    type="button"
                    disabled={deletingCounty === rate.county}
                    onClick={() => handleDelete(rate.county)}
                    className="text-xs opacity-60 hover:opacity-100 disabled:opacity-30"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
