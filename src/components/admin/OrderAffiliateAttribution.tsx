'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setOrderAffiliateAction } from '@/lib/actions/admin-affiliates'

const inputClass = 'w-full min-w-0 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

/** Credits the order to an affiliate (or removes the credit); commission lines are rebuilt to match. */
export function OrderAffiliateAttribution({
  orderId,
  affiliateId,
  affiliates,
  commissionKes,
}: {
  orderId: string
  affiliateId: string | null
  affiliates: { id: string; name: string; referralCode: string; status: string }[]
  /** Live commission on this order, already formatted. */
  commissionKes: string | null
}) {
  const [selected, setSelected] = useState(affiliateId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await setOrderAffiliateAction({ orderId, affiliateId: selected || null })
      if (result.success) setSaved(true)
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide uppercase opacity-70">Affiliate</span>
        {affiliateId && (
          <Link href={`/admin/affiliates/${affiliateId}`} className="text-xs underline underline-offset-4 opacity-70">
            View
          </Link>
        )}
      </div>
      <select
        value={selected}
        disabled={isPending}
        onChange={(e) => setSelected(e.target.value)}
        className={inputClass}
      >
        <option value="">No affiliate</option>
        {affiliates.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.referralCode}){a.status !== 'ACTIVE' ? ` · ${a.status.toLowerCase()}` : ''}
          </option>
        ))}
      </select>
      {commissionKes && <p className="text-xs opacity-70">Commission on this order: {commissionKes}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || selected === (affiliateId ?? '')}
        className="rounded-full border border-black/10 px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
      >
        {isPending ? 'Saving…' : 'Update attribution'}
      </button>
      {saved && <p className="text-xs text-emerald-700 dark:text-emerald-400">Attribution updated.</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs opacity-60">Commission is only earned on paid orders, for the affiliate&apos;s assigned products.</p>
    </div>
  )
}
